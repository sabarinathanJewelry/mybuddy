"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import CustomerPicker from "@/modules/customers/customer-picker";
import { useGlobalDate } from "@/stores/global-date";
import { useCustomer } from "@/modules/customers/api";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";

function useWriteoffs(limit = 50) {
  return useQuery({
    queryKey: ["writeoffs", limit],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("scrap_entries")
        .select("*, customers(name)")
        .order("scrap_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSaveWriteoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: row, error } = await supabase().from("scrap_entries").insert(data).select().single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["writeoffs"] });
      qc.invalidateQueries({ queryKey: ["customer-360"] });
    },
  });
}

export default function WriteoffPage() {
  const t = useT();
  const searchParams = useSearchParams();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: writeoffs, isLoading } = useWriteoffs();
  const save = useSaveWriteoff();

  const preselectedId = searchParams.get("customer");
  const { data: preselectedCustomer } = useCustomer(preselectedId);

  const [showForm, setShowForm] = useState(!!preselectedId);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    scrap_date: globalDate, amount: 0, metal: "gold_22k",
    gross_wt: 0, purity_pct: 91.6, pure_wt: 0, rate: 0, notes: "",
  });

  useEffect(() => {
    if (preselectedCustomer) setCustomer(preselectedCustomer);
  }, [preselectedCustomer]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const pure_wt = form.gross_wt * (form.purity_pct / 100);
    await save.mutateAsync({ ...form, customer_id: customer.id, pure_wt });
    setShowForm(false);
    setCustomer(null);
    setForm({ scrap_date: globalDate, amount: 0, metal: "gold_22k", gross_wt: 0, purity_pct: 91.6, pure_wt: 0, rate: 0, notes: "" });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">{t("writeoff")}</h1>
          <p className="text-xs text-ink-dim mt-0.5">Write off unrecoverable customer balances (bad debt)</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-err hover:opacity-90 text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + Write-off
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-err/30 p-5 shadow-soft space-y-4">
          <div className="flex items-center gap-2 text-sm text-err font-medium">
            <span>⚠</span> This action reduces the customer&apos;s balance permanently
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("customers")} *</label>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
              <input type="date" value={form.scrap_date} onChange={(e) => setForm({ ...form, scrap_date: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("writeoff_amount")} (₹) *</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Metal</label>
              <select value={form.metal} onChange={(e) => setForm({ ...form, metal: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
                <option value="gold_22k">Gold 22K</option>
                <option value="gold_24k">Gold 24K</option>
                <option value="gold_18k">Gold 18K</option>
                <option value="silver">Silver</option>
                <option value="silver_pure">Silver Pure</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Weight (g)</label>
              <input type="number" step="0.001" value={form.gross_wt} onChange={(e) => setForm({ ...form, gross_wt: parseFloat(e.target.value) || 0 })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Purity%</label>
              <input type="number" step="0.01" value={form.purity_pct} onChange={(e) => setForm({ ...form, purity_pct: parseFloat(e.target.value) || 0 })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Rate/g</label>
              <input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("writeoff_reason")} *</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} required
                placeholder="Reason for write-off (e.g. customer defaulted, untraceable)"
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending || !customer || !form.amount}
              className="bg-err text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "…" : "Confirm Write-off"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Customer</th>
              <th className="text-right px-3 py-2.5">Amount Written Off</th>
              <th className="text-left px-3 py-2.5">Reason</th>
            </tr></thead>
            <tbody>
              {(writeoffs as any[])?.map((w) => (
                <tr key={w.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(w.scrap_date)}</td>
                  <td className="px-3 py-2.5 font-medium">{w.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-err">{inr(w.amount)}</td>
                  <td className="px-3 py-2.5 text-ink-dim text-xs truncate max-w-[200px]">{w.notes}</td>
                </tr>
              ))}
              {!writeoffs?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
