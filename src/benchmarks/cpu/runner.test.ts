import { runCpuBenchmark } from "@/benchmarks/cpu/runner";
import { benchmarkSubmissionSchema } from "@/lib/validation/benchmark";
import { createCpuSubmissionPayload } from "@/test/fixtures/benchmark-payload";

describe("cpu runner", () => {
  it("produces a schema-valid single-core mock result", async () => {
    const result = await runCpuBenchmark({
      preset: "smoke",
      mock: true,
      runMode: "singleCore",
    });
    const payload = createCpuSubmissionPayload();

    payload.result = result;
    payload.benchmarkVersion = result.benchmarkVersion;

    expect(benchmarkSubmissionSchema.safeParse(payload).success).toBe(true);
    expect(result.rawMetrics.checksum).toBeGreaterThanOrEqual(0);
  });
});
