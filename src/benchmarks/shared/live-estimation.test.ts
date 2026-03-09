import {
  applyGpuCalibrationCompensation,
  buildLiveProjectionViewModel,
  calculateCpuProjectedHeadlineScore,
  calculateGpuProjectedHeadlineScore,
  calculateGpuProjectedOverallScore,
  shouldRefreshProjectionDisplay,
} from "@/benchmarks/shared/live-estimation";
import type { BenchmarkTelemetry } from "@/benchmarks/shared/progress";

function createTelemetry(
  overrides: Partial<BenchmarkTelemetry>,
): BenchmarkTelemetry {
  return {
    title: "Live telemetry",
    summary: "Active benchmark run.",
    liveScores: [],
    metrics: [],
    activity: [],
    projection: {
      projectedScore: null,
    },
    ...overrides,
  };
}

describe("live benchmark estimation", () => {
  it("waits for multi-core data before projecting a full CPU headline score", () => {
    const projectedScore = calculateCpuProjectedHeadlineScore({
      runMode: "full",
      singleCoreRatio: 250,
      multiCoreRatio: null,
      sustainedRatio: null,
    });

    expect(projectedScore).toBeNull();
  });

  it("projects a conservative full CPU headline score once multi-core data is present", () => {
    const projectedScore = calculateCpuProjectedHeadlineScore({
      runMode: "full",
      singleCoreRatio: 250,
      multiCoreRatio: 220,
      sustainedRatio: null,
      multiCoreCoverage: 0.35,
    });

    expect(projectedScore).not.toBeNull();
    expect(projectedScore!).toBeGreaterThanOrEqual(800);
    expect(projectedScore!).toBeLessThanOrEqual(1150);
  });

  it("does not let the first sustained sample yank a full CPU projection off-course", () => {
    const earlySustainedProjection = calculateCpuProjectedHeadlineScore({
      runMode: "full",
      singleCoreRatio: 250,
      multiCoreRatio: 320,
      sustainedRatio: 120,
      sustainedCoverage: 0.08,
    });
    const settledSustainedProjection = calculateCpuProjectedHeadlineScore({
      runMode: "full",
      singleCoreRatio: 250,
      multiCoreRatio: 320,
      sustainedRatio: 120,
      sustainedCoverage: 1,
    });

    expect(earlySustainedProjection).not.toBeNull();
    expect(settledSustainedProjection).not.toBeNull();
    expect(earlySustainedProjection!).toBeGreaterThan(settledSustainedProjection!);
    expect(earlySustainedProjection!).toBeGreaterThanOrEqual(1100);
  });

  it("projects a GPU headline score from partial stage ratios", () => {
    const projectedScore = calculateGpuProjectedHeadlineScore({
      graphicsRatio: 200,
      computeRatio: null,
      sustainedRatio: null,
    });

    expect(projectedScore).not.toBeNull();
    expect(projectedScore!).toBeGreaterThanOrEqual(2800);
    expect(projectedScore!).toBeLessThanOrEqual(3100);
  });

  it("projects the GPU overall score from the graphics and compute scores users see", () => {
    const projectedScore = calculateGpuProjectedOverallScore({
      graphicsScore: 788,
      computeScore: 1635,
    });

    expect(projectedScore).toBe(1212);
  });

  it("applies a mild calibration uplift to the tiny GPU probe score", () => {
    expect(applyGpuCalibrationCompensation(1120, "full")).toBe(1200);
    expect(applyGpuCalibrationCompensation(1120, "smoke")).toBe(1175);
  });

  it("raises confidence and tightens the range as the run stabilizes", () => {
    const earlyProjection = buildLiveProjectionViewModel({
      benchmarkKind: "gpu",
      cpuRunMode: "full",
      progress: 18,
      telemetry: createTelemetry({
        liveScores: [
          { id: "graphics", label: "Graphics live", score: 2810, status: "live" },
          { id: "compute", label: "Compute live", score: null, status: "pending" },
          { id: "sustained", label: "Sustained live", score: null, status: "pending" },
        ],
        activity: [
          {
            id: "render",
            label: "Render queue",
            detail: "Active render queue.",
            value: 1,
            normalized: 0.82,
          },
        ],
        projection: {
          projectedScore: 2860,
        },
      }),
      recentProjectedScores: [2750, 2920],
    });
    const lateProjection = buildLiveProjectionViewModel({
      benchmarkKind: "gpu",
      cpuRunMode: "full",
      progress: 92,
      telemetry: createTelemetry({
        liveScores: [
          { id: "graphics", label: "Graphics live", score: 3010, status: "complete" },
          { id: "compute", label: "Compute live", score: 2940, status: "complete" },
          { id: "sustained", label: "Sustained live", score: 2780, status: "live" },
        ],
        activity: [
          {
            id: "mixed",
            label: "Mixed throughput",
            detail: "Stable mixed workload.",
            value: 1,
            normalized: 0.91,
          },
        ],
        projection: {
          projectedScore: 2920,
        },
      }),
      recentProjectedScores: [2890, 2900, 2910, 2915],
    });

    expect(earlyProjection).not.toBeNull();
    expect(lateProjection).not.toBeNull();
    expect(lateProjection!.confidence).toBeGreaterThan(earlyProjection!.confidence);
    expect(lateProjection!.range.high - lateProjection!.range.low).toBeLessThan(
      earlyProjection!.range.high - earlyProjection!.range.low,
    );
  });

  it("throttles small projection changes until enough time has passed", () => {
    const previous = {
      projectedScore: 2920,
      projectedClass: "High-End",
      confidence: 78,
      isSettled: false,
      range: {
        low: 2740,
        high: 3100,
      },
      updatedAt: 1_000,
    };
    const next = {
      projectedScore: 2930,
      projectedClass: "High-End",
      confidence: 80,
      isSettled: false,
      range: {
        low: 2750,
        high: 3110,
      },
    };

    expect(shouldRefreshProjectionDisplay(previous, next, 1_600)).toBe(false);
    expect(shouldRefreshProjectionDisplay(previous, next, 3_600)).toBe(true);
  });

  it("always refreshes when the projection settles into the final completed state", () => {
    const previous = {
      projectedScore: 1010,
      projectedClass: "Performance",
      confidence: 82,
      isSettled: false,
      range: {
        low: 860,
        high: 1180,
      },
      updatedAt: 4_000,
    };
    const next = {
      projectedScore: 1320,
      projectedClass: "Flagship",
      confidence: 88,
      isSettled: true,
      range: {
        low: 1220,
        high: 1420,
      },
    };

    expect(shouldRefreshProjectionDisplay(previous, next, 4_300)).toBe(true);
  });
});
