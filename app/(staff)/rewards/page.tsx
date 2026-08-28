"use client";

import RewardsTab from "@/components/rewards/RewardsTab";
import { useMyStaffProfile } from "@/modules/attendance/api";
import Link from "next/link";

export default function StaffRewardsPage() {
  const { data: myStaffProfile } = useMyStaffProfile();
  const myBioUserId = myStaffProfile?.bio_user_id ?? null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/my-attendance" className="text-ink-dim text-sm hover:text-ink">← Back</Link>
        <h1 className="text-xl font-bold text-ink">Staff Rewards</h1>
      </div>
      <RewardsTab isAdmin={false} myBioUserId={myBioUserId} />
    </div>
  );
}
