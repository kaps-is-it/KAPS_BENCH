import { randomUUID } from "node:crypto";
import type {
  BenchmarkResultUser,
  BenchmarkSubmissionPayload,
  PersistedBenchmarkResult,
} from "@/lib/types";

type StoredDevResult = PersistedBenchmarkResult;

const globalStore = globalThis as typeof globalThis & {
  __canIRunThisResults?: Map<string, StoredDevResult>;
};

function getStore() {
  if (!globalStore.__canIRunThisResults) {
    globalStore.__canIRunThisResults = new Map<string, StoredDevResult>();
  }

  return globalStore.__canIRunThisResults;
}

export function createDevResult(
  payload: BenchmarkSubmissionPayload,
  user?: BenchmarkResultUser | null,
) {
  const id = randomUUID();
  const result = Object.assign({}, payload.result, {
    id,
    benchmarkVersion: payload.benchmarkVersion,
    createdAt: new Date().toISOString(),
    browserName: payload.deviceProfile.browser.name,
    browserVersion: payload.deviceProfile.browser.version,
    osPlatform: payload.deviceProfile.browser.os,
    deviceProfile: payload.deviceProfile,
    user: user ?? null,
  }) as PersistedBenchmarkResult;

  getStore().set(id, result);

  return result;
}

export function getDevResult(id: string) {
  return getStore().get(id) ?? null;
}
