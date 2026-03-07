"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  Info,
  Layers3,
  LoaderCircle,
  Monitor,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { runCpuBenchmark } from "@/benchmarks/cpu/runner";
import { runGpuBenchmark } from "@/benchmarks/gpu/runner";
import { useAuthSession } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { submitBenchmarkResult } from "@/lib/api/benchmark-client";
import type {
  BenchmarkActivityEntry,
  BenchmarkLiveScore,
  BenchmarkProgressUpdate,
  BenchmarkTelemetry,
} from "@/benchmarks/shared/progress";
import { getBenchmarkSupportState } from "@/lib/browser";
import { formatApproxMemory } from "@/lib/format-memory";
import { detectDeviceProfile } from "@/lib/hardware-detect";
import type {
  BenchmarkDisplayResult,
  BenchmarkKind,
  BenchmarkPreset,
  BenchmarkRunState,
  CapabilityFlags,
  CpuRunMode,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBenchmarkStore } from "@/stores/benchmark-store";

const BENCHMARK_COPY: Record<
  BenchmarkKind,
  {
    title: string;
    version: string;
    duration: string;
    intro: string;
    requirements: string[];
    stages: string[];
  }
> = {
  cpu: {
    title: "CPU Performance Benchmark",
    version: "Version 1.0 • Long-form system stress test",
    duration: "11-13 minutes",
    intro:
      "Comprehensive evaluation for modern CPU architectures. You can run the full suite or isolate the single-core and multi-core sections independently.",
    requirements: [
      "WebAssembly + Workers",
      "Cross-origin isolation",
      "Keep the tab visible",
      "Keep the device awake",
    ],
    stages: [
      "Warmup",
      "Single-core kernel sweep",
      "Multi-core worker sweep",
      "Sustained mixed burn",
    ],
  },
  gpu: {
    title: "GPU Performance Benchmark",
    version: "Version 1.0 • High-performance adapter stress test",
    duration: "10-12 minutes",
    intro:
      "Long-form graphics and compute benchmarking through WebGPU. The public run covers graphics throughput, compute throughput, and sustained mixed-load stability.",
    requirements: [
      "WebGPU support",
      "High-performance adapter preferred",
      "Keep the tab visible",
      "Keep the device awake",
    ],
    stages: [
      "Pipeline warmup",
      "Graphics suite",
      "Compute suite",
      "Sustained mixed GPU load",
    ],
  },
};

const sidebarItems = [
  { label: "Dashboard", icon: Layers3, href: "/" },
  { label: "Benchmarks", icon: BarChart3, href: null },
  { label: "History", icon: Clock3, href: "/auth" },
  { label: "Settings", icon: Settings2, href: "/auth" },
] as const;

function getPreviewCards(benchmarkKind: BenchmarkKind) {
  if (benchmarkKind === "cpu") {
    return [
      { label: "Single-Core Score", tone: "primary" },
      { label: "Multi-Core Score", tone: "secondary" },
      { label: "Sustained Score", tone: "secondary" },
    ] as const;
  }

  return [
    { label: "Graphics Score", tone: "primary" },
    { label: "Compute Score", tone: "secondary" },
    { label: "Sustained Score", tone: "secondary" },
  ] as const;
}

function getStatusLabel(
  runState: BenchmarkRunState,
  hasLocalOnlyResult = false,
) {
  switch (runState) {
    case "running":
      return "Benchmark active";
    case "completed":
      return hasLocalOnlyResult ? "Local result ready" : "Result saved";
    case "error":
      return "Run interrupted";
    case "detecting":
      return "Detecting device";
    default:
      return "Waiting for data";
  }
}

function getPreviewScores(
  benchmarkKind: BenchmarkKind,
  result: BenchmarkDisplayResult | null,
) {
  if (benchmarkKind === "cpu" && result?.benchmarkKind === "cpu") {
    return [
      result.singleCoreScore,
      result.multiCoreScore,
      result.sustainedScore,
    ] as const;
  }

  if (benchmarkKind === "gpu" && result?.benchmarkKind === "gpu") {
    return [
      result.graphicsScore,
      result.computeScore,
      result.sustainedScore,
    ] as const;
  }

  return [null, null, null] as const;
}

