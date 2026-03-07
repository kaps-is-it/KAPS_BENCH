import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Cpu,
  Gamepad2,
  Gauge,
  Paintbrush2,
  Play,
  Sparkles,
  Volume2,
  WandSparkles,
  Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { getBenchmarkLeaderboard } from "@/lib/server/result-repository";

const futureModules = [
  {
    title: "Coding",
    description: "Compile, indexing, and heavy editor workflow simulation.",
    icon: Code2,
  },
  {
    title: "Gaming",
    description: "Physics and frame pacing scenarios for modern laptop GPUs.",
    icon: Gamepad2,
  },
  {
    title: "Video Editing",
    description: "4K timeline and render-oriented workstation stress tests.",
    icon: Clapperboard,
  },
  {
    title: "Graphics",
    description: "2D and 3D raster workloads beyond the core GPU benchmark.",
    icon: Paintbrush2,
  },
  {
    title: "Sound",
    description: "Audio processing and real-time signal path latency modules.",
    icon: Volume2,
  },
] as const;

const steps = [
  {
    step: "1. Detect",
    copy: "The browser profiles your hardware, capabilities, and runtime environment before the benchmark begins.",
  },
  {
    step: "2. Run",
    copy: "The CPU and GPU suites execute long-form fixed workloads designed to expose burst and sustained behavior.",
  },
  {
    step: "3. Compare",
    copy: "Results are normalized against a reference pack so current high-end machines cluster near 5,000 points.",
  },
] as const;

export default async function Home() {
  noStore();

  const [cpuLeaderboard, gpuLeaderboard] = await Promise.all([
    getBenchmarkLeaderboard({ scope: "cpu-full", limit: 5 }),
    getBenchmarkLeaderboard({ scope: "gpu", limit: 5 }),
  ]);

  return (
    <div className="pb-24">
      <section className="shell-section pt-8 md:pt-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-5 py-2 text-sm font-semibold tracking-[0.15em] text-primary uppercase">
            <Sparkles className="size-4" />
            Can I Run This?
          </div>
          <h1 className="headline-balance mx-auto max-w-4xl text-4xl font-semibold tracking-[-0.07em] text-slate-950 sm:text-5xl xl:text-6xl">
            Choose your <span className="text-primary">Benchmark</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-7 text-slate-600">
            Push your device to its limits. No installation required. Runs directly in your browser using WebAssembly and WebGPU bounds.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* CPU Hero Card */}
          <div className="group relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-2 transition-all duration-500 hover:shadow-[0_40px_80px_rgba(37,99,235,0.08)] hover:border-blue-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative flex h-full flex-col rounded-[2rem] bg-slate-50/50 p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex size-14 items-center justify-center rounded-[1.2rem] bg-blue-100 text-blue-600 shadow-sm transition-transform duration-500 group-hover:-translate-y-1">
                  <Cpu className="size-7" />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-blue-200/50 bg-blue-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-blue-600">
                  <Gauge className="size-3.5" />
                  11-13 Min
                </div>
              </div>

              <h2 className="text-3xl font-bold tracking-[-0.05em] text-slate-950">
                CPU Performance
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600 object-contain">
                Detailed evaluation of modern single-core pipelines and multi-threaded scaling capabilities via WebAssembly and SharedArrayBuffers.
              </p>

              <div className="mt-6 mb-8 flex flex-col gap-3">
                {[
                  "Integer branch and hashing",
                  "Floating-point matrix math",
                  "Memory copy & stencil speed"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 text-blue-500 shrink-0" />
                    <span className="text-base text-slate-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-4">
                <Button
                  asChild
                  className="h-14 w-full rounded-full bg-slate-950 text-base shadow-lg shadow-black/5 transition-all duration-300 hover:bg-blue-600"
                >
                  <Link href="/benchmark/cpu">
                    Start CPU Benchmark
                    <ArrowRight className="ml-2 size-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* GPU Hero Card */}
          <div className="group relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-2 transition-all duration-500 hover:shadow-[0_40px_80px_rgba(16,185,129,0.08)] hover:border-emerald-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative flex h-full flex-col rounded-[2rem] bg-slate-50/50 p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="flex size-14 items-center justify-center rounded-[1.2rem] bg-emerald-100 text-emerald-600 shadow-sm transition-transform duration-500 group-hover:-translate-y-1">
                  <Sparkles className="size-7" />
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-200/50 bg-emerald-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-600">
                  <Gauge className="size-3.5" />
                  10-12 Min
                </div>
              </div>

              <h2 className="text-3xl font-bold tracking-[-0.05em] text-slate-950">
                GPU Performance
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-600 object-contain">
                High-end graphics adapter stress test using WebGPU. Evaluates render instancing, complex raster scenes, and intense dispatch saturation.
              </p>

              <div className="mt-6 mb-8 flex flex-col gap-3">
                {[
                  "Complex fragment shading",
                  "Compute particle simulation",
                  "Matrix tile compute dispatch"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
                    <span className="text-base text-slate-700 font-medium">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-4">
                <Button
                  asChild
                  className="h-14 w-full rounded-full bg-slate-950 text-base shadow-lg shadow-black/5 transition-all duration-300 hover:bg-emerald-600"
                >
                  <Link href="/benchmark/gpu">
                    Start GPU Benchmark
                    <ArrowRight className="ml-2 size-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="shell-section pt-20" id="real-world">
        <div className="dashboard-card px-6 py-10 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="section-heading">Real-World Benchmarks</h2>
            <p className="mt-3 text-lg text-slate-500">
              Future modules for domain-specific workloads will layer on top of
              the core CPU and GPU suites.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {futureModules.map((module) => {
              const Icon = module.icon;

              return (
                <div key={module.title} className="soft-tile px-5 py-6 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-5 text-lg font-semibold text-slate-950">
                    {module.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {module.description}
                  </p>
                  <div className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Coming soon
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="shell-section pt-20" id="leaderboard">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="section-heading">Live Leaderboards</h2>
            <p className="mt-3 max-w-2xl text-lg text-slate-500">
              Top saved full CPU runs and GPU runs update from the persisted
              benchmark database.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-slate-200 bg-white px-5 text-slate-800 hover:bg-slate-50"
          >
            <Link href="/leaderboard">
              Open full leaderboard
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <LeaderboardTable scope="cpu-full" entries={cpuLeaderboard} compact />
          <LeaderboardTable scope="gpu" entries={gpuLeaderboard} compact />
        </div>
      </section>

      <section className="shell-section pt-20" id="about">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-heading">How It Works</h2>
          <p className="mt-3 text-lg text-slate-500">
            Three steps from browser detection to calibrated long-form scores.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((item, index) => (
            <div key={item.step} className="relative text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                {index === 0 ? (
                  <Gauge className="size-6 text-primary" />
                ) : index === 1 ? (
                  <Play className="size-6 text-primary" />
                ) : (
                  <ArrowRight className="size-6 text-primary" />
                )}
              </div>
              {index < steps.length - 1 ? (
                <div className="absolute left-[calc(50%+2.75rem)] top-8 hidden h-px w-[calc(100%-2rem)] bg-slate-200 md:block" />
              ) : null}
              <h3 className="mt-7 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                {item.step}
              </h3>
              <p className="mx-auto mt-3 max-w-sm text-base leading-8 text-slate-600">
                {item.copy}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
