import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, pollComments } from "@/lib/youtube";

export const dynamic = "force-dynamic";

// Called every few minutes by Supabase pg_cron (Bearer YOUTUBE_POLL_SECRET), or by an admin via "Check now"
export async function GET(req: NextRequest) {
  const secret = process.env.YOUTUBE_POLL_SECRET;
  const bearer = req.headers.get("authorization");
  const bySecret = !!secret && bearer === `Bearer ${secret}`;
  if (!bySecret && !(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await pollComments());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
