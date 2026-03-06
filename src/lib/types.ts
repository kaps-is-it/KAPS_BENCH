export type BenchmarkRunState =
  | "idle"
  | "detecting"
  | "ready"
  | "running"
  | "completed"
  | "error";

export type BenchmarkKind = "cpu" | "gpu";
export type PersistedBenchmarkKind = BenchmarkKind | "legacy-coding";
export type BenchmarkPreset = "full" | "smoke" | "standard";
export type CpuRunMode = "full" | "singleCore" | "multiCore";

export type CpuAggregateScoreId = "singleCore" | "multiCore" | "sustained";
export type CpuKernelId =
  | "integerBranchHash"
  | "compression"
  | "floatingPoint"
  | "matrix"
  | "convolution"
  | "memoryStencil"
  | "wasmCompile"
  | "raymarch";

export type GpuAggregateScoreId = "graphics" | "compute" | "sustained";
export type GpuGraphicsKernelId =
  | "rasterScene"
  | "shadingScene"
  | "instancingScene"
  | "particleScene"
  | "postProcessScene";
export type GpuComputeKernelId =
  | "matrixCompute"
  | "convolutionCompute"
  | "simulationCompute";

export type CodingTestId =
  | "wasmCompile"
  | "jsParse"
  | "singleThread"
  | "multiThread";

export interface CapabilityFlags {
  webgpu: boolean;
  webgl2: boolean;
  webAssembly: boolean;
  worker: boolean;
  offscreenCanvas: boolean;
  audioWorklet: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
}

