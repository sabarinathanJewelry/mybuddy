import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Shot } from "@/components/login/shooting-range";

function patternEquals(a: Shot[], b: Shot[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.gun === b[i].gun && s.target === b[i].target);
}

export async function POST(req: Request) {
  try {
    const { secret, pattern }: { secret: string; pattern: Shot[] } = await req.json();

    if (!secret || !pattern?.length) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Find profile by secret number
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, secret_number, login_pattern")
      .eq("secret_number", secret);

    if (error || !profiles?.length) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify pattern against each matching profile
    const match = profiles.find((p) =>
      p.login_pattern && patternEquals(pattern, p.login_pattern as Shot[])
    );

    if (!match) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Get the user's email from auth.users
    const { data: user, error: userErr } = await admin.auth.admin.getUserById(match.id);
    if (userErr || !user?.user?.email) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Generate magic link token
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.user.email,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.json({ error: "Could not generate token" }, { status: 500 });
    }

    return NextResponse.json({
      email: user.user.email,
      token: linkData.properties.hashed_token,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
