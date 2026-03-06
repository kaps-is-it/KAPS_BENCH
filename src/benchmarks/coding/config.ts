import type { BenchmarkPreset, CodingTestId } from "@/lib/types";

export const CODING_TEST_WEIGHTS: Record<CodingTestId, number> = {
  wasmCompile: 0.3077,
  jsParse: 0.1538,
  singleThread: 0.2308,
  multiThread: 0.3077,
};

const sharedAssetPaths = {
  wasmModule: "/benchmarks/coding/benchmark-module.wasm",
  jsPayload: "/benchmarks/coding/js-payload.js",
};

export const CODING_PRESETS = {
  standard: {
    assetPaths: sharedAssetPaths,
    warmup: {
      elementCount: 24_000,
      passes: 2,
    },
    singleThread: {
      elementCount: 260_000,
      passes: 7,
      seed: 17,
    },
    multiThread: {
      elementCount: 800_000,
      passes: 5,
      seed: 91,
    },
    referenceDurations: {
      wasmCompile: 80,
      jsParse: 68,
      singleThread: 220,
      multiThread: 160,
    },
    maxWorkers: 8,
  },
  full: {
    assetPaths: sharedAssetPaths,
    warmup: {
      elementCount: 24_000,
      passes: 2,
    },
    singleThread: {
      elementCount: 260_000,
      passes: 7,
      seed: 17,
    },
    multiThread: {
      elementCount: 800_000,
      passes: 5,
      seed: 91,
    },
    referenceDurations: {
      wasmCompile: 80,
      jsParse: 68,
      singleThread: 220,
      multiThread: 160,
    },
    maxWorkers: 8,
  },
  smoke: {
    assetPaths: sharedAssetPaths,
    warmup: {
      elementCount: 8_000,
      passes: 1,
    },
    singleThread: {
      elementCount: 32_000,
      passes: 2,
      seed: 17,
    },
    multiThread: {
      elementCount: 90_000,
      passes: 2,
      seed: 91,
    },
    referenceDurations: {
      wasmCompile: 80,
      jsParse: 68,
      singleThread: 220,
      multiThread: 160,
    },
    maxWorkers: 4,
  },
} as const satisfies Record<
  BenchmarkPreset,
  {
    assetPaths: { wasmModule: string; jsPayload: string };
    warmup: { elementCount: number; passes: number };
    singleThread: { elementCount: number; passes: number; seed: number };
    multiThread: { elementCount: number; passes: number; seed: number };
    referenceDurations: Record<CodingTestId, number>;
    maxWorkers: number;
  }
>;

export function getCodingPreset(preset: BenchmarkPreset = "standard") {
  return CODING_PRESETS[preset] ?? CODING_PRESETS.standard;
}
