"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useSuppliers } from "@/modules/suppliers/api";
import { inr } from "@/lib/format";

const GOLD_METALS = ["gold_22k", "gold_18k", "gold_24k"];
const QUARTERS = [
  { label: "Q1 (Apr–Jun)", months: [4, 5, 6] },
  { label: "Q2 (Jul–Sep)", months: [7, 8, 9] },
  { label: "Q3 (Oct–Dec)", months: [10, 11, 12] },
  { label: "Q4 (Jan–Mar)", months: [1, 2, 3] },
];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fyYears() {
  const cur = new Date();
  const fy = cur.getMonth() >= 3 ? cur.getFullYear() : cur.getFullYear() - 1;
  return [fy - 2, fy - 1, fy, fy + 1].filter(y => y >= 2022);
}

function periodRange(fyYear: number, period: string, monthVal: number): { from: string; to: string } {
  if (period === "fy") return { from: `${fyYear}-04-01`, to: `${fyYear + 1}-03-31` };
  if (period === "q1") return { from: `${fyYear}-04-01`, to: `${fyYear}-06-30` };
  if (period === "q2") return { from: `${fyYear}-07-01`, to: `${fyYear}-09-30` };
  if (period === "q3") return { from: `${fyYear}-10-01`, to: `${fyYear}-12-31` };
  if (period === "q4") return { from: `${fyYear + 1}-01-01`, to: `${fyYear + 1}-03-31` };
  // month
  const y = monthVal <= 3 ? fyYear + 1 : fyYear;
  const mm = String(monthVal).padStart(2, "0");
  const lastDay = new Date(y, monthVal, 0).getDate();
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${lastDay}` };
}

function useOutstandingData(toDate: string) {
  return useQuery({
    queryKey: ["supplier-outstanding-data", toDate],
    enabled: !!toDate,
    queryFn: async () => {
      const client = supabase();
      const [{ data: purchases }, { data: payments }] = await Promise.all([
        client.from("supplier_purchases")
          .select("supplier_id, purchase_date, amount, gross_wt, metal")
          .lte("purchase_date", toDate)
          .eq("is_return", false)
          .eq("is_adjustment", false),
        client.from("supplier_payments")
          .select("supplier_id, pay_date, amount")
          .lte("pay_date", toDate),
      ]);
      return { purchases: purchases ?? [], payments: payments ?? [] };
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
    const { purchases, payments } = txData;

    return suppliers.map(s => {
      const allPurch = purchases.filter((p: any) => p.supplier_id === s.id);
      const allPay   = payments.filter((p: any) => p.supplier_id === s.id);
      const periodPurch = allPurch.filter((p: any) => p.purchase_date >= range.from);
      const periodPay   = allPay.filter((p: any) => p.pay_date >= range.from);

      const totalPurchAmt = allPurch.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
      const totalPayAmt   = allPay.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);

      const periodPurchAmt = periodPurch.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
      const periodPayAmt   = periodPay.reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
      const periodGoldG    = periodPurch
        .filter((p: any) => GOLD_METALS.includes(p.metal))
        .reduce((acc: number, p: any) => acc + Number(p.gross_wt || 0), 0);

      const outstanding = Number(s.opening_balance || 0) + totalPurchAmt - totalPayAmt;

      return { s, periodPurchAmt, periodPayAmt, periodGoldG, outstanding };
    }).filter(r => r.outstanding !== 0 || r.periodPurchAmt > 0 || r.periodPayAmt > 0);
  }, [txData, suppliers, range.from]);

  const totals = useMemo(() => ({
    purchAmt:    rows.reduce((a, r) => a + r.periodPurchAmt, 0),
    payAmt:      rows.reduce((a, r) => a + r.periodPayAmt, 0),
    goldG:       rows.reduce((a, r) => a + r.periodGoldG, 0),
    outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
  }), [rows]);

  const sorted = [...rows].sort((a, b) => b.outstanding - a.outstanding);
  const isLoading = suppLoad || txLoad;

  const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white";

  return (
    <div className="max-w-5xl mx-auto space-y-5">
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
            { v: "fy", label: "Full FY" },
            { v: "q1", label: "Q1 Apr–Jun" },
            { v: "q2", label: "Q2 Jul–Sep" },
            { v: "q3", label: "Q3 Oct–Dec" },
            { v: "q4", label: "Q4 Jan–Mar" },
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Period Purchases", value: inr(totals.purchAmt), color: "text-ink" },
          { label: "Period Payments", value: inr(totals.payAmt), color: "text-ok" },
          { label: "Gold Purchased", value: totals.goldG.toFixed(3) + "g", color: "text-gold" },
          { label: "Total Outstanding", value: inr(totals.outstanding), color: totals.outstanding > 0 ? "text-err" : "text-ok" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-line shadow-soft px-4 py-3">
            <p className="text-xs text-ink-dim">{c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 700 }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Supplier</th>
                <th className="text-right px-3 py-2.5">Purchases (₹)</th>
                <th className="text-right px-3 py-2.5">Gold In (g)</th>
                <th className="text-right px-3 py-2.5">Payments (₹)</th>
                <th className="text-right px-4 py-2.5">Outstanding (₹)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ s, periodPurchAmt, periodPayAmt, periodGoldG, outstanding }) => (
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
                  <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${outstanding > 0 ? "text-err" : outstanding < 0 ? "text-ok" : "text-ink-dim"}`}>
                    {inr(Math.abs(outstanding))}{outstanding < 0 ? " CR" : ""}
                  </td>
                </tr>
              ))}
              {!sorted.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">No activity for this period</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-canvas border-t-2 border-line text-xs font-semibold">
                <td className="px-4 py-2.5 text-ink-dim">Total</td>
                <td className="px-3 py-2.5 text-right font-mono">{inr(totals.purchAmt)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-gold">{totals.goldG.toFixed(3)}g</td>
                <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(totals.payAmt)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${totals.outstanding > 0 ? "text-err" : "text-ok"}`}>
                  {inr(Math.abs(totals.outstanding))}{totals.outstanding < 0 ? " CR" : ""}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
