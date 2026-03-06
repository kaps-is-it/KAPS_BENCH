import { getBenchmarkSupportState } from "@/lib/browser";

describe("getBenchmarkSupportState", () => {
  it("blocks cpu runs without isolation and wasm requirements", () => {
    const result = getBenchmarkSupportState("cpu", {
      webgpu: false,
      webgl2: true,
      webAssembly: false,
      worker: true,
      offscreenCanvas: false,
      audioWorklet: false,
      sharedArrayBuffer: false,
      crossOriginIsolated: false,
    });

    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/WebAssembly/i);
  });

  it("blocks gpu runs without webgpu", () => {
    const result = getBenchmarkSupportState("gpu", {
      webgpu: false,
      webgl2: true,
      webAssembly: true,
      worker: true,
      offscreenCanvas: true,
      audioWorklet: false,
      sharedArrayBuffer: true,
      crossOriginIsolated: true,
    });

    expect(result.supported).toBe(false);
    expect(result.reason).toMatch(/WebGPU/i);
  });
});
