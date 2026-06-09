import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
  }

  // Verify calling user is admin via Bearer token
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: { user: caller } } = await admin.auth.getUser(token);
  if (!caller) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // app_metadata.role may be unset for legacy admins — check profiles table instead
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();
  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const { userId, role } = await request.json();
  if (!userId || !["staff", "subadmin"].includes(role)) {
    return NextResponse.json({ error: "Invalid userId or role" }, { status: 400 });
  }

  // Update app_metadata.role
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  // Keep profiles.role in sync
  const { error: profileErr } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });

  // Clear allowed_modules when demoting back to staff
  if (role === "staff") {
    await admin.from("profiles").update({ allowed_modules: [] }).eq("id", userId);
  }

  return NextResponse.json({ ok: true });
}