function createHistorySeed() {
  return Array.from({ length: 28 }, () => 0);
}

function getDefaultLiveScores(
  benchmarkKind: BenchmarkKind,
  cpuRunMode: CpuRunMode,
): BenchmarkLiveScore[] {
  if (benchmarkKind === "cpu") {
    if (cpuRunMode === "singleCore") {
      return [
        {
          id: "singleCore",
          label: "Single-core live",
          score: null,
          status: "pending",
        },
      ];
    }

    if (cpuRunMode === "multiCore") {
      return [
        {
          id: "multiCore",
          label: "Multi-core live",
          score: null,
          status: "pending",
        },
      ];
    }

    return [
      {
        id: "singleCore",
        label: "Single-core live",
        score: null,
        status: "pending",
      },
      {
        id: "multiCore",
        label: "Multi-core live",
        score: null,
        status: "pending",
      },
      {
        id: "sustained",
        label: "Sustained live",
        score: null,
        status: "pending",
      },
    ];
  }

  return [
    {
      id: "graphics",
      label: "Graphics live",
      score: null,
      status: "pending",
    },
    {
      id: "compute",
      label: "Compute live",
      score: null,
      status: "pending",
    },
    {
      id: "sustained",
      label: "Sustained live",
      score: null,
      status: "pending",
    },
  ];
}

function getPlaceholderActivity(
  benchmarkKind: BenchmarkKind,
): BenchmarkActivityEntry[] {
  return benchmarkKind === "cpu"
    ? [
      {
        id: "workers",
        label: "Worker lanes",
        detail: "Per-worker throughput appears here once the run starts.",
        value: 0,
        normalized: 0.12,
      },
      {
        id: "kernels",
        label: "Kernel stream",
        detail: "The active CPU kernel and its iteration rate will stream live here.",
        value: 0,
        normalized: 0.12,
      },
    ]
    : [
      {
        id: "render",
        label: "Render queue",
        detail: "Graphics or compute batches appear here once the GPU run begins.",
        value: 0,
        normalized: 0.12,
      },
      {
        id: "dispatch",
        label: "Dispatch mix",
        detail: "The active scene or compute workload will stream live here.",
        value: 0,
        normalized: 0.12,
      },
    ];
}

