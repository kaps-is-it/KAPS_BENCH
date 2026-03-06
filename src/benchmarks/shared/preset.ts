import type { BenchmarkPreset } from "@/lib/types";

export function resolveBenchmarkPreset(preset?: BenchmarkPreset): "full" | "smoke" {
  if (preset === "smoke") {
    return "smoke";
  }

  return "full";
}
