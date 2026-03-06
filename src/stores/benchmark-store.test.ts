import { useBenchmarkStore } from "@/stores/benchmark-store";
import {
  createCpuSubmissionPayload,
  createPersistedCpuResultFixture,
} from "@/test/fixtures/benchmark-payload";

describe("benchmark store", () => {
  afterEach(() => {
    useBenchmarkStore.getState().reset();
  });

  it("tracks benchmark lifecycle state", () => {
    const payload = createCpuSubmissionPayload();
    const result = createPersistedCpuResultFixture();

    useBenchmarkStore.getState().setRunState("detecting");
    useBenchmarkStore
      .getState()
      .setProgress(25, "Device ready", "Profile captured.");
    useBenchmarkStore.getState().setDeviceProfile(payload.deviceProfile);
    useBenchmarkStore.getState().setResult(result);

    const state = useBenchmarkStore.getState();

    expect(state.runState).toBe("detecting");
    expect(state.progress).toBe(25);
    expect(state.currentLabel).toBe("Device ready");
    expect(state.deviceProfile?.gpuVendor).toBe("Apple");
    expect(state.result && "id" in state.result ? state.result.id : null).toBe(
      "fixture-cpu-result-id",
    );
  });

  it("can clear the in-memory benchmark result", () => {
    const result = createPersistedCpuResultFixture();

    useBenchmarkStore.getState().setResult(result);
    useBenchmarkStore.getState().setResult(null);

    expect(useBenchmarkStore.getState().result).toBeNull();
  });

  it("clears errors without forcing the benchmark back into an error state", () => {
    useBenchmarkStore.getState().setRunState("running");
    useBenchmarkStore.getState().setError("Save failed.");
    useBenchmarkStore.getState().setRunState("completed");
    useBenchmarkStore.getState().setError(null);

    const state = useBenchmarkStore.getState();

    expect(state.error).toBeNull();
    expect(state.runState).toBe("completed");
  });
});
