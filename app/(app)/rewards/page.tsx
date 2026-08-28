"use client";

import RewardsTab from "@/components/rewards/RewardsTab";
import { useAuth } from "@/stores/auth";

export default function AdminRewardsPage() {
  const profile = useAuth(s => s.profile);
  const isAdmin = profile?.role !== "staff";

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-ink">Staff Rewards</h1>
      <RewardsTab isAdmin={isAdmin} myBioUserId={null} />
    </div>
  );
}
