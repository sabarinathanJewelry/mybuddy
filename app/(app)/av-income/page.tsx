"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { inr, shortDate } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank / UPI" },
];

function useAvIncome(from: string, to: string) {
  return useQuery({
    queryKey: ["av-income", from, to],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("av_income")
        .select("*")
        .gte("income_date", from)
        .lte("income_date", to)
        .order("income_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useAddAvIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { income_date: string; amount: number; mode: string; description: string }) => {
      const client = supabase();
      const { data: row, error } = await client.from("av_income").insert(d).select().single();
      if (error) throw error;
      // Fan out to cash or bank ledger
      const table = d.mode === "cash" ? "cash_ledger" : "bank_ledger";
      await client.from(table).insert({
        tx_date: d.income_date,
        direction: "in",
        amount: d.amount,
        description: d.description ? `AV — ${d.description}` : "AV Income",
        ref_type: "av",
        ref_id: row.id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["av-income"] }),
  });
}

function useDeleteAvIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();
      // Remove ledger entries first
      await Promise.all([
        client.from("cash_ledger").delete().eq("ref_type", "av").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "av").eq("ref_id", id),
      ]);
      const { error } = await client.from("av_income").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["av-income"] }),
  });
}

export default function AvIncomePage() {
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();

  const currentMonth = globalDate.slice(0, 7);
  const [fromDate, setFromDate] = useState(currentMonth + "-01");
  const [toDate, setToDate]     = useState(globalDate);

  const { data: entries = [], isLoading } = useAvIncome(fromDate, toDate);
  const addEntry   = useAddAvIncome();
  const deleteEntry = useDeleteAvIncome();

  const [form, setForm] = useState({ income_date: globalDate, amount: "", mode: "cash", description: "" });
  const [showForm, setShowForm] = useState(false);

  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  const cashTotal = entries.filter(e => e.mode === "cash").reduce((s, e) => s + Number(e.amount), 0);
  const bankTotal = entries.filter(e => e.mode !== "cash").reduce((s, e) => s + Number(e.amount), 0);

  async function handleAdd() {
    if (!form.amount || Number(form.amount) <= 0) return;
    await addEntry.mutateAsync({
      income_date: form.income_date,
      amount: Number(form.amount),
      mode: form.mode,
      description: form.description,
    });
    setForm({ income_date: globalDate, amount: "", mode: "cash", description: "" });
    setShowForm(false);
    qc.invalidateQueries({ queryKey: ["daily-sheet"] });
    qc.invalidateQueries({ queryKey: ["ledger_detail"] });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">AV Income</h1>
          <p className="text-sm text-ink-dim mt-0.5">Commission / facilitation profit (gold loan transfers etc.)</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 hover:bg-gold-dark transition-colors">
          {showForm ? "Cancel" : "+ Add AV"}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
          <h3 className="text-sm font-semibold">Record AV Income</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={form.income_date}
                onChange={e => setForm(f => ({ ...f, income_date: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
              <input type="number" step="0.01" value={form.amount} placeholder="0"
                onFocus={e => e.target.select()}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Mode</label>
              <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
                className={inp}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Description</label>
              <input type="text" value={form.description} placeholder="e.g. Gold loan transfer — Murugan"
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className={inp} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              disabled={!form.amount || Number(form.amount) <= 0 || addEntry.isPending}
              onClick={handleAdd}
              className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {addEntry.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim">
              Cancel
            </button>
          </div>
          {addEntry.isError && (
            <p className="text-xs text-err">{(addEntry.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-line shadow-soft p-4">
          <p className="text-xs text-ink-dim">Total AV</p>
          <p className="text-lg font-bold text-ok mt-1">{inr(total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line shadow-soft p-4">
          <p className="text-xs text-ink-dim">Cash</p>
          <p className="text-lg font-bold mt-1">{inr(cashTotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line shadow-soft p-4">
          <p className="text-xs text-ink-dim">Bank / UPI</p>
          <p className="text-lg font-bold mt-1">{inr(bankTotal)}</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-ink-dim">From</span>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
        <span className="text-xs text-ink-dim">to</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-ink-dim p-4">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-ink-dim p-6 text-center">No AV income recorded for this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Description</th>
                <th className="text-left px-3 py-2.5">Mode</th>
                <th className="text-right px-4 py-2.5">Amount</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(e.income_date)}</td>
                  <td className="px-3 py-2.5">{e.description || <span className="text-ink-dim">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${e.mode === "cash" ? "bg-gold/10 text-gold-dark" : "bg-info/10 text-info"}`}>
                      {e.mode === "cash" ? "Cash" : "Bank/UPI"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-ok">{inr(Number(e.amount))}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      disabled={deleteEntry.isPending}
                      onClick={() => { if (confirm("Delete this AV entry?")) deleteEntry.mutate(e.id); }}
                      className="text-xs text-err hover:underline disabled:opacity-40">
                      Del
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-canvas border-t border-line">
                <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-ink-dim text-right">Period Total</td>
                <td className="px-4 py-2 text-right font-bold text-ok">{inr(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
