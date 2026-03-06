export const CALIBRATION_REFERENCE_PACK = {
  cpu: {
    targetHeadlineBand: [850, 1100] as const,
    anchorPercentile: "current upper-consumer flagship CPU band",
    sampleSegments: [
      "Intel Core Ultra 9 285K / creator-class desktops",
      "AMD Ryzen 9 9950HX3D / 9950X3D class flagships",
      "Apple M5 Max / M3 Ultra class top-tier Apple silicon",
    ],
  },
  gpu: {
    targetHeadlineBand: [2600, 3200] as const,
    anchorPercentile: "current upper-consumer flagship GPU band",
    sampleSegments: [
      "NVIDIA RTX 5090 class top-end consumer GPUs",
      "Apple top-bin Max / Ultra integrated GPUs",
      "Creator-class desktop and premium mobile GPUs",
    ],
  },
} as const;
