"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n";
import { useGlobalDate } from "@/stores/global-date";
import { useBoardRate } from "@/stores/board-rate";
import { computeLine, distributeTotalByVa, rateForMetal } from "@/lib/sales-calc";
import { inr, grams } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import SupplierPicker from "@/modules/suppliers/supplier-picker";
import { useSaveSale } from "./api";
import type { SaleDraft, SaleItemDraft, SalePaymentDraft, Metal, PaymentMode, SaleSeries } from "./types";
import type { Customer } from "@/modules/customers/types";
import type { Supplier } from "@/modules/suppliers/supplier-picker";
import { clsx } from "clsx";

function newItem(): SaleItemDraft {
  return {
    id: crypto.randomUUID(),
    description: "", metal: "gold_22k", gross_wt: 0, stone_wt: 0,
    purity_pct: 91.6, rate: 0, va_pct: 0, making_amt: 0,
    stone_amt: 0, diamond_amt: 0, gst_pct: 3,
    is_suspense: false, supplier_id: null,
    net_wt: 0, pure_wt: 0, line_total: 0,
  };
}

function newPayment(): SalePaymentDraft {
  return { id: crypto.randomUUID(), mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false };
}

const METALS: { value: Metal; label: string }[] = [
  { value: "gold_22k", label: "Gold 22K" },
  { value: "gold_24k", label: "Gold 24K" },
  { value: "gold_18k", label: "Gold 18K" },
  { value: "silver", label: "Silver" },
  { value: "silver_pure", label: "Silver Pure" },
];

const PAY_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI/Paytm/GPay" },
  { value: "bank", label: "Bank" },
  { value: "old_gold", label: "Old Gold" },
  { value: "old_silver", label: "Old Silver" },
  { value: "advance", label: "Advance" },
];

