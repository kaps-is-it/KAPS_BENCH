import {
  calculateGpuAggregateSubScore,
  calculateGpuScore,
} from "@/benchmarks/gpu/scoring";

describe("gpu scoring", () => {
  it("produces a positive gpu score from aggregate ratios", () => {
    const graphics = calculateGpuAggregateSubScore({
      id: "graphics",
      label: "Graphics",
      kernels: [
        {
          id: "rasterScene",
          throughput: 900_000_000,
          referenceThroughput: 900_000_000,
          durationMs: 36_000,
          notes: "reference",
        },
        {
          id: "shadingScene",
          throughput: 1_000_000_000,
          referenceThroughput: 1_000_000_000,
          durationMs: 36_000,
          notes: "reference",
        },
      ],
    });
    const compute = {
      ...graphics,
      id: "compute" as const,
      label: "Compute",
      score: 4700,
    };
    const sustained = {
      ...graphics,
      id: "sustained" as const,
      label: "Sustained",
      score: 4300,
    };

    const result = calculateGpuScore({
      graphics,
      compute,
      sustained,
    });

    expect(graphics.score).toBeGreaterThan(1000);
    expect(result.gpuScore).toBeGreaterThan(1000);
    expect(result.rating.length).toBeGreaterThan(0);
  });
});
