import { unstable_noStore as noStore } from "next/cache";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { getBenchmarkLeaderboard } from "@/lib/server/result-repository";

export const metadata = {
  title: "Leaderboard",
};

export default async function LeaderboardPage() {
  noStore();

  const [cpuFull, cpuSingleCore, cpuMultiCore, gpu] = await Promise.all([
    getBenchmarkLeaderboard({ scope: "cpu-full", limit: 20 }),
    getBenchmarkLeaderboard({ scope: "cpu-singleCore", limit: 20 }),
    getBenchmarkLeaderboard({ scope: "cpu-multiCore", limit: 20 }),
    getBenchmarkLeaderboard({ scope: "gpu", limit: 20 }),
  ]);

  return (
    <div className="pb-24">
      <section className="shell-section pt-12">
        <div className="max-w-3xl space-y-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary">
            Live rankings
          </p>
          <h1 className="text-5xl font-semibold tracking-[-0.07em] text-slate-950 sm:text-6xl">
            Benchmark Leaderboards
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-600">
            Saved CPU and GPU runs are ranked here automatically. CPU full,
            single-core, and multi-core runs are separated so only comparable
            results compete with each other.
          </p>
        </div>
      </section>

      <section className="shell-section grid gap-6 pt-10 xl:grid-cols-2">
        <LeaderboardTable scope="cpu-full" entries={cpuFull} />
        <LeaderboardTable scope="gpu" entries={gpu} />
      </section>

      <section className="shell-section grid gap-6 pt-6 xl:grid-cols-2">
        <LeaderboardTable scope="cpu-singleCore" entries={cpuSingleCore} />
        <LeaderboardTable scope="cpu-multiCore" entries={cpuMultiCore} />
      </section>
    </div>
  );
}
