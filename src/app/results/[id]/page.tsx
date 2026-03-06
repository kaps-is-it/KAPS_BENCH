import { notFound } from "next/navigation";
import { ResultsDashboard } from "@/components/results/results-dashboard";
import { getBenchmarkResultById } from "@/lib/server/result-repository";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getBenchmarkResultById(id);

  if (!result) {
    notFound();
  }

  return <ResultsDashboard result={result} />;
}
