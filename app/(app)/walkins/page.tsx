"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

export default function WalkinsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();
  const { data: walkins, isLoading } = useQuery({
    queryKey: ["walkins"],
    queryFn: async () => {
      const { data, error } = await supabase().from("walk_ins").select("*").order("sale_date", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sale_date: globalDate, description: "", amount: 0, mode: "cash", notes: "" });

  const save = useMutation({
    mutationFn: async (data: typeof form) => {
      const { data: row, error } = await supabase().from("walk_ins").insert(data).select().single();
      if (error) throw error;
      const { error: ledgerErr } = await supabase().from("cash_ledger").insert({ tx_date: data.sale_date, direction: "in", amount: data.amount, description: `Walk-in: ${data.description}`, ref_type: "walkin", ref_id: row.id });
      if (ledgerErr) console.warn(ledgerErr);
      return row;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["walkins"] }); setShowForm(false); },
  });

  const todayTotal = (walkins as any[] ?? []).filter((w) => w.sale_date === globalDate).reduce((s, w) => s + w.amount, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Walk-in Counter</h1>
          <p className="text-sm text-ink-dim mt-0.5">Today: <strong className="text-gold">{inr(todayTotal)}</strong></p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">+ Add Walk-in</button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
              <input type="date" value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">Description *</label>
              <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("amount")}</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Description</th>
              <th className="text-left px-3 py-2.5">Mode</th>
              <th className="text-right px-3 py-2.5">{t("amount")}</th>
            </tr></thead>
            <tbody>
              {(walkins as any[])?.map((w) => (
                <tr key={w.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(w.sale_date)}</td>
                  <td className="px-3 py-2.5">{w.description}</td>
                  <td className="px-3 py-2.5 capitalize text-ink-dim">{w.mode}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(w.amount)}</td>
                </tr>
              ))}
              {!walkins?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
