import {
  calculateCpuAggregateSubScore,
  calculateCpuScore,
} from "@/benchmarks/cpu/scoring";

describe("cpu scoring", () => {
  it("produces a positive aggregate score from throughput ratios", () => {
    const singleCore = calculateCpuAggregateSubScore({
      id: "singleCore",
      label: "Single-core",
      kernels: [
        {
          id: "integerBranchHash",
          throughput: 8_100_000,
          referenceThroughput: 8_100_000,
          durationMs: 24_000,
          workerCount: 1,
          notes: "reference",
        },
        {
          id: "matrix",
          throughput: 420_000,
          referenceThroughput: 420_000,
          durationMs: 24_000,
          workerCount: 1,
          notes: "reference",
        },
      ],
    });
    const multiCore = {
      ...singleCore,
      id: "multiCore" as const,
      label: "Multi-core",
      score: 5200,
    };
    const sustained = {
      ...singleCore,
      id: "sustained" as const,
      label: "Sustained",
      score: 4500,
    };

    const result = calculateCpuScore({
      runMode: "full",
      subScores: {
        singleCore,
        multiCore,
        sustained,
      },
    });

    expect(singleCore.score).toBeGreaterThan(1000);
    expect(result.cpuScore).toBeGreaterThan(1000);
    expect(result.rating.length).toBeGreaterThan(0);
  });

  it("uses the selected partial cpu mode as the headline score", () => {
    const singleCore = calculateCpuAggregateSubScore({
      id: "singleCore",
      label: "Single-core",
      kernels: [
        {
          id: "integerBranchHash",
          throughput: 7_700_000,
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
  });
});
