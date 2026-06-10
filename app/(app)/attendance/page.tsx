"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import {
  useAttendanceByDate, useStaff, useUpdateStaff, useDeleteStaff,
  useMonthlyAttendanceSummary, useAllPermissions, useDecidePermission,
  useKioskSequence, useSaveKioskSequence, useKioskSecret, useSaveKioskSecret, useLastSyncTime,
  useLeavesByDate, useAllLeaveRequests, useMyLeaveRequests, usePendingLeaveCount,
  useMyStaffProfile, useSubmitLeaveRequest, useDecideLeaveRequest, useDeleteLeaveRequest,
  useAppNotifications, useMarkNotificationRead, useMarkAllNotificationsRead,
  useStaffAdvances, useSaveStaffAdvance, useDeleteStaffAdvance,
  useApprovedPermsByDate, useApprovedPermsByMonth, useApprovedLeavesByMonth,
  useOutsideDutiesByDate, useOutsideDutiesByMonth, useAllOutsideDuties,
  useCreateOutsideDuty, useDecideOutsideDuty,
  useAllKyc, useVerifyKyc, KYC_DOCS,
  useShopExceptionForDate, useUpsertShopException, useDeleteShopException,
  type StaffMember, type MonthlyEmployeeSummary, type PermissionRequest, type KioskTap,
  type LeaveRequest, type AppNotification, type OutsideDuty, type StaffKyc,
} from "@/modules/attendance/api";
import { useKiosk } from "@/stores/kiosk";
import { useAuth } from "@/stores/auth";
import { shortDate, inr } from "@/lib/format";

type PageTab = "attendance" | "staff" | "monthly" | "requests" | "leaves" | "duties" | "chat" | "announcements" | "kyc";

