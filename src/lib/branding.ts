import type { BenchmarkKind } from "@/lib/types";

export const APP_NAME = "Can I Run This";
export const APP_DESCRIPTION =
  "Can I Run This is a desktop-first browser benchmark for long-form CPU and GPU testing with shareable results.";
export const BENCHMARK_VERSION = "canirunthis-web-v1";

export const BENCHMARK_CARD_CONTENT: Record<
  BenchmarkKind,
  {
    title: string;
    duration: string;
    description: string;
    href: "/benchmark/cpu" | "/benchmark/gpu";
    bullets: string[];
  }
> = {
  cpu: {
    title: "CPU Benchmark",
    duration: "11-13 min",
    description:
      "Single-core, multi-core, and sustained CPU pressure in one uninterrupted browser-native run.",
    href: "/benchmark/cpu",
    bullets: [
      "Integer, compression, matrix, image, memory, WASM, and raymarch kernels",
      "One full run with thermal-pressure scoring",
      "Calibrated to keep current flagship laptops around 5,000 points",
    ],
  },
  gpu: {
    title: "GPU Benchmark",
    duration: "10-12 min",
    description:
      "Long-form graphics, compute, and sustained GPU load built on WebGPU with timestamp-query support when available.",
    href: "/benchmark/gpu",
    bullets: [
      "Raster, shading, instancing, particles, post-processing, and compute stages",
      "High-performance adapter request with unsupported-state fallback",
      "Separate GPU score with graphics, compute, and sustained subscores",
    ],
  },
};

export const RESULT_RATING_BANDS = [
  { min: 5000, label: "Flagship" },
  { min: 4200, label: "High-End" },
  { min: 3000, label: "Performance" },
  { min: 1800, label: "Capable" },
  { min: 0, label: "Entry" },
] as const;
