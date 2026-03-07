import type { User } from "@supabase/supabase-js";
import {
  dedupeLeaderboardResults,
  matchesLeaderboardScope,
  type LeaderboardScope,
} from "@/lib/leaderboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { shouldUseDevResultStore } from "@/lib/env";
import {
  createDevResult,
  getDevResult,
  listDevResults,
} from "@/lib/server/dev-result-store";
import type {
  BenchmarkResultUser,
  BenchmarkSubmissionPayload,
  DeviceProfile,
  LegacyCodingPersistedBenchmarkResult,
  PersistedCpuBenchmarkResult,
  PersistedBenchmarkResult,
  PersistedGpuBenchmarkResult,
} from "@/lib/types";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type BenchmarkRunRow = Database["public"]["Tables"]["benchmark_runs"]["Row"];

function mapDeviceProfile(
  profile: DeviceProfile,
): Database["public"]["Tables"]["device_profiles"]["Insert"] {
  return {
    gpu_renderer: profile.gpuRenderer,
    gpu_vendor: profile.gpuVendor,
    gpu_architecture: profile.gpuArchitecture ?? null,
    gpu_description: profile.gpuDescription ?? null,
    webgpu_supported: profile.webgpuSupported,
    webgpu_info:
      (profile.webgpuInfo ??
        null) as unknown as Database["public"]["Tables"]["device_profiles"]["Insert"]["webgpu_info"],
    cpu_logical_cores: profile.cpuLogicalCores,
    device_memory_gb: profile.deviceMemoryGb ?? null,
    screen_width: profile.display.width,
    screen_height: profile.display.height,
    physical_width: profile.display.physicalWidth,
    physical_height: profile.display.physicalHeight,
    device_pixel_ratio: profile.display.devicePixelRatio,
    color_depth: profile.display.colorDepth,
    browser_name: profile.browser.name,
    browser_version: profile.browser.version,
    os_name: profile.browser.os,
    os_version: profile.browser.osVersion,
    user_agent: profile.browser.userAgent,
    capabilities:
      profile.capabilities as unknown as Database["public"]["Tables"]["device_profiles"]["Insert"]["capabilities"],
  };
}

function mapUser(user: User | null): BenchmarkResultUser | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    username:
      user.user_metadata.full_name ??
      user.user_metadata.user_name ??
      user.email?.split("@")[0] ??
      null,
    avatarUrl: user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
  };
}

async function upsertProfile(admin: AdminClient, user: User) {
  const profilePayload = {
    id: user.id,
    email: user.email ?? null,
    username:
      user.user_metadata.full_name ??
      user.user_metadata.user_name ??
      user.user_metadata.preferred_username ??
      user.email?.split("@")[0] ??
      null,
    avatar_url: user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
    updated_at: new Date().toISOString(),
  } as never;

  await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });
}

export async function resolveUser(accessToken?: string | null) {
  if (!accessToken || shouldUseDevResultStore()) {
    return null;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  await upsertProfile(admin, data.user);

  return data.user;
}

function mapStoredDeviceProfile(
  deviceProfile: Database["public"]["Tables"]["device_profiles"]["Row"],
): DeviceProfile {
  return {
    gpuRenderer: deviceProfile.gpu_renderer,
    gpuVendor: deviceProfile.gpu_vendor,
    gpuArchitecture: deviceProfile.gpu_architecture ?? undefined,
    gpuDescription: deviceProfile.gpu_description ?? undefined,
    webgpuSupported: deviceProfile.webgpu_supported,
    webgpuInfo:
      (deviceProfile.webgpu_info as DeviceProfile["webgpuInfo"]) ?? undefined,
    cpuLogicalCores: deviceProfile.cpu_logical_cores,
    deviceMemoryGb: deviceProfile.device_memory_gb ?? undefined,
    display: {
      width: deviceProfile.screen_width,
      height: deviceProfile.screen_height,
      physicalWidth: deviceProfile.physical_width,
      physicalHeight: deviceProfile.physical_height,
      devicePixelRatio: deviceProfile.device_pixel_ratio,
      colorDepth: deviceProfile.color_depth,
    },
    browser: {
      name: deviceProfile.browser_name,
      version: deviceProfile.browser_version,
      os: deviceProfile.os_name,
      osVersion: deviceProfile.os_version,
      userAgent: deviceProfile.user_agent,
    },
    capabilities:
      deviceProfile.capabilities as unknown as DeviceProfile["capabilities"],
    timestamp: new Date(deviceProfile.created_at).getTime(),
  };
}

function mapProfileRow(
  row: Database["public"]["Tables"]["profiles"]["Row"] | null,
): BenchmarkResultUser | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    avatarUrl: row.avatar_url,
  };
}

