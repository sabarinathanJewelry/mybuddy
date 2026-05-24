"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAttendanceByDate } from "@/modules/attendance/api";
import { shortDate } from "@/lib/format";

function formatTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatHours(h: number | null) {
  if (h === null) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function AttendancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [activeOnly, setActiveOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing]     = useState(false);
  const [isVercel, setIsVercel]   = useState(false);
  const [syncMsg, setSyncMsg]     = useState<{ ok: boolean; text: string } | null>(null);

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
      } else {
        setSyncMsg({ ok: false, text: json.error ?? "Sync failed" });
      }
    } catch {
      setSyncMsg({ ok: false, text: "Could not reach the sync API." });
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  // Auto-sync on load
  useEffect(() => { syncFromDevice(); }, [syncFromDevice]);

  const present    = data.filter((r) => r.present);
  const absent     = data.filter((r) => !r.present);
  const checkedOut = present.filter((r) => r.last_out !== null);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-ink">Attendance</h1>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-sm text-ink-dim cursor-pointer select-none">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="accent-gold"
          />
          Active only
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
        />
        {isVercel ? (
          <button
            onClick={() => { refetch(); }}
            disabled={isLoading}
            className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50"
          >
            Refresh
          </button>
        ) : (
          <button
            onClick={syncFromDevice}
            disabled={syncing}
            className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50 flex items-center gap-2"
          >
            {syncing && (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {syncing ? "Syncing…" : "Sync from Device"}
          </button>
        )}
      </div>

      {/* Vercel info banner */}
      {isVercel && (
        <div className="text-xs bg-info/10 text-info px-4 py-2.5 rounded-lg2 leading-relaxed">
          <strong>Running on Vercel</strong> — the cloud server cannot reach your local biometric device.<br />
          To sync fresh data, run this command on the shop PC (same network as the device):<br />
          <code className="bg-white/60 px-1 rounded mt-1 inline-block">node scripts/sync-attendance.js</code>
        </div>
      )}

      {syncMsg && (
        <div className={`text-xs px-4 py-2 rounded-lg2 ${syncMsg.ok ? "bg-ok/10 text-ok" : "bg-err/10 text-err"}`}>
          {syncMsg.text}
        </div>
      )}

      {syncing && data.length === 0 && (
        <p className="text-ink-dim text-sm animate-pulse">Connecting to biometric device…</p>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-ink">{data.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Total Staff</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-ok">{present.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Present</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-info">{checkedOut.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Checked Out</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-err">{absent.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Absent</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : data.length === 0 ? (
        <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
          <p className="font-medium">{syncing ? "Syncing from device…" : "No staff records found"}</p>
          {!syncing && (
            <p className="text-xs mt-2">
              Make sure the sync script is configured with your Supabase URL and key, and the device at{" "}
              <code className="bg-canvas px-1 rounded">192.168.1.101</code> is reachable.
            </p>
          )}
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
                <th className="text-left px-3 py-2.5 hidden lg:table-cell">Phone</th>
                <th className="text-center px-3 py-2.5">Status</th>
                <th className="text-right px-3 py-2.5">IN</th>
                <th className="text-right px-3 py-2.5">OUT</th>
                <th className="text-right px-3 py-2.5">Hours</th>
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
                    <td className="px-3 py-2.5 text-ink-dim hidden lg:table-cell">{r.phone || "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      {r.present ? (
                        r.last_out ? (
                          <span className="text-[10px] font-semibold bg-ok/10 text-ok px-2 py-0.5 rounded-full">Out</span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-info/10 text-info px-2 py-0.5 rounded-full">In</span>
                        )
                      ) : (
                        <span className="text-[10px] font-semibold bg-err/10 text-err px-2 py-0.5 rounded-full">Absent</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ok">{formatTime(r.first_in)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{formatTime(r.last_out)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatHours(r.hours_worked)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {r.punches.length > 0 ? (
                        <button
                          onClick={() => setExpanded(expanded === r.bio_user_id ? null : r.bio_user_id)}
                          className="text-xs text-info hover:underline"
                        >
                          {r.punches.length} {r.punches.length === 1 ? "punch" : "punches"}
                        </button>
                      ) : (
                        <span className="text-xs text-ink-dim">—</span>
                      )}
                    </td>
                  </tr>
                  {expanded === r.bio_user_id && (
                    <tr className="border-b border-line bg-canvas/30">
                      <td colSpan={10} className="px-6 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          {r.punches.map((p, pi) => (
                            <span key={pi} className="text-xs bg-white border border-line rounded px-2 py-1 font-mono">
                              {formatTime(p)}
                            </span>
                          ))}
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
        </p>
      )}
    </div>
  );
}
