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
import type { BenchmarkProgressUpdate } from "@/benchmarks/shared/progress";
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

function createVisibilityGuard() {
  let hidden = false;

  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
      hidden = true;
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
  },
) {
  return (encoder: GPUCommandEncoder): BatchStats => {
    writeRenderUniforms(harness.device, harness.renderUniformBuffer, params);
    const view = harness.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: params.clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(harness.instancedPipeline);
    pass.setBindGroup(0, harness.renderBindGroup);
    pass.draw(3, params.instanceCount);
    pass.end();

    return {
      workUnits: params.instanceCount * Math.max(params.loops, 1) * 3,
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
    const view = harness.context.getCurrentTexture().createView();

    for (let passIndex = 0; passIndex < (params.passes ?? 1); passIndex += 1) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: params.clearColor,
            loadOp: "clear",
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
    pass.dispatchWorkgroups(Math.ceil(matrixSize / 8), Math.ceil(matrixSize / 8));
    pass.end();

    return {
      workUnits: matrixSize * matrixSize * matrixSize * 2,
      checksum: matrixSize ^ step,
    };
  };
}

function buildConvolutionBatch(
  harness: GpuHarness,
  size: number,
  step: number,
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
    pass.dispatchWorkgroups(Math.ceil(size / 8), Math.ceil(size / 8));
    pass.end();

    return {
      workUnits: size * size * 9,
      checksum: size ^ (step * 3),
    };
  };
}

function buildSimulationBatch(
  harness: GpuHarness,
  particleCount: number,
  step: number,
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
    pass.dispatchWorkgroups(Math.ceil(particleCount / 64));
    pass.end();

    return {
      workUnits: particleCount * 16,
      checksum: particleCount ^ (step * 5),
    };
  };
}

