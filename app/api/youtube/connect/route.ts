import { NextRequest, NextResponse } from "next/server";
import { currentAdminId, makeState, redirectUri, YT_SCOPE } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const adminId = await currentAdminId();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set" }, { status: 503 });
  }
  const state = makeState(adminId);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req.nextUrl.origin),
    response_type: "code",
    scope: YT_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return NextResponse.redirect(url);
}
