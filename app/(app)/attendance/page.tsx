"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAttendanceByDate, useStaff, useUpdateStaff, useDeleteStaff,
  type StaffMember,
} from "@/modules/attendance/api";
import { shortDate } from "@/lib/format";

type PageTab = "attendance" | "staff";

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
function formatMins(m: number) {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
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

  const lateCount    = present.filter(r => r.is_late).length;
  const overrunCount = present.filter(r => r.lunch_overrun_minutes > 0).length;
  const shortCount   = present.filter(r => r.short_interval).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
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
        {(["attendance", "staff"] as PageTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === t ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {t === "staff" ? "Manage Staff" : "Attendance"}
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
          {/* Summary cards */}
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

          {/* Issues summary bar */}
          {(lateCount > 0 || overrunCount > 0 || shortCount > 0) && (
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
            </div>
          )}

          {isLoading ? (
            <p className="text-ink-dim text-sm">Loading…</p>
          ) : data.length === 0 ? (
            <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
              <p className="font-medium">{syncing ? "Syncing…" : "No staff records found"}</p>
              {!syncing && <p className="text-xs mt-1">Run migrations 025–028 in Supabase, then sync the device.</p>}
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

                        {/* Status + Late badge */}
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {r.present
                              ? r.last_out
                                ? <span className="text-[10px] font-semibold bg-ok/10 text-ok px-2 py-0.5 rounded-full">Out</span>
                                : <span className="text-[10px] font-semibold bg-info/10 text-info px-2 py-0.5 rounded-full">In</span>
                              : <span className="text-[10px] font-semibold bg-err/10 text-err px-2 py-0.5 rounded-full">Absent</span>
                            }
                            {r.is_late && (
                              <span className="text-[9px] font-semibold text-warn leading-none">Late</span>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-right font-mono text-ok">{formatTime(r.first_in)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{formatTime(r.last_out)}</td>

                        {/* Effective hours + lunch overrun note */}
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-mono">{formatHours(r.effective_hours)}</span>
                          {r.lunch_overrun_minutes > 0 && (
                            <span className="block text-[10px] text-warn font-medium">
                              +{formatMins(r.lunch_overrun_minutes)} lunch
                            </span>
                          )}
                          {r.effective_hours !== null && r.lunch_minutes === null && r.last_out && (
                            <span className="block text-[10px] text-ink-dim">−1h lunch</span>
                          )}
                        </td>

                        {/* Punches + short interval flag */}
                        <td className="px-3 py-2.5 text-center">
                          {r.punches.length > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => setExpanded(expanded === r.bio_user_id ? null : r.bio_user_id)}
                                className="text-xs text-info hover:underline">
                                {r.punches.length} {r.punches.length === 1 ? "punch" : "punches"}
                              </button>
                              {r.short_interval && (
                                <span className="text-[9px] font-semibold text-err leading-none">Short! Verify</span>
                              )}
                              {r.extra_punches && !r.short_interval && (
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
                                  {pi === 0 ? "IN" : pi === r.punches.length - 1 ? "OUT" : pi % 2 === 1 ? "↑ out" : "↓ in"}
                                  {" "}{formatTime(p)}
                                </span>
                              ))}
                              {r.lunch_minutes !== null && (
                                <span className={`text-xs border rounded px-2 py-1 font-medium ${
                                  r.lunch_overrun_minutes > 0
                                    ? "bg-warn/10 border-warn/30 text-warn"
                                    : "bg-ok/10 border-ok/30 text-ok"
                                }`}>
                                  Lunch: {formatMins(r.lunch_minutes)}
                                  {r.lunch_overrun_minutes > 0 && ` (+${formatMins(r.lunch_overrun_minutes)} over)`}
                                </span>
                              )}
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
              {" "}· Boys shift 9:30–21:30 · Girls shift 9:30–20:30 · Grace till 9:50
            </p>
          )}
        </>
      )}

      {/* ── Staff tab ── */}
      {tab === "staff" && <StaffTab />}
    </div>
  );
}
