import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const YT_API = "https://www.googleapis.com/youtube/v3";
export const YT_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

export async function requireAdmin() {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabaseAdmin().from("profiles").select("role").eq("id", user.id).single();
  return ["admin", "subadmin"].includes(profile?.role ?? "");
}

export function redirectUri(origin: string) {
  return `${origin}/api/youtube/callback`;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      ...params,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `Google token ${res.status}`);
  return data as { access_token: string; refresh_token?: string };
}

export function exchangeCode(code: string, origin: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(origin) });
}

export async function ytFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${YT_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `YouTube API ${res.status}`);
  return data;
}

// ASCII keywords match whole words ("rate" must not match "accurate"); Tamil etc. match as substrings
function matches(text: string, keyword: string) {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  if (!/^[\x00-\x7F]+$/.test(k)) return text.includes(k);
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(text);
}

type Rule = { id: string; keywords: string; reply_text: string; trigger_count: number };

export async function pollComments() {
  const db = supabaseAdmin();
  const { data: settings } = await db.from("yt_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings?.refresh_token || !settings.channel_id) return { skipped: "YouTube not connected" };

  let token: string;
  try {
    token = (await tokenRequest({ grant_type: "refresh_token", refresh_token: settings.refresh_token })).access_token;
  } catch (e: any) {
    await db.from("yt_settings").update({ last_error: `Reconnect YouTube: ${e.message}` }).eq("id", 1);
    throw e;
  }

  const data = await ytFetch(token,
    `/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${settings.channel_id}&order=time&maxResults=50&textFormat=plainText`);
  const since = new Date(settings.connected_at ?? 0).getTime();
  const fresh = (data.items ?? []).filter((t: any) => {
    const top = t.snippet.topLevelComment.snippet;
    if (top.authorChannelId?.value === settings.channel_id) return false;
    if (new Date(top.publishedAt).getTime() < since) return false;
    return !(t.replies?.comments ?? []).some((r: any) => r.snippet.authorChannelId?.value === settings.channel_id);
  });

  const ids = fresh.map((t: any) => t.id as string);
  const { data: seen } = ids.length
    ? await db.from("yt_reply_log").select("comment_id").in("comment_id", ids)
    : { data: [] };
  const seenIds = new Set((seen ?? []).map((s) => s.comment_id));

  const { data: rules } = await db.from("yt_reply_rules").select("id, keywords, reply_text, trigger_count")
    .eq("active", true).order("sort_order").order("created_at");

  let replied = 0;
  for (const t of fresh) {
    if (seenIds.has(t.id)) continue;
    const top = t.snippet.topLevelComment.snippet;
    const text = String(top.textOriginal ?? top.textDisplay ?? "");
    const author = String(top.authorDisplayName ?? "");
    const { data: row, error } = await db.from("yt_reply_log").insert({
      comment_id: t.id, video_id: t.snippet.videoId ?? null, author, comment_text: text,
    }).select("id").single();
    if (error || !row) continue;

    const lower = text.toLowerCase();
    const rule = ((rules ?? []) as Rule[]).find((r) => r.keywords.split(",").some((k) => matches(lower, k)));
    if (!rule) {
      await db.from("yt_reply_log").update({ status: "no_match" }).eq("id", row.id);
      continue;
    }
    try {
      const reply = rule.reply_text.replace(/\{name\}/gi, author.replace(/^@/, "") || "there");
      await ytFetch(token, "/comments?part=snippet", {
        method: "POST",
        body: JSON.stringify({ snippet: { parentId: t.id, textOriginal: reply } }),
      });
      await db.from("yt_reply_log").update({ status: "replied", rule_id: rule.id }).eq("id", row.id);
      await db.from("yt_reply_rules").update({ trigger_count: rule.trigger_count + 1 }).eq("id", rule.id);
      rule.trigger_count++;
      replied++;
    } catch (e: any) {
      await db.from("yt_reply_log").update({ status: "failed", rule_id: rule.id, error: e.message }).eq("id", row.id);
    }
  }

  const yearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  await db.from("yt_reply_log").delete().lt("created_at", yearAgo);
  await db.from("yt_settings").update({ last_polled_at: new Date().toISOString(), last_error: null }).eq("id", 1);
  return { checked: fresh.length, replied };
}
