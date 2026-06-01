"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  useMyPermissions, useCreatePermission,
  useMyLeaveRequests, useSubmitLeaveRequest,
  useLastSyncTime,
  type PermissionRequest, type LeaveRequest,
} from "@/modules/attendance/api";

// ── helpers ──────────────────────────────────────────────────────────────────
const IST_MS = 5.5 * 3600000;

function istMinutes(ts: string) {
  const ist = new Date(new Date(ts).getTime() + IST_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function deduplicatePunches(punches: string[], thresholdMs = 30_000) {
  if (punches.length <= 1) return { deduped: [...punches], double_punch: false };
  const sorted = [...punches].sort();
  const deduped: string[] = [sorted[0]];
  let double_punch = false;
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime() <= thresholdMs) {
      double_punch = true;
    } else {
      deduped.push(sorted[i]);
    }
  }
  return { deduped, double_punch };
}

function formatTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatMins(m: number) {
  if (m <= 0) return "—";
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}
function formatHours(h: number | null) {
  if (h === null) return "—";
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}
function dayLabel(dateStr: string) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${String(d).padStart(2, "0")} ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]}`;
}
// ── types ─────────────────────────────────────────────────────────────────────
type DayRow = {
  date: string;
  status: "present" | "late" | "leave";
  first_in: string | null;
  last_out: string | null;
  effective_hours: number | null;
  late_minutes: number;
  ot_minutes: number;
  double_punch: boolean;
  punches: string[];
  lunch_minutes: number | null;
};

type StaffInfo = { bio_user_id: string; name: string; shift: string };

type PageTab = "today" | "monthly" | "requests";

// ── page ─────────────────────────────────────────────────────────────────────
export default function MyAttendancePage() {
  const todayMonth = currentMonth();
  const todayStr   = new Date().toLocaleDateString("en-CA");

  const [tab, setTab]           = useState<PageTab>("today");
  const [month, setMonth]       = useState(todayMonth);
  const [staff, setStaff]       = useState<StaffInfo | null>(null);
  const [rows, setRows]         = useState<DayRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const { data: lastSyncIso }   = useLastSyncTime();

  // Permission requests
  const { data: permissions = [], refetch: refetchPerms } = useMyPermissions();
  const createPerm = useCreatePermission();
  const [showPermForm, setShowPermForm] = useState(false);
  const [permForm, setPermForm] = useState({ permission_date: todayStr, late_minutes: 30, reason: "" });
  const [permError, setPermError] = useState<string | null>(null);

  const thisMonth      = todayStr.slice(0, 7);
  const usedThisMonth  = permissions.filter((p: PermissionRequest) =>
    p.permission_date.startsWith(thisMonth) && (p.status === "pending" || p.status === "approved")
  ).length;
  const canRequest = usedThisMonth < 2;

  // Leave requests
  const { data: myLeaves = [], refetch: refetchLeaves } = useMyLeaveRequests(staff?.bio_user_id ?? null);
  const submitLeave = useSubmitLeaveRequest();
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_date: todayStr, leave_type: "casual", reason: "" });
  const [leaveError, setLeaveError] = useState<string | null>(null);

  async function handleLeaveSubmit() {
    setLeaveError(null);
    if (!staff) return;
    try {
      await submitLeave.mutateAsync({
        bio_user_id: staff.bio_user_id,
        leave_date: leaveForm.leave_date,
        leave_type: leaveForm.leave_type,
        reason: leaveForm.reason || undefined,
        staff_name: staff.name,
      });
      setShowLeaveForm(false);
      setLeaveForm({ leave_date: todayStr, leave_type: "casual", reason: "" });
      refetchLeaves();
    } catch (e: any) {
      setLeaveError(e?.message ?? "Failed to submit. Please try again.");
    }
  }

  async function submitPermission() {
    setPermError(null);
    if (!staff) return;
    if (!canRequest) { setPermError("You have already used 2 permissions this month."); return; }
    if (permForm.late_minutes < 1 || permForm.late_minutes > 120) { setPermError("Late minutes must be between 1 and 120."); return; }
    try {
      await createPerm.mutateAsync({ ...permForm, bio_user_id: staff.bio_user_id });
      setShowPermForm(false);
      setPermForm({ permission_date: todayStr, late_minutes: 30, reason: "" });
      refetchPerms();
    } catch {
      setPermError("Failed to submit. Please try again.");
    }
  }

  // Fetch staff info once on mount
  useEffect(() => {
    supabase()
      .from("staff")
      .select("bio_user_id, name, shift")
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError("Could not load your staff record.");
        else setStaff(data as StaffInfo);
      });
  }, []);

  // Fetch attendance whenever month or staff changes
  useEffect(() => {
    if (!staff) return;
    setLoading(true);

    const [yearStr, monStr] = month.split("-");
    const year = Number(yearStr), mon = Number(monStr);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const monthEnd    = `${month}-${String(daysInMonth).padStart(2, "0")}`;
    const todayISO    = new Date().toISOString().slice(0, 10);
    const lastDay     = month < todayISO.slice(0, 7) ? monthEnd : todayISO;
    const totalDays   = Math.round((new Date(lastDay).getTime() - new Date(`${month}-01`).getTime()) / 86400000) + 1;
    const nextMon     = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
    const shiftEndMin = staff.shift === "girls" ? 20 * 60 + 30 : 21 * 60 + 30;

    supabase()
      .from("attendance_logs")
      .select("punch_time")
      .eq("bio_user_id", staff.bio_user_id)
      .gte("punch_time", `${month}-01T00:00:00+05:30`)
      .lt("punch_time", `${nextMon}-01T00:00:00+05:30`)
      .order("punch_time")
      .then(({ data, error: logsErr }) => {
        if (logsErr) { setError(logsErr.message); setLoading(false); return; }

        const byDate = new Map<string, string[]>();
        for (const log of data ?? []) {
          const istDate = new Date(new Date(log.punch_time).getTime() + IST_MS).toISOString().slice(0, 10);
          if (!byDate.has(istDate)) byDate.set(istDate, []);
          byDate.get(istDate)!.push(log.punch_time);
        }

        const allRows: DayRow[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(Date.UTC(year, mon - 1, 1 + i));
          const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          const raw = [...(byDate.get(date) ?? [])].sort();
          const { deduped, double_punch } = deduplicatePunches(raw);

          const firstIn = deduped[0] ?? null;
          const lastOut = deduped.length >= 2 && (deduped.length - 1) % 2 === 1
            ? deduped[deduped.length - 1] : null;
          const hw = firstIn && lastOut
            ? (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3_600_000 : null;

          const firstInMins  = firstIn ? istMinutes(firstIn) : 0;
          const is_late      = firstIn ? firstInMins > 9 * 60 + 50 : false;
          const late_minutes = is_late ? firstInMins - (9 * 60 + 30) : 0;
          const lastOutMins  = lastOut ? istMinutes(lastOut) : 0;
          const ot_minutes   = lastOut ? Math.max(0, lastOutMins - shiftEndMin) : 0;

          let lunch_minutes: number | null = null;
          if (deduped.length >= 4) {
            lunch_minutes = Math.round((new Date(deduped[deduped.length - 2]).getTime() - new Date(deduped[1]).getTime()) / 60000);
          }
          let effective_hours: number | null = null;
          if (hw !== null) {
            effective_hours = lunch_minutes !== null ? hw - lunch_minutes / 60 : Math.max(0, hw - 1);
          }

          allRows.push({
            date,
            status: !firstIn ? "leave" : is_late ? "late" : "present",
            first_in: firstIn,
            last_out: lastOut,
            effective_hours,
            late_minutes,
            ot_minutes,
            double_punch,
            punches: deduped,
            lunch_minutes,
          });
        }

        setRows(allRows);
        setLoading(false);
      });
  }, [staff, month]);

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const next = m + dir;
    const newM = next < 1 ? `${y - 1}-12` : next > 12 ? `${y + 1}-01` : `${y}-${String(next).padStart(2, "0")}`;
    if (newM <= todayMonth) setMonth(newM);
  }

  async function handleLogout() {
    await supabase().auth.signOut();
  }

  const presentDays   = rows.filter(r => r.status !== "leave").length;
  const absentDays    = rows.filter(r => r.status === "leave").length;
  const totalOtMins   = rows.reduce((s, r) => s + r.ot_minutes, 0);
  const totalLateMins = rows.reduce((s, r) => s + r.late_minutes, 0);

  // Today's row (only meaningful when viewing current month)
  const todayRow = month === todayMonth ? rows.find(r => r.date === todayStr) ?? null : null;

  const inpCls = "border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink">My Attendance</h1>
          {staff && (
            <p className="text-sm text-ink-dim">
              {staff.name}
              <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                staff.shift === "girls" ? "bg-info/10 text-info" : staff.shift === "helper" ? "bg-ok/10 text-ok" : "bg-gold/10 text-gold"
              }`}>
                {staff.shift === "girls" ? "Girls shift" : staff.shift === "helper" ? "Helper shift" : "Boys shift"}
              </span>
            </p>
          )}
        </div>
        <Link href="/my-repairs"
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-gold hover:border-gold transition-colors">
          Repairs
        </Link>
        <button onClick={handleLogout}
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-err hover:border-err transition-colors">
          Logout
        </button>
      </div>

      {error && <div className="bg-err/10 text-err text-sm px-4 py-3 rounded-xl">{error}</div>}

      {/* Last sync */}
      {lastSyncIso && (
        <p className="text-xs text-ink-dim text-center -mt-1">
          Last updated: <strong>{new Date(lastSyncIso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</strong>
        </p>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {([
          { key: "today",    label: "Today" },
          { key: "monthly",  label: "Monthly" },
          { key: "requests", label: "Requests" },
        ] as { key: PageTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TODAY TAB ─────────────────────────────────────────────────────────── */}
      {tab === "today" && (
        <div className="space-y-4">
          {/* Today's activity card */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink">
                Today — {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              {todayRow && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  todayRow.status === "leave"   ? "bg-err/10 text-err" :
                  todayRow.status === "late"    ? "bg-warn/10 text-warn" :
                                                  "bg-ok/10 text-ok"
                }`}>
                  {todayRow.status === "leave" ? "Absent" : todayRow.status === "late" ? "Late" : "Present"}
                </span>
              )}
              {!todayRow && !loading && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-err/10 text-err">Absent</span>
              )}
            </div>

            {loading ? (
              <p className="text-xs text-ink-dim py-4 text-center">Loading…</p>
            ) : todayRow && todayRow.punches.length > 0 ? (() => {
              // 3 punches = IN + Lunch out + Lunch in (still working); 4 = complete day with lunch
              const lunchStart   = todayRow.punches.length >= 3 ? todayRow.punches[1] : null;
              const lunchEnd     = todayRow.punches.length >= 3 ? todayRow.punches[2] : null;
              const lunchMins    = lunchStart && lunchEnd
                ? Math.round((new Date(lunchEnd).getTime() - new Date(lunchStart).getTime()) / 60000)
                : null;
              const lunchStatus  = lunchMins === null ? null : lunchMins > 70 ? "over" : lunchMins >= 60 ? "spare" : "ok";
              return (
                <div className="space-y-4">
                  {/* IN / OUT row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-ok/5 border border-ok/20 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-ok uppercase tracking-wide mb-1">IN</p>
                      <p className="text-2xl font-bold text-ok font-mono">{formatTime(todayRow.first_in)}</p>
                      {todayRow.late_minutes > 0 && (
                        <p className="text-xs text-warn mt-1 font-medium">{todayRow.late_minutes}m late</p>
                      )}
                    </div>
                    <div className="bg-canvas border border-line rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-1">OUT</p>
                      {todayRow.last_out ? (
                        <p className="text-2xl font-bold text-ink font-mono">{formatTime(todayRow.last_out)}</p>
                      ) : (
                        <p className="text-lg font-semibold text-ink-dim italic mt-0.5">Still in</p>
                      )}
                      {todayRow.ot_minutes > 0 && (
                        <p className="text-xs text-ok mt-1 font-medium">OT {formatMins(todayRow.ot_minutes)}</p>
                      )}
                    </div>
                  </div>

                  {/* Lunch break row */}
                  {lunchStart && lunchEnd ? (
                    <div className={`border rounded-xl px-4 py-3 ${
                      lunchStatus === "over"  ? "bg-err/5 border-err/20" :
                      lunchStatus === "spare" ? "bg-warn/5 border-warn/20" :
                                               "bg-warn/5 border-warn/20"
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-warn uppercase tracking-wide">Lunch Break</p>
                        {lunchMins !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            lunchStatus === "over"  ? "bg-err/10 text-err" :
                            lunchStatus === "spare" ? "bg-warn/20 text-warn" :
                                                     "bg-ok/10 text-ok"
                          }`}>
                            {lunchStatus === "over" ? "Over" : lunchStatus === "spare" ? "Spare" : "OK"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <p className="text-base font-mono font-semibold text-ink">
                          {formatTime(lunchStart)}
                          <span className="text-ink-dim mx-2">→</span>
                          {formatTime(lunchEnd)}
                        </p>
                        {lunchMins !== null && (
                          <span className={`text-sm font-bold ${
                            lunchStatus === "over"  ? "text-err" :
                            lunchStatus === "spare" ? "text-warn" : "text-ok"
                          }`}>
                            {formatMins(lunchMins)}
                          </span>
                        )}
                      </div>
                      {lunchStatus === "over" && (
                        <p className="text-xs text-err mt-1">Lunch exceeded 1h 10m — will be noted</p>
                      )}
                      {lunchStatus === "spare" && (
                        <p className="text-xs text-warn mt-1">Lunch between 1h and 1h 10m</p>
                      )}
                    </div>
                  ) : todayRow.punches.length <= 2 ? (
                    <div className="bg-canvas border border-line rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Lunch Break</p>
                      <p className="text-sm text-ink-dim italic mt-1">Not recorded yet</p>
                    </div>
                  ) : null}

                  {/* Working hours */}
                  <div className="bg-info/5 border border-info/20 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-info uppercase tracking-wide mb-1">Total Working Hours</p>
                    {todayRow.effective_hours !== null ? (
                      <p className="text-2xl font-bold text-ink">{formatHours(todayRow.effective_hours)}</p>
                    ) : (
                      <p className="text-sm text-ink-dim italic">Calculating when you check out…</p>
                    )}
                    {todayRow.lunch_minutes !== null && todayRow.effective_hours !== null && (
                      <p className="text-xs text-ink-dim mt-1">
                        Total time − {formatMins(todayRow.lunch_minutes)} lunch = {formatHours(todayRow.effective_hours)}
                      </p>
                    )}
                  </div>

                  {todayRow.double_punch && (
                    <p className="text-xs text-warn font-medium text-center">Double punch detected — please check with admin</p>
                  )}
                </div>
              );
            })() : (
              <p className="text-xs text-ink-dim py-3 text-center">No punch records found for today.</p>
            )}
          </div>

          {/* Monthly summary strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Present", value: presentDays, color: "text-ok" },
              { label: "Absent",  value: absentDays,  color: absentDays > 0 ? "text-err" : "text-ink-dim" },
              { label: "Late",    value: totalLateMins > 0 ? formatMins(totalLateMins) : "—", color: totalLateMins > 0 ? "text-warn" : "text-ink-dim" },
              { label: "OT",      value: formatMins(totalOtMins), color: totalOtMins > 0 ? "text-ok" : "text-ink-dim" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-ink-dim mt-0.5">{c.label} · {monthLabel(todayMonth).split(" ")[0]}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-ink-dim text-center">
            Boys: 9:30 AM – 9:30 PM · Girls: 9:30 AM – 8:30 PM · Grace till 9:50 AM
          </p>
        </div>
      )}

      {/* ── MONTHLY TAB ───────────────────────────────────────────────────────── */}
      {tab === "monthly" && (
        <div className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)}
              className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">◄</button>
            <span className="font-semibold text-ink w-44 text-center">{monthLabel(month)}</span>
            <button onClick={() => shiftMonth(1)} disabled={month >= todayMonth}
              className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas disabled:opacity-30">►</button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Present", value: presentDays, color: "text-ok" },
              { label: "Absent",  value: absentDays,  color: absentDays > 0 ? "text-err" : "text-ink-dim" },
              { label: "Late",    value: totalLateMins > 0 ? formatMins(totalLateMins) : "—", color: totalLateMins > 0 ? "text-warn" : "text-ink-dim" },
              { label: "OT",      value: formatMins(totalOtMins), color: totalOtMins > 0 ? "text-ok" : "text-ink-dim" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-ink-dim mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Day-by-day table */}
          {loading ? (
            <div className="text-center py-12 text-ink-dim text-sm">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-right px-3 py-2.5">IN</th>
                    <th className="text-right px-3 py-2.5">OUT</th>
                    <th className="text-right px-3 py-2.5">Hours</th>
                    <th className="text-right px-3 py-2.5">Lunch</th>
                    <th className="text-right px-3 py-2.5">Late</th>
                    <th className="text-right px-3 py-2.5">OT</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.date}
                      className={`border-b border-line last:border-0 ${r.status === "leave" ? "opacity-50" : ""} ${r.date === todayStr ? "bg-gold/5" : ""}`}>
                      <td className="px-4 py-2 font-mono text-xs">{dayLabel(r.date)}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {r.status === "leave" ? (
                            <span className="text-[10px] font-semibold bg-err/10 text-err px-1.5 py-0.5 rounded">Leave</span>
                          ) : r.status === "late" ? (
                            <span className="text-[10px] font-semibold bg-warn/10 text-warn px-1.5 py-0.5 rounded">Late</span>
                          ) : (
                            <span className="text-[10px] font-semibold bg-ok/10 text-ok px-1.5 py-0.5 rounded">Present</span>
                          )}
                          {r.double_punch && (
                            <span className="text-[9px] text-warn leading-none">dbl punch</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ok">{formatTime(r.first_in)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ink-dim">{formatTime(r.last_out)}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatHours(r.effective_hours)}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.lunch_minutes !== null ? (
                          <span className={`font-medium ${
                            r.lunch_minutes > 70 ? "text-err" : r.lunch_minutes >= 60 ? "text-warn" : "text-ok"
                          }`}>
                            {formatMins(r.lunch_minutes)}
                          </span>
                        ) : r.punches.length >= 2 ? (
                          <span className="text-ink-dim">—</span>
                        ) : (
                          <span className="text-ink-dim">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-medium ${r.late_minutes > 0 ? "text-warn" : "text-ink-dim"}`}>
                        {r.late_minutes > 0 ? `${r.late_minutes}m` : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-medium ${r.ot_minutes > 0 ? "text-ok" : "text-ink-dim"}`}>
                        {r.ot_minutes > 0 ? formatMins(r.ot_minutes) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-ink-dim text-center pb-2">
            Boys shift: 9:30 AM – 9:30 PM · Girls shift: 9:30 AM – 8:30 PM · Grace till 9:50 AM
          </p>
        </div>
      )}

      {/* ── REQUESTS TAB ──────────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-4">
          {/* Permission Requests */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Permission Requests</p>
                <p className="text-xs text-ink-dim mt-0.5">Used {usedThisMonth}/2 this month</p>
              </div>
              {canRequest && !showPermForm && (
                <button onClick={() => setShowPermForm(true)}
                  className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
                  + Request Permission
                </button>
              )}
              {!canRequest && (
                <span className="text-xs text-err font-medium">Monthly limit reached</span>
              )}
            </div>

            {showPermForm && (
              <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                <p className="text-xs font-medium text-ink-dim">New Permission Request (max 2 hrs late)</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Date</label>
                    <input type="date" value={permForm.permission_date} max={todayStr}
                      onChange={e => setPermForm(f => ({ ...f, permission_date: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">I will be late by (minutes)</label>
                    <input type="number" min={1} max={120} value={permForm.late_minutes}
                      onChange={e => setPermForm(f => ({ ...f, late_minutes: Number(e.target.value) }))}
                      className={`${inpCls} w-20`} />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-ink-dim block mb-1">Reason</label>
                    <input type="text" value={permForm.reason} placeholder="Briefly explain…"
                      onChange={e => setPermForm(f => ({ ...f, reason: e.target.value }))}
                      className={`${inpCls} w-full`} />
                  </div>
                </div>
                {permError && <p className="text-xs text-err">{permError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitPermission} disabled={createPerm.isPending}
                    className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                    {createPerm.isPending ? "Submitting…" : "Submit"}
                  </button>
                  <button onClick={() => { setShowPermForm(false); setPermError(null); }}
                    className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                </div>
              </div>
            )}

            {permissions.length > 0 ? (
              <div className="space-y-1">
                {(permissions as PermissionRequest[]).slice(0, 6).map(p => (
                  <div key={p.id} className="flex items-center gap-3 text-xs py-1 border-b border-line last:border-0">
                    <span className="text-ink-dim w-20">{p.permission_date}</span>
                    <span className="text-ink">{p.late_minutes}m late</span>
                    <span className="flex-1 text-ink-dim truncate">{p.reason || "—"}</span>
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      p.status === "approved" ? "bg-ok/10 text-ok" :
                      p.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"
                    }`}>{p.status}</span>
                    {p.admin_note && <span className="text-ink-dim italic max-w-[100px] truncate">{p.admin_note}</span>}
                  </div>
                ))}
              </div>
            ) : !showPermForm ? (
              <p className="text-xs text-ink-dim">No requests yet.</p>
            ) : null}
          </div>

          {/* Leave Requests */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Leave Requests</p>
              {!showLeaveForm && (
                <button onClick={() => setShowLeaveForm(true)}
                  className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
                  + Request Leave
                </button>
              )}
            </div>

            {showLeaveForm && (
              <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                <p className="text-xs font-medium text-ink-dim">New Leave Request</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Date</label>
                    <input type="date" value={leaveForm.leave_date} min={todayStr}
                      onChange={e => setLeaveForm(f => ({ ...f, leave_date: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Type</label>
                    <select value={leaveForm.leave_type}
                      onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}
                      className={inpCls}>
                      <option value="casual">Casual</option>
                      <option value="sick">Sick</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-ink-dim block mb-1">Reason (optional)</label>
                    <input type="text" value={leaveForm.reason} placeholder="e.g. family function"
                      onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                      className={`${inpCls} w-full`} />
                  </div>
                </div>
                {leaveError && <p className="text-xs text-err">{leaveError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleLeaveSubmit} disabled={submitLeave.isPending || !leaveForm.leave_date}
                    className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                    {submitLeave.isPending ? "Submitting…" : "Submit"}
                  </button>
                  <button onClick={() => { setShowLeaveForm(false); setLeaveError(null); }}
                    className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                </div>
              </div>
            )}

            {myLeaves.length > 0 ? (
              <div className="space-y-1">
                {(myLeaves as LeaveRequest[]).map(l => (
                  <div key={l.id} className="flex items-center gap-3 text-xs py-1 border-b border-line last:border-0">
                    <span className="text-ink-dim w-20">{l.leave_date}</span>
                    <span className="text-ink capitalize">{l.leave_type.replace("_", " ")}</span>
                    <span className="flex-1 text-ink-dim truncate">{l.reason || "—"}</span>
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      l.status === "approved" ? "bg-ok/10 text-ok" :
                      l.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"
                    }`}>{l.status}</span>
                    {l.admin_note && <span className="text-ink-dim italic max-w-[100px] truncate">{l.admin_note}</span>}
                  </div>
                ))}
              </div>
            ) : !showLeaveForm ? (
              <p className="text-xs text-ink-dim">No leave requests yet.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