interface ChatMsg { id: string; sender_id: string; sender_name: string; message: string; is_deleted: boolean; edited_at: string | null; created_at: string }

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
  const [weekendPenalty, setWeekendPenalty] = useState(false);
  const [equalizeOt, setEqualizeOt]         = useState(true);
  const [applyOt, setApplyOt]               = useState(false);
  const [otRateAmt, setOtRateAmt]           = useState(50);
  const [otRateMode, setOtRateMode]         = useState<"hour" | "minute">("hour");

  const { data = [], isLoading, refetch, isFetching } = useMonthlyAttendanceSummary(month);
  const { data: monthPerms  = [] } = useApprovedPermsByMonth(month);
  const { data: monthLeaves = [] } = useApprovedLeavesByMonth(month);
  const { data: monthDuties = [] } = useOutsideDutiesByMonth(month);
  const update = useUpdateStaff();
  const qc     = useQueryClient();

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const next = m + dir;
    const newM = next < 1 ? `${y - 1}-12` : next > 12 ? `${y + 1}-01` : `${y}-${String(next).padStart(2, "0")}`;
    if (newM <= today) setMonth(newM);
  }

  function isWeekend(dateStr: string): boolean {
    const [y, mo, d] = dateStr.split("-").map(Number);
    return [0, 6].includes(new Date(Date.UTC(y, mo - 1, d)).getUTCDay());
  }

  // Dates where this staff has an approved permission (late forgiven)
  function permDates(bio_user_id: string): Set<string> {
    return new Set(monthPerms.filter(p => p.bio_user_id === bio_user_id).map(p => p.permission_date));
  }
  // Dates where this staff has an approved outside duty
  function dutyDates(bio_user_id: string): Set<string> {
    return new Set(monthDuties.filter(d => d.bio_user_id === bio_user_id).map(d => d.duty_date));
  }
  // Late days excluding permission-forgiven and outside-duty days
  function effectiveLateDays(r: MonthlyEmployeeSummary): number {
    const pd = permDates(r.bio_user_id);
    const dd = dutyDates(r.bio_user_id);
    return r.daily.filter(d => d.is_late && !pd.has(d.date) && !dd.has(d.date)).length;
  }
  function effectiveLateMins(r: MonthlyEmployeeSummary): number {
    const pd = permDates(r.bio_user_id);
    const dd = dutyDates(r.bio_user_id);
    return r.daily.filter(d => d.is_late && !pd.has(d.date) && !dd.has(d.date)).reduce((s, d) => s + d.late_minutes, 0);
  }
  // Weekend absences without approved leave
  function weekendAbsentDays(r: MonthlyEmployeeSummary): string[] {
    const approvedLeaveDates = new Set(monthLeaves.filter(l => l.bio_user_id === r.bio_user_id).map(l => l.leave_date));
    return r.daily.filter(d => isWeekend(d.date) && !d.first_in && !approvedLeaveDates.has(d.date)).map(d => d.date);
  }

  function netLateMins(r: MonthlyEmployeeSummary): number {
    const lm = effectiveLateMins(r);
    return equalizeOt ? Math.max(0, lm - r.total_ot_minutes) : lm;
  }
  function netOtMins(r: MonthlyEmployeeSummary): number {
    return equalizeOt ? Math.max(0, r.total_ot_minutes - effectiveLateMins(r)) : r.total_ot_minutes;
  }
  function calcFine(r: MonthlyEmployeeSummary): number {
    if (!applyFine) return 0;
    const eld = effectiveLateDays(r);
    const nlm = netLateMins(r);
    if (eld <= 0 && nlm <= 0) return 0;
    return fineMode === "day" ? lateFineAmt * eld : lateFineAmt * nlm;
  }
  function calcOtPay(r: MonthlyEmployeeSummary): number {
    if (!applyOt) return 0;
    const nom = netOtMins(r);
    return otRateMode === "hour" ? otRateAmt * (nom / 60) : otRateAmt * nom;
  }
  function calcWeekendExtra(r: MonthlyEmployeeSummary): number {
    if (!weekendPenalty) return 0;
    const weekendAbsent = r.daily.filter(d => !d.first_in && isWeekend(d.date)).length;
    return weekendAbsent * r.per_day_salary;
  }
  function calcNet(r: MonthlyEmployeeSummary): number {
    return r.monthly_salary - r.leave_deduction - calcWeekendExtra(r) - calcFine(r) + calcOtPay(r);
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

  const totalDays    = data[0]?.total_days ?? 0;
  const totSalary    = data.reduce((s, r) => s + r.monthly_salary, 0);
  const totLeaveDed  = data.reduce((s, r) => s + r.leave_deduction, 0);
  const totFine      = data.reduce((s, r) => s + calcFine(r), 0);
  const totOtPay     = data.reduce((s, r) => s + calcOtPay(r), 0);
  const totNet       = data.reduce((s, r) => s + calcNet(r), 0);
  const totOtMins    = data.reduce((s, r) => s + r.total_ot_minutes, 0);

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
        <button onClick={() => refetch()} disabled={isFetching}
          className="text-xs px-3 py-1.5 rounded-lg2 border border-line text-ink-dim hover:text-ink disabled:opacity-40 transition-colors">
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
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
          {/* Late fine */}
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
          {/* OT pay */}
          <div>
            <label className="text-xs text-ink-dim block mb-1">OT Pay</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-ink-dim">₹</span>
              <input type="number" value={otRateAmt} min={0}
                onChange={e => setOtRateAmt(Number(e.target.value))}
                className={inp + " w-20"} />
              <span className="text-xs text-ink-dim">per</span>
              <select value={otRateMode} onChange={e => setOtRateMode(e.target.value as "hour" | "minute")}
                className={inp + " w-24"}>
                <option value="hour">hour</option>
                <option value="minute">minute</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none ml-1">
                <input type="checkbox" checked={applyOt} onChange={e => setApplyOt(e.target.checked)}
                  className="accent-gold" />
                Pay OT
              </label>
            </div>
          </div>
          {/* Bulk leaves */}
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
        {/* Toggle row */}
        <div className="flex flex-wrap gap-4 items-center pt-1">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={equalizeOt} onChange={e => setEqualizeOt(e.target.checked)}
              className="accent-gold" />
            <span className="text-ink-dim">Equalize Late &amp; OT</span>
            <span className="text-[10px] text-ink-dim/60">(OT minutes offset late — fine only on net late)</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={weekendPenalty} onChange={e => setWeekendPenalty(e.target.checked)}
              className="accent-gold" />
            <span className="text-ink-dim">Double deduction for Sat/Sun absent</span>
            <span className="text-[10px] text-ink-dim/60">(extra 1× per-day salary on top of leave deduction)</span>
          </label>
        </div>
        <p className="text-[11px] text-ink-dim leading-relaxed">
          Fine: <strong>₹50–200 / late day</strong> or <strong>₹3–10 / min late</strong>.
          OT: <strong>₹50 / hr</strong> is a common starting rate.
          When equalization is on, late and OT cancel each other out monthly before fine/pay are applied.
        </p>
      </div>

      {/* Weekend absence alerts */}
      {!isLoading && data.length > 0 && (() => {
        const alerts = data.map(r => ({ r, days: weekendAbsentDays(r) })).filter(x => x.days.length > 0);
        if (!alerts.length) return null;
        return (
          <div className="bg-warn/5 border border-warn/30 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-warn uppercase tracking-wide">
              Weekend Absences — {alerts.length} staff (without approved leave)
            </p>
            <p className="text-xs text-ink-dim">These staff were absent on Saturday/Sunday without an approved leave. Per policy, weekend absences attract 2× salary deduction. You can choose to apply or waive this below.</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {alerts.map(({ r, days }) => (
                <div key={r.bio_user_id} className="bg-white border border-warn/30 rounded-lg px-3 py-2 text-xs">
                  <span className="font-semibold text-ink">{r.name}</span>
                  <span className="text-warn ml-1.5">{days.length} day{days.length > 1 ? "s" : ""}</span>
                  <span className="text-ink-dim ml-1">— potential −{inr(Math.round(days.length * r.per_day_salary * 2))}</span>
                  <div className="text-[10px] text-ink-dim mt-0.5">{days.map(d => dayLabel(d)).join(", ")}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-ink-dim">Enable "Double deduction for Sat/Sun absent" in settings above to include this in Net Pay.</p>
          </div>
        );
      })()}

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
                      <td className={`px-3 py-2.5 text-right font-medium ${effectiveLateDays(r) > 0 ? "text-warn" : "text-ink-dim"}`}>
                        {effectiveLateDays(r) > 0 ? effectiveLateDays(r) : "—"}
                        {permDates(r.bio_user_id).size > 0 && (
                          <span className="block text-[9px] text-ok font-normal">{permDates(r.bio_user_id).size} perm</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs ${effectiveLateMins(r) > 0 ? "text-warn" : "text-ink-dim"}`}>
                        {formatMins(effectiveLateMins(r))}
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
                                {weekendPenalty && (() => {
                                  const wkAbs = r.daily.filter(d => !d.first_in && isWeekend(d.date)).length;
                                  const wkExtra = calcWeekendExtra(r);
                                  return wkAbs > 0 ? (
                                    <div className="flex justify-between">
                                      <span className="text-err">Sat/Sun absent ({wkAbs} day{wkAbs !== 1 ? "s" : ""}) ×2</span>
                                      <span className="font-mono text-err font-medium">−{inr(Math.round(wkExtra))}</span>
                                    </div>
                                  ) : null;
                                })()}
                                <div className="flex justify-between">
                                  <span className={effectiveLateDays(r) > 0 ? "text-warn" : "text-ink-dim"}>
                                    Late ({effectiveLateDays(r)} day{effectiveLateDays(r) !== 1 ? "s" : ""}, {formatMins(effectiveLateMins(r))})
                                    {permDates(r.bio_user_id).size > 0 && (
                                      <span className="ml-1 text-ok text-[10px]">({permDates(r.bio_user_id).size} permission-forgiven)</span>
                                    )}
                                  </span>
                                </div>
                                {equalizeOt && r.total_ot_minutes > 0 && (
                                  <div className="flex justify-between text-ok pl-2">
                                    <span>OT offset ({formatMins(r.total_ot_minutes)})</span>
                                    <span className="text-[10px] text-ink-dim">
                                      net late: {formatMins(netLateMins(r))}
                                    </span>
                                  </div>
                                )}
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
                                    <span className="text-ok">
                                      OT Pay ({formatMins(netOtMins(r))} net)
                                    </span>
                                    <span className={`font-mono ${calcOtPay(r) > 0 ? "text-ok font-medium" : "text-ink-dim text-[10px]"}`}>
                                      {calcOtPay(r) > 0 ? `+${inr(Math.round(calcOtPay(r)))}` : "not applied"}
                                    </span>
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

// ── Permission Requests tab ──────────────────────────────────────────────────
function RequestsTab() {
  const { data: requests = [], isLoading } = useAllPermissions();
  const decide = useDecidePermission();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const filtered = requests.filter(r => filter === "all" || r.status === filter);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  const STATUS_STYLE: Record<string, string> = {
    pending:  "bg-warn/10 text-warn",
    approved: "bg-ok/10 text-ok",
    rejected: "bg-err/10 text-err",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-line text-xs">
          {(["pending","approved","rejected","all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas"}`}>
              {f === "pending" ? `Pending (${pendingCount})` : f === "all" ? `All (${requests.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">Loading…</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "680px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Staff</th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Time</th>
                <th className="text-left px-3 py-2.5">Reason</th>
                <th className="text-center px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: PermissionRequest) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-medium">{(r as any).staff?.name ?? r.bio_user_id}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{shortDate(r.permission_date)}</td>
                    <td className="px-3 py-2.5 text-ink-dim">
                      {r.from_time && r.to_time
                        ? `${r.from_time.slice(0, 5)} – ${r.to_time.slice(0, 5)} (${r.late_minutes}m)`
                        : `${r.late_minutes}m`}
                    </td>
                    <td className="px-3 py-2.5 text-ink-dim max-w-[200px] truncate">{r.reason || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.status === "pending" && (
                        <div className="flex items-center gap-1 justify-end">
                          <input type="text" placeholder="note (optional)"
                            value={noteMap[r.id] ?? ""}
                            onChange={e => setNoteMap(m => ({ ...m, [r.id]: e.target.value }))}
                            className="border border-line rounded px-2 py-0.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-gold" />
                          <button onClick={() => decide.mutate({ id: r.id, status: "approved", admin_note: noteMap[r.id] })}
                            disabled={decide.isPending}
                            className="text-xs bg-ok text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-40">Approve</button>
                          <button onClick={() => decide.mutate({ id: r.id, status: "rejected", admin_note: noteMap[r.id] })}
                            disabled={decide.isPending}
                            className="text-xs bg-err text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-40">Reject</button>
                        </div>
                      )}
                      {r.admin_note && r.status !== "pending" && (
                        <span className="text-xs text-ink-dim">{r.admin_note}</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">No requests</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Staff advances section ────────────────────────────────────────────────────
const adv_inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function StaffAdvancesSection() {
  const { data: staff = [] } = useStaff();
  const { data: advances = [], isLoading } = useStaffAdvances();
  const save   = useSaveStaffAdvance();
  const remove = useDeleteStaffAdvance();

  const today = new Date().toLocaleDateString("en-CA");
  const [form, setForm] = useState({ staff_id: "", advance_date: today, type: "given" as "given" | "repaid", amount: 0, notes: "" });
  const [showForm, setShowForm] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<string | null>(null);

  // Build per-staff summary
  const activeStaff = staff.filter(s => s.active);
  const staffMap = new Map<string, { name: string; given: number; repaid: number }>();
  for (const s of activeStaff) {
    // find staff.id from bio_user_id — advances join returns staff.id
  }
  // advances have staff_id (uuid) and staff.name
  const summaryByStaffId = new Map<string, { name: string; bio_user_id: string; given: number; repaid: number }>();
  for (const a of advances) {
    const sid = a.staff_id;
    if (!summaryByStaffId.has(sid)) {
      summaryByStaffId.set(sid, { name: (a as any).staff?.name ?? "Unknown", bio_user_id: (a as any).staff?.bio_user_id ?? "", given: 0, repaid: 0 });
    }
    const entry = summaryByStaffId.get(sid)!;
    if (a.type === "given")  entry.given  += Number(a.amount);
    else                      entry.repaid += Number(a.amount);
  }
  const summaries = [...summaryByStaffId.entries()]
    .map(([sid, v]) => ({ sid, ...v, outstanding: v.given - v.repaid }))
    .sort((a, b) => b.outstanding - a.outstanding);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.staff_id || form.amount <= 0) return;
    await save.mutateAsync(form);
    setForm({ staff_id: "", advance_date: today, type: "given", amount: 0, notes: "" });
    setShowForm(false);
  }

  // Build staff options from actual staff list (need staff.id uuid)
  const staffOptions = activeStaff.map(s => ({ label: s.name, bio_user_id: s.bio_user_id }));

  return (
    <div className="space-y-3 mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Staff Advances</h3>
        <button onClick={() => setShowForm(v => !v)} className="text-xs text-gold hover:underline">
          {showForm ? "Cancel" : "+ Record Advance / Repayment"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-gold/30 rounded-xl p-4 shadow-soft space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Staff *</label>
              <select required value={form.staff_id}
                onChange={e => setForm({ ...form, staff_id: e.target.value })} className={adv_inp + " w-full"}>
                <option value="">— Select —</option>
                {staffOptions.map(s => (
                  <option key={s.bio_user_id} value={s.bio_user_id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Date</label>
              <input type="date" value={form.advance_date}
                onChange={e => setForm({ ...form, advance_date: e.target.value })} className={adv_inp + " w-full"} />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as "given" | "repaid" })} className={adv_inp + " w-full"}>
                <option value="given">Advance Given (cash out)</option>
                <option value="repaid">Repaid by Staff (cash in)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Amount (₹) *</label>
              <input type="number" step="0.01" required value={form.amount || ""}
                onFocus={e => e.target.select()}
                onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className={adv_inp + " w-full"} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-ink-dim block mb-1">Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Festival advance, emergency…" className={adv_inp + " w-full"} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending}
              className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
          </div>
          {save.isError && <p className="text-xs text-err">Save failed — run migration 037 first.</p>}
        </form>
      )}

      {isLoading ? <p className="text-sm text-ink-dim">Loading…</p> : (
        summaries.length === 0 ? (
          <p className="text-sm text-ink-dim text-center py-4">No advances recorded.</p>
        ) : (
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">Staff</th>
                  <th className="text-right px-3 py-2.5 text-err">Given</th>
                  <th className="text-right px-3 py-2.5 text-ok">Repaid</th>
                  <th className="text-right px-3 py-2.5">Outstanding</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {summaries.map(({ sid, name, given, repaid, outstanding }) => {
                  const rows = advances.filter(a => a.staff_id === sid);
                  const isExpanded = expandedStaff === sid;
                  return (
                    <Fragment key={sid}>
                      <tr className="border-b border-line hover:bg-canvas/50">
                        <td className="px-4 py-2.5 font-medium">{name}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-err">{inr(given)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(repaid)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${outstanding > 0 ? "text-err" : "text-ok"}`}>
                          {inr(outstanding)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => setExpandedStaff(isExpanded ? null : sid)}
                            className="text-xs text-gold hover:underline">
                            {isExpanded ? "Hide" : "Detail"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && rows.map(a => (
                        <tr key={a.id} className="border-b border-line bg-canvas/40 text-xs">
                          <td className="px-6 py-1.5 text-ink-dim">{a.advance_date} · {a.notes || (a.type === "given" ? "Advance given" : "Repaid")}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-err">{a.type === "given" ? inr(a.amount) : ""}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-ok">{a.type === "repaid" ? inr(a.amount) : ""}</td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => { if (window.confirm("Delete this entry?")) remove.mutate(a.id); }}
                              className="text-[11px] text-err hover:underline">Del</button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ── Staff management tab ─────────────────────────────────────────────────────
function StaffTab() {
  const { data: staff = [], isLoading } = useStaff();
  const update = useUpdateStaff();
  const del    = useDeleteStaff();
  const [editing, setEditing]       = useState<string | null>(null);
  const [form, setForm]             = useState<Partial<StaffMember>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [loginForm, setLoginForm]   = useState<{ bio_user_id: string; name: string } | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd]     = useState("");
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginMsg, setLoginMsg]     = useState<{ ok: boolean; text: string } | null>(null);

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

  function openLoginForm(s: StaffMember) {
    setLoginForm({ bio_user_id: s.bio_user_id, name: s.name });
    setLoginEmail("");
    setLoginPwd("");
    setLoginMsg(null);
  }

  async function saveLogin() {
    if (!loginForm || !loginEmail || !loginPwd) return;
    setLoginSaving(true);
    setLoginMsg(null);
    try {
      const res  = await fetch("/api/staff/assign-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio_user_id: loginForm.bio_user_id, name: loginForm.name, email: loginEmail, password: loginPwd }),
      });
      const json = await res.json();
      if (json.ok) {
        setLoginMsg({ ok: true, text: json.action === "updated" ? "Login updated." : "Login created." });
        update.mutate({ bio_user_id: loginForm.bio_user_id });
      } else {
        setLoginMsg({ ok: false, text: json.error ?? "Failed" });
      }
    } finally {
      setLoginSaving(false);
    }
  }

  async function removeLogin(s: StaffMember) {
    if (!confirm(`Remove login for "${s.name}"? They will no longer be able to sign in.`)) return;
    const res  = await fetch("/api/staff/assign-login", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio_user_id: s.bio_user_id }),
    });
    const json = await res.json();
    if (json.ok) update.mutate({ bio_user_id: s.bio_user_id });
    else alert(json.error ?? "Failed to remove login");
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

      <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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
              <th className="text-center px-3 py-2.5">Login</th>
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
                      (s.shift ?? "boys") === "girls" ? "bg-info/10 text-info" : (s.shift ?? "boys") === "helper" ? "bg-ok/10 text-ok" : "bg-gold/10 text-gold"
                    }`}>
                      {(s.shift ?? "boys") === "girls" ? "Girls" : (s.shift ?? "boys") === "helper" ? "Helper" : "Boys"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {s.user_id ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-semibold bg-ok/10 text-ok px-1.5 py-0.5 rounded">Set</span>
                        <button onClick={() => openLoginForm(s)} className="text-[9px] text-gold hover:underline">Change</button>
                        <button onClick={() => removeLogin(s)} className="text-[9px] text-err hover:underline">Remove</button>
                      </div>
                    ) : (
                      <button onClick={() => openLoginForm(s)}
                        className="text-[10px] font-medium text-gold border border-gold/40 rounded px-1.5 py-0.5 hover:bg-gold/10">
                        Assign
                      </button>
                    )}
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

                {loginForm?.bio_user_id === s.bio_user_id && (
                  <tr className="border-b border-line bg-canvas/40">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="flex flex-wrap gap-3 items-end">
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Email for {s.name}</label>
                          <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                            placeholder="staff@example.com" className={inp + " w-52"} />
                        </div>
                        <div>
                          <label className="text-xs text-ink-dim block mb-1">Password</label>
                          <input type="password" value={loginPwd} onChange={e => setLoginPwd(e.target.value)}
                            placeholder="min 6 characters" className={inp + " w-40"} />
                        </div>
                        <div className="flex gap-2 items-center">
                          <button onClick={saveLogin} disabled={loginSaving || !loginEmail || !loginPwd}
                            className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                            {loginSaving ? "Saving…" : s.user_id ? "Update Login" : "Create Login"}
                          </button>
                          <button onClick={() => { setLoginForm(null); setLoginMsg(null); }}
                            className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                          {loginMsg && (
                            <span className={`text-xs font-medium ${loginMsg.ok ? "text-ok" : "text-err"}`}>
                              {loginMsg.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {editing === s.bio_user_id && (
                  <tr className="border-b border-line bg-canvas/40">
                    <td colSpan={10} className="px-4 py-3">
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
                          <select value={form.shift ?? "boys"} onChange={e => setForm(f => ({ ...f, shift: e.target.value as "boys" | "girls" | "helper" }))}
                            className={inp + " w-40"}>
                            <option value="boys">Boys (till 9:30 PM)</option>
                            <option value="girls">Girls (till 8:30 PM)</option>
                            <option value="helper">Helper (till 6:00 PM)</option>
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
              <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-dim">No staff found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Notification Bell ────────────────────────────────────────────────────────
function NotificationBell({ notifications, bioUserId }: {
  notifications: AppNotification[];
  bioUserId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg2 border border-line hover:bg-canvas/80 transition-colors text-ink-dim">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-err text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-line rounded-xl shadow-soft z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <span className="text-sm font-semibold">Notifications</span>
            {notifications.length > 0 && (
              <button
                onClick={() => {
                  markAll.mutate({ notificationIds: notifications.map(n => n.id), bioUserId });
                  setOpen(false);
                }}
                className="text-xs text-gold hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-ink-dim">No new notifications</p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-line">
              {notifications.map(n => (
                <div key={n.id} className="px-4 py-3 hover:bg-canvas/50 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{n.title}</p>
                    <p className="text-xs text-ink-dim mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-ink-dim/60 mt-1">
                      {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <button
                    onClick={() => markOne.mutate({ notificationId: n.id, bioUserId })}
                    className="text-[10px] text-ink-dim hover:text-gold shrink-0 mt-0.5 leading-none">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Outside Duties tab ───────────────────────────────────────────────────────
const DUTY_STATUS_STYLE: Record<string, string> = {
  pending:  "bg-warn/10 text-warn",
  approved: "bg-ok/10 text-ok",
  rejected: "bg-err/10 text-err",
};

function DutiesTab() {
  const { data: duties = [], isLoading } = useAllOutsideDuties();
  const { data: staffList = [] } = useStaff();
  const decide = useDecideOutsideDuty();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const staffNameMap = new Map(staffList.map(s => [s.bio_user_id, s.name]));

  const filtered = duties.filter(d => filter === "all" || d.status === filter);
  const pendingCount = duties.filter(d => d.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg overflow-hidden border border-line text-xs w-fit">
        {(["pending","approved","rejected","all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas"}`}>
            {f === "pending" ? `Pending (${pendingCount})` : f === "all" ? `All (${duties.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">Loading…</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "700px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Staff</th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Description</th>
                <th className="text-left px-3 py-2.5">Arrive by</th>
                <th className="text-center px-3 py-2.5">By</th>
                <th className="text-center px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d: OutsideDuty) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium">{staffNameMap.get(d.bio_user_id) ?? d.bio_user_id}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(d.duty_date)}</td>
                  <td className="px-3 py-2.5 max-w-[200px] truncate">{d.description}</td>
                  <td className="px-3 py-2.5 text-ink-dim font-mono text-xs">
                    {d.expected_arrival ? d.expected_arrival.slice(0, 5) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${d.initiated_by === "admin" ? "bg-info/10 text-info" : "bg-canvas text-ink-dim"}`}>
                      {d.initiated_by}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${DUTY_STATUS_STYLE[d.status]}`}>
                        {d.status}
                      </span>
                      {d.admin_note && <p className="text-[10px] text-ink-dim mt-0.5">{d.admin_note}</p>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {d.status === "pending" && (
                      <div className="flex items-center gap-1 justify-end">
                        <input type="text" placeholder="note (opt.)"
                          value={noteMap[d.id] ?? ""}
                          onChange={e => setNoteMap(m => ({ ...m, [d.id]: e.target.value }))}
                          className="border border-line rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-gold" />
                        <button onClick={() => decide.mutate({ id: d.id, status: "approved", admin_note: noteMap[d.id] })}
                          disabled={decide.isPending}
                          className="text-xs bg-ok text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-40">Approve</button>
                        <button onClick={() => decide.mutate({ id: d.id, status: "rejected", admin_note: noteMap[d.id] })}
                          disabled={decide.isPending}
                          className="text-xs bg-err text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-40">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">No outside duty records</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Leaves tab ───────────────────────────────────────────────────────────────
const LEAVE_TYPE_LABELS: Record<string, string> = { casual: "Casual", sick: "Sick", half_day: "Half Day" };
const LEAVE_STATUS_STYLE: Record<string, string> = {
  pending:  "bg-warn/10 text-warn",
  approved: "bg-ok/10 text-ok",
  rejected: "bg-err/10 text-err",
};

function LeavesTab({ isAdmin, myBioUserId, myName }: {
  isAdmin: boolean;
  myBioUserId: string | null;
  myName: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: allRequests = [], isLoading, error: listError } = useAllLeaveRequests();
  const submitLeave   = useSubmitLeaveRequest();
  const decideLeave   = useDecideLeaveRequest();
  const deleteLeave   = useDeleteLeaveRequest();

  const [filter, setFilter]   = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leave_date: today, leave_type: "casual", reason: "" });

  // All users see all requests; admin can filter, staff see all by default
  const displayed = allRequests.filter(r => filter === "all" || r.status === filter);
  const pendingCount = allRequests.filter(r => r.status === "pending").length;

  async function handleSubmit() {
    if (!myBioUserId || !form.leave_date) return;
    await submitLeave.mutateAsync({
      bio_user_id: myBioUserId,
      leave_date: form.leave_date,
      leave_type: form.leave_type,
      reason: form.reason || undefined,
      staff_name: myName,
    });
    setShowForm(false);
    setForm({ leave_date: today, leave_type: "casual", reason: "" });
  }

  return (
    <div className="space-y-4">
      {/* Staff: request leave button + form */}
      {!isAdmin && myBioUserId && (
        <div>
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
              + Request Leave
            </button>
          ) : (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="font-semibold text-sm">Request Leave</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date *</label>
                  <input type="date" value={form.leave_date} min={today}
                    onChange={e => setForm(f => ({ ...f, leave_date: e.target.value }))}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Type</label>
                  <select value={form.leave_type}
                    onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
                    className={inp}>
                    <option value="casual">Casual</option>
                    <option value="sick">Sick</option>
                    <option value="half_day">Half Day</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Reason (optional)</label>
                  <input value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="e.g. family function"
                    className={inp} />
                </div>
              </div>
              {submitLeave.isError && (
                <p className="text-xs text-err">{(submitLeave.error as any)?.message}</p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={submitLeave.isPending || !form.leave_date}
                  onClick={handleSubmit}
                  className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-50">
                  {submitLeave.isPending ? "Submitting…" : "Submit Request"}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="border border-line text-sm px-4 py-2 rounded-lg2">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter bar — all users */}
      <div className="flex rounded-lg overflow-hidden border border-line text-xs w-fit">
        {(["all","pending","approved","rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas"}`}>
            {f === "pending" ? `Pending (${pendingCount})` : f === "all" ? `All (${allRequests.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {listError && (
        <p className="text-xs text-err bg-err/5 border border-err/20 rounded-lg px-3 py-2">
          Could not load leave requests. Make sure migrations 033 and 034 are run in Supabase SQL Editor.
        </p>
      )}

      {/* Leave list — all users see all rows */}
      {isLoading ? <p className="text-ink-dim text-sm">Loading…</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "680px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Staff</th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Reason</th>
                <th className="text-center px-3 py-2.5">Status</th>
                {isAdmin && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {displayed.map((r: LeaveRequest) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium">
                    {(r as any).staff?.name ?? r.bio_user_id}
                    {r.bio_user_id === myBioUserId && (
                      <span className="ml-1.5 text-[10px] text-gold font-semibold">(you)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(r.leave_date)}</td>
                  <td className="px-3 py-2.5">{LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type}</td>
                  <td className="px-3 py-2.5 text-ink-dim max-w-[180px] truncate">{r.reason || "—"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LEAVE_STATUS_STYLE[r.status]}`}>
                      {r.status}
                    </span>
                    {r.admin_note && (
                      <p className="text-[10px] text-ink-dim mt-0.5">{r.admin_note}</p>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5 text-right">
                      {r.status === "pending" && (
                        <div className="flex items-center gap-1 justify-end">
                          <input type="text" placeholder="note (opt.)"
                            value={noteMap[r.id] ?? ""}
                            onChange={e => setNoteMap(m => ({ ...m, [r.id]: e.target.value }))}
                            className="border border-line rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-gold" />
                          <button
                            onClick={() => decideLeave.mutate({ id: r.id, bio_user_id: r.bio_user_id, leave_date: r.leave_date, leave_type: r.leave_type, status: "approved", admin_note: noteMap[r.id] })}
                            disabled={decideLeave.isPending}
                            className="text-xs bg-ok text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-40">
                            Approve
                          </button>
                          <button
                            onClick={() => decideLeave.mutate({ id: r.id, bio_user_id: r.bio_user_id, leave_date: r.leave_date, leave_type: r.leave_type, status: "rejected", admin_note: noteMap[r.id] })}
                            disabled={decideLeave.isPending}
                            className="text-xs bg-err text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-40">
                            Reject
                          </button>
                        </div>
                      )}
                      {r.status !== "pending" && r.admin_note && (
                        <span className="text-xs text-ink-dim">{r.admin_note}</span>
                      )}
                      <button
                        onClick={() => { if (confirm("Delete this leave request permanently?")) deleteLeave.mutate(r.id); }}
                        disabled={deleteLeave.isPending}
                        className="mt-1 text-[11px] text-err hover:underline disabled:opacity-40">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!displayed.length && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-ink-dim">
                    No leave requests
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Chat tab ─────────────────────────────────────────────────────────────────
function fmtChatTime(ts: string) {
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

function ChatTab({ isAdmin, adminName }: { isAdmin: boolean; adminName: string }) {
  const profile     = useAuth((s) => s.profile);
  const [msgs, setMsgs]       = useState<ChatMsg[]>([]);
  const [input, setInput]     = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText]   = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const client = supabase();
    client.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setMsgs((data ?? []) as ChatMsg[]));
    const ch = client.channel("attendance_chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (p) => {
        if (p.eventType === "INSERT")      setMsgs((prev) => [...prev, p.new as ChatMsg]);
        else if (p.eventType === "UPDATE") setMsgs((prev) => prev.map((m) => m.id === p.new.id ? p.new as ChatMsg : m));
        else if (p.eventType === "DELETE") setMsgs((prev) => prev.filter((m) => m.id !== (p.old as any).id));
      }).subscribe();
    return () => { client.removeChannel(ch); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    if (!input.trim() || !profile) return;
    setSending(true);
    const { data: { user } } = await supabase().auth.getUser();
    if (user) await supabase().from("chat_messages").insert({ sender_id: user.id, sender_name: profile.display_name, message: input.trim() });
    setInput("");
    setSending(false);
  }
  async function toggleHide(id: string, cur: boolean) { await supabase().from("chat_messages").update({ is_deleted: !cur }).eq("id", id); }
  async function hardDelete(id: string) { if (!confirm("Permanently delete?")) return; await supabase().from("chat_messages").delete().eq("id", id); }
  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await supabase().from("chat_messages").update({ message: editText.trim(), edited_at: new Date().toISOString() }).eq("id", id);
    setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-3" style={{ height: "65vh" }}>
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-line shadow-soft p-3 space-y-1 min-h-0">
        {msgs.length === 0 && <p className="text-center text-ink-dim text-sm py-8">No messages yet. Say hi!</p>}
        {msgs.map((m) => {
          const isOwn = m.sender_name === (profile?.display_name ?? "");
          return (
            <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}>
              <div className={`max-w-[75%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                {!isOwn && <span className="text-[10px] font-semibold text-gold px-1 mb-0.5">{m.sender_name}</span>}
                <div className={`rounded-2xl px-3 py-2 text-sm ${
                  m.is_deleted ? "bg-canvas border border-line text-ink-dim italic text-xs"
                  : isOwn ? "bg-gold text-white"
                  : "bg-canvas border border-line text-ink"
                }`}>
                  {editingId === m.id ? (
                    <div className="flex gap-2 items-center min-w-[200px]">
                      <input value={editText} onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m.id); if (e.key === "Escape") setEditingId(null); }}
                        className="flex-1 bg-white border border-line rounded px-2 py-0.5 text-xs text-ink focus:outline-none" autoFocus />
                      <button onClick={() => saveEdit(m.id)} className="text-xs text-ok font-semibold">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-ink-dim">✕</button>
                    </div>
                  ) : m.is_deleted ? "This message was deleted" : (
                    <span className="whitespace-pre-wrap">{m.message}</span>
                  )}
                </div>
                <div className={`flex items-center gap-2 mt-0.5 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                  <span className="text-[10px] text-ink-dim">{fmtChatTime(m.created_at)}</span>
                  {m.edited_at && !m.is_deleted && <span className="text-[10px] text-ink-dim">(edited)</span>}
                  {isAdmin && !m.is_deleted && (
                    <button onClick={() => { setEditingId(m.id); setEditText(m.message); }} className="text-[10px] text-info hover:underline">Edit</button>
                  )}
                  {isAdmin && (
                    <button onClick={() => toggleHide(m.id, m.is_deleted)} className="text-[10px] text-warn hover:underline">
                      {m.is_deleted ? "Restore" : "Hide"}
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => hardDelete(m.id)} className="text-[10px] text-err hover:underline">Remove</button>
                  )}
                  {!isAdmin && isOwn && !m.is_deleted && (
                    <button onClick={() => { setEditingId(m.id); setEditText(m.message); }} className="text-[10px] text-info hover:underline">Edit</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0">
        <div className="flex gap-2 bg-white border border-line rounded-xl px-3 py-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…"
            className="flex-1 text-sm focus:outline-none" />
          <button onClick={send} disabled={sending || !input.trim()}
            className="bg-gold text-white px-4 py-1.5 rounded-lg2 text-sm font-medium disabled:opacity-40">Send</button>
        </div>
      </div>
    </div>
  );
}

// ── Announcements tab (admin) ─────────────────────────────────────────────────
const ann_inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function AnnouncementsTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", body: "", expires_at: "" });
  const [err, setErr]   = useState("");

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["announcements_att"],
    queryFn: async () => {
      const { data, error } = await supabase().from("announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      const { error } = await supabase().from("announcements").insert({ title: form.title.trim(), body: form.body.trim() || null, expires_at: form.expires_at || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements_att"] }); qc.invalidateQueries({ queryKey: ["announcements_staff"] }); setForm({ title: "", body: "", expires_at: "" }); setErr(""); },
    onError: (e: any) => setErr(e?.message ?? "Failed."),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => { const { error } = await supabase().from("announcements").update({ is_active: value }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements_att"] }); qc.invalidateQueries({ queryKey: ["announcements_staff"] }); },
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase().from("announcements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements_att"] }); qc.invalidateQueries({ queryKey: ["announcements_staff"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
        <p className="text-sm font-semibold">New Announcement</p>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Title — Tamil, English, or both" className={ann_inp} />
        <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          placeholder="Full message (optional)…" rows={3} className={`${ann_inp} resize-none`} />
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-ink-dim block mb-1">Expires on (optional)</label>
            <input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
          <button onClick={() => create.mutate()} disabled={create.isPending || !form.title.trim()}
            className="bg-gold text-white px-5 py-2 rounded-lg2 text-sm font-medium disabled:opacity-40">
            {create.isPending ? "Posting…" : "Post"}
          </button>
        </div>
        {err && <p className="text-xs text-err">{err}</p>}
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">Loading…</p> : list.length === 0 ? (
        <p className="text-ink-dim text-sm text-center py-4">No announcements yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((a: any) => {
            const expired = a.expires_at ? a.expires_at < new Date().toISOString().slice(0, 10) : false;
            return (
              <div key={a.id} className={`bg-white rounded-xl border border-line shadow-soft p-4 flex items-start gap-3 ${(!a.is_active || expired) ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{a.title}</p>
                  {a.body && <p className="text-xs text-ink-dim mt-1 whitespace-pre-wrap">{a.body}</p>}
                  <p className="text-[10px] text-ink-dim mt-1">
                    {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {a.expires_at && ` · Expires ${a.expires_at}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 items-center">
                  <button onClick={() => toggle.mutate({ id: a.id, value: !a.is_active })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${a.is_active && !expired ? "bg-ok/10 border-ok/30 text-ok" : "border-line text-ink-dim hover:border-gold hover:text-gold"}`}>
                    {a.is_active && !expired ? "Active" : expired ? "Expired" : "Inactive"}
                  </button>
                  <button onClick={() => { if (confirm("Delete?")) del.mutate(a.id); }}
                    className="text-xs text-err hover:underline">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Kiosk sequence configuration (admin only, unlocked) ─────────────────────
function KioskConfig() {
  const { data: currentSeq = [], isLoading } = useKioskSequence();
  const saveSeq = useSaveKioskSequence();
  const { data: staff = [] } = useStaff();
  const lock = useKiosk((s) => s.lock);
  const { data: savedSecret } = useKioskSecret();
  const saveSecret = useSaveKioskSecret();

  const activeStaff = staff.filter((s) => s.active);
  const [editing, setEditing] = useState(false);
  const [steps, setSteps] = useState<KioskTap[]>([
    { bio_user_id: "", action: "in" },
    { bio_user_id: "", action: "out" },
    { bio_user_id: "", action: "in" },
    { bio_user_id: "", action: "out" },
  ]);

  const [editingSecret, setEditingSecret] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (currentSeq.length === 4) setSteps(currentSeq);
  }, [currentSeq]);

  async function handleSave() {
    if (steps.some((s) => !s.bio_user_id)) return;
    await saveSeq.mutateAsync(steps);
    setEditing(false);
    lock();
  }

  async function handleClear() {
    if (!confirm("Clear kiosk sequence? The app will stop locking on startup.")) return;
    await saveSeq.mutateAsync([]);
    setEditing(false);
  }

  if (isLoading) return null;
  const isConfigured = currentSeq.length === 4;

  return (
    <div className="bg-white rounded-xl border border-line shadow-soft p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">Kiosk Lock</p>
          <p className="text-xs text-ink-dim mt-0.5">
            {isConfigured
              ? "Sequence active — app locks on startup, unlocks by tap sequence"
              : "No sequence set — app starts unlocked"}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setEditing((v) => !v)} className="text-xs text-gold hover:underline">
            {editing ? "Cancel" : isConfigured ? "Change" : "Set up"}
          </button>
          {isConfigured && !editing && (
            <button onClick={handleClear} className="text-xs text-err hover:underline">Disable</button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-dim">
            Choose 4 taps in order. Tap left side of a row = IN · Tap right side = OUT.
          </p>
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-ink-dim w-12 shrink-0">Step {i + 1}</span>
              <select
                value={step.bio_user_id}
                onChange={(e) => setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, bio_user_id: e.target.value } : s))}
                className={inp + " flex-1"}
              >
                <option value="">— Select staff —</option>
                {activeStaff.map((s) => (
                  <option key={s.bio_user_id} value={s.bio_user_id}>{s.name}</option>
                ))}
              </select>
              <select
                value={step.action}
                onChange={(e) => setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, action: e.target.value as "in" | "out" } : s))}
                className={inp + " w-28"}
              >
                <option value="in">Left (IN)</option>
                <option value="out">Right (OUT)</option>
              </select>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={steps.some((s) => !s.bio_user_id) || saveSeq.isPending}
              className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40"
            >
              {saveSeq.isPending ? "Saving…" : "Save & Lock"}
            </button>
            <button onClick={() => setEditing(false)} className="border border-line text-xs px-3 py-1.5 rounded-lg2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Recovery key */}
      <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink">Recovery Key</p>
          <p className="text-xs text-ink-dim mt-0.5">
            {savedSecret
              ? "Set — triple-tap the lock dots to enter it"
              : "Not set — add one as a backup in case tap sequence fails"}
          </p>
        </div>
        <button
          onClick={() => { setSecretInput(""); setShowSecret(false); setEditingSecret(v => !v); }}
          className="text-xs text-gold hover:underline shrink-0 ml-4"
        >
          {editingSecret ? "Cancel" : savedSecret ? "Change" : "Set"}
        </button>
      </div>

      {editingSecret && (
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showSecret ? "text" : "password"}
              className={inp + " pr-14"}
              placeholder="Enter secret key"
              value={secretInput}
              onChange={e => setSecretInput(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-dim hover:text-ink"
              onClick={() => setShowSecret(v => !v)}
            >
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>
          <button
            disabled={!secretInput.trim() || saveSecret.isPending}
            onClick={async () => {
              await saveSecret.mutateAsync(secretInput.trim());
              setEditingSecret(false);
            }}
            className="bg-gold text-white text-xs px-3 py-2 rounded-lg2 disabled:opacity-40 shrink-0"
          >
            {saveSecret.isPending ? "Saving…" : "Save"}
          </button>
          {savedSecret && (
            <button
              onClick={async () => {
                if (!confirm("Remove the recovery key?")) return;
                await saveSecret.mutateAsync("");
                setEditingSecret(false);
              }}
              className="text-xs text-err hover:underline shrink-0"
            >
              Remove
            </button>
          )}
        </div>
      )}
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
  const { data: lastSyncIso }   = useLastSyncTime();

  const { isLocked: rawLocked, unlock } = useKiosk();
  const profile = useAuth((s) => s.profile);
  const { data: kioskSeq }         = useKioskSequence();
  const { data: myStaffProfile }   = useMyStaffProfile();
  const { data: pendingLeaveCount = 0 } = usePendingLeaveCount();
  const myBioUserId = myStaffProfile?.bio_user_id ?? null;
  const isAdmin = profile?.role !== "staff";
  const { data: notifications = [] } = useAppNotifications(isAdmin ? null : myBioUserId);
  // Effective lock only when a sequence is actually configured
  const isLocked = rawLocked && !!kioskSeq?.length;
  const [tapBuffer, setTapBuffer] = useState<KioskTap[]>([]);

  // Force attendance tab when locked — but not for admin (they see all tabs)
  useEffect(() => { if (isLocked && !isAdmin) setTab("attendance"); }, [isLocked, isAdmin]);

  function handleKioskTap(bio_user_id: string, e: React.MouseEvent<HTMLTableRowElement>) {
    if (!isLocked || !kioskSeq?.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const action: "in" | "out" = e.clientX - rect.left < rect.width * 0.4 ? "in" : "out";
    const step = tapBuffer.length;
    const expected = kioskSeq[step];
    if (expected?.bio_user_id === bio_user_id && expected?.action === action) {
      const next = [...tapBuffer, { bio_user_id, action }];
      if (next.length === kioskSeq.length) {
        unlock();
        setTapBuffer([]);
      } else {
        setTapBuffer(next);
      }
    } else {
      setTapBuffer([]);
    }
  }

  const qc = useQueryClient();
  const { data = [], isLoading, refetch } = useAttendanceByDate(date, activeOnly);
  const { data: leavesByDate = [] }       = useLeavesByDate(date);
  const { data: dailyPerms = [] }         = useApprovedPermsByDate(date);
  const { data: dailyDuties = [] }        = useOutsideDutiesByDate(date);
  const createOutsideDuty                 = useCreateOutsideDuty();
  const { data: shopException }            = useShopExceptionForDate(date);
  const upsertException                    = useUpsertShopException();
  const deleteException                    = useDeleteShopException();
  const [showExcForm, setShowExcForm]     = useState(false);
  const [excTime, setExcTime]             = useState("");
  const [excReason, setExcReason]         = useState("");

  const [assignDutyFor, setAssignDutyFor] = useState<string | null>(null);
  const [dutyForm, setDutyForm]           = useState({ description: "", expected_arrival: "" });

  const approvedDutySet = new Set(
    dailyDuties.filter(d => d.status === "approved").map(d => d.bio_user_id)
  );


  const present    = data.filter((r) => r.present);
  const absent     = data.filter((r) => !r.present);
  const checkedOut = present.filter((r) => r.last_out !== null);

  const lateCount       = present.filter(r => r.is_late).length;
  const overrunCount    = present.filter(r => r.lunch_overrun_minutes > 0).length;
  const shortCount      = present.filter(r => r.short_interval).length;
  const doubleCount     = present.filter(r => r.double_punch_detected).length;

  const { data: allReqs = [] }    = useAllPermissions();
  const { data: allDuties = [] }  = useAllOutsideDuties();
  const pendingReqCount  = allReqs.filter((r: any) => r.status === "pending").length;
  const duties_pending   = allDuties.filter((d: any) => d.status === "pending").length;

  // ── Chat unread count ──────────────────────────────────────────────────────
  const authUserId = profile?.id ?? null;
  const { data: chatUnread = 0, refetch: refetchChatUnread } = useQuery({
    queryKey: ["chat_unread_erp", authUserId],
    enabled: !!authUserId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!authUserId) return 0;
      const client = supabase();
      const { data: receipt } = await client
        .from("chat_read_receipts").select("last_read_at").eq("user_id", authUserId).maybeSingle();
      const lastRead = receipt?.last_read_at ?? "1970-01-01T00:00:00Z";
      const { count } = await client
        .from("chat_messages").select("id", { count: "exact", head: true })
        .gt("created_at", lastRead).neq("sender_id", authUserId).eq("is_deleted", false);
      return count ?? 0;
    },
  });
  useEffect(() => {
    if (tab === "chat" && authUserId) {
      supabase().from("chat_read_receipts")
        .upsert({ user_id: authUserId, last_read_at: new Date().toISOString() }, { onConflict: "user_id" })
        .then(() => refetchChatUnread());
    }
  }, [tab, authUserId]);

  const tabLabels: Record<PageTab, string> = {
    attendance:    "Attendance",
    staff:         "Manage Staff",
    monthly:       "Monthly Report",
    requests:      "Requests",
    leaves:        "Leaves",
    duties:        "Outside Duty",
    chat:          "Staff Chat",
    announcements: "Announcements",
    kyc:           "KYC",
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
        <NotificationBell notifications={notifications} bioUserId={isAdmin ? null : myBioUserId} />
      </div>

      {/* Tabs — hidden in kiosk mode (always visible for admin) */}
      {(!isLocked || isAdmin) && (
        <div className="flex border-b border-line gap-1 flex-wrap">
          {(["attendance", "staff", "monthly", "requests", "leaves", "duties", "chat", ...(isAdmin ? ["announcements", "kyc"] : [])] as PageTab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                tab === t ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
              }`}>
              {tabLabels[t]}
              {t === "requests" && pendingReqCount > 0 && (
                <span className="bg-err text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendingReqCount}</span>
              )}
              {t === "leaves" && pendingLeaveCount > 0 && (
                <span className="bg-warn text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendingLeaveCount}</span>
              )}
              {t === "duties" && duties_pending > 0 && (
                <span className="bg-info text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{duties_pending}</span>
              )}
              {t === "chat" && chatUnread > 0 && (
                <span className="bg-err text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{chatUnread > 9 ? "9+" : chatUnread}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Attendance tab ── */}
      {tab === "attendance" && (
        <>
          {/* Shop late-opening exception — admin only */}
          {isAdmin && (
            <div className="rounded-xl border border-line bg-white shadow-soft px-4 py-3 space-y-2">
              {shopException ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-warn">
                    Shop opened late at {shopException.shop_opens_at.slice(0, 5)} on {shortDate(date)}
                    {shopException.reason ? ` — ${shopException.reason}` : ""}
                  </span>
                  <button
                    onClick={() => {
                      setExcTime(shopException.shop_opens_at.slice(0, 5));
                      setExcReason(shopException.reason ?? "");
                      setShowExcForm(true);
                    }}
                    className="text-xs text-gold hover:underline">Edit</button>
                  <button
                    onClick={() => {
                      if (window.confirm("Remove this late-opening exception?")) {
                        deleteException.mutate(shopException.id);
                      }
                    }}
                    disabled={deleteException.isPending}
                    className="text-xs text-err hover:underline disabled:opacity-40">Remove</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-dim">No late-opening exception for {shortDate(date)}</span>
                  {!showExcForm && (
                    <button
                      onClick={() => { setExcTime(""); setExcReason(""); setShowExcForm(true); }}
                      className="text-xs text-gold border border-gold/40 px-2.5 py-1 rounded-lg2 hover:bg-gold/5">
                      Set Late Opening
                    </button>
                  )}
                </div>
              )}
              {showExcForm && (
                <div className="flex items-end gap-2 flex-wrap pt-1">
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Shop opened at</label>
                    <input type="time" value={excTime} onChange={e => setExcTime(e.target.value)}
                      className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-xs text-ink-dim mb-1">Reason (optional)</label>
                    <input type="text" value={excReason} onChange={e => setExcReason(e.target.value)}
                      placeholder="e.g. Power cut, Festival"
                      className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                  <button
                    disabled={!excTime || upsertException.isPending}
                    onClick={async () => {
                      await upsertException.mutateAsync({ exception_date: date, shop_opens_at: excTime, reason: excReason || undefined });
                      setShowExcForm(false);
                    }}
                    className="bg-gold text-white text-sm px-3 py-1.5 rounded-lg2 hover:bg-gold-dark disabled:opacity-40">
                    Save
                  </button>
                  <button onClick={() => setShowExcForm(false)}
                    className="text-xs text-ink-dim hover:text-ink px-2 py-1.5">Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* Kiosk setup card — admin only, unlocked */}
          {!isLocked && profile?.role === "admin" && <KioskConfig />}

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

          {lastSyncIso && (
            <p className="text-xs text-ink-dim text-center -mt-1">
              Service last ran: <strong>
                {new Date(lastSyncIso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
              </strong>
            </p>
          )}

          {/* Who's on leave today — visible to all including kiosk */}
          {leavesByDate.length > 0 && (
            <div className="bg-warn/5 border border-warn/20 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-warn mb-2">On Leave — {shortDate(date)}</p>
              <div className="flex flex-wrap gap-2">
                {(leavesByDate as any[]).map((l: any) => (
                  <div key={l.bio_user_id + l.leave_type} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                    l.status === "approved"
                      ? "bg-warn/10 border-warn/30 text-warn"
                      : "bg-canvas border-line text-ink-dim"
                  }`}>
                    <span className="font-medium">{l.staff?.name ?? l.bio_user_id}</span>
                    <span className="opacity-60">{LEAVE_TYPE_LABELS[l.leave_type] ?? l.leave_type}</span>
                    {l.status === "pending" && (
                      <span className="text-[9px] bg-warn/20 text-warn px-1 rounded font-semibold">pending</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              <p className="font-medium">No staff records found</p>
              <p className="text-xs mt-1">Run migrations 025–029 in Supabase, then sync the device.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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
                      <tr
                        className={`border-b border-line last:border-0 ${r.present ? "hover:bg-canvas/50" : "opacity-50 hover:opacity-70"} ${isLocked ? "cursor-pointer select-none" : ""}`}
                        onClick={isLocked ? (e) => handleKioskTap(r.bio_user_id, e) : undefined}
                      >
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
                            {r.is_late && (() => {
                              const hasPerm = dailyPerms.some(p => p.bio_user_id === r.bio_user_id);
                              const hasDuty = approvedDutySet.has(r.bio_user_id);
                              return hasPerm
                                ? <span className="text-[9px] font-semibold text-ok leading-none">Permission</span>
                                : hasDuty
                                  ? <span className="text-[9px] font-semibold text-info leading-none">Outside Duty</span>
                                  : <span className="text-[9px] font-semibold text-warn leading-none">Late</span>;
                            })()}
                            {isAdmin && r.is_late && !approvedDutySet.has(r.bio_user_id) && !dailyPerms.some(p => p.bio_user_id === r.bio_user_id) && (
                              <button
                                onClick={() => { setAssignDutyFor(r.bio_user_id); setDutyForm({ description: "", expected_arrival: "" }); }}
                                className="text-[9px] text-info hover:underline leading-none mt-0.5">
                                + assign duty
                              </button>
                            )}
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

                      {isAdmin && assignDutyFor === r.bio_user_id && (
                        <tr className="border-b border-line bg-info/5">
                          <td colSpan={9} className="px-6 py-3">
                            <div className="flex flex-wrap items-end gap-3">
                              <div className="flex-1 min-w-[220px]">
                                <label className="text-xs text-ink-dim block mb-1">What was the outside duty? *</label>
                                <input
                                  type="text"
                                  placeholder="e.g. Bank deposit, Supplier pickup…"
                                  value={dutyForm.description}
                                  onChange={e => setDutyForm(f => ({ ...f, description: e.target.value }))}
                                  className={inp + " w-full"} />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Expected arrival (opt.)</label>
                                <input
                                  type="time"
                                  value={dutyForm.expected_arrival}
                                  onChange={e => setDutyForm(f => ({ ...f, expected_arrival: e.target.value }))}
                                  className={inp} />
                              </div>
                              <div className="flex gap-2 pb-0.5">
                                <button
                                  disabled={!dutyForm.description.trim() || createOutsideDuty.isPending}
                                  onClick={async () => {
                                    await createOutsideDuty.mutateAsync({
                                      bio_user_id: r.bio_user_id,
                                      duty_date: date,
                                      description: dutyForm.description.trim(),
                                      expected_arrival: dutyForm.expected_arrival || undefined,
                                      initiated_by: "admin",
                                      status: "approved",
                                    });
                                    setAssignDutyFor(null);
                                  }}
                                  className="text-xs bg-info text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                                  {createOutsideDuty.isPending ? "Saving…" : "Assign & Approve"}
                                </button>
                                <button onClick={() => setAssignDutyFor(null)}
                                  className="text-xs border border-line px-3 py-1.5 rounded-lg2 text-ink-dim">Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

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

          {/* Kiosk unlock progress dots — subtle indicator visible only to admin */}
          {isLocked && kioskSeq && kioskSeq.length > 0 && (
            <div className="fixed bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-50">
              {kioskSeq.map((_, i) => (
                <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i < tapBuffer.length ? "bg-gold/70" : "bg-line"
                }`} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Staff tab ── */}
      {tab === "staff" && (
        <div>
          <StaffTab />
          <StaffAdvancesSection />
        </div>
      )}

      {/* ── Monthly report tab ── */}
      {tab === "monthly" && <MonthlyTab />}

      {/* ── Requests tab ── */}
      {tab === "requests" && <RequestsTab />}

      {/* ── Leaves tab ── */}
      {tab === "leaves" && (
        <LeavesTab
          isAdmin={isAdmin}
          myBioUserId={myBioUserId}
          myName={myStaffProfile?.name ?? "Staff"}
        />
      )}

      {/* ── Chat tab ── */}
      {tab === "chat" && (
        <ChatTab isAdmin={isAdmin} adminName={profile?.display_name ?? ""} />
      )}

      {/* ── Outside Duties tab ── */}
      {tab === "duties" && <DutiesTab />}

      {/* ── Announcements tab (admin only) ── */}
      {tab === "announcements" && isAdmin && <AnnouncementsTab />}

      {/* ── KYC tab (admin only) ── */}
      {tab === "kyc" && isAdmin && <KycTab />}
    </div>
  );
}

// ── KYC Review Tab ───────────────────────────────────────────────────────────
function KycTab() {
  const { data: records = [], isLoading } = useAllKyc();
  const verify = useVerifyKyc();
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "verified" | "rejected">("pending");

  const filtered = records.filter(r => filter === "all" || r.status === filter);
  const pendingCount = records.filter(r => r.status === "pending").length;

  const STATUS_STYLE: Record<string, string> = {
    pending:  "bg-warn/10 text-warn",
    verified: "bg-ok/10 text-ok",
    rejected: "bg-err/10 text-err",
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex rounded-lg overflow-hidden border border-line text-xs w-fit">
        {(["pending", "verified", "rejected", "all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas"}`}>
            {f === "pending" ? `Pending (${pendingCount})` : f === "all" ? `All (${records.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Selfie preview modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setPreview(null)}>
          <img src={preview} alt="selfie" className="max-w-xs max-h-80 rounded-xl border-4 border-white" />
        </div>
      )}

      {isLoading ? <p className="text-sm text-ink-dim">Loading…</p> : filtered.length === 0 ? (
        <p className="text-sm text-ink-dim">No {filter === "all" ? "" : filter} KYC submissions.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r: StaffKyc) => (
            <div key={r.id} className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
              <div className="flex items-start gap-4 flex-wrap">
                {/* Selfie thumbnail */}
                {r.selfie_data ? (
                  <img src={r.selfie_data} alt="selfie"
                    onClick={() => setPreview(r.selfie_data!)}
                    className="w-20 h-16 object-cover rounded-lg border border-line cursor-pointer hover:opacity-80 flex-shrink-0" />
                ) : (
                  <div className="w-20 h-16 rounded-lg border border-line bg-canvas flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-ink-dim">No photo</span>
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{(r as any).staff?.name ?? r.bio_user_id}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    {r.digilocker_confirmed && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">DigiLocker ✓</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-dim">Aadhaar: xxxx-xxxx-{r.aadhaar_last4}</p>
                  {r.documents_given.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.documents_given.map(k => {
                        const doc = KYC_DOCS.find(d => d.key === k);
                        return doc ? (
                          <span key={k} className="text-[10px] bg-canvas border border-line px-1.5 py-0.5 rounded">{doc.label}</span>
                        ) : null;
                      })}
                    </div>
                  )}
                  {r.admin_note && r.status !== "pending" && (
                    <p className="text-xs text-ink-dim italic">{r.admin_note}</p>
                  )}
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-line">
                  <input type="text" placeholder="Note (optional)"
                    value={noteMap[r.id] ?? ""}
                    onChange={e => setNoteMap(m => ({ ...m, [r.id]: e.target.value }))}
                    className="border border-line rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-gold" />
                  <button onClick={() => verify.mutate({ id: r.id, status: "verified", admin_note: noteMap[r.id] })}
                    disabled={verify.isPending}
                    className="text-xs bg-ok text-white px-3 py-1 rounded hover:opacity-90 disabled:opacity-40">Verify</button>
                  <button onClick={() => verify.mutate({ id: r.id, status: "rejected", admin_note: noteMap[r.id] })}
                    disabled={verify.isPending}
                    className="text-xs bg-err text-white px-3 py-1 rounded hover:opacity-90 disabled:opacity-40">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
