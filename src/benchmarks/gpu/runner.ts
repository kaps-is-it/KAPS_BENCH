import { BENCHMARK_VERSION } from "@/lib/branding";
import {
  GPU_COMPUTE_LABELS,
  GPU_GRAPHICS_LABELS,
  getGpuPreset,
} from "@/benchmarks/gpu/config";
import {
  calculateGpuAggregateSubScore,
  calculateGpuScore,
} from "@/benchmarks/gpu/scoring";
import {
  applyGpuCalibrationCompensation,
  calculateGpuProjectedOverallScore,
} from "@/benchmarks/shared/live-estimation";
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
  GpuAggregateScoreId,
  GpuBenchmarkResult,
  GpuComputeKernelId,
  GpuGraphicsKernelId,
  GpuKernelMetric,
  WebGpuAdapterSummary,
} from "@/lib/types";

type BatchStats = {
  workUnits: number;
  checksum: number;
};

type GpuHarness = {
  adapter: GPUAdapter;
  adapterInfo?: WebGpuAdapterSummary;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  device: GPUDevice;
  format: GPUTextureFormat;
  renderTarget: GPUTexture;
  timestampQuerySupported: boolean;
  renderUniformBuffer: GPUBuffer;
  computeUniformBuffer: GPUBuffer;
  matrixBuffers: {
    left: GPUBuffer;
    right: GPUBuffer;
    output: GPUBuffer;
  };
  convolutionBuffers: {
    input: GPUBuffer;
    output: GPUBuffer;
  };
  simulationBuffer: GPUBuffer;
  instancedPipeline: GPURenderPipeline;
  fullscreenPipeline: GPURenderPipeline;
  matrixPipeline: GPUComputePipeline;
  convolutionPipeline: GPUComputePipeline;
  simulationPipeline: GPUComputePipeline;
  renderBindGroup: GPUBindGroup;
  matrixBindGroup: GPUBindGroup;
  convolutionBindGroup: GPUBindGroup;
  simulationBindGroup: GPUBindGroup;
  cleanup: () => void;
};

const GRAPHICS_ORDER = Object.keys(GPU_GRAPHICS_LABELS) as GpuGraphicsKernelId[];
const COMPUTE_ORDER = Object.keys(GPU_COMPUTE_LABELS) as GpuComputeKernelId[];
const GPU_PROJECTION_PROBE_GRAPHICS = GRAPHICS_ORDER;
const GPU_PROJECTION_PROBE_COMPUTE = COMPUTE_ORDER;

export function supportsCommandEncoderTimestamps(
  encoder: GPUCommandEncoder,
) {
  return typeof (encoder as GPUCommandEncoder & { writeTimestamp?: unknown })
    .writeTimestamp === "function";
}

function createSeededState(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function createFloat32Data(length: number, seed: number) {
  const next = createSeededState(seed);
  const output = new Float32Array(length);

  for (let index = 0; index < output.length; index += 1) {
    output[index] = (next() / 0xffffffff) * 2 - 1;
  }

  return output;
}

function createVisibilityGuard(abortSignal?: AbortSignal) {
  let hidden = false;
  let aborted = false;

  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      hidden = true;
    }
  };

  const handleAbort = () => {
    aborted = true;
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (abortSignal) {
    abortSignal.addEventListener("abort", handleAbort);
    if (abortSignal.aborted) handleAbort();
  }

  return {
    assertVisible() {
      if (aborted) {
        throw new Error("The benchmark was stopped by the user.");
      }
      if (hidden || document.visibilityState !== "visible") {
        throw new Error(
          "The benchmark was aborted because the tab became hidden. Keep this tab visible for the full run.",
        );
      }
    },
    passed() {
      return !hidden && !aborted && document.visibilityState === "visible";
    },
    cleanup() {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (abortSignal) {
        abortSignal.removeEventListener("abort", handleAbort);
      }
    },
  };
}

