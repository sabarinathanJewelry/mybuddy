"use client";

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

const inp = "border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("expenses")
        .select("*, expense_categories(name)")
        .order("exp_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase().from("expense_categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ExpensesPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: expenses, isLoading } = useExpenses();
  const { data: categories } = useCategories();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ exp_date: globalDate, category_id: "", description: "", amount: 0, mode: "cash", is_advance: false, notes: "" });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ exp_date: globalDate, category_id: "", description: "", amount: 0, mode: "cash", notes: "" });

  const save = useMutation({
    mutationFn: async (data: typeof form) => {
      const { data: row, error } = await supabase().from("expenses")
        .insert({ ...data, category_id: data.category_id || null })
        .select().single();
      if (error) throw error;
      const ledgerTable = data.mode === "bank" ? "bank_ledger" : "cash_ledger";
      const { error: ledgerErr } = await supabase().from(ledgerTable).insert({
        tx_date: data.exp_date, direction: "out", amount: data.amount,
        description: data.description, ref_type: "expense", ref_id: row.id,
      });
      if (ledgerErr) console.warn(ledgerErr);
      return row;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); setShowForm(false); },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof editForm) => {
      const client = supabase();
      // Fetch old mode to know which ledger to migrate
      const { data: current } = await client.from("expenses").select("mode").eq("id", id).single();
      const oldTable = current?.mode === "bank" ? "bank_ledger" : "cash_ledger";
      const newTable = data.mode === "bank" ? "bank_ledger" : "cash_ledger";

      const { error } = await client.from("expenses")
        .update({ ...data, category_id: data.category_id || null })
        .eq("id", id);
      if (error) throw error;

      if (oldTable === newTable) {
        await client.from(newTable).update({ tx_date: data.exp_date, amount: data.amount, description: data.description })
          .eq("ref_type", "expense").eq("ref_id", id);
      } else {
        await client.from(oldTable).delete().eq("ref_type", "expense").eq("ref_id", id);
        await client.from(newTable).insert({
          tx_date: data.exp_date, direction: "out", amount: data.amount,
          description: data.description, ref_type: "expense", ref_id: id,
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); setEditingId(null); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "expense").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "expense").eq("ref_id", id),
      ]);
      const { error } = await client.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });

  function startEdit(e: any) {
    setEditingId(e.id);
    setEditForm({
      exp_date: e.exp_date,
      category_id: e.category_id ?? "",
      description: e.description,
      amount: e.amount,
      mode: e.mode,
      notes: e.notes ?? "",
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("expenses")}</h1>
        <button onClick={() => setShowForm(true)} className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">+ {t("add_expense")}</button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
              <input type="date" value={form.exp_date} onChange={(e) => setForm({ ...form, exp_date: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("category")}</label>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
                <option value="">— Select —</option>
                {(categories as any[])?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_advance} onChange={(e) => setForm({ ...form, is_advance: e.target.checked })} className="accent-gold" />
                Staff Advance
              </label>
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
              <th className="text-left px-3 py-2.5">Category</th>
              <th className="text-left px-3 py-2.5">Description</th>
              <th className="text-right px-3 py-2.5">{t("amount")}</th>
              <th className="text-left px-3 py-2.5">Mode</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr></thead>
            <tbody>
              {(expenses as any[])?.map((exp) => (
                <Fragment key={exp.id}>
                  <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(exp.exp_date)}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{exp.expense_categories?.name ?? "—"}</td>
                    <td className="px-3 py-2.5">{exp.description}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-err">{inr(exp.amount)}</td>
                    <td className="px-3 py-2.5 capitalize text-ink-dim">{exp.mode}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(exp)} className="text-xs text-gold hover:underline">Edit</button>
                        <button
                          onClick={() => { if (window.confirm("Delete this expense?")) remove.mutate(exp.id); }}
                          className="text-xs text-err hover:underline">Del</button>
                      </div>
                    </td>
                  </tr>
                  {editingId === exp.id && (
                    <tr className="border-b border-line bg-canvas/50">
                      <td colSpan={6} className="px-4 py-3">
                        <form onSubmit={(e) => { e.preventDefault(); if (editingId) update.mutate({ id: editingId, ...editForm }); }}
                          className="flex items-end gap-3 flex-wrap">
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Date</label>
                            <input type="date" value={editForm.exp_date}
                              onChange={(e) => setEditForm({ ...editForm, exp_date: e.target.value })}
                              className={inp} />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Category</label>
                            <select value={editForm.category_id}
                              onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                              className={inp}>
                              <option value="">— None —</option>
                              {(categories as any[])?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                          <div className="flex-1 min-w-40">
                            <label className="text-xs text-ink-dim block mb-1">Description</label>
                            <input required value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              className={`${inp} w-full`} autoFocus />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Amount (₹)</label>
                            <input type="number" step="0.01" value={editForm.amount || ""}
                              onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                              className={`${inp} w-32`} />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Mode</label>
                            <select value={editForm.mode}
                              onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })}
                              className={inp}>
                              <option value="cash">Cash</option>
                              <option value="bank">Bank</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={update.isPending}
                              className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">Save</button>
                            <button type="button" onClick={() => setEditingId(null)}
                              className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!expenses?.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