export async function createBenchmarkResult(
  payload: BenchmarkSubmissionPayload,
  accessToken?: string | null,
): Promise<PersistedBenchmarkResult> {
  const user = await resolveUser(accessToken);
  const mappedUser = mapUser(user);

  if (shouldUseDevResultStore()) {
    return createDevResult(payload, mappedUser);
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    throw new Error("Supabase is not configured.");
  }

  const deviceInsert = await admin
    .from("device_profiles")
    .insert(mapDeviceProfile(payload.deviceProfile) as never)
    .select()
    .single();
  const deviceProfile =
    deviceInsert.data as Database["public"]["Tables"]["device_profiles"]["Row"] | null;

  if (deviceInsert.error || !deviceProfile) {
    throw new Error(
      deviceInsert.error?.message ?? "Failed to persist device profile.",
    );
  }

  const resultInsert = await admin
    .from("benchmark_runs")
    .insert(
      {
        user_id: user?.id ?? null,
        device_profile_id: deviceProfile.id,
        benchmark_kind: payload.benchmarkKind,
        headline_score: payload.result.headlineScore,
        rating: payload.result.rating,
        sub_scores: payload.result.subScores,
        raw_metrics: payload.result.rawMetrics,
        benchmark_version: payload.benchmarkVersion,
        browser_name: payload.deviceProfile.browser.name,
        browser_version: payload.deviceProfile.browser.version,
        os_platform: payload.deviceProfile.browser.os,
      } as never,
    )
    .select()
    .single();
  const result =
    resultInsert.data as Database["public"]["Tables"]["benchmark_runs"]["Row"] | null;

  if (resultInsert.error || !result) {
    throw new Error(
      resultInsert.error?.message ?? "Failed to persist benchmark result.",
    );
  }

  return Object.assign({}, payload.result, {
    id: result.id,
    benchmarkVersion: result.benchmark_version,
    createdAt: result.created_at,
    browserName: result.browser_name,
    browserVersion: result.browser_version,
    osPlatform: result.os_platform,
    deviceProfile: payload.deviceProfile,
    user: mappedUser,
  }) as PersistedBenchmarkResult;
}

async function getProfileByUserId(admin: AdminClient, userId: string | null) {
  if (!userId) {
    return null;
  }

  const profileQuery = await admin.from("profiles").select().eq("id", userId).single();

  return (
    (profileQuery.data as Database["public"]["Tables"]["profiles"]["Row"] | null) ??
    null
  );
}

async function getDeviceProfileById(admin: AdminClient, id: string) {
  const deviceQuery = await admin
    .from("device_profiles")
    .select()
    .eq("id", id)
    .single();

  return (
    (deviceQuery.data as Database["public"]["Tables"]["device_profiles"]["Row"] | null) ??
    null
  );
}

function mapBenchmarkRunRow(
  result: BenchmarkRunRow,
  mappedDeviceProfile: DeviceProfile,
  userProfile: BenchmarkResultUser | null,
): PersistedCpuBenchmarkResult | PersistedGpuBenchmarkResult {
  if (result.benchmark_kind === "cpu") {
    const cpuResult =
      result.raw_metrics as unknown as PersistedCpuBenchmarkResult["rawMetrics"];
    const subScores =
      result.sub_scores as unknown as PersistedCpuBenchmarkResult["subScores"];

    return {
      id: result.id,
      benchmarkKind: "cpu",
      headlineScore: result.headline_score,
      rating: result.rating,
      benchmarkVersion: result.benchmark_version,
      createdAt: result.created_at,
      browserName: result.browser_name,
      browserVersion: result.browser_version,
      osPlatform: result.os_platform,
      deviceProfile: mappedDeviceProfile,
      user: userProfile,
      cpuRunMode: cpuResult.runMode ?? "full",
      cpuScore: result.headline_score,
      singleCoreScore: subScores.singleCore?.score ?? null,
      multiCoreScore: subScores.multiCore?.score ?? null,
      sustainedScore: subScores.sustained?.score ?? null,
      subScores,
      rawMetrics: cpuResult,
    };
  }

  const gpuResult =
    result.raw_metrics as unknown as PersistedGpuBenchmarkResult["rawMetrics"];
  const subScores =
    result.sub_scores as unknown as PersistedGpuBenchmarkResult["subScores"];

  return {
    id: result.id,
    benchmarkKind: "gpu",
    headlineScore: result.headline_score,
    rating: result.rating,
    benchmarkVersion: result.benchmark_version,
    createdAt: result.created_at,
    browserName: result.browser_name,
    browserVersion: result.browser_version,
    osPlatform: result.os_platform,
    deviceProfile: mappedDeviceProfile,
    user: userProfile,
    gpuScore: result.headline_score,
    graphicsScore: subScores.graphics.score,
    computeScore: subScores.compute.score,
    sustainedScore: subScores.sustained.score,
    subScores,
    rawMetrics: gpuResult,
  };
}

