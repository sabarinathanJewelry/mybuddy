import { createClient } from "@supabase/supabase-js";

let cached: { token: string; at: number } | null = null;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Refreshed token from ig_token table; falls back to INSTAGRAM_ACCESS_TOKEN env.
export async function igToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.token;
  const { data } = await admin().from("ig_token").select("access_token").eq("id", 1).maybeSingle();
  const token = data?.access_token || process.env.INSTAGRAM_ACCESS_TOKEN || "";
  cached = { token, at: Date.now() };
  return token;
}

export async function refreshIgToken() {
  const db = admin();
  const current = await igToken();
  if (!current) throw new Error("No Instagram token");
  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${current}`,
    { cache: "no-store" },
  );
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    const msg = json?.error?.message ?? `Refresh failed ${res.status}`;
    await db.from("ig_token").upsert({ id: 1, access_token: current, last_error: msg });
    throw new Error(msg);
  }
  const expires_at = new Date(Date.now() + (json.expires_in ?? 5184000) * 1000).toISOString();
  await db.from("ig_token").upsert({
    id: 1, access_token: json.access_token, expires_at, refreshed_at: new Date().toISOString(), last_error: null,
  });
  cached = { token: json.access_token, at: Date.now() };
  return { expires_at };
}
