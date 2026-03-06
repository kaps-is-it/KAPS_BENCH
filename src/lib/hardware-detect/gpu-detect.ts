import type { WebGpuAdapterSummary } from "@/lib/types";

type GpuDetectionResult = {
  renderer: string;
  vendor: string;
  webgpuSupported: boolean;
  webgpuInfo?: WebGpuAdapterSummary;
};

export function inferVendorFromRenderer(renderer: string) {
  const source = renderer.toLowerCase();

  if (source.includes("nvidia")) {
    return "NVIDIA";
  }

  if (source.includes("amd") || source.includes("radeon")) {
    return "AMD";
  }

  if (source.includes("intel")) {
    return "Intel";
  }

  if (source.includes("apple")) {
    return "Apple";
  }

  return "Unknown";
}

export async function detectGpu(): Promise<GpuDetectionResult> {
  const canvas = document.createElement("canvas");
  const context =
    canvas.getContext("webgl2") ?? canvas.getContext("webgl");

  let renderer = "Unknown GPU";
  let vendor = "Unknown";

  if (context) {
    const debugInfo = context.getExtension("WEBGL_debug_renderer_info");

    renderer = debugInfo
      ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : context.getParameter(context.RENDERER);

    vendor = debugInfo
      ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : inferVendorFromRenderer(renderer);
  }

  const globalNavigator = navigator as Navigator & {
    gpu?: {
      requestAdapter?: () => Promise<unknown>;
    };
  };

  let webgpuInfo: WebGpuAdapterSummary | undefined;

  if (globalNavigator.gpu?.requestAdapter) {
    const adapter = (await globalNavigator.gpu.requestAdapter()) as
      | {
          requestAdapterInfo?: () => Promise<WebGpuAdapterSummary>;
          info?: WebGpuAdapterSummary;
        }
      | null;

    if (adapter) {
      if (adapter.requestAdapterInfo) {
        try {
          webgpuInfo = await adapter.requestAdapterInfo();
        } catch {
          webgpuInfo = adapter.info;
        }
      } else {
        webgpuInfo = adapter.info;
      }
    }
  }

  return {
    renderer,
    vendor,
    webgpuSupported: Boolean(globalNavigator.gpu),
    webgpuInfo,
  };
}
