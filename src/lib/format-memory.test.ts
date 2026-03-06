import { formatApproxMemory } from "@/lib/format-memory";

describe("formatApproxMemory", () => {
  it("treats browser-reported memory as a lower bound", () => {
    expect(formatApproxMemory(4)).toEqual({
      value: "At least 4 GB",
      detail: "Browser-reported lower bound, rounded for privacy.",
    });
  });

  it("warns that the 8 GB bucket may hide larger RAM sizes", () => {
    expect(formatApproxMemory(8)).toEqual({
      value: "At least 8 GB",
      detail: "Browser-reported lower bound. Actual RAM may be higher.",
    });
  });

  it("handles missing browser support", () => {
    expect(formatApproxMemory()).toEqual({
      value: "Unavailable",
      detail: "This browser did not expose a memory estimate.",
    });
  });
});
