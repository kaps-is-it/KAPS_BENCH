import { create } from "zustand";
import type {
  BenchmarkRunState,
  DeviceProfile,
  PersistedBenchmarkResult,
} from "@/lib/types";

type BenchmarkStore = {
  runState: BenchmarkRunState;
  progress: number;
  currentLabel: string;
  currentMessage: string;
  deviceProfile: DeviceProfile | null;
  result: PersistedBenchmarkResult | null;
  error: string | null;
  setRunState: (runState: BenchmarkRunState) => void;
  setProgress: (progress: number, label: string, message: string) => void;
  setDeviceProfile: (deviceProfile: DeviceProfile) => void;
  setResult: (result: PersistedBenchmarkResult) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useBenchmarkStore = create<BenchmarkStore>((set) => ({
  runState: "idle",
  progress: 0,
  currentLabel: "Waiting",
  currentMessage: "Can I Run This is ready to benchmark this device.",
  deviceProfile: null,
  result: null,
  error: null,
  setRunState: (runState) => set({ runState }),
  setProgress: (progress, currentLabel, currentMessage) =>
    set({ progress, currentLabel, currentMessage }),
  setDeviceProfile: (deviceProfile) => set({ deviceProfile, error: null }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error, runState: "error" }),
  reset: () =>
    set({
      runState: "idle",
      progress: 0,
      currentLabel: "Waiting",
      currentMessage: "Can I Run This is ready to benchmark this device.",
      deviceProfile: null,
      result: null,
      error: null,
    }),
}));
