"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// UTC+5:30 offset in ms
const IST_MS = 5.5 * 3600000;
function istMinutes(ts: string): number {
  const ist = new Date(new Date(ts).getTime() + IST_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

// Collapse consecutive punches within thresholdMs (default 30s) — biometric double-reads.
// Returns deduplicated list and a flag so the UI can warn the user.
function deduplicatePunches(punches: string[], thresholdMs = 30_000): { deduped: string[]; double_punch_detected: boolean } {
  if (punches.length <= 1) return { deduped: [...punches], double_punch_detected: false };
  const sorted = [...punches].sort();
  const deduped: string[] = [sorted[0]];
  let detected = false;
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime() <= thresholdMs) {
      detected = true; // skip this duplicate
    } else {
      deduped.push(sorted[i]);
    }
  }
  return { deduped, double_punch_detected: detected };
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
  lunch_spare_minutes: number;    // lunch 60–70 min (in buffer zone)
  lunch_overrun_minutes: number;  // lunch > 70 min (over limit)
  effective_hours: number | null;
  short_interval: boolean;
  extra_punches: boolean;
  double_punch_detected: boolean;
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
  monthly_salary: number;
  allowed_leaves: number;
  user_id: string | null;
};

export type DailyAttendance = {
  date: string;             // YYYY-MM-DD IST
  first_in: string | null;
  last_out: string | null;
  is_late: boolean;
  late_minutes: number;     // minutes from 9:30 AM (if late)
  ot_minutes: number;       // minutes beyond shift end
  effective_hours: number | null;
  punch_count: number;
  lunch_minutes: number | null;   // null = only 2 punches (no lunch tracked)
  double_punch_detected: boolean;
};

