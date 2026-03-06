import { combineChecksums } from "@/benchmarks/shared/scoring";

describe("benchmark checksum combination", () => {
  it("always returns an unsigned 32-bit checksum", () => {
    const combined = combineChecksums([0xf1234567, 0x9abcdeff, 0x80000000]);

    expect(combined).toBe(((0xf1234567 ^ 0x9abcdeff ^ 0x80000000) >>> 0));
    expect(combined).toBeGreaterThanOrEqual(0);
    expect(combined).toBeLessThanOrEqual(0xffffffff);
  });
});