export default function SaleForm() {
  const t = useT();
  const router = useRouter();
  const globalDate = useGlobalDate((s) => s.date);
  const boardRate = useBoardRate((s) => s.rate);
  const saveSale = useSaveSale();

  const [series, setSeries] = useState<SaleSeries>("G");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [billDate, setBillDate] = useState(globalDate);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SaleItemDraft[]>([newItem()]);
  const [payments, setPayments] = useState<SalePaymentDraft[]>([newPayment()]);
  const [desiredTotal, setDesiredTotal] = useState("");

  function updateItem(idx: number, patch: Partial<SaleItemDraft>) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const merged = { ...item, ...patch };
      // Auto-fill rate from board
      if (patch.metal && boardRate) {
        merged.rate = rateForMetal(boardRate, patch.metal);
        if (patch.metal === "gold_22k") merged.purity_pct = 91.6;
        else if (patch.metal === "gold_24k") merged.purity_pct = 99.9;
        else if (patch.metal === "gold_18k") merged.purity_pct = 75;
        else if (patch.metal === "silver") merged.purity_pct = 92.5;
        else if (patch.metal === "silver_pure") merged.purity_pct = 99.9;
      }
      const computed = computeLine(merged);
      return { ...merged, ...computed };
    }));
  }

  function handleDistribute() {
    const total = parseFloat(desiredTotal);
    if (!total) return;
    const computed = items.map((item) => ({ ...item, ...computeLine(item) }));
    const adjusted = distributeTotalByVa(computed, total);
    setItems(adjusted.map((a, i) => {
      const c = computeLine(a);
      return { ...items[i], ...a, ...c };
    }));
  }

  const grandTotal = items.reduce((s, i) => s + i.line_total, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = grandTotal - totalPaid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const draft: SaleDraft = {
      series, customer_id: customer?.id ?? null, bill_date: billDate, notes,
      items, payments: payments.filter((p) => p.amount > 0),
    };
    await saveSale.mutateAsync(draft);
    router.push("/sales");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
      {/* Header row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">Series</label>
          <select value={series} onChange={(e) => setSeries(e.target.value as SaleSeries)}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
            <option value="G">Gold (G)</option>
            <option value="S">Silver (S)</option>
            <option value="D">Diamond (D)</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("customers")}</label>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("date")}</label>
          <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-ink">Items</h3>
          <button type="button" onClick={() => setItems((p) => [...p, newItem()])}
            className="text-xs text-gold hover:underline">+ {t("add_item")}</button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim">Description</label>
                  <input value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="Item description"
                    className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                </div>
                <div>
                  <label className="text-xs text-ink-dim">Metal</label>
                  <select value={item.metal ?? ""} onChange={(e) => updateItem(idx, { metal: e.target.value as Metal })}
                    className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                    {METALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-ink-dim">Purity%</label>
                  <input type="number" step="0.01" value={item.purity_pct} onChange={(e) => updateItem(idx, { purity_pct: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { label: "Gross Wt", key: "gross_wt" as const, step: "0.001" },
                  { label: "Stone Wt", key: "stone_wt" as const, step: "0.001" },
                  { label: "Rate/g", key: "rate" as const, step: "0.01" },
                  { label: "VA%", key: "va_pct" as const, step: "0.01" },
                  { label: "Making", key: "making_amt" as const, step: "0.01" },
                  { label: "Stone ₹", key: "stone_amt" as const, step: "0.01" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-ink-dim">{f.label}</label>
                    <input type="number" step={f.step} value={(item as any)[f.key]}
                      onChange={(e) => updateItem(idx, { [f.key]: parseFloat(e.target.value) || 0 } as Partial<SaleItemDraft>)}
                      className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4 text-xs text-ink-dim">
                  <span>Net: <strong>{grams(item.net_wt)}</strong></span>
                  <span>Pure: <strong>{grams(item.pure_wt)}</strong></span>
                  <span>Total: <strong className="text-gold">{inr(item.line_total)}</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={item.is_suspense} onChange={(e) => updateItem(idx, { is_suspense: e.target.checked })} className="accent-gold" />
                    Suspense
                  </label>
                  {item.is_suspense && (
                    <div className="w-40">
                      <SupplierPicker
                        value={item.supplier_id ? { id: item.supplier_id, name: "Supplier", phone: null } : null}
                        onChange={(s) => updateItem(idx, { supplier_id: s.id })}
                      />
                    </div>
                  )}
                  {items.length > 1 && (
                    <button type="button" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                      className="text-xs text-err hover:underline">Remove</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* VA distribute */}
      <div className="flex items-center gap-3">
        <input type="number" step="0.01" value={desiredTotal} onChange={(e) => setDesiredTotal(e.target.value)}
          placeholder="Desired total…"
          className="border border-line rounded-lg2 px-3 py-2 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-gold" />
        <button type="button" onClick={handleDistribute}
          className="text-xs bg-gold/10 text-gold border border-gold/30 px-3 py-2 rounded-lg2 hover:bg-gold/20">
          {t("distribute_va")}
        </button>
      </div>

      {/* Payments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-ink">Payments</h3>
          <button type="button" onClick={() => setPayments((p) => [...p, newPayment()])}
            className="text-xs text-gold hover:underline">+ {t("add_payment")}</button>
        </div>
        <div className="space-y-2">
          {payments.map((p, idx) => (
            <div key={p.id} className="bg-white border border-line rounded-xl p-3 shadow-soft flex flex-wrap items-center gap-3">
              <select value={p.mode} onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, mode: e.target.value as PaymentMode } : x))}
                className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <input type="number" step="0.01" value={p.amount} placeholder="Amount"
                onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
              {(p.mode === "old_gold" || p.mode === "old_silver") && (
                <>
                  <input type="number" step="0.001" value={p.metal_wt} placeholder="Weight (g)"
                    onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, metal_wt: parseFloat(e.target.value) || 0 } : x))}
                    className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  <input type="number" step="0.01" value={p.metal_purity} placeholder="Purity%"
                    onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, metal_purity: parseFloat(e.target.value) || 0 } : x))}
                    className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                </>
              )}
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={p.is_advance} onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, is_advance: e.target.checked } : x))} className="accent-gold" />
                Advance
              </label>
              {payments.length > 1 && (
                <button type="button" onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-err hover:underline ml-auto">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white border border-line rounded-xl p-4 shadow-soft flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-6 text-sm">
          <div><span className="text-ink-dim">Total: </span><strong className="text-gold text-lg">{inr(grandTotal)}</strong></div>
          <div><span className="text-ink-dim">Paid: </span><strong>{inr(totalPaid)}</strong></div>
          <div><span className="text-ink-dim">Balance: </span><strong className={balance > 0 ? "text-err" : "text-ok"}>{inr(balance)}</strong></div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.push("/sales")} className="border border-line text-ink-mid text-sm px-5 py-2.5 rounded-lg2 hover:bg-canvas">
            {t("cancel")}
          </button>
          <button type="submit" disabled={saveSale.isPending} className="bg-gold hover:bg-gold-dark text-white font-semibold text-sm px-6 py-2.5 rounded-lg2 disabled:opacity-50">
            {saveSale.isPending ? "Saving…" : t("save")}
          </button>
        </div>
      </div>
    </form>
  );
}
