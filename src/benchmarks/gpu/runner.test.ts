import { supportsCommandEncoderTimestamps } from "@/benchmarks/gpu/runner";

describe("gpu runner capability guards", () => {
  it("disables timestamp sampling when the command encoder lacks writeTimestamp", () => {
    expect(
      supportsCommandEncoderTimestamps({} as GPUCommandEncoder),
    ).toBe(false);
  });

  it("accepts timestamp sampling when the command encoder exposes writeTimestamp", () => {
    expect(
      supportsCommandEncoderTimestamps({
        writeTimestamp() {},
      } as GPUCommandEncoder),
    ).toBe(true);
  });
});
