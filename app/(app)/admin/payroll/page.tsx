"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { clsx } from "clsx";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PayEntry {
  id: string;          // local uuid
  name: string;
  basicSalary: number;
  noOfLeave: number;
  extraLeave: number;
  advance: number;
  incentive: number;
  arrear: number;
}

// Derived values — never stored, always recomputed
function derive(e: PayEntry) {
  const deduction   = parseFloat((e.basicSalary / 30 * e.extraLeave).toFixed(2));
  const calculated  = parseFloat((e.basicSalary - deduction - e.advance + e.incentive + e.arrear).toFixed(2));
  const salary      = Math.round(calculated);
  return { deduction, calculated, salary };
}

function blankEntry(name = ""): PayEntry {
  return { id: crypto.randomUUID(), name, basicSalary: 0, noOfLeave: 0, extraLeave: 0, advance: 0, incentive: 0, arrear: 0 };
}

// ─── Payslip HTML generator ────────────────────────────────────────────────────
function generatePayslip(entry: PayEntry, period: string, shopName = "SABARINATHAN JEWELLERY") {
  const d = derive(entry);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Payslip — ${entry.name} — ${period}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 480px; margin: 40px auto; color: #1a1a1a; }
  h1 { text-align: center; font-size: 18px; margin: 0; color: #b8860b; }
  h2 { text-align: center; font-size: 13px; color: #666; margin: 4px 0 20px; }
  .name { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
  td:last-child { text-align: right; }
  .section { background: #f9f7f0; font-weight: bold; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: .05em; }
  .deduction td { color: #c0392b; }
  .addition td { color: #27ae60; }
  .total td { border-top: 2px solid #b8860b; font-weight: bold; font-size: 15px; color: #b8860b; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>${shopName}</h1>
<h2>Salary Slip — ${period}</h2>
<p class="name">${entry.name}</p>
<table>
  <tr><td>Basic Salary</td><td>${inrFmt(entry.basicSalary)}</td></tr>
  ${entry.noOfLeave > 0 ? `<tr><td style="color:#888;font-size:12px">  Leave taken</td><td style="color:#888;font-size:12px">${entry.noOfLeave} day${entry.noOfLeave !== 1 ? "s" : ""}</td></tr>` : ""}
  ${entry.extraLeave > 0 ? `<tr class="deduction"><td>  Deduction (${entry.extraLeave} extra leave${entry.extraLeave !== 1 ? "s" : ""})</td><td>− ${inrFmt(d.deduction)}</td></tr>` : ""}
  ${entry.advance > 0 ? `<tr class="deduction"><td>  Advance recovered</td><td>− ${inrFmt(entry.advance)}</td></tr>` : ""}
  ${entry.incentive > 0 ? `<tr class="addition"><td>  Incentive</td><td>+ ${inrFmt(entry.incentive)}</td></tr>` : ""}
  ${entry.arrear > 0 ? `<tr class="addition"><td>  Arrear</td><td>+ ${inrFmt(entry.arrear)}</td></tr>` : ""}
  <tr class="total"><td>Net Salary</td><td>${inrFmt(d.salary)}</td></tr>
</table>
<p style="font-size:11px;color:#aaa;text-align:center;margin-top:24px">Generated ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
<script>window.onload=()=>window.print();</script>
</body>
</html>`;
}
function inrFmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: n % 1 !== 0 ? 2 : 0 });
}

// ─── Inline cell editor ─────────────────────────────────────────────────────────
const cinp = "border border-line rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold text-right w-full";

function NumCell({ value, onChange, highlight }: { value: number; onChange: (v: number) => void; highlight?: boolean }) {
  return (
    <input type="number" value={value || ""} placeholder="0"
      onFocus={e => e.target.select()}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={clsx(cinp, highlight && "bg-gold/5 font-medium")} />
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
  });
  const [entries, setEntries] = useState<PayEntry[]>([]);
  const [savedSheetId, setSavedSheetId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved">("idle");
  const [showIncentivePicker, setShowIncentivePicker] = useState(false);

  // ── Load staff list for initial population
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff_for_payroll"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("staff")
        .select("id, name, monthly_salary")
        .eq("active", true)
        .order("name");
      return (data ?? []) as { id: string; name: string; monthly_salary: number }[];
    },
  });

  // ── Saved payroll sheets
  const { data: savedSheets = [] } = useQuery({
    queryKey: ["payroll_sheets"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("payroll_sheets")
        .select("id, period, created_at, updated_at")
        .order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; created_at: string; updated_at: string }[];
    },
  });

  // ── Saved incentive sheets (for picker)
  const { data: incentiveSheets = [] } = useQuery({
    queryKey: ["incentive_sheets"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("incentive_sheets")
        .select("id, period, updated_at")
        .order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; updated_at: string }[];
    },
  });

  // ── Initialise from staff table
  function initFromStaff() {
    if (staffList.length === 0) return;
    const existing = new Set(entries.map(e => e.name.toLowerCase()));
    const newEntries = staffList
      .filter(s => !existing.has(s.name.toLowerCase()))
      .map(s => ({ ...blankEntry(s.name.toUpperCase()), basicSalary: s.monthly_salary || 0 }));
    setEntries(prev => [...prev, ...newEntries]);
  }

  // ── Load incentive data into table
  async function loadIncentive(sheetId: string) {
    const { data } = await supabase()
      .from("incentive_sheets")
      .select("master_entries, mapper_entries, raw_data, overrides, default_split")
      .eq("id", sheetId)
      .single();
    if (!data) return;

    // Dynamically import the same calc logic (we re-implement a minimal version here)
    // We need to derive per-staff incentive totals from raw_data + overrides
    const rawData = (data as any).raw_data as string;
    const overrides = (data as any).overrides ?? {};
    const defaultSplit = (data as any).default_split ?? 70;

    // Parse ERP rows
    const lines = rawData.split("\n").map((l: string) => l.trimEnd());
    const hi = lines.findIndex((l: string) => /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l));
    if (hi < 0) { setShowIncentivePicker(false); return; }

    const staffInc = new Map<string, number>();

    lines.slice(hi + 1).forEach((line: string, i: number) => {
      const c = line.split("\t");
      const netWt = parseFloat((c[8] ?? "").match(/[\d.]+/)?.[0] ?? "0") || 0;
      if (netWt <= 0) return;

      const ov = overrides[i] ?? {};
      const balance = ov.balanceZero ? 0 : Math.max(0, parseFloat((c[7] ?? "").match(/[-\d.]+/)?.[0] ?? "0") || 0);
      if (balance > 0) return;

      const sp1 = (c[5] ?? "").trim();
      const sp2 = (c[6] ?? "").trim();
      const split = ov.sp1Share ?? defaultSplit;

      // We need to look up rate — use master from saved data
      const masterEntries = (data as any).master_entries ?? [];
      const mapperEntries = (data as any).mapper_entries ?? [];
      const product = (c[1] ?? "").trim().toUpperCase();
      const wastage = parseFloat((c[3] ?? "").match(/[\d.]+/)?.[0] ?? "0") || 0;

      const mapEntry = mapperEntries.find((m: any) => m.erpName?.toUpperCase() === product);
      let incentiveCode = (mapEntry?.incentiveCode ?? product).toUpperCase();
      if (incentiveCode === "92.5-S" && netWt >= 20) incentiveCode = "92.5-L";

      const master = masterEntries.find((m: any) => m.code?.toUpperCase() === incentiveCode);
      if (!master || master.rate <= 0) return;
      const minW = ov.minWastage ?? master.minWastage ?? 0;
      if (wastage < minW) return;

      const total = parseFloat((master.rate * netWt).toFixed(2));
      const sp1Inc = sp2 ? parseFloat((total * split / 100).toFixed(2)) : total;
      const sp2Inc = sp2 ? parseFloat((total * (100 - split) / 100).toFixed(2)) : 0;

      if (sp1) staffInc.set(sp1, (staffInc.get(sp1) ?? 0) + sp1Inc);
      if (sp2) staffInc.set(sp2, (staffInc.get(sp2) ?? 0) + sp2Inc);
    });

    // Round each staff's incentive to nearest integer
    const rounded = new Map([...staffInc.entries()].map(([k, v]) => [k, Math.round(v)]));

    setEntries(prev => prev.map(e => {
      const inc = rounded.get(e.name) ?? rounded.get(e.name.toUpperCase());
      return inc !== undefined ? { ...e, incentive: inc } : e;
    }));
    setShowIncentivePicker(false);
  }

  // ── Save
  const saveSheet = useMutation({
    mutationFn: async () => {
      setSaveStatus("saving");
      const payload = { period, entries, updated_at: new Date().toISOString() };
      const client = supabase();
      if (savedSheetId) {
        const { error } = await client.from("payroll_sheets").update(payload).eq("id", savedSheetId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from("payroll_sheets").insert(payload).select("id").single();
        if (error) throw error;
        setSavedSheetId((data as any).id);
      }
    },
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["payroll_sheets"] });
      setTimeout(() => setSaveStatus("idle"), 2500);
    },
    onError: () => setSaveStatus("idle"),
  });

  // ── Load a saved payroll sheet
  async function loadSheet(id: string) {
    const { data } = await supabase().from("payroll_sheets").select("*").eq("id", id).single();
    if (!data) return;
    const d = data as any;
    setPeriod(d.period);
    setEntries(d.entries ?? []);
    setSavedSheetId(id);
    setSaveStatus("idle");
  }

  const deleteSheet = useMutation({
    mutationFn: async (id: string) => {
      await supabase().from("payroll_sheets").delete().eq("id", id);
      if (savedSheetId === id) { setSavedSheetId(null); setSaveStatus("idle"); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_sheets"] }),
  });

  // ── Entry helpers
  function update(id: string, patch: Partial<PayEntry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }
  function remove(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }
  function addRow() {
    setEntries(prev => [...prev, blankEntry()]);
  }

  // ── Download payslip
  function downloadPayslip(entry: PayEntry) {
    const html = generatePayslip(entry, period);
    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const totals = useMemo(() => {
    return entries.reduce((acc, e) => {
      const d = derive(e);
      return {
        basic:      acc.basic      + e.basicSalary,
        deduction:  acc.deduction  + d.deduction,
        advance:    acc.advance    + e.advance,
        incentive:  acc.incentive  + e.incentive,
        arrear:     acc.arrear     + e.arrear,
        salary:     acc.salary     + d.salary,
      };
    }, { basic: 0, deduction: 0, advance: 0, incentive: 0, arrear: 0, salary: 0 });
  }, [entries]);

  const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/staff-incentives" className="text-xs text-gold hover:underline">← Staff Incentives</Link>
          <h1 className="text-xl font-bold text-ink">Payroll</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={period} onChange={e => setPeriod(e.target.value)}
            placeholder="Period (e.g. May 2026)"
            className={`${inp} w-36`} />
          <button
            disabled={entries.length === 0 || saveStatus === "saving" || !period.trim()}
            onClick={() => saveSheet.mutate()}
            className={clsx("text-sm px-4 py-1.5 rounded-lg2 font-medium disabled:opacity-40", {
              "bg-ok text-white": saveStatus === "saved",
              "bg-gold text-white": saveStatus !== "saved",
            })}>
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : savedSheetId ? "Update" : "Save"}
          </button>
        </div>
      </div>

      {/* Saved sheets */}
      {savedSheets.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Saved Payrolls — click to load</p>
          <div className="flex flex-wrap gap-2">
            {savedSheets.map(s => (
              <div key={s.id} className={clsx("flex items-center gap-1.5 border rounded-lg2 px-3 py-1.5 text-xs", {
                "border-gold/50 bg-gold/5 text-gold font-medium": s.id === savedSheetId,
                "border-line text-ink-dim bg-white hover:border-gold/40": s.id !== savedSheetId,
              })}>
                <button onClick={() => loadSheet(s.id)} className="hover:underline">{s.period}</button>
                <span className="text-ink-dim/40">·</span>
                <span className="text-[10px] text-ink-dim">
                  {new Date(s.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                {s.id !== savedSheetId && (
                  <button onClick={() => { if (confirm(`Delete "${s.period}"?`)) deleteSheet.mutate(s.id); }}
                    className="text-err/50 hover:text-err ml-0.5">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {staffList.length > 0 && (
          <button onClick={initFromStaff}
            className="text-sm border border-line px-4 py-1.5 rounded-lg2 hover:border-gold text-ink-dim">
            + Load Staff
          </button>
        )}
        <button onClick={addRow}
          className="text-sm border border-line px-4 py-1.5 rounded-lg2 hover:border-gold text-ink-dim">
          + Add Row
        </button>
        <button onClick={() => setShowIncentivePicker(true)}
          disabled={incentiveSheets.length === 0}
          className="text-sm bg-info/10 text-info border border-info/30 px-4 py-1.5 rounded-lg2 hover:bg-info/20 disabled:opacity-40">
          ↓ Load Incentive Data
        </button>
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-ink-dim">
            {entries.length} staff · Total Salary: <strong className="text-gold">{inr(totals.salary)}</strong>
          </span>
        )}
      </div>

      {/* Incentive picker modal */}
      {showIncentivePicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-line shadow-soft p-5 w-full max-w-sm space-y-3">
            <h2 className="font-semibold text-sm">Select Incentive Sheet</h2>
            <p className="text-xs text-ink-dim">Staff names in the incentive sheet must match payroll names exactly.</p>
            <div className="space-y-1.5">
              {incentiveSheets.map(s => (
                <button key={s.id} onClick={() => loadIncentive(s.id)}
                  className="w-full flex items-center justify-between border border-line rounded-lg2 px-3 py-2 text-sm hover:border-gold hover:bg-gold/5 text-left">
                  <span className="font-medium">{s.period}</span>
                  <span className="text-xs text-ink-dim">
                    {new Date(s.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowIncentivePicker(false)}
              className="w-full border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim hover:border-err hover:text-err">
              Cancel
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-line px-6 py-12 text-center text-ink-dim text-sm space-y-2">
          <p>No rows yet.</p>
          <p className="text-xs">Click <strong>Load Staff</strong> to pull from staff list, or <strong>Add Row</strong> to enter manually.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-3 py-2.5 sticky left-0 bg-canvas z-10">Name</th>
                <th className="text-right px-2 py-2.5">Leaves</th>
                <th className="text-right px-2 py-2.5">Extra<br/>Leaves</th>
                <th className="text-right px-2 py-2.5">Basic<br/>Salary</th>
                <th className="text-right px-2 py-2.5 text-err">Deduction</th>
                <th className="text-right px-2 py-2.5 text-err">Advance</th>
                <th className="text-right px-2 py-2.5 text-ok">Incentive</th>
                <th className="text-right px-2 py-2.5 text-ok">Arrear</th>
                <th className="text-right px-2 py-2.5">Calculated</th>
                <th className="text-right px-3 py-2.5 text-gold font-bold">Salary</th>
                <th className="px-2 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const d = derive(e);
                return (
                  <tr key={e.id} className="border-b border-line last:border-0 hover:bg-canvas/30">
                    <td className="px-3 py-1.5 sticky left-0 bg-white z-10">
                      <input value={e.name} onChange={ev => update(e.id, { name: ev.target.value.toUpperCase() })}
                        className="border border-line rounded px-2 py-1 text-xs uppercase w-32 focus:outline-none focus:ring-1 focus:ring-gold font-medium" />
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <NumCell value={e.noOfLeave} onChange={v => update(e.id, { noOfLeave: v })} />
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <NumCell value={e.extraLeave} onChange={v => update(e.id, { extraLeave: v })} highlight={e.extraLeave > 0} />
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <NumCell value={e.basicSalary} onChange={v => update(e.id, { basicSalary: v })} />
                    </td>
                    <td className="px-2 py-1.5 text-right text-err font-mono text-xs">
                      {d.deduction > 0 ? inr(d.deduction) : "—"}
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.advance} onChange={v => update(e.id, { advance: v })} highlight={e.advance > 0} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.incentive} onChange={v => update(e.id, { incentive: v })} highlight={e.incentive > 0} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.arrear} onChange={v => update(e.id, { arrear: v })} highlight={e.arrear > 0} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-dim">
                      {inr(d.calculated)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-gold bg-gold/5">
                      {inr(d.salary)}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => downloadPayslip(e)}
                          title="Download payslip"
                          className="text-[10px] text-info border border-info/30 px-2 py-1 rounded hover:bg-info/10 whitespace-nowrap">
                          Payslip
                        </button>
                        <button onClick={() => remove(e.id)}
                          className="text-[10px] text-err/60 hover:text-err px-1">×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="bg-canvas border-t-2 border-line font-semibold text-xs">
                <td className="px-3 py-2.5 sticky left-0 bg-canvas text-ink-dim">TOTAL ({entries.length})</td>
                <td colSpan={2} />
                <td className="px-2 py-2.5 text-right font-mono">{inr(totals.basic)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-err">{totals.deduction > 0 ? inr(totals.deduction) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-err">{totals.advance > 0 ? inr(totals.advance) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-ok">{totals.incentive > 0 ? inr(totals.incentive) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-ok">{totals.arrear > 0 ? inr(totals.arrear) : "—"}</td>
                <td />
                <td className="px-3 py-2.5 text-right font-mono text-gold font-bold bg-gold/5">{inr(totals.salary)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
