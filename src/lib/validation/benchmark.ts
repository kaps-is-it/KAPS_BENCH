import { z } from "zod";

const capabilitySchema = z.object({
  webgpu: z.boolean(),
  webgl2: z.boolean(),
  webAssembly: z.boolean(),
  worker: z.boolean(),
  offscreenCanvas: z.boolean(),
  audioWorklet: z.boolean(),
  sharedArrayBuffer: z.boolean(),
  crossOriginIsolated: z.boolean(),
});

const deviceProfileSchema = z.object({
  gpuRenderer: z.string().min(1).max(256),
  gpuVendor: z.string().min(1).max(128),
  gpuArchitecture: z.string().max(128).optional(),
  gpuDescription: z.string().max(256).optional(),
  webgpuSupported: z.boolean(),
  webgpuInfo: z
    .object({
      vendor: z.string().optional(),
      architecture: z.string().optional(),
      device: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
  cpuLogicalCores: z.number().int().min(1).max(128),
  deviceMemoryGb: z.number().min(0.25).max(256).optional(),
  display: z.object({
    width: z.number().int().min(320).max(10000),
    height: z.number().int().min(320).max(10000),
    physicalWidth: z.number().int().min(320).max(16000),
    physicalHeight: z.number().int().min(320).max(16000),
    devicePixelRatio: z.number().min(0.5).max(8),
    colorDepth: z.number().int().min(1).max(64),
  }),
  browser: z.object({
    name: z.string().min(1).max(128),
    version: z.string().min(1).max(64),
    os: z.string().min(1).max(64),
    osVersion: z.string().min(0).max(64),
    userAgent: z.string().min(1).max(1024),
  }),
  capabilities: capabilitySchema,
  timestamp: z.number().int().positive(),
});

const benchmarkSubScoreSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  score: z.number().int().min(150).max(50000),
  measuredValue: z.number().min(0).max(1000000),
  referenceValue: z.number().min(0.0001).max(1000000),
  unit: z.string().min(1).max(64),
  durationMs: z.number().min(1).max(2_000_000),
  workerCount: z.number().int().min(1).max(128).optional(),
  notes: z.string().min(1).max(512),
});

const cpuKernelMetricSchema = z.object({
  id: z.enum([
    "integerBranchHash",
    "compression",
    "floatingPoint",
    "matrix",
    "convolution",
    "memoryStencil",
    "wasmCompile",
    "raymarch",
  ]),
  label: z.string().min(1).max(64),
  throughput: z.number().min(0.0001).max(1_000_000_000_000),
  iterations: z.number().int().min(1).max(10_000_000),
  durationMs: z.number().min(1).max(2_000_000),
  workerCount: z.number().int().min(1).max(128),
  unit: z.string().min(1).max(64),
  checksum: z.number().int().min(0).max(0xffffffff),
  notes: z.string().min(1).max(512),
});

const gpuKernelMetricSchema = z.object({
  id: z.enum([
    "rasterScene",
    "shadingScene",
    "instancingScene",
    "particleScene",
    "postProcessScene",
    "matrixCompute",
    "convolutionCompute",
    "simulationCompute",
    "mixedLoad",
  ]),
  label: z.string().min(1).max(64),
  throughput: z.number().min(0.0001).max(10_000_000_000_000),
  iterations: z.number().int().min(1).max(10_000_000),
  durationMs: z.number().min(1).max(2_000_000),
  unit: z.string().min(1).max(64),
  timestampQueryUsed: z.boolean(),
  notes: z.string().min(1).max(512),
});

