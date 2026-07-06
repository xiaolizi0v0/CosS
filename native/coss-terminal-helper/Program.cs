using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace CosS.TerminalHelper;

internal static class Program
{
    private const int ProcThreadAttributePseudoConsole = 0x00020016;
    private const int StartfUseStdHandles = 0x00000100;
    private const int StartfUseShowWindow = 0x00000001;
    private const short SwHide = 0;
    private const uint ExtendedStartupInfoPresent = 0x00080000;
    private const uint CreateUnicodeEnvironment = 0x00000400;
    private const uint Infinite = 0xFFFFFFFF;
    private const uint StillActive = 259;

    private static readonly object StdoutLock = new();
    private static IntPtr _pseudoConsole = IntPtr.Zero;
    private static IntPtr _processHandle = IntPtr.Zero;
    private static FileStream? _ptyInputWriter;

    public static int Main(string[] args)
    {
        if (!OperatingSystem.IsWindows())
        {
            WriteEvent(new { type = "error", message = "Windows ConPTY helper can only run on Windows." });
            return 1;
        }

        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;

        try
        {
            var options = ParseOptions(args);
            Run(options);
            return 0;
        }
        catch (Exception error)
        {
            WriteEvent(new { type = "error", message = error.Message, detail = error.ToString() });
            return 1;
        }
        finally
        {
            _ptyInputWriter?.Dispose();
            if (_processHandle != IntPtr.Zero)
            {
                CloseHandle(_processHandle);
                _processHandle = IntPtr.Zero;
            }
            if (_pseudoConsole != IntPtr.Zero)
            {
                ClosePseudoConsole(_pseudoConsole);
                _pseudoConsole = IntPtr.Zero;
            }
        }
    }

    private static void Run(HelperOptions options)
    {
        var size = new Coord
        {
            X = ClampToShort(options.Cols, 20, 240),
            Y = ClampToShort(options.Rows, 6, 80)
        };

        if (!CreatePipe(out var ptyInputRead, out var ptyInputWrite, IntPtr.Zero, 0))
        {
            ThrowLastWin32("CreatePipe(input)");
        }

        if (!CreatePipe(out var ptyOutputRead, out var ptyOutputWrite, IntPtr.Zero, 0))
        {
            CloseHandle(ptyInputRead);
            CloseHandle(ptyInputWrite);
            ThrowLastWin32("CreatePipe(output)");
        }

        var hr = CreatePseudoConsole(size, ptyInputRead, ptyOutputWrite, 0, out _pseudoConsole);
        if (hr != 0)
        {
            CloseHandle(ptyInputRead);
            CloseHandle(ptyOutputWrite);
            throw new Win32Exception(hr, $"CreatePseudoConsole failed with HRESULT 0x{hr:X8}");
        }

        _ptyInputWriter = new FileStream(new SafeFileHandle(ptyInputWrite, ownsHandle: true), FileAccess.Write, 4096, isAsync: false);
        var ptyOutputReader = new FileStream(new SafeFileHandle(ptyOutputRead, ownsHandle: true), FileAccess.Read, 8192, isAsync: false);

        ProcessInformation processInfo;
        try
        {
            processInfo = StartChildProcess(options);
        }
        finally
        {
            CloseHandle(ptyInputRead);
            CloseHandle(ptyOutputWrite);
        }
        _processHandle = processInfo.HProcess;
        CloseHandle(processInfo.HThread);

        WriteEvent(new { type = "ready", pid = processInfo.ProcessId });

        var outputThread = new Thread(() => PumpPtyOutput(ptyOutputReader))
        {
            IsBackground = true,
            Name = "ConPTY output pump"
        };
        outputThread.Start();

        var inputThread = new Thread(ReadControlCommands)
        {
            IsBackground = true,
            Name = "ConPTY control pump"
        };
        inputThread.Start();

        WaitForSingleObject(processInfo.HProcess, Infinite);
        GetExitCodeProcess(processInfo.HProcess, out var exitCode);
        if (exitCode == StillActive)
        {
            exitCode = 0;
        }

        _ptyInputWriter?.Dispose();
        _ptyInputWriter = null;
        if (_pseudoConsole != IntPtr.Zero)
        {
            ClosePseudoConsole(_pseudoConsole);
            _pseudoConsole = IntPtr.Zero;
        }
        outputThread.Join(TimeSpan.FromSeconds(2));

        WriteEvent(new { type = "exit", exitCode });
    }

