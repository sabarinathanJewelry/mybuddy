import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ZK_IP   = process.env.ZK_DEVICE_IP   ?? "192.168.1.101";
const ZK_PORT = parseInt(process.env.ZK_DEVICE_PORT ?? "4370");

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 500 }
    );
  }

  const sb = createClient(url, key);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ZKLib = require("node-zklib");
  const zk = new ZKLib(ZK_IP, ZK_PORT, 10, 4000);

  try {
    await zk.createSocket();

    // ── Staff ───────────────────────────────────────────────────────────
    const { data: users = [] } = await zk.getUsers();
    if (users.length) {
      const staffRows = users.map((u: any) => ({
        bio_user_id: String(u.userId),
        name:        u.name?.trim() || `User ${u.userId}`,
        device_uid:  u.uid   ?? null,
        privilege:   u.role  ?? 0,
        card_no:     u.cardno ?? 0,
      }));
      await sb.from("staff").upsert(staffRows, { onConflict: "bio_user_id" });
    }

    // ── Attendance ──────────────────────────────────────────────────────
    const { data: logs = [] } = await zk.getAttendances();
    const records = (logs as any[])
      .filter((a) => a.deviceUserId)
      .map((a) => ({
        bio_user_id:  String(a.deviceUserId),
        punch_time:   (a.recordTime instanceof Date ? a.recordTime : new Date(a.recordTime)).toISOString(),
        punch_status: a.state ?? null,
        punch_type:   a.type  ?? null,
      }));

    for (let i = 0; i < records.length; i += 500) {
      await sb.from("attendance_logs").upsert(
        records.slice(i, i + 500),
        { onConflict: "bio_user_id,punch_time" }
      );
    }

    return NextResponse.json({ ok: true, staff: users.length, records: records.length });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message ?? "Unknown error" }, { status: 500 });
  } finally {
    try { await zk.disconnect(); } catch {}
  }
}
