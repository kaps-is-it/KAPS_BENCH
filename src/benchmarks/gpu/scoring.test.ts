import {
  calculateGpuAggregateSubScore,
  calculateGpuScore,
} from "@/benchmarks/gpu/scoring";

describe("gpu scoring", () => {
  it("places a flagship gpu band around the 3000-point anchor", () => {
    const graphics = calculateGpuAggregateSubScore({
      id: "graphics",
      label: "Graphics",
      kernels: [
        {
          id: "rasterScene",
          throughput: 900_000_000 * 10,
          referenceThroughput: 900_000_000,
          durationMs: 36_000,
          notes: "reference",
        },
        {
          id: "shadingScene",
          throughput: 1_000_000_000 * 10,
          referenceThroughput: 1_000_000_000,
          durationMs: 36_000,
          notes: "reference",
        },
      ],
    });
    const compute = calculateGpuAggregateSubScore({
      id: "compute",
      label: "Compute",
      kernels: [
        {
          id: "matrixCompute",
          throughput: 7_800_000_000 * 10,
          referenceThroughput: 7_800_000_000,
          durationMs: 45_000,
          notes: "reference",
        },
        {
          id: "simulationCompute",
          throughput: 4_200_000_000 * 10,
          referenceThroughput: 4_200_000_000,
          durationMs: 45_000,
          notes: "reference",
        },
      ],
    });
    const sustained = calculateGpuAggregateSubScore({
      id: "sustained",
      label: "Sustained",
      kernels: [
        {
          id: "mixedLoad",
          throughput: 2_400_000_000 * 10,
          referenceThroughput: 2_400_000_000,
          durationMs: 90_000,
          notes: "reference",
        },
      ],
    });

    const result = calculateGpuScore({
      graphics,
      compute,
      sustained,
    });

    expect(graphics.score).toBeGreaterThanOrEqual(2850);
    expect(graphics.score).toBeLessThanOrEqual(3150);
    expect(result.gpuScore).toBeGreaterThanOrEqual(2850);
    expect(result.gpuScore).toBeLessThanOrEqual(3150);
    expect(result.rating.length).toBeGreaterThan(0);
  });
});
