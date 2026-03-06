import { RESULT_RATING_BANDS } from "@/lib/branding";

export const MIN_BENCHMARK_SCORE = 150;
export const MAX_BENCHMARK_SCORE = 50_000;
export type RatingBand = { min: number; label: string };
export type ScoreCurveConfig = {
  anchorScore: number;
  anchorRatio: number;
  exponent: number;
  minScore?: number;
  maxScore?: number;
};

export function roundMetric(value: number, precision = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(precision));
}

export function combineChecksums(values: number[]) {
  return values.reduce((combined, value) => {
    return ((combined ^ (value >>> 0)) >>> 0);
  }, 0);
}

export function weightedGeometricMean(
  values: Array<{ ratio: number; weight: number }>,
) {
  const safeValues = values.filter((entry) => entry.weight > 0);

  if (safeValues.length === 0) {
    return 0;
  }

  const totalWeight = safeValues.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedLogSum = safeValues.reduce((sum, entry) => {
    const ratio = Math.max(entry.ratio, 0.05);
    return sum + Math.log(ratio) * entry.weight;
  }, 0);

  return Math.exp(weightedLogSum / totalWeight);
}

export function scoreFromRatio(ratio: number, curve: ScoreCurveConfig) {
  const safeRatio = Math.max(ratio, 0.05);
  const normalizedRatio = safeRatio / Math.max(curve.anchorRatio, 0.05);
  const rawScore = Math.round(
    curve.anchorScore * Math.pow(normalizedRatio, curve.exponent),
  );

  return Math.min(
    curve.maxScore ?? MAX_BENCHMARK_SCORE,
    Math.max(curve.minScore ?? MIN_BENCHMARK_SCORE, rawScore),
  );
}

export function getRatingForScore(
  score: number,
  bands: readonly RatingBand[] = RESULT_RATING_BANDS,
) {
  const match =
    bands.find((band) => score >= band.min) ??
    bands[bands.length - 1];

  return match.label;
}
