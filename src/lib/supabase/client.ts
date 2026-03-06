import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

let browserClient: SupabaseClient<Database> | null = null;

export function getBrowserSupabaseClient() {
  const env = getPublicSupabaseEnv();

  if (!env.configured || typeof window === "undefined") {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient<Database>(env.url, env.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }

  return browserClient;
}
