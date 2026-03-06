"use client";

import { useEffect, useState } from "react";
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
  UserRound,
  Zap,
} from "lucide-react";
import { runCpuBenchmark } from "@/benchmarks/cpu/runner";
import { runGpuBenchmark } from "@/benchmarks/gpu/runner";
import { useAuthSession } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { submitBenchmarkResult } from "@/lib/api/benchmark-client";
import { getBenchmarkSupportState } from "@/lib/browser";
import { formatApproxMemory } from "@/lib/format-memory";
import { detectDeviceProfile } from "@/lib/hardware-detect";
import type {
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
      "Desktop browser required",
      "WebAssembly + Workers",
      "Cross-origin isolation",
      "Keep the tab visible for the full run",
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
      "Desktop browser required",
      "WebGPU support",
      "High-performance adapter preferred",
      "Keep the tab visible for the full run",
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

function getStatusLabel(runState: BenchmarkRunState) {
  switch (runState) {
    case "running":
      return "Benchmark active";
    case "completed":
      return "Result saved";
    case "error":
      return "Run interrupted";
    case "detecting":
      return "Detecting device";
    default:
      return "Waiting for data";
  }
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
  const { accessToken, authEnabled, user } = useAuthSession();
  const {
    currentLabel,
    currentMessage,
    deviceProfile,
    error,
    progress,
    reset,
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
  const cpuModeDuration =
    selectedCpuRunMode === "full" ? copy.duration : "3-5 minutes";
  const visibleStages =
    benchmarkKind === "cpu"
      ? selectedCpuRunMode === "singleCore"
        ? ["Warmup", "Single-core kernel sweep"]
        : selectedCpuRunMode === "multiCore"
          ? ["Warmup", "Multi-core worker sweep"]
          : copy.stages
      : copy.stages;

  async function profileDevice() {
    try {
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
      if (benchmarkKind === "cpu") {
        setSelectedCpuRunMode(cpuRunMode);
      }

      setRunState("running");
      setProgress(24, "Preparing run", "Loading benchmark runtime.");

      const result =
        benchmarkKind === "cpu"
          ? await runCpuBenchmark({
              preset,
              mock: isMockRun,
              runMode: cpuRunMode,
              onProgress: ({ label, message, progress: nextProgress }) => {
                setProgress(nextProgress, label, message);
              },
            })
          : await runGpuBenchmark({
              preset,
              mock: isMockRun,
              onProgress: ({ label, message, progress: nextProgress }) => {
                setProgress(nextProgress, label, message);
              },
            });

      setProgress(98, "Persisting result", "Submitting the result payload.");
      setIsSubmitting(true);

      const payload =
        result.benchmarkKind === "cpu"
          ? {
              benchmarkKind: "cpu" as const,
              deviceProfile,
              result,
              benchmarkVersion: result.benchmarkVersion,
            }
          : {
              benchmarkKind: "gpu" as const,
              deviceProfile,
              result,
              benchmarkVersion: result.benchmarkVersion,
            };

      const persisted = await submitBenchmarkResult(payload, accessToken);

      setResult(persisted);
      setRunState("completed");
      setProgress(100, "Completed", "Result saved successfully.");
      router.push(`/results/${persisted.id}`);
    } catch (runError) {
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
    } finally {
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
      <div className="grid gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-28 space-y-3">
            {sidebarItems.map((item) => {
              const Icon = item.icon;

              if (!item.href) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-full bg-primary/10 px-5 py-4 font-medium text-primary"
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 rounded-full px-5 py-4 font-medium text-slate-600 transition-colors hover:bg-white hover:text-slate-950"
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

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

              <div className="flex flex-wrap gap-4">
                <Button
                  className="h-16 rounded-full bg-primary px-8 text-xl font-semibold text-primary-foreground shadow-[0_18px_38px_rgba(37,99,235,0.25)]"
                  disabled={runState === "running" || isSubmitting}
                  onClick={() => void startBenchmark("full")}
                >
                  {runState === "running" || isSubmitting ? (
                    <LoaderCircle className="size-5 animate-spin" />
                  ) : (
                    <ArrowRight className="size-5" />
                  )}
                  {runState === "running"
                    ? "Running benchmark"
                    : benchmarkKind === "cpu"
                      ? "Start Full CPU Benchmark"
                      : "Start GPU Benchmark"}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-16 rounded-full border-slate-200 bg-white px-8 text-xl font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <Link href="#parameters">
                    <ChevronRight className="size-5" />
                    View parameters
                  </Link>
                </Button>
              </div>

              {benchmarkKind === "cpu" ? (
                <div className="flex flex-wrap gap-4">
                  <Button
                    variant="outline"
                    className="h-14 rounded-full border-slate-200 bg-white px-6 text-base font-semibold text-slate-800 hover:bg-slate-50"
                    disabled={runState === "running" || isSubmitting}
                    onClick={() => void startBenchmark("singleCore")}
                  >
                    Single-Core Benchmark
                  </Button>
                  <Button
                    variant="outline"
                    className="h-14 rounded-full border-slate-200 bg-white px-6 text-base font-semibold text-slate-800 hover:bg-slate-50"
                    disabled={runState === "running" || isSubmitting}
                    onClick={() => void startBenchmark("multiCore")}
                  >
                    Multi-Core Benchmark
                  </Button>
                </div>
              ) : null}

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

          <section id="results-preview">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="section-heading">Results Preview</h2>
                <p className="mt-2 text-sm uppercase tracking-[0.18em] text-slate-400">
                  {getStatusLabel(runState)}
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
                        ? "Benchmark active. Scores will appear after the selected run completes."
                        : "Run benchmark to see score."}
                    </p>
                  </div>
                  <div className="mt-6 h-4 rounded-full bg-slate-100" />
                  <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-100" />
                </div>
              ))}
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

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {visibleStages.map((stage) => (
                  <div key={stage} className="soft-tile px-4 py-4">
                    <p className="font-medium text-slate-900">{stage}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                {copy.requirements.map((requirement) => (
                  <div key={requirement} className="metric-chip">
                    <CheckCircle2 className="size-3.5 text-primary" />
                    {requirement}
                  </div>
                ))}
              </div>

              {authEnabled ? (
                <div className="mt-7 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-7 text-slate-600">
                  {user
                    ? "Signed in: this benchmark run will attach to the current account."
                    : "Anonymous mode is enabled. You can still run now and sign in later on the auth page."}
                </div>
              ) : null}
            </div>

            <div className="space-y-6">
              <div className="dashboard-card p-7">
                <div className="mb-6 flex items-center gap-3">
                  <Monitor className="size-5 text-primary" />
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                    Device snapshot
                  </h2>
                </div>

                {deviceProfile ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="soft-tile p-4">
                        <p className="soft-label">GPU renderer</p>
                        <p className="mt-3 text-lg font-semibold text-slate-900">
                          {deviceProfile.gpuRenderer}
                        </p>
                      </div>
                      <div className="soft-tile p-4">
                        <p className="soft-label">CPU cores</p>
                        <p className="mt-3 text-lg font-semibold text-slate-900">
                          {deviceProfile.cpuLogicalCores} logical cores
                        </p>
                      </div>
                      <div className="soft-tile p-4">
                        <p className="soft-label">Display</p>
                        <p className="mt-3 text-lg font-semibold text-slate-900">
                          {deviceProfile.display.physicalWidth} ×{" "}
                          {deviceProfile.display.physicalHeight}
                        </p>
                      </div>
                      <div className="soft-tile p-4">
                        <p className="soft-label">Approx memory</p>
                        <p className="mt-3 text-lg font-semibold text-slate-900">
                          {memorySummary.value}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {memorySummary.detail}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
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
                            "rounded-full border px-3 py-1.5",
                            enabled
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-100 text-slate-500",
                          )}
                        >
                          {enabled ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            <ShieldAlert className="size-3.5" />
                          )}
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-base leading-8 text-slate-600">
                    Device detection has not completed yet.
                  </p>
                )}
              </div>

              <div className="dashboard-card p-7">
                <div className="mb-5 flex items-center gap-3">
                  <Info className="size-5 text-primary" />
                  <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                    Run actions
                  </h2>
                </div>
                <div className="grid gap-3">
                  <Button
                    className="h-12 rounded-full bg-primary text-primary-foreground"
                    disabled={runState === "running" || isSubmitting}
                    onClick={() => void startBenchmark("full")}
                  >
                    {runState === "running" || isSubmitting ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4" />
                    )}
                    {runState === "running"
                      ? "Running benchmark"
                      : benchmarkKind === "cpu"
                        ? "Start Full CPU Benchmark"
                        : "Start GPU Benchmark"}
                  </Button>
                  {benchmarkKind === "cpu" ? (
                    <>
                      <Button
                        variant="outline"
                        className="h-12 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        disabled={runState === "running" || isSubmitting}
                        onClick={() => void startBenchmark("singleCore")}
                      >
                        Single-Core Benchmark
                      </Button>
                      <Button
                        variant="outline"
                        className="h-12 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        disabled={runState === "running" || isSubmitting}
                        onClick={() => void startBenchmark("multiCore")}
                      >
                        Multi-Core Benchmark
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="outline"
                    className="h-12 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    disabled={runState === "running"}
                    onClick={() => void profileDevice()}
                  >
                    Refresh device profile
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    <Link href="/auth">
                      <UserRound className="size-4" />
                      Auth
                    </Link>
                  </Button>
                </div>
              </div>
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
