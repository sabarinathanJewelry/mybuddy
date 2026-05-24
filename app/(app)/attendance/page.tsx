"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAttendanceByDate, useStaff, useUpdateStaff, useDeleteStaff,
  useMonthlyAttendanceSummary,
  type StaffMember, type MonthlyEmployeeSummary,
} from "@/modules/attendance/api";
import { shortDate, inr } from "@/lib/format";

type PageTab = "attendance" | "staff" | "monthly";

const inp = "border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function formatTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatHours(h: number | null) {
  if (h === null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}
function formatMins(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", {
    month: "long", year: "numeric",
  });
}
function dayLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${String(d).padStart(2, "0")} ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]}`;
}

// ── Monthly Report tab ───────────────────────────────────────────────────────
function MonthlyTab() {
  const today      = currentMonth();
  const [month, setMonth]             = useState(today);
  const [lateFineAmt, setLateFineAmt] = useState(100);
  const [fineMode, setFineMode]       = useState<"day" | "minute">("day");
  const [applyFine, setApplyFine]     = useState(true);
  const [bulkLeaves, setBulkLeaves]   = useState(1);
  const [showNetPay, setShowNetPay]   = useState(true);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editForm, setEditForm]       = useState({ monthly_salary: 0, allowed_leaves: 1 });

  const { data = [], isLoading } = useMonthlyAttendanceSummary(month);
  const update = useUpdateStaff();
  const qc     = useQueryClient();

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const next = m + dir;
    const newM = next < 1 ? `${y - 1}-12` : next > 12 ? `${y + 1}-01` : `${y}-${String(next).padStart(2, "0")}`;
    if (newM <= today) setMonth(newM);
  }

  function calcFine(r: MonthlyEmployeeSummary): number {
    if (!applyFine) return 0;
    return fineMode === "day" ? lateFineAmt * r.late_days : lateFineAmt * r.total_late_minutes;
  }
  function calcNet(r: MonthlyEmployeeSummary): number {
    return r.monthly_salary - r.leave_deduction - calcFine(r);
  }

  function startEdit(r: MonthlyEmployeeSummary) {
    setEditingId(r.bio_user_id);
    setEditForm({ monthly_salary: r.monthly_salary, allowed_leaves: r.allowed_leaves });
  }
  async function saveEdit(bio_user_id: string) {
    await update.mutateAsync({ bio_user_id, ...editForm });
    setEditingId(null);
  }
  async function handleBulkLeaves() {
    if (!confirm(`Set allowed leaves to ${bulkLeaves} for all ${data.length} active staff?`)) return;
    for (const r of data) {
      await update.mutateAsync({ bio_user_id: r.bio_user_id, allowed_leaves: bulkLeaves });
    }
    qc.invalidateQueries({ queryKey: ["monthly-attendance"] });
  }

  const totalDays   = data[0]?.total_days ?? 0;
  const totSalary   = data.reduce((s, r) => s + r.monthly_salary, 0);
  const totLeaveDed = data.reduce((s, r) => s + r.leave_deduction, 0);
  const totFine     = data.reduce((s, r) => s + calcFine(r), 0);
  const totNet      = data.reduce((s, r) => s + calcNet(r), 0);
  const totOtMins   = data.reduce((s, r) => s + r.total_ot_minutes, 0);

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => shiftMonth(-1)}
          className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">◄</button>
        <span className="font-semibold text-ink w-44 text-center">{monthLabel(month)}</span>
        <button onClick={() => shiftMonth(1)} disabled={month >= today}
          className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas disabled:opacity-30">►</button>
        {totalDays > 0 && <span className="text-xs text-ink-dim ml-1">{totalDays} days counted</span>}
        <div className="flex-1" />
        <button onClick={() => setShowNetPay(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg2 border transition-colors ${
            showNetPay ? "border-line text-ink-dim hover:text-ink" : "border-gold text-gold bg-gold/5"
          }`}>
          {showNetPay ? "Hide Net Pay" : "Show Net Pay"}
        </button>
      </div>

      {/* Settings card */}
      <div className="bg-canvas border border-line rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Report Settings</p>
        <div className="flex flex-wrap gap-5 items-end">
          <div>
            <label className="text-xs text-ink-dim block mb-1">Late Fine</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-ink-dim">₹</span>
              <input type="number" value={lateFineAmt} min={0}
                onChange={e => setLateFineAmt(Number(e.target.value))}
                className={inp + " w-20"} />
              <span className="text-xs text-ink-dim">per</span>
              <select value={fineMode} onChange={e => setFineMode(e.target.value as "day" | "minute")}
                className={inp + " w-28"}>
                <option value="day">late day</option>
                <option value="minute">minute late</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none ml-1">
                <input type="checkbox" checked={applyFine} onChange={e => setApplyFine(e.target.checked)}
                  className="accent-gold" />
                Apply
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-dim block mb-1">Set allowed leaves for all staff</label>
            <div className="flex items-center gap-1.5">
              <input type="number" value={bulkLeaves} min={0} max={31}
                onChange={e => setBulkLeaves(Number(e.target.value))}
                className={inp + " w-16"} />
              <span className="text-xs text-ink-dim">days/month</span>
              <button onClick={handleBulkLeaves}
                className="bg-gold text-white text-xs px-2.5 py-1.5 rounded-lg2">Set all</button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-ink-dim leading-relaxed">
          Fine suggestion: <strong>₹50–200 / late day</strong> or <strong>₹3–10 / minute late</strong>.
          ₹100/day on ₹25,000 ≈ 4% daily wage.
          Leave deduction and late fine are independent — both or either can be applied.
        </p>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-ink-dim text-sm text-center py-8">Loading…</p>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
          No active staff. Run migration 029 in Supabase, then check staff records.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "1080px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="w-8 px-3 py-2.5" />
                <th className="text-left px-3 py-2.5">Name</th>
                <th className="text-right px-3 py-2.5">Salary</th>
                <th className="text-right px-3 py-2.5">Present</th>
                <th className="text-right px-3 py-2.5">Absent</th>
                <th className="text-right px-3 py-2.5">Allowed</th>
                <th className="text-right px-3 py-2.5 text-err">Excess</th>
                <th className="text-right px-3 py-2.5 text-warn">Late</th>
                <th className="text-right px-3 py-2.5 text-warn">Late(m)</th>
                <th className="text-right px-3 py-2.5 text-ok">OT</th>
                <th className="text-center px-3 py-2.5" title="no lunch / spare (1h–1h10m) / over (>1h10m)">Lunch</th>
                <th className="text-right px-3 py-2.5 text-err">L.Ded</th>
                <th className="text-right px-3 py-2.5 text-err">Fine</th>
                <th className="text-right px-3 py-2.5 font-semibold text-ink">
                  {showNetPay ? "Net Pay" : "Net Pay 🔒"}
                </th>
                <th className="w-12 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => {
                const fine       = calcFine(r);
                const net        = calcNet(r);
                const isExpanded = expandedId === r.bio_user_id;

                return (
                  <Fragment key={r.bio_user_id}>
                    {/* Summary row */}
                    <tr
                      className={`border-b border-line hover:bg-canvas/50 cursor-pointer ${isExpanded ? "bg-canvas/30" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : r.bio_user_id)}
                    >
                      <td className="px-3 py-2.5 text-center text-ink-dim text-xs select-none">
                        {isExpanded ? "▼" : "▶"}
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        {r.name}
                        <span className={`ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded ${
                          r.shift === "girls" ? "bg-info/10 text-info" : "bg-gold/10 text-gold"
                        }`}>
                          {r.shift === "girls" ? "G" : "B"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {r.monthly_salary > 0 ? inr(r.monthly_salary) : <span className="text-ink-dim">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ok font-medium">{r.present_days}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${r.absent_days > r.allowed_leaves ? "text-err" : ""}`}>
                        {r.absent_days}
                      </td>
                      <td className="px-3 py-2.5 text-right text-ink-dim">{r.allowed_leaves}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${r.excess_leave_days > 0 ? "text-err" : "text-ink-dim"}`}>
                        {r.excess_leave_days > 0 ? r.excess_leave_days : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${r.late_days > 0 ? "text-warn" : "text-ink-dim"}`}>
                        {r.late_days > 0 ? r.late_days : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs ${r.total_late_minutes > 0 ? "text-warn" : "text-ink-dim"}`}>
                        {formatMins(r.total_late_minutes)}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs ${r.total_ot_minutes > 0 ? "text-ok" : "text-ink-dim"}`}>
                        {formatMins(r.total_ot_minutes)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {r.days_no_lunch > 0 && (
                            <span className="text-[10px] text-ink-dim">{r.days_no_lunch}×no</span>
                          )}
                          {r.days_lunch_spare > 0 && (
                            <span className="text-[10px] text-warn font-semibold">{r.days_lunch_spare}×spare</span>
                          )}
                          {r.days_lunch_over > 0 && (
                            <span className="text-[10px] text-err font-semibold">{r.days_lunch_over}×over</span>
                          )}
                          {r.days_no_lunch === 0 && r.days_lunch_spare === 0 && r.days_lunch_over === 0 && (
                            <span className="text-[10px] text-ink-dim">—</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs font-mono ${r.leave_deduction > 0 ? "text-err" : "text-ink-dim"}`}>
                        {r.leave_deduction > 0 ? inr(Math.round(r.leave_deduction)) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs font-mono ${fine > 0 ? "text-err" : "text-ink-dim"}`}>
                        {fine > 0 ? inr(fine) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold font-mono ${
                        !showNetPay ? "text-ink-dim" :
                        r.monthly_salary > 0 ? (net < r.monthly_salary * 0.8 ? "text-err" : "text-ink") : "text-ink-dim"
                      }`}>
                        {!showNetPay ? "•••" : r.monthly_salary > 0 ? inr(Math.round(net)) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <button onClick={() => startEdit(r)} className="text-xs text-gold hover:underline">Edit</button>
                      </td>
                    </tr>

                    {/* Salary edit row */}
                    {editingId === r.bio_user_id && (
                      <tr className="border-b border-line bg-canvas/40">
                        <td colSpan={15} className="px-4 py-3">
                          <div className="flex flex-wrap gap-3 items-end">
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Monthly Salary (₹)</label>
                              <input type="number" value={editForm.monthly_salary} min={0}
                                onChange={e => setEditForm(f => ({ ...f, monthly_salary: Number(e.target.value) }))}
                                className={inp + " w-36"} />
                            </div>
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Allowed Leaves / month</label>
                              <input type="number" value={editForm.allowed_leaves} min={0} max={31}
                                onChange={e => setEditForm(f => ({ ...f, allowed_leaves: Number(e.target.value) }))}
                                className={inp + " w-24"} />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(r.bio_user_id)} disabled={update.isPending}
                                className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">Save</button>
                              <button onClick={() => setEditingId(null)}
                                className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr className="border-b border-line bg-canvas/10">
                        <td colSpan={15} className="px-4 py-4">
                          <div className="flex gap-5 flex-wrap items-start">

                            {/* Day-by-day attendance calendar */}
                            <div className="flex-1 overflow-x-auto" style={{ minWidth: "380px" }}>
                              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-2">
                                Daily Attendance — {monthLabel(month)}
                              </p>
                              <table className="w-full text-xs" style={{ minWidth: "520px" }}>
                                <thead>
                                  <tr className="text-ink-dim border-b border-line">
                                    <th className="text-left py-1 pr-3 font-medium">Date</th>
                                    <th className="text-center py-1 px-2 font-medium">Status</th>
                                    <th className="text-right py-1 px-2 font-medium">IN</th>
                                    <th className="text-right py-1 px-2 font-medium">OUT</th>
                                    <th className="text-right py-1 px-2 font-medium">Hours</th>
                                    <th className="text-center py-1 px-2 font-medium">Lunch</th>
                                    <th className="text-right py-1 px-2 font-medium">Late</th>
                                    <th className="text-right py-1 px-2 font-medium">OT</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.daily.map(d => (
                                    <tr key={d.date}
                                      className={`border-b border-line last:border-0 ${!d.first_in ? "opacity-50" : ""}`}>
                                      <td className="py-1 pr-3 font-mono whitespace-nowrap">{dayLabel(d.date)}</td>
                                      <td className="py-1 px-2 text-center">
                                        <div className="flex flex-col items-center gap-0.5">
                                          {!d.first_in ? (
                                            <span className="text-[10px] font-semibold bg-err/10 text-err px-1.5 py-0.5 rounded">Leave</span>
                                          ) : d.is_late ? (
                                            <span className="text-[10px] font-semibold bg-warn/10 text-warn px-1.5 py-0.5 rounded">Late</span>
                                          ) : (
                                            <span className="text-[10px] font-semibold bg-ok/10 text-ok px-1.5 py-0.5 rounded">Present</span>
                                          )}
                                          {d.double_punch_detected && (
                                            <span className="text-[9px] font-semibold text-warn leading-none">Dbl punch</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-1 px-2 text-right font-mono text-ok">{formatTime(d.first_in)}</td>
                                      <td className="py-1 px-2 text-right font-mono text-ink-dim">{formatTime(d.last_out)}</td>
                                      <td className="py-1 px-2 text-right">{formatHours(d.effective_hours)}</td>
                                      <td className="py-1 px-2 text-center">
                                        {!d.first_in ? (
                                          <span className="text-ink-dim">—</span>
                                        ) : d.lunch_minutes === null ? (
                                          <span className="text-[10px] text-ink-dim">not tracked</span>
                                        ) : (
                                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                            d.lunch_minutes > 70  ? "bg-err/10 text-err" :
                                            d.lunch_minutes >= 60 ? "bg-warn/10 text-warn" :
                                                                    "bg-ok/10 text-ok"
                                          }`}>
                                            {formatMins(Math.round(d.lunch_minutes))}
                                            {d.lunch_minutes > 70  && " over"}
                                            {d.lunch_minutes >= 60 && d.lunch_minutes <= 70 && " spare"}
                                          </span>
                                        )}
                                      </td>
                                      <td className={`py-1 px-2 text-right font-medium ${d.late_minutes > 0 ? "text-warn" : "text-ink-dim"}`}>
                                        {d.late_minutes > 0 ? `${d.late_minutes}m` : "—"}
                                      </td>
                                      <td className={`py-1 px-2 text-right font-medium ${d.ot_minutes > 0 ? "text-ok" : "text-ink-dim"}`}>
                                        {d.ot_minutes > 0 ? formatMins(d.ot_minutes) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Salary split card */}
                            <div className="w-60 shrink-0 bg-white rounded-xl border border-line p-4 text-xs space-y-1.5 shadow-soft">
                              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-2">Salary Split-up</p>

                              <div className="flex justify-between">
                                <span className="text-ink-dim">Base Salary</span>
                                <span className="font-mono font-medium">{inr(r.monthly_salary)}</span>
                              </div>
                              <div className="flex justify-between text-ink-dim">
                                <span>÷ {r.total_days} working days</span>
                                <span className="font-mono">{inr(Math.round(r.per_day_salary))}/day</span>
                              </div>

                              <div className="border-t border-line pt-1.5 mt-1.5 space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-ok">Present</span>
                                  <span className="font-medium">{r.present_days} days</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className={r.absent_days > r.allowed_leaves ? "text-err" : "text-ink-dim"}>Absent</span>
                                  <span className="font-medium">{r.absent_days} days</span>
                                </div>
                                <div className="flex justify-between text-ink-dim">
                                  <span>Allowed Leaves</span>
                                  <span>{r.allowed_leaves} days</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className={r.excess_leave_days > 0 ? "text-err" : "text-ink-dim"}>Excess Absent</span>
                                  <span className={`font-medium ${r.excess_leave_days > 0 ? "text-err" : "text-ink-dim"}`}>
                                    {r.excess_leave_days > 0 ? `${r.excess_leave_days} days` : "None"}
                                  </span>
                                </div>
                              </div>

                              <div className="border-t border-line pt-1.5 mt-1.5 space-y-1">
                                <div className="flex justify-between">
                                  <span className={r.leave_deduction > 0 ? "text-err" : "text-ink-dim"}>Leave Deduction</span>
                                  <span className={`font-mono ${r.leave_deduction > 0 ? "text-err font-medium" : "text-ink-dim"}`}>
                                    {r.leave_deduction > 0 ? `−${inr(Math.round(r.leave_deduction))}` : "—"}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className={r.late_days > 0 ? "text-warn" : "text-ink-dim"}>
                                    Late ({r.late_days} day{r.late_days !== 1 ? "s" : ""}, {formatMins(r.total_late_minutes)})
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-ink-dim pl-2">
                                    {applyFine ? `Fine @₹${lateFineAmt}/${fineMode === "day" ? "day" : "min"}` : "Fine (disabled)"}
                                  </span>
                                  <span className={`font-mono ${fine > 0 ? "text-err font-medium" : "text-ink-dim"}`}>
                                    {fine > 0 ? `−${inr(fine)}` : "—"}
                                  </span>
                                </div>
                                {r.total_ot_minutes > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-ok">OT ({formatMins(r.total_ot_minutes)})</span>
                                    <span className="text-ok text-ink-dim text-[10px]">not calculated</span>
                                  </div>
                                )}
                              </div>

                              <div className="border-t border-line pt-1.5 mt-1.5 space-y-1">
                                <div className="font-medium text-ink-dim mb-0.5">Punch Alerts</div>
                                <div className="flex justify-between">
                                  <span className={r.days_double_punch > 0 ? "text-warn" : "text-ink-dim"}>Double punch (verify)</span>
                                  <span className={`font-medium ${r.days_double_punch > 0 ? "text-warn" : "text-ink-dim"}`}>{r.days_double_punch} days</span>
                                </div>
                              </div>

                              <div className="border-t border-line pt-1.5 mt-1.5 space-y-1">
                                <div className="font-medium text-ink-dim mb-0.5">Lunch Tracking</div>
                                <div className="flex justify-between">
                                  <span className="text-ink-dim">Not tracked (2 punches)</span>
                                  <span className={r.days_no_lunch > 0 ? "font-medium" : "text-ink-dim"}>{r.days_no_lunch} days</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className={r.days_lunch_spare > 0 ? "text-warn" : "text-ink-dim"}>Spare (1h–1h10m)</span>
                                  <span className={`font-medium ${r.days_lunch_spare > 0 ? "text-warn" : "text-ink-dim"}`}>{r.days_lunch_spare} days</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className={r.days_lunch_over > 0 ? "text-err" : "text-ink-dim"}>Over (&gt;1h10m)</span>
                                  <span className={`font-medium ${r.days_lunch_over > 0 ? "text-err" : "text-ink-dim"}`}>{r.days_lunch_over} days</span>
                                </div>
                                {r.present_days - r.days_no_lunch - r.days_lunch_spare - r.days_lunch_over > 0 && (
                                  <div className="flex justify-between text-ok">
                                    <span>On time (&lt;1h)</span>
                                    <span className="font-medium">{r.present_days - r.days_no_lunch - r.days_lunch_spare - r.days_lunch_over} days</span>
                                  </div>
                                )}
                              </div>

                              <div className="border-t-2 border-line pt-2 mt-1">
                                <div className="flex justify-between font-semibold text-sm">
                                  <span>Net Pay</span>
                                  {showNetPay ? (
                                    <span className={`font-mono ${net < r.monthly_salary * 0.8 ? "text-err" : "text-ink"}`}>
                                      {r.monthly_salary > 0 ? inr(Math.round(net)) : "—"}
                                    </span>
                                  ) : (
                                    <span className="text-ink-dim tracking-widest">•••</span>
                                  )}
                                </div>
                              </div>
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {/* Totals row */}
              <tr className="bg-canvas/70 border-t-2 border-line text-sm font-semibold">
                <td />
                <td colSpan={1} className="px-3 py-2.5 text-xs text-ink-dim">
                  Total · {data.length} staff · {totalDays} days
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">{inr(totSalary)}</td>
                <td className="px-3 py-2.5 text-right text-ok">{data.reduce((s, r) => s + r.present_days, 0)}</td>
                <td className="px-3 py-2.5 text-right">{data.reduce((s, r) => s + r.absent_days, 0)}</td>
                <td />
                <td className="px-3 py-2.5 text-right text-err">{data.reduce((s, r) => s + r.excess_leave_days, 0) || "—"}</td>
                <td className="px-3 py-2.5 text-right text-warn">{data.reduce((s, r) => s + r.late_days, 0) || "—"}</td>
                <td className="px-3 py-2.5 text-right text-warn text-xs">{formatMins(data.reduce((s, r) => s + r.total_late_minutes, 0))}</td>
                <td className="px-3 py-2.5 text-right text-ok text-xs">{formatMins(totOtMins)}</td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {data.reduce((s,r)=>s+r.days_no_lunch,0) > 0 && <span className="text-[10px] text-ink-dim">{data.reduce((s,r)=>s+r.days_no_lunch,0)}×no</span>}
                    {data.reduce((s,r)=>s+r.days_lunch_spare,0) > 0 && <span className="text-[10px] text-warn font-semibold">{data.reduce((s,r)=>s+r.days_lunch_spare,0)}×spare</span>}
                    {data.reduce((s,r)=>s+r.days_lunch_over,0) > 0 && <span className="text-[10px] text-err font-semibold">{data.reduce((s,r)=>s+r.days_lunch_over,0)}×over</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right text-err text-xs font-mono">{totLeaveDed > 0 ? inr(Math.round(totLeaveDed)) : "—"}</td>
                <td className="px-3 py-2.5 text-right text-err text-xs font-mono">{totFine > 0 ? inr(totFine) : "—"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">
                  {showNetPay ? inr(Math.round(totNet)) : "•••"}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Staff management tab ─────────────────────────────────────────────────────
function StaffTab() {
  const { data: staff = [], isLoading } = useStaff();
  const update = useUpdateStaff();
  const del    = useDeleteStaff();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<StaffMember>>({});
  const [showInactive, setShowInactive] = useState(false);

  const visible = showInactive ? staff : staff.filter((s) => s.active);

  function startEdit(s: StaffMember) {
    setEditing(s.bio_user_id);
    setForm({
      name: s.name,
      designation: s.designation,
      department: s.department,
      phone: s.phone,
      shift: s.shift ?? "boys",
    });
  }

  async function saveEdit(bio_user_id: string) {
    await update.mutateAsync({ bio_user_id, ...form });
    setEditing(null);
  }

  async function toggleActive(s: StaffMember) {
    await update.mutateAsync({ bio_user_id: s.bio_user_id, active: !s.active });
  }

  async function handleDelete(s: StaffMember) {
    if (!confirm(`Delete "${s.name}" permanently? This cannot be undone.`)) return;
    await del.mutateAsync(s.bio_user_id);
  }

  if (isLoading) return <p className="text-ink-dim text-sm">Loading…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-dim">{staff.filter(s => s.active).length} active · {staff.filter(s => !s.active).length} inactive</p>
        <label className="flex items-center gap-1.5 text-sm text-ink-dim cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-gold" />
          Show inactive
        </label>
      </div>

      <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">#</th>
              <th className="text-left px-3 py-2.5">ID</th>
              <th className="text-left px-3 py-2.5">Name</th>
              <th className="text-left px-3 py-2.5 hidden md:table-cell">Designation</th>
              <th className="text-left px-3 py-2.5 hidden sm:table-cell">Dept</th>
              <th className="text-left px-3 py-2.5 hidden lg:table-cell">Phone</th>
              <th className="text-left px-3 py-2.5 hidden lg:table-cell">Shift</th>
              <th className="text-center px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => (
              <Fragment key={s.bio_user_id}>
                <tr className={`border-b border-line last:border-0 hover:bg-canvas/50 ${!s.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-2.5 text-ink-dim text-xs">{i + 1}</td>
                  <td className="px-3 py-2.5 text-ink-dim text-xs font-mono">{s.bio_user_id}</td>
                  <td className="px-3 py-2.5 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5 text-ink-dim hidden md:table-cell">{s.designation || "—"}</td>
                  <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{s.department || "—"}</td>
                  <td className="px-3 py-2.5 text-ink-dim hidden lg:table-cell">{s.phone || "—"}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      (s.shift ?? "boys") === "girls" ? "bg-info/10 text-info" : "bg-gold/10 text-gold"
                    }`}>
                      {(s.shift ?? "boys") === "girls" ? "Girls" : "Boys"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        s.active ? "bg-ok/10 text-ok hover:bg-ok/20" : "bg-ink-dim/10 text-ink-dim hover:bg-ink-dim/20"
                      }`}
                    >
                      {s.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => startEdit(s)} className="text-xs text-gold hover:underline">Edit</button>
                      <button onClick={() => toggleActive(s)}
                        className={`text-xs hover:underline ${s.active ? "text-warn" : "text-ok"}`}>
                        {s.active ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => handleDelete(s)} className="text-xs text-err hover:underline">Delete</button>
                    </div>
                  </td>
                </tr>

                {editing === s.bio_user_id && (
                  <tr className="border-b border-line bg-canvas/40">
                    <td colSpan={9} className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Name</label>
                          <input value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className={inp + " w-44"} />
                        </div>
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Designation</label>
                          <input value={form.designation ?? ""} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                            placeholder="e.g. Sales Staff" className={inp + " w-36"} />
                        </div>
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Department</label>
                          <input value={form.department ?? ""} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                            placeholder="e.g. Jewellery" className={inp + " w-32"} />
                        </div>
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Phone</label>
                          <input value={form.phone ?? ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                            placeholder="9XXXXXXXXX" className={inp + " w-32"} />
                        </div>
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Shift</label>
                          <select value={form.shift ?? "boys"} onChange={e => setForm(f => ({ ...f, shift: e.target.value as "boys" | "girls" }))}
                            className={inp + " w-36"}>
                            <option value="boys">Boys (till 9:30 PM)</option>
                            <option value="girls">Girls (till 8:30 PM)</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(s.bio_user_id)} disabled={update.isPending}
                            className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">Save</button>
                          <button onClick={() => setEditing(null)}
                            className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-ink-dim">No staff found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab]           = useState<PageTab>("attendance");
  const [date, setDate]         = useState(today);
  const [activeOnly, setActiveOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing]   = useState(false);
  const [isVercel, setIsVercel] = useState(false);
  const [syncMsg, setSyncMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  const qc = useQueryClient();
  const { data = [], isLoading, refetch } = useAttendanceByDate(date, activeOnly);

  const syncFromDevice = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch("/api/sync-attendance", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setSyncMsg({ ok: true, text: `Synced — ${json.staff} staff, ${json.records} records` });
        qc.invalidateQueries({ queryKey: ["attendance"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
      } else if (json.vercel) {
        setIsVercel(true);
        setSyncMsg(null);
        qc.invalidateQueries({ queryKey: ["attendance"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
      } else {
        setSyncMsg({ ok: false, text: json.error ?? "Sync failed" });
      }
    } catch {
      setSyncMsg({ ok: false, text: "Could not reach the sync API." });
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  useEffect(() => { syncFromDevice(); }, [syncFromDevice]);

  const present    = data.filter((r) => r.present);
  const absent     = data.filter((r) => !r.present);
  const checkedOut = present.filter((r) => r.last_out !== null);

  const lateCount       = present.filter(r => r.is_late).length;
  const overrunCount    = present.filter(r => r.lunch_overrun_minutes > 0).length;
  const shortCount      = present.filter(r => r.short_interval).length;
  const doubleCount     = present.filter(r => r.double_punch_detected).length;

  const tabLabels: Record<PageTab, string> = {
    attendance: "Attendance",
    staff:      "Manage Staff",
    monthly:    "Monthly Report",
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-ink">Attendance</h1>
        <div className="flex-1" />
        {tab === "attendance" && (
          <label className="flex items-center gap-1.5 text-sm text-ink-dim cursor-pointer select-none">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="accent-gold" />
            Active only
          </label>
        )}
        {tab === "attendance" && (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
        )}
        {isVercel ? (
          <button onClick={() => refetch()} disabled={isLoading}
            className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50">
            Refresh
          </button>
        ) : (
          <button onClick={syncFromDevice} disabled={syncing}
            className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50 flex items-center gap-2">
            {syncing && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {syncing ? "Syncing…" : "Sync from Device"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {(["attendance", "staff", "monthly"] as PageTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Vercel info banner */}
      {isVercel && (
        <div className="text-xs bg-info/10 text-info px-4 py-2.5 rounded-lg2 leading-relaxed">
          <strong>Running on Vercel</strong> — sync runs locally on the shop PC:<br />
          <code className="bg-white/60 px-1 rounded mt-1 inline-block">node scripts/sync-attendance.js</code>
        </div>
      )}
      {syncMsg && (
        <div className={`text-xs px-4 py-2 rounded-lg2 ${syncMsg.ok ? "bg-ok/10 text-ok" : "bg-err/10 text-err"}`}>
          {syncMsg.text}
        </div>
      )}

      {/* ── Attendance tab ── */}
      {tab === "attendance" && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Staff", value: data.length,        color: "text-ink"  },
              { label: "Present",     value: present.length,     color: "text-ok"   },
              { label: "Checked Out", value: checkedOut.length,  color: "text-info" },
              { label: "Absent",      value: absent.length,      color: "text-err"  },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-ink-dim mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {(lateCount > 0 || overrunCount > 0 || shortCount > 0 || doubleCount > 0) && (
            <div className="flex gap-2 flex-wrap">
              {lateCount > 0 && (
                <div className="bg-warn/10 text-warn text-xs font-medium px-3 py-1.5 rounded-lg2">
                  {lateCount} late arrival{lateCount > 1 ? "s" : ""}
                </div>
              )}
              {overrunCount > 0 && (
                <div className="bg-warn/10 text-warn text-xs font-medium px-3 py-1.5 rounded-lg2">
                  {overrunCount} lunch overrun{overrunCount > 1 ? "s" : ""}
                </div>
              )}
              {shortCount > 0 && (
                <div className="bg-err/10 text-err text-xs font-medium px-3 py-1.5 rounded-lg2">
                  {shortCount} short interval{shortCount > 1 ? "s" : ""} — verify records
                </div>
              )}
              {doubleCount > 0 && (
                <div className="bg-warn/10 text-warn text-xs font-medium px-3 py-1.5 rounded-lg2">
                  {doubleCount} double punch{doubleCount > 1 ? "es" : ""} — verify with staff
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <p className="text-ink-dim text-sm">Loading…</p>
          ) : data.length === 0 ? (
            <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
              <p className="font-medium">{syncing ? "Syncing…" : "No staff records found"}</p>
              {!syncing && <p className="text-xs mt-1">Run migrations 025–029 in Supabase, then sync the device.</p>}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">#</th>
                    <th className="text-left px-3 py-2.5">Name</th>
                    <th className="text-left px-3 py-2.5 hidden md:table-cell">Designation</th>
                    <th className="text-left px-3 py-2.5 hidden sm:table-cell">Dept</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-right px-3 py-2.5">IN</th>
                    <th className="text-right px-3 py-2.5">OUT</th>
                    <th className="text-right px-3 py-2.5">Eff. Hrs</th>
                    <th className="text-center px-3 py-2.5">Punches</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <Fragment key={r.bio_user_id}>
                      <tr className={`border-b border-line last:border-0 ${r.present ? "hover:bg-canvas/50" : "opacity-50 hover:opacity-70"}`}>
                        <td className="px-4 py-2.5 text-ink-dim text-xs">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 text-ink-dim hidden md:table-cell">{r.designation || "—"}</td>
                        <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{r.department || "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {r.present
                              ? r.last_out
                                ? <span className="text-[10px] font-semibold bg-ok/10 text-ok px-2 py-0.5 rounded-full">Out</span>
                                : <span className="text-[10px] font-semibold bg-info/10 text-info px-2 py-0.5 rounded-full">In</span>
                              : <span className="text-[10px] font-semibold bg-err/10 text-err px-2 py-0.5 rounded-full">Absent</span>
                            }
                            {r.is_late && <span className="text-[9px] font-semibold text-warn leading-none">Late</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-ok">{formatTime(r.first_in)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{formatTime(r.last_out)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-mono">{formatHours(r.effective_hours)}</span>
                          {r.lunch_spare_minutes > 0 && (
                            <span className="block text-[10px] text-warn font-medium">lunch spare +{Math.round(r.lunch_spare_minutes)}m</span>
                          )}
                          {r.lunch_overrun_minutes > 0 && (
                            <span className="block text-[10px] text-err font-medium">lunch over +{formatMins(r.lunch_overrun_minutes)}</span>
                          )}
                          {r.effective_hours !== null && r.lunch_minutes === null && r.last_out && (
                            <span className="block text-[10px] text-ink-dim">no lunch tracked</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {r.punches.length > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => setExpanded(expanded === r.bio_user_id ? null : r.bio_user_id)}
                                className="text-xs text-info hover:underline">
                                {r.punches.length} {r.punches.length === 1 ? "punch" : "punches"}
                              </button>
                              {r.double_punch_detected && (
                                <span className="text-[9px] font-semibold text-warn leading-none">Double punch!</span>
                              )}
                              {r.short_interval && (
                                <span className="text-[9px] font-semibold text-err leading-none">Short! Verify</span>
                              )}
                              {r.extra_punches && !r.short_interval && !r.double_punch_detected && (
                                <span className="text-[9px] text-ink-dim leading-none">extra punches</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-dim">—</span>
                          )}
                        </td>
                      </tr>

                      {expanded === r.bio_user_id && (
                        <tr className="border-b border-line bg-canvas/30">
                          <td colSpan={9} className="px-6 py-2.5">
                            <div className="flex flex-wrap gap-2">
                              {r.punches.map((p, pi) => (
                                <span key={pi} className="text-xs bg-white border border-line rounded px-2 py-1 font-mono">
                                  {pi === 0 ? "IN" : pi % 2 === 1 ? (pi === r.punches.length - 1 ? "OUT" : "↑ out") : "↓ in"}
                                  {" "}{formatTime(p)}
                                </span>
                              ))}
                              {r.double_punch_detected && (
                              <span className="text-xs border border-warn/40 rounded px-2 py-1 bg-warn/10 text-warn font-medium">
                                Double punch detected — verify with staff
                              </span>
                            )}
                            {r.lunch_minutes !== null ? (
                                <span className={`text-xs border rounded px-2 py-1 font-medium ${
                                  r.lunch_overrun_minutes > 0 ? "bg-err/10 border-err/30 text-err" :
                                  r.lunch_spare_minutes > 0  ? "bg-warn/10 border-warn/30 text-warn" :
                                                               "bg-ok/10 border-ok/30 text-ok"
                                }`}>
                                  Lunch: {formatMins(r.lunch_minutes)}
                                  {r.lunch_spare_minutes  > 0 && ` (spare +${Math.round(r.lunch_spare_minutes)}m)`}
                                  {r.lunch_overrun_minutes > 0 && ` (over +${formatMins(r.lunch_overrun_minutes)})`}
                                </span>
                              ) : r.present && r.last_out ? (
                                <span className="text-xs border border-line rounded px-2 py-1 text-ink-dim">No lunch tracked</span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.length > 0 && (
            <p className="text-xs text-ink-dim text-center">
              {shortDate(date)} · {present.length} present, {absent.length} absent of {data.length} staff
              {" "}· Boys 9:30–21:30 · Girls 9:30–20:30 · Grace till 9:50
            </p>
          )}
        </>
      )}

      {/* ── Staff tab ── */}
      {tab === "staff" && <StaffTab />}

      {/* ── Monthly report tab ── */}
      {tab === "monthly" && <MonthlyTab />}
    </div>
  );
}
