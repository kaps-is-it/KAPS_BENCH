import {
  CPU_AGGREGATE_WEIGHTS,
  CPU_HEADLINE_RATING_BANDS,
  CPU_MULTI_CORE_RATING_BANDS,
  CPU_SCORE_CURVES,
  CPU_SINGLE_CORE_RATING_BANDS,
} from "@/benchmarks/cpu/config";
import {
  GPU_AGGREGATE_WEIGHTS,
  GPU_RATING_BANDS,
  GPU_SCORE_CURVE,
} from "@/benchmarks/gpu/config";
import type {
  BenchmarkActivityEntry,
  BenchmarkTelemetry,
} from "@/benchmarks/shared/progress";
import {
  getRatingForScore,
  scoreFromRatio,
  weightedGeometricMean,
} from "@/benchmarks/shared/scoring";
import type { BenchmarkKind, BenchmarkPreset, CpuRunMode } from "@/lib/types";

const MAX_HISTORY_SAMPLES = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function blendRatiosGeometrically(
  baselineRatio: number,
  observedRatio: number,
  trust: number,
) {
  const normalizedTrust = clamp(trust, 0, 1);

  return (
    baselineRatio ** (1 - normalizedTrust) *
    observedRatio ** normalizedTrust
  );
}

function getProjectionRoundingStep(score: number) {
  if (score < 100) {
    return 5;
  }

  if (score < 1_000) {
    return 10;
  }

  if (score < 5_000) {
    return 20;
  }

  if (score < 15_000) {
    return 50;
  }

  return 100;
}

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function getProjectionSamples(
  recentProjectedScores: number[],
  projectedScore: number,
) {
  return [...recentProjectedScores.slice(-(MAX_HISTORY_SAMPLES - 1)), projectedScore]
    .filter((value) => Number.isFinite(value) && value > 0);
}

function getProjectionVolatility(
  recentProjectedScores: number[],
  projectedScore: number,
) {
  const samples = getProjectionSamples(recentProjectedScores, projectedScore);

  if (samples.length < 2) {
    return 0.28;
  }

  const highest = Math.max(...samples);
  const lowest = Math.min(...samples);

  return clamp((highest - lowest) / Math.max(projectedScore, 1), 0.02, 0.35);
}

function getProjectionStability(
  recentProjectedScores: number[],
  projectedScore: number,
) {
  const volatility = getProjectionVolatility(recentProjectedScores, projectedScore);

  return clamp(1 - (volatility - 0.02) / 0.33, 0.2, 1);
}

function getStageConfidence(
  telemetry: BenchmarkTelemetry,
  progress: number,
) {
  if (telemetry.liveScores.length === 0) {
    return 0;
  }

  const allScoresComplete =
    progress >= 96 &&
    telemetry.liveScores.every((entry) => entry.score !== null);

  if (allScoresComplete) {
    return 1;
  }

  return telemetry.liveScores.reduce((sum, entry) => {
    if (entry.status === "complete") {
      return sum + 1;
    }

    if (entry.status === "live" && entry.score !== null) {
      return sum + 0.65;
    }

    if (entry.score !== null) {
      return sum + 0.45;
    }

    return sum;
  }, 0) / telemetry.liveScores.length;
}

function getActivityFactor(
  activity: BenchmarkActivityEntry[],
  progress: number,
  telemetry: BenchmarkTelemetry,
) {
  const allScoresComplete =
    progress >= 96 &&
    telemetry.liveScores.length > 0 &&
    telemetry.liveScores.every((entry) => entry.score !== null);

  if (allScoresComplete) {
    return 1;
  }

  if (activity.length === 0) {
    return 0.35;
  }

  const average =
    activity.reduce((sum, entry) => sum + entry.normalized, 0) / activity.length;

  return clamp(average, 0.25, 1);
}

export function getProjectedClassForScore({
  benchmarkKind,
  cpuRunMode,
  projectedScore,
}: {
  benchmarkKind: BenchmarkKind;
  cpuRunMode: CpuRunMode;
  projectedScore: number;
}) {
  if (benchmarkKind === "gpu") {
    return getRatingForScore(projectedScore, GPU_RATING_BANDS);
  }

  if (cpuRunMode === "singleCore") {
    return getRatingForScore(projectedScore, CPU_SINGLE_CORE_RATING_BANDS);
  }

  if (cpuRunMode === "multiCore") {
    return getRatingForScore(projectedScore, CPU_MULTI_CORE_RATING_BANDS);
  }

  return getRatingForScore(projectedScore, CPU_HEADLINE_RATING_BANDS);
}