async function runFixedTimeStage({
  harness,
  durationMs,
  buildBatch,
  visibilityGuard,
}: {
  harness: GpuHarness;
  durationMs: number;
  buildBatch: (iteration: number) => (encoder: GPUCommandEncoder) => BatchStats;
  visibilityGuard: ReturnType<typeof createVisibilityGuard>;
}) {
  const stageStartedAt = performance.now();
  let iterations = 0;
  let checksum = 0;
  let workUnits = 0;
  let timestampQueryUsed = false;

  if (harness.timestampQuerySupported) {
    const sample = await sampleGpuTimestamp(harness, buildBatch(iterations));

    if (sample.stats) {
      workUnits += sample.stats.workUnits;
      checksum = (checksum + sample.stats.checksum) >>> 0;
      iterations += 1;
      timestampQueryUsed = sample.durationMs !== null;
    }
  }

  while (performance.now() - stageStartedAt < durationMs) {
    visibilityGuard.assertVisible();
    const stats = await submitBatch(harness, buildBatch(iterations));
    workUnits += stats.workUnits;
    checksum = (checksum + stats.checksum) >>> 0;
    iterations += 1;
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
  const graphicsScore = Math.round(graphicsRatio * 5000);
  const computeScore = Math.round(computeRatio * 5000);
  const sustainedScore = Math.round(sustainedRatio * 5000);
  const gpuScore = Math.round(
    5000 *
      Math.pow(
        graphicsRatio ** 0.45 * computeRatio ** 0.4 * sustainedRatio ** 0.15,
        1,
      ),
  );

  return {
    benchmarkKind: "gpu",
    headlineScore: gpuScore,
    gpuScore,
    rating: gpuScore >= 4200 ? "High-End" : "Performance",
    graphicsScore,
    computeScore,
    sustainedScore,
    subScores: {
      graphics: {
        id: "graphics",
        label: "Graphics",
        score: graphicsScore,
        measuredValue: roundMetric(graphicsRatio * 100),
        referenceValue: 100,
        unit: "% of reference",
        durationMs: preset.graphicsSceneDurationMs * GRAPHICS_ORDER.length,
        notes: "Mock GPU graphics suite used for internal smoke testing only.",
      },
      compute: {
        id: "compute",
        label: "Compute",
        score: computeScore,
        measuredValue: roundMetric(computeRatio * 100),
        referenceValue: 100,
        unit: "% of reference",
        durationMs: preset.computeSceneDurationMs * COMPUTE_ORDER.length,
        notes: "Mock GPU compute suite used for internal smoke testing only.",
      },
      sustained: {
        id: "sustained",
        label: "Sustained",
        score: sustainedScore,
        measuredValue: roundMetric(sustainedRatio * 100),
        referenceValue: 100,
        unit: "% of reference",
        durationMs: preset.sustainedDurationMs,
        notes: "Mock sustained GPU load used for internal smoke testing only.",
      },
    },
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
        graphics: {
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
        },
        compute: {
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
        },
        sustained: {
          mixedLoad: createGpuKernelMetric(
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
          ),
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
}: {
  preset?: BenchmarkPreset;
  onProgress?: (update: BenchmarkProgressUpdate) => void;
  mock?: boolean;
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

  const visibilityGuard = createVisibilityGuard();
  const harness = await createGpuHarness(config.renderWidth, config.renderHeight);
  const startedAt = Date.now();
  const totalSteps = 1 + GRAPHICS_ORDER.length + COMPUTE_ORDER.length + 1;
  const graphicsMetrics = {} as Record<GpuGraphicsKernelId, GpuKernelMetric>;
  const computeMetrics = {} as Record<GpuComputeKernelId, GpuKernelMetric>;
  let sustainedMetric: GpuKernelMetric | null = null;
  const overallStart = performance.now();

  try {
    onProgress?.({
      label: "GPU warmup",
      message: "Configuring pipelines, buffers, and shader caches on the selected adapter.",
      step: 1,
      totalSteps,
      progress: 5,
    });

    await runFixedTimeStage({
      harness,
      durationMs: config.warmupDurationMs,
      visibilityGuard,
      buildBatch: (iteration) =>
        buildFullscreenBatch(harness, {
          time: iteration * 0.016,
          amplitude: 0.8,
          scale: 0.012,
          loops: Math.max(8, config.renderBatch.shadingLoops / 2),
          clearColor: { r: 0.06, g: 0.08, b: 0.12, a: 1 },
        }),
    });
    visibilityGuard.assertVisible();

    let step = 1;

    for (const kernel of GRAPHICS_ORDER) {
      step += 1;

      onProgress?.({
        label: `Graphics: ${GPU_GRAPHICS_LABELS[kernel]}`,
        message: "Running a fixed-time graphics batch on the high-performance adapter.",
        step,
        totalSteps,
        progress: 8 + Math.round((step / totalSteps) * 42),
      });

      const result = await runFixedTimeStage({
        harness,
        durationMs: config.graphicsSceneDurationMs,
        visibilityGuard,
        buildBatch: (iteration) => {
          switch (kernel) {
            case "rasterScene":
              return buildInstancedBatch(harness, {
                time: iteration * 0.013,
                amplitude: 0.55,
                scale: 0.55,
                loops: 4,
                instanceCount: config.renderBatch.rasterInstances,
                clearColor: { r: 0.03, g: 0.04, b: 0.06, a: 1 },
              });
            case "shadingScene":
              return buildFullscreenBatch(harness, {
                time: iteration * 0.019,
                amplitude: 0.7,
                scale: 0.02,
                loops: config.renderBatch.shadingLoops,
                clearColor: { r: 0.02, g: 0.02, b: 0.03, a: 1 },
              });
            case "instancingScene":
              return buildInstancedBatch(harness, {
                time: iteration * 0.017,
                amplitude: 0.95,
                scale: 0.75,
                loops: 8,
                instanceCount: config.renderBatch.instancingInstances,
                clearColor: { r: 0.02, g: 0.03, b: 0.04, a: 1 },
              });
            case "particleScene":
              return (encoder) => {
                const computeStats = buildSimulationBatch(
                  harness,
                  config.computeBatch.simulationParticles,
                  iteration,
                )(encoder);
                const renderStats = buildInstancedBatch(harness, {
                  time: iteration * 0.021,
                  amplitude: 1.2,
                  scale: 0.35,
                  loops: 6,
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
                passes: 2,
                clearColor: { r: 0.01, g: 0.015, b: 0.02, a: 1 },
              });
            default:
              throw new Error(`Unsupported graphics kernel: ${kernel}`);
          }
        },
      });

      visibilityGuard.assertVisible();
      graphicsMetrics[kernel] = createGpuKernelMetric(
        kernel,
        GPU_GRAPHICS_LABELS[kernel],
        result,
        `Measured ${GPU_GRAPHICS_LABELS[kernel].toLowerCase()} throughput under a fixed-time render budget.`,
      );
    }

    for (const kernel of COMPUTE_ORDER) {
      step += 1;

      onProgress?.({
        label: `Compute: ${GPU_COMPUTE_LABELS[kernel]}`,
        message: "Running compute dispatches and queue submissions under a fixed wall-clock budget.",
        step,
        totalSteps,
        progress: 52 + Math.round((step / totalSteps) * 24),
      });

      const result = await runFixedTimeStage({
        harness,
        durationMs: config.computeSceneDurationMs,
        visibilityGuard,
        buildBatch: (iteration) => {
          switch (kernel) {
            case "matrixCompute":
              return buildMatrixBatch(
                harness,
                config.computeBatch.matrixSize,
                iteration,
              );
            case "convolutionCompute":
              return buildConvolutionBatch(
                harness,
                config.computeBatch.convolutionSize,
                iteration,
              );
            case "simulationCompute":
              return buildSimulationBatch(
                harness,
                config.computeBatch.simulationParticles,
                iteration,
              );
            default:
              throw new Error(`Unsupported compute kernel: ${kernel}`);
          }
        },
      });

      visibilityGuard.assertVisible();
      computeMetrics[kernel] = createGpuKernelMetric(
        kernel,
        GPU_COMPUTE_LABELS[kernel],
        result,
        `Measured ${GPU_COMPUTE_LABELS[kernel].toLowerCase()} throughput with deterministic dispatch parameters.`,
      );
    }

    step += 1;
    onProgress?.({
      label: "Sustained mixed GPU load",
      message:
        "Alternating render and compute work to capture late-run stability and power limits.",
      step,
      totalSteps,
      progress: 84,
    });

    const sustainedResult = await runFixedTimeStage({
      harness,
      durationMs: config.sustainedDurationMs,
      visibilityGuard,
      buildBatch: (iteration) => (encoder) => {
        const simulationStats = buildSimulationBatch(
          harness,
          config.computeBatch.simulationParticles,
          iteration,
        )(encoder);
        const rasterStats = buildInstancedBatch(harness, {
          time: iteration * 0.012,
          amplitude: 0.9,
          scale: 0.6,
          loops: 6,
          instanceCount: config.renderBatch.instancingInstances,
          clearColor: { r: 0.02, g: 0.025, b: 0.03, a: 1 },
        })(encoder);
        const fullscreenStats = buildFullscreenBatch(harness, {
          time: iteration * 0.014,
          amplitude: 0.7,
          scale: 0.02,
          loops: Math.max(10, config.renderBatch.postProcessLoops / 2),
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

    onProgress?.({
      label: "GPU run complete",
      message: "Persisting the GPU result.",
      step: totalSteps,
      totalSteps,
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
