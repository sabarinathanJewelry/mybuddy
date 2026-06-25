"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// UTC+5:30 offset in ms
const IST_MS = 5.5 * 3600000;
function istMinutes(ts: string): number {
  const ist = new Date(new Date(ts).getTime() + IST_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}
function parseTimeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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
  shift: "boys" | "girls" | "helper";
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
  id: string;
  bio_user_id: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  card_no: number;
  active: boolean;
  join_date: string | null;
  shift: "boys" | "girls" | "helper";
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
  shift: "boys" | "girls" | "helper";
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

      const [logsRes, staffRes, permsRes, exceptionsRes] = await Promise.all([
        client
          .from("attendance_logs")
          .select("bio_user_id, punch_time, punch_status")
          .gte("punch_time", `${date}T00:00:00+05:30`)
          .lte("punch_time", `${date}T23:59:59+05:30`)
          .order("punch_time"),
        staffQ,
        client
          .from("permission_requests")
          .select("bio_user_id")
          .eq("status", "approved")
          .eq("permission_date", date),
        client
          .from("shop_exceptions")
          .select("shop_opens_at")
          .eq("exception_date", date)
          .maybeSingle(),
      ]);

      if (logsRes.error) throw logsRes.error;

      const logs = logsRes.data ?? [];
      const staff: StaffMember[] = (staffRes.data ?? []) as any;
      const approvedPerms = new Set((permsRes.data ?? []).map((p: any) => p.bio_user_id));
      // Shop exception: if shop opened late, extend the late threshold accordingly
      const shopExc = exceptionsRes.data as { shop_opens_at: string } | null;
      const lateThresholdMins = shopExc
        ? parseTimeToMins(shopExc.shop_opens_at) + 20
        : 9 * 60 + 50;

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

        // Late = first punch after threshold IST; approved permission overrides
        // Threshold defaults to 9:50 (9:30 + 20 min grace), overridden by shop_exceptions for this date
        const is_late = firstIn && !approvedPerms.has(s.bio_user_id) ? istMinutes(firstIn) > lateThresholdMins : false;

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
          shift: ((s.shift as string) ?? "boys") as "boys" | "girls" | "helper",
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

      // Fetch approved permissions for the month
      const permsRes = await client
        .from("permission_requests")
        .select("bio_user_id, permission_date")
        .eq("status", "approved")
        .gte("permission_date", `${month}-01`)
        .lte("permission_date", monthEnd);
      const approvedPermSet = new Set(
        (permsRes.data ?? []).map((p: any) => `${p.bio_user_id}:${p.permission_date}`)
      );

      // Fetch shop late-opening exceptions for the month
      const excRes = await client
        .from("shop_exceptions")
        .select("exception_date, shop_opens_at")
        .gte("exception_date", `${month}-01`)
        .lte("exception_date", monthEnd);
      const exceptionMap = new Map<string, number>(
        (excRes.data ?? []).map((e: any) => [e.exception_date, parseTimeToMins(e.shop_opens_at)])
      );

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
        const sh = (s.shift as string) ?? "boys";
        const shiftEndMin = sh === "girls" ? 20 * 60 + 30 : sh === "helper" ? 18 * 60 : 21 * 60 + 30;
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
          const hasPermission = approvedPermSet.has(`${s.bio_user_id}:${date}`);
          const shopOpenMins = exceptionMap.get(date) ?? (9 * 60 + 30);
          const threshold = shopOpenMins + 20;
          const is_late     = firstIn && !hasPermission ? firstInMins > threshold : false;
          const late_minutes = is_late ? firstInMins - shopOpenMins : 0;

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

// ── Permission requests ───────────────────────────────────────────────────────

export type PermissionRequest = {
  id: string;
  bio_user_id: string;
  permission_date: string;
  from_time: string | null;
  to_time: string | null;
  late_minutes: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  decided_at: string | null;
  notified: boolean;
  created_at: string;
  staff?: { name: string };
};

export function useMyPermissions() {
  return useQuery<PermissionRequest[]>({
    queryKey: ["permission_requests", "my"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("permission_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useAllPermissions() {
  return useQuery<PermissionRequest[]>({
    queryKey: ["permission_requests", "all"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("permission_requests")
        .select("*, staff(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useCreatePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: { bio_user_id: string; permission_date: string; from_time: string; to_time: string; late_minutes: number; reason: string }) => {
      const { error } = await supabase().from("permission_requests").insert(req);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permission_requests"] }),
  });
}

export function useDecidePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, admin_note }: { id: string; status: "approved" | "rejected"; admin_note?: string }) => {
      const { error } = await supabase()
        .from("permission_requests")
        .update({ status, admin_note: admin_note || null, decided_at: new Date().toISOString(), notified: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permission_requests"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["monthly-attendance"] });
    },
  });
}

// ── Kiosk sequence ────────────────────────────────────────────────────────────

export type KioskTap = { bio_user_id: string; action: "in" | "out" };

export function useLastSyncTime() {
  return useQuery<string | null>({
    queryKey: ["last-sync-time"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase()
        .from("app_settings")
        .select("value")
        .eq("key", "last_sync_at")
        .maybeSingle();
      return (data?.value as string) ?? null;
    },
  });
}

export function useKioskSequence() {
  return useQuery<KioskTap[]>({
    queryKey: ["kiosk-sequence"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("app_settings")
        .select("value")
        .eq("key", "kiosk_sequence")
        .single();
      if (error) return [];
      return (data?.value ?? []) as KioskTap[];
    },
  });
}

export function useSaveKioskSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sequence: KioskTap[]) => {
      const { error } = await supabase()
        .from("app_settings")
        .upsert({ key: "kiosk_sequence", value: sequence });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk-sequence"] }),
  });
}

export function useKioskSecret() {
  return useQuery<string | null>({
    queryKey: ["kiosk-secret"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("app_settings")
        .select("value")
        .eq("key", "kiosk_secret")
        .single();
      if (error) return null;
      return (data?.value as string) ?? null;
    },
  });
}

export function useSaveKioskSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (secret: string) => {
      const { error } = await supabase()
        .from("app_settings")
        .upsert({ key: "kiosk_secret", value: secret });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kiosk-secret"] }),
  });
}