export function BenchmarkExperience({
  benchmarkKind,
}: {
  benchmarkKind: BenchmarkKind;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preset: BenchmarkPreset =
    searchParams.get("preset") === "smoke" ? "smoke" : "full";
  const mockCpu = benchmarkKind === "cpu" && searchParams.get("mockCpu") === "1";
  const mockGpu = benchmarkKind === "gpu" && searchParams.get("mockGpu") === "1";
  const isMockRun =
    preset === "smoke" &&
    ((benchmarkKind === "cpu" && mockCpu) || (benchmarkKind === "gpu" && mockGpu));
  const copy = BENCHMARK_COPY[benchmarkKind];
  const { accessToken } = useAuthSession();
  const {
    currentLabel,
    currentMessage,
    deviceProfile,
    error,
    progress,
    reset,
    result,
    runState,
    setDeviceProfile,
    setError,
    setProgress,
    setResult,
    setRunState,
  } = useBenchmarkStore();
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCpuRunMode, setSelectedCpuRunMode] = useState<CpuRunMode>("full");
  const [submissionWarning, setSubmissionWarning] = useState<string | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<BenchmarkTelemetry | null>(null);
  const [activityHistory, setActivityHistory] = useState<number[]>(() =>
    createHistorySeed(),
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  function stopBenchmark() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }

  function getSupport(profileCapabilities: CapabilityFlags) {
    if (isMockRun) {
      return {
        supported: true,
        mobileBlocked: false,
      };
    }

    return getBenchmarkSupportState(benchmarkKind, profileCapabilities);
  }

  useEffect(() => {
    void profileDevice();
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkKind]);

  const support = deviceProfile ? getSupport(deviceProfile.capabilities) : null;
  const memorySummary = formatApproxMemory(deviceProfile?.deviceMemoryGb);
  const previewCards = getPreviewCards(benchmarkKind);
  const previewScores = getPreviewScores(benchmarkKind, result);
  const liveScores =
    liveTelemetry?.liveScores ?? getDefaultLiveScores(benchmarkKind, selectedCpuRunMode);
  const liveActivity =
    liveTelemetry?.activity.length
      ? liveTelemetry.activity
      : getPlaceholderActivity(benchmarkKind);
  const hasLocalOnlyResult =
    runState === "completed" &&
    Boolean(submissionWarning) &&
    result?.benchmarkKind === benchmarkKind;
  const cpuModeDuration =
    selectedCpuRunMode === "full" ? copy.duration : "3-5 minutes";

  function resetLiveSurface() {
    setLiveTelemetry(null);
    setActivityHistory(createHistorySeed());
  }

  function handleProgressUpdate(update: BenchmarkProgressUpdate) {
    setProgress(update.progress, update.label, update.message);

    if (!update.telemetry) {
      return;
    }

    setLiveTelemetry(update.telemetry);
    const activityLevel =
      update.telemetry.activity.length > 0
        ? update.telemetry.activity.reduce(
          (sum, entry) => sum + entry.normalized,
          0,
        ) / update.telemetry.activity.length
        : 0;

    setActivityHistory((previous) => [
      ...previous.slice(-(createHistorySeed().length - 1)),
      activityLevel,
    ]);
  }

  async function profileDevice() {
    try {
      resetLiveSurface();
      setRunState("detecting");
      setProgress(8, "Device detection", "Collecting browser hardware signals.");

      const profile = await detectDeviceProfile();
      const supportState = getSupport(profile.capabilities);

      setDeviceProfile(profile);
      setProgress(
        18,
        "Device ready",
        supportState.supported
          ? "Device profile captured. Start the full benchmark when ready."
          : supportState.reason ?? "This device cannot run this benchmark.",
      );
      setRunState("ready");
      setSupportMessage(supportState.reason ?? null);
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Device detection failed.",
      );
    }
  }

  async function startBenchmark(cpuRunMode: CpuRunMode = "full") {
    if (!deviceProfile) {
      await profileDevice();
      return;
    }

    const supportState = getSupport(deviceProfile.capabilities);

    if (!supportState.supported) {
      setSupportMessage(
        supportState.reason ?? "This device cannot run this benchmark.",
      );
      return;
    }

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (benchmarkKind === "cpu") {
        setSelectedCpuRunMode(cpuRunMode);
      }

      resetLiveSurface();
      setError(null);
      setSubmissionWarning(null);
      setResult(null);
      setRunState("running");
      setProgress(24, "Preparing run", "Loading benchmark runtime.");

      const benchmarkResult =
        benchmarkKind === "cpu"
          ? await runCpuBenchmark({
            preset,
            mock: isMockRun,
            runMode: cpuRunMode,
            abortSignal: abortController.signal,
            onProgress: (update) => {
              handleProgressUpdate(update);
            },
          })
          : await runGpuBenchmark({
            preset,
            mock: isMockRun,
            abortSignal: abortController.signal,
            onProgress: (update) => {
              handleProgressUpdate(update);
            },
          });

      setResult(benchmarkResult);

      setProgress(98, "Persisting result", "Submitting the result payload.");
      setIsSubmitting(true);

      const payload =
        benchmarkResult.benchmarkKind === "cpu"
          ? {
            benchmarkKind: "cpu" as const,
            deviceProfile,
            result: benchmarkResult,
            benchmarkVersion: benchmarkResult.benchmarkVersion,
          }
          : {
            benchmarkKind: "gpu" as const,
            deviceProfile,
            result: benchmarkResult,
            benchmarkVersion: benchmarkResult.benchmarkVersion,
          };

      try {
        const persisted = await submitBenchmarkResult(payload, accessToken);

        setResult(persisted);
        setRunState("completed");
        setProgress(100, "Completed", "Result saved successfully.");
        router.push(`/results/${persisted.id}`);
      } catch {
        setRunState("completed");
        setProgress(
          100,
          "Completed locally",
          "Benchmark scores are available below, but the result could not be saved.",
        );
        setSubmissionWarning(
          "Your scores weren't pushed to the leaderboard. The scores shown below are still available on this page.",
        );
      }
    } catch (runError) {
      setResult(null);
      const isAbortError = runError instanceof Error && runError.message === "The benchmark was stopped by the user.";

      if (isAbortError) {
        setRunState("ready");
        setProgress(0, "Ready", "Ready to start again.");
        setError("Benchmark was stopped manually.");
      } else {
        setProgress(
          progress,
          "Submission failed",
          "The benchmark run finished, but the result could not be saved.",
        );
        setError(
          runError instanceof Error
            ? runError.message
            : "Benchmark execution failed.",
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsSubmitting(false);
    }
  }

  const parameterCards =
    benchmarkKind === "cpu"
      ? [
        {
          label: "Mode",
          value:
            selectedCpuRunMode === "singleCore"
              ? "Single-core only"
              : selectedCpuRunMode === "multiCore"
                ? "Multi-core only"
                : "Full CPU benchmark",
        },
        {
          label: "Threads",
          value: deviceProfile
            ? `Auto (${deviceProfile.cpuLogicalCores} logical)`
            : "Auto (max)",
        },
        {
          label: "Duration",
          value: cpuModeDuration,
        },
        {
          label: "Stability",
          value:
            selectedCpuRunMode === "full"
              ? "Sustained mixed load"
              : "Not included in this run",
        },
        { label: "Engine", value: "Workers + WASM" },
      ]
      : [
        { label: "Adapter", value: "High performance" },
        { label: "Duration", value: copy.duration },
        { label: "Renderer", value: "WebGPU" },
        { label: "Stability", value: "Mixed render + compute" },
      ];

  return (
    <div className="shell-section pb-24 pt-10">
      <div>
        <div className="space-y-8">
          <section className="dashboard-card p-7 sm:p-10">
            <div className="flex flex-col gap-7">
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex size-16 items-center justify-center rounded-[1.6rem] bg-primary/10 text-primary">
                  {benchmarkKind === "cpu" ? (
                    <Cpu className="size-8" />
                  ) : (
                    <Sparkles className="size-8" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">Performance module</p>
                  <h1 className="mt-3 text-4xl font-semibold tracking-[-0.07em] text-slate-950 sm:text-5xl">
                    {copy.title}
                  </h1>
                  <p className="mt-3 text-xl text-slate-500">{copy.version}</p>
                </div>
              </div>

              <p className="max-w-4xl text-lg leading-9 text-slate-600">
                {copy.intro}
              </p>

              <div className="flex flex-col items-center gap-4">
                {runState === "running" ? (
                  <Button
                    variant="destructive"
                    className="h-20 w-full max-w-xl rounded-[2rem] px-8 text-2xl font-bold shadow-[0_20px_40px_rgba(239,68,68,0.2)] transition-all hover:-translate-y-1 hover:shadow-[0_25px_50px_rgba(239,68,68,0.3)]"
                    onClick={stopBenchmark}
                    disabled={isSubmitting}
                  >
                    <Square className="size-6 mr-2" fill="currentColor" />
                    Stop Benchmark
                  </Button>
                ) : (
                  <Button
                    className="h-20 w-full max-w-xl rounded-[2rem] bg-primary px-8 text-2xl font-bold text-primary-foreground shadow-[0_20px_40px_rgba(37,99,235,0.3)] transition-all hover:-translate-y-1 hover:shadow-[0_25px_50px_rgba(37,99,235,0.4)]"
                    disabled={isSubmitting}
                    onClick={() => void startBenchmark("full")}
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="size-6 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="size-6 mr-2" />
                    )}
                    {benchmarkKind === "cpu"
                      ? "Start Full CPU Benchmark"
                      : "Start GPU Benchmark"}
                  </Button>
                )}

                {benchmarkKind === "cpu" ? (
                  <div className="flex w-full max-w-xl flex-wrap justify-center gap-4">
                    <Button
                      variant="outline"
                      className="h-14 flex-1 rounded-full border-slate-200 bg-white px-6 text-base font-semibold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
                      disabled={runState === "running" || isSubmitting}
                      onClick={() => void startBenchmark("singleCore")}
                    >
                      Single-Core Benchmark
                    </Button>
                    <Button
                      variant="outline"
                      className="h-14 flex-1 rounded-full border-slate-200 bg-white px-6 text-base font-semibold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
                      disabled={runState === "running" || isSubmitting}
                      onClick={() => void startBenchmark("multiCore")}
                    >
                      Multi-Core Benchmark
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="metric-chip border-primary/15 bg-primary/8 text-primary">
                  <Gauge className="size-3.5" />
                  {benchmarkKind === "cpu" ? cpuModeDuration : copy.duration}
                </div>
                <div className="metric-chip">
                  <HardDrive className="size-3.5 text-slate-500" />
                  {benchmarkKind === "cpu"
                    ? selectedCpuRunMode === "full"
                      ? "Full CPU suite"
                      : selectedCpuRunMode === "singleCore"
                        ? "Single-core only"
                        : "Multi-core only"
                    : "Public runs use the full suite"}
                </div>
                {preset === "smoke" ? (
                  <div className="metric-chip border-amber-200 bg-amber-50 text-amber-700">
                    Smoke preset enabled
                  </div>
                ) : null}
              </div>

              {submissionWarning ? (
                <div className="rounded-[1.6rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
                  {submissionWarning}
                </div>
              ) : null}

              {supportMessage ? (
                <div className="rounded-[1.6rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
                  {supportMessage}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-4 text-sm leading-7 text-red-700">
                  {error}
                </div>
              ) : null}
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="dashboard-card p-7">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="eyebrow">Run state</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                    {currentLabel}
                  </h2>
                </div>
                <div className="metric-chip border-primary/15 bg-primary/8 text-primary">
                  {Math.round(progress)}%
                </div>
              </div>
              <Progress value={progress} className="h-3 rounded-full bg-slate-100" />
              <p className="mt-5 text-base leading-8 text-slate-600">
                {currentMessage}
              </p>

              <div className="mt-8">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="eyebrow">Live score estimates</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      These refresh during the run. Final scores are computed after the selected benchmark completes.
                    </p>
                  </div>
                  <div className="metric-chip border-primary/15 bg-primary/8 text-primary">
                    Live
                  </div>
                </div>

                <div
                  className={cn(
                    "grid gap-4",
                    liveScores.length === 1
                      ? "md:grid-cols-1"
                      : liveScores.length === 2
                        ? "md:grid-cols-2"
                        : "md:grid-cols-3",
                  )}
                >
                  {liveScores.map((entry) => (
                    <div key={entry.id} className="soft-tile p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="soft-label max-w-full">{entry.label}</p>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] shrink-0",
                            entry.status === "live"
                              ? "bg-primary/10 text-primary"
                              : entry.status === "complete"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500",
                          )}
                        >
                          {entry.status}
                        </span>
                      </div>
                      <p className="mt-4 text-4xl font-semibold tracking-[-0.06em] text-slate-950">
                        {entry.score !== null ? entry.score.toLocaleString() : "--"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-[0_28px_60px_rgba(15,23,42,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/90">
                      Live benchmark feed
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
                      {liveTelemetry?.title ?? "Telemetry will stream here"}
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                      {liveTelemetry?.summary ??
                        "When the benchmark starts, this area will show active workload lanes, throughput, and the calculations currently being exercised."}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                    {runState === "running"
                      ? `${liveActivity.length} live lanes`
                      : "Feed idle"}
                  </div>
                </div>

                <div className="mt-6 flex h-32 items-end gap-2 rounded-[1.3rem] border border-white/8 bg-white/5 px-4 py-4">
                  {activityHistory.map((value, index) => (
                    <div
                      key={`${benchmarkKind}-history-${index}`}
                      className="flex-1 rounded-full bg-gradient-to-t from-primary via-blue-400 to-sky-200 opacity-90 transition-all"
                      style={{
                        height: `${Math.max(10, Math.round(value * 100))}%`,
                      }}
                    />
                  ))}
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-2">
                  {liveActivity.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-[1.3rem] border border-white/8 bg-white/[0.04] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{entry.label}</p>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                          {Math.round(entry.normalized * 100)}%
                        </span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-300 via-blue-400 to-primary transition-all"
                          style={{ width: `${Math.max(8, Math.round(entry.normalized * 100))}%` }}
                        />
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {entry.detail}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(liveTelemetry?.metrics ?? [
                    {
                      label: "Run mode",
                      value:
                        benchmarkKind === "cpu"
                          ? selectedCpuRunMode === "full"
                            ? "Full CPU benchmark"
                            : selectedCpuRunMode === "singleCore"
                              ? "Single-core only"
                              : "Multi-core only"
                          : "Full GPU benchmark",
                    },
                    {
                      label: "Target duration",
                      value:
                        benchmarkKind === "cpu" ? cpuModeDuration : copy.duration,
                    },
                    {
                      label: "Status",
                      value:
                        runState === "running"
                          ? "Waiting for first samples"
                          : "Ready when you are",
                    },
                  ]).map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] px-4 py-4"
                    >
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-slate-300">
                        {item.label}
                      </p>
                      <p className="mt-3 text-base font-semibold text-white">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="dashboard-card p-7">
              <div className="mb-6 flex items-center gap-3">
                <Monitor className="size-5 text-primary" />
                <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  Device snapshot
                </h2>
              </div>

              {deviceProfile ? (
                (() => {
                  let parsedGpu = { main: deviceProfile.gpuRenderer, sub: "" };
                  if (deviceProfile.gpuRenderer.startsWith("ANGLE (")) {
                    const withoutAngle = deviceProfile.gpuRenderer.replace(/^ANGLE \(/, "").replace(/\)$/, "");
                    const parts = withoutAngle.split(',').map((s) => s.trim());
                    if (parts.length >= 2) {
                      let mainRenderer = parts[1] || "";
                      mainRenderer = mainRenderer.replace("ANGLE Metal Renderer: ", "");
                      mainRenderer = mainRenderer.replace("Direct3D11 vs_5_0 ps_5_0", "").trim();
                      mainRenderer = mainRenderer.replace("Direct3D11", "").trim();

                      const leftover = parts.filter((_, i) => i !== 1).join(", ");
                      parsedGpu = { main: mainRenderer, sub: `(${leftover})` };
                    }
                  }

                  return (
                    <>
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div className="flex flex-col justify-start rounded-[1.5rem] border border-slate-200 bg-white shadow-sm p-6 sm:p-8 min-h-[14rem]">
                          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            GPU renderer
                          </p>
                          <p className="text-2xl font-semibold leading-snug text-slate-900 lg:text-[1.7rem]">
                            {parsedGpu.main}
                          </p>
                          {parsedGpu.sub ? (
                            <p className="mt-3 text-sm leading-relaxed text-slate-500">
                              {parsedGpu.sub}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col justify-start rounded-[1.5rem] border border-slate-200 bg-white shadow-sm p-6 sm:p-8 min-h-[14rem]">
                          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            CPU cores
                          </p>
                          <p className="text-2xl font-semibold leading-snug text-slate-900 lg:text-[1.7rem]">
                            {deviceProfile.cpuLogicalCores} logical cores
                          </p>
                        </div>
                        <div className="flex flex-col justify-start rounded-[1.5rem] border border-slate-200 bg-white shadow-sm p-6 sm:p-8 min-h-[14rem]">
                          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            Display
                          </p>
                          <p className="text-2xl font-semibold leading-snug text-slate-900 lg:text-[1.7rem]">
                            {deviceProfile.display.physicalWidth} ×{" "}
                            {deviceProfile.display.physicalHeight}
                          </p>
                        </div>
                        <div className="flex flex-col justify-start rounded-[1.5rem] border border-slate-200 bg-white shadow-sm p-6 sm:p-8 min-h-[14rem]">
                          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                            Approx memory
                          </p>
                          <p className="text-2xl font-semibold leading-snug text-slate-900 lg:text-[1.7rem]">
                            {memorySummary.value}
                          </p>
                          <p className="mt-3 text-sm leading-relaxed text-slate-500">
                            {memorySummary.detail}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 flex flex-wrap gap-4">
                        {[
                          {
                            label: "WebAssembly",
                            enabled: deviceProfile.capabilities.webAssembly,
                          },
                          {
                            label: "Workers",
                            enabled: deviceProfile.capabilities.worker,
                          },
                          {
                            label: "SharedArrayBuffer",
                            enabled: deviceProfile.capabilities.sharedArrayBuffer,
                          },
                          {
                            label: "Cross-origin isolated",
                            enabled: deviceProfile.capabilities.crossOriginIsolated,
                          },
                          {
                            label: "WebGPU",
                            enabled: deviceProfile.capabilities.webgpu,
                          },
                        ].map(({ label, enabled }) => (
                          <Badge
                            key={label}
                            className={cn(
                              "rounded-full border px-4 py-2 text-sm font-medium",
                              enabled
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-slate-100 text-slate-500",
                            )}
                          >
                            {enabled ? (
                              <CheckCircle2 className="size-4 mr-1 text-emerald-600" />
                            ) : (
                              <ShieldAlert className="size-4 mr-1 text-slate-400" />
                            )}
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </>
                  );
                })()
              ) : (
                <p className="text-base leading-8 text-slate-600">
                  Device detection has not completed yet.
                </p>
              )}
            </div>
          </section>

          <section id="results-preview">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="section-heading">Results Preview</h2>
                <p className="mt-2 text-sm uppercase tracking-[0.18em] text-slate-400">
                  {getStatusLabel(runState, hasLocalOnlyResult)}
                </p>
              </div>
              <div className="metric-chip">
                <Clock3 className="size-3.5 text-primary" />
                {currentLabel}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              {previewCards.map((card, index) => (
                <div key={card.label} className="dashboard-card min-h-[20rem] p-7">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xl font-semibold tracking-[-0.04em] text-slate-900">
                      {card.label}
                    </p>
                    <div
                      className={cn(
                        "h-3 w-16 rounded-full",
                        card.tone === "primary" ? "bg-primary/15" : "bg-slate-100",
                      )}
                    />
                  </div>
                  <div className="flex min-h-[14rem] flex-col items-center justify-center text-center">
                    {previewScores[index] !== null ? (
                      <>
                        <div className="flex size-28 items-center justify-center rounded-full border-4 border-primary/15 bg-primary/5">
                          {index === 0 ? (
                            <BarChart3 className="size-10 text-primary" />
                          ) : index === 1 ? (
                            <Layers3 className="size-10 text-primary" />
                          ) : (
                            <Zap className="size-10 text-primary" />
                          )}
                        </div>
                        <p className="mt-7 text-5xl font-semibold tracking-[-0.06em] text-slate-950">
                          {previewScores[index]?.toLocaleString()}
                        </p>
                        <p className="mt-4 max-w-xs text-base leading-7 text-slate-500">
                          {submissionWarning
                            ? "Stored locally on this page. Leaderboard sync failed for this run."
                            : "Captured from the latest benchmark run."}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex size-28 items-center justify-center rounded-full border-4 border-dashed border-slate-200 bg-slate-50">
                          {index === 0 ? (
                            <BarChart3 className="size-10 text-slate-300" />
                          ) : index === 1 ? (
                            <Layers3 className="size-10 text-slate-300" />
                          ) : (
                            <Zap className="size-10 text-slate-300" />
                          )}
                        </div>
                        <p className="mt-7 text-xl font-medium text-slate-500">--</p>
                        <p className="mt-4 max-w-xs text-base leading-7 text-slate-400">
                          {runState === "running"
                            ? "Final scores land here after the selected run completes."
                            : result && result.benchmarkKind === "cpu"
                              ? "This score was not part of the selected CPU run."
                              : "Run benchmark to see score."}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="mt-6 h-4 rounded-full bg-slate-100" />
                  <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          </section>

          <section id="parameters" className="dashboard-card p-7">
            <div className="mb-6 flex items-center gap-3">
              <Info className="size-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                Test parameters
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {parameterCards.map((item) => (
                <div key={item.label} className="soft-tile p-5">
                  <p className="soft-label">{item.label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {support && !support.supported ? (
            <section className="dashboard-card border-amber-200 bg-amber-50 p-7">
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-amber-950">
                {copy.title} unavailable on this device
              </h2>
              <p className="mt-3 text-base leading-8 text-amber-900">
                {support.reason}
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
