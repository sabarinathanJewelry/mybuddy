import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: { user: caller } } = await admin.auth.getUser(token);
  if (!caller) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: callerProfile } = await admin.from("profiles").select("role").eq("id", caller.id).single();
  if (callerProfile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, reactivate = false } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  if (reactivate) {
    // Unban + reactivate
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    await admin.from("profiles").update({ is_active: true }).eq("id", userId);
    await admin.from("staff").update({ active: true }).eq("user_id", userId);
  } else {
    // Ban for 100 years (effectively permanent) + mark inactive
    await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    await admin.from("profiles").update({ is_active: false }).eq("id", userId);
    await admin.from("staff").update({ active: false }).eq("user_id", userId);
  }

  return NextResponse.json({ ok: true });
}
