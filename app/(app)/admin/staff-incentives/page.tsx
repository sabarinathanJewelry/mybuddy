"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

type Staff = { id: string; name: string; designation: string; shift: string; monthly_salary: number };
type Incentive = { id: string; staff_id: string; month: string; amount: number; notes: string | null };

const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export default function StaffIncentivesPage() {
  const [month, setMonth] = useState(currentMonth());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Record<string, { amount: string; notes: string }>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = supabase();
    const [staffRes, incRes] = await Promise.all([
      client.from("staff").select("id, name, designation, shift, monthly_salary").eq("active", true).order("name"),
      client.from("staff_incentives").select("*").eq("month", month),
    ]);
    if (staffRes.error) setError(staffRes.error.message);
    else setStaff((staffRes.data ?? []) as Staff[]);
    if (!incRes.error) setIncentives((incRes.data ?? []) as Incentive[]);
    setLoading(false);
  }, [month]);

  useEffect(() => { loadData(); }, [loadData]);

  function incForStaff(staffId: string) {
    return incentives.find((i) => i.staff_id === staffId) ?? null;
  }

  function startEdit(s: Staff) {
    const existing = incForStaff(s.id);
    setEditRow((prev) => ({
      ...prev,
      [s.id]: { amount: existing ? String(existing.amount) : "", notes: existing?.notes ?? "" },
    }));
  }

  function cancelEdit(staffId: string) {
    setEditRow((prev) => { const next = { ...prev }; delete next[staffId]; return next; });
  }

  async function saveIncentive(staffId: string) {
    const row = editRow[staffId];
    if (!row) return;
    const amount = parseFloat(row.amount) || 0;
    setSaving(staffId);
    const client = supabase();
    const existing = incForStaff(staffId);
    let err = null;
    if (amount === 0 && existing) {
      ({ error: err } = await client.from("staff_incentives").delete().eq("id", existing.id));
    } else if (amount > 0 && existing) {
      ({ error: err } = await client.from("staff_incentives").update({ amount, notes: row.notes || null }).eq("id", existing.id));
    } else if (amount > 0) {
      ({ error: err } = await client.from("staff_incentives").insert({ staff_id: staffId, month, amount, notes: row.notes || null }));
    }
    setSaving(null);
    if (err) { setError(err.message); return; }
    cancelEdit(staffId);
    loadData();
  }

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const next = m + dir;
    const newMonth = next < 1
      ? `${y - 1}-12`
      : next > 12
      ? `${y + 1}-01`
      : `${y}-${String(next).padStart(2, "0")}`;
    setMonth(newMonth);
    setEditRow({});
  }

  const totalIncentives = incentives.reduce((s, i) => s + Number(i.amount), 0);
  const staffWithIncentive = incentives.length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/attendance" className="text-xs text-gold hover:underline">← Attendance</Link>
          <h1 className="text-xl font-bold text-ink">Staff Incentives</h1>
          <Link href="/admin/incentive-calc" className="text-xs bg-gold/10 text-gold border border-gold/30 px-3 py-1 rounded-lg2 hover:bg-gold/20">
            ERP Calculator →
          </Link>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => shiftMonth(-1)} className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">◄</button>
        <span className="font-semibold text-ink w-44 text-center">{monthLabel(month)}</span>
        <button onClick={() => shiftMonth(1)} className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">►</button>
        {!loading && (
          <div className="ml-4 flex items-center gap-4 text-sm text-ink-dim">
            <span>{staffWithIncentive} of {staff.length} staff</span>
            {totalIncentives > 0 && (
              <span>Total: <strong className="text-gold">{inr(totalIncentives)}</strong></span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-err/10 text-err text-sm px-4 py-3 rounded-xl">
          {error} — run migration 048 in Supabase SQL Editor if the table is missing.
        </div>
      )}

      {loading ? <p className="text-sm text-ink-dim">Loading…</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Staff</th>
                <th className="text-left px-3 py-2.5">Designation</th>
                <th className="text-right px-3 py-2.5">Monthly Salary</th>
                <th className="text-right px-3 py-2.5">Incentive ({monthLabel(month).split(" ")[0]})</th>
                <th className="text-left px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const inc = incForStaff(s.id);
                const isEditing = !!editRow[s.id];
                return (
                  <tr key={s.id}
                    className={`border-b border-line last:border-0 ${isEditing ? "bg-gold/5" : "hover:bg-canvas/50"}`}>
                    <td className="px-4 py-2.5 font-medium">{s.name}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-dim">
                      {s.designation || (s.shift === "girls" ? "Girls shift" : s.shift === "helper" ? "Helper" : "Boys shift")}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">
                      {s.monthly_salary > 0 ? inr(s.monthly_salary) : "—"}
                    </td>

                    {isEditing ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="number" step="0.01" min="0"
                            value={editRow[s.id].amount}
                            onChange={e => setEditRow(p => ({ ...p, [s.id]: { ...p[s.id], amount: e.target.value } }))}
                            placeholder="0"
                            onFocus={e => e.target.select()}
                            className={`${inp} w-28 text-right`}
                            autoFocus
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editRow[s.id].notes}
                            onChange={e => setEditRow(p => ({ ...p, [s.id]: { ...p[s.id], notes: e.target.value } }))}
                            placeholder="Optional note"
                            className={`${inp} w-full`}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            disabled={saving === s.id}
                            onClick={() => saveIncentive(s.id)}
                            className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50 mr-1">
                            {saving === s.id ? "…" : "Save"}
                          </button>
                          <button onClick={() => cancelEdit(s.id)}
                            className="text-xs border border-line px-3 py-1.5 rounded-lg2">
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className={`px-3 py-2.5 text-right font-mono font-medium ${inc ? "text-ok" : "text-ink-dim"}`}>
                          {inc ? inr(inc.amount) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-dim truncate max-w-[160px]">
                          {inc?.notes || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => startEdit(s)}
                            className="text-xs text-gold hover:underline">
                            {inc ? "Edit" : "Add"}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-dim">
                    No active staff found.
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
