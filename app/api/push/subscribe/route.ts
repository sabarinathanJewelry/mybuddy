import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const { bio_user_id, subscription } = await req.json();
  if (!bio_user_id || !subscription?.endpoint) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const { error } = await serviceClient.from("push_subscriptions").upsert(
    {
      bio_user_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "bio_user_id,endpoint" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
