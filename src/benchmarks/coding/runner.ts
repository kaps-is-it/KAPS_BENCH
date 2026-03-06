import { BENCHMARK_VERSION } from "@/lib/branding";
import { getCodingPreset } from "@/benchmarks/coding/config";
import { calculateCodingScore, normalizeDuration } from "@/benchmarks/coding/scoring";
import type {
  BenchmarkPreset,
  CodingBenchmarkResult,
  CodingTestId,
  CodingSubScore,
} from "@/lib/types";

type WorkerTaskRequest =
  | {
      type: "compile-wasm";
      buffer: ArrayBuffer;
    }
  | {
      type: "parse-js";
      source: string;
    }
  | {
      type: "compute";
      buffer: ArrayBuffer;
      passes: number;
      seed: number;
    };

type WorkerTaskResponse = {
  type: WorkerTaskRequest["type"];
  durationMs: number;
  checksum: number;
  compileMs?: number;
  instantiateMs?: number;
  error?: string;
};

export type BenchmarkProgressUpdate = {
  currentTest: CodingTestId;
  label: string;
  message: string;
  step: number;
  totalSteps: number;
  progress: number;
};

function roundDuration(value: number) {
  return Math.max(1, Number(value.toFixed(2)));
}

function createDeterministicDatasetBuffer(length: number, seed: number) {
  const values = new Float64Array(length);
  let state = seed >>> 0;

  for (let index = 0; index < values.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    values[index] = state / 4_294_967_295 + (index % 23) * 0.0001;
  }

  return values.buffer;
}

async function fetchArrayBuffer(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load benchmark asset: ${path}`);
  }

  return response.arrayBuffer();
}

async function fetchText(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load benchmark asset: ${path}`);
  }

  return response.text();
}

async function runWorkerTask(
  message: WorkerTaskRequest,
  transfer: Transferable[] = [],
) {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  return new Promise<WorkerTaskResponse>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerTaskResponse>) => {
      worker.terminate();

      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }

      resolve(event.data);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error ?? new Error("Benchmark worker crashed."));
    };

    worker.postMessage(message, transfer);
  });
}

async function warmupCompute(elementCount: number, passes: number, seed: number) {
  const buffer = createDeterministicDatasetBuffer(elementCount, seed);
  await runWorkerTask(
    {
      type: "compute",
      buffer,
      passes,
      seed,
    },
    [buffer],
  );
}

