"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type AttendanceEntry = {
  bio_user_id: string;
  name: string;
  department: string;
  punches: string[];
  first_in: string;
  last_out: string;
  hours_worked: number | null;
};

export function useAttendanceByDate(date: string) {
  return useQuery<AttendanceEntry[]>({
    queryKey: ["attendance", date],
    enabled: !!date,
    queryFn: async () => {
      const client = supabase();
      const [logsRes, staffRes] = await Promise.all([
        client
          .from("attendance_logs")
          .select("bio_user_id, punch_time")
          .gte("punch_time", `${date}T00:00:00+05:30`)
          .lte("punch_time", `${date}T23:59:59+05:30`)
          .order("punch_time"),
        client.from("staff").select("bio_user_id, name, department"),
      ]);
      if (logsRes.error) throw logsRes.error;

      const logs = logsRes.data ?? [];
      const staffMap = new Map<string, { name: string; department: string }>(
        (staffRes.data ?? []).map((s: any) => [s.bio_user_id, s])
      );

      const byUser = new Map<string, string[]>();
      for (const log of logs) {
        if (!byUser.has(log.bio_user_id)) byUser.set(log.bio_user_id, []);
        byUser.get(log.bio_user_id)!.push(log.punch_time);
      }

      return Array.from(byUser.entries()).map(([userId, punches]) => {
        const s = staffMap.get(userId);
        const sorted = [...punches].sort();
        const hoursWorked =
          sorted.length >= 2
            ? (new Date(sorted[sorted.length - 1]).getTime() - new Date(sorted[0]).getTime()) / 3_600_000
            : null;
        return {
          bio_user_id: userId,
          name: s?.name ?? `User ${userId}`,
          department: s?.department ?? "",
          punches: sorted,
          first_in: sorted[0],
          last_out: sorted[sorted.length - 1],
          hours_worked: hoursWorked,
        };
      });
    },
  });
}
