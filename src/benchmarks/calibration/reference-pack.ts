export const CALIBRATION_REFERENCE_PACK = {
  cpu: {
    targetHeadlineBand: [4200, 5000] as const,
    anchorPercentile: "95th percentile of current premium laptops",
    sampleSegments: [
      "Apple M4 Pro / M4 Max laptops",
      "Intel Core Ultra 9 premium creator laptops",
      "AMD Ryzen AI 9 / HX-class premium laptops",
    ],
  },
  gpu: {
    targetHeadlineBand: [4200, 5000] as const,
    anchorPercentile: "95th percentile of current premium laptop GPUs",
    sampleSegments: [
      "Apple integrated pro/max laptop GPUs",
      "RTX 4070 / 4080 class laptop GPUs",
      "Radeon 890M / creator-class integrated GPUs",
    ],
  },
} as const;
