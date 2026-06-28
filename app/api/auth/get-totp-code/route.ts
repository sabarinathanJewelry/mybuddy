import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { generateSync } from "otplib";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const client = await supabaseServer();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Require MFA cookie — only already-verified devices can display the code
    const cookieStore = await cookies();
    const mfaVerified = cookieStore.get("mfa_verified")?.value;
    if (mfaVerified !== session.user.id) {
      return NextResponse.json({ error: "MFA not verified on this device" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const { data: row, error } = await admin
      .from("user_totp")
      .select("totp_secret")
      .eq("user_id", session.user.id)
      .single();

    if (error || !row) return NextResponse.json({ error: "2FA not set up" }, { status: 404 });

    const code = generateSync({ secret: row.totp_secret });
    const epoch = Math.floor(Date.now() / 1000);
    const secondsRemaining = 30 - (epoch % 30);

    return NextResponse.json({ code, seconds_remaining: secondsRemaining });
  } catch (e) {
    console.error("get-totp-code", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
