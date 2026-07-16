import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function randomDigits(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

// Called by the TV app on first launch — no auth (the TV has no Supabase session).
// Returns a fresh 6-digit pairing code to show on screen, plus a device_secret the
// TV must persist immediately (this is the only time it's returned).
export async function POST() {
  const admin = supabaseAdmin();

  let pairingCode = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomDigits(6);
    const { data } = await admin.from("devices").select("id").eq("pairing_code", candidate).maybeSingle();
    if (!data) {
      pairingCode = candidate;
      break;
    }
  }
  if (!pairingCode) {
    return NextResponse.json({ error: "Could not allocate a pairing code, try again." }, { status: 500 });
  }

  const deviceSecret = randomBytes(24).toString("hex");

  const { data: device, error } = await admin
    .from("devices")
    .insert({ pairing_code: pairingCode, device_secret: deviceSecret, status: "pending" })
    .select("id, pairing_code")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    device_id: device.id,
    pairing_code: device.pairing_code,
    device_secret: deviceSecret,
  });
}
