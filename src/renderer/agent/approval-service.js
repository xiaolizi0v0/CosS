(function exposeApprovalService(global) {
  function createApprovalService({ assess, approve, reject } = {}) {
    return {
      assess(command) { return assess?.(command) || { requiresApproval: false, severity: "low" }; },
      approve(request) { return approve?.(request); },
      reject(request) { return reject?.(request); }
    };
  }
  global.COSS_APPROVAL_SERVICE = Object.freeze({ createApprovalService });
})(window);