export function useAdminKioskSequences() {
  return useQuery<{ id: string; display_name: string; role: string; kiosk_sequence: KioskTap[] | null }[]>({
    queryKey: ["admin-kiosk-sequences"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("profiles")
        .select("id, display_name, role, kiosk_sequence")
        .in("role", ["admin", "subadmin"])
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as { id: string; display_name: string; role: string; kiosk_sequence: KioskTap[] | null }[];
    },
  });
}

export function useSaveUserKioskSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, sequence }: { userId: string; sequence: KioskTap[] | null }) => {
      const { error } = await supabase()
        .from("profiles")
        .update({ kiosk_sequence: sequence })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-kiosk-sequences"] }),
  });
}

// ── Leave requests ────────────────────────────────────────────────────────────

export type LeaveRequest = {
  id: string;
  bio_user_id: string;
  leave_date: string;
  leave_type: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  staff?: { name: string; designation: string };
};

export function useLeavesByDate(date: string) {
  return useQuery<LeaveRequest[]>({
    queryKey: ["leaves-by-date", date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("leave_requests")
        .select("bio_user_id, leave_type, status, staff(name, designation)")
        .eq("leave_date", date)
        .in("status", ["approved", "pending"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useAllLeaveRequests() {
  return useQuery<LeaveRequest[]>({
    queryKey: ["leave-requests-all"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("leave_requests")
        .select("*, staff(name, designation)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useMyLeaveRequests(bioUserId: string | null) {
  return useQuery<LeaveRequest[]>({
    queryKey: ["leave-requests-mine", bioUserId],
    enabled: !!bioUserId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("leave_requests")
        .select("*")
        .eq("bio_user_id", bioUserId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function usePendingLeaveCount() {
  return useQuery<number>({
    queryKey: ["leave-pending-count"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase()
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  });
}

export function useMyStaffProfile() {
  return useQuery<StaffMember | null>({
    queryKey: ["my-staff-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return null;
      const { data } = await supabase()
        .from("staff")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return (data ?? null) as any;
    },
  });
}

// Returns count of working days (Mon–Sat) this month where the staff had no punch.
// Covers both applied leaves and unapplied absences.
export function useMyMonthlyLeaveCount(monthKey: string) {
  return useQuery<number>({
    queryKey: ["my-monthly-leave-count", monthKey],
    queryFn: async () => {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return 0;
      const { data: staffRow } = await supabase()
        .from("staff")
        .select("bio_user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!staffRow?.bio_user_id) return 0;

      const IST_MS = 5.5 * 3600000;
      const [year, mon] = monthKey.split("-").map(Number);
      const today = new Date(new Date().getTime() + IST_MS);
      const isCurrentMonth = today.getUTCFullYear() === year && today.getUTCMonth() + 1 === mon;
      const lastDay = isCurrentMonth ? today.getUTCDate() : new Date(year, mon, 0).getDate();

      // Build set of Mon–Sat dates elapsed so far this month
      const workingDates = new Set<string>();
      for (let d = 1; d <= lastDay; d++) {
        const dt = new Date(Date.UTC(year, mon - 1, d));
        const dow = dt.getUTCDay();
        if (dow !== 0) { // exclude Sundays
          workingDates.add(`${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        }
      }

      // Fetch all punch records for this staff this month
      const nextMon = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
      const { data: punches } = await supabase()
        .from("attendance_logs")
        .select("punch_time")
        .eq("bio_user_id", staffRow.bio_user_id)
        .gte("punch_time", `${monthKey}-01T00:00:00+05:30`)
        .lt("punch_time",  `${nextMon}-01T00:00:00+05:30`);

      // Build set of dates that have at least one punch
      const presentDates = new Set<string>();
      for (const row of punches ?? []) {
        const ist = new Date(new Date(row.punch_time).getTime() + IST_MS);
        const dateStr = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
        presentDates.add(dateStr);
      }

      // Absent = working days with no punch
      let absentCount = 0;
      for (const d of workingDates) {
        if (!presentDates.has(d)) absentCount++;
      }
      return absentCount;
    },
  });
}

export function useSubmitLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bio_user_id, leave_date, leave_type, reason, staff_name }: {
      bio_user_id: string;
      leave_date: string;
      leave_type: string;
      reason?: string;
      staff_name: string;
    }) => {
      const client = supabase();
      const { data: req, error } = await client
        .from("leave_requests")
        .insert({ bio_user_id, leave_date, leave_type, reason: reason || null })
        .select()
        .single();
      if (error) throw error;
      const typeLabel = leave_type === "half_day" ? "half-day" : leave_type;
      await client.from("app_notifications").insert({
        for_bio_user_id: null,
        title: "Leave Requested",
        body: `${staff_name} has requested ${typeLabel} leave on ${leave_date}.`,
        ref_type: "leave_request",
        ref_id: req.id,
      });
      return req;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests-mine"] });
      qc.invalidateQueries({ queryKey: ["leave-requests-all"] });
      qc.invalidateQueries({ queryKey: ["leave-pending-count"] });
      qc.invalidateQueries({ queryKey: ["leaves-by-date"] });
      qc.invalidateQueries({ queryKey: ["app-notifications"] });
    },
  });
}

export function useDecideLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, bio_user_id, leave_date, leave_type, status, admin_note }: {
      id: string;
      bio_user_id: string;
      leave_date: string;
      leave_type: string;
      status: "approved" | "rejected";
      admin_note?: string;
    }) => {
      const client = supabase();
      const { error } = await client
        .from("leave_requests")
        .update({ status, admin_note: admin_note || null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      const typeLabel = leave_type === "half_day" ? "half-day" : leave_type;
      await client.from("app_notifications").insert({
        for_bio_user_id: bio_user_id,
        title: `Leave ${status === "approved" ? "Approved" : "Rejected"}`,
        body: `Your ${typeLabel} leave request for ${leave_date} was ${status}${admin_note ? ` — ${admin_note}` : ""}.`,
        ref_type: "leave_request",
        ref_id: id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests-all"] });
      qc.invalidateQueries({ queryKey: ["leave-requests-mine"] });
      qc.invalidateQueries({ queryKey: ["leave-pending-count"] });
      qc.invalidateQueries({ queryKey: ["leaves-by-date"] });
      qc.invalidateQueries({ queryKey: ["app-notifications"] });
    },
  });
}

export function useDeleteLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("leave_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave-requests-all"] });
      qc.invalidateQueries({ queryKey: ["leave-requests-mine"] });
      qc.invalidateQueries({ queryKey: ["leave-pending-count"] });
      qc.invalidateQueries({ queryKey: ["leaves-by-date"] });
    },
  });
}

export function useApprovedPermsByMonth(month: string) {
  return useQuery({
    queryKey: ["perms-approved-month", month],
    enabled: !!month,
    queryFn: async () => {
      const [y, m] = month.split("-");
      const start = `${month}-01`;
      const end   = `${month}-${new Date(Number(y), Number(m), 0).getDate()}`;
      const { data, error } = await supabase()
        .from("permission_requests")
        .select("bio_user_id, permission_date, late_minutes")
        .gte("permission_date", start)
        .lte("permission_date", end)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []) as { bio_user_id: string; permission_date: string; late_minutes: number }[];
    },
  });
}

export function useApprovedPermsByDate(date: string) {
  return useQuery({
    queryKey: ["perms-approved-date", date],
    enabled: !!date,
    queryFn: async () => {
      const { data } = await supabase()
        .from("permission_requests")
        .select("bio_user_id, late_minutes")
        .eq("permission_date", date)
        .eq("status", "approved");
      return (data ?? []) as { bio_user_id: string; late_minutes: number }[];
    },
  });
}

export function useApprovedLeavesByMonth(month: string) {
  return useQuery({
    queryKey: ["leaves-approved-month", month],
    enabled: !!month,
    queryFn: async () => {
      const [y, m] = month.split("-");
      const start = `${month}-01`;
      const end   = `${month}-${new Date(Number(y), Number(m), 0).getDate()}`;
      const { data } = await supabase()
        .from("leave_requests")
        .select("bio_user_id, leave_date")
        .gte("leave_date", start)
        .lte("leave_date", end)
        .eq("status", "approved");
      return (data ?? []) as { bio_user_id: string; leave_date: string }[];
    },
  });
}

// ── App notifications ─────────────────────────────────────────────────────────

export type AppNotification = {
  id: string;
  for_bio_user_id: string | null;
  title: string;
  body: string;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
};

export function useAppNotifications(bioUserId: string | null) {
  return useQuery<AppNotification[]>({
    queryKey: ["app-notifications", bioUserId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return [];

      let q = client
        .from("app_notifications")
        .select("id, for_bio_user_id, title, body, ref_type, ref_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (bioUserId) {
        q = q.or(`for_bio_user_id.is.null,for_bio_user_id.eq.${bioUserId}`);
      } else {
        q = q.is("for_bio_user_id", null);
      }

      const { data: notifs, error } = await q;
      if (error) throw error;
      if (!notifs?.length) return [];

      const { data: reads } = await client
        .from("notification_reads")
        .select("notification_id")
        .eq("user_id", user.id)
        .in("notification_id", notifs.map((n: any) => n.id));

      const readIds = new Set((reads ?? []).map((r: any) => r.notification_id));
      return (notifs ?? []).filter((n: any) => !readIds.has(n.id)) as AppNotification[];
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ notificationId, bioUserId }: { notificationId: string; bioUserId: string | null }) => {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      await client.from("notification_reads").upsert({ notification_id: notificationId, user_id: user.id });
    },
    onSuccess: (_, { bioUserId }) => {
      qc.invalidateQueries({ queryKey: ["app-notifications", bioUserId] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ notificationIds, bioUserId }: { notificationIds: string[]; bioUserId: string | null }) => {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();
      if (!user || !notificationIds.length) return;
      await client.from("notification_reads").upsert(
        notificationIds.map(id => ({ notification_id: id, user_id: user.id }))
      );
    },
    onSuccess: (_, { bioUserId }) => {
      qc.invalidateQueries({ queryKey: ["app-notifications", bioUserId] });
    },
  });
}

// ── Outside Duties ────────────────────────────────────────────────────────────

export type OutsideDuty = {
  id: string;
  bio_user_id: string;
  duty_date: string;
  description: string;
  expected_arrival: string | null;
  status: "pending" | "approved" | "rejected";
  initiated_by: "admin" | "staff";
  admin_note: string | null;
  created_at: string;
  staff?: { name: string; designation: string };
};

export function useOutsideDutiesByDate(date: string) {
  return useQuery<OutsideDuty[]>({
    queryKey: ["outside-duties-date", date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("outside_duties")
        .select("*")
        .eq("duty_date", date);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useOutsideDutiesByMonth(month: string) {
  return useQuery<{ bio_user_id: string; duty_date: string }[]>({
    queryKey: ["outside-duties-month", month],
    enabled: !!month,
    queryFn: async () => {
      const [y, m] = month.split("-");
      const start = `${month}-01`;
      const end   = `${month}-${new Date(Number(y), Number(m), 0).getDate()}`;
      const { data } = await supabase()
        .from("outside_duties")
        .select("bio_user_id, duty_date")
        .gte("duty_date", start)
        .lte("duty_date", end)
        .eq("status", "approved");
      return (data ?? []) as any[];
    },
  });
}

export function useAllOutsideDuties() {
  return useQuery<OutsideDuty[]>({
    queryKey: ["outside-duties-all"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("outside_duties")
        .select("*")
        .order("duty_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useMyOutsideDuties(bioUserId: string | null) {
  return useQuery<OutsideDuty[]>({
    queryKey: ["outside-duties-mine", bioUserId],
    enabled: !!bioUserId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("outside_duties")
        .select("*")
        .eq("bio_user_id", bioUserId!)
        .order("duty_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useCreateOutsideDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      bio_user_id: string;
      duty_date: string;
      description: string;
      expected_arrival?: string;
      initiated_by: "admin" | "staff";
      status?: "pending" | "approved";
    }) => {
      const { error } = await supabase().from("outside_duties").insert({
        bio_user_id:      payload.bio_user_id,
        duty_date:        payload.duty_date,
        description:      payload.description,
        expected_arrival: payload.expected_arrival || null,
        initiated_by:     payload.initiated_by,
        status:           payload.status ?? "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outside-duties-all"] });
      qc.invalidateQueries({ queryKey: ["outside-duties-date"] });
      qc.invalidateQueries({ queryKey: ["outside-duties-month"] });
      qc.invalidateQueries({ queryKey: ["outside-duties-mine"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["monthly-attendance"] });
    },
  });
}

export function useDecideOutsideDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, admin_note }: { id: string; status: "approved" | "rejected"; admin_note?: string }) => {
      const { error } = await supabase()
        .from("outside_duties")
        .update({ status, admin_note: admin_note || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outside-duties-all"] });
      qc.invalidateQueries({ queryKey: ["outside-duties-date"] });
      qc.invalidateQueries({ queryKey: ["outside-duties-month"] });
      qc.invalidateQueries({ queryKey: ["outside-duties-mine"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["monthly-attendance"] });
    },
  });
}

// ── Staff advances ────────────────────────────────────────────────────────────

export type StaffAdvance = {
  id: string;
  staff_id: string;
  advance_date: string;
  type: "given" | "repaid";
  amount: number;
  notes: string | null;
  created_at: string;
};

export function useStaffAdvances() {
  return useQuery<(StaffAdvance & { staff: { bio_user_id: string; name: string } })[]>({
    queryKey: ["staff-advances"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("staff_advances")
        .select("*, staff(bio_user_id, name)")
        .order("advance_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

export function useSaveStaffAdvance() {
  const qc = useQueryClient();
  return useMutation({
    // bio_user_id is passed as staff_id from the form; we resolve to uuid here
    mutationFn: async (payload: { staff_id: string; advance_date: string; type: "given" | "repaid"; amount: number; notes?: string }) => {
      const client = supabase();
      // Resolve bio_user_id → staff.id (uuid)
      const { data: staffRow, error: se } = await client.from("staff").select("id, name").eq("bio_user_id", payload.staff_id).single();
      if (se || !staffRow) throw new Error("Staff not found");
      const insert = { ...payload, staff_id: staffRow.id };
      const { data: row, error } = await client.from("staff_advances").insert(insert).select().single();
      if (error) throw error;
      const desc = payload.notes || (payload.type === "given" ? `Staff advance — ${staffRow.name}` : `Staff repayment — ${staffRow.name}`);
      const { error: le } = await client.from("cash_ledger").insert({
        tx_date: payload.advance_date,
        direction: payload.type === "given" ? "out" : "in",
        amount: payload.amount,
        description: desc,
        ref_type: "staff_advance",
        ref_id: row.id,
      });
      if (le) console.warn(le);
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-advances"] }),
  });
}

export function useDeleteStaffAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();
      await client.from("cash_ledger").delete().eq("ref_type", "staff_advance").eq("ref_id", id);
      const { error } = await client.from("staff_advances").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-advances"] }),
  });
}

// ── Staff KYC ─────────────────────────────────────────────────────────────────

export type StaffKyc = {
  id: string;
  bio_user_id: string;
  aadhaar_last4: string;
  selfie_data: string | null;
  digilocker_confirmed: boolean;
  documents_given: string[];
  status: "pending" | "verified" | "rejected";
  admin_note: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  staff?: { name: string };
};

export const KYC_DOCS: { key: string; label: string }[] = [
  { key: "aadhaar_original",  label: "Original Aadhaar Card" },
  { key: "aadhaar_copy",      label: "Aadhaar Xerox / Photocopy" },
  { key: "pan_card",          label: "PAN Card" },
  { key: "pan_copy",          label: "PAN Xerox" },
  { key: "passport_photo",    label: "Passport Size Photo" },
  { key: "address_proof",     label: "Address Proof (Passbook / Utility Bill)" },
  { key: "bank_details",      label: "Bank Passbook / Cancelled Cheque" },
  { key: "exp_certificate",   label: "Experience Certificate" },
];

export function useMyKyc(bioUserId: string | null) {
  return useQuery<StaffKyc | null>({
    queryKey: ["staff_kyc", "my", bioUserId],
    enabled: !!bioUserId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("staff_kyc")
        .select("*")
        .eq("bio_user_id", bioUserId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useUpsertKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      bio_user_id: string;
      aadhaar_last4: string;
      selfie_data: string | null;
      digilocker_confirmed: boolean;
      documents_given: string[];
    }) => {
      const { error } = await supabase()
        .from("staff_kyc")
        .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "bio_user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_kyc"] }),
  });
}

export function useAllKyc() {
  return useQuery<StaffKyc[]>({
    queryKey: ["staff_kyc", "all"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("staff_kyc")
        .select("*, staff(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ── Shop Exceptions ──────────────────────────────────────────────────────────

export type ShopException = {
  id: string;
  exception_date: string;
  shop_opens_at: string;
  reason: string | null;
  created_at: string;
};

export function useShopExceptionForDate(date: string) {
  return useQuery<ShopException | null>({
    queryKey: ["shop_exception", date],
    queryFn: async () => {
      const { data } = await supabase()
        .from("shop_exceptions")
        .select("*")
        .eq("exception_date", date)
        .maybeSingle();
      return (data as ShopException | null) ?? null;
    },
    enabled: !!date,
  });
}

export function useShopExceptions() {
  return useQuery<ShopException[]>({
    queryKey: ["shop_exceptions"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("shop_exceptions")
        .select("*")
        .order("exception_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShopException[];
    },
  });
}

export function useUpsertShopException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { exception_date: string; shop_opens_at: string; reason?: string }) => {
      const { error } = await supabase()
        .from("shop_exceptions")
        .upsert({ ...payload, reason: payload.reason || null }, { onConflict: "exception_date" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["shop_exception", v.exception_date] });
      qc.invalidateQueries({ queryKey: ["shop_exceptions"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["monthly-attendance"] });
    },
  });
}

export function useDeleteShopException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("shop_exceptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_exception"] });
      qc.invalidateQueries({ queryKey: ["shop_exceptions"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["monthly-attendance"] });
    },
  });
}

// ── Special Requests (dress, makeup, etc.) ───────────────────────────────────

export type SpecialRequest = {
  id: string;
  bio_user_id: string;
  request_date: string;
  category: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  decided_at: string | null;
  created_at: string;
  staff?: { name: string };
};

export const SPECIAL_REQUEST_CATEGORIES = [
  "Colored Dress",
  "Makeup",
  "Hair Style",
  "Other",
] as const;

export function useMySpecialRequests() {
  return useQuery<SpecialRequest[]>({
    queryKey: ["special_requests", "my"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("special_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SpecialRequest[];
    },
  });
}

export function useAllSpecialRequests() {
  return useQuery<SpecialRequest[]>({
    queryKey: ["special_requests", "all"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("special_requests")
        .select("*, staff(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SpecialRequest[];
    },
  });
}

export function useCreateSpecialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: { bio_user_id: string; request_date: string; category: string; reason?: string }) => {
      const { error } = await supabase().from("special_requests").insert({
        ...req,
        reason: req.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special_requests"] }),
  });
}

export function useDecideSpecialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, admin_note }: { id: string; status: "approved" | "rejected"; admin_note?: string }) => {
      const { error } = await supabase()
        .from("special_requests")
        .update({ status, admin_note: admin_note || null, decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special_requests"] }),
  });
}

export function useDeleteSpecialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("special_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["special_requests"] }),
  });
}

export function useVerifyKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, admin_note }: { id: string; status: "verified" | "rejected"; admin_note?: string }) => {
      const { error } = await supabase()
        .from("staff_kyc")
        .update({
          status,
          admin_note: admin_note || null,
          verified_at: status === "verified" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_kyc"] }),
  });
}

// ── Staff Tasks ───────────────────────────────────────────────────────────────

export type StaffTask = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  created_by: string;
  due_date: string;
  status: "pending" | "completed";
  completed_at: string | null;
  completed_note: string | null;
  created_at: string;
  staff?: { name: string } | null;
};

export function useStaffTasks(isAdmin: boolean, myBioUserId: string | null) {
  return useQuery<StaffTask[]>({
    queryKey: ["staff_tasks", isAdmin ? "admin" : myBioUserId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const client = supabase();
      let q = client
        .from("staff_tasks")
        .select("*, staff:assigned_to(name)")
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });
      if (!isAdmin && myBioUserId) {
        q = q.eq("assigned_to", myBioUserId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StaffTask[];
    },
    enabled: isAdmin || !!myBioUserId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      description?: string;
      assigned_to: string;
      created_by: string;
      due_date: string;
    }) => {
      const client = supabase();
      const { error } = await client.from("staff_tasks").insert({
        title: payload.title,
        description: payload.description || null,
        assigned_to: payload.assigned_to,
        created_by: payload.created_by,
        due_date: payload.due_date,
      });
      if (error) throw error;
      await client.from("app_notifications").insert({
        for_bio_user_id: payload.assigned_to,
        title: "New Task Assigned",
        body: `You have a new task: "${payload.title}" — due ${payload.due_date}.`,
        ref_type: "staff_task",
        ref_id: null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_tasks"] }),
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      staff_name: string;
      task_title: string;
      completed_note?: string;
    }) => {
      const client = supabase();
      const { error } = await client
        .from("staff_tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_note: payload.completed_note || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);
      if (error) throw error;
      await client.from("app_notifications").insert({
        for_bio_user_id: null,
        title: "Task Completed",
        body: `${payload.staff_name} completed task: "${payload.task_title}".`,
        ref_type: "staff_task",
        ref_id: payload.id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("staff_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_tasks"] }),
  });
}

export function useReopenTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase()
        .from("staff_tasks")
        .update({ status: "pending", completed_at: null, completed_note: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff_tasks"] }),
  });
}

// Returns Set of bio_user_ids who have an approved weekoff on the given date (YYYY-MM-DD)
export function useWeekoffBioIdsByDate(date: string) {
  const monthKey = date.slice(0, 7);
  return useQuery<Set<string>>({
    queryKey: ["weekoff_bio_ids", date],
    queryFn: async () => {
      // Get approved weekoffs for this month that include this date
      const { data: weekoffs } = await supabase()
        .from("monthly_weekoffs")
        .select("user_id, dates")
        .eq("month", monthKey)
        .eq("status", "approved");
      const userIds = (weekoffs ?? [])
        .filter((w: any) => Array.isArray(w.dates) && w.dates.includes(date))
        .map((w: any) => w.user_id as string);
      if (!userIds.length) return new Set<string>();
      // Map profiles.id → staff.bio_user_id
      const { data: staffRows } = await supabase()
        .from("staff")
        .select("bio_user_id")
        .in("user_id", userIds);
      return new Set((staffRows ?? []).map((s: any) => s.bio_user_id as string));
    },
  });
}
