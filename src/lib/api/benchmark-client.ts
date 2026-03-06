import type {
  BenchmarkSubmissionPayload,
  PersistedBenchmarkResult,
} from "@/lib/types";

export async function submitBenchmarkResult(
  payload: BenchmarkSubmissionPayload,
  accessToken?: string | null,
) {
  const response = await fetch("/api/benchmark/submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as {
    error?: string;
    issues?: Array<{
      path: Array<string | number>;
      message: string;
    }>;
    result?: PersistedBenchmarkResult;
  };

  if (!response.ok || !data.result) {
    if (data.error === "Invalid benchmark payload." && data.issues?.length) {
      const firstIssue = data.issues[0];
      const issuePath = firstIssue.path.length
        ? `${firstIssue.path.join(".")}: `
        : "";

      throw new Error(`${data.error} ${issuePath}${firstIssue.message}`);
    }

    throw new Error(data.error ?? "Failed to save the benchmark result.");
  }

  return data.result;
}
