import {
  MAX_BENCHMARK_SCORE,
  MIN_BENCHMARK_SCORE,
  combineChecksums,
  scoreFromRatio,
} from "@/benchmarks/shared/scoring";

const TEST_CURVE = {
  anchorScore: 1000,
  anchorRatio: 1,
  exponent: 1,
} as const;

describe("benchmark checksum combination", () => {
  it("always returns an unsigned 32-bit checksum", () => {
    const combined = combineChecksums([0xf1234567, 0x9abcdeff, 0x80000000]);

    expect(combined).toBe(((0xf1234567 ^ 0x9abcdeff ^ 0x80000000) >>> 0));
    expect(combined).toBeGreaterThanOrEqual(0);
    expect(combined).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("benchmark score clamping", () => {
  it("caps very large ratios to the API score ceiling", () => {
    expect(
      scoreFromRatio(100, {
        ...TEST_CURVE,
        anchorScore: 100_000,
      }),
    ).toBe(MAX_BENCHMARK_SCORE);
  });

  it("floors very small ratios to the minimum score", () => {
    expect(
      scoreFromRatio(0, {
        ...TEST_CURVE,
        anchorScore: 100,
      }),
    ).toBe(MIN_BENCHMARK_SCORE);
  });

  it("hits the anchor score when the ratio matches the calibration anchor", () => {
    expect(scoreFromRatio(12, {
      anchorScore: 1000,
      anchorRatio: 12,
      exponent: 0.8,
    })).toBe(1000);
  });
});
