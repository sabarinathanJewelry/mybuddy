import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ZK_IP   = process.env.ZK_DEVICE_IP   ?? "192.168.1.101";
const ZK_PORT = parseInt(process.env.ZK_DEVICE_PORT ?? "4370");

export async function POST() {
  // Vercel (cloud) cannot reach a local network device
  if (process.env.VERCEL) {
    return NextResponse.json(
      { ok: false, vercel: true, error: `App is running on Vercel — it cannot reach the local device at ${ZK_IP}. Run the local sync script instead: node scripts/sync-attendance.js` },
      { status: 400 }
    );
  }

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
  const zk = new ZKLib(ZK_IP, ZK_PORT, 10000, 4000);

  try {
    await zk.createSocket();

    const { data: users = [] } = await zk.getUsers();
    // Staff sync is non-fatal — attendance sync always runs even if this errors
    try {
      if (users.length) {
        // Fetch existing names from DB so we never overwrite manually-edited names
        const { data: existingStaff } = await sb.from("staff").select("bio_user_id, name");
        const nameMap = new Map((existingStaff ?? []).map((s) => [s.bio_user_id, s.name]));

        // Single upsert: existing staff keep their DB name, new staff get device name
        const rows = (users as any[]).map((u) => ({
          bio_user_id: String(u.userId),
          name:        nameMap.get(String(u.userId)) || u.name?.trim() || `User ${u.userId}`,
          device_uid:  u.uid    ?? null,
          privilege:   u.role   ?? 0,
          card_no:     u.cardno ?? 0,
        }));
        await sb.from("staff").upsert(rows, { onConflict: "bio_user_id" });
      }
    } catch (staffErr: any) {
      console.warn("Staff sync warning (attendance still syncing):", staffErr?.message ?? staffErr);
    }

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

    await sb.from("app_settings").upsert({ key: "last_sync_at", value: new Date().toISOString() });
    return NextResponse.json({ ok: true, staff: (users as any[]).length, records: records.length });
  } catch (err: any) {
    const msg = err?.message || err?.code || String(err) || "Connection failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    try { await zk.disconnect(); } catch {}
  }
}
