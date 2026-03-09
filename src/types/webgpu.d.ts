type GPUTextureFormat = string;

interface GPUAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface GPUBuffer {
  destroy(): void;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

type GPUBindGroup = object;
type GPUBindGroupLayout = object;
type GPUComputePipeline = object;
type GPUPipelineLayout = object;
type GPUQuerySet = object;
type GPURenderPipeline = object;
type GPUShaderModule = object;
type GPUTextureView = object;

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  draw(vertexCount: number, instanceCount?: number): void;
  end(): void;
}

interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: object): GPURenderPassEncoder;
  beginComputePass(): GPUComputePassEncoder;
  writeTimestamp(querySet: GPUQuerySet, queryIndex: number): void;
  resolveQuerySet(
    querySet: GPUQuerySet,
    firstQuery: number,
    queryCount: number,
    destination: GPUBuffer,
    destinationOffset: number,
  ): void;
  copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): object;
}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource): void;
  submit(commandBuffers: object[]): void;
  onSubmittedWorkDone(): Promise<void>;
}

interface GPUTexture {
  createView(): GPUTextureView;
  destroy(): void;
}

interface GPUCanvasContext {
  configure(descriptor: object): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUDevice {
  queue: GPUQueue;
  createShaderModule(descriptor: object): GPUShaderModule;
  createBuffer(descriptor: object): GPUBuffer;
  createTexture(descriptor: object): GPUTexture;
  createBindGroupLayout(descriptor: object): GPUBindGroupLayout;
  createPipelineLayout(descriptor: object): GPUPipelineLayout;
  createRenderPipeline(descriptor: object): GPURenderPipeline;
  createComputePipeline(descriptor: object): GPUComputePipeline;
  createBindGroup(descriptor: object): GPUBindGroup;
  createQuerySet(descriptor: object): GPUQuerySet;
  createCommandEncoder(): GPUCommandEncoder;
  destroy(): void;
}

interface GPUAdapter {
  features: Set<string>;
  info?: GPUAdapterInfo;
  requestAdapterInfo?(): Promise<GPUAdapterInfo>;
  requestDevice(options?: { requiredFeatures?: string[] }): Promise<GPUDevice>;
}

interface GPU {
  requestAdapter(options?: {
    powerPreference?: "low-power" | "high-performance";
  }): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

type GPUColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

declare const GPUBufferUsage: {
  UNIFORM: number;
  COPY_DST: number;
  STORAGE: number;
  COPY_SRC: number;
  MAP_READ: number;
  QUERY_RESOLVE: number;
};

declare const GPUTextureUsage: {
  RENDER_ATTACHMENT: number;
  COPY_SRC: number;
  TEXTURE_BINDING: number;
};

declare const GPUShaderStage: {
  VERTEX: number;
  FRAGMENT: number;
  COMPUTE: number;
};

declare const GPUMapMode: {
  READ: number;
};
