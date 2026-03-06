import {
  benchmarkSubmissionSchema,
  isSubmissionPlausible,
} from "@/lib/validation/benchmark";
import {
  createCpuSubmissionPayload,
  createGpuSubmissionPayload,
} from "@/test/fixtures/benchmark-payload";

describe("benchmark validation", () => {
  it("accepts valid cpu and gpu submissions", () => {
    const cpuPayload = createCpuSubmissionPayload();
    const gpuPayload = createGpuSubmissionPayload();
    const cpuParsed = benchmarkSubmissionSchema.safeParse(cpuPayload);
    const gpuParsed = benchmarkSubmissionSchema.safeParse(gpuPayload);

    expect(cpuParsed.success).toBe(true);
    expect(gpuParsed.success).toBe(true);
    expect(isSubmissionPlausible(cpuPayload)).toBe(true);
    expect(isSubmissionPlausible(gpuPayload)).toBe(true);
  });

  it("rejects implausibly short cpu durations", () => {
    const payload = createCpuSubmissionPayload();
    payload.result.rawMetrics.totalDurationMs = 200;

    expect(isSubmissionPlausible(payload)).toBe(false);
  });

  it("accepts single-core-only cpu submissions with omitted multi-core sections", () => {
    const payload = createCpuSubmissionPayload();

    payload.result.cpuRunMode = "singleCore";
    payload.result.headlineScore = payload.result.singleCoreScore ?? 0;
    payload.result.cpuScore = payload.result.singleCoreScore ?? 0;
    payload.result.multiCoreScore = null;
    payload.result.sustainedScore = null;
    payload.result.subScores.multiCore = null;
    payload.result.subScores.sustained = null;
    payload.result.rawMetrics.runMode = "singleCore";
    payload.result.rawMetrics.totalDurationMs = 190_000;
    payload.result.rawMetrics.multiCoreDurationMs = 0;
    payload.result.rawMetrics.sustainedDurationMs = 0;
    payload.result.rawMetrics.workerCount = 1;
    payload.result.rawMetrics.kernelMetrics.multiCore = null;
    payload.result.rawMetrics.kernelMetrics.sustained = null;

    expect(benchmarkSubmissionSchema.safeParse(payload).success).toBe(true);
    expect(isSubmissionPlausible(payload)).toBe(true);
  });
});
