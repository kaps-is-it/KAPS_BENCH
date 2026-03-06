import { getBenchmarkSupportState } from "@/lib/browser";

describe("getBenchmarkSupportState", () => {
  it("does not block touch-first devices when benchmark capabilities are present", () => {
    const originalMatchMedia = window.matchMedia;
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      },
    })) as typeof window.matchMedia;

    const result = getBenchmarkSupportState("cpu", {
      webgpu: false,
      webgl2: true,
      webAssembly: true,
      worker: true,
      offscreenCanvas: false,
      audioWorklet: false,
      sharedArrayBuffer: true,
      crossOriginIsolated: true,
    });

    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });

    expect(result.supported).toBe(true);
    expect(result.mobileBlocked).toBe(false);
  });

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
