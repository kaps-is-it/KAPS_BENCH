type CompileWasmRequest = {
  type: "compile-wasm";
  buffer: ArrayBuffer;
};

type ParseJsRequest = {
  type: "parse-js";
  source: string;
};

type ComputeRequest = {
  type: "compute";
  buffer: ArrayBuffer;
  passes: number;
  seed: number;
};

type WorkerRequest = CompileWasmRequest | ParseJsRequest | ComputeRequest;

type WorkerResponse = {
  type: WorkerRequest["type"];
  durationMs: number;
  checksum: number;
  compileMs?: number;
  instantiateMs?: number;
  error?: string;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerScope;

function runCompute(buffer: ArrayBuffer, passes: number, seed: number) {
  const values = new Float64Array(buffer);
  const startedAt = performance.now();
  let checksum = 0;

  for (let pass = 0; pass < passes; pass += 1) {
    for (let index = 0; index < values.length; index += 1) {
      const mixed = (((index + 1) * 2654435761) ^ (seed + pass * 97)) >>> 0;
      const scaled =
        Math.sqrt(values[index] * 1.61803398875 + ((mixed % 17) + 1)) *
        1.000031;
      values[index] = scaled;
      checksum += scaled;
    }
  }

  return {
    durationMs: performance.now() - startedAt,
    checksum: Number(checksum.toFixed(4)),
  };
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const payload = event.data;

  try {
    if (payload.type === "compile-wasm") {
      const moduleBytes = new Uint8Array(payload.buffer);
      const startedAt = performance.now();
      const compiled = await WebAssembly.compile(moduleBytes);
      const compiledAt = performance.now();
      const instance = await WebAssembly.instantiate(compiled);
      const endedAt = performance.now();
      const mainExport = instance.exports.main as (() => number) | undefined;

      const response: WorkerResponse = {
        type: payload.type,
        durationMs: endedAt - startedAt,
        compileMs: compiledAt - startedAt,
        instantiateMs: endedAt - compiledAt,
        checksum: typeof mainExport === "function" ? mainExport() : 0,
      };

      workerScope.postMessage(response);
      return;
    }

    if (payload.type === "parse-js") {
      const startedAt = performance.now();
      const executable = new Function(payload.source);
      const result = executable();
      const endedAt = performance.now();

      const response: WorkerResponse = {
        type: payload.type,
        durationMs: endedAt - startedAt,
        checksum:
          typeof result === "number" ? Number(result.toFixed(4)) : 0,
      };

      workerScope.postMessage(response);
      return;
    }

    const computed = runCompute(payload.buffer, payload.passes, payload.seed);

    const response: WorkerResponse = {
      type: payload.type,
      durationMs: computed.durationMs,
      checksum: computed.checksum,
    };

    workerScope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: payload.type,
      durationMs: 0,
      checksum: 0,
      error: error instanceof Error ? error.message : "Worker failure",
    };

    workerScope.postMessage(response);
  }
};

export {};