export function calculateCpuProjectedHeadlineScore({
  runMode,
  singleCoreRatio,
  multiCoreRatio,
  sustainedRatio,
  multiCoreCoverage = 1,
  sustainedCoverage = 1,
}: {
  runMode: CpuRunMode;
  singleCoreRatio: number | null;
  multiCoreRatio: number | null;
  sustainedRatio: number | null;
  multiCoreCoverage?: number;
  sustainedCoverage?: number;
}) {
  if (runMode === "singleCore") {
    return singleCoreRatio === null
      ? null
      : scoreFromRatio(singleCoreRatio, CPU_SCORE_CURVES.singleCore);
  }

  if (runMode === "multiCore") {
    return multiCoreRatio === null
      ? null
      : scoreFromRatio(multiCoreRatio, CPU_SCORE_CURVES.multiCore);
  }

  if (multiCoreRatio === null) {
    return null;
  }

  const observedRatios = [
    singleCoreRatio,
    multiCoreRatio,
    sustainedRatio,
  ].filter((value): value is number => value !== null);

  if (observedRatios.length === 0) {
    return null;
  }

  const fallbackRatio = weightedGeometricMean(
    observedRatios.map((ratio) => ({
      ratio,
      weight: 1,
    })),
  );
  const normalizedMultiCoreCoverage = clamp(multiCoreCoverage, 0, 1);
  const normalizedSustainedCoverage = clamp(sustainedCoverage, 0, 1);
  const effectiveMultiCoreRatio =
    sustainedRatio === null
      ? multiCoreRatio * (0.74 + normalizedMultiCoreCoverage * 0.26)
      : multiCoreRatio;
  const effectiveSustainedRatio =
    sustainedRatio === null
      ? effectiveMultiCoreRatio *
        (0.78 + normalizedMultiCoreCoverage * 0.08)
      : blendRatiosGeometrically(
        effectiveMultiCoreRatio,
        sustainedRatio,
        0.08 + normalizedSustainedCoverage * 0.92,
      );

  const headlineRatio = weightedGeometricMean([
    {
      ratio: singleCoreRatio ?? fallbackRatio * 0.94,
      weight: CPU_AGGREGATE_WEIGHTS.singleCore,
    },
    {
      ratio: effectiveMultiCoreRatio,
      weight: CPU_AGGREGATE_WEIGHTS.multiCore,
    },
    {
      ratio: effectiveSustainedRatio,
      weight: CPU_AGGREGATE_WEIGHTS.sustained,
    },
  ]);

  return scoreFromRatio(headlineRatio, CPU_SCORE_CURVES.headline);
}

export function calculateGpuProjectedHeadlineScore({
  graphicsRatio,
  computeRatio,
  sustainedRatio,
}: {
  graphicsRatio: number | null;
  computeRatio: number | null;
  sustainedRatio: number | null;
}) {
  const observedRatios = [
    graphicsRatio,
    computeRatio,
    sustainedRatio,
  ].filter((value): value is number => value !== null);

  if (observedRatios.length === 0) {
    return null;
  }

  const fallbackRatio = weightedGeometricMean(
    observedRatios.map((ratio) => ({
      ratio,
      weight: 1,
    })),
  );

  const headlineRatio = weightedGeometricMean([
    {
      ratio: graphicsRatio ?? fallbackRatio,
      weight: GPU_AGGREGATE_WEIGHTS.graphics,
    },
    {
      ratio: computeRatio ?? fallbackRatio,
      weight: GPU_AGGREGATE_WEIGHTS.compute,
    },
    {
      ratio: sustainedRatio ?? fallbackRatio * 0.94,
      weight: GPU_AGGREGATE_WEIGHTS.sustained,
    },
  ]);

  return scoreFromRatio(headlineRatio, GPU_SCORE_CURVE);
}

