"use client";

import { Fragment, use, useState } from "react";
import Link from "next/link";
import { useSupplier360, useSaveSupplierPurchase, useSaveSupplierPayment, useConfirmSuspenseVa } from "@/modules/suppliers/api";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, grams, shortDate } from "@/lib/format";

const TABS = ["purchases", "payments", "suspense"] as const;
type Tab = (typeof TABS)[number];

const PAY_MODES = ["cash", "upi", "bank", "old_gold", "old_silver"];
const METALS = ["gold_22k", "gold_24k", "gold_18k", "silver", "silver_pure"];

const inp = "w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function Supplier360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const [tab, setTab] = useState<Tab>("purchases");
  const { data: view, isLoading } = useSupplier360(id);
  const savePurchase = useSaveSupplierPurchase();
  const savePayment = useSaveSupplierPayment();
  const confirmVa = useConfirmSuspenseVa();

  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ purchase_date: globalDate, bill_no: "", metal: "gold_22k", gross_wt: 0, purity_pct: 91.6, rate: 0, amount: 0, notes: "" });

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, cut_rate: 0, notes: "" });

  // Suspense VA% editing
  const [editingVa, setEditingVa] = useState<{ id: string; gross_wt: number; purity_pct: number; va_pct: number } | null>(null);

  // Cash balance — only formal purchases vs pure cash payments (payments with metal_wt are metal settlements, tracked in metal balance)
  const totalPurchased = view?.purchases.reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0;
  const totalPaid = view?.payments.filter((p: any) => !(p.metal_wt > 0)).reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0;
  const cashBalance = totalPurchased - totalPaid;

  // Metal balance — confirmed suspense pure wt minus metal dispatched to this supplier
  const metalOwedG = view?.suspense
    .filter((s: any) => s.supplier_confirmed)
    .reduce((acc: number, s: any) => acc + (Number(s.supplier_pure_wt) || 0), 0) ?? 0;
  const metalPhysicalG = view?.dispatches?.reduce((acc: number, d: any) => acc + (Number(d.weight_g) || 0), 0) ?? 0;
  const metalCashG = view?.payments?.filter((p: any) => (p.metal_wt ?? 0) > 0).reduce((acc: number, p: any) => acc + (Number(p.metal_wt) || 0), 0) ?? 0;
  const metalSentG = metalPhysicalG + metalCashG;
  const metalBalanceG = metalOwedG - metalSentG;

  async function handlePurchaseSave(e: React.FormEvent) {
    e.preventDefault();
    const pure_wt = purchaseForm.gross_wt * (purchaseForm.purity_pct / 100);
    await savePurchase.mutateAsync({ ...purchaseForm, supplier_id: id, pure_wt });
    setShowPurchaseForm(false);
  }

  async function handlePaymentSave(e: React.FormEvent) {
    e.preventDefault();
    await savePayment.mutateAsync({ ...paymentForm, supplier_id: id });
    setPaymentForm({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, cut_rate: 0, notes: "" });
    setShowPaymentForm(false);
  }

  async function handleConfirmVa(e: React.FormEvent) {
    e.preventDefault();
    if (!editingVa) return;
    await confirmVa.mutateAsync({ itemId: editingVa.id, supplierId: id, va_pct: editingVa.va_pct });
    setEditingVa(null);
  }

  const vaPreview = editingVa
    ? editingVa.gross_wt * (editingVa.purity_pct + editingVa.va_pct) / 100
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/suppliers" className="text-gold hover:underline text-sm">← {t("suppliers")}</Link>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-line p-5 shadow-soft grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-ink-dim">{t("cash_balance")}</p>
          <p className={`text-xl font-bold ${cashBalance > 0 ? "text-err" : "text-ok"}`}>{inr(cashBalance)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-dim">Total Purchased</p>
          <p className="text-xl font-bold text-ink">{inr(totalPurchased)}</p>
        </div>
        <div>
          <p className="text-xs text-ink-dim">Metal Balance</p>
          <p className={`text-xl font-bold font-mono ${metalBalanceG > 0 ? "text-err" : metalBalanceG < 0 ? "text-ok" : "text-ink"}`}>
            {grams(Math.abs(metalBalanceG))}
          </p>
          {metalOwedG > 0 && (
            <p className="text-xs text-ink-dim mt-0.5">
              Owed {grams(metalOwedG)} · Sent {grams(metalPhysicalG)} + Cash {grams(metalCashG)}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-ink-dim">Suspense Items</p>
          <p className="text-xl font-bold text-warn">{view?.suspense.length ?? 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${tab === tb ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"}`}>
            {tb}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-ink-dim text-sm">{t("loading")}</p>}

      {/* Purchases */}
      {tab === "purchases" && !isLoading && (
        <div className="space-y-3">
          <button onClick={() => setShowPurchaseForm(!showPurchaseForm)} className="text-xs text-gold hover:underline">+ Add Purchase</button>
          {showPurchaseForm && (
            <form onSubmit={handlePurchaseSave} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label className="text-xs text-ink-dim">Date</label>
                  <input type="date" value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} className={inp} /></div>
                <div><label className="text-xs text-ink-dim">Metal</label>
                  <select value={purchaseForm.metal} onChange={(e) => setPurchaseForm({ ...purchaseForm, metal: e.target.value })} className={inp}>
                    {METALS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></div>
                {[
                  { label: "Gross Wt", key: "gross_wt", step: "0.001" },
                  { label: "Purity%", key: "purity_pct", step: "0.01" },
                  { label: "Rate/g", key: "rate", step: "0.01" },
                  { label: "Amount", key: "amount", step: "0.01" },
                ].map((f) => (
                  <div key={f.key}><label className="text-xs text-ink-dim">{f.label}</label>
                    <input type="number" step={f.step} value={(purchaseForm as any)[f.key]}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, [f.key]: parseFloat(e.target.value) || 0 })}
                      className={inp} /></div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2">{t("save")}</button>
                <button type="button" onClick={() => setShowPurchaseForm(false)} className="border border-line text-sm px-4 py-1.5 rounded-lg2">{t("cancel")}</button>
              </div>
            </form>
          )}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Gross</th>
                <th className="text-right px-3 py-2.5">{t("amount")}</th>
              </tr></thead>
              <tbody>
                {view?.purchases.map((p: any) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.purchase_date)}</td>
                    <td className="px-3 py-2.5 capitalize">{p.metal?.replace("_", " ")}</td>
                    <td className="px-3 py-2.5 text-right">{grams(p.gross_wt ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(p.amount)}</td>
                  </tr>
                ))}
                {!view?.purchases.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments */}
      {tab === "payments" && !isLoading && (
        <div className="space-y-3">
          <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="text-xs text-gold hover:underline">+ Add Payment</button>
          {showPaymentForm && (
            <form onSubmit={handlePaymentSave} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label className="text-xs text-ink-dim">Date</label>
                  <input type="date" value={paymentForm.pay_date} onChange={(e) => setPaymentForm({ ...paymentForm, pay_date: e.target.value })} className={inp} /></div>
                <div><label className="text-xs text-ink-dim">Mode</label>
                  <select value={paymentForm.mode} onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })} className={inp}>
                    {PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    <option value="cut_rate">Cut Rate</option>
                  </select></div>
                <div><label className="text-xs text-ink-dim">Amount</label>
                  <input type="number" step="0.01" value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                    className={inp} /></div>
                {(paymentForm.mode === "cash" || paymentForm.mode === "bank" || paymentForm.mode === "upi") && (
                  <>
                    <div><label className="text-xs text-ink-dim">Metal Wt g <span className="text-ink-dim/50">(opt)</span></label>
                      <input type="number" step="0.001" value={paymentForm.metal_wt || ""}
                        onChange={(e) => {
                          const wt = parseFloat(e.target.value) || 0;
                          setPaymentForm((f) => ({ ...f, metal_wt: wt, amount: f.cut_rate > 0 && wt > 0 ? Math.round(wt * f.cut_rate * 100) / 100 : f.amount }));
                        }}
                        className={inp} /></div>
                    <div><label className="text-xs text-ink-dim">Rate/g <span className="text-ink-dim/50">(opt)</span></label>
                      <input type="number" step="0.01" value={paymentForm.cut_rate || ""}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          setPaymentForm((f) => ({ ...f, cut_rate: rate, amount: f.metal_wt > 0 && rate > 0 ? Math.round(f.metal_wt * rate * 100) / 100 : f.amount }));
                        }}
                        className={inp} /></div>
                  </>
                )}
                {(paymentForm.mode === "old_gold" || paymentForm.mode === "old_silver") && (
                  <>
                    <div><label className="text-xs text-ink-dim">Metal Wt</label>
                      <input type="number" step="0.001" value={paymentForm.metal_wt}
                        onChange={(e) => setPaymentForm({ ...paymentForm, metal_wt: parseFloat(e.target.value) || 0 })}
                        className={inp} /></div>
                    <div><label className="text-xs text-ink-dim">Purity%</label>
                      <input type="number" step="0.01" value={paymentForm.metal_purity}
                        onChange={(e) => setPaymentForm({ ...paymentForm, metal_purity: parseFloat(e.target.value) || 0 })}
                        className={inp} /></div>
                  </>
                )}
                {paymentForm.mode === "cut_rate" && (
                  <div><label className="text-xs text-ink-dim">Cut Rate/g</label>
                    <input type="number" step="0.01" value={paymentForm.cut_rate}
                      onChange={(e) => setPaymentForm({ ...paymentForm, cut_rate: parseFloat(e.target.value) || 0 })}
                      className={inp} /></div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2">{t("save")}</button>
                <button type="button" onClick={() => setShowPaymentForm(false)} className="border border-line text-sm px-4 py-1.5 rounded-lg2">{t("cancel")}</button>
              </div>
            </form>
          )}

          {/* Cash payments */}
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Cash / Bank Payments</p>
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5">Mode</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Metal Wt</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Rate/g</th>
                <th className="text-right px-3 py-2.5">{t("amount")}</th>
              </tr></thead>
              <tbody>
                {view?.payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                    <td className="px-3 py-2.5 capitalize">{p.mode}</td>
                    <td className="px-3 py-2.5 text-right hidden sm:table-cell text-ink-dim">{p.metal_wt ? grams(p.metal_wt) : "—"}</td>
                    <td className="px-3 py-2.5 text-right hidden sm:table-cell text-ink-dim">{p.cut_rate ? inr(p.cut_rate) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-err">{inr(p.amount)}</td>
                  </tr>
                ))}
                {!view?.payments.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Metal dispatches sent to this supplier */}
          {(view?.dispatches?.length ?? 0) > 0 && (
            <>
              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mt-2">Metal Sent (from Metal Flow)</p>
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">{t("date")}</th>
                    <th className="text-left px-3 py-2.5">Metal</th>
                    <th className="text-right px-3 py-2.5">Weight</th>
                    <th className="text-left px-3 py-2.5">Notes</th>
                  </tr></thead>
                  <tbody>
                    {view?.dispatches?.map((d: any) => (
                      <tr key={d.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim">{shortDate(d.dispatch_date)}</td>
                        <td className="px-3 py-2.5 capitalize">{d.metal}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ok">{grams(d.weight_g)}</td>
                        <td className="px-3 py-2.5 text-ink-dim text-xs">{d.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-canvas border-t border-line flex justify-between text-xs font-semibold">
                  <span>Total metal sent</span>
                  <span className="font-mono text-ok">{grams(metalSentG)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Suspense */}
      {tab === "suspense" && !isLoading && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Bill</th>
                <th className="text-left px-3 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5">Description</th>
                <th className="text-right px-3 py-2.5">Gross</th>
                <th className="text-right px-3 py-2.5">Pure Wt Owed</th>
                <th className="px-3 py-2.5"></th>
              </tr></thead>
              <tbody>
                {view?.suspense.map((s: any) => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2.5 font-mono text-info">{s.bill_no}</td>
                      <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                      <td className="px-3 py-2.5">{s.description}</td>
                      <td className="px-3 py-2.5 text-right">{grams(s.gross_wt ?? 0)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {s.supplier_confirmed
                          ? <span className="text-ok font-mono">{grams(s.supplier_pure_wt ?? 0)}</span>
                          : <span className="text-ink-dim">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!s.supplier_confirmed && (
                          <button
                            onClick={() => setEditingVa({ id: s.id, gross_wt: s.gross_wt ?? 0, purity_pct: s.purity_pct ?? 92, va_pct: 0 })}
                            className="text-xs text-gold hover:underline">
                            Set VA%
                          </button>
                        )}
                        {s.supplier_confirmed && (
                          <span className="text-xs text-ok">✓ {s.supplier_va_pct}%</span>
                        )}
                      </td>
                    </tr>
                    {editingVa !== null && editingVa.id === s.id && (
                      <tr className="border-b border-line bg-canvas/50">
                        <td colSpan={6} className="px-4 py-3">
                          <form onSubmit={handleConfirmVa} className="flex items-end gap-3 flex-wrap">
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Gross Wt</label>
                              <p className="text-sm font-mono">{grams(editingVa.gross_wt)}</p>
                            </div>
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Base Purity%</label>
                              <input type="number" step="0.01" value={editingVa.purity_pct}
                                onChange={(e) => setEditingVa({ ...editingVa, purity_pct: parseFloat(e.target.value) || 0 })}
                                className="border border-line rounded-lg2 px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-gold" />
                            </div>
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Supplier VA%</label>
                              <input type="number" step="0.01" value={editingVa.va_pct}
                                onChange={(e) => setEditingVa({ ...editingVa, va_pct: parseFloat(e.target.value) || 0 })}
                                className="border border-line rounded-lg2 px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-gold"
                                autoFocus />
                            </div>
                            <div>
                              <label className="text-xs text-ink-dim block mb-1">Effective% = Pure Wt</label>
                              <p className="text-sm font-mono text-info">
                                {(editingVa.purity_pct + editingVa.va_pct).toFixed(2)}% = {grams(vaPreview)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={confirmVa.isPending}
                                className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                                Confirm
                              </button>
                              <button type="button" onClick={() => setEditingVa(null)}
                                className="border border-line text-xs px-3 py-1.5 rounded-lg2">
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!view?.suspense.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>
          {metalOwedG > 0 && (
            <div className="bg-canvas rounded-xl border border-line px-4 py-3 flex justify-between text-sm">
              <span className="text-ink-dim">Total metal owed to supplier</span>
              <span className="font-mono font-semibold text-err">{grams(metalOwedG)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
