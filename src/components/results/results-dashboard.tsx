"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Copy, Cpu, RotateCcw, Share2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatApproxMemory } from "@/lib/format-memory";
import type { PersistedBenchmarkResult } from "@/lib/types";

function getResultHeading(result: PersistedBenchmarkResult) {
  if (result.benchmarkKind === "cpu") {
    const modeLabel =
      result.cpuRunMode === "singleCore"
        ? "Single-Core CPU Benchmark"
        : result.cpuRunMode === "multiCore"
          ? "Multi-Core CPU Benchmark"
          : "CPU Benchmark";

    return {
      badge: modeLabel,
      headline: result.cpuScore,
      rerunHref: "/benchmark/cpu" as Route,
      accentIcon: Cpu,
    };
  }

  if (result.benchmarkKind === "gpu") {
    return {
      badge: "GPU Benchmark",
      headline: result.gpuScore,
      rerunHref: "/benchmark/gpu" as Route,
      accentIcon: Sparkles,
    };
  }

  return {
    badge: "Legacy coding result",
    headline: result.codingScore,
    rerunHref: "/" as Route,
    accentIcon: Cpu,
  };
}

function getSubScoreCards(result: PersistedBenchmarkResult) {
  if (result.benchmarkKind === "legacy-coding") {
    return Object.values(result.subScores).map((subScore) => ({
      id: subScore.id,
      label: subScore.label,
      score: subScore.normalizedScore,
      measured: `${subScore.durationMs.toFixed(2)} ms`,
      reference: `${subScore.referenceMs.toFixed(2)} ms`,
      notes: subScore.notes,
      workerCount: subScore.workerCount,
    }));
  }

  return Object.values(result.subScores)
    .filter((subScore): subScore is NonNullable<typeof subScore> => Boolean(subScore))
    .map((subScore) => ({
    id: subScore.id,
    label: subScore.label,
    score: subScore.score,
    measured: `${subScore.measuredValue.toFixed(1)} ${subScore.unit}`,
    reference: `${subScore.referenceValue.toFixed(1)} ${subScore.unit}`,
    notes: subScore.notes,
    workerCount: subScore.workerCount,
    }));
}

function getMetadataRows(result: PersistedBenchmarkResult) {
  if (result.benchmarkKind === "cpu") {
    return [
      `Run mode: ${
        result.cpuRunMode === "singleCore"
          ? "single-core only"
          : result.cpuRunMode === "multiCore"
            ? "multi-core only"
            : "full CPU benchmark"
      }`,
      `Preset: ${result.rawMetrics.preset}`,
      `Workers used: ${result.rawMetrics.workerCount}`,
      `WASM bytes: ${result.rawMetrics.wasmBytes.toLocaleString()}`,
      `Cross-origin isolated: ${result.rawMetrics.crossOriginIsolated ? "yes" : "no"}`,
      `Total duration: ${result.rawMetrics.totalDurationMs.toLocaleString()} ms`,
      `Checksum: ${result.rawMetrics.checksum}`,
    ];
  }

  if (result.benchmarkKind === "gpu") {
    return [
      `Preset: ${result.rawMetrics.preset}`,
      `Adapter: ${result.rawMetrics.adapterName}`,
      `Timestamp queries: ${
        result.rawMetrics.timestampQueryUsed ? "used" : "not used"
      }`,
      `Graphics duration: ${result.rawMetrics.graphicsDurationMs.toLocaleString()} ms`,
      `Total duration: ${result.rawMetrics.totalDurationMs.toLocaleString()} ms`,
      `Checksum: ${result.rawMetrics.checksum}`,
    ];
  }

  return [
    `Preset: ${result.rawMetrics.preset}`,
    `Workers used: ${result.rawMetrics.workerCount}`,
    `WASM bytes: ${result.rawMetrics.wasmBytes.toLocaleString()}`,
    `JS payload bytes: ${result.rawMetrics.jsPayloadBytes.toLocaleString()}`,
    `Total duration: ${result.rawMetrics.totalDurationMs.toLocaleString()} ms`,
    `Checksum: ${result.rawMetrics.checksum.toFixed(4)}`,
  ];
}

