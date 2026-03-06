import { inferVendorFromRenderer } from "@/lib/hardware-detect/gpu-detect";

describe("inferVendorFromRenderer", () => {
  it.each([
    ["ANGLE (NVIDIA, NVIDIA GeForce RTX 4070, D3D11)", "NVIDIA"],
    ["Apple M3 Pro", "Apple"],
    ["Intel Iris Xe Graphics", "Intel"],
    ["AMD Radeon RX 7800 XT", "AMD"],
    ["Unknown GPU", "Unknown"],
  ])("maps %s to %s", (renderer, expected) => {
    expect(inferVendorFromRenderer(renderer)).toBe(expected);
  });
});