export async function runCodingBenchmark({
  preset = "standard",
  onProgress,
}: {
  preset?: BenchmarkPreset;
  onProgress?: (update: BenchmarkProgressUpdate) => void;
}): Promise<CodingBenchmarkResult> {
  const config = getCodingPreset(preset);
  const totalSteps = 4;
  const startedAt = Date.now();
  const workerCount = Math.max(
    1,
    Math.min(
      config.maxWorkers,
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4,
    ),
  );

  const [wasmBytes, jsPayload] = await Promise.all([
    fetchArrayBuffer(config.assetPaths.wasmModule),
    fetchText(config.assetPaths.jsPayload),
  ]);

  await runWorkerTask(
    { type: "compile-wasm", buffer: wasmBytes.slice(0) },
    [wasmBytes.slice(0)],
  );
  await runWorkerTask({ type: "parse-js", source: jsPayload });
  await warmupCompute(
    config.warmup.elementCount,
    config.warmup.passes,
    config.singleThread.seed,
  );
  await warmupCompute(
    Math.ceil(config.warmup.elementCount / Math.max(workerCount, 1)),
    config.warmup.passes,
    config.multiThread.seed,
  );

  const testDurations = {
    wasmCompile: 0,
    jsParse: 0,
    singleThread: 0,
    multiThread: 0,
  } satisfies Record<CodingTestId, number>;

  onProgress?.({
    currentTest: "wasmCompile",
    label: "WASM compile",
    message: "Compiling and instantiating the static benchmark module.",
    step: 1,
    totalSteps,
    progress: 18,
  });
  const wasmRun = await runWorkerTask(
    { type: "compile-wasm", buffer: wasmBytes.slice(0) },
    [wasmBytes.slice(0)],
  );
  testDurations.wasmCompile = roundDuration(wasmRun.durationMs);

  onProgress?.({
    currentTest: "jsParse",
    label: "JS parse + execute",
    message: "Parsing the fixed local JS payload inside a dedicated worker.",
    step: 2,
    totalSteps,
    progress: 42,
  });
  const jsRun = await runWorkerTask({ type: "parse-js", source: jsPayload });
  testDurations.jsParse = roundDuration(jsRun.durationMs);

  onProgress?.({
    currentTest: "singleThread",
    label: "Single-thread compute",
    message: "Running a deterministic scalar workload on one worker.",
    step: 3,
    totalSteps,
    progress: 66,
  });
  const singleThreadBuffer = createDeterministicDatasetBuffer(
    config.singleThread.elementCount,
    config.singleThread.seed,
  );
  const singleRun = await runWorkerTask(
    {
      type: "compute",
      buffer: singleThreadBuffer,
      passes: config.singleThread.passes,
      seed: config.singleThread.seed,
    },
    [singleThreadBuffer],
  );
  testDurations.singleThread = roundDuration(singleRun.durationMs);

  onProgress?.({
    currentTest: "multiThread",
    label: "Multi-thread compute",
    message: `Splitting the workload across ${workerCount} workers.`,
    step: 4,
    totalSteps,
    progress: 84,
  });
  const chunkSize = Math.ceil(config.multiThread.elementCount / workerCount);
  const multiThreadStart = performance.now();
  const multiRuns = await Promise.all(
    Array.from({ length: workerCount }, (_, workerIndex) => {
      const buffer = createDeterministicDatasetBuffer(
        chunkSize,
        config.multiThread.seed + workerIndex,
      );

      return runWorkerTask(
        {
          type: "compute",
          buffer,
          passes: config.multiThread.passes,
          seed: config.multiThread.seed + workerIndex,
        },
        [buffer],
      );
    }),
  );
  testDurations.multiThread = roundDuration(performance.now() - multiThreadStart);

  const subScores = {
    wasmCompile: {
      id: "wasmCompile",
      label: "WASM compile + instantiate",
      durationMs: testDurations.wasmCompile,
      referenceMs: config.referenceDurations.wasmCompile,
      normalizedScore: normalizeDuration(
        testDurations.wasmCompile,
        config.referenceDurations.wasmCompile,
      ),
      workerCount: 1,
      notes: `${roundDuration(wasmRun.compileMs ?? 0)}ms compile / ${roundDuration(wasmRun.instantiateMs ?? 0)}ms instantiate`,
    },
    jsParse: {
      id: "jsParse",
      label: "JS parse + execute",
      durationMs: testDurations.jsParse,
      referenceMs: config.referenceDurations.jsParse,
      normalizedScore: normalizeDuration(
        testDurations.jsParse,
        config.referenceDurations.jsParse,
      ),
      workerCount: 1,
      notes: "Fixed local payload executed inside a worker.",
    },
    singleThread: {
      id: "singleThread",
      label: "Single-thread compute",
      durationMs: testDurations.singleThread,
      referenceMs: config.referenceDurations.singleThread,
      normalizedScore: normalizeDuration(
        testDurations.singleThread,
        config.referenceDurations.singleThread,
      ),
      workerCount: 1,
      notes: `${config.singleThread.elementCount.toLocaleString()} samples across ${config.singleThread.passes} passes.`,
    },
    multiThread: {
      id: "multiThread",
      label: "Multi-thread compute",
      durationMs: testDurations.multiThread,
      referenceMs: config.referenceDurations.multiThread,
      normalizedScore: normalizeDuration(
        testDurations.multiThread,
        config.referenceDurations.multiThread,
      ),
      workerCount,
      notes: `${workerCount} workers with ${chunkSize.toLocaleString()} samples each.`,
    },
  } satisfies Record<CodingTestId, CodingSubScore>;

  const { codingScore, rating } = calculateCodingScore(subScores);
  const endedAt = Date.now();
  const encoder = new TextEncoder();
  const checksum =
    wasmRun.checksum + jsRun.checksum + singleRun.checksum +
    multiRuns.reduce((total, run) => total + run.checksum, 0);

  return {
    codingScore,
    rating,
    subScores,
    rawMetrics: {
      preset,
      startedAt,
      endedAt,
      totalDurationMs: endedAt - startedAt,
      wasmBytes: wasmBytes.byteLength,
      jsPayloadBytes: encoder.encode(jsPayload).byteLength,
      workerCount,
      checksum: Number(checksum.toFixed(4)),
      testDurations,
    },
    benchmarkVersion: BENCHMARK_VERSION,
  };
}
