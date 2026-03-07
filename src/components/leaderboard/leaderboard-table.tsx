import Link from "next/link";
import { ArrowUpRight, Cpu, Sparkles } from "lucide-react";
import {
  getLeaderboardDetailLabel,
  getLeaderboardHardwareLabel,
  getLeaderboardOwnerLabel,
  getLeaderboardScopeDescription,
  getLeaderboardScopeTitle,
  isCpuResult,
  isGpuResult,
  type LeaderboardScope,
} from "@/lib/leaderboard";
import type {
  PersistedCpuBenchmarkResult,
  PersistedGpuBenchmarkResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type LeaderboardEntry = PersistedCpuBenchmarkResult | PersistedGpuBenchmarkResult;

function formatScore(score: number | null) {
  if (score === null) {
    return "—";
  }

  return score.toLocaleString();
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderDetailedColumns(
  scope: LeaderboardScope,
  entry: LeaderboardEntry,
) {
  if (scope === "gpu" && isGpuResult(entry)) {
    return (
      <>
        <td className="px-4 py-4 text-right font-medium text-slate-900">
          {formatScore(entry.graphicsScore)}
        </td>
        <td className="px-4 py-4 text-right font-medium text-slate-900">
          {formatScore(entry.computeScore)}
        </td>
        <td className="px-4 py-4 text-right font-medium text-slate-900">
          {formatScore(entry.sustainedScore)}
        </td>
      </>
    );
  }

  if (!isCpuResult(entry)) {
    return null;
  }

  if (scope === "cpu-singleCore") {
    return (
      <>
        <td className="px-4 py-4 text-right font-medium text-slate-900">
          {formatScore(entry.singleCoreScore)}
        </td>
        <td className="px-4 py-4 text-right text-slate-500">{entry.rating}</td>
      </>
    );
  }

  if (scope === "cpu-multiCore") {
    return (
      <>
        <td className="px-4 py-4 text-right font-medium text-slate-900">
          {formatScore(entry.multiCoreScore)}
        </td>
        <td className="px-4 py-4 text-right text-slate-500">{entry.rating}</td>
      </>
    );
  }

  return (
    <>
      <td className="px-4 py-4 text-right font-medium text-slate-900">
        {formatScore(entry.singleCoreScore)}
      </td>
      <td className="px-4 py-4 text-right font-medium text-slate-900">
        {formatScore(entry.multiCoreScore)}
      </td>
      <td className="px-4 py-4 text-right font-medium text-slate-900">
        {formatScore(entry.sustainedScore)}
      </td>
    </>
  );
}

function renderDetailedHeaders(scope: LeaderboardScope) {
  if (scope === "gpu") {
    return (
      <>
        <th className="px-4 py-3 text-right font-medium">Graphics</th>
        <th className="px-4 py-3 text-right font-medium">Compute</th>
        <th className="px-4 py-3 text-right font-medium">Sustained</th>
      </>
    );
  }

  if (scope === "cpu-singleCore") {
    return (
      <>
        <th className="px-4 py-3 text-right font-medium">Single</th>
        <th className="px-4 py-3 text-right font-medium">Rating</th>
      </>
    );
  }

  if (scope === "cpu-multiCore") {
    return (
      <>
        <th className="px-4 py-3 text-right font-medium">Multi</th>
        <th className="px-4 py-3 text-right font-medium">Rating</th>
      </>
    );
  }

  return (
    <>
      <th className="px-4 py-3 text-right font-medium">Single</th>
      <th className="px-4 py-3 text-right font-medium">Multi</th>
      <th className="px-4 py-3 text-right font-medium">Sustained</th>
    </>
  );
}

export function LeaderboardTable({
  scope,
  entries,
  compact = false,
  className,
}: {
  scope: LeaderboardScope;
  entries: LeaderboardEntry[];
  compact?: boolean;
  className?: string;
}) {
  const Icon = scope === "gpu" ? Sparkles : Cpu;

  return (
    <section className={cn("dashboard-card overflow-hidden", className)}>
      <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                {getLeaderboardScopeTitle(scope)}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {getLeaderboardScopeDescription(scope)}
              </p>
            </div>
          </div>
        </div>
        {!compact ? (
          <div className="metric-chip border-primary/15 bg-primary/8 text-primary">
            Live ranking
          </div>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div className="px-6 py-10 text-sm text-slate-500">
          No saved benchmark runs are available for this leaderboard yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[0.72rem] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="w-16 px-4 py-3 text-left font-medium">Rank</th>
                <th className="px-4 py-3 text-left font-medium">System</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
                {!compact ? renderDetailedHeaders(scope) : null}
                <th className="px-4 py-3 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="px-4 py-4 align-top">
                    <div className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-900">
                      {index + 1}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-950">
                        {getLeaderboardHardwareLabel(entry)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {getLeaderboardOwnerLabel(entry)} • {formatDate(entry.createdAt)}
                      </p>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                        {getLeaderboardDetailLabel(entry)}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right align-top">
                    <div className="space-y-1">
                      <p className="text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                        {formatScore(entry.headlineScore)}
                      </p>
                      <p className="text-xs uppercase tracking-[0.16em] text-primary">
                        {entry.rating}
                      </p>
                    </div>
                  </td>
                  {!compact ? renderDetailedColumns(scope, entry) : null}
                  <td className="px-4 py-4 text-right align-top">
                    <Link
                      href={`/results/${entry.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                    >
                      View
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
