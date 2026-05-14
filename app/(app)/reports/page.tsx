"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import { todayIso } from "@/lib/fy";

function useSalesReport(from: string, to: string) {
  return useQuery({
    queryKey: ["report-sales", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sales")
        .select("*, customers(name)")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .eq("status", "confirmed")
        .order("bill_date");
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

  const totalSales = (sales as any[] ?? []).reduce((s, r) => s + r.total, 0);
  const totalGst = (sales as any[] ?? []).reduce((s, r) => s + (r.gst_amount ?? 0), 0);

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
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Bills</p>
          <p className="text-xl font-bold text-gold">{sales?.length ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">Total Sales</p>
          <p className="text-xl font-bold text-ink">{inr(totalSales)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim">GST Collected</p>
          <p className="text-xl font-bold text-warn">{inr(totalGst)}</p>
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
              <th className="text-right px-3 py-2.5">GST</th>
              <th className="text-right px-3 py-2.5">{t("total")}</th>
            </tr></thead>
            <tbody>
              {(sales as any[])?.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-mono text-info">{s.bill_no}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                  <td className="px-3 py-2.5">{s.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-warn">{inr(s.gst_amount ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(s.total)}</td>
                </tr>
              ))}
              {!sales?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