export function calculateGpuProjectedOverallScore({
  graphicsScore,
  computeScore,
}: {
  graphicsScore: number | null;
  computeScore: number | null;
}) {
  const values = [graphicsScore, computeScore].filter(
    (value): value is number => value !== null,
  );

  if (values.length === 0) {
    return null;
  }

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

export function applyGpuCalibrationCompensation(
  projectedScore: number,
  preset: BenchmarkPreset,
) {
  const multiplier = preset === "smoke" ? 1.05 : 1.07;

  return Math.round((projectedScore * multiplier) / 5) * 5;
}

export type LiveProjectionViewModel = {
  projectedScore: number;
  projectedClass: string;
  confidence: number;
  isSettled: boolean;
  range: {
    low: number;
    high: number;
  };
};

export type TimedLiveProjectionViewModel = LiveProjectionViewModel & {
  updatedAt: number;
};

export function buildLiveProjectionViewModel({
  benchmarkKind,
  cpuRunMode,
  progress,
  telemetry,
  recentProjectedScores,
}: {
  benchmarkKind: BenchmarkKind;
  cpuRunMode: CpuRunMode;
  progress: number;
  telemetry: BenchmarkTelemetry;
  recentProjectedScores: number[];
}): LiveProjectionViewModel | null {
  const projectedScore = telemetry.projection?.projectedScore ?? null;

  if (projectedScore === null) {
    return null;
  }

  const isSettled =
    progress >= 96 &&
    telemetry.liveScores.length > 0 &&
    telemetry.liveScores.every((entry) => entry.score !== null);

  const stageConfidence = getStageConfidence(telemetry, progress);
  const activityFactor = getActivityFactor(telemetry.activity, progress, telemetry);
  const stability = getProjectionStability(recentProjectedScores, projectedScore);
  const confidence = Math.round(clamp(
    14 +
      clamp(progress / 100, 0, 1) * 36 +
      stageConfidence * 26 +
      stability * 18 +
      activityFactor * 6,
    18,
    96,
  ));
  const volatility = getProjectionVolatility(recentProjectedScores, projectedScore);
  const uncertaintyRatio = clamp(
    0.05 + ((100 - confidence) / 100) * 0.22 + volatility * 0.28,
    0.06,
    0.28,
  );
  const roundingStep = getProjectionRoundingStep(projectedScore);
  const low = Math.max(
    roundingStep,
    roundToStep(projectedScore * (1 - uncertaintyRatio), roundingStep),
  );
  const high = Math.max(
    low + roundingStep,
    roundToStep(projectedScore * (1 + uncertaintyRatio), roundingStep),
  );

  return {
    projectedScore,
    projectedClass: getProjectedClassForScore({
      benchmarkKind,
      cpuRunMode,
      projectedScore,
    }),
    confidence,
    isSettled,
    range: {
      low: Math.min(low, projectedScore),
      high: Math.max(high, projectedScore),
    },
  };
}

export function shouldRefreshProjectionDisplay(
  previous: TimedLiveProjectionViewModel | null,
  next: LiveProjectionViewModel,
  now: number,
) {
  if (!previous) {
    return true;
  }

  if (next.projectedClass !== previous.projectedClass) {
    return true;
  }

  if (next.isSettled && !previous.isSettled) {
    return true;
  }

  const elapsedMs = now - previous.updatedAt;
  const roundingStep = getProjectionRoundingStep(next.projectedScore);
  const scoreDelta = Math.abs(next.projectedScore - previous.projectedScore);
  const confidenceDelta = Math.abs(next.confidence - previous.confidence);
  const rangeDelta = Math.max(
    Math.abs(next.range.low - previous.range.low),
    Math.abs(next.range.high - previous.range.high),
  );

  if (elapsedMs >= 2_400) {
    return true;
  }

  if (
    elapsedMs >= 1_400 &&
    (scoreDelta >= roundingStep * 2 ||
      confidenceDelta >= 6 ||
      rangeDelta >= roundingStep * 2)
  ) {
    return true;
  }

  if (
    elapsedMs >= 700 &&
    next.confidence >= 90 &&
    (scoreDelta >= roundingStep || confidenceDelta >= 4 || rangeDelta >= roundingStep)
  ) {
    return true;
  }

  if (elapsedMs >= 900 && confidenceDelta >= 10) {
    return true;
  }

  return false;
}
