module.exports = {
  testDir: "./tests/e2e",
  testMatch: "**/*.cjs",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure"
  }
};