export type MonthlyEmployeeSummary = {
  bio_user_id: string;
  name: string;
  designation: string;
  shift: "boys" | "girls";
  monthly_salary: number;
  allowed_leaves: number;
  total_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  total_late_minutes: number;
  total_ot_minutes: number;
  excess_leave_days: number;
  per_day_salary: number;
  leave_deduction: number;
  days_no_lunch: number;     // present but no lunch tracked (2 punches only)
  days_lunch_spare: number;  // lunch 60–70 min
  days_lunch_over: number;   // lunch > 70 min
  days_double_punch: number; // days where a double-read was detected and collapsed
  daily: DailyAttendance[];
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
        const rawPunches = [...(byUser.get(s.bio_user_id) ?? [])].sort();
        const { deduped: punches, double_punch_detected } = deduplicatePunches(rawPunches);
        const present = punches.length > 0;
        const firstIn = punches[0] ?? null;
        // last punch is OUT only if it falls on an odd index (even = in, odd = out)
        const lastOut = punches.length >= 2 && (punches.length - 1) % 2 === 1 ? punches[punches.length - 1] : null;
        const hoursWorked =
          lastOut && firstIn
            ? (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3_600_000
            : null;

        // Late = first punch after 9:50 AM IST (9:30 + 20 min grace)
        const is_late = firstIn ? istMinutes(firstIn) > 9 * 60 + 50 : false;

        // Lunch = time between second punch and second-to-last punch (middle window)
        // Spare: 60–70 min (buffer zone), Over: > 70 min (red flag)
        let lunch_minutes: number | null = null;
        let lunch_spare_minutes  = 0;
        let lunch_overrun_minutes = 0;
        if (punches.length >= 4) {
          const ms =
            new Date(punches[punches.length - 2]).getTime() - new Date(punches[1]).getTime();
          lunch_minutes = ms / 60000;
          if (lunch_minutes > 70) {
            lunch_overrun_minutes = lunch_minutes - 70;
          } else if (lunch_minutes >= 60) {
            lunch_spare_minutes = lunch_minutes - 60;
          }
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

        // Extra punches = more than expected (2 = standard, 4 = with lunch)
        const extra_punches = punches.length > 4;

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
          lunch_spare_minutes,
          lunch_overrun_minutes,
          effective_hours,
          short_interval,
          extra_punches,
          double_punch_detected,
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

export function useMonthlyAttendanceSummary(month: string) {
  return useQuery<MonthlyEmployeeSummary[]>({
    queryKey: ["monthly-attendance", month],
    enabled: !!month,
    refetchOnMount: "always",
    queryFn: async () => {
      const [yearStr, monStr] = month.split("-");
      const year = Number(yearStr);
      const mon  = Number(monStr);

      const daysInMonth = new Date(year, mon, 0).getDate();
      const monthEnd    = `${month}-${String(daysInMonth).padStart(2, "0")}`;
      const today       = new Date().toISOString().slice(0, 10);
      const lastDay     = month < today.slice(0, 7) ? monthEnd : today;
      const totalDays   =
        Math.round((new Date(lastDay).getTime() - new Date(`${month}-01`).getTime()) / 86400000) + 1;

      const nextMon = mon === 12
        ? `${year + 1}-01`
        : `${year}-${String(mon + 1).padStart(2, "0")}`;

      const client = supabase();

      const staffRes = await client
        .from("staff")
        .select("bio_user_id, name, designation, active, shift, monthly_salary, allowed_leaves")
        .eq("active", true)
        .order("name");
      if (staffRes.error) throw staffRes.error;
      const staff = (staffRes.data ?? []) as any[];

      const activeIds = staff.map((s) => s.bio_user_id);

      // Filter by active staff IDs and paginate past Supabase's 1000-row cap
      const logs: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const res = await client
          .from("attendance_logs")
          .select("bio_user_id, punch_time")
          .in("bio_user_id", activeIds)
          .gte("punch_time", `${month}-01T00:00:00+05:30`)
          .lt("punch_time", `${nextMon}-01T00:00:00+05:30`)
          .order("punch_time")
          .range(from, from + PAGE - 1);
        if (res.error) throw res.error;
        logs.push(...(res.data ?? []));
        if ((res.data ?? []).length < PAGE) break;
        from += PAGE;
      }

      // Group logs by employee and IST calendar date
      const byUserByDate = new Map<string, Map<string, string[]>>();
      for (const log of logs) {
        const uid     = log.bio_user_id;
        const istDate = new Date(new Date(log.punch_time).getTime() + IST_MS)
          .toISOString()
          .slice(0, 10);
        if (!byUserByDate.has(uid)) byUserByDate.set(uid, new Map());
        const m = byUserByDate.get(uid)!;
        if (!m.has(istDate)) m.set(istDate, []);
        m.get(istDate)!.push(log.punch_time);
      }

      // Enumerate every calendar date in the range (UTC dates = IST dates for full months)
      const allDates: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(Date.UTC(year, mon - 1, 1 + i));
        allDates.push(
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
        );
      }

      return staff.map((s) => {
        const shiftEndMin =
          ((s.shift as string) ?? "boys") === "girls" ? 20 * 60 + 30 : 21 * 60 + 30;
        const byDate = byUserByDate.get(s.bio_user_id) ?? new Map<string, string[]>();

        // Build per-day detail
        const daily: DailyAttendance[] = allDates.map((date) => {
          const rawDayPunches = [...(byDate.get(date) ?? [])].sort();
          const { deduped: dayPunches, double_punch_detected } = deduplicatePunches(rawDayPunches);
          const firstIn  = dayPunches[0] ?? null;
          const lastOut  = dayPunches.length >= 2 && (dayPunches.length - 1) % 2 === 1 ? dayPunches[dayPunches.length - 1] : null;
          const hw = lastOut && firstIn
            ? (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3_600_000
            : null;

          const firstInMins = firstIn ? istMinutes(firstIn) : 0;
          const is_late     = firstIn ? firstInMins > 9 * 60 + 50 : false;
          const late_minutes = is_late ? firstInMins - (9 * 60 + 30) : 0;

          const lastOutMins = lastOut ? istMinutes(lastOut) : 0;
          const ot_minutes  = lastOut ? Math.max(0, lastOutMins - shiftEndMin) : 0;

          // Lunch from middle punches (null if only 2 punches)
          let lunch_minutes: number | null = null;
          if (dayPunches.length >= 4) {
            const lunchMs = new Date(dayPunches[dayPunches.length - 2]).getTime() - new Date(dayPunches[1]).getTime();
            lunch_minutes = lunchMs / 60000;
          }

          let effective_hours: number | null = null;
          if (hw !== null) {
            effective_hours = lunch_minutes !== null
              ? hw - lunch_minutes / 60
              : Math.max(0, hw - 1);
          }

          return { date, first_in: firstIn, last_out: lastOut, is_late, late_minutes, ot_minutes, effective_hours, punch_count: dayPunches.length, lunch_minutes, double_punch_detected };
        });

        // Aggregate totals from daily
        let present_days = 0, late_days = 0, total_late_minutes = 0, total_ot_minutes = 0;
        let days_no_lunch = 0, days_lunch_spare = 0, days_lunch_over = 0, days_double_punch = 0;
        for (const d of daily) {
          if (!d.first_in) continue;
          present_days++;
          if (d.is_late) { late_days++; total_late_minutes += d.late_minutes; }
          total_ot_minutes += d.ot_minutes;
          if (d.double_punch_detected) days_double_punch++;
          if (d.lunch_minutes === null)  days_no_lunch++;
          else if (d.lunch_minutes > 70) days_lunch_over++;
          else if (d.lunch_minutes >= 60) days_lunch_spare++;
        }

        const absent_days       = Math.max(0, totalDays - present_days);
        const allowed_leaves    = (s.allowed_leaves as number) ?? 1;
        const excess_leave_days = Math.max(0, absent_days - allowed_leaves);
        const per_day_salary    = totalDays > 0 ? ((s.monthly_salary as number) ?? 0) / totalDays : 0;
        const leave_deduction   = excess_leave_days * per_day_salary;

        return {
          bio_user_id:       s.bio_user_id as string,
          name:              s.name as string,
          designation:       (s.designation as string) ?? "",
          shift:             ((s.shift as string) ?? "boys") as "boys" | "girls",
          monthly_salary:    (s.monthly_salary as number) ?? 0,
          allowed_leaves,
          total_days:        totalDays,
          present_days,
          absent_days,
          late_days,
          total_late_minutes,
          total_ot_minutes,
          excess_leave_days,
          per_day_salary,
          leave_deduction,
          days_no_lunch,
          days_lunch_spare,
          days_lunch_over,
          days_double_punch,
          daily,
        };
      });
    },
  });
}
