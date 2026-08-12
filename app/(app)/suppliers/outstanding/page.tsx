"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useSuppliers } from "@/modules/suppliers/api";
import { inr } from "@/lib/format";

const GOLD_METALS = ["gold_22k", "gold_18k", "gold_24k"];
const SILVER_METALS = ["silver", "silver_pure", "silver_mpr"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fyYears() {
  const cur = new Date();
  const fy = cur.getMonth() >= 3 ? cur.getFullYear() : cur.getFullYear() - 1;
  return [fy - 2, fy - 1, fy, fy + 1].filter(y => y >= 2022);
}

function periodRange(fyYear: number, period: string, monthVal: number): { from: string; to: string } {
  if (period === "fy")  return { from: `${fyYear}-04-01`,     to: `${fyYear + 1}-03-31` };
  if (period === "q1")  return { from: `${fyYear}-04-01`,     to: `${fyYear}-06-30` };
  if (period === "q2")  return { from: `${fyYear}-07-01`,     to: `${fyYear}-09-30` };
  if (period === "q3")  return { from: `${fyYear}-10-01`,     to: `${fyYear}-12-31` };
  if (period === "q4")  return { from: `${fyYear + 1}-01-01`, to: `${fyYear + 1}-03-31` };
  const y  = monthVal <= 3 ? fyYear + 1 : fyYear;
  const mm = String(monthVal).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${new Date(y, monthVal, 0).getDate()}` };
}

function useOutstandingData(toDate: string) {
  return useQuery({
    queryKey: ["supplier-outstanding-v3", toDate],
    enabled: !!toDate,
    queryFn: async () => {
      const client = supabase();
      const [{ data: purchases }, { data: payments }, { data: dispatches }] = await Promise.all([
        client.from("supplier_purchases")
          .select("supplier_id, purchase_date, amount, gross_wt, pure_wt, metal, is_metal_balance, is_return, is_adjustment")
          .lte("purchase_date", toDate),
        client.from("supplier_payments")
          .select("supplier_id, pay_date, amount, metal_wt, mode")
          .lte("pay_date", toDate),
        client.from("metal_dispatches")
          .select("supplier_id, dispatch_date, weight_g, purity_pct, metal")
          .lte("dispatch_date", toDate),
      ]);
      return { purchases: purchases ?? [], payments: payments ?? [], dispatches: dispatches ?? [] };
    },
  });
}

export default function SupplierOutstandingPage() {
  const now = new Date();
  const defaultFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const [fyYear, setFyYear] = useState(defaultFy);
  const [period, setPeriod] = useState("fy");
  const [month, setMonth] = useState(now.getMonth() + 1);

  const range = periodRange(fyYear, period, month);
  const { data: suppliers = [], isLoading: suppLoad } = useSuppliers("", 200);
  const { data: txData, isLoading: txLoad } = useOutstandingData(range.to);

  const rows = useMemo(() => {
    if (!txData) return [];
    const { purchases, payments, dispatches } = txData;

    return suppliers.map(s => {
      // ₹ outstanding (all-time up to period end)
      const allPurch = (purchases as any[]).filter(p => p.supplier_id === s.id && !p.is_return && !p.is_adjustment);
      const allPay   = (payments as any[]).filter(p => p.supplier_id === s.id);
      const outstanding = Number(s.opening_balance || 0)
        + allPurch.reduce((a: number, p: any) => a + Number(p.amount || 0), 0)
        - allPay.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);

      // Period activity
      const periodPurch    = allPurch.filter((p: any) => p.purchase_date >= range.from);
      const periodPay      = allPay.filter((p: any) => p.pay_date >= range.from);
      const periodPurchAmt = periodPurch.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
      const periodPayAmt   = periodPay.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
      const periodGoldG    = periodPurch
        .filter((p: any) => GOLD_METALS.includes(p.metal))
        .reduce((a: number, p: any) => a + Number(p.gross_wt || 0), 0);

      // Gold outstanding: opening + all gold purchases (gross) − gold dispatches − old_gold payments
      // dispatches.metal is stored as "gold" or "silver" (not the full code like "gold_22k")
      const goldPurchG = (purchases as any[])
        .filter(p => p.supplier_id === s.id && !p.is_return && !p.is_adjustment && GOLD_METALS.includes(p.metal))
        .reduce((a: number, p: any) => a + Number(p.gross_wt || 0), 0);
      const goldDispatchG = (dispatches as any[])
        .filter(d => d.supplier_id === s.id && (d.metal ?? "gold").startsWith("gold"))
        .reduce((a: number, d: any) => a + Number(d.weight_g || 0), 0);
      const goldPayG = (payments as any[])
        .filter(p => p.supplier_id === s.id && p.mode === "old_gold" && Number(p.metal_wt || 0) > 0)
        .reduce((a: number, p: any) => a + Number(p.metal_wt || 0), 0);
      const goldBalanceG = Number(s.gold_opening_g || 0) + goldPurchG - goldDispatchG - goldPayG;

      // Silver outstanding: opening + all silver purchases (gross) − silver dispatches − old_silver payments
      const silvPurchG = (purchases as any[])
        .filter(p => p.supplier_id === s.id && !p.is_return && !p.is_adjustment && SILVER_METALS.includes(p.metal))
        .reduce((a: number, p: any) => a + Number(p.gross_wt || 0), 0);
      const silvDispatchG = (dispatches as any[])
        .filter(d => d.supplier_id === s.id && (d.metal ?? "").startsWith("silver"))
        .reduce((a: number, d: any) => a + Number(d.weight_g || 0), 0);
      const silvPayG = (payments as any[])
        .filter(p => p.supplier_id === s.id && p.mode === "old_silver" && Number(p.metal_wt || 0) > 0)
        .reduce((a: number, p: any) => a + Number(p.metal_wt || 0), 0);
      const silvBalanceG = Number(s.silver_opening_g || 0) + silvPurchG - silvDispatchG - silvPayG;

      return { s, periodPurchAmt, periodPayAmt, periodGoldG, outstanding, goldBalanceG, silvBalanceG };
    }).filter(r =>
      // only show rows where we owe them something (positive balance) or cash outstanding exists
      r.outstanding !== 0 || r.goldBalanceG > 0.001 || r.silvBalanceG > 0.001 || r.periodPurchAmt > 0
    );
  }, [txData, suppliers, range.from]);

  const totals = useMemo(() => ({
    purchAmt:    rows.reduce((a, r) => a + r.periodPurchAmt, 0),
    payAmt:      rows.reduce((a, r) => a + r.periodPayAmt, 0),
    goldG:       rows.reduce((a, r) => a + r.periodGoldG, 0),
    goldBal:     rows.reduce((a, r) => a + (r.goldBalanceG > 0 ? r.goldBalanceG : 0), 0),
    silvBal:     rows.reduce((a, r) => a + (r.silvBalanceG > 0 ? r.silvBalanceG : 0), 0),
    outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
  }), [rows]);

  const sorted = [...rows].sort((a, b) => b.outstanding - a.outstanding);
  const isLoading = suppLoad || txLoad;

  const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white";

  function fmtMetal(g: number) {
    if (g < 0.001) return "—";
    return g.toFixed(3) + "g";
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/suppliers" className="text-xs text-ink-dim hover:underline">← Suppliers</Link>
        <h1 className="text-lg font-bold flex-1">Supplier Outstanding</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-dim">FY</span>
          <select value={fyYear} onChange={e => setFyYear(Number(e.target.value))} className={inp}>
            {fyYears().map(y => <option key={y} value={y}>{y}–{String(y + 1).slice(-2)}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { v: "fy",    label: "Full FY" },
            { v: "q1",    label: "Q1 Apr–Jun" },
            { v: "q2",    label: "Q2 Jul–Sep" },
            { v: "q3",    label: "Q3 Oct–Dec" },
            { v: "q4",    label: "Q4 Jan–Mar" },
            { v: "month", label: "Month" },
          ].map(opt => (
            <button key={opt.v} onClick={() => setPeriod(opt.v)}
              className={`px-3 py-1.5 text-xs rounded-lg2 border transition-colors ${period === opt.v ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold hover:text-gold"}`}>
              {opt.label}
            </button>
          ))}
          {period === "month" && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className={inp}>
              {[4,5,6,7,8,9,10,11,12,1,2,3].map(m => (
                <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
              ))}
            </select>
          )}
        </div>
        <span className="text-xs text-ink-dim ml-auto">as of {range.to}</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Period Purchases",    value: inr(totals.purchAmt),                                                      color: "text-ink" },
          { label: "Period Payments",     value: inr(totals.payAmt),                                                         color: "text-ok" },
          { label: "Gold In (period)",    value: totals.goldG.toFixed(3) + "g",                                              color: "text-gold" },
          { label: "Gold Owed (total)",   value: totals.goldBal > 0 ? totals.goldBal.toFixed(3) + "g" : "—",                color: "text-err" },
          { label: "Cash Outstanding",    value: inr(Math.abs(totals.outstanding)) + (totals.outstanding < 0 ? " CR" : ""), color: totals.outstanding > 0 ? "text-err" : "text-ok" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-line shadow-soft px-4 py-3">
            <p className="text-xs text-ink-dim">{c.label}</p>
            <p className={`text-base font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 860 }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Supplier</th>
                <th className="text-right px-3 py-2.5">Purchases (₹)</th>
                <th className="text-right px-3 py-2.5">Gold In (g)</th>
                <th className="text-right px-3 py-2.5">Payments (₹)</th>
                <th className="text-right px-3 py-2.5 text-gold">Gold Owed (g)</th>
                <th className="text-right px-3 py-2.5 text-info">Silver Owed (g)</th>
                <th className="text-right px-4 py-2.5">Cash Outstanding (₹)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ s, periodPurchAmt, periodPayAmt, periodGoldG, outstanding, goldBalanceG, silvBalanceG }) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/suppliers/${s.id}`} className="hover:text-gold hover:underline">{s.name}</Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {periodPurchAmt > 0 ? inr(periodPurchAmt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-gold">
                    {periodGoldG > 0 ? periodGoldG.toFixed(3) + "g" : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-ok">
                    {periodPayAmt > 0 ? inr(periodPayAmt) : "—"}
                  </td>
                  {/* Gold owed — only show if we owe them (positive) */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-err">
                    {fmtMetal(goldBalanceG)}
                  </td>
                  {/* Silver owed — only show if we owe them (positive) */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-info">
                    {fmtMetal(silvBalanceG)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${outstanding > 0 ? "text-err" : outstanding < 0 ? "text-ok" : "text-ink-dim"}`}>
                    {inr(Math.abs(outstanding))}{outstanding < 0 ? " CR" : ""}
                  </td>
                </tr>
              ))}
              {!sorted.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">No outstanding balances</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-canvas border-t-2 border-line text-xs font-semibold">
                <td className="px-4 py-2.5 text-ink-dim">Total</td>
                <td className="px-3 py-2.5 text-right font-mono">{inr(totals.purchAmt)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold">{totals.goldG.toFixed(3)}g</td>
                <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(totals.payAmt)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-err">
                  {totals.goldBal > 0 ? totals.goldBal.toFixed(3) + "g" : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-info">
                  {totals.silvBal > 0 ? totals.silvBal.toFixed(3) + "g" : "—"}
                </td>
                <td className={`px-4 py-2.5 text-right font-mono ${totals.outstanding > 0 ? "text-err" : "text-ok"}`}>
                  {inr(Math.abs(totals.outstanding))}{totals.outstanding < 0 ? " CR" : ""}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 py-2 text-[10px] text-ink-dim border-t border-line">
            Gold/Silver Owed = amounts we still need to give the supplier (positive only — CR balances hidden). Cash Outstanding = all-time running balance as of period end.
          </p>
        </div>
      )}
    </div>
  );
}
