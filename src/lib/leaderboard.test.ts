import type {
  DeviceProfile,
  PersistedCpuBenchmarkResult,
  PersistedGpuBenchmarkResult,
} from "@/lib/types";
import {
  dedupeLeaderboardResults,
  matchesLeaderboardScope,
  simplifyGpuRenderer,
} from "@/lib/leaderboard";

const baseDeviceProfile: DeviceProfile = {
  gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)",
  gpuVendor: "Apple",
  webgpuSupported: true,
  cpuLogicalCores: 10,
  deviceMemoryGb: 8,
  display: {
    width: 1512,
    height: 982,
    physicalWidth: 3024,
    physicalHeight: 1964,
    devicePixelRatio: 2,
    colorDepth: 24,
  },
  browser: {
    name: "Chrome",
    version: "145.0.0.0",
    os: "macOS",
    osVersion: "15.3",
    userAgent: "test-agent",
  },
  capabilities: {
    webgpu: true,
    webgl2: true,
    webAssembly: true,
    worker: true,
    offscreenCanvas: true,
    audioWorklet: false,
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
  },
  timestamp: Date.now(),
};

function createCpuResult(
  id: string,
  score: number,
  runMode: PersistedCpuBenchmarkResult["cpuRunMode"] = "full",
): PersistedCpuBenchmarkResult {
  return {
    id,
    benchmarkKind: "cpu",
    cpuRunMode: runMode,
    headlineScore: score,
    cpuScore: score,
    rating: "Flagship",
    singleCoreScore: runMode === "multiCore" ? null : Math.round(score * 0.28),
    multiCoreScore: runMode === "singleCore" ? null : score,
    sustainedScore: runMode === "full" ? Math.round(score * 0.72) : null,
    subScores: {
      singleCore: null,
      multiCore: null,
      sustained: null,
    },
    rawMetrics: {
      preset: "full",
      runMode,
      startedAt: Date.now(),
      endedAt: Date.now(),
      totalDurationMs: 1,
      warmupDurationMs: 0,
      singleCoreDurationMs: 0,
      multiCoreDurationMs: 0,
      sustainedDurationMs: 0,
      workerCount: 10,
      checksum: 1,
      wasmBytes: 100,
      visibilityGuardPassed: true,
      crossOriginIsolated: true,
      kernelMetrics: {
        singleCore: null,
        multiCore: null,
        sustained: null,
      },
    },
    benchmarkVersion: "canirunthis-web-v1",
    createdAt: new Date().toISOString(),
    browserName: baseDeviceProfile.browser.name,
    browserVersion: baseDeviceProfile.browser.version,
    osPlatform: baseDeviceProfile.browser.os,
    deviceProfile: baseDeviceProfile,
    user: null,
  };
}

function createGpuResult(id: string, score: number): PersistedGpuBenchmarkResult {
  return {
    id,
    benchmarkKind: "gpu",
    headlineScore: score,
    gpuScore: score,
    rating: "Flagship",
    graphicsScore: Math.round(score * 0.94),
    computeScore: Math.round(score * 0.91),
    sustainedScore: Math.round(score * 0.82),
    subScores: {
      graphics: {
        id: "graphics",
        label: "Graphics",
        score: Math.round(score * 0.94),
        measuredValue: 100,
        referenceValue: 100,
        unit: "% of reference",
        durationMs: 1,
        notes: "graphics",
      },
      compute: {
        id: "compute",
        label: "Compute",
        score: Math.round(score * 0.91),
        measuredValue: 100,
        referenceValue: 100,
        unit: "% of reference",
        durationMs: 1,
        notes: "compute",
      },
      sustained: {
        id: "sustained",
        label: "Sustained",
        score: Math.round(score * 0.82),
        measuredValue: 100,
        referenceValue: 100,
        unit: "% of reference",
        durationMs: 1,
        notes: "sustained",
      },
    },
    rawMetrics: {
      preset: "full",
      startedAt: Date.now(),
      endedAt: Date.now(),
      totalDurationMs: 1,
      warmupDurationMs: 0,
      graphicsDurationMs: 0,
      computeDurationMs: 0,
      sustainedDurationMs: 0,
      checksum: 1,
      visibilityGuardPassed: true,
      timestampQuerySupported: true,
      timestampQueryUsed: true,
      adapterName: "Apple M5",
      adapterInfo: undefined,
      stageMetrics: {
        graphics: {} as PersistedGpuBenchmarkResult["rawMetrics"]["stageMetrics"]["graphics"],
        compute: {} as PersistedGpuBenchmarkResult["rawMetrics"]["stageMetrics"]["compute"],
        sustained: {
          mixedLoad: {
            id: "mixedLoad",
            label: "Mixed load",
            throughput: 100,
            iterations: 1,
            durationMs: 1,
            unit: "work units/s",
            timestampQueryUsed: true,
            notes: "mixed",
          },
        },
      },
    },
    benchmarkVersion: "canirunthis-web-v1",
    createdAt: new Date().toISOString(),
    browserName: baseDeviceProfile.browser.name,
    browserVersion: baseDeviceProfile.browser.version,
    osPlatform: baseDeviceProfile.browser.os,
    deviceProfile: baseDeviceProfile,
    user: null,
  };
}

describe("leaderboard helpers", () => {
  it("extracts a cleaner GPU renderer label", () => {
    expect(
      simplifyGpuRenderer(
        "ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version)",
      ),
    ).toBe("Apple M5");
  });

  it("matches CPU scopes to the correct run modes", () => {
    expect(matchesLeaderboardScope(createCpuResult("full", 1000, "full"), "cpu-full")).toBe(
      true,
    );
    expect(
      matchesLeaderboardScope(
        createCpuResult("single", 280, "singleCore"),
        "cpu-singleCore",
      ),
    ).toBe(true);
    expect(
      matchesLeaderboardScope(
        createCpuResult("multi", 1000, "multiCore"),
        "cpu-multiCore",
      ),
    ).toBe(true);
    expect(matchesLeaderboardScope(createGpuResult("gpu", 3000), "gpu")).toBe(true);
  });

  it("dedupes identical hardware signatures while preserving score order", () => {
    const deduped = dedupeLeaderboardResults(
      [
        createCpuResult("top", 1020, "full"),
        createCpuResult("dup", 980, "full"),
        createCpuResult("other", 940, "singleCore"),
      ],
      "cpu-full",
      5,
    );

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("top");
  });
});
