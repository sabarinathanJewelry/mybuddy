"""
OPTIONAL fallback sync script (Python).
The app now syncs automatically via the built-in API route — you don't need this script.
Use it only if the app server is not running and you need a one-off manual sync.

Requirements:
  pip install pyzk supabase python-dotenv

Usage:
  python scripts/sync_attendance.py           # full sync
  python scripts/sync_attendance.py --show    # print raw device data only
"""

import sys
from pathlib import Path
from zk import ZK
from supabase import create_client
from datetime import timezone, timedelta
from dotenv import load_dotenv
import os

# Read credentials from Next.js .env.local (same vars the app uses)
load_dotenv(Path(__file__).parent.parent / ".env.local")
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ZK_IP        = os.getenv("ZK_DEVICE_IP", "192.168.1.101")
ZK_PORT      = int(os.getenv("ZK_DEVICE_PORT", "4370"))

IST = timezone(timedelta(hours=5, minutes=30))


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env.local")
        sys.exit(1)

    show_only = "--show" in sys.argv
    print(f"Connecting to {ZK_IP}:{ZK_PORT} ...")
    conn = ZK(ZK_IP, port=ZK_PORT, timeout=10).connect()

    try:
        if show_only:
            for u in conn.get_users():
                print(f"  uid={u.uid}  id={u.user_id!r:>6}  name={u.name!r:30}  card={u.card}")
            att = conn.get_attendance()
            for a in list(att)[-10:]:
                print(f"  id={a.user_id!r:>6}  time={a.timestamp}  status={a.status}")
            print(f"Total attendance records: {len(att)}")
            return

        sb = create_client(SUPABASE_URL, SUPABASE_KEY)

        users = conn.get_users()
        if users:
            rows = [{"bio_user_id": str(u.user_id), "name": u.name.strip() or f"User {u.user_id}",
                     "device_uid": u.uid, "privilege": u.privilege, "card_no": u.card or 0} for u in users]
            sb.table("staff").upsert(rows, on_conflict="bio_user_id").execute()
            print(f"Staff synced: {len(rows)}")

        att = conn.get_attendance()
        if att:
            records = []
            for a in att:
                t = a.timestamp.replace(tzinfo=IST) if a.timestamp.tzinfo is None else a.timestamp
                records.append({"bio_user_id": str(a.user_id), "punch_time": t.isoformat()})
            for i in range(0, len(records), 500):
                sb.table("attendance_logs").upsert(records[i:i+500], on_conflict="bio_user_id,punch_time").execute()
            print(f"Attendance synced: {len(records)}")
    finally:
        conn.disconnect()


if __name__ == "__main__":
    main()
