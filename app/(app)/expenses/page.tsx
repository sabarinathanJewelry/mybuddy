"use client";

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

const inp = "border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
type PageTab = "today" | "all";

// ── Palette for category bars (hex — avoids Tailwind purge issues) ────────────
const CAT_PALETTE = [
  "#B8860B", "#3B82F6", "#22C55E", "#F59E0B",
  "#EF4444", "#8B5CF6", "#06B6D4", "#F97316",
  "#EC4899", "#10B981",
];

// ── hooks ────────────────────────────────────────────────────────────────────
function useTodayExpenses(date: string) {
  return useQuery({
    queryKey: ["expenses-today", date],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("expenses")
        .select("*, expense_categories(name)")
        .eq("exp_date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useFilteredExpenses(from: string, to: string, categoryId: string, mode: string) {
  return useQuery({
    queryKey: ["expenses-filtered", from, to, categoryId, mode],
    queryFn: async () => {
      let q = supabase()
        .from("expenses")
        .select("*, expense_categories(name)")
        .gte("exp_date", from)
        .lte("exp_date", to)
        .order("exp_date", { ascending: false })
        .limit(300);
      if (categoryId) q = q.eq("category_id", categoryId);
      if (mode)       q = q.eq("mode", mode);
      const { data, error } = await q;
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

// ── Category breakdown chart ─────────────────────────────────────────────────
function CategoryBreakdown({ expenses }: { expenses: any[] }) {
  const total = expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  if (!expenses.length) return <p className="text-xs text-ink-dim text-center py-4">No expenses today.</p>;

  const byCategory = new Map<string, { name: string; amount: number }>();
  expenses.forEach((e: any) => {
    const key  = e.category_id ?? "__none__";
    const name = e.expense_categories?.name ?? "Uncategorized";
    byCategory.set(key, { name, amount: (byCategory.get(key)?.amount ?? 0) + (e.amount ?? 0) });
  });
  const sorted = [...byCategory.values()].sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-3">
      {/* Total chip */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Category Breakdown</p>
        <span className="text-sm font-bold text-err font-mono">{inr(total)}</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden w-full">
        {sorted.map((cat, i) => (
          <div
            key={i}
            title={`${cat.name}: ${inr(cat.amount)}`}
            style={{ width: `${(cat.amount / total) * 100}%`, background: CAT_PALETTE[i % CAT_PALETTE.length] }}
          />
        ))}
      </div>

      {/* Bars per category */}
      <div className="space-y-2 pt-1">
        {sorted.map((cat, i) => {
          const pct = Math.round((cat.amount / total) * 100);
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CAT_PALETTE[i % CAT_PALETTE.length] }} />
                  <span className="text-ink font-medium">{cat.name}</span>
                </div>
                <span className="text-ink font-mono">
                  {inr(cat.amount)}
                  <span className="text-ink-dim ml-1.5">{pct}%</span>
                </span>
              </div>
              <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: CAT_PALETTE[i % CAT_PALETTE.length] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Expense table (shared between tabs) ──────────────────────────────────────
function ExpenseTable({
  expenses, categories, editingId, editForm, setEditForm, onStartEdit, onSaveEdit, onDelete, editPending,
}: {
  expenses: any[]; categories: any[];
  editingId: string | null; editForm: any; setEditForm: (f: any) => void;
  onStartEdit: (e: any) => void; onSaveEdit: () => void; onDelete: (id: string) => void;
  editPending: boolean;
}) {
  const total = expenses.reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

  return (
    <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
            <th className="text-left px-4 py-2.5">Date</th>
            <th className="text-left px-3 py-2.5">Category</th>
            <th className="text-left px-3 py-2.5">Description</th>
            <th className="text-right px-3 py-2.5">Amount</th>
            <th className="text-left px-3 py-2.5">Mode</th>
            <th className="px-3 py-2.5 w-20" />
          </tr>
        </thead>
        <tbody>
          {expenses.map((exp: any) => (
            <Fragment key={exp.id}>
              <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                <td className="px-4 py-2.5 text-ink-dim">{shortDate(exp.exp_date)}</td>
                <td className="px-3 py-2.5 text-ink-dim">{exp.expense_categories?.name ?? "—"}</td>
                <td className="px-3 py-2.5">{exp.description}</td>
                <td className="px-3 py-2.5 text-right font-mono text-err">{inr(exp.amount)}</td>
                <td className="px-3 py-2.5 capitalize text-ink-dim text-xs">{exp.mode}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onStartEdit(exp)} className="text-xs text-gold hover:underline">Edit</button>
                    <button onClick={() => { if (window.confirm("Delete this expense?")) onDelete(exp.id); }}
                      className="text-xs text-err hover:underline">Del</button>
                  </div>
                </td>
              </tr>
              {editingId === exp.id && (
                <tr className="border-b border-line bg-canvas/50">
                  <td colSpan={6} className="px-4 py-3">
                    <form onSubmit={(e) => { e.preventDefault(); onSaveEdit(); }}
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
                        <button type="submit" disabled={editPending}
                          className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">Save</button>
                        <button type="button" onClick={() => onStartEdit(null)}
                          className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                      </div>
                    </form>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!expenses.length && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">No expenses found.</td></tr>
          )}
          {expenses.length > 0 && (
            <tr className="bg-canvas/70 border-t-2 border-line">
              <td colSpan={3} className="px-4 py-2.5 text-xs text-ink-dim font-medium">Total · {expenses.length} items</td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold text-err">{inr(total)}</td>
              <td colSpan={2} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const todayStr   = new Date().toLocaleDateString("en-CA");
  const monthStart = todayStr.slice(0, 7) + "-01";

  const { data: categories = [] } = useCategories();
  const qc = useQueryClient();

  const [tab, setTab] = useState<PageTab>("today");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    exp_date: globalDate, category_id: "", description: "",
    amount: 0, mode: "cash", is_advance: false, notes: "",
  });

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({
    exp_date: globalDate, category_id: "", description: "",
    amount: 0, mode: "cash", notes: "",
  });

  // All-expenses filters
  const [filterFrom, setFilterFrom]   = useState(monthStart);
  const [filterTo, setFilterTo]       = useState(todayStr);
  const [filterCat, setFilterCat]     = useState("");
  const [filterMode, setFilterMode]   = useState("");

  // Data
  const { data: todayExpenses = [], isLoading: todayLoading } =
    useTodayExpenses(todayStr);
  const { data: allExpenses = [], isLoading: allLoading } =
    useFilteredExpenses(filterFrom, filterTo, filterCat, filterMode);

  // ── Mutations ──
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses-today"] });
      qc.invalidateQueries({ queryKey: ["expenses-filtered"] });
      setShowForm(false);
      setForm({ exp_date: globalDate, category_id: "", description: "", amount: 0, mode: "cash", is_advance: false, notes: "" });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof editForm) => {
      const client = supabase();
      const { data: current } = await client.from("expenses").select("mode").eq("id", id).single();
      const oldTable = current?.mode === "bank" ? "bank_ledger" : "cash_ledger";
      const newTable = data.mode === "bank" ? "bank_ledger" : "cash_ledger";
      const { error } = await client.from("expenses").update({ ...data, category_id: data.category_id || null }).eq("id", id);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses-today"] });
      qc.invalidateQueries({ queryKey: ["expenses-filtered"] });
      setEditingId(null);
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses-today"] });
      qc.invalidateQueries({ queryKey: ["expenses-filtered"] });
    },
  });

  function startEdit(e: any) {
    if (!e) { setEditingId(null); return; }
    setEditingId(e.id);
    setEditForm({ exp_date: e.exp_date, category_id: e.category_id ?? "", description: e.description, amount: e.amount, mode: e.mode, notes: e.notes ?? "" });
  }

  const todayTotal = (todayExpenses as any[]).reduce((s: number, e: any) => s + (e.amount ?? 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("expenses")}</h1>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          {showForm ? "Cancel" : `+ ${t("add_expense")}`}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
          className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
              <input type="date" value={form.exp_date}
                onChange={(e) => setForm({ ...form, exp_date: e.target.value })}
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
              <input type="number" step="0.01" value={form.amount || ""}
                onFocus={e => e.target.select()}
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
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
            <button type="submit" disabled={save.isPending}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {([
          { key: "today", label: `Today  ${todayTotal > 0 ? `· ${inr(todayTotal)}` : ""}` },
          { key: "all",   label: "All Expenses" },
        ] as { key: PageTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TODAY TAB ──────────────────────────────────────────────────────────── */}
      {tab === "today" && (
        <div className="space-y-4">
          {todayLoading ? (
            <p className="text-ink-dim text-sm">{t("loading")}</p>
          ) : (
            <>
              {/* Category chart card */}
              <div className="bg-white rounded-xl border border-line shadow-soft p-5">
                <CategoryBreakdown expenses={todayExpenses as any[]} />
              </div>

              {/* Today's expense list */}
              {(todayExpenses as any[]).length > 0 && (
                <ExpenseTable
                  expenses={todayExpenses as any[]}
                  categories={categories}
                  editingId={editingId}
                  editForm={editForm}
                  setEditForm={setEditForm}
                  onStartEdit={startEdit}
                  onSaveEdit={() => { if (editingId) update.mutate({ id: editingId, ...editForm }); }}
                  onDelete={remove.mutate}
                  editPending={update.isPending}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ── ALL EXPENSES TAB ───────────────────────────────────────────────────── */}
      {tab === "all" && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-ink-dim mb-1">From</label>
                <input type="date" value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">To</label>
                <input type="date" value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Category</label>
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className={inp}>
                  <option value="">All categories</option>
                  {(categories as any[]).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Mode</label>
                <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className={inp}>
                  <option value="">All modes</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
              {(filterCat || filterMode || filterFrom !== monthStart || filterTo !== todayStr) && (
                <button
                  onClick={() => { setFilterFrom(monthStart); setFilterTo(todayStr); setFilterCat(""); setFilterMode(""); }}
                  className="text-xs text-err hover:underline pb-1">
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Category chart for filtered period */}
          {!allLoading && (allExpenses as any[]).length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft p-5">
              <CategoryBreakdown expenses={allExpenses as any[]} />
            </div>
          )}

          {allLoading ? (
            <p className="text-ink-dim text-sm">{t("loading")}</p>
          ) : (
            <ExpenseTable
              expenses={allExpenses as any[]}
              categories={categories}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              onStartEdit={startEdit}
              onSaveEdit={() => { if (editingId) update.mutate({ id: editingId, ...editForm }); }}
              onDelete={remove.mutate}
              editPending={update.isPending}
            />
          )}
        </div>
      )}
    </div>
  );
}
