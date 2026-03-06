export function detectMemory() {
  const memoryNavigator = navigator as Navigator & {
    deviceMemory?: number;
  };

  return {
    deviceMemoryGb: memoryNavigator.deviceMemory,
  };
}
