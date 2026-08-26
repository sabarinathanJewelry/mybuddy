"use client";

import { useState, useMemo } from "react";
import { clsx } from "clsx";
import {
  useCounters, useCounterAssignments, useCounterSupervisor,
  useTodayChecks, useCleanlinessChecks,
  useSaveCounterAssignment, useSaveCounterSupervisor, useSubmitChecks,
  CHECK_SLOTS, getCurrentSlot,
  type Counter, type CleanlinessCheck,
} from "@/modules/counters/api";
import { useStaff, type StaffMember } from "@/modules/attendance/api";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white";

interface Props {
  isAdmin: boolean;
  myBioUserId: string | null;
}

export default function CountersTab({ isAdmin, myBioUserId }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const monthKey = getMonthKey(year, month);
  const today = now.toISOString().slice(0, 10);

  const [subTab, setSubTab] = useState<"today" | "report" | "setup">("today");

  const { data: counters = [] } = useCounters();
  const { data: assignments = [] } = useCounterAssignments(monthKey);
  const { data: supervisor } = useCounterSupervisor(monthKey);
  const { data: staff = [] } = useStaff();
  const { data: todayChecks = [] } = useTodayChecks(today);
  const { data: monthChecks = [] } = useCleanlinessChecks(monthKey);

  const activeStaff = staff.filter((s: StaffMember) => s.active);
  const staffMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of staff) m[s.bio_user_id] = s.name;
    return m;
  }, [staff]);

  const assignMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const a of assignments) m[a.counter_id] = a.bio_user_id;
    return m;
  }, [assignments]);

  const isSupervisor = !!myBioUserId && supervisor?.bio_user_id === myBioUserId;

  const currentSlot = getCurrentSlot();
  const [selectedSlot, setSelectedSlot] = useState<string>(() => currentSlot ?? CHECK_SLOTS[0]);

  // neat state for each counter in the submit form
  const [neatMap, setNeatMap] = useState<Record<number, boolean | null>>({});
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});
  const submitChecks = useSubmitChecks();

  function getCheck(counterId: number, date: string, slot: string, checks: CleanlinessCheck[]) {
    return checks.find(c => c.counter_id === counterId && c.check_date === date && c.check_slot === slot) ?? null;
  }

  async function handleSubmit() {
    if (!myBioUserId) return;
    const rows = counters.map(c => ({
      counter_id: c.id,
      check_date: today,
      check_slot: selectedSlot,
      is_neat: neatMap[c.id] ?? true,
      notes: notesMap[c.id] || undefined,
      checked_by: myBioUserId,
    }));
    await submitChecks.mutateAsync(rows);
    setNeatMap({});
    setNotesMap({});
  }

  // Monthly points per counter (neat check count)
  const monthlyPoints = useMemo(() => {
    const pts: Record<number, { neat: number; total: number }> = {};
    for (const c of counters) pts[c.id] = { neat: 0, total: 0 };
    for (const ch of monthChecks) {
      if (pts[ch.counter_id]) {
        pts[ch.counter_id].total++;
        if (ch.is_neat) pts[ch.counter_id].neat++;
      }
    }
    return pts;
  }, [monthChecks, counters]);

  const rankedCounters = useMemo(() =>
    [...counters].sort((a, b) => (monthlyPoints[b.id]?.neat ?? 0) - (monthlyPoints[a.id]?.neat ?? 0)),
    [counters, monthlyPoints]
  );

  const MEDAL = ["🥇","🥈","🥉",""];

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }}
          className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">‹</button>
        <span className="font-semibold text-ink min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); }}
          className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">›</button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-line">
        {([
          { key: "today",  label: "Today's Checks" },
          { key: "report", label: "Monthly Report" },
          ...(isAdmin ? [{ key: "setup", label: "Setup" }] : []),
        ] as const).map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key as typeof subTab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === t.key ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Today's Checks ── */}
      {subTab === "today" && (
        <div className="space-y-4">
          {/* Supervisor check form */}
          {(isSupervisor || isAdmin) && (
            <div className="bg-white rounded-xl border border-gold/30 shadow-soft p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-ink">Submit Check</p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-ink-dim">Slot:</label>
                  <select value={selectedSlot} onChange={e => setSelectedSlot(e.target.value)}
                    className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white">
                    {CHECK_SLOTS.map(s => (
                      <option key={s} value={s}>{s}{s === currentSlot ? " (current)" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {counters.map(c => {
                  const existing = getCheck(c.id, today, selectedSlot, todayChecks);
                  const staffName = staffMap[assignMap[c.id]] ?? "—";
                  const neat = existing ? existing.is_neat : (neatMap[c.id] ?? null);
                  return (
                    <div key={c.id} className="flex items-center gap-3 flex-wrap border border-line rounded-lg2 px-3 py-2">
                      <div className="flex-1 min-w-[120px]">
                        <p className="text-sm font-medium text-ink">{c.name}</p>
                        <p className="text-xs text-ink-dim">{staffName}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setNeatMap(m => ({ ...m, [c.id]: true }))}
                          className={clsx(
                            "text-xs px-3 py-1.5 rounded-lg2 font-medium transition-colors",
                            (existing ? existing.is_neat : neatMap[c.id] === true)
                              ? "bg-ok text-white"
                              : "border border-line text-ink-dim hover:border-ok hover:text-ok"
                          )}>
                          Neat
                        </button>
                        <button
                          onClick={() => setNeatMap(m => ({ ...m, [c.id]: false }))}
                          className={clsx(
                            "text-xs px-3 py-1.5 rounded-lg2 font-medium transition-colors",
                            (existing ? !existing.is_neat : neatMap[c.id] === false)
                              ? "bg-err text-white"
                              : "border border-line text-ink-dim hover:border-err hover:text-err"
                          )}>
                          Not Neat
                        </button>
                      </div>
                      <input
                        placeholder="note (opt.)"
                        value={existing ? (existing.notes ?? "") : (notesMap[c.id] ?? "")}
                        onChange={e => setNotesMap(m => ({ ...m, [c.id]: e.target.value }))}
                        disabled={!!existing}
                        className="border border-line rounded-lg2 px-2 py-1.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-gold disabled:bg-canvas disabled:text-ink-dim"
                      />
                      {existing && (
                        <span className="text-[10px] text-ink-dim">Saved</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {counters.some(c => !getCheck(c.id, today, selectedSlot, todayChecks)) && (
                <button
                  onClick={handleSubmit}
                  disabled={submitChecks.isPending || Object.keys(neatMap).length === 0}
                  className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-50">
                  {submitChecks.isPending ? "Saving…" : "Save Check"}
                </button>
              )}
              {submitChecks.isError && (
                <p className="text-xs text-err">{(submitChecks.error as Error).message}</p>
              )}
            </div>
          )}

          {/* Today's timeline */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Today — {today}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: "600px" }}>
                <thead>
                  <tr className="border-b border-line text-ink-dim">
                    <th className="text-left px-2 py-2">Slot</th>
                    {counters.map(c => (
                      <th key={c.id} className="text-center px-2 py-2">
                        <div>{c.name}</div>
                        <div className="font-normal text-ink-dim/70">{staffMap[assignMap[c.id]] ?? "—"}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CHECK_SLOTS.map(slot => {
                    const [sh, sm] = slot.split(":").map(Number);
                    const slotMins = sh * 60 + sm;
                    const nowMins  = now.getHours() * 60 + now.getMinutes();
                    const isFuture = slotMins > nowMins;
                    const isCurrent = slot === currentSlot;
                    return (
                      <tr key={slot} className={clsx(
                        "border-b border-line last:border-0",
                        isCurrent ? "bg-gold/5" : ""
                      )}>
                        <td className={clsx("px-2 py-2 font-mono font-semibold",
                          isCurrent ? "text-gold" : isFuture ? "text-ink-dim" : "text-ink")}>
                          {slot}
                          {isCurrent && <span className="ml-1 text-[9px] text-gold font-sans">NOW</span>}
                        </td>
                        {counters.map(c => {
                          const check = getCheck(c.id, today, slot, todayChecks);
                          return (
                            <td key={c.id} className="px-2 py-2 text-center">
                              {isFuture ? (
                                <span className="text-ink-dim/40">—</span>
                              ) : check ? (
                                <span className={clsx(
                                  "inline-block px-2 py-0.5 rounded-full font-semibold",
                                  check.is_neat ? "bg-ok/10 text-ok" : "bg-err/10 text-err"
                                )}>
                                  {check.is_neat ? "✓" : "✗"}
                                </span>
                              ) : (
                                <span className="text-warn text-[10px]">missed</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Monthly Report ── */}
      {subTab === "report" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Leaderboard — {MONTHS[month]} {year}</p>
            <div className="space-y-2">
              {rankedCounters.map((c, idx) => {
                const pts = monthlyPoints[c.id] ?? { neat: 0, total: 0 };
                const pct = pts.total > 0 ? Math.round((pts.neat / pts.total) * 100) : 0;
                const staffName = staffMap[assignMap[c.id]] ?? "—";
                const isTopRank = idx === 0 && pts.neat > 0;
                return (
                  <div key={c.id} className={clsx(
                    "flex items-center gap-3 p-3 rounded-lg2 border",
                    isTopRank ? "border-gold/40 bg-gold/5" : "border-line"
                  )}>
                    <span className="text-lg w-6 text-center">{MEDAL[Math.min(idx, 3)]}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{c.name}</span>
                        <span className="text-xs text-ink-dim">{staffName}</span>
                      </div>
                      <div className="mt-1 h-1.5 bg-canvas rounded-full overflow-hidden w-full max-w-[200px]">
                        <div className="h-full bg-ok rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-ink">{pts.neat} pts</p>
                      <p className="text-[10px] text-ink-dim">{pct}% neat · {pts.total} checks</p>
                    </div>
                  </div>
                );
              })}
              {rankedCounters.every(c => (monthlyPoints[c.id]?.total ?? 0) === 0) && (
                <p className="text-sm text-ink-dim text-center py-4">No checks recorded yet for {MONTHS[month]}.</p>
              )}
            </div>
          </div>

          {/* Day-by-day summary */}
          {monthChecks.length > 0 && (() => {
            const byDate: Record<string, CleanlinessCheck[]> = {};
            for (const ch of monthChecks) {
              (byDate[ch.check_date] ??= []).push(ch);
            }
            return (
              <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-2">
                <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Daily Summary</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: "500px" }}>
                    <thead>
                      <tr className="border-b border-line text-ink-dim">
                        <th className="text-left px-2 py-1.5">Date</th>
                        {counters.map(c => <th key={c.id} className="text-center px-2 py-1.5">{c.name}</th>)}
                        <th className="text-center px-2 py-1.5">Checks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).map(([date, checks]) => (
                        <tr key={date} className="border-b border-line last:border-0">
                          <td className="px-2 py-1.5 font-mono">{date.slice(5)}</td>
                          {counters.map(c => {
                            const dayChecks = checks.filter(ch => ch.counter_id === c.id);
                            const neatCount = dayChecks.filter(ch => ch.is_neat).length;
                            return (
                              <td key={c.id} className="px-2 py-1.5 text-center">
                                {dayChecks.length === 0 ? <span className="text-ink-dim/40">—</span> : (
                                  <span className={neatCount === dayChecks.length ? "text-ok font-semibold" : "text-warn"}>
                                    {neatCount}/{dayChecks.length}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center text-ink-dim">{checks.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Setup (admin only) ── */}
      {subTab === "setup" && isAdmin && (
        <SetupSection
          counters={counters}
          staff={activeStaff}
          staffMap={staffMap}
          assignMap={assignMap}
          supervisor={supervisor?.bio_user_id ?? ""}
          monthKey={monthKey}
        />
      )}
    </div>
  );
}

function SetupSection({ counters, staff, staffMap, assignMap, supervisor, monthKey }: {
  counters: Counter[];
  staff: StaffMember[];
  staffMap: Record<string, string>;
  assignMap: Record<number, string>;
  supervisor: string;
  monthKey: string;
}) {
  const [localAssign, setLocalAssign] = useState<Record<number, string>>(() => ({ ...assignMap }));
  const [localSupervisor, setLocalSupervisor] = useState(supervisor);
  const saveAssignment  = useSaveCounterAssignment();
  const saveSupervisor  = useSaveCounterSupervisor();
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const promises = counters.map(c =>
      saveAssignment.mutateAsync({ counter_id: c.id, bio_user_id: localAssign[c.id] ?? "", month: monthKey })
    );
    if (localSupervisor) {
      promises.push(saveSupervisor.mutateAsync({ bio_user_id: localSupervisor, month: monthKey }) as Promise<void>);
    }
    await Promise.all(promises);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isPending = saveAssignment.isPending || saveSupervisor.isPending;

  return (
    <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-4">
      <p className="text-sm font-semibold text-ink">Counter Setup — {monthKey}</p>

      <div className="space-y-3">
        {counters.map(c => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="text-sm font-medium text-ink w-24">{c.name}</span>
            <select
              value={localAssign[c.id] ?? ""}
              onChange={e => setLocalAssign(m => ({ ...m, [c.id]: e.target.value }))}
              className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white">
              <option value="">— Unassigned —</option>
              {staff.map(s => <option key={s.bio_user_id} value={s.bio_user_id}>{s.name}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="border-t border-line pt-3 flex items-center gap-3">
        <span className="text-sm font-medium text-ink w-24">Supervisor</span>
        <select
          value={localSupervisor}
          onChange={e => setLocalSupervisor(e.target.value)}
          className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white">
          <option value="">— None —</option>
          {staff.map(s => <option key={s.bio_user_id} value={s.bio_user_id}>{s.name}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-50">
          {isPending ? "Saving…" : "Save Assignments"}
        </button>
        {saved && <span className="text-xs text-ok">Saved!</span>}
      </div>
    </div>
  );
}
