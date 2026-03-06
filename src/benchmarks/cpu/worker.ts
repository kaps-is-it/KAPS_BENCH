/// <reference lib="webworker" />

import type { CpuKernelId } from "@/lib/types";
import { CPU_SUITE_LABELS } from "@/benchmarks/cpu/config";

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

type CpuProgressReporter = (snapshot: {
  checksum: number;
  iterations: number;
  operations: number;
  notes: string;
}) => void;

function createSeededState(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function createUint32Data(length: number, seed: number) {
  const next = createSeededState(seed);
  const output = new Uint32Array(length);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = next();
  }

  return output;
}

function createUint8Data(length: number, seed: number) {
  const next = createSeededState(seed);
  const output = new Uint8Array(length);

  for (let index = 0; index < output.length; index += 1) {
    const value = next() & 0xff;
    output[index] = index % 17 < 6 ? value : value & 0x3f;
  }

  return output;
}

function createFloatData(length: number, seed: number) {
  const next = createSeededState(seed);
  const output = new Float64Array(length);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = (next() / 0xffffffff) * 4 - 2 + (index % 11) * 0.03125;
  }

  return output;
}

function createMatrix(size: number, seed: number) {
  const next = createSeededState(seed);
  const output = new Float32Array(size * size);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = (next() / 0xffffffff) * 2 - 1;
  }

  return output;
}

function isCancelled(cancelView?: Int32Array) {
  return cancelView ? Atomics.load(cancelView, 0) === 1 : false;
}

function signedDistanceSphere(x: number, y: number, z: number, radius: number) {
  return Math.hypot(x, y, z) - radius;
}

function signedDistancePlane(y: number, offset: number) {
  return y + offset;
}

function createProgressReporter(request: CpuWorkerRequest, start: number): CpuProgressReporter {
  let lastReportAt = 0;

  return ({ checksum, iterations, operations, notes }) => {
    const now = performance.now();

    if (now - lastReportAt < 250) {
      return;
    }

    lastReportAt = now;
    const durationMs = Math.max(1, now - start);
    const throughput = operations / (durationMs / 1000);

    self.postMessage({
      type: "progress",
      kernel: request.kernel,
      label: CPU_SUITE_LABELS[request.kernel],
      workerIndex: request.workerIndex,
      throughput,
      iterations,
      durationMs,
      checksum,
      unit: "work units/s",
      notes,
    } satisfies CpuWorkerProgress);
  };
}

async function runIntegerBranchHash(
  length: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Hashed 32-bit integer lanes with branch-heavy mixing.";
  const values = createUint32Data(length, seed);
  let checksum = 2166136261 >>> 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    for (let index = 0; index < values.length; index += 1) {
      const value = (values[index] + (index * 2654435761)) >>> 0;

      if ((value & 3) === 0) {
        checksum = Math.imul(checksum ^ value, 16777619) >>> 0;
      } else {
        checksum = Math.imul(checksum ^ (value >>> 1), 2246822519) >>> 0;
      }

      values[index] = value ^ checksum;
    }

    iterations += 1;
    operations += values.length;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return { checksum, iterations, operations, notes };
}

