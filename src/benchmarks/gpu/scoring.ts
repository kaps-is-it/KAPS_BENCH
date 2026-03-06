import type {
  BenchmarkSubScore,
  GpuAggregateScoreId,
  GpuComputeKernelId,
  GpuGraphicsKernelId,
} from "@/lib/types";
import {
  GPU_AGGREGATE_WEIGHTS,
  GPU_COMPUTE_WEIGHTS,
  GPU_GRAPHICS_WEIGHTS,
} from "@/benchmarks/gpu/config";
import {
  getRatingForScore,
  roundMetric,
  scoreFromRatio,
  weightedGeometricMean,
} from "@/benchmarks/shared/scoring";

type GpuAggregateInput = {
  id: GpuAggregateScoreId;
  label: string;
  kernels: Array<{
    id: GpuGraphicsKernelId | GpuComputeKernelId | "mixedLoad";
    throughput: number;
    referenceThroughput: number;
    durationMs: number;
    notes: string;
  }>;
};

export function calculateGpuAggregateSubScore(
  input: GpuAggregateInput,
): BenchmarkSubScore {
  const ratio = weightedGeometricMean(
    input.kernels.map((kernel) => ({
      ratio: kernel.throughput / kernel.referenceThroughput,
      weight:
        kernel.id === "mixedLoad"
          ? 1
          : kernel.id in GPU_GRAPHICS_WEIGHTS
            ? GPU_GRAPHICS_WEIGHTS[kernel.id as GpuGraphicsKernelId]
            : GPU_COMPUTE_WEIGHTS[kernel.id as GpuComputeKernelId],
    })),
  );
  const score = scoreFromRatio(ratio);
  const durationMs = input.kernels.reduce((sum, kernel) => sum + kernel.durationMs, 0);

  return {
    id: input.id,
    label: input.label,
    score,
    measuredValue: roundMetric(ratio * 100),
    referenceValue: 100,
    unit: "% of reference",
    durationMs: roundMetric(durationMs),
    notes: input.kernels.map((kernel) => kernel.notes).join(" "),
  };
}

export function calculateGpuScore(subScores: Record<GpuAggregateScoreId, BenchmarkSubScore>) {
  const ratio = weightedGeometricMean([
    {
      ratio: subScores.graphics.score / 5000,
      weight: GPU_AGGREGATE_WEIGHTS.graphics,
    },
    {
      ratio: subScores.compute.score / 5000,
      weight: GPU_AGGREGATE_WEIGHTS.compute,
    },
    {
      ratio: subScores.sustained.score / 5000,
      weight: GPU_AGGREGATE_WEIGHTS.sustained,
    },
  ]);

  const gpuScore = scoreFromRatio(ratio);

  return {
    gpuScore,
    rating: getRatingForScore(gpuScore),
  };
}
