import type { BenchmarkPreset, CpuKernelId } from "@/lib/types";
import { resolveBenchmarkPreset } from "@/benchmarks/shared/preset";
import type { RatingBand, ScoreCurveConfig } from "@/benchmarks/shared/scoring";

export const CPU_SUITE_LABELS: Record<CpuKernelId, string> = {
  integerBranchHash: "Integer + branch + hash",
  compression: "Compression",
  floatingPoint: "Floating-point + SIMD-style math",
  matrix: "Matrix + linear algebra",
  convolution: "Image convolution",
  memoryStencil: "Memory copy + stencil",
  wasmCompile: "WASM compile + instantiate",
  raymarch: "CPU raymarch",
};

export const CPU_KERNEL_WEIGHTS: Record<CpuKernelId, number> = {
  integerBranchHash: 0.15,
  compression: 0.12,
  floatingPoint: 0.14,
  matrix: 0.16,
  convolution: 0.11,
  memoryStencil: 0.12,
  wasmCompile: 0.08,
  raymarch: 0.12,
};

export const CPU_AGGREGATE_WEIGHTS = {
  singleCore: 0.35,
  multiCore: 0.5,
  sustained: 0.15,
} as const;

export const CPU_SCORE_CURVES = {
  singleCore: {
    anchorScore: 280,
    anchorRatio: 18,
    exponent: 0.74,
  },
  multiCore: {
    anchorScore: 1000,
    anchorRatio: 12,
    exponent: 0.82,
  },
  sustained: {
    anchorScore: 700,
    anchorRatio: 12,
    exponent: 0.82,
  },
  headline: {
    anchorScore: 1000,
    anchorRatio: 12,
    exponent: 0.82,
  },
} satisfies Record<"singleCore" | "multiCore" | "sustained" | "headline", ScoreCurveConfig>;

export const CPU_HEADLINE_RATING_BANDS: readonly RatingBand[] = [
  { min: 1000, label: "Flagship" },
  { min: 820, label: "High-End" },
  { min: 620, label: "Performance" },
  { min: 380, label: "Capable" },
  { min: 0, label: "Entry" },
] as const;

export const CPU_SINGLE_CORE_RATING_BANDS: readonly RatingBand[] = [
  { min: 280, label: "Flagship" },
  { min: 230, label: "High-End" },
  { min: 185, label: "Performance" },
  { min: 150, label: "Capable" },
  { min: 0, label: "Entry" },
] as const;

export const CPU_MULTI_CORE_RATING_BANDS = CPU_HEADLINE_RATING_BANDS;

type CpuPresetConfig = {
  name: "full" | "smoke";
  warmupDurationMs: number;
  singleCoreKernelDurationMs: number;
  multiCoreKernelDurationMs: number;
  sustainedDurationMs: number;
  maxWorkers: number;
  dataScale: {
    integerLength: number;
    compressionLength: number;
    floatingLength: number;
    matrixSize: number;
    imageSize: number;
    memoryWidth: number;
    raymarchResolution: number;
  };
  referenceThroughputs: {
    singleCore: Record<CpuKernelId, number>;
    multiCore: Record<CpuKernelId, number>;
    sustained: number;
  };
  assetPaths: {
    wasmModule: string;
  };
};

const FULL_PRESET: CpuPresetConfig = {
  name: "full",
  warmupDurationMs: 18_000,
  singleCoreKernelDurationMs: 24_000,
  multiCoreKernelDurationMs: 24_000,
  sustainedDurationMs: 300_000,
  maxWorkers: 24,
  dataScale: {
    integerLength: 65_536,
    compressionLength: 52_000,
    floatingLength: 24_000,
    matrixSize: 72,
    imageSize: 96,
    memoryWidth: 224,
    raymarchResolution: 88,
  },
  referenceThroughputs: {
    singleCore: {
      integerBranchHash: 8_100_000,
      compression: 2_750_000,
      floatingPoint: 2_250_000,
      matrix: 420_000,
      convolution: 760_000,
      memoryStencil: 5_200_000,
      wasmCompile: 6_400_000,
      raymarch: 230_000,
    },
    multiCore: {
      integerBranchHash: 61_000_000,
      compression: 21_000_000,
      floatingPoint: 17_500_000,
      matrix: 3_200_000,
      convolution: 5_800_000,
      memoryStencil: 41_000_000,
      wasmCompile: 51_000_000,
      raymarch: 1_850_000,
    },
    sustained: 8_400_000,
  },
  assetPaths: {
    wasmModule: "/benchmarks/coding/benchmark-module.wasm",
  },
};

const SMOKE_PRESET: CpuPresetConfig = {
  ...FULL_PRESET,
  name: "smoke",
  warmupDurationMs: 300,
  singleCoreKernelDurationMs: 220,
  multiCoreKernelDurationMs: 220,
  sustainedDurationMs: 900,
  maxWorkers: 8,
  dataScale: {
    integerLength: 12_288,
    compressionLength: 9_216,
    floatingLength: 4_096,
    matrixSize: 36,
    imageSize: 36,
    memoryWidth: 72,
    raymarchResolution: 32,
  },
};

export function getCpuPreset(preset?: BenchmarkPreset) {
  return resolveBenchmarkPreset(preset) === "smoke" ? SMOKE_PRESET : FULL_PRESET;
}
