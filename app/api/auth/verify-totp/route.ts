import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { authenticator } from "otplib";

const COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const client = await supabaseServer();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const admin = supabaseAdmin();

    const { data: row, error: dbErr } = await admin
      .from("user_totp")
      .select("totp_secret")
      .eq("user_id", userId)
      .single();

    if (dbErr || !row) {
      return NextResponse.json({ error: "2FA not set up" }, { status: 404 });
    }

    const isValid = authenticator.check(token.trim(), row.totp_secret);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set("mfa_verified", userId, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    console.error("verify-totp", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
