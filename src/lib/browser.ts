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
  if (typeof window !== "undefined") {
    const coarsePointer =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : false;
    const narrowViewport = window.innerWidth < 1024;
    const likelyTouchFirst = coarsePointer && narrowViewport;

    if (likelyTouchFirst) {
      return {
        supported: false,
        mobileBlocked: true,
        reason:
          "Can I Run This is desktop-first. Use a laptop or desktop browser for accurate results.",
      };
    }
  }

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
        "The GPU benchmark requires WebGPU. Use the latest Chrome or Edge on desktop hardware with WebGPU enabled.",
    };
  }

  return {
    supported: true,
    mobileBlocked: false,
  };
}
