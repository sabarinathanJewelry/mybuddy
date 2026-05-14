"use client";

import { useState } from "react";
import { usePayments, useSavePayment } from "@/modules/payments/api";
import CustomerPicker from "@/modules/customers/customer-picker";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import { clsx } from "clsx";

const MODES = ["cash", "upi", "bank", "old_gold", "old_silver", "advance"];

export default function PaymentsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: payments, isLoading } = usePayments();
  const save = useSavePayment();

  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false, notes: "" });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync({ ...form, direction, customer_id: customer?.id ?? null });
    setShowForm(false);
    setForm({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false, notes: "" });
    setCustomer(null);
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
              <input type="date" value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("amount")}</label>
              <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
            {(form.mode === "old_gold" || form.mode === "old_silver") && (
              <>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Weight (g)</label>
                  <input type="number" step="0.001" value={form.metal_wt} onChange={(e) => setForm({ ...form, metal_wt: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Purity%</label>
                  <input type="number" step="0.01" value={form.metal_purity} onChange={(e) => setForm({ ...form, metal_purity: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
                </div>
              </>
            )}
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_advance} onChange={(e) => setForm({ ...form, is_advance: e.target.checked })} className="accent-gold" />
                {t("is_advance")}
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
              <th className="text-left px-4 py-2.5">{t("date")}</th>
              <th className="text-left px-3 py-2.5">Party</th>
              <th className="text-left px-3 py-2.5">Mode</th>
              <th className="text-right px-3 py-2.5">{t("amount")}</th>
            </tr></thead>
            <tbody>
              {(payments as any[])?.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                  <td className="px-3 py-2.5">{p.customers?.name ?? p.suppliers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 capitalize text-ink-dim">{p.mode}</td>
                  <td className={clsx("px-3 py-2.5 text-right font-mono", p.direction === "in" ? "text-ok" : "text-err")}>
                    {p.direction === "in" ? "+" : "-"}{inr(p.amount)}
                  </td>
                </tr>
              ))}
              {!payments?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
