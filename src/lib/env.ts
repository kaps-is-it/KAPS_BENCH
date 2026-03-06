export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    url,
    anonKey,
    siteUrl,
    configured: Boolean(url && anonKey),
  };
}

export function getServerSupabaseEnv() {
  const publicEnv = getPublicSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return {
    ...publicEnv,
    serviceRoleKey,
    configured: Boolean(publicEnv.configured && serviceRoleKey),
  };
}

export function shouldUseDevResultStore() {
  return (
    process.env.KAPSBENCH_USE_DEV_STORE === "1" ||
    !getServerSupabaseEnv().configured
  );
}