    private static ProcessInformation StartChildProcess(HelperOptions options)
    {
        var startupInfo = new StartupInfoEx();
        startupInfo.StartupInfo.Cb = Marshal.SizeOf<StartupInfoEx>();
        startupInfo.StartupInfo.Flags = StartfUseStdHandles | StartfUseShowWindow;
        startupInfo.StartupInfo.ShowWindow = SwHide;

        IntPtr attributeListSize = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeListSize);
        startupInfo.AttributeList = Marshal.AllocHGlobal(attributeListSize);
        if (!InitializeProcThreadAttributeList(startupInfo.AttributeList, 1, 0, ref attributeListSize))
        {
            ThrowLastWin32("InitializeProcThreadAttributeList");
        }

        try
        {
            if (!UpdateProcThreadAttribute(
                    startupInfo.AttributeList,
                    0,
                    (IntPtr)ProcThreadAttributePseudoConsole,
                    _pseudoConsole,
                    (IntPtr)IntPtr.Size,
                    IntPtr.Zero,
                    IntPtr.Zero))
            {
                ThrowLastWin32("UpdateProcThreadAttribute(PSEUDOCONSOLE)");
            }

            var commandLine = new StringBuilder(BuildCommandLine(options.Command));
            var flags = ExtendedStartupInfoPresent | CreateUnicodeEnvironment;
            if (!CreateProcessW(
                    null,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    flags,
                    IntPtr.Zero,
                    string.IsNullOrWhiteSpace(options.Cwd) ? null : options.Cwd,
                    ref startupInfo,
                    out var processInfo))
            {
                ThrowLastWin32($"CreateProcess({options.Command[0]})");
            }

            return processInfo;
        }
        finally
        {
            DeleteProcThreadAttributeList(startupInfo.AttributeList);
            Marshal.FreeHGlobal(startupInfo.AttributeList);
        }
    }

    private static void PumpPtyOutput(FileStream ptyOutputReader)
    {
        using (ptyOutputReader)
        {
            var buffer = new byte[8192];
            while (true)
            {
                int read;
                try
                {
                    read = ptyOutputReader.Read(buffer, 0, buffer.Length);
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
                catch (IOException)
                {
                    return;
                }

                if (read <= 0)
                {
                    return;
                }

                var payload = Convert.ToBase64String(buffer, 0, read);
                WriteEvent(new { type = "data", data = payload });
            }
        }
    }

    private static void ReadControlCommands()
    {
        string? line;
        while ((line = Console.In.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            try
            {
                using var document = JsonDocument.Parse(line);
                var root = document.RootElement;
                var type = root.TryGetProperty("type", out var typeElement) ? typeElement.GetString() : "";

                switch (type)
                {
                    case "input":
                        if (root.TryGetProperty("data", out var dataElement))
                        {
                            WriteInput(Convert.FromBase64String(dataElement.GetString() ?? ""));
                        }
                        break;
                    case "resize":
                        var cols = root.TryGetProperty("cols", out var colsElement) ? colsElement.GetInt32() : 80;
                        var rows = root.TryGetProperty("rows", out var rowsElement) ? rowsElement.GetInt32() : 24;
                        Resize(cols, rows);
                        break;
                    case "kill":
                        KillChild();
                        return;
                }
            }
            catch (Exception error)
            {
                WriteEvent(new { type = "error", message = error.Message });
            }
        }
    }

    private static void WriteInput(byte[] bytes)
    {
        var writer = _ptyInputWriter;
        if (writer is null || bytes.Length == 0)
        {
            return;
        }

        lock (writer)
        {
            writer.Write(bytes, 0, bytes.Length);
            writer.Flush();
        }
    }

    private static void Resize(int cols, int rows)
    {
        if (_pseudoConsole == IntPtr.Zero)
        {
            return;
        }

        var size = new Coord
        {
            X = ClampToShort(cols, 20, 240),
            Y = ClampToShort(rows, 6, 80)
        };
        var hr = ResizePseudoConsole(_pseudoConsole, size);
        if (hr != 0)
        {
            WriteEvent(new { type = "error", message = $"ResizePseudoConsole failed with HRESULT 0x{hr:X8}" });
        }
    }

    private static void KillChild()
    {
        if (_processHandle != IntPtr.Zero)
        {
            TerminateProcess(_processHandle, 1);
        }
    }

    private static HelperOptions ParseOptions(string[] args)
    {
        var cols = 80;
        var rows = 24;
        var cwd = "";
        var command = new List<string>();

        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            if (arg == "--")
            {
                command.AddRange(args.Skip(index + 1));
                break;
            }

            if (arg == "--cols" && index + 1 < args.Length)
            {
                cols = int.Parse(args[++index]);
                continue;
            }

            if (arg == "--rows" && index + 1 < args.Length)
            {
                rows = int.Parse(args[++index]);
                continue;
            }

            if (arg == "--cwd" && index + 1 < args.Length)
            {
                cwd = args[++index];
                continue;
            }

            throw new ArgumentException($"Unknown helper argument: {arg}");
        }

        if (command.Count == 0)
        {
            throw new ArgumentException("Missing child command after --.");
        }

        return new HelperOptions(cols, rows, cwd, command);
    }

    private static string BuildCommandLine(IReadOnlyList<string> command)
    {
        return string.Join(" ", command.Select(QuoteCommandLineArgument));
    }

    private static string QuoteCommandLineArgument(string arg)
    {
        if (arg.Length == 0)
        {
            return "\"\"";
        }

        if (!arg.Any(char.IsWhiteSpace) && !arg.Contains('"'))
        {
            return arg;
        }

        var result = new StringBuilder();
        result.Append('"');
        var slashCount = 0;
        foreach (var ch in arg)
        {
            if (ch == '\\')
            {
                slashCount++;
                continue;
            }

            if (ch == '"')
            {
                result.Append('\\', slashCount * 2 + 1);
                result.Append('"');
                slashCount = 0;
                continue;
            }

            result.Append('\\', slashCount);
            slashCount = 0;
            result.Append(ch);
        }

        result.Append('\\', slashCount * 2);
        result.Append('"');
        return result.ToString();
    }

    private static short ClampToShort(int value, int min, int max)
    {
        return (short)Math.Clamp(value, min, max);
    }

    private static void WriteEvent<T>(T payload)
    {
        var json = JsonSerializer.Serialize(payload);
        lock (StdoutLock)
        {
            Console.Out.WriteLine(json);
            Console.Out.Flush();
        }
    }

    private static void ThrowLastWin32(string operation)
    {
        throw new Win32Exception(Marshal.GetLastWin32Error(), operation);
    }

    private sealed record HelperOptions(int Cols, int Rows, string Cwd, IReadOnlyList<string> Command);

    [StructLayout(LayoutKind.Sequential)]
    private struct Coord
    {
        public short X;
        public short Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfo
    {
        public int Cb;
        public IntPtr Reserved;
        public IntPtr Desktop;
        public IntPtr Title;
        public int X;
        public int Y;
        public int XSize;
        public int YSize;
        public int XCountChars;
        public int YCountChars;
        public int FillAttribute;
        public int Flags;
        public short ShowWindow;
        public short Reserved2;
        public IntPtr Reserved2Pointer;
        public IntPtr StdInput;
        public IntPtr StdOutput;
        public IntPtr StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx
    {
        public StartupInfo StartupInfo;
        public IntPtr AttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr HProcess;
        public IntPtr HThread;
        public uint ProcessId;
        public uint ThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, IntPtr lpPipeAttributes, uint nSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int CreatePseudoConsole(Coord size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPC);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int ResizePseudoConsole(IntPtr hPC, Coord size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void ClosePseudoConsole(IntPtr hPC);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(
        IntPtr lpAttributeList,
        int dwAttributeCount,
        int dwFlags,
        ref IntPtr lpSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(
        IntPtr lpAttributeList,
        uint dwFlags,
        IntPtr attribute,
        IntPtr lpValue,
        IntPtr cbSize,
        IntPtr lpPreviousValue,
        IntPtr lpReturnSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(
        string? lpApplicationName,
        StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string? lpCurrentDirectory,
        ref StartupInfoEx lpStartupInfo,
        out ProcessInformation lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);
}