export interface WebGpuAdapterSummary {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

export interface DeviceProfile {
  gpuRenderer: string;
  gpuVendor: string;
  gpuArchitecture?: string;
  gpuDescription?: string;
  webgpuSupported: boolean;
  webgpuInfo?: WebGpuAdapterSummary;
  cpuLogicalCores: number;
  deviceMemoryGb?: number;
  display: {
    width: number;
    height: number;
    physicalWidth: number;
    physicalHeight: number;
    devicePixelRatio: number;
    colorDepth: number;
  };
  browser: {
    name: string;
    version: string;
    os: string;
    osVersion: string;
    userAgent: string;
  };
  capabilities: CapabilityFlags;
  timestamp: number;
}

export interface BenchmarkSubScore {
  id: string;
  label: string;
  score: number;
  measuredValue: number;
  referenceValue: number;
  unit: string;
  durationMs: number;
  workerCount?: number;
  notes: string;
}

export interface CpuKernelMetric {
  id: CpuKernelId;
  label: string;
  throughput: number;
  iterations: number;
  durationMs: number;
  workerCount: number;
  unit: string;
  checksum: number;
  notes: string;
}

export interface GpuKernelMetric {
  id: GpuGraphicsKernelId | GpuComputeKernelId | "mixedLoad";
  label: string;
  throughput: number;
  iterations: number;
  durationMs: number;
  unit: string;
  timestampQueryUsed: boolean;
  notes: string;
}

export interface CpuBenchmarkMetrics {
  preset: BenchmarkPreset;
  runMode: CpuRunMode;
  startedAt: number;
  endedAt: number;
  totalDurationMs: number;
  warmupDurationMs: number;
  singleCoreDurationMs: number;
  multiCoreDurationMs: number;
  sustainedDurationMs: number;
  workerCount: number;
  checksum: number;
  wasmBytes: number;
  visibilityGuardPassed: boolean;
  crossOriginIsolated: boolean;
  kernelMetrics: {
    singleCore: Record<CpuKernelId, CpuKernelMetric> | null;
    multiCore: Record<CpuKernelId, CpuKernelMetric> | null;
    sustained: {
      mixedBurn: CpuKernelMetric;
    } | null;
  };
}

export interface CpuBenchmarkSubScores {
  singleCore: BenchmarkSubScore | null;
  multiCore: BenchmarkSubScore | null;
  sustained: BenchmarkSubScore | null;
}

export interface GpuBenchmarkMetrics {
  preset: BenchmarkPreset;
  startedAt: number;
  endedAt: number;
  totalDurationMs: number;
  warmupDurationMs: number;
  graphicsDurationMs: number;
  computeDurationMs: number;
  sustainedDurationMs: number;
  checksum: number;
  visibilityGuardPassed: boolean;
  timestampQuerySupported: boolean;
  timestampQueryUsed: boolean;
  adapterName: string;
  adapterInfo?: WebGpuAdapterSummary;
  stageMetrics: {
    graphics: Record<GpuGraphicsKernelId, GpuKernelMetric>;
    compute: Record<GpuComputeKernelId, GpuKernelMetric>;
    sustained: {
      mixedLoad: GpuKernelMetric;
    };
  };
}

export interface CpuBenchmarkResult {
  benchmarkKind: "cpu";
  cpuRunMode: CpuRunMode;
  headlineScore: number;
  cpuScore: number;
  rating: string;
  singleCoreScore: number | null;
  multiCoreScore: number | null;
  sustainedScore: number | null;
  subScores: CpuBenchmarkSubScores;
  rawMetrics: CpuBenchmarkMetrics;
  benchmarkVersion: string;
}

export interface GpuBenchmarkResult {
  benchmarkKind: "gpu";
  headlineScore: number;
  gpuScore: number;
  rating: string;
  graphicsScore: number;
  computeScore: number;
  sustainedScore: number;
  subScores: Record<GpuAggregateScoreId, BenchmarkSubScore>;
  rawMetrics: GpuBenchmarkMetrics;
  benchmarkVersion: string;
}

export type ActiveBenchmarkResult = CpuBenchmarkResult | GpuBenchmarkResult;

export interface BenchmarkResultUser {
  id: string;
  email?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

export type CpuBenchmarkSubmissionPayload = {
  benchmarkKind: "cpu";
  deviceProfile: DeviceProfile;
  result: CpuBenchmarkResult;
  benchmarkVersion: string;
};

export type GpuBenchmarkSubmissionPayload = {
  benchmarkKind: "gpu";
  deviceProfile: DeviceProfile;
  result: GpuBenchmarkResult;
  benchmarkVersion: string;
};

export type BenchmarkSubmissionPayload =
  | CpuBenchmarkSubmissionPayload
  | GpuBenchmarkSubmissionPayload;

export interface PersistedBenchmarkResultBase {
  id: string;
  benchmarkKind: PersistedBenchmarkKind;
  headlineScore: number;
  rating: string;
  benchmarkVersion: string;
  createdAt: string;
  browserName: string;
  browserVersion: string;
  osPlatform: string;
  deviceProfile: DeviceProfile;
  user?: BenchmarkResultUser | null;
}

export interface PersistedCpuBenchmarkResult
  extends PersistedBenchmarkResultBase,
    CpuBenchmarkResult {
  benchmarkKind: "cpu";
  user?: BenchmarkResultUser | null;
}

export interface PersistedGpuBenchmarkResult
  extends PersistedBenchmarkResultBase,
    GpuBenchmarkResult {
  benchmarkKind: "gpu";
  user?: BenchmarkResultUser | null;
}

export interface CodingSubScore {
  id: CodingTestId;
  label: string;
  durationMs: number;
  referenceMs: number;
  normalizedScore: number;
  workerCount: number;
  notes: string;
}

export interface CodingBenchmarkMetrics {
  preset: BenchmarkPreset;
  startedAt: number;
  endedAt: number;
  totalDurationMs: number;
  wasmBytes: number;
  jsPayloadBytes: number;
  workerCount: number;
  checksum: number;
  testDurations: Record<CodingTestId, number>;
}

export interface CodingBenchmarkResult {
  codingScore: number;
  rating: string;
  subScores: Record<CodingTestId, CodingSubScore>;
  rawMetrics: CodingBenchmarkMetrics;
  benchmarkVersion: string;
}

export interface LegacyCodingPersistedBenchmarkResult
  extends PersistedBenchmarkResultBase {
  benchmarkKind: "legacy-coding";
  codingScore: number;
  subScores: Record<CodingTestId, CodingSubScore>;
  rawMetrics: CodingBenchmarkMetrics;
}

export type PersistedBenchmarkResult =
  | PersistedCpuBenchmarkResult
  | PersistedGpuBenchmarkResult
  | LegacyCodingPersistedBenchmarkResult;

export type BenchmarkDisplayResult =
  | ActiveBenchmarkResult
  | PersistedBenchmarkResult;
