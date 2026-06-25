"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(date: string) {
  return date.slice(0, 7); // "YYYY-MM"
}
function dismissedKey(date: string) {
  return `absence_banner_dismissed_${date}`;
}

export default function StaffAbsenceBanner() {
  const today = todayStr();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  // Check localStorage after mount
  useEffect(() => {
    setDismissed(!!localStorage.getItem(dismissedKey(today)));
  }, [today]);

  // Today's approved leaves
  const { data: leaves = [] } = useQuery({
    queryKey: ["leaves-today-banner", today],
    enabled: !dismissed,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("leave_requests")
        .select("bio_user_id, leave_type, staff(name)")
        .eq("leave_date", today)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ bio_user_id: string; leave_type: string; staff: { name: string } | null }>;
    },
  });

  // This month's approved weekoffs — filter client-side for today
  const { data: weekoffNames = [] } = useQuery({
    queryKey: ["weekoffs-today-banner", today],
    enabled: !dismissed,
    queryFn: async () => {
      const { data: weekoffs, error } = await supabase()
        .from("monthly_weekoffs")
        .select("user_id, dates")
        .eq("month", monthKey(today))
        .eq("status", "approved");
      if (error) throw error;

      const todayWos = (weekoffs ?? []).filter((w: any) =>
        Array.isArray(w.dates) && w.dates.includes(today)
      );
      if (!todayWos.length) return [];

      const userIds = todayWos.map((w: any) => w.user_id);
      const { data: profiles } = await supabase()
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      return (profiles ?? []).map((p: any) => p.display_name as string);
    },
  });

  function dismiss() {
    localStorage.setItem(dismissedKey(today), "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  const leaveEntries = leaves.map((l) => ({ name: l.staff?.name ?? "Unknown", type: l.leave_type ?? "Leave" }));
  const weekoffEntries = weekoffNames.map((name) => ({ name, type: "Week Off" }));
  const all = [...leaveEntries, ...weekoffEntries];

  if (!all.length) return null;

  return (
    <div className="bg-warn/10 border-b border-warn/30 px-4 py-2 flex items-center gap-3 text-sm shrink-0">
      <span className="text-warn font-semibold shrink-0">Absent today:</span>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 flex-1 min-w-0">
        {all.map((e, i) => (
          <span key={i} className="text-ink">
            {e.name}
            <span className="text-ink-dim text-xs ml-1">({e.type})</span>
          </span>
        ))}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-ink-dim hover:text-ink text-base leading-none px-1"
        aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
