"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { inr } from "@/lib/format";

interface PayEntry {
  id: string; name: string; basicSalary: number;
  noOfLeave: number; extraLeave: number; deduction: number;
  fine?: number; advance: number; incentive: number; arrear: number;
  paid?: boolean; payMode?: "cash" | "bank";
}

function derive(e: PayEntry) {
  const calculated = parseFloat((e.basicSalary - e.deduction - (e.fine ?? 0) - e.advance + e.incentive + e.arrear).toFixed(2));
  return { salary: Math.round(calculated) };
}

function fmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: n % 1 !== 0 ? 2 : 0 });
}

function generatePayslip(e: PayEntry, period: string) {
  const d = derive(e);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Payslip — ${e.name} — ${period}</title>
<style>
body{font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#1a1a1a}
h1{text-align:center;font-size:18px;margin:0;color:#b8860b}
h2{text-align:center;font-size:13px;color:#666;margin:4px 0 20px}
.nm{font-size:16px;font-weight:bold;text-align:center;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
td{padding:7px 10px;border-bottom:1px solid #eee;font-size:13px}
td:last-child{text-align:right}
.ded td{color:#c0392b}.add td{color:#27ae60}
.tot td{border-top:2px solid #b8860b;font-weight:bold;font-size:15px;color:#b8860b}
@media print{body{margin:20px}}
</style></head><body>
<h1>SABARINATHAN JEWELLERY</h1>
<h2>Salary Slip — ${period}</h2>
<p class="nm">${e.name}</p>
<table>
<tr><td>Basic Salary</td><td>${fmt(e.basicSalary)}</td></tr>
${e.noOfLeave > 0 ? `<tr><td style="color:#888;font-size:12px">Leaves taken</td><td style="color:#888;font-size:12px">${e.noOfLeave} day${e.noOfLeave !== 1 ? "s" : ""} (${e.extraLeave} excess)</td></tr>` : ""}
${e.deduction > 0 ? `<tr class="ded"><td>Leave Deduction</td><td>− ${fmt(e.deduction)}</td></tr>` : ""}
${(e.fine ?? 0) > 0 ? `<tr class="ded"><td>Fine</td><td>− ${fmt(e.fine ?? 0)}</td></tr>` : ""}
${e.advance > 0 ? `<tr class="ded"><td>Advance Recovered</td><td>− ${fmt(e.advance)}</td></tr>` : ""}
${e.incentive > 0 ? `<tr class="add"><td>Incentive</td><td>+ ${fmt(e.incentive)}</td></tr>` : ""}
${e.arrear > 0 ? `<tr class="add"><td>Arrear</td><td>+ ${fmt(e.arrear)}</td></tr>` : ""}
<tr class="tot"><td>Net Salary</td><td>${fmt(d.salary)}</td></tr>
</table>
<p style="font-size:11px;color:#aaa;text-align:center;margin-top:24px">
Generated ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
</p>
<script>window.onload=()=>window.print();</script>
</body></html>`;
}

function downloadPayslip(e: PayEntry, period: string) {
  const blob = new Blob([generatePayslip(e, period)], { type: "text/html" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
}

interface SheetWithEntry {
  id: string;
  period: string;
  updated_at: string;
  entry: PayEntry;
}

export default function MyPayslipPage() {
  const profile = useAuth((s) => s.profile);
  const myName  = (profile?.display_name ?? "").trim().toUpperCase();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: sheets = [], isLoading } = useQuery<SheetWithEntry[]>({
    queryKey: ["payroll_sheets_mine", myName],
    enabled: !!myName,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("payroll_sheets")
        .select("id, period, entries, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const result: SheetWithEntry[] = [];
      for (const s of data ?? []) {
        const entry = (s.entries as PayEntry[]).find(
          e => e.name?.toUpperCase() === myName
        );
        if (entry) result.push({ id: s.id, period: s.period, updated_at: s.updated_at, entry });
      }
      return result;
    },
  });

  const active = sheets.find(s => s.id === selectedId) ?? sheets[0] ?? null;

  if (!myName) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center text-ink-dim text-sm">
        Not logged in.
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5 py-6 px-4">
      <h1 className="text-xl font-bold text-ink">My Payslip</h1>

      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : sheets.length === 0 ? (
        <div className="bg-white rounded-xl border border-line shadow-soft px-6 py-12 text-center text-ink-dim text-sm">
          No payslips found yet. Ask your admin to generate and save payroll for your period.
        </div>
      ) : (
        <>
          {/* Period picker */}
          <div className="flex flex-wrap gap-2">
            {sheets.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  (active?.id === s.id)
                    ? "bg-gold text-white border-gold"
                    : "bg-white text-ink-dim border-line hover:border-gold/50"
                }`}
              >
                {s.period}
              </button>
            ))}
          </div>

          {/* Payslip card */}
          {active && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              {/* Header */}
              <div className="bg-gold/10 border-b border-line px-6 py-5 text-center">
                <p className="text-lg font-bold text-gold tracking-wide">SABARINATHAN JEWELLERY</p>
                <p className="text-xs text-ink-dim mt-0.5">Salary Slip — {active.period}</p>
                <p className="text-base font-semibold text-ink mt-2">{active.entry.name}</p>
              </div>

              {/* Line items */}
              <div className="divide-y divide-line">
                <Row label="Basic Salary" value={inr(active.entry.basicSalary)} />

                {active.entry.noOfLeave > 0 && (
                  <Row
                    label={`Leaves taken (${active.entry.noOfLeave} day${active.entry.noOfLeave !== 1 ? "s" : ""}, ${active.entry.extraLeave} excess)`}
                    value=""
                    dim
                  />
                )}
                {active.entry.deduction > 0 && (
                  <Row label="Leave Deduction" value={`− ${inr(active.entry.deduction)}`} red />
                )}
                {(active.entry.fine ?? 0) > 0 && (
                  <Row label="Fine" value={`− ${inr(active.entry.fine ?? 0)}`} red />
                )}
                {active.entry.advance > 0 && (
                  <Row label="Advance Recovered" value={`− ${inr(active.entry.advance)}`} red />
                )}
                {active.entry.incentive > 0 && (
                  <Row label="Incentive" value={`+ ${inr(active.entry.incentive)}`} green />
                )}
                {active.entry.arrear > 0 && (
                  <Row label="Arrear" value={`+ ${inr(active.entry.arrear)}`} green />
                )}

                {/* Net */}
                <div className="px-6 py-4 flex justify-between items-center bg-gold/5">
                  <span className="font-bold text-gold text-base">Net Salary</span>
                  <span className="font-bold text-gold text-xl font-mono">
                    {inr(derive(active.entry).salary)}
                  </span>
                </div>
              </div>

              {/* Payment status */}
              {active.entry.paid && (
                <div className="px-6 py-2.5 bg-ok/5 border-t border-ok/20 text-xs text-ok font-medium text-center">
                  Paid via {active.entry.payMode === "bank" ? "Bank Transfer" : "Cash"}
                </div>
              )}

              {/* Download */}
              <div className="px-6 py-4 border-t border-line flex justify-end">
                <button
                  onClick={() => downloadPayslip(active.entry, active.period)}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 font-medium hover:opacity-90 active:opacity-75 transition-opacity"
                >
                  Download / Print
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, red, green, dim }: {
  label: string; value: string; red?: boolean; green?: boolean; dim?: boolean;
}) {
  return (
    <div className={`px-6 py-3 flex justify-between items-center text-sm ${dim ? "opacity-60" : ""}`}>
      <span className={dim ? "text-ink-dim" : "text-ink"}>{label}</span>
      {value && (
        <span className={`font-mono font-medium ${red ? "text-err" : green ? "text-ok" : "text-ink"}`}>
          {value}
        </span>
      )}
    </div>
  );
}