async function createGpuHarness(
  width: number,
  height: number,
): Promise<GpuHarness> {
  const gpuNavigator = navigator as Navigator & { gpu?: GPU };

  if (!gpuNavigator.gpu) {
    throw new Error("WebGPU is not available in this browser.");
  }

  const adapter = await gpuNavigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });

  if (!adapter) {
    throw new Error("No high-performance WebGPU adapter was available.");
  }

  const adapterTimestampQuerySupported = adapter.features.has("timestamp-query");
  const device = await adapter.requestDevice({
    requiredFeatures: adapterTimestampQuerySupported ? ["timestamp-query"] : [],
  });
  const timestampProbeEncoder = device.createCommandEncoder();
  const timestampQuerySupported =
    adapterTimestampQuerySupported &&
    supportsCommandEncoderTimestamps(timestampProbeEncoder);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "fixed";
  canvas.style.pointerEvents = "none";
  canvas.style.opacity = "0";
  canvas.style.left = "-99999px";
  canvas.style.top = "0";
  document.body.appendChild(canvas);

  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;

  if (!context) {
    throw new Error("Failed to create a WebGPU canvas context.");
  }

  const format = gpuNavigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: "opaque",
  });
  const renderTarget = device.createTexture({
    size: [width, height, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const renderShader = device.createShaderModule({
    code: `
      struct RenderParams {
        time: f32,
        amplitude: f32,
        scale: f32,
        loops: f32,
      };

      @group(0) @binding(0)
      var<uniform> params: RenderParams;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) color: vec3f,
      };

      fn rotate(point: vec2f, angle: f32) -> vec2f {
        let c = cos(angle);
        let s = sin(angle);
        return vec2f(point.x * c - point.y * s, point.x * s + point.y * c);
      }

      @vertex
      fn instancedVs(
        @builtin(vertex_index) vertexIndex: u32,
        @builtin(instance_index) instanceIndex: u32,
      ) -> VertexOut {
        let base = array<vec2f, 3>(
          vec2f(-0.012, -0.018),
          vec2f(0.016, -0.002),
          vec2f(-0.004, 0.018),
        );
        let fi = f32(instanceIndex);
        let angle = fi * 0.024 + params.time * 0.35;
        let radius = 0.18 + fract(sin(fi * 12.9898) * 43758.5453) * 0.72;
        let center = vec2f(cos(angle), sin(angle)) * radius;
        let local = rotate(base[vertexIndex], angle) * (params.scale * (1.0 + fract(fi * 0.11) * params.amplitude));

        var out: VertexOut;
        out.position = vec4f(center + local, 0.0, 1.0);
        out.color = vec3f(
          0.45 + 0.35 * sin(angle),
          0.42 + 0.35 * cos(fi * 0.07 + params.time),
          0.55 + 0.25 * sin(fi * 0.021),
        );
        return out;
      }

      @vertex
      fn fullscreenVs(@builtin(vertex_index) vertexIndex: u32) -> VertexOut {
        var positions = array<vec2f, 3>(
          vec2f(-1.0, -3.0),
          vec2f(3.0, 1.0),
          vec2f(-1.0, 1.0),
        );
        var out: VertexOut;
        out.position = vec4f(positions[vertexIndex], 0.0, 1.0);
        out.color = vec3f(0.0, 0.0, 0.0);
        return out;
      }

      @fragment
      fn renderFs(input: VertexOut) -> @location(0) vec4f {
        var shade = 0.0;
        let loopCount = u32(max(params.loops, 1.0));
        let uv = input.position.xy * 0.0012;

        for (var i: u32 = 0u; i < loopCount; i = i + 1u) {
          let fi = f32(i);
          shade = shade + sin(uv.x * (1.0 + fi * 0.014) + params.time * 0.4) * cos(uv.y * (1.4 + fi * 0.021) - params.time * 0.25);
        }

        let tint = 0.5 + 0.5 * sin(shade * 0.07 + params.time);
        return vec4f(input.color * (0.55 + tint * 0.6), 1.0);
      }
    `,
  });

  const computeShader = device.createShaderModule({
    code: `
      struct ComputeParams {
        width: u32,
        height: u32,
        step: u32,
        pad: u32,
      };

      @group(0) @binding(0) var<storage, read> left: array<f32>;
      @group(0) @binding(1) var<storage, read> right: array<f32>;
      @group(0) @binding(2) var<storage, read_write> outputData: array<f32>;
      @group(0) @binding(3) var<uniform> params: ComputeParams;

      @compute @workgroup_size(8, 8, 1)
      fn matrixMain(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x >= params.width || id.y >= params.height) {
          return;
        }

        let row = id.y;
        let column = id.x;
        var sum = 0.0;

        for (var inner: u32 = 0u; inner < params.width; inner = inner + 1u) {
          sum = sum + left[row * params.width + inner] * right[inner * params.width + column];
        }

        outputData[row * params.width + column] = sum + f32(params.step) * 0.00001;
      }

      @compute @workgroup_size(8, 8, 1)
      fn convolutionMain(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x == 0u || id.y == 0u || id.x >= params.width - 1u || id.y >= params.height - 1u) {
          return;
        }

        let index = id.y * params.width + id.x;
        var total = 0.0;

        for (var offsetY: i32 = -1; offsetY <= 1; offsetY = offsetY + 1) {
          for (var offsetX: i32 = -1; offsetX <= 1; offsetX = offsetX + 1) {
            let sampleIndex = u32(i32(index) + offsetY * i32(params.width) + offsetX);
            total = total + left[sampleIndex];
          }
        }

        outputData[index] = total / 9.0 + f32(params.step) * 0.000001;
      }

      @compute @workgroup_size(64, 1, 1)
      fn simulationMain(@builtin(global_invocation_id) id: vec3<u32>) {
        if (id.x >= params.width) {
          return;
        }

        let base = id.x * 4u;
        let positionX = outputData[base + 0u];
        let positionY = outputData[base + 1u];
        let velocityX = outputData[base + 2u];
        let velocityY = outputData[base + 3u];
        let nextX = positionX + velocityX * 0.016;
        let nextY = positionY + velocityY * 0.016;
        outputData[base + 0u] = select(nextX, -nextX, abs(nextX) > 1.0);
        outputData[base + 1u] = select(nextY, -nextY, abs(nextY) > 1.0);
        outputData[base + 2u] = velocityX + sin(f32(id.x + params.step)) * 0.00003;
        outputData[base + 3u] = velocityY + cos(f32(id.x + params.step)) * 0.00003;
      }
    `,
  });

  const renderUniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const computeUniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ],
  });

  const instancedPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout],
    }),
    vertex: {
      module: renderShader,
      entryPoint: "instancedVs",
    },
    fragment: {
      module: renderShader,
      entryPoint: "renderFs",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const fullscreenPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout],
    }),
    vertex: {
      module: renderShader,
      entryPoint: "fullscreenVs",
    },
    fragment: {
      module: renderShader,
      entryPoint: "renderFs",
      targets: [{ format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const matrixPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    }),
    compute: {
      module: computeShader,
      entryPoint: "matrixMain",
    },
  });

  const convolutionPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    }),
    compute: {
      module: computeShader,
      entryPoint: "convolutionMain",
    },
  });

  const simulationPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    }),
    compute: {
      module: computeShader,
      entryPoint: "simulationMain",
    },
  });

  const maxMatrixSize = 192;
  const matrixLength = maxMatrixSize * maxMatrixSize;
  const matrixLeft = device.createBuffer({
    size: matrixLength * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const matrixRight = device.createBuffer({
    size: matrixLength * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const matrixOutput = device.createBuffer({
    size: matrixLength * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const maxConvolutionSize = 512 * 512;
  const convolutionInput = device.createBuffer({
    size: maxConvolutionSize * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const convolutionOutput = device.createBuffer({
    size: maxConvolutionSize * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const maxParticles = 65_536 * 4;
  const simulationBuffer = device.createBuffer({
    size: maxParticles * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  device.queue.writeBuffer(matrixLeft, 0, createFloat32Data(matrixLength, 19));
  device.queue.writeBuffer(matrixRight, 0, createFloat32Data(matrixLength, 37));
  device.queue.writeBuffer(
    convolutionInput,
    0,
    createFloat32Data(maxConvolutionSize, 59),
  );
  device.queue.writeBuffer(
    simulationBuffer,
    0,
    createFloat32Data(maxParticles, 83),
  );

  const renderBindGroup = device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: renderUniformBuffer },
      },
    ],
  });

  const matrixBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: matrixLeft } },
      { binding: 1, resource: { buffer: matrixRight } },
      { binding: 2, resource: { buffer: matrixOutput } },
      { binding: 3, resource: { buffer: computeUniformBuffer } },
    ],
  });

  const convolutionBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: convolutionInput } },
      { binding: 1, resource: { buffer: convolutionInput } },
      { binding: 2, resource: { buffer: convolutionOutput } },
      { binding: 3, resource: { buffer: computeUniformBuffer } },
    ],
  });

  const simulationBindGroup = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: simulationBuffer } },
      { binding: 1, resource: { buffer: simulationBuffer } },
      { binding: 2, resource: { buffer: simulationBuffer } },
      { binding: 3, resource: { buffer: computeUniformBuffer } },
    ],
  });

  const adapterInfo = (() => {
    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;

    if (!info) {
      return undefined;
    }

    return {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
    } satisfies WebGpuAdapterSummary;
  })();

  return {
    adapter,
    adapterInfo,
    canvas,
    context,
    device,
    format,
    renderTarget,
    timestampQuerySupported,
    renderUniformBuffer,
    computeUniformBuffer,
    matrixBuffers: {
      left: matrixLeft,
      right: matrixRight,
      output: matrixOutput,
    },
    convolutionBuffers: {
      input: convolutionInput,
      output: convolutionOutput,
    },
    simulationBuffer,
    instancedPipeline,
    fullscreenPipeline,
    matrixPipeline,
    convolutionPipeline,
    simulationPipeline,
    renderBindGroup,
    matrixBindGroup,
    convolutionBindGroup,
    simulationBindGroup,
    cleanup() {
      canvas.remove();
      renderTarget.destroy();
      matrixLeft.destroy();
      matrixRight.destroy();
      matrixOutput.destroy();
      convolutionInput.destroy();
      convolutionOutput.destroy();
      simulationBuffer.destroy();
      renderUniformBuffer.destroy();
      computeUniformBuffer.destroy();
      device.destroy();
    },
  };
}

function writeRenderUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  params: {
    time: number;
    amplitude: number;
    scale: number;
    loops: number;
  },
) {
  const values = new Float32Array([
    params.time,
    params.amplitude,
    params.scale,
    params.loops,
  ]);
  device.queue.writeBuffer(buffer, 0, values);
}

function writeComputeUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  params: {
    width: number;
    height: number;
    step: number;
  },
) {
  const values = new Uint32Array([params.width, params.height, params.step, 0]);
  device.queue.writeBuffer(buffer, 0, values);
}

async function sampleGpuTimestamp(
  harness: GpuHarness,
  encode: (encoder: GPUCommandEncoder) => BatchStats,
) {
  if (!harness.timestampQuerySupported) {
    return { durationMs: null, stats: null };
  }

  const querySet = harness.device.createQuerySet({
    type: "timestamp",
    count: 2,
  });
  const resolveBuffer = harness.device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });
  const readBuffer = harness.device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = harness.device.createCommandEncoder();
  encoder.writeTimestamp(querySet, 0);
  const stats = encode(encoder);
  encoder.writeTimestamp(querySet, 1);
  encoder.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0);
  encoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 16);
  harness.device.queue.submit([encoder.finish()]);
  await harness.device.queue.onSubmittedWorkDone();
  await readBuffer.mapAsync(GPUMapMode.READ);
  const timestamps = new BigUint64Array(readBuffer.getMappedRange());
  const durationNs =
    timestamps[1] > timestamps[0] ? Number(timestamps[1] - timestamps[0]) : 0;

  readBuffer.unmap();
  resolveBuffer.destroy();
  readBuffer.destroy();

  return {
    durationMs: durationNs > 0 ? durationNs / 1_000_000 : null,
    stats,
  };
}

