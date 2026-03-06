import { NextResponse } from "next/server";
import { createBenchmarkResult } from "@/lib/server/result-repository";
import {
  benchmarkSubmissionSchema,
  isSubmissionPlausible,
} from "@/lib/validation/benchmark";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = benchmarkSubmissionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid benchmark payload.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    if (!isSubmissionPlausible(parsed.data)) {
      return NextResponse.json(
        {
          error: "Benchmark timings failed plausibility checks.",
        },
        { status: 422 },
      );
    }

    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace(/^Bearer\s+/i, "") ?? null;
    const result = await createBenchmarkResult(parsed.data, accessToken);

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected benchmark submission failure.",
      },
      { status: 500 },
    );
  }
}
