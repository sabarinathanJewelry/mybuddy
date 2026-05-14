"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { grams, shortDate } from "@/lib/format";

function useMetalFlow() {
  const date = useGlobalDate((s) => s.date);
  const client = supabase();
  return useQuery({
    queryKey: ["metal-flow", date],
    queryFn: async () => {
      const [intakeRes, batchRes] = await Promise.all([
        client.from("old_metal_intake").select("*, customers(name)").order("intake_date", { ascending: false }).limit(50),
        client.from("melt_batches").select("*").order("batch_date", { ascending: false }).limit(20),
      ]);
      return { intake: intakeRes.data ?? [], batches: batchRes.data ?? [] };
    },
  });
}

const TABS = ["intake", "batches"] as const;
type MetalTab = (typeof TABS)[number];

export default function MetalFlowPage() {
  const t = useT();
  const { data, isLoading } = useMetalFlow();
  const [tab, setTab] = useState<MetalTab>("intake");

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("metal_flow")}</h1>

      <div className="flex border-b border-line gap-1">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === tb ? "border-gold text-gold" : "border-transparent text-ink-dim"}`}>
            {tb}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="space-y-4">
          {tab === "intake" && <h3 className="text-sm font-semibold text-ink-dim">{t("old_metal_intake")}</h3>}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Gross</th>
                <th className="text-right px-3 py-2.5">Pure Wt</th>
                <th className="text-left px-3 py-2.5">Status</th>
              </tr></thead>
              <tbody>
                {data?.intake.map((r: any) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(r.intake_date)}</td>
                    <td className="px-3 py-2.5">{r.customers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 capitalize text-ink-dim">{r.metal?.replace("_", " ")}</td>
                    <td className="px-3 py-2.5 text-right">{grams(r.gross_wt)}</td>
                    <td className="px-3 py-2.5 text-right text-gold">{grams(r.pure_wt)}</td>
                    <td className="px-3 py-2.5 capitalize">{r.status}</td>
                  </tr>
                ))}
                {!data?.intake.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-ink-dim">{t("melt_batches")}</h3>
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Batch No</th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Input</th>
                <th className="text-right px-3 py-2.5">Output</th>
                <th className="text-left px-3 py-2.5">Status</th>
              </tr></thead>
              <tbody>
                {data?.batches.map((b: any) => (
                  <tr key={b.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-mono text-info">{b.batch_no}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{shortDate(b.batch_date)}</td>
                    <td className="px-3 py-2.5 capitalize">{b.metal?.replace("_", " ")}</td>
                    <td className="px-3 py-2.5 text-right">{grams(b.input_wt)}</td>
                    <td className="px-3 py-2.5 text-right text-ok">{b.output_wt ? grams(b.output_wt) : "—"}</td>
                    <td className="px-3 py-2.5 capitalize text-ink-dim">{b.status}</td>
                  </tr>
                ))}
                {!data?.batches.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
