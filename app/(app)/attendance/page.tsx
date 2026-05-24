"use client";

import { Fragment, useState } from "react";
import { useAttendanceByDate } from "@/modules/attendance/api";
import { shortDate } from "@/lib/format";

function formatTime(ts: string) {
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data = [], isLoading, refetch, isFetching } = useAttendanceByDate(date);

  const checkedOut = data.filter((r) => r.punches.length >= 2);
  const stillIn = data.filter((r) => r.punches.length === 1);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-ink">Attendance</h1>
        <div className="flex-1" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50"
        >
          {isFetching ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-ok">{data.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Present</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-info">{checkedOut.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Checked Out</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-2xl font-bold text-warn">{stillIn.length}</p>
          <p className="text-xs text-ink-dim mt-0.5">Still In / Missed Punch</p>
        </div>
      </div>

      {/* Attendance table */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-3 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5 hidden sm:table-cell">Dept</th>
                <th className="text-right px-3 py-2.5">IN</th>
                <th className="text-right px-3 py-2.5">OUT</th>
                <th className="text-right px-3 py-2.5">Hours</th>
                <th className="text-center px-3 py-2.5">All Punches</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <Fragment key={r.bio_user_id}>
                  <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{r.name}</td>
                    <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{r.department || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ok">{formatTime(r.first_in)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {r.punches.length >= 2 ? (
                        <span className="text-ink">{formatTime(r.last_out)}</span>
                      ) : (
                        <span className="text-warn">Still in</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatHours(r.hours_worked)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setExpanded(expanded === r.bio_user_id ? null : r.bio_user_id)}
                        className="text-xs text-info hover:underline"
                      >
                        {r.punches.length} {r.punches.length === 1 ? "punch" : "punches"}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.bio_user_id && (
                    <tr className="border-b border-line bg-canvas/30">
                      <td colSpan={7} className="px-6 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          {r.punches.map((p, pi) => (
                            <span
                              key={pi}
                              className="text-xs bg-white border border-line rounded px-2 py-1 font-mono"
                            >
                              {formatTime(p)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-dim">
                    <p className="font-medium">No records for {shortDate(date)}</p>
                    <p className="text-xs mt-1">
                      Run <code className="bg-canvas px-1 rounded">python scripts/sync_attendance.py</code> to pull data from the device.
                    </p>
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