const cpuResultSchema = z.object({
  benchmarkKind: z.literal("cpu"),
  cpuRunMode: z.enum(["full", "singleCore", "multiCore"]),
  headlineScore: z.number().int().min(150).max(50000),
  cpuScore: z.number().int().min(150).max(50000),
  rating: z.string().min(1).max(64),
  singleCoreScore: z.number().int().min(150).max(50000).nullable(),
  multiCoreScore: z.number().int().min(150).max(50000).nullable(),
  sustainedScore: z.number().int().min(150).max(50000).nullable(),
  subScores: z.object({
    singleCore: benchmarkSubScoreSchema.nullable(),
    multiCore: benchmarkSubScoreSchema.nullable(),
    sustained: benchmarkSubScoreSchema.nullable(),
  }),
  rawMetrics: z.object({
    preset: z.enum(["full", "smoke"]),
    runMode: z.enum(["full", "singleCore", "multiCore"]),
    startedAt: z.number().int().positive(),
    endedAt: z.number().int().positive(),
    totalDurationMs: z.number().min(1).max(2_000_000),
    warmupDurationMs: z.number().min(1).max(600_000),
    singleCoreDurationMs: z.number().min(0).max(1_200_000),
    multiCoreDurationMs: z.number().min(0).max(1_200_000),
    sustainedDurationMs: z.number().min(0).max(1_200_000),
    workerCount: z.number().int().min(1).max(128),
    checksum: z.number().int().min(0).max(0xffffffff),
    wasmBytes: z.number().int().min(1).max(50_000_000),
    visibilityGuardPassed: z.literal(true),
    crossOriginIsolated: z.literal(true),
    kernelMetrics: z.object({
      singleCore: z.object({
        integerBranchHash: cpuKernelMetricSchema,
        compression: cpuKernelMetricSchema,
        floatingPoint: cpuKernelMetricSchema,
        matrix: cpuKernelMetricSchema,
        convolution: cpuKernelMetricSchema,
        memoryStencil: cpuKernelMetricSchema,
        wasmCompile: cpuKernelMetricSchema,
        raymarch: cpuKernelMetricSchema,
      }).nullable(),
      multiCore: z.object({
        integerBranchHash: cpuKernelMetricSchema,
        compression: cpuKernelMetricSchema,
        floatingPoint: cpuKernelMetricSchema,
        matrix: cpuKernelMetricSchema,
        convolution: cpuKernelMetricSchema,
        memoryStencil: cpuKernelMetricSchema,
        wasmCompile: cpuKernelMetricSchema,
        raymarch: cpuKernelMetricSchema,
      }).nullable(),
      sustained: z.object({
        mixedBurn: cpuKernelMetricSchema,
      }).nullable(),
    }),
  }),
  benchmarkVersion: z.string().min(1).max(64),
});

