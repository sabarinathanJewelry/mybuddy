"use client";

import { Fragment, use, useState } from "react";
import Link from "next/link";
import { useCustomer, useCustomer360, useUpdatePayment, useDeletePayment } from "@/modules/customers/api";
import { useT } from "@/i18n";
import { inr, grams, shortDate } from "@/lib/format";

const TABS = ["sales", "orders", "payments", "writeoffs", "info"] as const;
type Tab = (typeof TABS)[number];

export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const [tab, setTab] = useState<Tab>("sales");
  const { data: customer } = useCustomer(id);
  const { data: view, isLoading } = useCustomer360(id);
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();
  const [editingPayment, setEditingPayment] = useState<{ id: string; pay_date: string; mode: string; amount: number; direction: string } | null>(null);

  const totalSales = view?.sales.reduce((s, x) => s + (x.total ?? 0), 0) ?? 0;
  const totalPaidIn = view?.payments.filter((p) => p.direction === "in").reduce((s, x) => s + x.amount, 0) ?? 0;
  const totalPaidOut = view?.payments.filter((p) => p.direction === "out").reduce((s, x) => s + x.amount, 0) ?? 0;
  const totalWriteoff = view?.writeoffs.reduce((s, x) => s + (x.amount ?? 0), 0) ?? 0;
  // Negative balance = customer owes us; Positive = customer has advance credit
  // Sales increase debt; payments-in reduce debt; payments-out reduce our obligation; writeoffs reduce debt
  const balance = (customer?.opening_balance ?? 0) - totalSales + totalPaidIn - totalPaidOut + totalWriteoff;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/customers" className="text-gold hover:underline text-sm">← {t("customers")}</Link>
      </div>

      {/* Header card */}
      {customer && (
        <div className="bg-white rounded-xl border border-line p-5 shadow-soft">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-ink">{customer.name}</h1>
              {customer.phone && <p className="text-sm text-ink-dim">{customer.phone}</p>}
            </div>
            <Link href={`/customers?edit=${id}`} className="text-xs text-gold hover:underline">{t("edit")}</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-line">
            <div>
              <p className="text-xs text-ink-dim">{t("balance")}</p>
              <p className={`text-lg font-bold ${balance < 0 ? "text-err" : "text-ok"}`}>{inr(balance)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-dim">{t("gold_balance")}</p>
              <p className="text-lg font-bold text-gold">{grams(customer.gold_balance_g)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-dim">{t("silver_balance")}</p>
              <p className="text-lg font-bold text-ink-mid">{grams(customer.silver_balance_g)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-dim">{t("sales")}</p>
              <p className="text-lg font-bold text-ink">{view?.sales.length ?? 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {TABS.map((tab_) => (
          <button
            key={tab_}
            onClick={() => setTab(tab_)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tab_
                ? "border-gold text-gold"
                : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {tab_ === "writeoffs" ? t("writeoff") : t(`nav_${tab_}` as any) || tab_}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-ink-dim text-sm">{t("loading")}</p>}

      {/* Sales tab */}
      {tab === "sales" && !isLoading && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">{t("bill_no")}</th>
              <th className="text-left px-3 py-2.5">{t("date")}</th>
              <th className="text-right px-3 py-2.5">{t("total")}</th>
              <th className="text-left px-3 py-2.5">{t("status")}</th>
            </tr></thead>
            <tbody>
              {view?.sales.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-mono text-info">{s.bill_no}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(s.total)}</td>
                  <td className="px-3 py-2.5 text-ink-dim capitalize">{s.status}</td>
                </tr>
              ))}
              {!view?.sales.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Orders tab */}
      {tab === "orders" && !isLoading && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Order No</th>
              <th className="text-left px-3 py-2.5">{t("date")}</th>
              <th className="text-right px-3 py-2.5">Est. Total</th>
              <th className="text-right px-3 py-2.5">Advance</th>
              <th className="text-right px-3 py-2.5">Balance Due</th>
              <th className="text-left px-3 py-2.5">{t("status")}</th>
            </tr></thead>
            <tbody>
              {view?.orders.map((o) => {
                const advancePaid = (o.order_payments ?? []).reduce((s: number, p: { amount: number }) => s + (p.amount ?? 0), 0);
                const balanceDue = (o.total ?? 0) - advancePaid;
                return (
                  <tr key={o.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-mono text-info">{o.order_no}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{shortDate(o.order_date)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(o.total ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(advancePaid)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${balanceDue > 0 ? "text-err" : "text-ok"}`}>{inr(balanceDue)}</td>
                    <td className="px-3 py-2.5 text-ink-dim capitalize">{o.status}</td>
                  </tr>
                );
              })}
              {!view?.orders.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments tab */}
      {tab === "payments" && !isLoading && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">{t("date")}</th>
              <th className="text-left px-3 py-2.5">{t("type")}</th>
              <th className="text-right px-3 py-2.5">{t("amount")}</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr></thead>
            <tbody>
              {view?.payments.map((p) => (
                <Fragment key={p.id}>
                  <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                    <td className="px-3 py-2.5 capitalize">{p.mode}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${p.direction === "in" ? "text-ok" : "text-err"}`}>
                      {p.direction === "in" ? "+" : "-"}{inr(p.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingPayment({ id: p.id, pay_date: p.pay_date, mode: p.mode, amount: p.amount, direction: p.direction })}
                          className="text-xs text-gold hover:underline">Edit</button>
                        <button
                          onClick={() => { if (window.confirm("Delete this payment?")) deletePayment.mutate({ id: p.id, customerId: id }); }}
                          className="text-xs text-err hover:underline">Del</button>
                      </div>
                    </td>
                  </tr>
                  {editingPayment !== null && editingPayment.id === p.id && (
                    <tr className="border-b border-line bg-canvas/50">
                      <td colSpan={4} className="px-4 py-3">
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            await updatePayment.mutateAsync({ ...editingPayment, customerId: id });
                            setEditingPayment(null);
                          }}
                          className="flex items-end gap-3 flex-wrap">
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Date</label>
                            <input type="date" value={editingPayment.pay_date}
                              onChange={(e) => setEditingPayment({ ...editingPayment, pay_date: e.target.value })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Mode</label>
                            <select value={editingPayment.mode}
                              onChange={(e) => setEditingPayment({ ...editingPayment, mode: e.target.value })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                              {["cash", "upi", "bank", "old_gold", "old_silver"].map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Direction</label>
                            <select value={editingPayment.direction}
                              onChange={(e) => setEditingPayment({ ...editingPayment, direction: e.target.value })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                              <option value="in">In (received)</option>
                              <option value="out">Out (paid back)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Amount (₹)</label>
                            <input type="number" step="0.01" value={editingPayment.amount}
                              onChange={(e) => setEditingPayment({ ...editingPayment, amount: parseFloat(e.target.value) || 0 })}
                              className="border border-line rounded-lg2 px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-gold"
                              autoFocus />
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" disabled={updatePayment.isPending}
                              className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">Save</button>
                            <button type="button" onClick={() => setEditingPayment(null)}
                              className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!view?.payments.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Write-offs tab */}
      {tab === "writeoffs" && !isLoading && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-ink-dim">Total written off: <strong className="text-err">{inr(totalWriteoff)}</strong></p>
            <Link href={`/writeoff?customer=${id}`} className="bg-err text-white text-xs px-3 py-1.5 rounded-lg2 hover:opacity-90">
              + {t("writeoff")}
            </Link>
          </div>
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("date")}</th>
                <th className="text-right px-3 py-2.5">{t("amount")}</th>
                <th className="text-left px-3 py-2.5">{t("notes")}</th>
              </tr></thead>
              <tbody>
                {view?.writeoffs.map((w) => (
                  <tr key={w.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(w.scrap_date)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-err">{inr(w.amount)}</td>
                    <td className="px-3 py-2.5 text-ink-dim text-xs">{w.notes}</td>
                  </tr>
                ))}
                {!view?.writeoffs.length && <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info tab */}
      {tab === "info" && customer && (
        <div className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-3 text-sm">
          <div><span className="text-ink-dim">{t("address")}: </span>{customer.address || "—"}</div>
          <div><span className="text-ink-dim">{t("opening_balance")}: </span>{inr(customer.opening_balance)}</div>
          <div><span className="text-ink-dim">Member since: </span>{shortDate(customer.created_at.split("T")[0])}</div>
          {customer.notes && <div><span className="text-ink-dim">{t("notes")}: </span>{customer.notes}</div>}
        </div>
      )}
    </div>
  );
}
