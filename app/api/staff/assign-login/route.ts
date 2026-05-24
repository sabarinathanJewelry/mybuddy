import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { bio_user_id, name, email, password } = await req.json();

  if (!bio_user_id || !email || !password) {
    return NextResponse.json({ ok: false, error: "bio_user_id, email and password are required" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Check if this staff member already has a login
  const { data: existing } = await admin
    .from("staff")
    .select("user_id")
    .eq("bio_user_id", bio_user_id)
    .single();

  // If they already have a user_id, update credentials instead of creating
  if (existing?.user_id) {
    const { error } = await admin.auth.admin.updateUserById(existing.user_id, {
      email,
      password,
      app_metadata: { role: "staff", bio_user_id },
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    await admin.from("profiles").upsert({
      id: existing.user_id,
      display_name: name ?? "",
      role: "staff",
      language: "en",
    }, { onConflict: "id" });

    return NextResponse.json({ ok: true, action: "updated" });
  }

  // Create new auth user
  const { data, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    app_metadata: { role: "staff", bio_user_id },
    email_confirm: true,
  });
  if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 400 });

  const userId = data.user.id;

  // Link to staff row
  await admin.from("staff").update({ user_id: userId }).eq("bio_user_id", bio_user_id);

  // Create profile
  await admin.from("profiles").upsert({
    id: userId,
    display_name: name ?? "",
    role: "staff",
    language: "en",
  }, { onConflict: "id" });

  return NextResponse.json({ ok: true, action: "created" });
}

export async function DELETE(req: Request) {
  const { bio_user_id } = await req.json();
  if (!bio_user_id) return NextResponse.json({ ok: false, error: "bio_user_id required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data } = await admin.from("staff").select("user_id").eq("bio_user_id", bio_user_id).single();
  if (!data?.user_id) return NextResponse.json({ ok: false, error: "No login assigned" }, { status: 404 });

  await admin.auth.admin.deleteUser(data.user_id);
  await admin.from("staff").update({ user_id: null }).eq("bio_user_id", bio_user_id);

  return NextResponse.json({ ok: true });
}