async function submitBatch(
  harness: GpuHarness,
  encode: (encoder: GPUCommandEncoder) => BatchStats,
) {
  const encoder = harness.device.createCommandEncoder();
  const stats = encode(encoder);
  harness.device.queue.submit([encoder.finish()]);
  await harness.device.queue.onSubmittedWorkDone();

  return stats;
}

function buildInstancedBatch(
  harness: GpuHarness,
  params: {
    time: number;
    amplitude: number;
    scale: number;
    loops: number;
    instanceCount: number;
    clearColor: GPUColor;
    passes?: number;
  },
) {
  return (encoder: GPUCommandEncoder): BatchStats => {
    writeRenderUniforms(harness.device, harness.renderUniformBuffer, params);
    const view = harness.renderTarget.createView();

    for (let passIndex = 0; passIndex < (params.passes ?? 1); passIndex += 1) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: params.clearColor,
            loadOp: passIndex === 0 ? "clear" : "load",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(harness.instancedPipeline);
      pass.setBindGroup(0, harness.renderBindGroup);
      pass.draw(3, params.instanceCount);
      pass.end();
    }

    return {
      workUnits:
        params.instanceCount *
        Math.max(params.loops, 1) *
        3 *
        (params.passes ?? 1),
      checksum: Math.floor(params.time * 1000) ^ params.instanceCount,
    };
  };
}

function buildFullscreenBatch(
  harness: GpuHarness,
  params: {
    time: number;
    amplitude: number;
    scale: number;
    loops: number;
    clearColor: GPUColor;
    passes?: number;
  },
) {
  return (encoder: GPUCommandEncoder): BatchStats => {
    writeRenderUniforms(harness.device, harness.renderUniformBuffer, params);
    const view = harness.renderTarget.createView();

    for (let passIndex = 0; passIndex < (params.passes ?? 1); passIndex += 1) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: params.clearColor,
            loadOp: passIndex === 0 ? "clear" : "load",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(harness.fullscreenPipeline);
      pass.setBindGroup(0, harness.renderBindGroup);
      pass.draw(3);
      pass.end();
    }

    return {
      workUnits:
        harness.canvas.width *
        harness.canvas.height *
        Math.max(params.loops, 1) *
        (params.passes ?? 1),
      checksum: Math.floor(params.time * 1000) ^ Math.floor(params.loops * 17),
    };
  };
}

