import { vi } from "vitest";
import {
  createCpuSubmissionPayload,
  createPersistedCpuResultFixture,
} from "@/test/fixtures/benchmark-payload";

const { createBenchmarkResult } = vi.hoisted(() => ({
  createBenchmarkResult: vi.fn(),
}));

vi.mock("@/lib/server/result-repository", () => ({
  createBenchmarkResult,
}));

import { POST } from "@/app/api/benchmark/submit/route";

describe("POST /api/benchmark/submit", () => {
  beforeEach(() => {
    createBenchmarkResult.mockReset();
  });

  it("rejects invalid payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/benchmark/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invalid: true }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it("passes the bearer token and returns the persisted result", async () => {
    const payload = createCpuSubmissionPayload();
    const persisted = createPersistedCpuResultFixture();
    createBenchmarkResult.mockResolvedValue(persisted);

    const response = await POST(
      new Request("http://localhost/api/benchmark/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-123",
        },
        body: JSON.stringify(payload),
      }),
    );

    const json = (await response.json()) as { result: { id: string } };

    expect(response.status).toBe(200);
    expect(createBenchmarkResult).toHaveBeenCalledWith(payload, "token-123");
    expect(json.result.id).toBe("fixture-cpu-result-id");
  });
});
