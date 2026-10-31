import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, exchangeCode, ytFetch } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/social/youtube?yt=${encodeURIComponent(msg)}`, req.url));
  if (!(await requireAdmin())) return back("forbidden");

  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(p.get("error")!);
  const state = req.cookies.get("yt_oauth_state")?.value;
  if (!state || state !== p.get("state")) return back("state_mismatch");

  try {
    const tokens = await exchangeCode(p.get("code") ?? "", req.nextUrl.origin);
    if (!tokens.refresh_token) return back("no_refresh_token");
    const ch = await ytFetch(tokens.access_token, "/channels?part=snippet&mine=true");
    const channel = ch.items?.[0];
    if (!channel) return back("no_channel");
    const { error } = await supabaseAdmin().from("yt_settings").upsert({
      id: 1,
      refresh_token: tokens.refresh_token,
      channel_id: channel.id,
      channel_title: channel.snippet?.title ?? null,
      connected_at: new Date().toISOString(),
      last_error: null,
    });
    if (error) return back(error.message);
  } catch (e: any) {
    return back(e.message ?? "failed");
  }
  const res = back("connected");
  res.cookies.delete("yt_oauth_state");
  return res;
}
