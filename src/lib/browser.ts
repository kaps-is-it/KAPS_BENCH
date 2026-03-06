import type { BenchmarkKind, CapabilityFlags } from "@/lib/types";

export type BenchmarkSupportState = {
  supported: boolean;
  mobileBlocked: boolean;
  reason?: string;
};

export function getBenchmarkSupportState(
  benchmarkKind: BenchmarkKind,
  capabilities: CapabilityFlags,
): BenchmarkSupportState {
  if (benchmarkKind === "cpu") {
    if (!capabilities.webAssembly || !capabilities.worker) {
      return {
        supported: false,
        mobileBlocked: false,
        reason: "The CPU benchmark requires WebAssembly and Web Worker support.",
      };
    }

    if (!capabilities.crossOriginIsolated || !capabilities.sharedArrayBuffer) {
      return {
        supported: false,
        mobileBlocked: false,
        reason:
          "The CPU benchmark requires cross-origin isolation and SharedArrayBuffer support.",
      };
    }

    return {
      supported: true,
      mobileBlocked: false,
    };
  }

  if (!capabilities.webgpu) {
    return {
      supported: false,
      mobileBlocked: false,
      reason:
        "The GPU benchmark requires WebGPU. Use a browser and device with WebGPU enabled.",
    };
  }

  return {
    supported: true,
    mobileBlocked: false,
  };
}
