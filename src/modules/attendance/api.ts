"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type AttendanceEntry = {
  bio_user_id: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  card_no: number;
  active: boolean;
  present: boolean;
  punches: string[];
  first_in: string | null;
  last_out: string | null;
  hours_worked: number | null;
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
};

export function useAttendanceByDate(date: string, activeOnly = true) {
  return useQuery<AttendanceEntry[]>({
    queryKey: ["attendance", date, activeOnly],
    enabled: !!date,
    queryFn: async () => {
      const client = supabase();

      let staffQ = client.from("staff").select("bio_user_id, name, designation, department, phone, card_no, active").order("name");
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

      // Group logs by user
      const byUser = new Map<string, string[]>();
      for (const log of logs) {
        if (!byUser.has(log.bio_user_id)) byUser.set(log.bio_user_id, []);
        byUser.get(log.bio_user_id)!.push(log.punch_time);
      }

      return staff.map((s) => {
        const punches = [...(byUser.get(s.bio_user_id) ?? [])].sort();
        const present = punches.length > 0;
        const hoursWorked =
          punches.length >= 2
            ? (new Date(punches[punches.length - 1]).getTime() - new Date(punches[0]).getTime()) / 3_600_000
            : null;
        return {
          bio_user_id: s.bio_user_id,
          name: s.name,
          designation: s.designation ?? "",
          department: s.department ?? "",
          phone: s.phone ?? "",
          card_no: s.card_no ?? 0,
          active: s.active,
          present,
          punches,
          first_in: punches[0] ?? null,
          last_out: punches.length >= 2 ? punches[punches.length - 1] : null,
          hours_worked: hoursWorked,
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
