"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

type EntryType = "in" | "out";

interface WalkinForm {
  sale_date: string;
  entry_type: EntryType;
  description: string;
  amount: number;
  mode: string;
  walkout_reason: string;
  notes: string;
}

export default function WalkinsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();

  const { data: walkins, isLoading } = useQuery({
    queryKey: ["walkins"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("walk_ins")
        .select("*")
        .order("sale_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<WalkinForm>({
    sale_date: globalDate, entry_type: "in",
    description: "", amount: 0, mode: "cash",
    walkout_reason: "", notes: "",
  });

  function resetForm() {
    setForm({ sale_date: globalDate, entry_type: "in", description: "", amount: 0, mode: "cash", walkout_reason: "", notes: "" });
    setShowForm(false);
  }

  const save = useMutation({
    mutationFn: async (data: WalkinForm) => {
      const payload = {
        sale_date: data.sale_date,
        entry_type: data.entry_type,
        description: data.description,
        amount: data.entry_type === "out" ? 0 : data.amount,
        mode: data.mode,
        walkout_reason: data.entry_type === "out" ? data.walkout_reason : null,
        notes: data.notes || null,
      };
      const { data: row, error } = await supabase().from("walk_ins").insert(payload).select().single();
      if (error) throw error;
      // Fan out to cash/bank ledger only for in-type entries
      if (data.entry_type === "in" && data.amount > 0) {
        const ledgerTable = data.mode === "cash" ? "cash_ledger" : "bank_ledger";
        const { error: le } = await supabase().from(ledgerTable).insert({
          tx_date: data.sale_date, direction: "in", amount: data.amount,
          description: `Walk-in: ${data.description}`, ref_type: "walkin", ref_id: row.id,
        });
        if (le) console.warn("ledger fanout failed:", le);
      }
      return row;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["walkins"] }); resetForm(); },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (walkins as any[]) ?? [];
  const todayRows = rows.filter((w) => w.sale_date === globalDate);
  const todayIn = todayRows.filter((w) => (w.entry_type ?? "in") === "in");
  const todayOut = todayRows.filter((w) => w.entry_type === "out");
  const todayRevenue = todayIn.reduce((s: number, w: any) => s + w.amount, 0);

  const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Walk-in Counter</h1>
          <p className="text-sm text-ink-dim mt-0.5">{globalDate}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          + Add Entry
        </button>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-xs text-ink-dim mb-1">Bought Today</p>
          <p className="text-2xl font-bold text-ok">{todayIn.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-xs text-ink-dim mb-1">Walked Out</p>
          <p className="text-2xl font-bold text-err">{todayOut.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
          <p className="text-xs text-ink-dim mb-1">Revenue</p>
          <p className="text-xl font-bold text-gold">{inr(todayRevenue)}</p>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
          className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4"
        >
          {/* Entry type toggle */}
          <div className="flex gap-2">
            {(["in", "out"] as EntryType[]).map((t_) => (
              <button
                key={t_}
                type="button"
                onClick={() => setForm({ ...form, entry_type: t_ })}
                className={`flex-1 py-2 rounded-lg2 text-sm font-medium border transition-colors ${
                  form.entry_type === t_
                    ? t_ === "in" ? "bg-ok/10 border-ok text-ok" : "bg-err/10 border-err text-err"
                    : "border-line text-ink-dim hover:border-gold hover:text-gold"
                }`}
              >
                {t_ === "in" ? "Walk-in (Bought)" : "Walk-out (No Sale)"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
              <input type="date" value={form.sale_date}
                onChange={(e) => setForm({ ...form, sale_date: e.target.value })}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">
                {form.entry_type === "in" ? "Description *" : "Customer / Item Interest *"}
              </label>
              <input required value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={form.entry_type === "out" ? "What did they ask for?" : "Item sold"}
                className={inp} />
            </div>

            {form.entry_type === "in" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Amount (₹)</label>
                  <input type="number" step="0.01" value={form.amount || ""}
                    onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Mode</label>
                  <select value={form.mode}
                    onChange={(e) => setForm({ ...form, mode: e.target.value })}
                    className={inp}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI/GPay</option>
                    <option value="bank">Bank</option>
                  </select>
                </div>
              </>
            )}

            {form.entry_type === "out" && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-ink-dim mb-1">Reason for Walk-out</label>
                <input value={form.walkout_reason}
                  onChange={(e) => setForm({ ...form, walkout_reason: e.target.value })}
                  placeholder="e.g. Price too high, Out of stock, Just browsing…"
                  className={inp} />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">Notes (optional)</label>
              <input value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inp} placeholder="Any additional notes…" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {t("save")}
            </button>
            <button type="button" onClick={resetForm}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {save.isError && <p className="text-xs text-err">Save failed — check that the walk_ins table has been migrated (entry_type column).</p>}
        </form>
      )}

      {/* List */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Description / Reason</th>
                <th className="text-left px-3 py-2.5">Mode</th>
                <th className="text-right px-3 py-2.5">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w: any) => {
                const isOut = w.entry_type === "out";
                return (
                  <tr key={w.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(w.sale_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isOut ? "bg-err/10 text-err" : "bg-ok/10 text-ok"}`}>
                        {isOut ? "Walk-out" : "Sale"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span>{w.description}</span>
                      {isOut && w.walkout_reason && (
                        <span className="block text-xs text-ink-dim mt-0.5">Reason: {w.walkout_reason}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-ink-dim">{isOut ? "—" : w.mode}</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {isOut ? <span className="text-ink-dim">—</span> : <span className="text-ok">{inr(w.amount)}</span>}
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