async function runCompression(
  length: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Performed deterministic byte-run compression and validation passes.";
  const source = createUint8Data(length, seed);
  const encoded = new Uint32Array(length);
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    let readIndex = 0;
    let writeIndex = 0;

    while (readIndex < source.length) {
      const value = source[readIndex];
      let runLength = 1;

      while (
        readIndex + runLength < source.length &&
        source[readIndex + runLength] === value &&
        runLength < 255
      ) {
        runLength += 1;
      }

      encoded[writeIndex] = (runLength << 8) | value;
      writeIndex += 1;
      readIndex += runLength;
    }

    for (let index = 0; index < writeIndex; index += 1) {
      checksum =
        (checksum + (encoded[index] & 0xff) * ((encoded[index] >>> 8) + index)) >>> 0;
    }

    iterations += 1;
    operations += source.length * 2;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runFloatingPoint(
  length: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Mixed transcendental and scalar floating-point math over typed arrays.";
  const values = createFloatData(length, seed);
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    let accumulator = 0;

    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      accumulator +=
        Math.sin(value) * Math.cos(value * 0.5) +
        Math.sqrt(Math.abs(value) + 1) +
        Math.atan2(value, index + 1);
      values[index] = accumulator * 0.0001;
    }

    checksum = (checksum + Math.floor(accumulator * 1000)) >>> 0;
    iterations += 1;
    operations += values.length * 6;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runMatrix(
  size: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Executed dense matrix multiplication on Float32 tiles.";
  const left = createMatrix(size, seed);
  const right = createMatrix(size, seed + 17);
  const output = new Float32Array(size * size);
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        let sum = 0;

        for (let inner = 0; inner < size; inner += 1) {
          sum += left[row * size + inner] * right[inner * size + column];
        }

        output[row * size + column] = sum;
      }
    }

    checksum = (checksum + Math.floor(output[(iterations * 13) % output.length] * 1000)) >>> 0;
    iterations += 1;
    operations += size * size * size * 2;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runConvolution(
  size: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Applied a 3x3 blur kernel across a deterministic image field.";
  const image = createFloatData(size * size, seed);
  const output = new Float64Array(size * size);
  const kernel = [
    0.0625,
    0.125,
    0.0625,
    0.125,
    0.25,
    0.125,
    0.0625,
    0.125,
    0.0625,
  ];
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const index = y * size + x;
        let total = 0;
        let kernelIndex = 0;

        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            total += image[index + ky * size + kx] * kernel[kernelIndex];
            kernelIndex += 1;
          }
        }

        output[index] = total;
      }
    }

    checksum = (checksum + Math.floor(output[(iterations * 17) % output.length] * 1000)) >>> 0;
    iterations += 1;
    operations += (size - 2) * (size - 2) * 9;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runMemoryStencil(
  width: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Copied and relaxed a 2D stencil grid under memory pressure.";
  const length = width * width;
  const source = createFloatData(length, seed);
  const target = new Float64Array(length);
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    target.set(source);

    for (let y = 1; y < width - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        target[index] =
          (source[index] +
            source[index - 1] +
            source[index + 1] +
            source[index - width] +
            source[index + width]) /
          5;
      }
    }

    source.set(target);
    checksum = (checksum + Math.floor(target[(iterations * 7) % target.length] * 1000)) >>> 0;
    iterations += 1;
    operations += length * 6;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runWasmCompile(
  moduleBytes: ArrayBuffer,
  deadline: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Repeatedly compiled and instantiated the local WASM benchmark asset.";
  const moduleSource = moduleBytes.slice(0);
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    const compiled = await WebAssembly.compile(moduleSource);
    const instance = await WebAssembly.instantiate(compiled);
    const mainExport =
      instance.exports.main && typeof instance.exports.main === "function"
        ? Number(instance.exports.main())
        : 0;

    checksum = (checksum + mainExport + iterations) >>> 0;
    iterations += 1;
    operations += moduleBytes.byteLength;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runRaymarch(
  resolution: number,
  deadline: number,
  seed: number,
  cancelView?: Int32Array,
  reportProgress?: CpuProgressReporter,
) {
  const notes = "Traced a signed-distance field scene entirely on the CPU.";
  const next = createSeededState(seed);
  let checksum = 0;
  let iterations = 0;
  let operations = 0;

  while (performance.now() < deadline && !isCancelled(cancelView)) {
    let frameEnergy = 0;

    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const normalizedX = (x / resolution) * 2 - 1;
        const normalizedY = (y / resolution) * 2 - 1;
        let travel = 0;

        for (let step = 0; step < 22; step += 1) {
          const wobble = (next() / 0xffffffff - 0.5) * 0.015;
          const distance = Math.min(
            signedDistanceSphere(normalizedX + wobble, normalizedY, travel - 1.5, 0.45),
            signedDistancePlane(normalizedY - 0.3, 0),
          );
          travel += Math.max(distance, 0.01);
          frameEnergy += 1 / (1 + travel * travel);
        }
      }
    }

    checksum = (checksum + Math.floor(frameEnergy * 100)) >>> 0;
    iterations += 1;
    operations += resolution * resolution * 22;
    reportProgress?.({ checksum, iterations, operations, notes });
  }

  return {
    checksum,
    iterations,
    operations,
    notes,
  };
}

async function runKernel(request: CpuWorkerRequest): Promise<CpuWorkerResponse> {
  const start = performance.now();
  const deadline = start + request.durationMs;
  const cancelView = request.cancelBuffer
    ? new Int32Array(request.cancelBuffer)
    : undefined;
  const reportProgress = createProgressReporter(request, start);

  let result:
    | {
        checksum: number;
        iterations: number;
        operations: number;
        notes: string;
      }
    | undefined;

  switch (request.kernel) {
    case "integerBranchHash":
      result = await runIntegerBranchHash(
        request.sizes.integerLength,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    case "compression":
      result = await runCompression(
        request.sizes.compressionLength,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    case "floatingPoint":
      result = await runFloatingPoint(
        request.sizes.floatingLength,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    case "matrix":
      result = await runMatrix(
        request.sizes.matrixSize,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    case "convolution":
      result = await runConvolution(
        request.sizes.imageSize,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    case "memoryStencil":
      result = await runMemoryStencil(
        request.sizes.memoryWidth,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    case "wasmCompile":
      if (!request.wasmModule) {
        throw new Error("WASM module bytes are required for the compile kernel.");
      }

      result = await runWasmCompile(
        request.wasmModule,
        deadline,
        cancelView,
        reportProgress,
      );
      break;
    case "raymarch":
      result = await runRaymarch(
        request.sizes.raymarchResolution,
        deadline,
        request.seed,
        cancelView,
        reportProgress,
      );
      break;
    default:
      throw new Error(`Unsupported CPU kernel: ${request.kernel satisfies never}`);
  }

  const durationMs = Math.max(1, performance.now() - start);
  const throughput = result.operations / (durationMs / 1000);

  return {
    type: "run-kernel",
    kernel: request.kernel,
    label: CPU_SUITE_LABELS[request.kernel],
    throughput,
    iterations: result.iterations,
    durationMs,
    checksum: result.checksum,
    unit: "work units/s",
    notes: result.notes,
  };
}

self.onmessage = (event: MessageEvent<CpuWorkerRequest>) => {
  void runKernel(event.data)
    .then((response) => self.postMessage(response satisfies CpuWorkerMessage))
    .catch((error: unknown) =>
      self.postMessage({
        type: "run-kernel",
        kernel: event.data.kernel,
        label: CPU_SUITE_LABELS[event.data.kernel],
        throughput: 0,
        iterations: 0,
        durationMs: 0,
        checksum: 0,
        unit: "work units/s",
        notes: "",
        error: error instanceof Error ? error.message : "CPU benchmark worker failed.",
      } satisfies CpuWorkerMessage),
    );
};