async function getLegacyCodingResultById(
  admin: AdminClient,
  id: string,
): Promise<LegacyCodingPersistedBenchmarkResult | null> {
  const resultQuery = await admin
    .from("benchmark_results")
    .select()
    .eq("id", id)
    .single();
  const result =
    resultQuery.data as Database["public"]["Tables"]["benchmark_results"]["Row"] | null;

  if (resultQuery.error || !result) {
    return null;
  }

  const deviceProfile = await getDeviceProfileById(admin, result.device_profile_id);

  if (!deviceProfile) {
    return null;
  }

  const userProfile = mapProfileRow(await getProfileByUserId(admin, result.user_id));

  return {
    id: result.id,
    benchmarkKind: "legacy-coding",
    headlineScore: result.coding_score,
    codingScore: result.coding_score,
    rating: result.rating,
    benchmarkVersion: result.benchmark_version,
    createdAt: result.created_at,
    browserName: result.browser_name,
    browserVersion: result.browser_version,
    osPlatform: result.os_platform,
    deviceProfile: mapStoredDeviceProfile(deviceProfile),
    subScores:
      result.sub_scores as unknown as LegacyCodingPersistedBenchmarkResult["subScores"],
    rawMetrics:
      result.raw_metrics as unknown as LegacyCodingPersistedBenchmarkResult["rawMetrics"],
    user: userProfile,
  };
}

export async function getBenchmarkLeaderboard({
  scope,
  limit = 10,
}: {
  scope: LeaderboardScope;
  limit?: number;
}): Promise<Array<PersistedCpuBenchmarkResult | PersistedGpuBenchmarkResult>> {
  if (shouldUseDevResultStore()) {
    const scopedResults = listDevResults()
      .filter(
        (result): result is PersistedCpuBenchmarkResult | PersistedGpuBenchmarkResult =>
          result.benchmarkKind !== "legacy-coding" &&
          matchesLeaderboardScope(result, scope),
      )
      .sort((left, right) => {
        if (right.headlineScore !== left.headlineScore) {
          return right.headlineScore - left.headlineScore;
        }

        return (
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
      });

    return dedupeLeaderboardResults(scopedResults, scope, limit);
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    throw new Error("Supabase is not configured.");
  }

  const benchmarkKind = scope === "gpu" ? "gpu" : "cpu";
  let query = admin
    .from("benchmark_runs")
    .select()
    .eq("benchmark_kind", benchmarkKind)
    .order("headline_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(limit * 6, 30));

  if (scope === "cpu-full") {
    query = query.contains("raw_metrics", { runMode: "full" });
  } else if (scope === "cpu-singleCore") {
    query = query.contains("raw_metrics", { runMode: "singleCore" });
  } else if (scope === "cpu-multiCore") {
    query = query.contains("raw_metrics", { runMode: "multiCore" });
  }

  const runQuery = await query;
  const runRows = (runQuery.data as BenchmarkRunRow[] | null) ?? [];

  if (runQuery.error || runRows.length === 0) {
    return [];
  }

  const deviceProfileIds = Array.from(
    new Set(runRows.map((row) => row.device_profile_id)),
  );
  const userIds = Array.from(
    new Set(runRows.map((row) => row.user_id).filter(Boolean)),
  ) as string[];

  const [deviceQuery, profileQuery] = await Promise.all([
    admin.from("device_profiles").select().in("id", deviceProfileIds),
    userIds.length
      ? admin.from("profiles").select().in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const deviceProfiles = new Map(
    ((deviceQuery.data as Database["public"]["Tables"]["device_profiles"]["Row"][] | null) ??
      []
    ).map((profile) => [profile.id, profile]),
  );
  const userProfiles = new Map(
    ((profileQuery.data as Database["public"]["Tables"]["profiles"]["Row"][] | null) ?? []).map(
      (profile) => [profile.id, profile],
    ),
  );

  const mappedResults = runRows
    .map((row) => {
      const deviceProfile = deviceProfiles.get(row.device_profile_id);

      if (!deviceProfile) {
        return null;
      }

      return mapBenchmarkRunRow(
        row,
        mapStoredDeviceProfile(deviceProfile),
        mapProfileRow(userProfiles.get(row.user_id ?? "") ?? null),
      );
    })
    .filter(
      (
        result,
      ): result is PersistedCpuBenchmarkResult | PersistedGpuBenchmarkResult =>
        result !== null,
    )
    .filter((result) => matchesLeaderboardScope(result, scope));

  return dedupeLeaderboardResults(mappedResults, scope, limit);
}

export async function getBenchmarkResultById(id: string) {
  if (shouldUseDevResultStore()) {
    return getDevResult(id);
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    throw new Error("Supabase is not configured.");
  }

  const resultQuery = await admin
    .from("benchmark_runs")
    .select()
    .eq("id", id)
    .single();
  const result =
    resultQuery.data as Database["public"]["Tables"]["benchmark_runs"]["Row"] | null;

  if (!resultQuery.error && result) {
    const deviceProfile = await getDeviceProfileById(admin, result.device_profile_id);

    if (!deviceProfile) {
      return null;
    }

    const userProfile = mapProfileRow(await getProfileByUserId(admin, result.user_id));
    return mapBenchmarkRunRow(
      result,
      mapStoredDeviceProfile(deviceProfile),
      userProfile,
    );
  }

  return getLegacyCodingResultById(admin, id);
}
