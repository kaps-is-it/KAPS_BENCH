"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  Info,
  Layers3,
  LoaderCircle,
  Monitor,
  ShieldAlert,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { runCpuBenchmark } from "@/benchmarks/cpu/runner";
import { runGpuBenchmark } from "@/benchmarks/gpu/runner";
import {
  buildLiveProjectionViewModel,
  shouldRefreshProjectionDisplay,
  type TimedLiveProjectionViewModel,
} from "@/benchmarks/shared/live-estimation";
import { useAuthSession } from "@/components/providers/auth-provider";
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
import { listGpuAdapterOptions } from "@/lib/hardware-detect/gpu-detect";
import { detectDeviceProfile } from "@/lib/hardware-detect";
import type {
  ActiveBenchmarkResult,
  BenchmarkDisplayResult,
  BenchmarkKind,
  BenchmarkPreset,
  BenchmarkRunState,
  CapabilityFlags,
  CpuRunMode,
  GpuAdapterPreference,
  GpuAdapterSelectionOption,
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

function buildCompletedTelemetry(
  result: ActiveBenchmarkResult,
): BenchmarkTelemetry {
  if (result.benchmarkKind === "cpu") {
    const liveScores =
      result.cpuRunMode === "singleCore"
        ? [
          {
            id: "singleCore",
            label: "Single-core live",
            score: result.singleCoreScore,
            status: "complete" as const,
          },
        ]
        : result.cpuRunMode === "multiCore"
          ? [
            {
              id: "multiCore",
              label: "Multi-core live",
              score: result.multiCoreScore,
              status: "complete" as const,
            },
          ]
          : [
            {
              id: "singleCore",
              label: "Single-core live",
              score: result.singleCoreScore,
              status: "complete" as const,
            },
            {
              id: "multiCore",
              label: "Multi-core live",
              score: result.multiCoreScore,
              status: "complete" as const,
            },
            {
              id: "sustained",
              label: "Sustained live",
              score: result.sustainedScore,
              status: "complete" as const,
            },
          ];

    return {
      title: "CPU run complete",
      summary: "Final CPU result computed.",
      liveScores,
      metrics: [
        {
          label: "Completed sections",
          value:
            result.cpuRunMode === "full"
              ? "Single-core + multi-core + sustained"
              : result.cpuRunMode === "singleCore"
                ? "Single-core only"
                : "Multi-core only",
        },
      ],
      activity: [],
      projection: {
        projectedScore: result.headlineScore,
      },
    };
  }

  return {
    title: "GPU run complete",
    summary: "Final GPU result computed.",
    liveScores: [
      {
        id: "graphics",
        label: "Graphics live",
        score: result.graphicsScore,
        status: "complete",
      },
      {
        id: "compute",
        label: "Compute live",
        score: result.computeScore,
        status: "complete",
      },
      {
        id: "sustained",
        label: "Sustained live",
        score: result.sustainedScore,
        status: "complete",
      },
    ],
    metrics: [
      {
        label: "Completed sections",
        value: "Graphics + compute + sustained",
      },
    ],
    activity: [],
    projection: {
      projectedScore: averageAvailableScores(
        result.graphicsScore,
        result.computeScore,
      ),
    },
  };
}

function createHistorySeed() {
  return Array.from({ length: 28 }, () => 0);
}

function averageAvailableScores(
  ...scores: Array<number | null | undefined>
) {
  const values = scores.filter((value): value is number => value !== null && value !== undefined);

  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getDefaultGpuAdapterPreference(
  options: GpuAdapterSelectionOption[],
): GpuAdapterPreference {
  return (
    options.find((option) => option.preference === "high-performance")?.preference ??
    options[0]?.preference ??
    "high-performance"
  );
}

function getGpuAdapterPreferenceLabel(preference: GpuAdapterPreference) {
  switch (preference) {
    case "high-performance":
      return "High performance";
    case "low-power":
      return "Low power";
    default:
      return "Automatic";
  }
}

function getLiveScoreStatusTone(status: BenchmarkLiveScore["status"]) {
  switch (status) {
    case "live":
      return "bg-primary/10 text-primary";
    case "complete":
      return "bg-emerald-50 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function getAggregateLiveStatus(
  entries: Array<BenchmarkLiveScore | null | undefined>,
): BenchmarkLiveScore["status"] {
  const availableEntries = entries.filter(
    (entry): entry is BenchmarkLiveScore => Boolean(entry),
  );

  if (availableEntries.length === 0 || availableEntries.every((entry) => entry.score === null)) {
    return "pending";
  }

  if (availableEntries.every((entry) => entry.status === "complete" && entry.score !== null)) {
    return "complete";
  }

  return "live";
}

function getProjectedClassTone(projectedClass: string | null) {
  switch (projectedClass) {
    case "Flagship":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "High-End":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Performance":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "Capable":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function getConfidenceTone(confidence: number | null) {
  if (confidence === null) {
    return "bg-slate-300";
  }

  if (confidence >= 85) {
    return "bg-emerald-500";
  }

  if (confidence >= 65) {
    return "bg-primary";
  }

  if (confidence >= 40) {
    return "bg-amber-500";
  }

  return "bg-slate-400";
}

type ProjectionInfoKey =
  | "projectedClass"
  | "confidence"
  | "projectedScore";

function getProjectionInfoContent(
  infoKey: ProjectionInfoKey,
  projectedScore: number | null,
) {
  switch (infoKey) {
    case "projectedClass":
      return {
        title: "Projected class",
        description:
          "Uses the current benchmark score bands, based on the live headline estimate.",
      };
    case "confidence":
      return {
        title: "Confidence",
        description:
          "Confidence rises as more sections finish and the estimate stops moving around.",
      };
    case "projectedScore":
      return {
        title: "Projected final score",
        description:
          projectedScore !== null
            ? `Locks onto the first calibrated estimate, currently ${projectedScore.toLocaleString()}, and keeps that target steady on-screen. Confidence captures how well the ongoing run is validating it.`
            : "Waiting for the first measured samples before estimating a projected score.",
      };
  }
}

function ProjectionInfoButton({
  className,
  infoKey,
  label,
  openInfoKey,
  setOpenInfoKey,
}: {
  className?: string;
  infoKey: ProjectionInfoKey;
  label: string;
  openInfoKey: ProjectionInfoKey | null;
  setOpenInfoKey: (infoKey: ProjectionInfoKey | null) => void;
}) {
  const isOpen = openInfoKey === infoKey;

  return (
    <div
      data-projection-info-root
      className={cn("relative shrink-0", className)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`${label} info`}
        className={cn(
          "flex size-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition",
          "hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
          isOpen && "border-primary/25 text-primary",
        )}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          setOpenInfoKey(isOpen ? null : infoKey);
        }}
      >
        <Info className="size-4" />
      </button>
    </div>
  );
}

function ProjectionInfoPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div
      data-projection-info-panel
      className="absolute inset-x-3 top-12 z-20 rounded-[1rem] border border-slate-200 bg-white/98 p-3.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/8 text-primary">
          <Info className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">
            {title}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatProjectionUncertaintyBand(
  projectedRange: { low: number; high: number } | null,
) {
  if (!projectedRange) {
    return "";
  }

  return ` Internal uncertainty band: ${projectedRange.low.toLocaleString()} - ${projectedRange.high.toLocaleString()}.`;
}

function getProjectedScoreMeta({
  benchmarkKind,
  cpuRunMode,
  liveScores,
  projectedScore,
  projectedRange,
}: {
  benchmarkKind: BenchmarkKind;
  cpuRunMode: CpuRunMode;
  liveScores: BenchmarkLiveScore[];
  projectedScore: number | null;
  projectedRange: { low: number; high: number } | null;
}) {
  if (benchmarkKind === "gpu") {
    const graphicsEntry = liveScores.find((entry) => entry.id === "graphics");
    const computeEntry = liveScores.find((entry) => entry.id === "compute");

    if (
      (!graphicsEntry || graphicsEntry.status === "pending") &&
      (!computeEntry || computeEntry.status === "pending")
    ) {
      return {
        badge: "Overall",
        title: "Projected overall score",
        description:
          projectedScore !== null
            ? `Seeded from a short graphics + compute calibration around ${projectedScore.toLocaleString()}. That first calibrated target is held steady on-screen while later samples validate it.${formatProjectionUncertaintyBand(projectedRange)}`
            : "Waiting for the calibration pass before estimating the overall GPU score.",
      };
    }

    return {
      badge: "Overall",
      title: "Projected overall score",
      description:
        projectedScore !== null
          ? `Shows the locked overall GPU target from the graphics + compute path, currently ${projectedScore.toLocaleString()}. Confidence reflects how much uncertainty is still left while the run validates that target.${formatProjectionUncertaintyBand(projectedRange)}`
          : "Waiting for the first measured GPU samples before estimating the overall score.",
    };
  }

  if (cpuRunMode === "singleCore") {
    return {
      badge: "Single-core",
      title: "Projected single-core score",
      description:
        projectedScore !== null
          ? `Shows the locked single-core target, currently ${projectedScore.toLocaleString()}, while confidence continues validating it.${formatProjectionUncertaintyBand(projectedRange)}`
          : "Waiting for single-core samples before estimating the single-core score.",
    };
  }

  if (cpuRunMode === "multiCore") {
    return {
      badge: "Multi-core",
      title: "Projected multi-core score",
      description:
        projectedScore !== null
          ? `Shows the locked multi-core target, currently ${projectedScore.toLocaleString()}, while confidence continues validating it.${formatProjectionUncertaintyBand(projectedRange)}`
          : "Waiting for multi-core samples before estimating the multi-core score.",
    };
  }

  const multiCoreEntry = liveScores.find((entry) => entry.id === "multiCore");
  const sustainedEntry = liveScores.find((entry) => entry.id === "sustained");

  if (!multiCoreEntry || multiCoreEntry.status === "pending") {
    return {
      badge: "Multi-core",
      title: "Projected multi-core score",
      description:
        projectedScore !== null
          ? `Seeded from a short multi-core calibration around ${projectedScore.toLocaleString()}. That first calibrated target is held steady on-screen while the heavier sections validate it.${formatProjectionUncertaintyBand(projectedRange)}`
          : "Waiting for the calibration pass before estimating the multi-core score.",
    };
  }

  if (!sustainedEntry || sustainedEntry.status !== "complete") {
    return {
      badge: "Multi-core",
      title: "Projected multi-core score",
      description:
        projectedScore !== null
          ? `Shows the locked full CPU target, currently anchored to ${projectedScore.toLocaleString()}, while sustained load continues validating it.${formatProjectionUncertaintyBand(projectedRange)}`
          : "Waiting for enough multi-core samples before estimating the score.",
    };
  }

  return {
    badge: "Final",
    title: "Projected final score",
    description:
      projectedScore !== null
        ? `Shows the locked final target, currently ${projectedScore.toLocaleString()}, while confidence reflects how much uncertainty is still left.${formatProjectionUncertaintyBand(projectedRange)}`
        : "Waiting for the first measured samples before estimating the final score.",
  };
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
  const [gpuAdapterOptions, setGpuAdapterOptions] = useState<GpuAdapterSelectionOption[]>([]);
  const [selectedGpuAdapterPreference, setSelectedGpuAdapterPreference] =
    useState<GpuAdapterPreference>("high-performance");
  const [submissionWarning, setSubmissionWarning] = useState<string | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<BenchmarkTelemetry | null>(null);
  const [liveProjection, setLiveProjection] =
    useState<TimedLiveProjectionViewModel | null>(null);
  const [lockedProjection, setLockedProjection] = useState<{
    projectedScore: number;
    projectedClass: string;
  } | null>(null);
  const [openProjectionInfoKey, setOpenProjectionInfoKey] =
    useState<ProjectionInfoKey | null>(null);
  const [activityHistory, setActivityHistory] = useState<number[]>(() =>
    createHistorySeed(),
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const isProfilingDeviceRef = useRef(false);
  const liveProjectionRef = useRef<TimedLiveProjectionViewModel | null>(null);
  const lockedProjectionRef = useRef<{
    projectedScore: number;
    projectedClass: string;
  } | null>(null);
  const projectionHistoryRef = useRef<number[]>([]);

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
    stopBenchmark();
    reset();
    resetLiveSurface();
    setSupportMessage(null);
    setOpenProjectionInfoKey(null);
    setGpuAdapterOptions([]);
    setSelectedGpuAdapterPreference("high-performance");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkKind]);

  useEffect(() => {
    if (
      runState !== "idle" ||
      deviceProfile ||
      error ||
      isProfilingDeviceRef.current
    ) {
      return;
    }

    void profileDevice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmarkKind, deviceProfile, error, runState]);

  useEffect(() => {
    return () => {
      stopBenchmark();
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        (event.target.closest("[data-projection-info-root]") ||
          event.target.closest("[data-projection-info-panel]"))
      ) {
        return;
      }

      setOpenProjectionInfoKey(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenProjectionInfoKey(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
  const gpuGraphicsLiveEntry =
    benchmarkKind === "gpu"
      ? liveScores.find((entry) => entry.id === "graphics") ?? null
      : null;
  const gpuComputeLiveEntry =
    benchmarkKind === "gpu"
      ? liveScores.find((entry) => entry.id === "compute") ?? null
      : null;
  const gpuSustainedLiveEntry =
    benchmarkKind === "gpu"
      ? liveScores.find((entry) => entry.id === "sustained") ?? null
      : null;
  const gpuOverallLiveScore =
    benchmarkKind === "gpu"
      ? averageAvailableScores(
        gpuGraphicsLiveEntry?.score ?? null,
        gpuComputeLiveEntry?.score ?? null,
      )
      : null;
  const gpuOverallLiveStatus =
    benchmarkKind === "gpu"
      ? getAggregateLiveStatus([gpuGraphicsLiveEntry, gpuComputeLiveEntry])
      : "pending";
  const gpuOverallPreviewScore =
    benchmarkKind === "gpu" && result?.benchmarkKind === "gpu"
      ? averageAvailableScores(result.graphicsScore, result.computeScore)
      : null;
  const selectedGpuAdapterOption =
    benchmarkKind === "gpu"
      ? gpuAdapterOptions.find(
        (option) => option.preference === selectedGpuAdapterPreference,
      ) ?? gpuAdapterOptions[0] ?? null
      : null;
  const projectedClass =
    lockedProjection?.projectedClass ?? liveProjection?.projectedClass ?? null;
  const projectedConfidence = liveProjection?.confidence ?? null;
  const projectedRange = liveProjection?.range ?? null;
  const projectedScore =
    lockedProjection?.projectedScore ?? liveProjection?.projectedScore ?? null;
  const projectedClassInfo = getProjectionInfoContent(
    "projectedClass",
    projectedScore,
  );
  const projectedConfidenceInfo = getProjectionInfoContent(
    "confidence",
    projectedScore,
  );
  const projectedScoreMeta = getProjectedScoreMeta({
    benchmarkKind,
    cpuRunMode: selectedCpuRunMode,
    liveScores,
    projectedScore,
    projectedRange,
  });
  const hasLocalOnlyResult =
    runState === "completed" &&
    Boolean(submissionWarning) &&
    result?.benchmarkKind === benchmarkKind;
  const cpuModeDuration =
    selectedCpuRunMode === "full" ? copy.duration : "3-5 minutes";

  function resetLiveSurface() {
    setLiveTelemetry(null);
    setLiveProjection(null);
    setLockedProjection(null);
    setActivityHistory(createHistorySeed());
    liveProjectionRef.current = null;
    lockedProjectionRef.current = null;
    projectionHistoryRef.current = [];
  }

  function syncProjectionSurface({
    telemetry,
    progress: nextProgress,
    cpuRunMode = selectedCpuRunMode,
    force = false,
  }: {
    telemetry: BenchmarkTelemetry;
    progress: number;
    cpuRunMode?: CpuRunMode;
    force?: boolean;
  }) {
    setLiveTelemetry(telemetry);

    const nextProjection = buildLiveProjectionViewModel({
      benchmarkKind,
      cpuRunMode,
      progress: nextProgress,
      telemetry,
      recentProjectedScores: projectionHistoryRef.current,
    });

    if (!nextProjection) {
      return;
    }

    if (!lockedProjectionRef.current) {
      const initialProjection = {
        projectedScore: nextProjection.projectedScore,
        projectedClass: nextProjection.projectedClass,
      };

      lockedProjectionRef.current = initialProjection;
      setLockedProjection(initialProjection);
    }

    projectionHistoryRef.current = [
      ...projectionHistoryRef.current.slice(-7),
      nextProjection.projectedScore,
    ];

    const now = Date.now();

    if (
      force ||
      shouldRefreshProjectionDisplay(liveProjectionRef.current, nextProjection, now)
    ) {
      const nextDisplay = {
        ...nextProjection,
        updatedAt: now,
      };

      liveProjectionRef.current = nextDisplay;
      setLiveProjection(nextDisplay);
    }
  }

  function handleProgressUpdate(
    update: BenchmarkProgressUpdate,
    cpuRunMode: CpuRunMode = selectedCpuRunMode,
  ) {
    setProgress(update.progress, update.label, update.message);

    if (!update.telemetry) {
      return;
    }

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

    syncProjectionSurface({
      telemetry: update.telemetry,
      progress: update.progress,
      cpuRunMode,
    });
  }

  async function profileDevice() {
    if (isProfilingDeviceRef.current) {
      return;
    }

    isProfilingDeviceRef.current = true;

    try {
      stopBenchmark();
      reset();
      resetLiveSurface();
      setSupportMessage(null);
      setRunState("detecting");
      setProgress(8, "Device detection", "Collecting browser hardware signals.");

      const [profile, adapterOptions] = await Promise.all([
        detectDeviceProfile(),
        benchmarkKind === "gpu"
          ? listGpuAdapterOptions()
          : Promise.resolve([] as GpuAdapterSelectionOption[]),
      ]);
      const supportState = getSupport(profile.capabilities);

      setDeviceProfile(profile);
      setGpuAdapterOptions(adapterOptions);
      setSelectedGpuAdapterPreference((previous) => {
        if (adapterOptions.some((option) => option.preference === previous)) {
          return previous;
        }

        return getDefaultGpuAdapterPreference(adapterOptions);
      });
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
    } finally {
      isProfilingDeviceRef.current = false;
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
              handleProgressUpdate(update, cpuRunMode);
            },
          })
          : await runGpuBenchmark({
            preset,
            mock: isMockRun,
            adapterPreference: selectedGpuAdapterPreference,
            abortSignal: abortController.signal,
            onProgress: (update) => {
              handleProgressUpdate(update);
            },
          });

      setResult(benchmarkResult);
      syncProjectionSurface({
        telemetry: buildCompletedTelemetry(benchmarkResult),
        progress: 96,
        cpuRunMode:
          benchmarkResult.benchmarkKind === "cpu"
            ? benchmarkResult.cpuRunMode
            : selectedCpuRunMode,
        force: true,
      });

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
                ) : benchmarkKind === "gpu" ? (
                  <div className="w-full max-w-xl rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-4 shadow-sm sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Monitor className="size-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          GPU target
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {gpuAdapterOptions.length > 1
                            ? "Choose which browser-exposed WebGPU adapter target to benchmark."
                            : "The browser chooses the adapter target. If it exposes multiple GPU targets, you can select them here."}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <select
                        value={selectedGpuAdapterPreference}
                        disabled={runState === "running" || isSubmitting}
                        onChange={(event) => {
                          setSelectedGpuAdapterPreference(
                            event.target.value as GpuAdapterPreference,
                          );
                        }}
                        className="h-14 w-full rounded-[1.15rem] border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-primary/35 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {(gpuAdapterOptions.length > 0
                          ? gpuAdapterOptions
                          : [
                            {
                              preference: "high-performance" as const,
                              label: "High-performance target",
                              adapterName: "High-performance target",
                              description:
                                "Ask the browser for a high-performance WebGPU adapter.",
                            },
                            {
                              preference: "low-power" as const,
                              label: "Low-power target",
                              adapterName: "Low-power target",
                              description:
                                "Ask the browser for a low-power WebGPU adapter.",
                            },
                            {
                              preference: "auto" as const,
                              label: "Automatic target",
                              adapterName: "Automatic target",
                              description:
                                "Let the browser choose the default WebGPU adapter.",
                            },
                          ]).map((option) => (
                          <option key={option.preference} value={option.preference}>
                            {`${getGpuAdapterPreferenceLabel(option.preference)} • ${option.adapterName}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {selectedGpuAdapterOption?.description ??
                        "WebGPU does not provide a full hardware picker, so this is a best-effort adapter target selection."}
                    </p>
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
                {benchmarkKind === "gpu" && selectedGpuAdapterOption ? (
                  <div className="metric-chip border-primary/15 bg-primary/8 text-primary">
                    <Monitor className="size-3.5" />
                    {`${getGpuAdapterPreferenceLabel(
                      selectedGpuAdapterOption.preference,
                    )} GPU: ${selectedGpuAdapterOption.adapterName}`}
                  </div>
                ) : null}
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

	              <div className="mt-6 grid gap-4 md:grid-cols-3">
	                <div className="soft-tile relative p-4">
	                  <ProjectionInfoButton
	                    className="absolute right-4 top-4"
	                    infoKey="projectedClass"
	                    label="Projected class"
	                    openInfoKey={openProjectionInfoKey}
	                    setOpenInfoKey={setOpenProjectionInfoKey}
	                  />
	                  <p className="soft-label pr-10">Projected class</p>
	                  <div className="mt-3">
	                    <span
	                      className={cn(
	                        "rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.15em]",
	                        getProjectedClassTone(projectedClass),
	                      )}
	                    >
	                      {projectedClass ?? "Calibrating"}
	                    </span>
	                  </div>
	                  <p className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
	                    {projectedClass ?? "--"}
	                  </p>
	                  {openProjectionInfoKey === "projectedClass" ? (
	                    <ProjectionInfoPanel
	                      title={projectedClassInfo.title}
	                      description={projectedClassInfo.description}
	                    />
	                  ) : null}
	                </div>

	                <div className="soft-tile relative p-4">
	                  <ProjectionInfoButton
	                    className="absolute right-4 top-4"
	                    infoKey="confidence"
	                    label="Confidence"
	                    openInfoKey={openProjectionInfoKey}
	                    setOpenInfoKey={setOpenProjectionInfoKey}
	                  />
	                  <p className="soft-label pr-10">Confidence</p>
	                  <p className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
	                    {projectedConfidence !== null ? `${projectedConfidence}%` : "--"}
	                  </p>
	                  <div className="mt-4 h-2 rounded-full bg-slate-100">
	                    <div
	                      className={cn(
	                        "h-full rounded-full transition-all",
	                        getConfidenceTone(projectedConfidence),
	                      )}
	                      style={{ width: `${projectedConfidence ?? 0}%` }}
	                    />
	                  </div>
	                  {openProjectionInfoKey === "confidence" ? (
	                    <ProjectionInfoPanel
	                      title={projectedConfidenceInfo.title}
	                      description={projectedConfidenceInfo.description}
	                    />
	                  ) : null}
	                </div>

	                <div className="soft-tile relative p-4">
	                  <ProjectionInfoButton
	                    className="absolute right-4 top-4"
	                    infoKey="projectedScore"
	                    label="Projected final score"
	                    openInfoKey={openProjectionInfoKey}
	                    setOpenInfoKey={setOpenProjectionInfoKey}
	                  />
	                  <p className="soft-label pr-10">Projected score</p>
	                  <div className="mt-3">
	                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-slate-600">
	                      {projectedScoreMeta.badge}
	                    </span>
	                  </div>
	                  <p className="mt-4 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
	                    {projectedScore !== null
	                      ? projectedScore.toLocaleString()
	                      : "--"}
	                  </p>
	                  {openProjectionInfoKey === "projectedScore" ? (
	                    <ProjectionInfoPanel
	                      title={projectedScoreMeta.title}
	                      description={projectedScoreMeta.description}
	                    />
	                  ) : null}
	                </div>
	              </div>

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

                {benchmarkKind === "gpu" ? (
                  <div className="grid gap-4 md:grid-cols-[0.95fr_1.15fr_0.95fr]">
                    <div className="soft-tile flex min-h-[11.5rem] flex-col border-primary/15 bg-primary/[0.04] p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="soft-label max-w-full">Overall live</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Primary GPU headline
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em]",
                            getLiveScoreStatusTone(gpuOverallLiveStatus),
                          )}
                        >
                          {gpuOverallLiveStatus}
                        </span>
                      </div>
                      <div className="mt-auto">
                        <p className="text-5xl font-semibold tracking-[-0.06em] text-slate-950">
                          {gpuOverallLiveScore !== null
                            ? gpuOverallLiveScore.toLocaleString()
                            : "--"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Avg. of graphics and compute.
                        </p>
                      </div>
                    </div>

                    <div className="soft-tile flex min-h-[11.5rem] flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="soft-label max-w-full">Graphics + compute</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Secondary breakdown
                          </p>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-slate-600">
                          Detail
                        </div>
                      </div>
                      <div className="mt-5 space-y-4">
                        {[
                          {
                            entry: gpuGraphicsLiveEntry,
                            label: "Graphics",
                          },
                          {
                            entry: gpuComputeLiveEntry,
                            label: "Compute",
                          },
                        ].map(({ entry, label }, index) => (
                          <div
                            key={entry?.id ?? `gpu-breakdown-${label.toLowerCase()}`}
                            className={cn(
                              "flex items-center justify-between gap-4",
                              index > 0 && "border-t border-slate-200 pt-4",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
                                  {label}
                                </p>
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.14em]",
                                    getLiveScoreStatusTone(entry?.status ?? "pending"),
                                  )}
                                >
                                  {entry?.status ?? "pending"}
                                </span>
                              </div>
                              <p className="mt-1 text-sm leading-6 text-slate-500">
                                {label === "Graphics"
                                  ? "Render throughput"
                                  : "Shader / compute throughput"}
                              </p>
                            </div>
                            <p className="shrink-0 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
                              {entry?.score !== null && entry?.score !== undefined
                                ? entry.score.toLocaleString()
                                : "--"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="soft-tile flex min-h-[11.5rem] flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="soft-label max-w-full">Sustained live</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">
                            Long-run stability
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.15em]",
                            getLiveScoreStatusTone(gpuSustainedLiveEntry?.status ?? "pending"),
                          )}
                        >
                          {gpuSustainedLiveEntry?.status ?? "pending"}
                        </span>
                      </div>
                      <div className="mt-auto">
                        <p className="text-5xl font-semibold tracking-[-0.06em] text-slate-950">
                          {gpuSustainedLiveEntry?.score !== null &&
                          gpuSustainedLiveEntry?.score !== undefined
                            ? gpuSustainedLiveEntry.score.toLocaleString()
                            : "--"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Mixed-load late-run score.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
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
                              getLiveScoreStatusTone(entry.status),
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
                )}
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

                  const gpuSnapshotName =
                    benchmarkKind === "gpu" && selectedGpuAdapterOption
                      ? selectedGpuAdapterOption.adapterName
                      : deviceProfile.webgpuInfo?.device ??
                        deviceProfile.webgpuInfo?.description ??
                        parsedGpu.main;
                  const gpuSnapshotDetail =
                    benchmarkKind === "gpu" && selectedGpuAdapterOption
                      ? selectedGpuAdapterOption.description
                      : parsedGpu.sub;
                  const gpuSnapshotEyebrow =
                    benchmarkKind === "gpu" && selectedGpuAdapterOption
                      ? "Benchmark target adapter"
                      : "Primary graphics adapter";
                  const gpuSnapshotCaption =
                    benchmarkKind === "gpu" && selectedGpuAdapterOption
                      ? "Selected WebGPU adapter target"
                      : "Browser-detected renderer profile";

                  const capabilityItems = [
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
                  ];
                  const enabledCapabilityCount = capabilityItems.filter(
                    (item) => item.enabled,
                  ).length;
                  const compactMemoryDetail =
                    !deviceProfile.deviceMemoryGb
                      ? "No browser estimate available."
                      : deviceProfile.deviceMemoryGb >= 8
                        ? "Browser lower bound. RAM may be higher."
                        : "Browser lower bound, privacy-rounded.";

                  return (
                    <>
                      <div className="grid gap-4">
                        <div
                          className="relative overflow-hidden rounded-[1.9rem] p-6 text-white shadow-[0_28px_60px_rgba(37,99,235,0.22)] sm:p-8"
                          style={{
                            background:
                              "radial-gradient(circle at top left, rgba(186,230,253,0.28), transparent 28%), radial-gradient(circle at bottom right, rgba(96,165,250,0.24), transparent 32%), linear-gradient(135deg, #0f172a 0%, #1d4ed8 58%, #38bdf8 100%)",
                          }}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_48%,rgba(255,255,255,0.04))]" />
                          <div className="relative">
                            <div>
                              <div className="flex items-center gap-3">
                                <div className="flex size-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
                                  <Sparkles className="size-5 text-sky-100" />
                                </div>
                                <div>
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-blue-100/90">
                                    {gpuSnapshotEyebrow}
                                  </p>
                                  <p className="mt-1 text-sm text-blue-100/75">
                                    {gpuSnapshotCaption}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-8">
                                <p className="max-w-xl text-4xl font-semibold leading-[0.94] tracking-[-0.07em] text-white sm:text-5xl">
                                  {gpuSnapshotName}
                                </p>
                                {gpuSnapshotDetail ? (
                                  <p className="mt-4 max-w-[28rem] text-base leading-7 text-blue-50/82">
                                    {gpuSnapshotDetail}
                                  </p>
                                ) : (
                                  <p className="mt-4 max-w-[28rem] text-base leading-7 text-blue-50/82">
                                    This adapter name is pulled directly from the browser runtime so the hardware identity stays front and center during the run.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="mt-8 grid gap-3 sm:grid-cols-2">
                              <div className="flex min-h-[11.5rem] flex-col rounded-[1.35rem] border border-white/12 bg-white/10 px-5 py-5 backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                  <div className="flex size-10 items-center justify-center rounded-2xl bg-white/12 text-white">
                                    <Cpu className="size-4.5" />
                                  </div>
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-blue-100/88">
                                    CPU profile
                                  </p>
                                </div>
                                <p className="mt-5 text-4xl font-semibold tracking-[-0.06em] text-white">
                                  {deviceProfile.cpuLogicalCores}
                                </p>
                                <p className="mt-2 max-w-[9rem] text-sm leading-6 text-blue-50/80">
                                  logical cores detected
                                </p>
                              </div>

                              <div className="flex min-h-[11.5rem] flex-col rounded-[1.35rem] border border-white/12 bg-white/10 px-5 py-5 backdrop-blur-sm">
                                <div className="flex items-center gap-3">
                                  <div className="flex size-10 items-center justify-center rounded-2xl bg-white/12 text-white">
                                    <HardDrive className="size-4.5" />
                                  </div>
                                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-blue-100/88">
                                    Approx memory
                                  </p>
                                </div>
                                <p className="mt-5 text-[2.2rem] font-semibold leading-[1.02] tracking-[-0.05em] text-white">
                                  {memorySummary.value}
                                </p>
                                <p className="mt-3 max-w-[12rem] text-sm leading-6 text-blue-50/78">
                                  {compactMemoryDetail}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
                          <div className="soft-tile relative overflow-hidden p-6 pr-20 sm:col-span-2 min-h-[12.5rem]">
                            <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-primary/0 via-primary/45 to-primary/0" />
                            <div className="absolute right-5 top-5 flex size-12 items-center justify-center rounded-[1.2rem] bg-primary/10 text-primary">
                              <Monitor className="size-5" />
                            </div>
                            <div>
                              <p className="soft-label">Display profile</p>
                              <p className="mt-4 text-[2.9rem] font-semibold leading-[0.92] tracking-[-0.06em] text-slate-950">
                                {deviceProfile.display.physicalWidth} ×{" "}
                                {deviceProfile.display.physicalHeight}
                              </p>
                              <p className="mt-3 max-w-[15rem] text-sm leading-6 text-slate-500">
                                Physical panel resolution reported by the browser.
                              </p>
                            </div>
                          </div>

                          <div className="soft-tile flex min-h-[11rem] flex-col p-5 sm:p-6">
                            <p className="soft-label">Pixel ratio</p>
                            <p className="mt-5 text-[2.4rem] font-semibold leading-none tracking-[-0.05em] text-slate-950">
                              {deviceProfile.display.devicePixelRatio.toFixed(2)}x
                            </p>
                            <p className="mt-3 max-w-[9rem] text-sm leading-6 text-slate-500">
                              Active display scale factor.
                            </p>
                          </div>

                          <div className="soft-tile flex min-h-[11rem] flex-col p-5 sm:p-6">
                            <p className="soft-label">Color depth</p>
                            <p className="mt-5 text-[2.4rem] font-semibold leading-[0.96] tracking-[-0.05em] text-slate-950">
                              {deviceProfile.display.colorDepth}-bit
                            </p>
                            <p className="mt-3 max-w-[9rem] text-sm leading-6 text-slate-500">
                              Current output color mode.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 overflow-hidden rounded-[1.7rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_24px_50px_rgba(15,23,42,0.14)]">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-sky-200/85">
                              Capability matrix
                            </p>
                            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
                              {enabledCapabilityCount}/{capabilityItems.length} runtime features ready
                            </h3>
                          </div>
                          <div className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                            {deviceProfile.webgpuSupported
                              ? "Hardware acceleration active"
                              : "Fallback path only"}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {capabilityItems.map(({ label, enabled }) => (
                            <div
                              key={label}
                              className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "flex size-9 items-center justify-center rounded-full",
                                      enabled
                                        ? "bg-emerald-400/12 text-emerald-300"
                                        : "bg-white/8 text-slate-400",
                                    )}
                                  >
                                    {enabled ? (
                                      <CheckCircle2 className="size-4" />
                                    ) : (
                                      <ShieldAlert className="size-4" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">
                                      {label}
                                    </p>
                                    <p className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                      {enabled ? "Ready" : "Unavailable"}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    "size-2.5 rounded-full",
                                    enabled ? "bg-emerald-300" : "bg-slate-500",
                                  )}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
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

            {benchmarkKind === "gpu" ? (
              <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr_0.95fr]">
                <div className="dashboard-card min-h-[20rem] p-7">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xl font-semibold tracking-[-0.04em] text-slate-900">
                      Overall GPU Score
                    </p>
                    <div className="h-3 w-16 rounded-full bg-primary/15" />
                  </div>
                  <div className="flex min-h-[14rem] flex-col items-center justify-center text-center">
                    {gpuOverallPreviewScore !== null ? (
                      <>
                        <div className="flex size-28 items-center justify-center rounded-full border-4 border-primary/15 bg-primary/5">
                          <BarChart3 className="size-10 text-primary" />
                        </div>
                        <p className="mt-7 text-5xl font-semibold tracking-[-0.06em] text-slate-950">
                          {gpuOverallPreviewScore.toLocaleString()}
                        </p>
                        <p className="mt-4 max-w-xs text-base leading-7 text-slate-500">
                          Main GPU headline from the latest run.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex size-28 items-center justify-center rounded-full border-4 border-dashed border-slate-200 bg-slate-50">
                          <BarChart3 className="size-10 text-slate-300" />
                        </div>
                        <p className="mt-7 text-xl font-medium text-slate-500">--</p>
                        <p className="mt-4 max-w-xs text-base leading-7 text-slate-400">
                          {runState === "running"
                            ? "Final scores land here after the selected run completes."
                            : "Run benchmark to see score."}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="mt-6 h-4 rounded-full bg-slate-100" />
                  <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-100" />
                </div>

                <div className="dashboard-card min-h-[20rem] p-7">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xl font-semibold tracking-[-0.04em] text-slate-900">
                      Graphics + Compute
                    </p>
                    <div className="h-3 w-16 rounded-full bg-slate-100" />
                  </div>
                  <div className="mt-8 space-y-5">
                    {[
                      {
                        label: "Graphics score",
                        icon: <Layers3 className="size-7 text-primary" />,
                        score:
                          result?.benchmarkKind === "gpu" ? result.graphicsScore : null,
                      },
                      {
                        label: "Compute score",
                        icon: <Sparkles className="size-7 text-primary" />,
                        score:
                          result?.benchmarkKind === "gpu" ? result.computeScore : null,
                      },
                    ].map((entry) => (
                      <div
                        key={entry.label}
                        className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 px-5 py-4.5"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-full border border-primary/15 bg-primary/5">
                              {entry.icon}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {entry.label}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-500">
                                {entry.label === "Graphics score"
                                  ? "Render-focused throughput result."
                                  : "Compute-focused throughput result."}
                              </p>
                            </div>
                          </div>
                          {entry.score !== null ? (
                            <p className="shrink-0 text-4xl font-semibold tracking-[-0.06em] text-slate-950">
                              {entry.score.toLocaleString()}
                            </p>
                          ) : (
                            <p className="text-xl font-medium text-slate-500">--</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="dashboard-card min-h-[20rem] p-7">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xl font-semibold tracking-[-0.04em] text-slate-900">
                      Sustained Score
                    </p>
                    <div className="h-3 w-16 rounded-full bg-slate-100" />
                  </div>
                  <div className="flex min-h-[14rem] flex-col items-center justify-center text-center">
                    {result?.benchmarkKind === "gpu" ? (
                      <>
                        <div className="flex size-28 items-center justify-center rounded-full border-4 border-primary/15 bg-primary/5">
                          <Zap className="size-10 text-primary" />
                        </div>
                        <p className="mt-7 text-5xl font-semibold tracking-[-0.06em] text-slate-950">
                          {result.sustainedScore.toLocaleString()}
                        </p>
                        <p className="mt-4 max-w-xs text-base leading-7 text-slate-500">
                          Late-run mixed GPU stability under sustained pressure.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex size-28 items-center justify-center rounded-full border-4 border-dashed border-slate-200 bg-slate-50">
                          <Zap className="size-10 text-slate-300" />
                        </div>
                        <p className="mt-7 text-xl font-medium text-slate-500">--</p>
                        <p className="mt-4 max-w-xs text-base leading-7 text-slate-400">
                          {runState === "running"
                            ? "Final scores land here after the selected run completes."
                            : "Run benchmark to see score."}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="mt-6 h-4 rounded-full bg-slate-100" />
                  <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-100" />
                </div>
              </div>
            ) : (
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
            )}
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
