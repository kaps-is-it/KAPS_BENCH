import { BENCHMARK_VERSION } from "@/lib/branding";
import { CPU_SUITE_LABELS, getCpuPreset } from "@/benchmarks/cpu/config";
import {
  calculateCpuAggregateSubScore,
  calculateCpuScore,
} from "@/benchmarks/cpu/scoring";
import type {
  BenchmarkActivityEntry,
  BenchmarkLiveScore,
  BenchmarkProgressUpdate,
  BenchmarkTelemetryMetric,
} from "@/benchmarks/shared/progress";
import { resolveBenchmarkPreset } from "@/benchmarks/shared/preset";
import { combineChecksums, roundMetric } from "@/benchmarks/shared/scoring";
import type {
  BenchmarkPreset,
  CpuBenchmarkResult,
  CpuBenchmarkSubScores,
  CpuKernelId,
  CpuKernelMetric,
  CpuRunMode,
} from "@/lib/types";

type CpuWorkerRequest = {
  type: "run-kernel";
  kernel: CpuKernelId;
  durationMs: number;
  workerIndex: number;
  seed: number;
  sizes: {
    integerLength: number;
    compressionLength: number;
    floatingLength: number;
    matrixSize: number;
    imageSize: number;
    memoryWidth: number;
    raymarchResolution: number;
  };
  wasmModule?: ArrayBuffer;
  cancelBuffer?: SharedArrayBuffer;
};

type CpuWorkerResponse = {
  type: "run-kernel";
  kernel: CpuKernelId;
  label: string;
  throughput: number;
  iterations: number;
  durationMs: number;
  checksum: number;
  unit: string;
  notes: string;
  error?: string;
};

type CpuWorkerProgress = {
  type: "progress";
  kernel: CpuKernelId;
  label: string;
  workerIndex: number;
  throughput: number;
  iterations: number;
  durationMs: number;
  checksum: number;
  unit: string;
  notes: string;
};

type CpuWorkerMessage = CpuWorkerResponse | CpuWorkerProgress;

type CpuWorkerClient = {
  runTask: (message: CpuWorkerRequest) => Promise<CpuWorkerResponse>;
  dispose: () => void;
};

const CPU_KERNEL_ORDER = Object.keys(CPU_SUITE_LABELS) as CpuKernelId[];
const CPU_SUSTAINED_MIX: CpuKernelId[] = [
  "integerBranchHash",
  "floatingPoint",
  "matrix",
  "memoryStencil",
  "compression",
  "raymarch",
];

function createCancelBuffer() {
  const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const view = new Int32Array(buffer);

  return {
    buffer,
    view,
    cancel() {
      Atomics.store(view, 0, 1);
    },
    isCancelled() {
      return Atomics.load(view, 0) === 1;
    },
  };
}

