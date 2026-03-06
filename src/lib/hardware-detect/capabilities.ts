import type { CapabilityFlags } from "@/lib/types";

export function detectCapabilities(): CapabilityFlags {
  const globalNavigator = navigator as Navigator & {
    gpu?: unknown;
  };

  return {
    webgpu: Boolean(globalNavigator.gpu),
    webgl2: Boolean(document.createElement("canvas").getContext("webgl2")),
    webAssembly: typeof WebAssembly !== "undefined",
    worker: typeof Worker !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    audioWorklet:
      typeof AudioContext !== "undefined" &&
      "audioWorklet" in AudioContext.prototype,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated:
      typeof window !== "undefined" && Boolean(window.crossOriginIsolated),
  };
}
