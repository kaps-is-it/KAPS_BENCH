import {
  MAX_BENCHMARK_SCORE,
  MIN_BENCHMARK_SCORE,
  combineChecksums,
  scoreFromRatio,
} from "@/benchmarks/shared/scoring";

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
    expect(scoreFromRatio(25)).toBe(MAX_BENCHMARK_SCORE);
  });

  it("floors very small ratios to the minimum score", () => {
    expect(scoreFromRatio(0, 100)).toBe(MIN_BENCHMARK_SCORE);
  });
});
