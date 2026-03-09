import type {
  GpuAdapterPreference,
  GpuAdapterSelectionOption,
  WebGpuAdapterSummary,
} from "@/lib/types";

type GpuDetectionResult = {
  renderer: string;
  vendor: string;
  webgpuSupported: boolean;
  webgpuInfo?: WebGpuAdapterSummary;
};

type GpuAdapterWithInfo = GPUAdapter & {
  requestAdapterInfo?: () => Promise<WebGpuAdapterSummary>;
  info?: WebGpuAdapterSummary;
};

function getGpuNavigator() {
  return navigator as Navigator & { gpu?: GPU };
}

async function readAdapterInfo(
  adapter: GpuAdapterWithInfo | null,
): Promise<WebGpuAdapterSummary | undefined> {
  if (!adapter) {
    return undefined;
  }

  if (adapter.requestAdapterInfo) {
    try {
      return await adapter.requestAdapterInfo();
    } catch {
      return adapter.info;
    }
  }

  return adapter.info;
}

function formatAdapterName(adapterInfo?: WebGpuAdapterSummary) {
  return (
    adapterInfo?.device ??
    adapterInfo?.description ??
    adapterInfo?.architecture ??
    adapterInfo?.vendor ??
    "WebGPU adapter"
  );
}

function formatAdapterDescription(
  preference: GpuAdapterPreference,
  adapterInfo?: WebGpuAdapterSummary,
) {
  const preferenceLabel =
    preference === "high-performance"
      ? "High-performance target"
      : preference === "low-power"
        ? "Low-power target"
        : "Automatic browser target";
  const extra = [adapterInfo?.vendor, adapterInfo?.architecture]
    .filter(Boolean)
    .join(" • ");

  return extra ? `${preferenceLabel} • ${extra}` : preferenceLabel;
}

function getAdapterSignature(
  preference: GpuAdapterPreference,
  adapterInfo?: WebGpuAdapterSummary,
) {
  const signature = [
    adapterInfo?.device,
    adapterInfo?.description,
    adapterInfo?.vendor,
    adapterInfo?.architecture,
  ]
    .filter(Boolean)
    .join("|");

  return signature || preference;
}

async function probeAdapter(
  preference: GpuAdapterPreference,
): Promise<GpuAdapterSelectionOption | null> {
  const gpuNavigator = getGpuNavigator();

  if (!gpuNavigator.gpu?.requestAdapter) {
    return null;
  }

  const adapter = (await gpuNavigator.gpu.requestAdapter(
    preference === "auto"
      ? undefined
      : { powerPreference: preference },
  )) as GpuAdapterWithInfo | null;

  if (!adapter) {
    return null;
  }

  const adapterInfo = await readAdapterInfo(adapter);

  return {
    preference,
    label: formatAdapterName(adapterInfo),
    adapterName: formatAdapterName(adapterInfo),
    description: formatAdapterDescription(preference, adapterInfo),
    adapterInfo,
  };
}

export async function listGpuAdapterOptions(): Promise<GpuAdapterSelectionOption[]> {
  const candidates = (
    await Promise.all([
      probeAdapter("high-performance"),
      probeAdapter("low-power"),
      probeAdapter("auto"),
    ])
  ).filter((option): option is GpuAdapterSelectionOption => Boolean(option));

  if (candidates.length === 0) {
    return [];
  }

  const unique = new Map<string, GpuAdapterSelectionOption>();

  for (const option of candidates) {
    const signature = getAdapterSignature(option.preference, option.adapterInfo);
    const existing = unique.get(signature);

    if (!existing) {
      unique.set(signature, option);
      continue;
    }

    if (existing.preference === "auto" && option.preference !== "auto") {
      unique.set(signature, option);
    }
  }

  const options = [...unique.values()];

  if (options.length <= 1) {
    const onlyOption = options[0];

    return [
      {
        ...onlyOption,
        preference: "auto",
        description: onlyOption.adapterInfo
          ? `Automatic browser target • ${onlyOption.adapterName}`
          : "Automatic browser target",
      },
    ];
  }

  return options.sort((left, right) => {
    const priority = {
      "high-performance": 0,
      "low-power": 1,
      auto: 2,
    } as const;

    return priority[left.preference] - priority[right.preference];
  });
}

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

  const globalNavigator = getGpuNavigator();

  let webgpuInfo: WebGpuAdapterSummary | undefined;

  if (globalNavigator.gpu?.requestAdapter) {
    const adapter = (await globalNavigator.gpu.requestAdapter()) as
      | GpuAdapterWithInfo
      | null;

    webgpuInfo = await readAdapterInfo(adapter);
  }

  return {
    renderer,
    vendor,
    webgpuSupported: Boolean(globalNavigator.gpu),
    webgpuInfo,
  };
}
