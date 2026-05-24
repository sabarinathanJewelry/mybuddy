"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// UTC+5:30 offset in ms
const IST_MS = 5.5 * 3600000;
function istMinutes(ts: string): number {
  const ist = new Date(new Date(ts).getTime() + IST_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export type AttendanceEntry = {
  bio_user_id: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  card_no: number;
  active: boolean;
  shift: "boys" | "girls";
  present: boolean;
  punches: string[];
  first_in: string | null;
  last_out: string | null;
  hours_worked: number | null;
  is_late: boolean;
  lunch_minutes: number | null;
  lunch_overrun_minutes: number;
  effective_hours: number | null;
  short_interval: boolean;
  extra_punches: boolean;
};

export type StaffMember = {
  bio_user_id: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  card_no: number;
  active: boolean;
  join_date: string | null;
  shift: "boys" | "girls";
};

export function useAttendanceByDate(date: string, activeOnly = true) {
  return useQuery<AttendanceEntry[]>({
    queryKey: ["attendance", date, activeOnly],
    enabled: !!date,
    queryFn: async () => {
      const client = supabase();

      let staffQ = client
        .from("staff")
        .select("bio_user_id, name, designation, department, phone, card_no, active, shift")
        .order("name");
      if (activeOnly) staffQ = staffQ.eq("active", true);

      const [logsRes, staffRes] = await Promise.all([
        client
          .from("attendance_logs")
          .select("bio_user_id, punch_time, punch_status")
          .gte("punch_time", `${date}T00:00:00+05:30`)
          .lte("punch_time", `${date}T23:59:59+05:30`)
          .order("punch_time"),
        staffQ,
      ]);

      if (logsRes.error) throw logsRes.error;

      const logs = logsRes.data ?? [];
      const staff: StaffMember[] = (staffRes.data ?? []) as any;

      const byUser = new Map<string, string[]>();
      for (const log of logs) {
        if (!byUser.has(log.bio_user_id)) byUser.set(log.bio_user_id, []);
        byUser.get(log.bio_user_id)!.push(log.punch_time);
      }

      return staff.map((s) => {
        const punches = [...(byUser.get(s.bio_user_id) ?? [])].sort();
        const present = punches.length > 0;
        const firstIn = punches[0] ?? null;
        const lastOut = punches.length >= 2 ? punches[punches.length - 1] : null;
        const hoursWorked =
          lastOut && firstIn
            ? (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3_600_000
            : null;

        // Late = first punch after 9:50 AM IST (9:30 + 20 min grace)
        const is_late = firstIn ? istMinutes(firstIn) > 9 * 60 + 50 : false;

        // Lunch = time between second punch and second-to-last punch (middle window)
        let lunch_minutes: number | null = null;
        let lunch_overrun_minutes = 0;
        if (punches.length >= 4) {
          const ms =
            new Date(punches[punches.length - 2]).getTime() - new Date(punches[1]).getTime();
          lunch_minutes = ms / 60000;
          lunch_overrun_minutes = Math.max(0, lunch_minutes - 60);
        }

        // Effective hours = total hours minus lunch (or minus standard 1h if no lunch punches)
        let effective_hours: number | null = null;
        if (hoursWorked !== null) {
          effective_hours =
            lunch_minutes !== null
              ? hoursWorked - lunch_minutes / 60
              : Math.max(0, hoursWorked - 1);
        }

        // Short interval = came in and out but total < 2 hours (accidental double punch or early leave)
        const short_interval = present && lastOut !== null && hoursWorked !== null && hoursWorked < 2;

        // Extra punches = more than 2 punches in a day (policy: only 2)
        const extra_punches = punches.length > 2;

        return {
          bio_user_id: s.bio_user_id,
          name: s.name,
          designation: s.designation ?? "",
          department: s.department ?? "",
          phone: s.phone ?? "",
          card_no: s.card_no ?? 0,
          active: s.active,
          shift: ((s.shift as string) ?? "boys") as "boys" | "girls",
          present,
          punches,
          first_in: firstIn,
          last_out: lastOut,
          hours_worked: hoursWorked,
          is_late,
          lunch_minutes,
          lunch_overrun_minutes,
          effective_hours,
          short_interval,
          extra_punches,
        };
      });
    },
  });
}

export function useStaff() {
  return useQuery<StaffMember[]>({
    queryKey: ["staff"],
    queryFn: async () => {
      const { data, error } = await supabase().from("staff").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: Partial<StaffMember> & { bio_user_id: string }) => {
      const { bio_user_id, ...rest } = s;
      const { error } = await supabase().from("staff").update(rest).eq("bio_user_id", bio_user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bio_user_id: string) => {
      const { error } = await supabase().from("staff").delete().eq("bio_user_id", bio_user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}
