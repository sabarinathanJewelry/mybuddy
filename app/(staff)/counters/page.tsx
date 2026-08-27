"use client";

import CountersTab from "@/components/counters/CountersTab";
import { useMyStaffProfile } from "@/modules/attendance/api";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function StaffCountersPage() {
  const { data: myStaffProfile } = useMyStaffProfile();
  const myBioUserId = myStaffProfile?.bio_user_id ?? null;
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase().auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase().from("profiles").select("role").eq("id", user.id).single()
        .then(({ data }) => { if (data?.role && data.role !== "staff") setIsAdmin(true); });
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-ink">Counter Cleanliness</h1>
      <CountersTab isAdmin={isAdmin} myBioUserId={myBioUserId} />
    </div>
  );
}
