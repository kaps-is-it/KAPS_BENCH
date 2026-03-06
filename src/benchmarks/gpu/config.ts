import type {
  BenchmarkPreset,
  GpuComputeKernelId,
  GpuGraphicsKernelId,
} from "@/lib/types";
import { resolveBenchmarkPreset } from "@/benchmarks/shared/preset";

export const GPU_GRAPHICS_LABELS: Record<GpuGraphicsKernelId, string> = {
  rasterScene: "Raster scene",
  shadingScene: "Fragment shading scene",
  instancingScene: "Instancing scene",
  particleScene: "Particle scene",
  postProcessScene: "Post-process scene",
};

export const GPU_COMPUTE_LABELS: Record<GpuComputeKernelId, string> = {
  matrixCompute: "Matrix compute",
  convolutionCompute: "Convolution compute",
  simulationCompute: "Simulation compute",
};

export const GPU_GRAPHICS_WEIGHTS: Record<GpuGraphicsKernelId, number> = {
  rasterScene: 0.18,
  shadingScene: 0.22,
  instancingScene: 0.18,
  particleScene: 0.2,
  postProcessScene: 0.22,
};

export const GPU_COMPUTE_WEIGHTS: Record<GpuComputeKernelId, number> = {
  matrixCompute: 0.38,
  convolutionCompute: 0.27,
  simulationCompute: 0.35,
};

export const GPU_AGGREGATE_WEIGHTS = {
  graphics: 0.45,
  compute: 0.4,
  sustained: 0.15,
} as const;

type GpuPresetConfig = {
  name: "full" | "smoke";
  warmupDurationMs: number;
  graphicsSceneDurationMs: number;
  computeSceneDurationMs: number;
  sustainedDurationMs: number;
  renderWidth: number;
  renderHeight: number;
  renderBatch: {
    rasterInstances: number;
    instancingInstances: number;
    particleInstances: number;
    shadingLoops: number;
    postProcessLoops: number;
  };
  computeBatch: {
    matrixSize: number;
    convolutionSize: number;
    simulationParticles: number;
  };
  referenceThroughputs: {
    graphics: Record<GpuGraphicsKernelId, number>;
    compute: Record<GpuComputeKernelId, number>;
    sustained: number;
  };
};

const FULL_PRESET: GpuPresetConfig = {
  name: "full",
  warmupDurationMs: 18_000,
  graphicsSceneDurationMs: 36_000,
  computeSceneDurationMs: 45_000,
  sustainedDurationMs: 300_000,
  renderWidth: 1728,
  renderHeight: 1080,
  renderBatch: {
    rasterInstances: 28_000,
    instancingInstances: 52_000,
    particleInstances: 72_000,
    shadingLoops: 128,
    postProcessLoops: 96,
  },
  computeBatch: {
    matrixSize: 256,
    convolutionSize: 768,
    simulationParticles: 131_072,
  },
  referenceThroughputs: {
    graphics: {
      rasterScene: 920_000_000,
      shadingScene: 1_050_000_000,
      instancingScene: 1_180_000_000,
      particleScene: 1_080_000_000,
      postProcessScene: 890_000_000,
    },
    compute: {
      matrixCompute: 7_800_000_000,
      convolutionCompute: 2_150_000_000,
      simulationCompute: 4_200_000_000,
    },
    sustained: 2_400_000_000,
  },
};

const SMOKE_PRESET: GpuPresetConfig = {
  ...FULL_PRESET,
  name: "smoke",
  warmupDurationMs: 250,
  graphicsSceneDurationMs: 220,
  computeSceneDurationMs: 240,
  sustainedDurationMs: 800,
  renderWidth: 640,
  renderHeight: 360,
  renderBatch: {
    rasterInstances: 3_200,
    instancingInstances: 5_200,
    particleInstances: 7_200,
    shadingLoops: 20,
    postProcessLoops: 14,
  },
  computeBatch: {
    matrixSize: 96,
    convolutionSize: 160,
    simulationParticles: 8_192,
  },
};

export function getGpuPreset(preset?: BenchmarkPreset) {
  return resolveBenchmarkPreset(preset) === "smoke" ? SMOKE_PRESET : FULL_PRESET;
}
