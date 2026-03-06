export function formatApproxMemory(deviceMemoryGb?: number) {
  if (!deviceMemoryGb) {
    return {
      value: "Unavailable",
      detail: "This browser did not expose a memory estimate.",
    };
  }

  if (deviceMemoryGb >= 8) {
    return {
      value: `At least ${deviceMemoryGb} GB`,
      detail: "Browser-reported lower bound. Actual RAM may be higher.",
    };
  }

  return {
    value: `At least ${deviceMemoryGb} GB`,
    detail: "Browser-reported lower bound, rounded for privacy.",
  };
}
