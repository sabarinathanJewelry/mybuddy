import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyState, exchangeCode, ytFetch } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  // Returning from Google is a cross-site navigation, so cookies may be missing here; the signed
  // state proves who started the connect, and a same-origin page navigation carries cookies onward.
  const back = (msg: string) => {
    const to = `/social/youtube?yt=${encodeURIComponent(msg)}`;
    return new NextResponse(
      `<!doctype html><meta http-equiv="refresh" content="0;url=${to}"><script>location.replace(${JSON.stringify(to)})</script>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(p.get("error")!);
  if (!(await verifyState(p.get("state")))) return back("state_mismatch");

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
  return back("connected");
}
