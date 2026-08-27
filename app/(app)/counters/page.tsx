"use client";

import CountersTab from "@/components/counters/CountersTab";
import { useAuth } from "@/stores/auth";
import { useMyStaffProfile } from "@/modules/attendance/api";

export default function CountersPage() {
  const profile = useAuth(s => s.profile);
  const { data: myStaffProfile } = useMyStaffProfile();
  const isAdmin = profile?.role !== "staff";
  const myBioUserId = myStaffProfile?.bio_user_id ?? null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-ink">Counter Cleanliness</h1>
      </div>
      <CountersTab isAdmin={isAdmin} myBioUserId={myBioUserId} />
    </div>
  );
}
