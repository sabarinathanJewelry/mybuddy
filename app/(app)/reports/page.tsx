"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { inr, shortDate, grams } from "@/lib/format";
import { todayIso } from "@/lib/fy";

function useSalesReport(from: string, to: string) {
  return useQuery({
    queryKey: ["report-sales", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sales")
        .select("*, customers(name), sale_items(metal, net_wt, line_total)")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .eq("status", "confirmed")
        .order("bill_date");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useExpenseReport(from: string, to: string) {
  return useQuery({
    queryKey: ["report-expenses", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("expenses")
        .select("amount, mode, exp_date")
        .gte("exp_date", from)
        .lte("exp_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ReportsPage() {
  const t = useT();
  const today = todayIso();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const { data: sales, isLoading } = useSalesReport(from, to);
  const { data: expenses = [] } = useExpenseReport(from, to);

  const salesArr = (sales as any[] ?? []);
  const totalSales = salesArr.reduce((s, r) => s + Number(r.total), 0);
  const totalGst   = salesArr.reduce((s, r) => s + (Number(r.gst_amount) || 0), 0);

  const allItems   = salesArr.flatMap((s: any) => s.sale_items ?? []);
  const totalGoldG   = allItems.filter((i: any) => (i.metal ?? "").startsWith("gold")).reduce((s: number, i: any) => s + (Number(i.net_wt) || 0), 0);
  const totalSilverG = allItems.filter((i: any) => i.metal === "silver" || i.metal === "silver_pure").reduce((s: number, i: any) => s + (Number(i.net_wt) || 0), 0);
  const totalMrp     = allItems.filter((i: any) => i.metal === "silver_mpr").reduce((s: number, i: any) => s + (Number(i.line_total) || 0), 0);

  const totalExpenses = (expenses as any[]).reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("reports")}</h1>

      {/* Date range */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-ink-dim">{t("from_date")}</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-ink-dim">{t("to_date")}</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Bills</p>
          <p className="text-xl font-bold text-gold">{salesArr.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Total Sales</p>
          <p className="text-xl font-bold text-ink">{inr(totalSales)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">GST Collected</p>
          <p className="text-xl font-bold text-warn">{inr(totalGst)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Total Expenses</p>
          <p className="text-xl font-bold text-err">{inr(totalExpenses)}</p>
        </div>
      </div>

      {/* Metal weight + MRP summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Gold Sold</p>
          <p className="text-xl font-bold text-gold">{totalGoldG.toFixed(3)} g</p>
          <p className="text-xs text-ink-dim mt-1">Net weight across all bills</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Silver Sold</p>
          <p className="text-xl font-bold text-ink-mid">{totalSilverG.toFixed(3)} g</p>
          <p className="text-xs text-ink-dim mt-1">Net weight across all bills</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">MRP Items Total</p>
          <p className="text-xl font-bold text-info">{inr(totalMrp)}</p>
          <p className="text-xs text-ink-dim mt-1">Silver MPR fixed-price items</p>
        </div>
      </div>

      {/* Sales list */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">{t("bill_no")}</th>
              <th className="text-left px-3 py-2.5">{t("date")}</th>
              <th className="text-left px-3 py-2.5">Customer</th>
              <th className="text-right px-3 py-2.5 text-gold">Gold (g)</th>
              <th className="text-right px-3 py-2.5 text-ink-mid">Silver (g)</th>
              <th className="text-right px-3 py-2.5 text-info">MRP</th>
              <th className="text-right px-3 py-2.5">GST</th>
              <th className="text-right px-3 py-2.5">{t("total")}</th>
            </tr></thead>
            <tbody>
              {salesArr.map((s: any) => {
                const items = s.sale_items ?? [];
                const billGoldG   = items.filter((i: any) => (i.metal ?? "").startsWith("gold")).reduce((acc: number, i: any) => acc + (Number(i.net_wt) || 0), 0);
                const billSilverG = items.filter((i: any) => i.metal === "silver" || i.metal === "silver_pure").reduce((acc: number, i: any) => acc + (Number(i.net_wt) || 0), 0);
                const billMrp     = items.filter((i: any) => i.metal === "silver_mpr").reduce((acc: number, i: any) => acc + (Number(i.line_total) || 0), 0);
                return (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-mono text-info">{s.bill_no}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                    <td className="px-3 py-2.5">{s.customers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gold">{billGoldG > 0 ? grams(billGoldG) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-mid">{billSilverG > 0 ? grams(billSilverG) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-info">{billMrp > 0 ? inr(billMrp) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-warn">{inr(s.gst_amount ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(Number(s.total))}</td>
                  </tr>
                );
              })}
              {!salesArr.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
