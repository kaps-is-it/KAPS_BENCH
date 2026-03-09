import { runGpuBenchmark } from "@/benchmarks/gpu/runner";
import { benchmarkSubmissionSchema } from "@/lib/validation/benchmark";
import { createGpuSubmissionPayload } from "@/test/fixtures/benchmark-payload";

describe("gpu runner", () => {
  it("produces a schema-valid smoke mock result", async () => {
    const result = await runGpuBenchmark({
      preset: "smoke",
      mock: true,
    });
    const payload = createGpuSubmissionPayload();

    payload.result = result;
    payload.benchmarkVersion = result.benchmarkVersion;

    expect(benchmarkSubmissionSchema.safeParse(payload).success).toBe(true);
    expect(result.rawMetrics.checksum).toBeGreaterThanOrEqual(0);
  });
});
