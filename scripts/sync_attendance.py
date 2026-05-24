"""
Syncs staff and attendance data from ZK biometric device to Supabase.

Requirements (run once):
  pip install pyzk supabase

Usage:
  python scripts/sync_attendance.py            # full sync
  python scripts/sync_attendance.py --show     # print raw device data and exit (for debugging)

Schedule via Windows Task Scheduler for automatic hourly sync.
"""

import sys
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

PUNCH_STATUS = {0: "Check-In", 1: "Check-Out", 4: "OT-In", 5: "OT-Out", 255: "Other"}
PUNCH_TYPE   = {0: "Finger", 1: "Finger", 2: "Face", 3: "Password", 4: "Card"}


def connect_device():
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=10)
    return zk.connect()


def show_raw(conn):
    """Print all raw data from the device — useful to verify fields before syncing."""
    print("\n=== USERS / EMPLOYEES ===")
    users = conn.get_users()
    for u in users:
        print(
            f"  device_uid={u.uid}  user_id={u.user_id!r:>6}  name={u.name!r:30}"
            f"  privilege={u.privilege}  card={u.card}  group={u.group_id!r}"
        )

    print(f"\n  Total users: {len(users)}")

    print("\n=== ATTENDANCE (last 10) ===")
    attendance = conn.get_attendance()
    for att in list(attendance)[-10:]:
        print(
            f"  user_id={att.user_id!r:>6}  time={att.timestamp}"
            f"  status={att.status} ({PUNCH_STATUS.get(att.status, '?')})"
            f"  punch={att.punch} ({PUNCH_TYPE.get(att.punch, '?')})"
        )
    print(f"\n  Total records: {len(attendance)}")


def sync(conn):
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── Sync staff ──────────────────────────────────────────────────────
    users = conn.get_users()
    if users:
        staff_rows = []
        for u in users:
            staff_rows.append({
                "bio_user_id": str(u.user_id),
                "name":        u.name.strip() if u.name else f"User {u.user_id}",
                "device_uid":  u.uid,
                "privilege":   u.privilege,
                "card_no":     u.card or 0,
                "group_id":    str(u.group_id) if u.group_id else "",
            })
        sb.table("staff").upsert(staff_rows, on_conflict="bio_user_id").execute()
        print(f"Staff synced: {len(staff_rows)}")
        for r in staff_rows:
            print(f"  [{r['bio_user_id']}] {r['name']}  card={r['card_no']}  group={r['group_id']!r}")

    # ── Sync attendance ─────────────────────────────────────────────────
    attendance = conn.get_attendance()
    if attendance:
        records = []
        for att in attendance:
            punch = att.timestamp
            if punch.tzinfo is None:
                punch = punch.replace(tzinfo=IST)
            records.append({
                "bio_user_id":  str(att.user_id),
                "punch_time":   punch.isoformat(),
                "punch_status": att.status,
                "punch_type":   att.punch,
            })

        for i in range(0, len(records), 500):
            sb.table("attendance_logs").upsert(
                records[i : i + 500],
                on_conflict="bio_user_id,punch_time",
            ).execute()

        print(f"Attendance records synced: {len(records)}")
    else:
        print("No attendance records on device.")


def main():
    show_only = "--show" in sys.argv
    print(f"Connecting to ZK device at {ZK_IP}:{ZK_PORT}...")
    conn = connect_device()
    try:
        if show_only:
            show_raw(conn)
        else:
            sync(conn)
    finally:
        conn.disconnect()
        print("Disconnected.")


if __name__ == "__main__":
    main()
