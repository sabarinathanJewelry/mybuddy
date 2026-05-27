"use client";

import { Fragment, useState } from "react";
import { usePayments, useSavePayment, useUpdatePayment, useDeletePayment } from "@/modules/payments/api";
import type { PaymentFilters } from "@/modules/payments/api";
import CustomerPicker from "@/modules/customers/customer-picker";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import { clsx } from "clsx";

const MODES = ["cash", "upi", "bank", "old_gold", "old_silver", "advance"];
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", upi: "UPI / GPay", bank: "Bank", old_gold: "Old Gold",
  old_silver: "Old Silver", advance: "Advance",
};
const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold";
const finp = "border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold";

export default function PaymentsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);

  const [filters, setFilters] = useState<PaymentFilters>({});
  const hasFilters = !!(filters.fromDate || filters.toDate || filters.mode || filters.direction || filters.search);
  const { data: payments, isLoading } = usePayments(filters);
  const save = useSavePayment();
  const update = useUpdatePayment();
  const remove = useDeletePayment();

  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false, notes: "" });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ pay_date: globalDate, mode: "cash", direction: "in", amount: 0, notes: "" });
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.amount <= 0) return;
    await save.mutateAsync({ ...form, direction, customer_id: customer?.id ?? null });
    setShowForm(false);
    setForm({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false, notes: "" });
    setCustomer(null);
  }

  function startEdit(p: any) {
    setEditingId(p.id);
    setEditForm({ pay_date: p.pay_date, mode: p.mode, direction: p.direction, amount: p.amount, notes: p.notes ?? "" });
    setEditCustomer(p.customers ? { id: p.customer_id, name: p.customers.name, phone: null, address: null, opening_balance: 0, gold_balance_g: 0, silver_balance_g: 0, notes: null, created_at: "" } : null);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || editForm.amount <= 0) return;
    await update.mutateAsync({ id: editingId, ...editForm, customer_id: editCustomer?.id ?? null });
    setEditingId(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("payments")}</h1>
        <button onClick={() => setShowForm(true)} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + {t("new_payment")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
          {/* Direction toggle */}
          <div className="flex rounded-lg overflow-hidden border border-line">
            {(["in", "out"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)}
                className={clsx("flex-1 py-2 text-sm font-medium transition-colors", direction === d ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas")}>
                {d === "in" ? "⬆ Payment In" : "⬇ Payment Out"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("customers")}</label>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("date")}</label>
              <input type="date" value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inp}>
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("amount")} *</label>
              <input type="number" step="0.01" value={form.amount || ""}
                placeholder="Enter amount"
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className={clsx(inp, form.amount <= 0 && "border-err/50 focus:ring-err")} />
              {form.amount <= 0 && <p className="text-xs text-err mt-0.5">Amount is required</p>}
            </div>
            {(form.mode === "old_gold" || form.mode === "old_silver") && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Weight (g)</label>
                  <input type="number" step="0.001" value={form.metal_wt} onChange={(e) => setForm({ ...form, metal_wt: parseFloat(e.target.value) || 0 })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Purity%</label>
                  <input type="number" step="0.01" value={form.metal_purity} onChange={(e) => setForm({ ...form, metal_purity: parseFloat(e.target.value) || 0 })} className={inp} />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_advance} onChange={(e) => setForm({ ...form, is_advance: e.target.checked })} className="accent-gold" />
                {t("is_advance")}
              </label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">Note (optional)</label>
              <input type="text" value={form.notes} placeholder="e.g. advance for wedding order, balance payment…"
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending || form.amount <= 0}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-line rounded-xl px-4 py-3 shadow-soft space-y-2">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-dim">From</span>
            <input type="date" value={filters.fromDate ?? ""} onChange={e => setFilters(f => ({ ...f, fromDate: e.target.value || undefined }))} className={finp} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-dim">To</span>
            <input type="date" value={filters.toDate ?? ""} onChange={e => setFilters(f => ({ ...f, toDate: e.target.value || undefined }))} className={finp} />
          </div>
          <select value={filters.mode ?? ""} onChange={e => setFilters(f => ({ ...f, mode: e.target.value || undefined }))}
            className={finp}>
            <option value="">All Modes</option>
            {MODES.map(m => <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>)}
          </select>
          <select value={filters.direction ?? ""} onChange={e => setFilters(f => ({ ...f, direction: e.target.value || undefined }))}
            className={finp}>
            <option value="">In &amp; Out</option>
            <option value="in">In only</option>
            <option value="out">Out only</option>
          </select>
          <input type="text" placeholder="Search name / note…" value={filters.search ?? ""}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
            className={`${finp} w-44`} />
          {hasFilters && (
            <button onClick={() => setFilters({})} className="text-xs text-gold hover:underline ml-1">Clear</button>
          )}
          <span className="text-xs text-ink-dim ml-auto">{payments?.length ?? 0} records</span>
        </div>

        {/* Totals strip */}
        {payments && payments.length > 0 && (
          <div className="flex gap-4 pt-1 border-t border-line/50 text-xs">
            <span className="text-ink-dim">Total In:
              <span className="ml-1 font-mono font-semibold text-ok">
                {inr((payments as any[]).filter(p => p.direction === "in").reduce((s, p) => s + Number(p.amount), 0))}
              </span>
            </span>
            <span className="text-ink-dim">Total Out:
              <span className="ml-1 font-mono font-semibold text-err">
                {inr((payments as any[]).filter(p => p.direction === "out").reduce((s, p) => s + Number(p.amount), 0))}
              </span>
            </span>
            <span className="text-ink-dim">Net:
              <span className="ml-1 font-mono font-semibold text-ink">
                {inr((payments as any[]).reduce((s, p) => s + (p.direction === "in" ? Number(p.amount) : -Number(p.amount)), 0))}
              </span>
            </span>
          </div>
        )}
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">{t("date")}</th>
              <th className="text-left px-3 py-2.5">Party</th>
              <th className="text-left px-3 py-2.5">Mode</th>
              <th className="text-right px-3 py-2.5">{t("amount")}</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr></thead>
            <tbody>
              {(payments as any[])?.map((p) => (
                <Fragment key={p.id}>
                  <tr className={clsx("border-b border-line last:border-0 hover:bg-canvas/50", p.amount === 0 && "bg-err/5")}>
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                    <td className="px-3 py-2.5">
                      <div>{p.customers?.name ?? p.suppliers?.name ?? "—"}</div>
                      {p.notes && <div className="text-xs text-ink-dim truncate max-w-[180px]">{p.notes}</div>}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-ink-dim">{p.mode}</td>
                    <td className={clsx("px-3 py-2.5 text-right font-mono", p.direction === "in" ? "text-ok" : "text-err", p.amount === 0 && "font-bold")}>
                      {p.direction === "in" ? "+" : "-"}{inr(p.amount)}
                      {p.amount === 0 && <span className="ml-1 text-xs">(fix this)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(p)} className="text-xs text-gold hover:underline">Edit</button>
                        <button
                          onClick={() => { if (window.confirm("Delete this payment?")) remove.mutate(p.id); }}
                          className="text-xs text-err hover:underline">Del</button>
                      </div>
                    </td>
                  </tr>
                  {editingId === p.id && (
                    <tr className="border-b border-line bg-canvas/50">
                      <td colSpan={5} className="px-4 py-3">
                        <form onSubmit={handleUpdate} className="flex items-end gap-3 flex-wrap">
                          <div className="w-52">
                            <label className="text-xs text-ink-dim block mb-1">Customer</label>
                            <CustomerPicker value={editCustomer} onChange={setEditCustomer} />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Date</label>
                            <input type="date" value={editForm.pay_date}
                              onChange={(e) => setEditForm({ ...editForm, pay_date: e.target.value })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Mode</label>
                            <select value={editForm.mode}
                              onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Direction</label>
                            <select value={editForm.direction}
                              onChange={(e) => setEditForm({ ...editForm, direction: e.target.value })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                              <option value="in">In</option>
                              <option value="out">Out</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Amount (₹)</label>
                            <input type="number" step="0.01" value={editForm.amount || ""}
                              onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-gold"
                              autoFocus />
                          </div>
                          <div className="w-56">
                            <label className="text-xs text-ink-dim block mb-1">Note</label>
                            <input type="text" value={editForm.notes}
                              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                              placeholder="optional note"
                              className="border border-line rounded-lg2 px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-gold" />
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={update.isPending || editForm.amount <= 0}
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
              {!payments?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
