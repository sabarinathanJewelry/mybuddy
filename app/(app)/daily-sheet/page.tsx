"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, grams } from "@/lib/format";

function useDaily(date: string) {
  const client = supabase();
  return useQuery({
    queryKey: ["daily-sheet", date],
    queryFn: async () => {
      const [cashRes, bankRes, salesRes, metalRes, walkinRes] = await Promise.all([
        client.from("cash_ledger").select("direction, amount").eq("tx_date", date),
        client.from("bank_ledger").select("direction, amount").eq("tx_date", date),
        client.from("sales").select("id, total, gst_amount, status").eq("bill_date", date).eq("status", "confirmed"),
        client.from("old_metal_intake").select("metal, pure_wt").eq("intake_date", date),
        client.from("walk_in_summaries").select("gold_walkin,silver_walkin,other_walkin,gold_walkout,silver_walkout,other_walkout").eq("summary_date", date),
      ]);

      const cashIn = (cashRes.data ?? []).filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
      const cashOut = (cashRes.data ?? []).filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);
      const bankIn = (bankRes.data ?? []).filter((r) => r.direction === "in").reduce((s, r) => s + r.amount, 0);
      const bankOut = (bankRes.data ?? []).filter((r) => r.direction === "out").reduce((s, r) => s + r.amount, 0);
      const salesTotal = (salesRes.data ?? []).reduce((s, r) => s + r.total, 0);
      const gstTotal = (salesRes.data ?? []).reduce((s, r) => s + (r.gst_amount ?? 0), 0);
      const salesCount = salesRes.data?.length ?? 0;
      const oldGoldG = (metalRes.data ?? []).filter((r) => r.metal?.startsWith("gold")).reduce((s, r) => s + (r.pure_wt ?? 0), 0);
      const oldSilverG = (metalRes.data ?? []).filter((r) => r.metal?.startsWith("silver")).reduce((s, r) => s + (r.pure_wt ?? 0), 0);
      const walkinRow = (walkinRes.data ?? [])[0];
      const walkinInCount = walkinRow
        ? (walkinRow.gold_walkin ?? 0) + (walkinRow.silver_walkin ?? 0) + (walkinRow.other_walkin ?? 0)
        : 0;
      const walkinOutCount = walkinRow
        ? (walkinRow.gold_walkout ?? 0) + (walkinRow.silver_walkout ?? 0) + (walkinRow.other_walkout ?? 0)
        : 0;
      const walkinGoldIn = walkinRow?.gold_walkin ?? 0;
      const walkinSilverIn = walkinRow?.silver_walkin ?? 0;

      return { cashIn, cashOut, bankIn, bankOut, salesTotal, gstTotal, salesCount, oldGoldG, oldSilverG, walkinInCount, walkinOutCount, walkinGoldIn, walkinSilverIn };
    },
  });
}

interface StatCardProps { label: string; value: string; sub?: string; color?: string }
function StatCard({ label, value, sub, color = "text-ink" }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
      <p className="text-xs text-ink-dim mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-ink-dim mt-1">{sub}</p>}
    </div>
  );
}

export default function DailySheetPage() {
  const t = useT();
  const date = useGlobalDate((s) => s.date);
  const { data, isLoading } = useDaily(date);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("daily_sheet")}</h1>
        <span className="text-sm text-ink-dim">{date}</span>
      </div>

      {isLoading ? (
        <p className="text-ink-dim text-sm">{t("loading")}</p>
      ) : data ? (
        <>
          {/* Sales summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label={t("sales_count")} value={String(data.salesCount)} color="text-gold" />
            <StatCard label={t("sales_total")} value={inr(data.salesTotal)} color="text-gold" />
            <StatCard label={t("gst_collected")} value={inr(data.gstTotal)} color="text-warn" />
          </div>

          {/* Cash & Bank */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t("cash_in")} value={inr(data.cashIn)} color="text-ok" />
            <StatCard label={t("cash_out")} value={inr(data.cashOut)} color="text-err" />
            <StatCard label={t("bank_in")} value={inr(data.bankIn)} color="text-ok" />
            <StatCard label={t("bank_out")} value={inr(data.bankOut)} color="text-err" />
          </div>

          {/* Net summary */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("net_cash")}
              value={inr(data.cashIn - data.cashOut)}
              color={data.cashIn - data.cashOut >= 0 ? "text-ok" : "text-err"}
              sub="Cash In − Cash Out"
            />
            <StatCard
              label={t("net_bank")}
              value={inr(data.bankIn - data.bankOut)}
              color={data.bankIn - data.bankOut >= 0 ? "text-ok" : "text-err"}
              sub="Bank In − Bank Out"
            />
          </div>

          {/* Metal */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t("old_gold_g")} value={grams(data.oldGoldG)} color="text-gold" sub="Pure weight received" />
            <StatCard label={t("old_silver_g")} value={grams(data.oldSilverG)} color="text-ink-mid" sub="Pure weight received" />
          </div>

          {/* Walk-ins */}
          {(data.walkinInCount > 0 || data.walkinOutCount > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Walk-ins" value={String(data.walkinInCount)} color="text-ok" />
              <StatCard label="Walk-outs" value={String(data.walkinOutCount)} color="text-err" />
              <StatCard label="Gold Interest" value={String(data.walkinGoldIn)} color="text-gold" />
              <StatCard label="Silver Interest" value={String(data.walkinSilverIn)} color="text-ink-mid" />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
