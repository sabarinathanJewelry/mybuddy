import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return _client;
}