function buildMatrixBatch(
  harness: GpuHarness,
  matrixSize: number,
  step: number,
  dispatchRepeats = 1,
) {
  return (encoder: GPUCommandEncoder): BatchStats => {
    writeComputeUniforms(harness.device, harness.computeUniformBuffer, {
      width: matrixSize,
      height: matrixSize,
      step,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(harness.matrixPipeline);
    pass.setBindGroup(0, harness.matrixBindGroup);
    for (let repeat = 0; repeat < dispatchRepeats; repeat += 1) {
      pass.dispatchWorkgroups(Math.ceil(matrixSize / 8), Math.ceil(matrixSize / 8));
    }
    pass.end();

    return {
      workUnits: matrixSize * matrixSize * matrixSize * 2 * dispatchRepeats,
      checksum: matrixSize ^ step,
    };
  };
}

function buildConvolutionBatch(
  harness: GpuHarness,
  size: number,
  step: number,
  dispatchRepeats = 1,
) {
  return (encoder: GPUCommandEncoder): BatchStats => {
    writeComputeUniforms(harness.device, harness.computeUniformBuffer, {
      width: size,
      height: size,
      step,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(harness.convolutionPipeline);
    pass.setBindGroup(0, harness.convolutionBindGroup);
    for (let repeat = 0; repeat < dispatchRepeats; repeat += 1) {
      pass.dispatchWorkgroups(Math.ceil(size / 8), Math.ceil(size / 8));
    }
    pass.end();

    return {
      workUnits: size * size * 9 * dispatchRepeats,
      checksum: size ^ (step * 3),
    };
  };
}

function buildSimulationBatch(
  harness: GpuHarness,
  particleCount: number,
  step: number,
  dispatchRepeats = 1,
) {
  return (encoder: GPUCommandEncoder): BatchStats => {
    writeComputeUniforms(harness.device, harness.computeUniformBuffer, {
      width: particleCount,
      height: 1,
      step,
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(harness.simulationPipeline);
    pass.setBindGroup(0, harness.simulationBindGroup);
    for (let repeat = 0; repeat < dispatchRepeats; repeat += 1) {
      pass.dispatchWorkgroups(Math.ceil(particleCount / 64));
    }
    pass.end();

    return {
      workUnits: particleCount * 16 * dispatchRepeats,
      checksum: particleCount ^ (step * 5),
    };
  };
}

async function runFixedTimeStage({
  harness,
  durationMs,
  buildBatch,
  visibilityGuard,
  onTick,
}: {
  harness: GpuHarness;
  durationMs: number;
  buildBatch: (iteration: number) => (encoder: GPUCommandEncoder) => BatchStats;
  visibilityGuard: ReturnType<typeof createVisibilityGuard>;
  onTick?: (snapshot: {
    throughput: number;
    iterations: number;
    durationMs: number;
    checksum: number;
  }) => void;
}) {
  const stageStartedAt = performance.now();
  let iterations = 0;
  let checksum = 0;
  let workUnits = 0;
  let timestampQueryUsed = false;
  let lastTickAt = stageStartedAt;

  if (harness.timestampQuerySupported) {
    const sample = await sampleGpuTimestamp(harness, buildBatch(iterations));

    if (sample.stats) {
      workUnits += sample.stats.workUnits;
      checksum = (checksum + sample.stats.checksum) >>> 0;
      iterations += 1;
      timestampQueryUsed = sample.durationMs !== null;
      onTick?.({
        throughput: roundMetric(workUnits / Math.max(0.001, (performance.now() - stageStartedAt) / 1000)),
        iterations,
        durationMs: roundMetric(performance.now() - stageStartedAt),
        checksum,
      });
    }
  }

  while (performance.now() - stageStartedAt < durationMs) {
    visibilityGuard.assertVisible();
    const stats = await submitBatch(harness, buildBatch(iterations));
    workUnits += stats.workUnits;
    checksum = (checksum + stats.checksum) >>> 0;
    iterations += 1;

    const now = performance.now();

    if (now - lastTickAt >= 250) {
      lastTickAt = now;
      onTick?.({
        throughput: roundMetric(workUnits / Math.max(0.001, (now - stageStartedAt) / 1000)),
        iterations,
        durationMs: roundMetric(now - stageStartedAt),
        checksum,
      });
    }
  }

  const elapsed = Math.max(1, performance.now() - stageStartedAt);

  return {
    throughput: roundMetric(workUnits / (elapsed / 1000)),
    iterations,
    durationMs: roundMetric(elapsed),
    checksum,
    timestampQueryUsed,
  };
}

function createGpuKernelMetric(
  id: GpuGraphicsKernelId | GpuComputeKernelId | "mixedLoad",
  label: string,
  result: Awaited<ReturnType<typeof runFixedTimeStage>>,
  notes: string,
): GpuKernelMetric {
  return {
    id,
    label,
    throughput: result.throughput,
    iterations: result.iterations,
    durationMs: result.durationMs,
    unit: "work units/s",
    timestampQueryUsed: result.timestampQueryUsed,
    notes,
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function blendProjectionScores(
  baselineScore: number,
  observedScore: number,
  trust: number,
) {
  const normalizedTrust = clamp(trust, 0, 1);

  return Math.round(
    baselineScore + (observedScore - baselineScore) * normalizedTrust,
  );
}

function stabilizeCalibratedProjection(
  calibrationScore: number,
  observedScore: number | null,
  trust: number,
  minimumRatio = 0.82,
) {
  if (observedScore === null) {
    return calibrationScore;
  }

  return Math.max(
    Math.round(calibrationScore * minimumRatio),
    blendProjectionScores(calibrationScore, observedScore, trust),
  );
}

function estimateGpuAggregateScore<TKernelId extends GpuGraphicsKernelId | GpuComputeKernelId>(
  id: GpuAggregateScoreId,
  label: string,
  metrics: Partial<Record<TKernelId, GpuKernelMetric>>,
  referenceThroughputs: Record<TKernelId, number>,
) {
  const kernels = Object.keys(referenceThroughputs)
    .filter((kernel) => Boolean(metrics[kernel as TKernelId]))
    .map((kernel) => {
      const typedKernel = kernel as TKernelId;
      const metric = metrics[typedKernel]!;

      return {
        id: typedKernel,
        throughput: metric.throughput,
        referenceThroughput: referenceThroughputs[typedKernel],
        durationMs: metric.durationMs,
        notes: metric.notes,
      };
    });

  if (kernels.length === 0) {
    return null;
  }

  return calculateGpuAggregateSubScore({
    id,
    label,
    kernels,
  }).score;
}

function getGpuKernelCoverage<TKernelId extends GpuGraphicsKernelId | GpuComputeKernelId>(
  metrics: Partial<Record<TKernelId, GpuKernelMetric>>,
  referenceThroughputs: Record<TKernelId, number>,
) {
  const kernels = Object.keys(referenceThroughputs) as TKernelId[];

  return kernels.filter((kernel) => Boolean(metrics[kernel])).length / kernels.length;
}

function getGpuProjectionProbeScore({
  graphicsMetrics,
  computeMetrics,
  config,
}: {
  graphicsMetrics: Partial<Record<GpuGraphicsKernelId, GpuKernelMetric>>;
  computeMetrics: Partial<Record<GpuComputeKernelId, GpuKernelMetric>>;
  config: ReturnType<typeof getGpuPreset>;
}) {
  const graphicsCoverage = getGpuKernelCoverage(
    graphicsMetrics,
    config.referenceThroughputs.graphics,
  );
  const computeCoverage = getGpuKernelCoverage(
    computeMetrics,
    config.referenceThroughputs.compute,
  );

  if (graphicsCoverage < 1 || computeCoverage < 1) {
    return null;
  }

  const graphicsScore = estimateGpuAggregateScore(
    "graphics",
    "Graphics",
    graphicsMetrics,
    config.referenceThroughputs.graphics,
  );
  const computeScore = estimateGpuAggregateScore(
    "compute",
    "Compute",
    computeMetrics,
    config.referenceThroughputs.compute,
  );

  const projectedScore = calculateGpuProjectedOverallScore({
    graphicsScore,
    computeScore,
  });

  return projectedScore === null
    ? null
    : applyGpuCalibrationCompensation(projectedScore, config.name);
}

function createGraphicsBatchBuilder(
  harness: GpuHarness,
  config: ReturnType<typeof getGpuPreset>,
  kernel: GpuGraphicsKernelId,
) {
  return (iteration: number) => {
    switch (kernel) {
      case "rasterScene":
        return buildInstancedBatch(harness, {
          time: iteration * 0.013,
          amplitude: 0.55,
          scale: 0.55,
          loops: 6,
          passes: 30,
          instanceCount: config.renderBatch.rasterInstances,
          clearColor: { r: 0.03, g: 0.04, b: 0.06, a: 1 },
        });
      case "shadingScene":
        return buildFullscreenBatch(harness, {
          time: iteration * 0.019,
          amplitude: 0.7,
          scale: 0.02,
          loops: config.renderBatch.shadingLoops,
          passes: 40,
          clearColor: { r: 0.02, g: 0.02, b: 0.03, a: 1 },
        });
      case "instancingScene":
        return buildInstancedBatch(harness, {
          time: iteration * 0.017,
          amplitude: 0.95,
          scale: 0.75,
          loops: 10,
          passes: 30,
          instanceCount: config.renderBatch.instancingInstances,
          clearColor: { r: 0.02, g: 0.03, b: 0.04, a: 1 },
        });
      case "particleScene":
        return (encoder: GPUCommandEncoder) => {
          const computeStats = buildSimulationBatch(
            harness,
            config.computeBatch.simulationParticles,
            iteration,
            30,
          )(encoder);
          const renderStats = buildInstancedBatch(harness, {
            time: iteration * 0.021,
            amplitude: 1.2,
            scale: 0.35,
            loops: 8,
            passes: 20,
            instanceCount: config.renderBatch.particleInstances,
            clearColor: { r: 0.015, g: 0.02, b: 0.03, a: 1 },
          })(encoder);

          return {
            workUnits: computeStats.workUnits + renderStats.workUnits,
            checksum: computeStats.checksum ^ renderStats.checksum,
          };
        };
      case "postProcessScene":
        return buildFullscreenBatch(harness, {
          time: iteration * 0.025,
          amplitude: 0.8,
          scale: 0.012,
          loops: config.renderBatch.postProcessLoops,
          passes: 40,
          clearColor: { r: 0.01, g: 0.015, b: 0.02, a: 1 },
        });
      default:
        throw new Error(`Unsupported graphics kernel: ${kernel}`);
    }
  };
}

function createComputeBatchBuilder(
  harness: GpuHarness,
  config: ReturnType<typeof getGpuPreset>,
  kernel: GpuComputeKernelId,
) {
  return (iteration: number) => {
    switch (kernel) {
      case "matrixCompute":
        return buildMatrixBatch(
          harness,
          config.computeBatch.matrixSize,
          iteration,
          40,
        );
      case "convolutionCompute":
        return buildConvolutionBatch(
          harness,
          config.computeBatch.convolutionSize,
          iteration,
          30,
        );
      case "simulationCompute":
        return buildSimulationBatch(
          harness,
          config.computeBatch.simulationParticles,
          iteration,
          50,
        );
      default:
        throw new Error(`Unsupported compute kernel: ${kernel}`);
    }
  };
}

function buildGpuLiveScores({
  activeStage,
  graphicsScore,
  computeScore,
  sustainedScore,
}: {
  activeStage: "warmup" | "graphics" | "compute" | "sustained" | "persisting";
  graphicsScore: number | null;
  computeScore: number | null;
  sustainedScore: number | null;
}): BenchmarkLiveScore[] {
  return [
    {
      id: "graphics",
      label: "Graphics live",
      score: graphicsScore,
      status:
        activeStage === "graphics"
          ? "live"
          : graphicsScore !== null
            ? "complete"
            : "pending",
    },
    {
      id: "compute",
      label: "Compute live",
      score: computeScore,
      status:
        activeStage === "compute"
          ? "live"
          : computeScore !== null
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

function buildGpuActivityEntries({
  activeStage,
  activeKernel,
  throughputRatio,
  config,
}: {
  activeStage: "warmup" | "graphics" | "compute" | "sustained" | "persisting";
  activeKernel: GpuGraphicsKernelId | GpuComputeKernelId | "mixedLoad" | null;
  throughputRatio: number;
  config: ReturnType<typeof getGpuPreset>;
}): BenchmarkActivityEntry[] {
  const normalizedThroughput = Math.max(0.08, Math.min(1, throughputRatio));

  if (activeStage === "graphics" && activeKernel) {
    const renderPresets: Record<
      GpuGraphicsKernelId,
      { passes: number; loops: number; instances: number }
    > = {
      rasterScene: {
        passes: 30,
        loops: 6,
        instances: config.renderBatch.rasterInstances,
      },
      shadingScene: {
        passes: 40,
        loops: config.renderBatch.shadingLoops,
        instances: 1,
      },
      instancingScene: {
        passes: 30,
        loops: 10,
        instances: config.renderBatch.instancingInstances,
      },
      particleScene: {
        passes: 20,
        loops: 8,
        instances: config.renderBatch.particleInstances,
      },
      postProcessScene: {
        passes: 40,
        loops: config.renderBatch.postProcessLoops,
        instances: 1,
      },
    };
    const preset = renderPresets[activeKernel as GpuGraphicsKernelId];

    return [
      {
        id: "render-passes",
        label: "Render passes",
        detail: `${preset.passes} passes per submission`,
        value: preset.passes,
        normalized: preset.passes / 40,
      },
      {
        id: "shader-pressure",
        label: "Shader pressure",
        detail: `${preset.loops.toLocaleString()} loop bodies`,
        value: preset.loops,
        normalized: Math.max(
          0.08,
          preset.loops /
          Math.max(config.renderBatch.shadingLoops, config.renderBatch.postProcessLoops),
        ),
      },
      {
        id: "scene-throughput",
        label: "Scene throughput",
        detail: `${formatThroughput(throughputRatio * config.referenceThroughputs.graphics[activeKernel as GpuGraphicsKernelId])}`,
        value: throughputRatio,
        normalized: normalizedThroughput,
      },
    ];
  }

  if (activeStage === "compute" && activeKernel) {
    const computePresets: Record<
      GpuComputeKernelId,
      { dispatches: number; dataset: number; label: string }
    > = {
      matrixCompute: {
        dispatches: 40,
        dataset: config.computeBatch.matrixSize,
        label: `${config.computeBatch.matrixSize}x${config.computeBatch.matrixSize} matrix tiles`,
      },
      convolutionCompute: {
        dispatches: 30,
        dataset: config.computeBatch.convolutionSize,
        label: `${config.computeBatch.convolutionSize}px convolution grid`,
      },
      simulationCompute: {
        dispatches: 50,
        dataset: config.computeBatch.simulationParticles,
        label: `${config.computeBatch.simulationParticles.toLocaleString()} particle bodies`,
      },
    };
    const preset = computePresets[activeKernel as GpuComputeKernelId];

    return [
      {
        id: "dispatch-pressure",
        label: "Dispatch pressure",
        detail: `${preset.dispatches} dispatch repeats`,
        value: preset.dispatches,
        normalized: preset.dispatches / 50,
      },
      {
        id: "dataset-size",
        label: "Dataset size",
        detail: preset.label,
        value: preset.dataset,
        normalized:
          preset.dataset /
          Math.max(
            config.computeBatch.matrixSize,
            config.computeBatch.convolutionSize,
            config.computeBatch.simulationParticles,
          ),
      },
      {
        id: "compute-throughput",
        label: "Compute throughput",
        detail: `${formatThroughput(throughputRatio * config.referenceThroughputs.compute[activeKernel as GpuComputeKernelId])}`,
        value: throughputRatio,
        normalized: normalizedThroughput,
      },
    ];
  }

  if (activeStage === "sustained") {
    return [
      {
        id: "render-pressure",
        label: "Render pressure",
        detail: "Instancing + fullscreen passes kept live",
        value: 0.88,
        normalized: 0.88,
      },
      {
        id: "compute-pressure",
        label: "Compute pressure",
        detail: "Simulation dispatches feeding the mixed loop",
        value: 0.9,
        normalized: 0.9,
      },
      {
        id: "mixed-throughput",
        label: "Mixed throughput",
        detail: `${formatThroughput(throughputRatio * config.referenceThroughputs.sustained)}`,
        value: throughputRatio,
        normalized: normalizedThroughput,
      },
    ];
  }

  return [
    {
      id: "pipeline-setup",
      label: "Pipeline setup",
      detail: "Compiling shaders and filling GPU buffers",
      value: 0.55,
      normalized: 0.55,
    },
    {
      id: "queue-priming",
      label: "Queue priming",
      detail: "Priming render and compute submission paths",
      value: 0.48,
      normalized: 0.48,
    },
    {
      id: "adapter-sync",
      label: "Adapter sync",
      detail: "Stabilizing timestamp and queue sampling",
      value: 0.42,
      normalized: 0.42,
    },
  ];
}

function createMockGpuResult(
  preset: ReturnType<typeof getGpuPreset>,
): GpuBenchmarkResult {
  const totalDurationMs =
    preset.warmupDurationMs +
    preset.graphicsSceneDurationMs * GRAPHICS_ORDER.length +
    preset.computeSceneDurationMs * COMPUTE_ORDER.length +
    preset.sustainedDurationMs;
  const startedAt = Date.now();
  const graphicsRatio = 0.93;
  const computeRatio = 0.89;
  const sustainedRatio = 0.85;
  const graphicsStageMetrics = {
    rasterScene: createGpuKernelMetric(
      "rasterScene",
      GPU_GRAPHICS_LABELS.rasterScene,
      {
        throughput: preset.referenceThroughputs.graphics.rasterScene * graphicsRatio,
        iterations: 3,
        durationMs: preset.graphicsSceneDurationMs,
        checksum: 1,
        timestampQueryUsed: false,
      },
      "Mock raster batch.",
    ),
    shadingScene: createGpuKernelMetric(
      "shadingScene",
      GPU_GRAPHICS_LABELS.shadingScene,
      {
        throughput: preset.referenceThroughputs.graphics.shadingScene * graphicsRatio,
        iterations: 3,
        durationMs: preset.graphicsSceneDurationMs,
        checksum: 2,
        timestampQueryUsed: false,
      },
      "Mock shading batch.",
    ),
    instancingScene: createGpuKernelMetric(
      "instancingScene",
      GPU_GRAPHICS_LABELS.instancingScene,
      {
        throughput: preset.referenceThroughputs.graphics.instancingScene * graphicsRatio,
        iterations: 3,
        durationMs: preset.graphicsSceneDurationMs,
        checksum: 3,
        timestampQueryUsed: false,
      },
      "Mock instancing batch.",
    ),
    particleScene: createGpuKernelMetric(
      "particleScene",
      GPU_GRAPHICS_LABELS.particleScene,
      {
        throughput: preset.referenceThroughputs.graphics.particleScene * graphicsRatio,
        iterations: 3,
        durationMs: preset.graphicsSceneDurationMs,
        checksum: 4,
        timestampQueryUsed: false,
      },
      "Mock particle batch.",
    ),
    postProcessScene: createGpuKernelMetric(
      "postProcessScene",
      GPU_GRAPHICS_LABELS.postProcessScene,
      {
        throughput: preset.referenceThroughputs.graphics.postProcessScene * graphicsRatio,
        iterations: 3,
        durationMs: preset.graphicsSceneDurationMs,
        checksum: 5,
        timestampQueryUsed: false,
      },
      "Mock post-process batch.",
    ),
  } satisfies Record<GpuGraphicsKernelId, GpuKernelMetric>;
  const computeStageMetrics = {
    matrixCompute: createGpuKernelMetric(
      "matrixCompute",
      GPU_COMPUTE_LABELS.matrixCompute,
      {
        throughput: preset.referenceThroughputs.compute.matrixCompute * computeRatio,
        iterations: 3,
        durationMs: preset.computeSceneDurationMs,
        checksum: 6,
        timestampQueryUsed: false,
      },
      "Mock matrix compute batch.",
    ),
    convolutionCompute: createGpuKernelMetric(
      "convolutionCompute",
      GPU_COMPUTE_LABELS.convolutionCompute,
      {
        throughput:
          preset.referenceThroughputs.compute.convolutionCompute * computeRatio,
        iterations: 3,
        durationMs: preset.computeSceneDurationMs,
        checksum: 7,
        timestampQueryUsed: false,
      },
      "Mock convolution batch.",
    ),
    simulationCompute: createGpuKernelMetric(
      "simulationCompute",
      GPU_COMPUTE_LABELS.simulationCompute,
      {
        throughput:
          preset.referenceThroughputs.compute.simulationCompute * computeRatio,
        iterations: 3,
        durationMs: preset.computeSceneDurationMs,
        checksum: 8,
        timestampQueryUsed: false,
      },
      "Mock simulation batch.",
    ),
  } satisfies Record<GpuComputeKernelId, GpuKernelMetric>;
  const sustainedStageMetric = createGpuKernelMetric(
    "mixedLoad",
    "Mixed sustained load",
    {
      throughput: preset.referenceThroughputs.sustained * sustainedRatio,
      iterations: 4,
      durationMs: preset.sustainedDurationMs,
      checksum: 9,
      timestampQueryUsed: false,
    },
    "Mock mixed load batch.",
  );
  const subScores = {
    graphics: calculateGpuAggregateSubScore({
      id: "graphics",
      label: "Graphics",
      kernels: GRAPHICS_ORDER.map((kernel) => ({
        id: kernel,
        throughput: graphicsStageMetrics[kernel].throughput,
        referenceThroughput: preset.referenceThroughputs.graphics[kernel],
        durationMs: graphicsStageMetrics[kernel].durationMs,
        notes: "Mock GPU graphics suite used for internal smoke testing only.",
      })),
    }),
    compute: calculateGpuAggregateSubScore({
      id: "compute",
      label: "Compute",
      kernels: COMPUTE_ORDER.map((kernel) => ({
        id: kernel,
        throughput: computeStageMetrics[kernel].throughput,
        referenceThroughput: preset.referenceThroughputs.compute[kernel],
        durationMs: computeStageMetrics[kernel].durationMs,
        notes: "Mock GPU compute suite used for internal smoke testing only.",
      })),
    }),
    sustained: calculateGpuAggregateSubScore({
      id: "sustained",
      label: "Sustained",
      kernels: [
        {
          id: "mixedLoad",
          throughput: sustainedStageMetric.throughput,
          referenceThroughput: preset.referenceThroughputs.sustained,
          durationMs: sustainedStageMetric.durationMs,
          notes: "Mock sustained GPU load used for internal smoke testing only.",
        },
      ],
    }),
  } satisfies Record<GpuAggregateScoreId, ReturnType<typeof calculateGpuAggregateSubScore>>;
  const { gpuScore, rating } = calculateGpuScore(subScores);
  const graphicsScore = subScores.graphics.score;
  const computeScore = subScores.compute.score;
  const sustainedScore = subScores.sustained.score;

  return {
    benchmarkKind: "gpu",
    headlineScore: gpuScore,
    gpuScore,
    rating,
    graphicsScore,
    computeScore,
    sustainedScore,
    subScores,
    rawMetrics: {
      preset: preset.name,
      startedAt,
      endedAt: startedAt + totalDurationMs,
      totalDurationMs,
      warmupDurationMs: preset.warmupDurationMs,
      graphicsDurationMs: preset.graphicsSceneDurationMs * GRAPHICS_ORDER.length,
      computeDurationMs: preset.computeSceneDurationMs * COMPUTE_ORDER.length,
      sustainedDurationMs: preset.sustainedDurationMs,
      checksum: 424242,
      visibilityGuardPassed: true,
      timestampQuerySupported: false,
      timestampQueryUsed: false,
      adapterName: "Mock WebGPU Adapter",
      stageMetrics: {
        graphics: graphicsStageMetrics,
        compute: computeStageMetrics,
        sustained: {
          mixedLoad: sustainedStageMetric,
        },
      },
    },
    benchmarkVersion: BENCHMARK_VERSION,
  };
}

export async function runGpuBenchmark({
  preset = "full",
  onProgress,
  mock = false,
  abortSignal,
}: {
  preset?: BenchmarkPreset;
  onProgress?: (update: BenchmarkProgressUpdate) => void;
  mock?: boolean;
  abortSignal?: AbortSignal;
}): Promise<GpuBenchmarkResult> {
  const resolvedPreset = resolveBenchmarkPreset(preset);
  const config = getGpuPreset(resolvedPreset);

  if (mock) {
    onProgress?.({
      label: "GPU smoke mock",
      message: "Using the internal mock GPU benchmark path for automated verification.",
      step: 1,
      totalSteps: 1,
      progress: 100,
    });

    return createMockGpuResult(config);
  }

  const visibilityGuard = createVisibilityGuard(abortSignal);
  const harness = await createGpuHarness(config.renderWidth, config.renderHeight);
  const startedAt = Date.now();
  const totalSteps = 1 + GRAPHICS_ORDER.length + COMPUTE_ORDER.length + 1;
  const graphicsMetrics = {} as Record<GpuGraphicsKernelId, GpuKernelMetric>;
  const computeMetrics = {} as Record<GpuComputeKernelId, GpuKernelMetric>;
  const projectionGraphicsProbeMetrics =
    {} as Partial<Record<GpuGraphicsKernelId, GpuKernelMetric>>;
  const projectionComputeProbeMetrics =
    {} as Partial<Record<GpuComputeKernelId, GpuKernelMetric>>;
  let sustainedMetric: GpuKernelMetric | null = null;
  const overallStart = performance.now();
  let activeStage: "warmup" | "graphics" | "compute" | "sustained" | "persisting" =
    "warmup";
  let activeKernel: GpuGraphicsKernelId | GpuComputeKernelId | "mixedLoad" | null =
    null;
  let activeLabel = "GPU warmup";
  let activeMessage =
    "Configuring pipelines, buffers, and shader caches on the selected adapter.";
  let activeStep = 1;
  let activeProgress = 5;
  let liveSnapshot: {
    throughput: number;
    iterations: number;
    durationMs: number;
    checksum: number;
  } | null = null;

  const emitGpuTelemetry = () => {
    const activeMetric =
      !liveSnapshot || activeStage === "warmup" || !activeKernel
        ? null
        : createGpuKernelMetric(
          activeKernel,
          activeKernel === "mixedLoad"
            ? "Mixed sustained load"
            : activeKernel in GPU_GRAPHICS_LABELS
              ? GPU_GRAPHICS_LABELS[activeKernel as GpuGraphicsKernelId]
              : GPU_COMPUTE_LABELS[activeKernel as GpuComputeKernelId],
          {
            ...liveSnapshot,
            timestampQueryUsed: false,
          },
          activeMessage,
        );
    const liveGraphicsScore = estimateGpuAggregateScore(
      "graphics",
      "Graphics",
      activeStage === "graphics" && activeMetric
        ? {
          ...graphicsMetrics,
          [activeKernel as GpuGraphicsKernelId]: activeMetric,
        }
        : graphicsMetrics,
      config.referenceThroughputs.graphics,
    );
    const liveComputeScore = estimateGpuAggregateScore(
      "compute",
      "Compute",
      activeStage === "compute" && activeMetric
        ? {
          ...computeMetrics,
          [activeKernel as GpuComputeKernelId]: activeMetric,
        }
        : computeMetrics,
      config.referenceThroughputs.compute,
    );
    const liveSustainedScore =
      activeStage === "sustained" && activeMetric
        ? calculateGpuAggregateSubScore({
          id: "sustained",
          label: "Sustained",
          kernels: [
            {
              id: "mixedLoad",
              throughput: activeMetric.throughput,
              referenceThroughput: config.referenceThroughputs.sustained,
              durationMs: activeMetric.durationMs,
              notes: activeMetric.notes,
            },
          ],
        }).score
        : sustainedMetric
          ? calculateGpuAggregateSubScore({
            id: "sustained",
            label: "Sustained",
            kernels: [
              {
                id: "mixedLoad",
                throughput: sustainedMetric.throughput,
                referenceThroughput: config.referenceThroughputs.sustained,
                durationMs: sustainedMetric.durationMs,
                notes: sustainedMetric.notes,
              },
            ],
          }).score
          : null;
    const projectedScore = calculateGpuProjectedOverallScore({
      graphicsScore: liveGraphicsScore,
      computeScore: liveComputeScore,
    });
    const calibrationProjectedScore = getGpuProjectionProbeScore({
      graphicsMetrics: projectionGraphicsProbeMetrics,
      computeMetrics: projectionComputeProbeMetrics,
      config,
    });
    const combinedCoverage = clamp(
      (
        getGpuKernelCoverage(
          activeStage === "graphics" && activeMetric
            ? {
              ...graphicsMetrics,
              [activeKernel as GpuGraphicsKernelId]: activeMetric,
            }
            : graphicsMetrics,
          config.referenceThroughputs.graphics,
        ) * 0.45 +
        getGpuKernelCoverage(
          activeStage === "compute" && activeMetric
            ? {
              ...computeMetrics,
              [activeKernel as GpuComputeKernelId]: activeMetric,
            }
            : computeMetrics,
          config.referenceThroughputs.compute,
        ) * 0.4
      ) / 0.85,
      0,
      1,
    );
    const stabilizedProjectedScore =
      calibrationProjectedScore === null
        ? projectedScore
        : activeStage === "warmup"
          ? calibrationProjectedScore
          : activeStage === "graphics" || activeStage === "compute"
            ? stabilizeCalibratedProjection(
              calibrationProjectedScore,
              projectedScore,
              0.24 + Math.pow(combinedCoverage, 1.18) * 0.68,
              0.95,
            )
            : projectedScore === null
              ? calibrationProjectedScore
              : activeStage === "persisting"
                ? projectedScore
                : stabilizeCalibratedProjection(
                  calibrationProjectedScore,
                  projectedScore,
                  0.88,
                  0.97,
                );
    const throughputRatio =
      activeStage === "graphics" && activeMetric && activeKernel
        ? activeMetric.throughput /
        config.referenceThroughputs.graphics[activeKernel as GpuGraphicsKernelId]
        : activeStage === "compute" && activeMetric && activeKernel
          ? activeMetric.throughput /
          config.referenceThroughputs.compute[activeKernel as GpuComputeKernelId]
          : activeStage === "sustained" && activeMetric
            ? activeMetric.throughput / config.referenceThroughputs.sustained
            : 0;
    const metrics: BenchmarkTelemetryMetric[] = [
      {
        label: "Active stage",
        value:
          activeStage === "warmup"
            ? "Adapter + pipeline warmup"
            : activeKernel === "mixedLoad"
              ? "Mixed sustained load"
              : activeKernel && activeKernel in GPU_GRAPHICS_LABELS
                ? GPU_GRAPHICS_LABELS[activeKernel as GpuGraphicsKernelId]
                : activeKernel
                  ? GPU_COMPUTE_LABELS[activeKernel as GpuComputeKernelId]
                  : activeLabel,
      },
      {
        label: "Throughput",
        value: liveSnapshot ? formatThroughput(liveSnapshot.throughput) : "Waiting for telemetry",
      },
      {
        label: "Batches",
        value: String(liveSnapshot?.iterations ?? 0),
      },
      {
        label: "Elapsed",
        value: `${roundMetric((liveSnapshot?.durationMs ?? 0) / 1000, 1)}s`,
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
        liveScores: buildGpuLiveScores({
          activeStage,
          graphicsScore: liveGraphicsScore,
          computeScore: liveComputeScore,
          sustainedScore: liveSustainedScore,
        }),
        metrics,
        activity: buildGpuActivityEntries({
          activeStage,
          activeKernel,
          throughputRatio,
          config,
        }),
        projection: {
          projectedScore: stabilizedProjectedScore,
        },
      },
    });
  };

  const setActiveGpuStage = ({
    stage,
    label,
    message,
    step,
    progress,
    kernel = null,
  }: {
    stage: "warmup" | "graphics" | "compute" | "sustained" | "persisting";
    label: string;
    message: string;
    step: number;
    progress: number;
    kernel?: GpuGraphicsKernelId | GpuComputeKernelId | "mixedLoad" | null;
  }) => {
    activeStage = stage;
    activeKernel = kernel;
    activeLabel = label;
    activeMessage = message;
    activeStep = step;
    activeProgress = progress;
    liveSnapshot = null;
    emitGpuTelemetry();
  };

  try {
    const projectionGraphicsProbeDurationMs =
      resolvedPreset === "smoke" ? 55 : 90;
    const projectionComputeProbeDurationMs =
      resolvedPreset === "smoke" ? 65 : 110;

    for (const kernel of GPU_PROJECTION_PROBE_GRAPHICS) {
      setActiveGpuStage({
        stage: "warmup",
        label: "GPU warmup",
        message:
          "Running a short graphics + compute calibration pass to seed the projected overall score.",
        step: 1,
        progress: 5,
        kernel,
      });

      const result = await runFixedTimeStage({
        harness,
        durationMs: projectionGraphicsProbeDurationMs,
        visibilityGuard,
        buildBatch: createGraphicsBatchBuilder(harness, config, kernel),
      });

      visibilityGuard.assertVisible();
      projectionGraphicsProbeMetrics[kernel] = createGpuKernelMetric(
        kernel,
        GPU_GRAPHICS_LABELS[kernel],
        result,
        `Short graphics calibration for ${GPU_GRAPHICS_LABELS[kernel].toLowerCase()}.`,
      );
      emitGpuTelemetry();
    }

    for (const kernel of GPU_PROJECTION_PROBE_COMPUTE) {
      setActiveGpuStage({
        stage: "warmup",
        label: "GPU warmup",
        message:
          "Running a short graphics + compute calibration pass to seed the projected overall score.",
        step: 1,
        progress: 5,
        kernel,
      });

      const result = await runFixedTimeStage({
        harness,
        durationMs: projectionComputeProbeDurationMs,
        visibilityGuard,
        buildBatch: createComputeBatchBuilder(harness, config, kernel),
      });

      visibilityGuard.assertVisible();
      projectionComputeProbeMetrics[kernel] = createGpuKernelMetric(
        kernel,
        GPU_COMPUTE_LABELS[kernel],
        result,
        `Short compute calibration for ${GPU_COMPUTE_LABELS[kernel].toLowerCase()}.`,
      );
      emitGpuTelemetry();
    }

    setActiveGpuStage({
      stage: "warmup",
      label: "GPU warmup",
      message: "Configuring pipelines, buffers, and shader caches on the selected adapter.",
      step: 1,
      progress: 5,
    });

    await runFixedTimeStage({
      harness,
      durationMs: config.warmupDurationMs,
      visibilityGuard,
      onTick: (snapshot) => {
        liveSnapshot = snapshot;
        emitGpuTelemetry();
      },
      buildBatch: (iteration) =>
        buildFullscreenBatch(harness, {
          time: iteration * 0.016,
          amplitude: 0.8,
          scale: 0.012,
          loops: Math.max(8, config.renderBatch.shadingLoops / 2),
          passes: 30,
          clearColor: { r: 0.06, g: 0.08, b: 0.12, a: 1 },
        }),
    });
    visibilityGuard.assertVisible();

    let step = 1;

    for (const kernel of GRAPHICS_ORDER) {
      step += 1;

      setActiveGpuStage({
        stage: "graphics",
        label: `Graphics: ${GPU_GRAPHICS_LABELS[kernel]}`,
        message: "Running a fixed-time graphics batch on the high-performance adapter.",
        step,
        progress: 8 + Math.round((step / totalSteps) * 42),
        kernel,
      });

      const result = await runFixedTimeStage({
        harness,
        durationMs: config.graphicsSceneDurationMs,
        visibilityGuard,
        onTick: (snapshot) => {
          liveSnapshot = snapshot;
          emitGpuTelemetry();
        },
        buildBatch: (iteration) =>
          createGraphicsBatchBuilder(harness, config, kernel)(iteration),
      });

      visibilityGuard.assertVisible();
      graphicsMetrics[kernel] = createGpuKernelMetric(
        kernel,
        GPU_GRAPHICS_LABELS[kernel],
        result,
        `Measured ${GPU_GRAPHICS_LABELS[kernel].toLowerCase()} throughput under a fixed-time render budget.`,
      );
      emitGpuTelemetry();
    }

    for (const kernel of COMPUTE_ORDER) {
      step += 1;

      setActiveGpuStage({
        stage: "compute",
        label: `Compute: ${GPU_COMPUTE_LABELS[kernel]}`,
        message: "Running compute dispatches and queue submissions under a fixed wall-clock budget.",
        step,
        progress: 52 + Math.round((step / totalSteps) * 24),
        kernel,
      });

      const result = await runFixedTimeStage({
        harness,
        durationMs: config.computeSceneDurationMs,
        visibilityGuard,
        onTick: (snapshot) => {
          liveSnapshot = snapshot;
          emitGpuTelemetry();
        },
        buildBatch: (iteration) =>
          createComputeBatchBuilder(harness, config, kernel)(iteration),
      });

      visibilityGuard.assertVisible();
      computeMetrics[kernel] = createGpuKernelMetric(
        kernel,
        GPU_COMPUTE_LABELS[kernel],
        result,
        `Measured ${GPU_COMPUTE_LABELS[kernel].toLowerCase()} throughput with deterministic dispatch parameters.`,
      );
      emitGpuTelemetry();
    }

    step += 1;
    setActiveGpuStage({
      stage: "sustained",
      label: "Sustained mixed GPU load",
      message:
        "Alternating render and compute work to capture late-run stability and power limits.",
      step,
      progress: 84,
      kernel: "mixedLoad",
    });

    const sustainedResult = await runFixedTimeStage({
      harness,
      durationMs: config.sustainedDurationMs,
      visibilityGuard,
      onTick: (snapshot) => {
        liveSnapshot = snapshot;
        emitGpuTelemetry();
      },
      buildBatch: (iteration) => (encoder) => {
        const simulationStats = buildSimulationBatch(
          harness,
          config.computeBatch.simulationParticles,
          iteration,
          40,
        )(encoder);
        const rasterStats = buildInstancedBatch(harness, {
          time: iteration * 0.012,
          amplitude: 0.9,
          scale: 0.6,
          loops: 8,
          passes: 20,
          instanceCount: config.renderBatch.instancingInstances,
          clearColor: { r: 0.02, g: 0.025, b: 0.03, a: 1 },
        })(encoder);
        const fullscreenStats = buildFullscreenBatch(harness, {
          time: iteration * 0.014,
          amplitude: 0.7,
          scale: 0.02,
          loops: Math.max(10, config.renderBatch.postProcessLoops / 2),
          passes: 30,
          clearColor: { r: 0.02, g: 0.025, b: 0.03, a: 1 },
        })(encoder);

        return {
          workUnits:
            simulationStats.workUnits +
            rasterStats.workUnits +
            fullscreenStats.workUnits,
          checksum:
            simulationStats.checksum ^
            rasterStats.checksum ^
            fullscreenStats.checksum,
        };
      },
    });

    visibilityGuard.assertVisible();
    sustainedMetric = createGpuKernelMetric(
      "mixedLoad",
      "Mixed sustained load",
      sustainedResult,
      "Combined render and compute passes under sustained GPU pressure.",
    );
    emitGpuTelemetry();

    const subScores = {
      graphics: calculateGpuAggregateSubScore({
        id: "graphics",
        label: "Graphics",
        kernels: GRAPHICS_ORDER.map((kernel) => ({
          id: kernel,
          throughput: graphicsMetrics[kernel].throughput,
          referenceThroughput: config.referenceThroughputs.graphics[kernel],
          durationMs: graphicsMetrics[kernel].durationMs,
          notes: `Graphics stage: ${GPU_GRAPHICS_LABELS[kernel]}.`,
        })),
      }),
      compute: calculateGpuAggregateSubScore({
        id: "compute",
        label: "Compute",
        kernels: COMPUTE_ORDER.map((kernel) => ({
          id: kernel,
          throughput: computeMetrics[kernel].throughput,
          referenceThroughput: config.referenceThroughputs.compute[kernel],
          durationMs: computeMetrics[kernel].durationMs,
          notes: `Compute stage: ${GPU_COMPUTE_LABELS[kernel]}.`,
        })),
      }),
      sustained: calculateGpuAggregateSubScore({
        id: "sustained",
        label: "Sustained",
        kernels: [
          {
            id: "mixedLoad",
            throughput: sustainedMetric.throughput,
            referenceThroughput: config.referenceThroughputs.sustained,
            durationMs: sustainedMetric.durationMs,
            notes: "Measured the late-run mixed GPU load under steady-state pressure.",
          },
        ],
      }),
    } satisfies Record<GpuAggregateScoreId, ReturnType<typeof calculateGpuAggregateSubScore>>;

    const { gpuScore, rating } = calculateGpuScore(subScores);
    const totalDurationMs = performance.now() - overallStart;
    const checksum = combineChecksums([
      Object.values(graphicsMetrics).reduce(
        (sum, metric) =>
          (sum + metric.iterations + Math.floor(metric.throughput)) >>> 0,
        0,
      ),
      Object.values(computeMetrics).reduce(
        (sum, metric) =>
          (sum + metric.iterations + Math.floor(metric.throughput)) >>> 0,
        0,
      ),
      Math.floor(sustainedMetric.throughput),
    ]);

    setActiveGpuStage({
      stage: "persisting",
      label: "GPU run complete",
      message: "Persisting the GPU result.",
      step: totalSteps,
      progress: 96,
    });

    return {
      benchmarkKind: "gpu",
      headlineScore: gpuScore,
      gpuScore,
      rating,
      graphicsScore: subScores.graphics.score,
      computeScore: subScores.compute.score,
      sustainedScore: subScores.sustained.score,
      subScores,
      rawMetrics: {
        preset: resolvedPreset,
        startedAt,
        endedAt: Date.now(),
        totalDurationMs: roundMetric(totalDurationMs),
        warmupDurationMs: config.warmupDurationMs,
        graphicsDurationMs: roundMetric(
          Object.values(graphicsMetrics).reduce((sum, metric) => sum + metric.durationMs, 0),
        ),
        computeDurationMs: roundMetric(
          Object.values(computeMetrics).reduce((sum, metric) => sum + metric.durationMs, 0),
        ),
        sustainedDurationMs: sustainedMetric.durationMs,
        checksum,
        visibilityGuardPassed: visibilityGuard.passed(),
        timestampQuerySupported: harness.timestampQuerySupported,
        timestampQueryUsed:
          harness.timestampQuerySupported &&
          [...Object.values(graphicsMetrics), ...Object.values(computeMetrics), sustainedMetric].some(
            (metric) => metric.timestampQueryUsed,
          ),
        adapterName:
          harness.adapterInfo?.device ??
          harness.adapterInfo?.description ??
          "High-performance WebGPU adapter",
        adapterInfo: harness.adapterInfo,
        stageMetrics: {
          graphics: graphicsMetrics,
          compute: computeMetrics,
          sustained: {
            mixedLoad: sustainedMetric,
          },
        },
      },
      benchmarkVersion: BENCHMARK_VERSION,
    };
  } finally {
    visibilityGuard.cleanup();
    harness.cleanup();
  }
}
