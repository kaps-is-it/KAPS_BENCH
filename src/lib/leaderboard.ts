import type {
  PersistedBenchmarkResult,
  PersistedCpuBenchmarkResult,
  PersistedGpuBenchmarkResult,
} from "@/lib/types";

export type LeaderboardScope =
  | "cpu-full"
  | "cpu-singleCore"
  | "cpu-multiCore"
  | "gpu";

function normalizeHardwareSegment(value: string | number | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function simplifyGpuRenderer(renderer: string) {
  const source = renderer.trim();
  const angleRendererMatch = source.match(/Renderer:\s*([^)]+?)(?:,\s*Unspecified Version)?\)?$/i);

  if (angleRendererMatch?.[1]) {
    return angleRendererMatch[1].trim();
  }

  return source.replace(/\s+/g, " ").trim();
}

export function matchesLeaderboardScope(
  result: PersistedBenchmarkResult,
  scope: LeaderboardScope,
): boolean {
  if (scope === "gpu") {
    return result.benchmarkKind === "gpu";
  }

  if (result.benchmarkKind !== "cpu") {
    return false;
  }

  if (scope === "cpu-full") {
    return result.cpuRunMode === "full";
  }

  if (scope === "cpu-singleCore") {
    return result.cpuRunMode === "singleCore";
  }

  return result.cpuRunMode === "multiCore";
}

export function getLeaderboardHardwareKey(
  result: PersistedBenchmarkResult,
  scope: LeaderboardScope,
) {
  if (result.benchmarkKind === "gpu") {
    return [
      scope,
      normalizeHardwareSegment(simplifyGpuRenderer(result.deviceProfile.gpuRenderer)),
      normalizeHardwareSegment(result.deviceProfile.browser.os),
      normalizeHardwareSegment(result.deviceProfile.browser.osVersion),
    ].join("|");
  }

  return [
    scope,
    normalizeHardwareSegment(result.deviceProfile.cpuLogicalCores),
    normalizeHardwareSegment(result.deviceProfile.browser.os),
    normalizeHardwareSegment(result.deviceProfile.browser.osVersion),
    normalizeHardwareSegment(result.deviceProfile.deviceMemoryGb),
    normalizeHardwareSegment(simplifyGpuRenderer(result.deviceProfile.gpuRenderer)),
  ].join("|");
}

export function dedupeLeaderboardResults<T extends PersistedBenchmarkResult>(
  results: T[],
  scope: LeaderboardScope,
  limit: number,
) {
  const deduped: T[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const key = getLeaderboardHardwareKey(result, scope);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(result);

    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

export function getLeaderboardHardwareLabel(result: PersistedBenchmarkResult) {
  if (result.benchmarkKind === "gpu") {
    return simplifyGpuRenderer(result.deviceProfile.gpuRenderer);
  }

  const coreLabel = `${result.deviceProfile.cpuLogicalCores}-core`;
  const platform = result.deviceProfile.browser.os;

  return `${coreLabel} ${platform} device`;
}

export function getLeaderboardDetailLabel(result: PersistedBenchmarkResult) {
  if (result.benchmarkKind === "gpu") {
    return `${result.deviceProfile.browser.os} • ${result.browserName} ${result.browserVersion}`;
  }

  const memoryLabel = result.deviceProfile.deviceMemoryGb
    ? `At least ${result.deviceProfile.deviceMemoryGb} GB`
    : "Memory undisclosed";

  return `${memoryLabel} • ${result.browserName} ${result.browserVersion}`;
}

export function getLeaderboardOwnerLabel(result: PersistedBenchmarkResult) {
  return (
    result.user?.username ??
    result.user?.email?.split("@")[0] ??
    "Anonymous run"
  );
}

export function getLeaderboardScopeTitle(scope: LeaderboardScope) {
  switch (scope) {
    case "cpu-full":
      return "CPU Full Leaderboard";
    case "cpu-singleCore":
      return "CPU Single-Core Leaderboard";
    case "cpu-multiCore":
      return "CPU Multi-Core Leaderboard";
    case "gpu":
      return "GPU Leaderboard";
  }
}

export function getLeaderboardScopeDescription(scope: LeaderboardScope) {
  switch (scope) {
    case "cpu-full":
      return "Long-form full CPU runs ranked by the combined headline score.";
    case "cpu-singleCore":
      return "Single-core only CPU runs ranked independently from full and multi-core passes.";
    case "cpu-multiCore":
      return "Multi-core only CPU runs ranked on pooled throughput alone.";
    case "gpu":
      return "Graphics, compute, and sustained GPU runs ranked by the headline GPU score.";
  }
}

export function isCpuResult(
  result: PersistedBenchmarkResult,
): result is PersistedCpuBenchmarkResult {
  return result.benchmarkKind === "cpu";
}

export function isGpuResult(
  result: PersistedBenchmarkResult,
): result is PersistedGpuBenchmarkResult {
  return result.benchmarkKind === "gpu";
}
