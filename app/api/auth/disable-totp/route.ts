import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST() {
  try {
    const client = await supabaseServer();
    const { data: { session } } = await client.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const admin = supabaseAdmin();

    await admin.from("user_totp").delete().eq("user_id", userId);

    await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...session.user.app_metadata, mfa_enabled: false },
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.delete("mfa_verified");
    return res;
  } catch (e) {
    console.error("disable-totp", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
