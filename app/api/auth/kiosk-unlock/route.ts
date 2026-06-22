import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Shot } from "@/components/login/shooting-range";

type KioskTap = { bio_user_id: string; action: "in" | "out" };

function seqEquals(a: KioskTap[], b: KioskTap[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.bio_user_id === b[i].bio_user_id && s.action === b[i].action);
}

export async function POST(req: Request) {
  try {
    const { sequence }: { sequence: KioskTap[] } = await req.json();
    if (!sequence?.length) return NextResponse.json({ error: "Missing sequence" }, { status: 400 });

    const admin = supabaseAdmin();

    // Fetch all admin/subadmin profiles that have a kiosk_sequence set
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, kiosk_sequence")
      .in("role", ["admin", "subadmin"])
      .not("kiosk_sequence", "is", null);

    if (error) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const match = (profiles ?? []).find(
      (p) => p.kiosk_sequence && seqEquals(sequence, p.kiosk_sequence as KioskTap[])
    );

    if (!match) return NextResponse.json({ error: "No match" }, { status: 401 });

    const { data: user, error: userErr } = await admin.auth.admin.getUserById(match.id);
    if (userErr || !user?.user?.email) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.user.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: "Could not generate token" }, { status: 500 });
    }

    return NextResponse.json({ token: linkData.properties.hashed_token });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
