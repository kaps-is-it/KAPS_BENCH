import type {
  BenchmarkSubScore,
  CpuAggregateScoreId,
  CpuBenchmarkSubScores,
  CpuKernelId,
  CpuRunMode,
} from "@/lib/types";
import { CPU_AGGREGATE_WEIGHTS, CPU_KERNEL_WEIGHTS } from "@/benchmarks/cpu/config";
import {
  getRatingForScore,
  roundMetric,
  scoreFromRatio,
  weightedGeometricMean,
} from "@/benchmarks/shared/scoring";

type CpuAggregateInput = {
  id: CpuAggregateScoreId;
  label: string;
  kernels: Array<{
    id: CpuKernelId | "mixedBurn";
    throughput: number;
    referenceThroughput: number;
    durationMs: number;
    workerCount: number;
    notes: string;
  }>;
};

export function calculateCpuAggregateSubScore(
  input: CpuAggregateInput,
): BenchmarkSubScore {
  const ratio = weightedGeometricMean(
    input.kernels.map((kernel) => ({
      ratio: kernel.throughput / kernel.referenceThroughput,
      weight:
        kernel.id === "mixedBurn" ? 1 : CPU_KERNEL_WEIGHTS[kernel.id as CpuKernelId],
    })),
  );
  const score = scoreFromRatio(ratio);
  const durationMs = input.kernels.reduce((sum, kernel) => sum + kernel.durationMs, 0);
  const workerCount = Math.max(...input.kernels.map((kernel) => kernel.workerCount));

  return {
    id: input.id,
    label: input.label,
    score,
    measuredValue: roundMetric(ratio * 100),
    referenceValue: 100,
    unit: "% of reference",
    durationMs: roundMetric(durationMs),
    workerCount,
    notes: input.kernels.map((kernel) => kernel.notes).join(" "),
  };
}

export function calculateCpuScore({
  runMode,
  subScores,
}: {
  runMode: CpuRunMode;
  subScores: CpuBenchmarkSubScores;
}) {
  if (runMode === "singleCore") {
    const singleCore = subScores.singleCore;

    if (!singleCore) {
      throw new Error("Single-core CPU score is missing.");
    }

    return {
      cpuScore: singleCore.score,
      rating: getRatingForScore(singleCore.score),
    };
  }

  if (runMode === "multiCore") {
    const multiCore = subScores.multiCore;

    if (!multiCore) {
      throw new Error("Multi-core CPU score is missing.");
    }

    return {
      cpuScore: multiCore.score,
      rating: getRatingForScore(multiCore.score),
    };
  }

  if (!subScores.singleCore || !subScores.multiCore || !subScores.sustained) {
    throw new Error("Full CPU runs require single-core, multi-core, and sustained scores.");
  }

  const ratio = weightedGeometricMean([
    {
      ratio: subScores.singleCore.score / 5000,
      weight: CPU_AGGREGATE_WEIGHTS.singleCore,
    },
    {
      ratio: subScores.multiCore.score / 5000,
      weight: CPU_AGGREGATE_WEIGHTS.multiCore,
    },
    {
      ratio: subScores.sustained.score / 5000,
      weight: CPU_AGGREGATE_WEIGHTS.sustained,
    },
  ]);

  const cpuScore = scoreFromRatio(ratio);

  return {
    cpuScore,
    rating: getRatingForScore(cpuScore),
  };
}
