import { Suspense } from "react";
import { BenchmarkExperience } from "@/components/benchmark/benchmark-experience";

export default function CpuBenchmarkPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl px-6 pb-24 pt-8 sm:px-8 lg:px-12">
          <div className="surface-panel w-full p-8 text-sm text-slate-600">
            Loading CPU benchmark runtime…
          </div>
        </div>
      }
    >
      <BenchmarkExperience benchmarkKind="cpu" />
    </Suspense>
  );
}
