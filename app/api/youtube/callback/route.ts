import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyState, exchangeCode, ytFetch } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  // Runs in the popup opened by the YouTube page. Cookies may be missing after Google, so the
  // signed state proves who started the connect; the result goes back to the opener tab.
  const back = (msg: string) => {
    const ok = msg === "connected";
    const text = ok ? "YouTube connected. You can close this window." : `YouTube connect failed: ${msg}`;
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center;color:${ok ? "#15803d" : "#b91c1c"}">
<p id="m"></p><script>
document.getElementById("m").textContent = ${JSON.stringify(text)};
if (window.opener) { window.opener.postMessage({ type: "yt_connect", result: ${JSON.stringify(msg)} }, location.origin); }
setTimeout(function () { window.close(); }, ${ok ? 1500 : 6000});
</script></body>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
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
