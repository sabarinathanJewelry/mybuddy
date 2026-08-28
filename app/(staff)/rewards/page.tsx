"use client";

import RewardsTab from "@/components/rewards/RewardsTab";
import { useMyStaffProfile } from "@/modules/attendance/api";
import { useAuth } from "@/stores/auth";
import Link from "next/link";

export default function RewardsPage() {
  const profile = useAuth(s => s.profile);
  const isAdmin = profile?.role !== "staff";
  const { data: myStaffProfile } = useMyStaffProfile();
  const myBioUserId = isAdmin ? null : (myStaffProfile?.bio_user_id ?? null);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={isAdmin ? "/dashboard" : "/my-attendance"} className="text-ink-dim text-sm hover:text-ink">
          ← Back
        </Link>
        <h1 className="text-xl font-bold text-ink">Staff Rewards</h1>
      </div>
      <RewardsTab isAdmin={isAdmin} myBioUserId={myBioUserId} />
    </div>
  );
}