function createVisibilityGuard(cancel: () => void) {
  let hidden = false;

  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      hidden = true;
      cancel();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    assertVisible() {
      if (hidden || document.visibilityState !== "visible") {
        throw new Error(
          "The benchmark was aborted because the tab became hidden. Keep this tab visible for the full run.",
        );
      }
    },
    passed() {
      return !hidden && document.visibilityState === "visible";
    },
    cleanup() {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}

async function fetchArrayBuffer(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load benchmark asset: ${path}`);
  }

  return response.arrayBuffer();
}

function createCpuWorkerClient(
  onProgress?: (progress: CpuWorkerProgress) => void,
): CpuWorkerClient {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  let pending:
    | {
        resolve: (value: CpuWorkerResponse) => void;
        reject: (reason?: unknown) => void;
      }
    | null = null;

  worker.onmessage = (event: MessageEvent<CpuWorkerMessage>) => {
    if (event.data.type === "progress") {
      onProgress?.(event.data);
      return;
    }

    const activeTask = pending;
    pending = null;

    if (!activeTask) {
      return;
    }

    if (event.data.error) {
      activeTask.reject(new Error(event.data.error));
      return;
    }

    activeTask.resolve(event.data);
  };

  worker.onerror = (event) => {
    const activeTask = pending;
    pending = null;

    if (activeTask) {
      activeTask.reject(event.error ?? new Error("CPU benchmark worker crashed."));
    }
  };

  return {
    runTask(message) {
      if (pending) {
        return Promise.reject(
          new Error("CPU benchmark worker received overlapping work."),
        );
      }

      return new Promise<CpuWorkerResponse>((resolve, reject) => {
        pending = { resolve, reject };
        worker.postMessage(message);
      });
    },
    dispose() {
      const activeTask = pending;
      pending = null;

      if (activeTask) {
        activeTask.reject(
          new Error("CPU benchmark worker was terminated before completion."),
        );
      }

      worker.terminate();
    },
  };
}

function createCpuWorkerPool(
  workerCount: number,
  onProgress?: (progress: CpuWorkerProgress) => void,
) {
  return Array.from({ length: workerCount }, () => createCpuWorkerClient(onProgress));
}

function kernelMetricFromResponse(response: CpuWorkerResponse): CpuKernelMetric {
  return {
    id: response.kernel,
    label: response.label,
    throughput: roundMetric(response.throughput),
    iterations: response.iterations,
    durationMs: roundMetric(response.durationMs),
    workerCount: 1,
    unit: response.unit,
    checksum: response.checksum,
    notes: response.notes,
  };
}

function summarizeConcurrentKernel(
  kernel: CpuKernelId,
  responses: CpuWorkerResponse[],
  durationMs: number,
  workerCount: number,
): CpuKernelMetric {
  const throughput = responses.reduce((sum, response) => sum + response.throughput, 0);
  const iterations = responses.reduce((sum, response) => sum + response.iterations, 0);
  const checksum = responses.reduce((sum, response) => (sum + response.checksum) >>> 0, 0);

  return {
    id: kernel,
    label: CPU_SUITE_LABELS[kernel],
    throughput: roundMetric(throughput),
    iterations,
    durationMs: roundMetric(durationMs),
    workerCount,
    unit: "work units/s",
    checksum,
    notes: `${workerCount} workers completed ${iterations.toLocaleString()} deterministic iterations.`,
  };
}

function formatThroughput(value: number) {
  const absolute = Math.max(0, value);

  if (absolute >= 1_000_000_000) {
    return `${roundMetric(absolute / 1_000_000_000)}B units/s`;
  }

  if (absolute >= 1_000_000) {
    return `${roundMetric(absolute / 1_000_000)}M units/s`;
  }

  if (absolute >= 1_000) {
    return `${roundMetric(absolute / 1_000)}K units/s`;
  }

  return `${roundMetric(absolute)} units/s`;
}

function formatCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function estimateCpuAggregateScore(
  id: "singleCore" | "multiCore",
  label: string,
  metrics: Partial<Record<CpuKernelId, CpuKernelMetric>>,
  referenceThroughputs: Record<CpuKernelId, number>,
  defaultWorkerCount: number,
) {
  const measuredKernelCount = CPU_KERNEL_ORDER.filter((kernel) => Boolean(metrics[kernel])).length;

  if (measuredKernelCount === 0) {
    return null;
  }

  const kernels = CPU_KERNEL_ORDER.map((kernel) => {
    const metric = metrics[kernel];

    if (metric) {
      return {
        id: kernel,
        throughput: metric.throughput,
        referenceThroughput: referenceThroughputs[kernel],
        durationMs: metric.durationMs,
        workerCount: metric.workerCount,
        notes: metric.notes,
      };
    }

    return {
      id: kernel,
      throughput: referenceThroughputs[kernel],
      referenceThroughput: referenceThroughputs[kernel],
      durationMs: 0,
      workerCount: defaultWorkerCount,
      notes: "Pending kernel projected at the reference baseline until measured.",
    };
  });

  return calculateCpuAggregateSubScore({
    id,
    label,
    kernels,
  }).score;
}

function estimateCpuSustainedScore(
  metric: CpuKernelMetric | null,
  referenceThroughput: number,
) {
  if (!metric) {
    return null;
  }

  return calculateCpuAggregateSubScore({
    id: "sustained",
    label: "Sustained",
    kernels: [
      {
        id: "mixedBurn",
        throughput: metric.throughput,
        referenceThroughput,
        durationMs: metric.durationMs,
        workerCount: metric.workerCount,
        notes: metric.notes,
      },
    ],
  }).score;
}

function buildCpuLiveScores({
  runMode,
  activeStage,
  singleCoreScore,
  multiCoreScore,
  sustainedScore,
}: {
  runMode: CpuRunMode;
  activeStage: "warmup" | "singleCore" | "multiCore" | "sustained" | "persisting";
  singleCoreScore: number | null;
  multiCoreScore: number | null;
  sustainedScore: number | null;
}): BenchmarkLiveScore[] {
  if (runMode === "singleCore") {
    return [
      {
        id: "singleCore",
        label: "Single-core live",
        score: singleCoreScore,
        status:
          activeStage === "singleCore"
            ? "live"
            : singleCoreScore !== null
              ? "complete"
              : "pending",
      },
    ];
  }

  if (runMode === "multiCore") {
    return [
      {
        id: "multiCore",
        label: "Multi-core live",
        score: multiCoreScore,
        status:
          activeStage === "multiCore"
            ? "live"
            : multiCoreScore !== null
              ? "complete"
              : "pending",
      },
    ];
  }

  return [
    {
      id: "singleCore",
      label: "Single-core live",
      score: singleCoreScore,
      status:
        activeStage === "singleCore"
          ? "live"
          : singleCoreScore !== null
            ? "complete"
            : "pending",
    },
    {
      id: "multiCore",
      label: "Multi-core live",
      score: multiCoreScore,
      status:
        activeStage === "multiCore"
          ? "live"
          : multiCoreScore !== null
            ? "complete"
            : "pending",
    },
    {
      id: "sustained",
      label: "Sustained live",
      score: sustainedScore,
      status:
        activeStage === "sustained"
          ? "live"
          : sustainedScore !== null
            ? "complete"
            : "pending",
    },
  ];
}

function buildCpuActivityEntries(snapshots: CpuWorkerProgress[]): BenchmarkActivityEntry[] {
  const visibleSnapshots = snapshots.slice(0, 12);
  const peakThroughput = Math.max(
    1,
    ...visibleSnapshots.map((snapshot) => snapshot.throughput),
  );

  return visibleSnapshots.map((snapshot) => ({
    id: `worker-${snapshot.workerIndex}`,
    label: `Worker ${snapshot.workerIndex + 1}`,
    detail: `${formatThroughput(snapshot.throughput)} • ${formatCount(snapshot.iterations)} iterations`,
    value: snapshot.throughput,
    normalized: Math.max(0.08, snapshot.throughput / peakThroughput),
  }));
}

export async function runCpuBenchmark({
  preset = "full",
  onProgress,
  mock = false,
  runMode = "full",
}: {
  preset?: BenchmarkPreset;
  onProgress?: (update: BenchmarkProgressUpdate) => void;
  mock?: boolean;
  runMode?: CpuRunMode;
}): Promise<CpuBenchmarkResult> {
  const resolvedPreset = resolveBenchmarkPreset(preset);
  const config = getCpuPreset(resolvedPreset);

  if (mock) {
    onProgress?.({
      label: "CPU smoke mock",
      message: "Using the internal mock CPU benchmark path for automated verification.",
      step: 1,
      totalSteps: 1,
      progress: 100,
    });

    return createMockCpuResult(config, runMode);
  }

  if (
    typeof window === "undefined" ||
    typeof Worker === "undefined" ||
    typeof WebAssembly === "undefined" ||
    !window.crossOriginIsolated
  ) {
    throw new Error(
      "The CPU benchmark requires WebAssembly, Web Workers, and cross-origin isolation.",
    );
  }

  const startedAt = Date.now();
  const totalSteps =
    1 +
    (runMode !== "multiCore" ? CPU_KERNEL_ORDER.length : 0) +
    (runMode !== "singleCore" ? CPU_KERNEL_ORDER.length : 0) +
    (runMode === "full" ? 1 : 0);
  const maxWorkerCount = Math.max(
    1,
    Math.min(config.maxWorkers, navigator.hardwareConcurrency || 4),
  );
  const workerCount = runMode === "singleCore" ? 1 : maxWorkerCount;
  const wasmBytes = await fetchArrayBuffer(config.assetPaths.wasmModule);
  const cancelSignal = createCancelBuffer();
  const visibilityGuard = createVisibilityGuard(() => cancelSignal.cancel());
  let singleCoreMetrics: Record<CpuKernelId, CpuKernelMetric> | null = null;
  let multiCoreMetrics: Record<CpuKernelId, CpuKernelMetric> | null = null;
  let sustainedMetric: CpuKernelMetric | null = null;
  const startedAtPerf = performance.now();
  let activeStage: "warmup" | "singleCore" | "multiCore" | "sustained" | "persisting" =
    "warmup";
  let activeKernel: CpuKernelId | "mixedBurn" | null = null;
  let activeLabel = "Warmup";
  let activeMessage =
    runMode === "full"
      ? `Priming ${workerCount} workers, WASM, and memory pages for the full CPU run.`
      : `Priming ${workerCount} worker${workerCount > 1 ? "s" : ""} for the selected CPU run.`;
  let activeStep = 1;
  let activeProgress = 5;
  const liveWorkerSnapshots = new Map<number, CpuWorkerProgress>();

  const emitLiveCpuTelemetry = () => {
    const snapshots = Array.from(liveWorkerSnapshots.values()).sort(
      (left, right) => left.workerIndex - right.workerIndex,
    );
    const totalThroughput = snapshots.reduce(
      (sum, snapshot) => sum + snapshot.throughput,
      0,
    );
    const totalIterations = snapshots.reduce(
      (sum, snapshot) => sum + snapshot.iterations,
      0,
    );
    const elapsedMs = snapshots.length
      ? Math.max(...snapshots.map((snapshot) => snapshot.durationMs))
      : 0;
    const activeMetric: CpuKernelMetric | null =
      activeStage === "warmup" || !snapshots.length
        ? null
        : activeStage === "singleCore"
          ? {
              id: activeKernel as CpuKernelId,
              label: CPU_SUITE_LABELS[activeKernel as CpuKernelId],
              throughput: roundMetric(totalThroughput),
              iterations: totalIterations,
              durationMs: roundMetric(elapsedMs),
              workerCount: 1,
              unit: "work units/s",
              checksum: snapshots[0]?.checksum ?? 0,
              notes: snapshots[0]?.notes ?? "",
            }
          : {
              id: "memoryStencil",
              label:
                activeStage === "sustained"
                  ? "Mixed sustained CPU load"
                  : CPU_SUITE_LABELS[activeKernel as CpuKernelId],
              throughput: roundMetric(totalThroughput),
              iterations: totalIterations,
              durationMs: roundMetric(elapsedMs),
              workerCount: Math.max(1, snapshots.length),
              unit: "work units/s",
              checksum: combineChecksums(snapshots.map((snapshot) => snapshot.checksum)),
              notes:
                activeStage === "sustained"
                  ? "Round-robin mixed burn across the current worker pool."
                  : `${snapshots.length} workers streaming telemetry for ${CPU_SUITE_LABELS[activeKernel as CpuKernelId].toLowerCase()}.`,
            };
    const liveSingleCoreScore = estimateCpuAggregateScore(
      "singleCore",
      "Single-core",
      activeStage === "singleCore" && activeMetric
        ? {
            ...(singleCoreMetrics ?? {}),
            [activeKernel as CpuKernelId]: activeMetric,
          }
        : singleCoreMetrics ?? {},
      config.referenceThroughputs.singleCore,
      1,
    );
    const liveMultiCoreScore = estimateCpuAggregateScore(
      "multiCore",
      "Multi-core",
      activeStage === "multiCore" && activeMetric
        ? {
            ...(multiCoreMetrics ?? {}),
            [activeKernel as CpuKernelId]: activeMetric,
          }
        : multiCoreMetrics ?? {},
      config.referenceThroughputs.multiCore,
      workerCount,
    );
    const liveSustainedScore = estimateCpuSustainedScore(
      activeStage === "sustained" && activeMetric ? activeMetric : sustainedMetric,
      config.referenceThroughputs.sustained,
    );
    const metrics: BenchmarkTelemetryMetric[] = [
      {
        label: "Active kernel",
        value:
          activeStage === "warmup"
            ? "Worker + WASM priming"
            : activeStage === "sustained"
              ? "Mixed sustained burn"
              : activeKernel
                ? CPU_SUITE_LABELS[activeKernel as CpuKernelId]
                : activeLabel,
      },
      {
        label: "Workers",
        value: String(Math.max(snapshots.length, runMode === "singleCore" ? 1 : workerCount)),
      },
      {
        label: "Throughput",
        value: snapshots.length ? formatThroughput(totalThroughput) : "Waiting for telemetry",
      },
      {
        label: "Iterations",
        value: formatCount(totalIterations),
      },
      {
        label: "Elapsed",
        value: `${roundMetric(elapsedMs / 1000, 1)}s`,
      },
    ];

    onProgress?.({
      label: activeLabel,
      message: activeMessage,
      step: activeStep,
      totalSteps,
      progress: activeProgress,
      telemetry: {
        title: activeLabel,
        summary: activeMessage,
        liveScores: buildCpuLiveScores({
          runMode,
          activeStage,
          singleCoreScore: liveSingleCoreScore,
          multiCoreScore: liveMultiCoreScore,
          sustainedScore: liveSustainedScore,
        }),
        metrics,
        activity: buildCpuActivityEntries(snapshots),
      },
    });
  };

  const workerPool = createCpuWorkerPool(workerCount, (snapshot) => {
    liveWorkerSnapshots.set(snapshot.workerIndex, snapshot);
    emitLiveCpuTelemetry();
  });

  const setActiveCpuStage = ({
    stage,
    label,
    message,
    step,
    progress,
    kernel = null,
  }: {
    stage: "warmup" | "singleCore" | "multiCore" | "sustained" | "persisting";
    label: string;
    message: string;
    step: number;
    progress: number;
    kernel?: CpuKernelId | "mixedBurn" | null;
  }) => {
    activeStage = stage;
    activeKernel = kernel;
    activeLabel = label;
    activeMessage = message;
    activeStep = step;
    activeProgress = progress;
    liveWorkerSnapshots.clear();
    emitLiveCpuTelemetry();
  };

  try {
    setActiveCpuStage({
      stage: "warmup",
      label: "Warmup",
      message: activeMessage,
      step: 1,
      progress: 5,
    });

    await Promise.all(
      workerPool.map((worker, workerIndex) =>
        worker.runTask({
          type: "run-kernel",
          kernel: "integerBranchHash",
          durationMs: config.warmupDurationMs,
          workerIndex,
          seed: 71 + workerIndex * 13,
          sizes: config.dataScale,
          cancelBuffer: cancelSignal.buffer,
        }),
      ),
    );
    visibilityGuard.assertVisible();

    let step = 1;
    const primaryWorker = workerPool[0];

    if (runMode !== "multiCore") {
      singleCoreMetrics = {} as Record<CpuKernelId, CpuKernelMetric>;

      for (const kernel of CPU_KERNEL_ORDER) {
        step += 1;

        setActiveCpuStage({
          stage: "singleCore",
          label: `Single-core: ${CPU_SUITE_LABELS[kernel]}`,
          message: "Running the single-core suite on one dedicated worker.",
          step,
          progress: 5 + Math.round((step / totalSteps) * 85),
          kernel,
        });

        const response = await primaryWorker.runTask({
          type: "run-kernel",
          kernel,
          durationMs: config.singleCoreKernelDurationMs,
          workerIndex: 0,
          seed: 1000 + step,
          sizes: config.dataScale,
          wasmModule: kernel === "wasmCompile" ? wasmBytes.slice(0) : undefined,
          cancelBuffer: cancelSignal.buffer,
        });

        visibilityGuard.assertVisible();
        singleCoreMetrics[kernel] = kernelMetricFromResponse(response);
        emitLiveCpuTelemetry();
      }
    }

    if (runMode !== "singleCore") {
      multiCoreMetrics = {} as Record<CpuKernelId, CpuKernelMetric>;

      for (const kernel of CPU_KERNEL_ORDER) {
        step += 1;

        setActiveCpuStage({
          stage: "multiCore",
          label: `Multi-core: ${CPU_SUITE_LABELS[kernel]}`,
          message: `Scaling ${CPU_SUITE_LABELS[kernel].toLowerCase()} across ${workerCount} workers.`,
          step,
          progress: 5 + Math.round((step / totalSteps) * 85),
          kernel,
        });

        const stageStartedAt = performance.now();
        const responses = await Promise.all(
          workerPool.map((worker, workerIndex) =>
            worker.runTask({
              type: "run-kernel",
              kernel,
              durationMs: config.multiCoreKernelDurationMs,
              workerIndex,
              seed: 2000 + workerIndex * 17 + step,
              sizes: config.dataScale,
              wasmModule: kernel === "wasmCompile" ? wasmBytes.slice(0) : undefined,
              cancelBuffer: cancelSignal.buffer,
            }),
          ),
        );

        visibilityGuard.assertVisible();
        multiCoreMetrics[kernel] = summarizeConcurrentKernel(
          kernel,
          responses,
          performance.now() - stageStartedAt,
          workerCount,
        );
        emitLiveCpuTelemetry();
      }
    }

    if (runMode === "full") {
      step += 1;
      setActiveCpuStage({
        stage: "sustained",
        label: "Sustained burn",
        message:
          "Holding a mixed CPU load to expose thermal throttling and late-run stability.",
        step,
        progress: 90,
        kernel: "mixedBurn",
      });

      const sustainedStartedAt = performance.now();
      const sustainedResponses = await Promise.all(
        workerPool.map((worker, workerIndex) => {
          const kernel = CPU_SUSTAINED_MIX[workerIndex % CPU_SUSTAINED_MIX.length];

          return worker.runTask({
            type: "run-kernel",
            kernel,
            durationMs: config.sustainedDurationMs,
            workerIndex,
            seed: 9000 + workerIndex * 31,
            sizes: config.dataScale,
            wasmModule: undefined,
            cancelBuffer: cancelSignal.buffer,
          });
        }),
      );

      visibilityGuard.assertVisible();

      const sustainedDurationMs = performance.now() - sustainedStartedAt;
      const sustainedThroughput = sustainedResponses.reduce(
        (sum, response) => sum + response.throughput,
        0,
      );
      const sustainedIterations = sustainedResponses.reduce(
        (sum, response) => sum + response.iterations,
        0,
      );
      const sustainedChecksum = sustainedResponses.reduce(
        (sum, response) => (sum + response.checksum) >>> 0,
        0,
      );

      sustainedMetric = {
        id: "memoryStencil",
        label: "Mixed sustained CPU load",
        throughput: roundMetric(sustainedThroughput),
        iterations: sustainedIterations,
        durationMs: roundMetric(sustainedDurationMs),
        workerCount,
        unit: "work units/s",
        checksum: sustainedChecksum,
        notes:
          "Round-robin integer, floating-point, matrix, memory, compression, and raymarch workers under steady-state load.",
      };
      emitLiveCpuTelemetry();
    }

    const subScores: CpuBenchmarkSubScores = {
      singleCore: singleCoreMetrics
        ? calculateCpuAggregateSubScore({
            id: "singleCore",
            label: "Single-core",
            kernels: CPU_KERNEL_ORDER.map((kernel) => ({
              id: kernel,
              throughput: singleCoreMetrics![kernel].throughput,
              referenceThroughput: config.referenceThroughputs.singleCore[kernel],
              durationMs: singleCoreMetrics![kernel].durationMs,
              workerCount: 1,
              notes: `Single-core ${CPU_SUITE_LABELS[kernel].toLowerCase()}.`,
            })),
          })
        : null,
      multiCore: multiCoreMetrics
        ? calculateCpuAggregateSubScore({
            id: "multiCore",
            label: "Multi-core",
            kernels: CPU_KERNEL_ORDER.map((kernel) => ({
              id: kernel,
              throughput: multiCoreMetrics![kernel].throughput,
              referenceThroughput: config.referenceThroughputs.multiCore[kernel],
              durationMs: multiCoreMetrics![kernel].durationMs,
              workerCount,
              notes: `Scaled ${CPU_SUITE_LABELS[kernel].toLowerCase()} across ${workerCount} workers.`,
            })),
          })
        : null,
      sustained: sustainedMetric
        ? calculateCpuAggregateSubScore({
            id: "sustained",
            label: "Sustained",
            kernels: [
              {
                id: "mixedBurn",
                throughput: sustainedMetric.throughput,
                referenceThroughput: config.referenceThroughputs.sustained,
                durationMs: sustainedMetric.durationMs,
                workerCount,
                notes:
                  "Measured the late-run steady-state CPU throughput under thermal pressure.",
              },
            ],
          })
        : null,
    };

    const { cpuScore, rating } = calculateCpuScore({ runMode, subScores });
    const totalDurationMs = performance.now() - startedAtPerf;
    const checksum = combineChecksums([
      singleCoreMetrics
        ? Object.values(singleCoreMetrics).reduce(
            (sum, metric) => (sum + metric.checksum) >>> 0,
            0,
          )
        : 0,
      multiCoreMetrics
        ? Object.values(multiCoreMetrics).reduce(
            (sum, metric) => (sum + metric.checksum) >>> 0,
            0,
          )
        : 0,
      sustainedMetric?.checksum ?? 0,
    ]);

    setActiveCpuStage({
      stage: "persisting",
      label:
        runMode === "singleCore"
          ? "Single-core CPU run complete"
          : runMode === "multiCore"
            ? "Multi-core CPU run complete"
            : "CPU run complete",
      message: "Persisting the CPU result.",
      step: totalSteps,
      progress: 96,
    });

    onProgress?.({
      label: activeLabel,
      message: activeMessage,
      step: totalSteps,
      totalSteps,
      progress: 96,
      telemetry: {
        title: activeLabel,
        summary: activeMessage,
        liveScores: buildCpuLiveScores({
          runMode,
          activeStage,
          singleCoreScore: subScores.singleCore?.score ?? null,
          multiCoreScore: subScores.multiCore?.score ?? null,
          sustainedScore: subScores.sustained?.score ?? null,
        }),
        metrics: [
          {
            label: "Completed sections",
            value:
              runMode === "full"
                ? "Single-core + multi-core + sustained"
                : runMode === "singleCore"
                  ? "Single-core only"
                  : "Multi-core only",
          },
          {
            label: "Workers",
            value: String(workerCount),
          },
          {
            label: "Elapsed",
            value: `${roundMetric((performance.now() - startedAtPerf) / 1000, 1)}s`,
          },
        ],
        activity: [],
      },
    });

    return {
      benchmarkKind: "cpu",
      cpuRunMode: runMode,
      headlineScore: cpuScore,
      cpuScore,
      rating,
      singleCoreScore: subScores.singleCore?.score ?? null,
      multiCoreScore: subScores.multiCore?.score ?? null,
      sustainedScore: subScores.sustained?.score ?? null,
      subScores,
      rawMetrics: {
        preset: resolvedPreset,
        runMode,
        startedAt,
        endedAt: Date.now(),
        totalDurationMs: roundMetric(totalDurationMs),
        warmupDurationMs: config.warmupDurationMs,
        singleCoreDurationMs: singleCoreMetrics
          ? roundMetric(
              Object.values(singleCoreMetrics).reduce(
                (sum, metric) => sum + metric.durationMs,
                0,
              ),
            )
          : 0,
        multiCoreDurationMs: multiCoreMetrics
          ? roundMetric(
              Object.values(multiCoreMetrics).reduce(
                (sum, metric) => sum + metric.durationMs,
                0,
              ),
            )
          : 0,
        sustainedDurationMs: sustainedMetric?.durationMs ?? 0,
        workerCount,
        checksum,
        wasmBytes: wasmBytes.byteLength,
        visibilityGuardPassed: visibilityGuard.passed() && !cancelSignal.isCancelled(),
        crossOriginIsolated: window.crossOriginIsolated,
        kernelMetrics: {
          singleCore: singleCoreMetrics,
          multiCore: multiCoreMetrics,
          sustained: sustainedMetric
            ? {
                mixedBurn: sustainedMetric,
              }
            : null,
        },
      },
      benchmarkVersion: BENCHMARK_VERSION,
    };
  } finally {
    visibilityGuard.cleanup();
    cancelSignal.cancel();
    workerPool.forEach((worker) => worker.dispose());
  }
}

function createMockCpuResult(
  config: ReturnType<typeof getCpuPreset>,
  runMode: CpuRunMode,
): CpuBenchmarkResult {
  const singleRatio = 0.91;
  const multiRatio = 0.96;
  const sustainedRatio = 0.86;
  const startedAt = Date.now();
  const totalDurationMs =
    config.warmupDurationMs +
    (runMode !== "multiCore"
      ? config.singleCoreKernelDurationMs * CPU_KERNEL_ORDER.length
      : 0) +
    (runMode !== "singleCore"
      ? config.multiCoreKernelDurationMs * CPU_KERNEL_ORDER.length
      : 0) +
    (runMode === "full" ? config.sustainedDurationMs : 0);
  const workerCount =
    runMode === "singleCore" ? 1 : Math.min(config.maxWorkers, 8);

  const singleCoreMetrics = runMode !== "multiCore" ? (Object.fromEntries(
    CPU_KERNEL_ORDER.map((kernel, index) => [
      kernel,
      {
        id: kernel,
        label: CPU_SUITE_LABELS[kernel],
        throughput: roundMetric(config.referenceThroughputs.singleCore[kernel] * singleRatio),
        iterations: 100 + index,
        durationMs: config.singleCoreKernelDurationMs,
        workerCount: 1,
        unit: "work units/s",
        checksum: index + 1,
        notes: "Mock single-core metric for smoke verification.",
      },
    ]),
  ) as Record<CpuKernelId, CpuKernelMetric>) : null;

  const multiCoreMetrics = runMode !== "singleCore" ? (Object.fromEntries(
    CPU_KERNEL_ORDER.map((kernel, index) => [
      kernel,
      {
        id: kernel,
        label: CPU_SUITE_LABELS[kernel],
        throughput: roundMetric(config.referenceThroughputs.multiCore[kernel] * multiRatio),
        iterations: 200 + index,
        durationMs: config.multiCoreKernelDurationMs,
        workerCount,
        unit: "work units/s",
        checksum: 50 + index,
        notes: "Mock multi-core metric for smoke verification.",
      },
    ]),
  ) as Record<CpuKernelId, CpuKernelMetric>) : null;

  const sustainedMetric: CpuKernelMetric | null = runMode === "full" ? {
    id: "memoryStencil",
    label: "Mixed sustained CPU load",
    throughput: roundMetric(config.referenceThroughputs.sustained * sustainedRatio),
    iterations: 400,
    durationMs: config.sustainedDurationMs,
    workerCount,
    unit: "work units/s",
    checksum: 99,
    notes: "Mock sustained CPU metric for smoke verification.",
  } : null;

  const subScores: CpuBenchmarkSubScores = {
    singleCore:
      runMode !== "multiCore" && singleCoreMetrics
        ? calculateCpuAggregateSubScore({
            id: "singleCore",
            label: "Single-core",
            kernels: CPU_KERNEL_ORDER.map((kernel) => ({
              id: kernel,
              throughput: singleCoreMetrics[kernel].throughput,
              referenceThroughput: config.referenceThroughputs.singleCore[kernel],
              durationMs: singleCoreMetrics[kernel].durationMs,
              workerCount: 1,
              notes: "Mock single-core aggregate for smoke verification.",
            })),
          })
        : null,
    multiCore:
      runMode !== "singleCore" && multiCoreMetrics
        ? calculateCpuAggregateSubScore({
            id: "multiCore",
            label: "Multi-core",
            kernels: CPU_KERNEL_ORDER.map((kernel) => ({
              id: kernel,
              throughput: multiCoreMetrics[kernel].throughput,
              referenceThroughput: config.referenceThroughputs.multiCore[kernel],
              durationMs: multiCoreMetrics[kernel].durationMs,
              workerCount,
              notes: "Mock multi-core aggregate for smoke verification.",
            })),
          })
        : null,
    sustained:
      runMode === "full" && sustainedMetric
        ? calculateCpuAggregateSubScore({
            id: "sustained",
            label: "Sustained",
            kernels: [
              {
                id: "mixedBurn",
                throughput: sustainedMetric.throughput,
                referenceThroughput: config.referenceThroughputs.sustained,
                durationMs: sustainedMetric.durationMs,
                workerCount,
                notes: "Mock sustained aggregate for smoke verification.",
              },
            ],
          })
        : null,
  };
  const { cpuScore, rating } = calculateCpuScore({ runMode, subScores });

  return {
    benchmarkKind: "cpu",
    cpuRunMode: runMode,
    headlineScore: cpuScore,
    cpuScore,
    rating,
    singleCoreScore: subScores.singleCore?.score ?? null,
    multiCoreScore: subScores.multiCore?.score ?? null,
    sustainedScore: subScores.sustained?.score ?? null,
    subScores,
    rawMetrics: {
      preset: config.name,
      runMode,
      startedAt,
      endedAt: startedAt + totalDurationMs,
      totalDurationMs,
      warmupDurationMs: config.warmupDurationMs,
      singleCoreDurationMs:
        runMode !== "multiCore"
          ? config.singleCoreKernelDurationMs * CPU_KERNEL_ORDER.length
          : 0,
      multiCoreDurationMs:
        runMode !== "singleCore"
          ? config.multiCoreKernelDurationMs * CPU_KERNEL_ORDER.length
          : 0,
      sustainedDurationMs: runMode === "full" ? config.sustainedDurationMs : 0,
      workerCount,
      checksum: combineChecksums([
        singleCoreMetrics
          ? Object.values(singleCoreMetrics).reduce(
              (sum, metric) => (sum + metric.checksum) >>> 0,
              0,
            )
          : 0,
        multiCoreMetrics
          ? Object.values(multiCoreMetrics).reduce(
              (sum, metric) => (sum + metric.checksum) >>> 0,
              0,
            )
          : 0,
        sustainedMetric?.checksum ?? 0,
      ]),
      wasmBytes: 180_036,
      visibilityGuardPassed: true,
      crossOriginIsolated: true,
      kernelMetrics: {
        singleCore: singleCoreMetrics,
        multiCore: multiCoreMetrics,
        sustained: sustainedMetric
          ? {
              mixedBurn: sustainedMetric,
            }
          : null,
      },
    },
    benchmarkVersion: BENCHMARK_VERSION,
  };
}
