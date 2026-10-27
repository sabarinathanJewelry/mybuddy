import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";

export async function GET() {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabaseAdmin().from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "subadmin"].includes(profile?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ACCESS_TOKEN) return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN not set" }, { status: 503 });

  const res = await fetch(
    `https://graph.instagram.com/v21.0/me/media?fields=id,caption,media_product_type,thumbnail_url,media_url,timestamp,permalink&limit=30&access_token=${ACCESS_TOKEN}`,
    { cache: "no-store" }
  );
  const json = await res.json();
  if (!res.ok) return NextResponse.json({ error: json?.error?.message ?? "Instagram API error" }, { status: 500 });

  const items = (json.data ?? []).map((m: any) => ({
    id: m.id,
    label: `${new Date(m.timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · ${(m.caption ?? "(no caption)").split("\n")[0].slice(0, 60)}`,
    thumb: m.thumbnail_url ?? m.media_url ?? null,
    permalink: m.permalink,
  }));
  return NextResponse.json({ items });
}
