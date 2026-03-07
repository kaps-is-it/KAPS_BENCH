import {
  calculateCpuAggregateSubScore,
  calculateCpuScore,
} from "@/benchmarks/cpu/scoring";

describe("cpu scoring", () => {
  it("keeps single-core materially below the full cpu anchor while preserving the full-score target", () => {
    const singleCore = calculateCpuAggregateSubScore({
      id: "singleCore",
      label: "Single-core",
      kernels: [
        {
          id: "integerBranchHash",
          throughput: 8_100_000 * 12,
          referenceThroughput: 8_100_000,
          durationMs: 24_000,
          workerCount: 1,
          notes: "reference",
        },
        {
          id: "matrix",
          throughput: 420_000 * 12,
          referenceThroughput: 420_000,
          durationMs: 24_000,
          workerCount: 1,
          notes: "reference",
        },
      ],
    });
    const multiCore = calculateCpuAggregateSubScore({
      id: "multiCore",
      label: "Multi-core",
      kernels: [
        {
          id: "integerBranchHash",
          throughput: 61_000_000 * 12,
          referenceThroughput: 61_000_000,
          durationMs: 24_000,
          workerCount: 16,
          notes: "reference",
        },
        {
          id: "matrix",
          throughput: 3_200_000 * 12,
          referenceThroughput: 3_200_000,
          durationMs: 24_000,
          workerCount: 16,
          notes: "reference",
        },
      ],
    });
    const sustained = calculateCpuAggregateSubScore({
      id: "sustained",
      label: "Sustained",
      kernels: [
        {
          id: "mixedBurn",
          throughput: 8_400_000 * 12,
          referenceThroughput: 8_400_000,
          durationMs: 60_000,
          workerCount: 16,
          notes: "reference",
        },
      ],
    });

    const result = calculateCpuScore({
      runMode: "full",
      subScores: {
        singleCore,
        multiCore,
        sustained,
      },
    });

    expect(singleCore.score).toBeGreaterThanOrEqual(180);
    expect(singleCore.score).toBeLessThanOrEqual(260);
    expect(result.cpuScore).toBeGreaterThanOrEqual(950);
    expect(result.cpuScore).toBeLessThanOrEqual(1050);
    expect(result.rating.length).toBeGreaterThan(0);
  });

  it("uses the selected partial cpu mode as the headline score with the partial curve", () => {
    const singleCore = calculateCpuAggregateSubScore({
      id: "singleCore",
      label: "Single-core",
      kernels: [
        {
          id: "integerBranchHash",
          throughput: 8_100_000 * 12,
          referenceThroughput: 8_100_000,
          durationMs: 24_000,
          workerCount: 1,
          notes: "partial",
        },
      ],
    });

    const result = calculateCpuScore({
      runMode: "singleCore",
      subScores: {
        singleCore,
        multiCore: null,
        sustained: null,
      },
    });

    expect(result.cpuScore).toBe(singleCore.score);
    expect(result.cpuScore).toBeGreaterThanOrEqual(150);
    expect(result.cpuScore).toBeLessThan(300);
  });
});
