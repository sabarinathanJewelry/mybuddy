import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { bio_user_id, title, body } = await req.json();
  if (!bio_user_id || !title) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { data: subs, error } = await serviceClient
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("bio_user_id", bio_user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const payload = JSON.stringify({ title, body, badge: 1 });
  const results = await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  const expired = results
    .map((r, i) => (r.status === "rejected" && (r.reason as { statusCode?: number })?.statusCode === 410 ? subs[i].endpoint : null))
    .filter(Boolean) as string[];

  if (expired.length > 0) {
    await serviceClient.from("push_subscriptions").delete().in("endpoint", expired);
  }

  return NextResponse.json({ ok: true, sent: results.filter(r => r.status === "fulfilled").length });
}
