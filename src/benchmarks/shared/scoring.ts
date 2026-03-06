import { RESULT_RATING_BANDS } from "@/lib/branding";

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

export function scoreFromRatio(ratio: number, anchorScore = 5000) {
  return Math.max(150, Math.round(anchorScore * Math.max(ratio, 0.05)));
}

export function getRatingForScore(score: number) {
  const match =
    RESULT_RATING_BANDS.find((band) => score >= band.min) ??
    RESULT_RATING_BANDS[RESULT_RATING_BANDS.length - 1];

  return match.label;
}
