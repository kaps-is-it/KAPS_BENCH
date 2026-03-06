export function detectCpu() {
  return {
    cpuLogicalCores: Math.max(1, navigator.hardwareConcurrency ?? 4),
  };
}
