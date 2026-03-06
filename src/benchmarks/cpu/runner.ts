import { BENCHMARK_VERSION } from "@/lib/branding";
import { CPU_SUITE_LABELS, getCpuPreset } from "@/benchmarks/cpu/config";
import {
  calculateCpuAggregateSubScore,
  calculateCpuScore,
} from "@/benchmarks/cpu/scoring";
import type { BenchmarkProgressUpdate } from "@/benchmarks/shared/progress";
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

function createCpuWorkerClient(): CpuWorkerClient {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  let pending:
    | {
        resolve: (value: CpuWorkerResponse) => void;
        reject: (reason?: unknown) => void;
      }
    | null = null;

  worker.onmessage = (event: MessageEvent<CpuWorkerResponse>) => {
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

function createCpuWorkerPool(workerCount: number) {
  return Array.from({ length: workerCount }, () => createCpuWorkerClient());
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
  const workerPool = createCpuWorkerPool(workerCount);
  let singleCoreMetrics: Record<CpuKernelId, CpuKernelMetric> | null = null;
  let multiCoreMetrics: Record<CpuKernelId, CpuKernelMetric> | null = null;
  let sustainedMetric: CpuKernelMetric | null = null;
  const startedAtPerf = performance.now();

  try {
    onProgress?.({
      label: "Warmup",
      message:
        runMode === "full"
          ? `Priming ${workerCount} workers, WASM, and memory pages for the full CPU run.`
          : `Priming ${workerCount} worker${workerCount > 1 ? "s" : ""} for the selected CPU run.`,
      step: 1,
      totalSteps,
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

        onProgress?.({
          label: `Single-core: ${CPU_SUITE_LABELS[kernel]}`,
          message: "Running the single-core suite on one dedicated worker.",
          step,
          totalSteps,
          progress: 5 + Math.round((step / totalSteps) * 85),
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
      }
    }

    if (runMode !== "singleCore") {
      multiCoreMetrics = {} as Record<CpuKernelId, CpuKernelMetric>;

      for (const kernel of CPU_KERNEL_ORDER) {
        step += 1;

        onProgress?.({
          label: `Multi-core: ${CPU_SUITE_LABELS[kernel]}`,
          message: `Scaling ${CPU_SUITE_LABELS[kernel].toLowerCase()} across ${workerCount} workers.`,
          step,
          totalSteps,
          progress: 5 + Math.round((step / totalSteps) * 85),
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
      }
    }

    if (runMode === "full") {
      step += 1;
      onProgress?.({
        label: "Sustained burn",
        message:
          "Holding a mixed CPU load to expose thermal throttling and late-run stability.",
        step,
        totalSteps,
        progress: 90,
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

    onProgress?.({
      label:
        runMode === "singleCore"
          ? "Single-core CPU run complete"
          : runMode === "multiCore"
            ? "Multi-core CPU run complete"
            : "CPU run complete",
      message: "Persisting the CPU result.",
      step: totalSteps,
      totalSteps,
      progress: 96,
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
  const singleCoreScore = Math.round(singleRatio * 5000);
  const multiCoreScore = Math.round(multiRatio * 5000);
  const sustainedScore = Math.round(sustainedRatio * 5000);
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
      runMode !== "multiCore"
        ? {
            id: "singleCore",
            label: "Single-core",
            score: singleCoreScore,
            measuredValue: roundMetric(singleRatio * 100),
            referenceValue: 100,
            unit: "% of reference",
            durationMs: config.singleCoreKernelDurationMs * CPU_KERNEL_ORDER.length,
            workerCount: 1,
            notes: "Mock single-core aggregate for smoke verification.",
          }
        : null,
    multiCore:
      runMode !== "singleCore"
        ? {
            id: "multiCore",
            label: "Multi-core",
            score: multiCoreScore,
            measuredValue: roundMetric(multiRatio * 100),
            referenceValue: 100,
            unit: "% of reference",
            durationMs: config.multiCoreKernelDurationMs * CPU_KERNEL_ORDER.length,
            workerCount,
            notes: "Mock multi-core aggregate for smoke verification.",
          }
        : null,
    sustained:
      runMode === "full"
        ? {
            id: "sustained",
            label: "Sustained",
            score: sustainedScore,
            measuredValue: roundMetric(sustainedRatio * 100),
            referenceValue: 100,
            unit: "% of reference",
            durationMs: config.sustainedDurationMs,
            workerCount,
            notes: "Mock sustained aggregate for smoke verification.",
          }
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
