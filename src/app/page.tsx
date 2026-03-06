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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BENCHMARK_CARD_CONTENT } from "@/lib/branding";

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

const compareCards = [
  {
    title: "Shareable result pages",
    copy: "Every completed CPU and GPU run lands on a public result page you can share directly.",
  },
  {
    title: "Leaderboard calibration",
    copy: "Public rankings stay locked until the first reference pack is fully tuned for current laptop classes.",
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

export default function Home() {
  return (
    <div className="pb-24">
      <section className="shell-section grid gap-12 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
        <div className="space-y-8">
          <div className="space-y-5">
            <div className="metric-chip w-fit border-primary/15 bg-primary/8 text-primary">
              Browser-based precision
            </div>
            <h1 className="headline-balance max-w-4xl text-5xl font-semibold tracking-[-0.07em] text-slate-950 sm:text-6xl xl:text-7xl">
              Test Your Laptop
              <br />
              or <span className="text-primary">PC Performance</span>
            </h1>
            <p className="max-w-2xl text-xl leading-9 text-slate-600">
              Runs directly in your browser. No installation required. Long-form
              CPU and GPU benchmarking tuned for modern hardware and calibrated
              around current flagship laptops.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button
              asChild
              size="lg"
              className="h-14 rounded-full bg-primary px-7 text-base text-primary-foreground shadow-[0_18px_40px_rgba(37,99,235,0.25)]"
            >
              <Link href="/benchmark/cpu">
                <Cpu className="size-4" />
                Start CPU Benchmark
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-14 rounded-full border-slate-200 bg-white px-7 text-base text-slate-800 hover:bg-slate-50"
            >
              <Link href="/benchmark/gpu">
                <Sparkles className="size-4" />
                Start GPU Benchmark
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="metric-chip">
              <Gauge className="size-3.5 text-primary" />
              Target band: 4,200-5,000
            </div>
            <div className="metric-chip">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Shareable saved results
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#264934_0%,#547c74_48%,#8faea5_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,rgba(204,173,117,0),rgba(204,173,117,0.85))]" />
          <div className="absolute left-7 bottom-2 z-20">
            <div className="relative h-44 w-28">
              <div className="absolute bottom-0 left-4 h-24 w-20 rounded-t-[2.4rem] bg-[linear-gradient(180deg,#d9c5a8_0%,#b59b78_100%)] shadow-[0_10px_18px_rgba(0,0,0,0.18)]" />
              <div className="absolute bottom-20 left-1/2 h-24 w-px -translate-x-1/2 bg-[#5a7450]" />
              <div className="absolute left-0 top-3 h-16 w-16 rounded-full bg-[#6f9639] blur-[2px]" />
              <div className="absolute left-8 top-0 h-20 w-16 rounded-full bg-[#86ab46] blur-[1px]" />
              <div className="absolute right-1 top-6 h-16 w-14 rounded-full bg-[#4d7a2e] blur-[1px]" />
            </div>
          </div>
          <div className="absolute bottom-0 right-5 h-48 w-64 rounded-t-[1.8rem] bg-[linear-gradient(160deg,#5c616d_0%,#353842_72%,#25272f_100%)] shadow-[0_24px_30px_rgba(0,0,0,0.3)]" />
          <div className="absolute bottom-0 right-28 h-3 w-48 rounded-full bg-black/15 blur-sm" />
          <div className="relative z-20 m-8 ml-auto mt-20 max-w-[18rem] rounded-[1.7rem] border border-white/55 bg-white/92 p-5 shadow-[0_18px_36px_rgba(15,23,42,0.18)]">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
                <WandSparkles className="size-5" />
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                  Real-time analysis
                </p>
                <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                  Active Benchmarking...
                </p>
              </div>
            </div>
          </div>
          <div className="aspect-[1.3/0.72] w-full" />
        </div>
      </section>

      <section className="shell-section pt-20" id="compare">
        <div className="mb-8">
          <h2 className="section-heading">Primary Benchmarks</h2>
          <p className="mt-3 text-lg text-slate-500">
            Direct access to the two public benchmark suites. No install flow.
            No launch wizard. Just start the run.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {(["cpu", "gpu"] as const).map((kind) => {
            const card = BENCHMARK_CARD_CONTENT[kind];
            const Icon = kind === "cpu" ? Cpu : Sparkles;

            return (
              <Card key={kind} className="dashboard-card shadow-none">
                <CardHeader className="space-y-5 p-7">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex size-14 items-center justify-center rounded-[1.4rem] bg-primary/10 text-primary">
                        <Icon className="size-6" />
                      </div>
                      <div>
                        <CardTitle className="text-[2rem] tracking-[-0.05em] text-slate-950">
                          {card.title}
                        </CardTitle>
                        <p className="mt-1 text-sm uppercase tracking-[0.16em] text-slate-500">
                          {card.duration}
                        </p>
                      </div>
                    </div>
                    <div className="metric-chip border-primary/15 bg-primary/8 text-primary">
                      <Gauge className="size-3.5 text-primary" />
                      Full run
                    </div>
                  </div>
                  <p className="text-base leading-8 text-slate-600">
                    {card.description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6 p-7 pt-0">
                  <div className="grid gap-3">
                    {card.bullets.map((bullet) => (
                      <div key={bullet} className="soft-tile flex items-start gap-3 px-4 py-3">
                        <span className="mt-2 size-2 rounded-full bg-primary" />
                        <p className="text-sm leading-6 text-slate-600">{bullet}</p>
                      </div>
                    ))}
                  </div>

                  <Button
                    asChild
                    size="lg"
                    className="h-14 w-full rounded-full bg-slate-100 text-base text-slate-900 shadow-none hover:bg-slate-200"
                  >
                    <Link href={card.href}>
                      Launch Test
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
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
        <div className="grid gap-6 lg:grid-cols-2">
          {compareCards.map((item) => (
            <div key={item.title} className="dashboard-card p-7">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
                Platform roadmap
              </p>
              <h3 className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                {item.title}
              </h3>
              <p className="mt-3 text-base leading-8 text-slate-600">
                {item.copy}
              </p>
            </div>
          ))}
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
