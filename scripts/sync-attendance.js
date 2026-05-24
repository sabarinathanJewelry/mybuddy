/**
 * Local sync script — run this on the shop PC to pull attendance from the
 * biometric device and push it to Supabase.
 *
 *   node scripts/sync-attendance.js
 *
 * Reads credentials from .env.local (same file the Next.js app uses).
 * No extra install needed — node-zklib is already in package.json.
 */

const fs   = require("fs");
const path = require("path");

// ── Load .env.local ─────────────────────────────────────────────────────────
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    });
} else {
  console.error("ERROR: .env.local not found at", envPath);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZK_IP        = process.env.ZK_DEVICE_IP   || "192.168.1.101";
const ZK_PORT      = parseInt(process.env.ZK_DEVICE_PORT || "4370");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}

// ── Supabase REST helpers ────────────────────────────────────────────────────
async function supabaseUpsert(table, rows, onConflict, prefer = "resolution=merge-duplicates") {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: prefer,
      },
      body: JSON.stringify(rows),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error on ${table}: ${text}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const ZKLib = require("node-zklib");
  const zk = new ZKLib(ZK_IP, ZK_PORT, 10000, 4000);

  console.log(`Connecting to ZK device at ${ZK_IP}:${ZK_PORT} ...`);
  await zk.createSocket();
  console.log("Connected.");

  try {
    // Sync staff
    const { data: users = [] } = await zk.getUsers();
    if (users.length) {
      // Step 1: insert NEW staff only (ignore existing — preserves manually-edited names)
      const newRows = users.map((u) => ({
        bio_user_id: String(u.userId),
        name:        u.name?.trim() || `User ${u.userId}`,
        device_uid:  u.uid   ?? null,
        privilege:   u.role  ?? 0,
        card_no:     u.cardno ?? 0,
      }));
      await supabaseUpsert("staff", newRows, "bio_user_id", "resolution=ignore-duplicates");

      // Step 2: update device fields only for ALL staff (never touches name)
      const deviceRows = users.map((u) => ({
        bio_user_id: String(u.userId),
        device_uid:  u.uid   ?? null,
        privilege:   u.role  ?? 0,
        card_no:     u.cardno ?? 0,
      }));
      await supabaseUpsert("staff", deviceRows, "bio_user_id", "resolution=merge-duplicates");

      console.log(`Staff synced: ${newRows.length}`);
      newRows.forEach((r) => console.log(`  [${r.bio_user_id}] ${r.name}`));
    }

    // Sync attendance
    const { data: logs = [] } = await zk.getAttendances();
    const records = logs
      .filter((a) => a.deviceUserId)
      .map((a) => ({
        bio_user_id:  String(a.deviceUserId),
        punch_time:   (a.recordTime instanceof Date ? a.recordTime : new Date(a.recordTime)).toISOString(),
        punch_status: a.state ?? null,
        punch_type:   a.type  ?? null,
      }));

    for (let i = 0; i < records.length; i += 500) {
      await supabaseUpsert("attendance_logs", records.slice(i, i + 500), "bio_user_id,punch_time");
    }
    console.log(`Attendance records synced: ${records.length}`);
    console.log("Done.");
  } finally {
    await zk.disconnect();
  }
}

main().catch((err) => {
  console.error("SYNC FAILED:", err.message || err);
  process.exit(1);
});
