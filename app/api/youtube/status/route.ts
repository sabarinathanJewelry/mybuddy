import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await supabaseAdmin().from("yt_settings")
    .select("channel_title, connected_at, last_polled_at, last_error, refresh_token").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    connected: !!data?.refresh_token,
    channel_title: data?.channel_title ?? null,
    connected_at: data?.connected_at ?? null,
    last_polled_at: data?.last_polled_at ?? null,
    last_error: data?.last_error ?? null,
  });
}
