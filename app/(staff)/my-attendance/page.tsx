"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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
};

type StaffInfo = { bio_user_id: string; name: string; shift: string };

// ── page ─────────────────────────────────────────────────────────────────────
export default function MyAttendancePage() {
  const today = currentMonth();
  const [month, setMonth]       = useState(today);
  const [staff, setStaff]       = useState<StaffInfo | null>(null);
  const [rows, setRows]         = useState<DayRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

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
    const todayStr    = new Date().toISOString().slice(0, 10);
    const lastDay     = month < todayStr.slice(0, 7) ? monthEnd : todayStr;
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

          const firstInMins = firstIn ? istMinutes(firstIn) : 0;
          const is_late     = firstIn ? firstInMins > 9 * 60 + 50 : false;
          const late_minutes = is_late ? firstInMins - (9 * 60 + 30) : 0;
          const lastOutMins  = lastOut ? istMinutes(lastOut) : 0;
          const ot_minutes   = lastOut ? Math.max(0, lastOutMins - shiftEndMin) : 0;

          let lunch_minutes: number | null = null;
          if (deduped.length >= 4) {
            lunch_minutes = (new Date(deduped[deduped.length - 2]).getTime() - new Date(deduped[1]).getTime()) / 60000;
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
    if (newM <= today) setMonth(newM);
  }

  async function handleLogout() {
    await supabase().auth.signOut();
  }

  const presentDays = rows.filter(r => r.status !== "leave").length;
  const lateDays    = rows.filter(r => r.status === "late").length;
  const absentDays  = rows.filter(r => r.status === "leave").length;
  const totalOtMins = rows.reduce((s, r) => s + r.ot_minutes, 0);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink">My Attendance</h1>
          {staff && (
            <p className="text-sm text-ink-dim">
              {staff.name}
              <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                staff.shift === "girls" ? "bg-info/10 text-info" : "bg-gold/10 text-gold"
              }`}>
                {staff.shift === "girls" ? "Girls shift" : "Boys shift"}
              </span>
            </p>
          )}
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-err hover:border-err transition-colors"
        >
          Logout
        </button>
      </div>

      {error && (
        <div className="bg-err/10 text-err text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Month nav */}
      <div className="flex items-center gap-2">
        <button onClick={() => shiftMonth(-1)}
          className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">◄</button>
        <span className="font-semibold text-ink w-44 text-center">{monthLabel(month)}</span>
        <button onClick={() => shiftMonth(1)} disabled={month >= today}
          className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas disabled:opacity-30">►</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Present", value: presentDays, color: "text-ok" },
          { label: "Absent",  value: absentDays,  color: absentDays > 0 ? "text-err" : "text-ink-dim" },
          { label: "Late",    value: lateDays,     color: lateDays > 0 ? "text-warn" : "text-ink-dim" },
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
                <th className="text-right px-3 py-2.5">Late</th>
                <th className="text-right px-3 py-2.5">OT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.date}
                  className={`border-b border-line last:border-0 ${r.status === "leave" ? "opacity-50" : ""}`}>
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

      <p className="text-xs text-ink-dim text-center pb-4">
        Boys shift: 9:30 AM – 9:30 PM · Girls shift: 9:30 AM – 8:30 PM · Grace till 9:50 AM
      </p>
    </div>
  );
}
