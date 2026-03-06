import { CODING_TEST_WEIGHTS } from "@/benchmarks/coding/config";
import type { CodingSubScore } from "@/lib/types";

export function normalizeDuration(durationMs: number, referenceMs: number) {
  const normalized = (referenceMs / durationMs) * 100;

  return Number(Math.max(1, Math.min(100, normalized)).toFixed(1));
}

export function calculateCodingScore(
  subScores: Record<string, CodingSubScore>,
) {
  const weightedScore = Object.entries(CODING_TEST_WEIGHTS).reduce(
    (total, [key, weight]) => total + subScores[key].normalizedScore * weight,
    0,
  );

  const codingScore = Math.round(weightedScore);

  let rating = "Basic";

  if (codingScore >= 75) {
    rating = "Build Machine";
  } else if (codingScore >= 60) {
    rating = "Dev Workstation Ready";
  } else if (codingScore >= 45) {
    rating = "IDE Friendly";
  }

  return {
    codingScore,
    rating,
  };
}
