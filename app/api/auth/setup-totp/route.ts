import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateSecret, generateSync } from "otplib";

export async function POST() {
  try {
    const client = await supabaseServer();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const admin = supabaseAdmin();

    const secret = generateSecret();
    const token = generateSync({ secret });
    const epoch = Math.floor(Date.now() / 1000);
    const secondsRemaining = 30 - (epoch % 30);

    // Store the secret (upsert in case they're re-setting up)
    const { error: dbErr } = await admin
      .from("user_totp")
      .upsert({ user_id: userId, totp_secret: secret }, { onConflict: "user_id" });
    if (dbErr) throw dbErr;

    // Flag MFA as enabled in app_metadata (service-role only, can't be forged by user)
    const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...session.user.app_metadata, mfa_enabled: true },
    });
    if (metaErr) throw metaErr;

    return NextResponse.json({ code: token, seconds_remaining: secondsRemaining });
  } catch (e) {
    console.error("setup-totp", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
