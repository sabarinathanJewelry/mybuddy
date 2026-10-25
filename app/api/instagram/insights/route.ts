import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const IG_API_BASE = "https://graph.instagram.com/v21.0";
const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count";
const REEL_METRICS = "views,reach,saved,shares,total_interactions,ig_reels_avg_watch_time";
const FEED_METRICS = "views,reach,saved,shares,total_interactions";

async function ig(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${IG_API_BASE}${path}${sep}access_token=${ACCESS_TOKEN}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Instagram API ${res.status}`);
  return json;
}

export async function GET(req: Request) {
  const { data: { user } } = await (await supabaseServer()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabaseAdmin().from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  if (!ACCESS_TOKEN) {
    return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN not set" }, { status: 503 });
  }
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 60), 150);

  try {
    const profile = await ig("/me?fields=user_id,username,name,profile_picture_url,followers_count,follows_count,media_count");

    const media: any[] = [];
    let after: string | null = null;
    do {
      const page: any = await ig(`/me/media?fields=${MEDIA_FIELDS}&limit=50${after ? `&after=${after}` : ""}`);
      media.push(...(page.data ?? []));
      after = page.paging?.next ? page.paging?.cursors?.after ?? null : null;
    } while (after && media.length < limit);

    const items = await Promise.all(media.slice(0, limit).map(async (m) => {
      const metrics = m.media_product_type === "REELS" ? REEL_METRICS : FEED_METRICS;
      const insights: Record<string, number> = {};
      try {
        const r = await ig(`/${m.id}/insights?metric=${metrics}`);
        for (const d of r.data ?? []) insights[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? 0;
      } catch {}
      return { ...m, insights };
    }));

    return NextResponse.json({ profile, items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