const gpuResultSchema = z.object({
  benchmarkKind: z.literal("gpu"),
  headlineScore: z.number().int().min(150).max(50000),
  gpuScore: z.number().int().min(150).max(50000),
  rating: z.string().min(1).max(64),
  graphicsScore: z.number().int().min(150).max(50000),
  computeScore: z.number().int().min(150).max(50000),
  sustainedScore: z.number().int().min(150).max(50000),
  subScores: z.object({
    graphics: benchmarkSubScoreSchema,
    compute: benchmarkSubScoreSchema,
    sustained: benchmarkSubScoreSchema,
  }),
  rawMetrics: z.object({
    preset: z.enum(["full", "smoke"]),
    startedAt: z.number().int().positive(),
    endedAt: z.number().int().positive(),
    totalDurationMs: z.number().min(1).max(2_000_000),
    warmupDurationMs: z.number().min(1).max(600_000),
    graphicsDurationMs: z.number().min(1).max(1_200_000),
    computeDurationMs: z.number().min(1).max(1_200_000),
    sustainedDurationMs: z.number().min(1).max(1_200_000),
    checksum: z.number().int().min(0).max(0xffffffff),
    visibilityGuardPassed: z.literal(true),
    timestampQuerySupported: z.boolean(),
    timestampQueryUsed: z.boolean(),
    adapterName: z.string().min(1).max(256),
    adapterInfo: z
      .object({
        vendor: z.string().optional(),
        architecture: z.string().optional(),
        device: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
    stageMetrics: z.object({
      graphics: z.object({
        rasterScene: gpuKernelMetricSchema,
        shadingScene: gpuKernelMetricSchema,
        instancingScene: gpuKernelMetricSchema,
        particleScene: gpuKernelMetricSchema,
        postProcessScene: gpuKernelMetricSchema,
      }),
      compute: z.object({
        matrixCompute: gpuKernelMetricSchema,
        convolutionCompute: gpuKernelMetricSchema,
        simulationCompute: gpuKernelMetricSchema,
      }),
      sustained: z.object({
        mixedLoad: gpuKernelMetricSchema,
      }),
    }),
  }),
  benchmarkVersion: z.string().min(1).max(64),
});

const cpuSubmissionSchema = z.object({
  benchmarkKind: z.literal("cpu"),
  deviceProfile: deviceProfileSchema,
  result: cpuResultSchema,
  benchmarkVersion: z.string().min(1).max(64),
});

const gpuSubmissionSchema = z.object({
  benchmarkKind: z.literal("gpu"),
  deviceProfile: deviceProfileSchema,
  result: gpuResultSchema,
  benchmarkVersion: z.string().min(1).max(64),
});

export const benchmarkSubmissionSchema = z.discriminatedUnion("benchmarkKind", [
  cpuSubmissionSchema,
  gpuSubmissionSchema,
]);

export function isSubmissionPlausible(
  input: z.infer<typeof benchmarkSubmissionSchema>,
) {
  if (input.benchmarkKind === "cpu") {
    const { rawMetrics, subScores, cpuRunMode } = input.result;
    const durationMs = rawMetrics.totalDurationMs;
    const durationLooksValid =
      rawMetrics.preset === "full"
        ? cpuRunMode === "full"
          ? durationMs >= 480_000 && durationMs <= 1_200_000
          : durationMs >= 120_000 && durationMs <= 900_000
        : durationMs >= 1_000 && durationMs <= 120_000;
    const scoreShapeLooksValid =
      cpuRunMode === "full"
        ? Boolean(subScores.singleCore && subScores.multiCore && subScores.sustained) &&
          input.result.singleCoreScore !== null &&
          input.result.multiCoreScore !== null &&
          input.result.sustainedScore !== null &&
          rawMetrics.singleCoreDurationMs > 0 &&
          rawMetrics.multiCoreDurationMs > 0 &&
          rawMetrics.sustainedDurationMs > 0 &&
          rawMetrics.kernelMetrics.singleCore !== null &&
          rawMetrics.kernelMetrics.multiCore !== null &&
          rawMetrics.kernelMetrics.sustained !== null
        : cpuRunMode === "singleCore"
          ? Boolean(subScores.singleCore) &&
            !subScores.multiCore &&
            !subScores.sustained &&
            input.result.singleCoreScore !== null &&
            input.result.multiCoreScore === null &&
            input.result.sustainedScore === null &&
            rawMetrics.singleCoreDurationMs > 0 &&
            rawMetrics.multiCoreDurationMs === 0 &&
            rawMetrics.sustainedDurationMs === 0 &&
            rawMetrics.kernelMetrics.singleCore !== null &&
            rawMetrics.kernelMetrics.multiCore === null &&
            rawMetrics.kernelMetrics.sustained === null &&
            rawMetrics.workerCount === 1
          : Boolean(subScores.multiCore) &&
            !subScores.singleCore &&
            !subScores.sustained &&
            input.result.singleCoreScore === null &&
            input.result.multiCoreScore !== null &&
            input.result.sustainedScore === null &&
            rawMetrics.singleCoreDurationMs === 0 &&
            rawMetrics.multiCoreDurationMs > 0 &&
            rawMetrics.sustainedDurationMs === 0 &&
            rawMetrics.kernelMetrics.singleCore === null &&
            rawMetrics.kernelMetrics.multiCore !== null &&
            rawMetrics.kernelMetrics.sustained === null;

    return (
      durationLooksValid &&
      rawMetrics.runMode === cpuRunMode &&
      input.deviceProfile.capabilities.worker &&
      input.deviceProfile.capabilities.webAssembly &&
      input.deviceProfile.capabilities.crossOriginIsolated &&
      input.result.rawMetrics.workerCount >= 1 &&
      scoreShapeLooksValid
    );
  }

  const fullRun =
    input.result.rawMetrics.preset === "full" &&
    input.result.rawMetrics.totalDurationMs >= 420_000 &&
    input.result.rawMetrics.totalDurationMs <= 1_200_000;
  const smokeRun =
    input.result.rawMetrics.preset === "smoke" &&
    input.result.rawMetrics.totalDurationMs >= 1_000 &&
    input.result.rawMetrics.totalDurationMs <= 120_000;

  return (
    (fullRun || smokeRun) &&
    input.deviceProfile.capabilities.webgpu &&
    input.result.rawMetrics.graphicsDurationMs > 0 &&
    input.result.rawMetrics.computeDurationMs > 0 &&
    input.result.rawMetrics.sustainedDurationMs > 0
  );
}
