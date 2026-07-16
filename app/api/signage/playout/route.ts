import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Called by the TV app on every refresh (initial load + whenever a "signage-updates"
// broadcast wakes it up). Authenticated by device_secret, not a Supabase session —
// see the note in db/migrations/133_signage_system.sql on why devices never log in.
export async function POST(req: NextRequest) {
  const { device_id, device_secret } = await req.json().catch(() => ({}));
  if (!device_id || !device_secret) {
    return NextResponse.json({ error: "device_id and device_secret required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: device, error } = await admin
    .from("devices")
    .select("id, status, pairing_code, device_secret")
    .eq("id", device_id)
    .single();

  if (error || !device || device.device_secret !== device_secret) {
    return NextResponse.json({ error: "Invalid device" }, { status: 401 });
  }

  await admin.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device_id);

  if (device.status === "pending") {
    return NextResponse.json({ paired: false, pairing_code: device.pairing_code });
  }

  const { data: playout, error: playoutErr } = await admin.rpc("get_device_playout", { p_device_id: device_id });
  if (playoutErr) return NextResponse.json({ error: playoutErr.message }, { status: 500 });

  return NextResponse.json({ paired: true, ...playout });
}
