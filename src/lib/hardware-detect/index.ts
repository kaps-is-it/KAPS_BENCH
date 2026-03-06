import { UAParser } from "ua-parser-js";
import type { DeviceProfile } from "@/lib/types";
import { detectCapabilities } from "@/lib/hardware-detect/capabilities";
import { detectCpu } from "@/lib/hardware-detect/cpu-detect";
import { detectDisplay } from "@/lib/hardware-detect/display-detect";
import { detectGpu } from "@/lib/hardware-detect/gpu-detect";
import { detectMemory } from "@/lib/hardware-detect/memory-detect";

export async function detectDeviceProfile(): Promise<DeviceProfile> {
  const [gpu, cpu, memory] = await Promise.all([
    detectGpu(),
    Promise.resolve(detectCpu()),
    Promise.resolve(detectMemory()),
  ]);

  const capabilities = detectCapabilities();
  const display = detectDisplay();
  const parser = new UAParser(window.navigator.userAgent);
  const parsed = parser.getResult();

  return {
    gpuRenderer: gpu.renderer,
    gpuVendor: gpu.vendor,
    gpuArchitecture: gpu.webgpuInfo?.architecture,
    gpuDescription: gpu.webgpuInfo?.description,
    webgpuSupported: gpu.webgpuSupported,
    webgpuInfo: gpu.webgpuInfo,
    cpuLogicalCores: cpu.cpuLogicalCores,
    deviceMemoryGb: memory.deviceMemoryGb,
    display,
    browser: {
      name: parsed.browser.name ?? "Unknown Browser",
      version: parsed.browser.version ?? "Unknown",
      os: parsed.os.name ?? "Unknown OS",
      osVersion: parsed.os.version ?? "",
      userAgent: window.navigator.userAgent,
    },
    capabilities,
    timestamp: Date.now(),
  };
}