export function ResultsDashboard({
  result,
}: {
  result: PersistedBenchmarkResult;
}) {
  const [copied, setCopied] = useState(false);
  const heading = getResultHeading(result);
  const AccentIcon = heading.accentIcon;
  const createdAt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(result.createdAt));
  const memorySummary = formatApproxMemory(result.deviceProfile.deviceMemoryGb);
  const scoreCards = getSubScoreCards(result);
  const metadataRows = getMetadataRows(result);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 pb-24 pt-8 sm:px-8 lg:px-12">
      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="surface-panel">
          <CardHeader className="space-y-4">
            <Badge className="w-fit rounded-full border-primary/25 bg-primary/10 text-primary">
              {heading.badge}
            </Badge>
            <div className="flex items-end justify-between gap-4">
              <div>
                <CardTitle className="text-5xl tracking-[-0.06em]">
                  {heading.headline}
                </CardTitle>
                <p className="mt-3 text-xl text-slate-600">{result.rating}</p>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
                <AccentIcon className="size-5 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="soft-tile p-4">
                <p className="soft-label">Recorded</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">{createdAt}</p>
              </div>
              <div className="soft-tile p-4">
                <p className="soft-label">Browser</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">
                  {result.browserName} {result.browserVersion}
                </p>
              </div>
              <div className="soft-tile p-4">
                <p className="soft-label">Platform</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">
                  {result.osPlatform}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                className="rounded-full bg-primary text-primary-foreground"
                onClick={() => void handleCopy()}
              >
                {copied ? <Share2 className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied share URL" : "Copy share URL"}
              </Button>
              <Button
                asChild
                variant="outline"
                className="rounded-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                <Link href={heading.rerunHref}>
                  <RotateCcw className="size-4" />
                  Run again
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-2xl tracking-[-0.04em]">
              Device profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="soft-tile p-4">
              <p className="soft-label">GPU</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {result.deviceProfile.gpuRenderer}
              </p>
            </div>
            <div className="soft-tile p-4">
              <p className="soft-label">CPU cores</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {result.deviceProfile.cpuLogicalCores} logical cores
              </p>
            </div>
            <div className="soft-tile p-4">
              <p className="soft-label">Display</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {result.deviceProfile.display.physicalWidth} ×{" "}
                {result.deviceProfile.display.physicalHeight}
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
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-2xl tracking-[-0.04em]">
              Subscore breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {scoreCards.map((subScore) => (
              <div key={subScore.id} className="soft-tile p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="soft-label">{subScore.label}</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-950">
                      {subScore.score}
                    </p>
                  </div>
                  {subScore.workerCount ? (
                    <Badge className="rounded-full border-slate-200 bg-white text-slate-500">
                      {subScore.workerCount} worker
                      {subScore.workerCount > 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-5 space-y-2 text-sm leading-7 text-slate-600">
                  <p>Measured: {subScore.measured}</p>
                  <p>Reference: {subScore.reference}</p>
                  <p>{subScore.notes}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-2xl tracking-[-0.04em]">
                Run metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
              {metadataRows.map((row) => (
                <div key={row}>{row}</div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader>
              <CardTitle className="text-2xl tracking-[-0.04em]">
                Benchmark version
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
              {result.benchmarkKind === "legacy-coding" ? (
                <p>
                  This is a legacy coding benchmark result from the earlier
                  foundation release. New public runs are CPU and GPU only.
                </p>
              ) : (
                <p>
                  This result was produced by a browser-native long-form{" "}
                  {result.benchmarkKind.toUpperCase()} run with server-side
                  validation and persistence.
                </p>
              )}
              <Separator className="bg-slate-200" />
              <p>Benchmark version: {result.benchmarkVersion}</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
