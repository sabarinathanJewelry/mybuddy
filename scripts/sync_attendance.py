"""
Syncs attendance data from ZK biometric device to Supabase.

Requirements (run once):
  pip install pyzk supabase

How to run:
  python scripts/sync_attendance.py

Schedule via Windows Task Scheduler to run automatically (e.g. every hour).
"""

from zk import ZK
from supabase import create_client
from datetime import timezone, timedelta

# ── CONFIG ─────────────────────────────────────────────────────────────────
ZK_IP   = "192.168.1.101"
ZK_PORT = 4370

# Supabase → Settings → API → Project URL and service_role key
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_KEY = "your-service-role-key"
# ───────────────────────────────────────────────────────────────────────────

IST = timezone(timedelta(hours=5, minutes=30))


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    print(f"Connecting to ZK device at {ZK_IP}:{ZK_PORT}...")
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=10)
    conn = zk.connect()

    try:
        # 1. Sync staff names from device
        users = conn.get_users()
        if users:
            staff_rows = [
                {
                    "bio_user_id": str(u.user_id),
                    "name": u.name.strip() if u.name else f"User {u.user_id}",
                }
                for u in users
            ]
            sb.table("staff").upsert(staff_rows, on_conflict="bio_user_id").execute()
            print(f"  Staff synced: {len(staff_rows)}")

        # 2. Sync attendance punches
        attendance = conn.get_attendance()
        if attendance:
            records = []
            for att in attendance:
                punch = att.timestamp
                if punch.tzinfo is None:
                    punch = punch.replace(tzinfo=IST)
                records.append(
                    {
                        "bio_user_id": str(att.user_id),
                        "punch_time": punch.isoformat(),
                    }
                )

            # Batch upsert in chunks of 500
            for i in range(0, len(records), 500):
                sb.table("attendance_logs").upsert(
                    records[i : i + 500],
                    on_conflict="bio_user_id,punch_time",
                ).execute()

            print(f"  Attendance records synced: {len(records)}")
        else:
            print("  No attendance records found on device.")

    finally:
        conn.disconnect()
        print("Done.")


if __name__ == "__main__":
    main()
