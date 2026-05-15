"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n";
import { useGlobalDate } from "@/stores/global-date";
import { useBoardRate } from "@/stores/board-rate";
import { computeLine, distributeTotalByVa, rateForMetal } from "@/lib/sales-calc";
import { inr, grams } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import SupplierPicker from "@/modules/suppliers/supplier-picker";
import type { Supplier } from "@/modules/suppliers/supplier-picker";
import { useSaveSale, useUpdateSale, useSale } from "./api";
import type { SaleDraft, SaleItemDraft, SalePaymentDraft, Metal, PaymentMode, SaleSeries } from "./types";
import type { Customer } from "@/modules/customers/types";
import { clsx } from "clsx";

const inp = "w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function Num({ value, onChange, step = "0.01", className, placeholder }: {
  value: number; onChange: (v: number) => void;
  step?: string; className?: string; placeholder?: string;
}) {
  return (
    <input type="number" step={step}
      value={value || ""}
      placeholder={placeholder ?? "0"}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className={className ?? inp}
    />
  );
}

const SERIES_OPTIONS: { value: SaleSeries; label: string }[] = [
  { value: "G22", label: "Gold 22K (G22)" },
  { value: "G18", label: "Gold 18K (G18)" },
  { value: "G24", label: "Gold 24K (G24)" },
  { value: "S",   label: "Silver (S)" },
  { value: "D",   label: "Diamond (D)" },
];

const METALS: { value: Metal; label: string }[] = [
  { value: "gold_22k",    label: "Gold 22K" },
  { value: "gold_24k",    label: "Gold 24K" },
  { value: "gold_18k",    label: "Gold 18K" },
  { value: "silver",      label: "Silver" },
  { value: "silver_pure", label: "Silver Pure" },
  { value: "silver_mpr",  label: "Silver MPR" },
];

const PAY_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash",       label: "Cash" },
  { value: "upi",        label: "UPI/GPay" },
  { value: "bank",       label: "Bank" },
  { value: "old_gold",   label: "Old Gold" },
  { value: "old_silver", label: "Old Silver" },
  { value: "advance",    label: "Advance" },
];

function defaultMetalForSeries(series: SaleSeries): Metal {
  if (series === "G18") return "gold_18k";
  if (series === "G24") return "gold_24k";
  if (series === "S")   return "silver";
  return "gold_22k";
}

function defaultPurityForMetal(metal: Metal): number {
  if (metal === "gold_22k") return 91.6;
  if (metal === "gold_24k") return 99.9;
  if (metal === "gold_18k") return 75;
  if (metal === "silver")   return 92.5;
  return 99.9;
}

function newItem(series: SaleSeries = "G22", boardRate: import("@/lib/sales-calc").BoardRate | null = null): SaleItemDraft {
  const metal = defaultMetalForSeries(series);
  const rate = boardRate ? rateForMetal(boardRate, metal) : 0;
  return {
    id: crypto.randomUUID(),
    description: "", metal, gross_wt: 0, stone_wt: 0,
    purity_pct: defaultPurityForMetal(metal), rate, va_pct: 0, making_amt: 0,
    show_stone: false, stone_amt: 0,
    show_diamond: false, diamond_amt: 0, diamond_carat_rate: 0, diamond_cents: 0,
    gst_enabled: true, gst_pct: 3,
    is_value_entry: metal === "silver_mpr",
    is_suspense: false, supplier_id: null, supplier_name: null,
    net_wt: 0, pure_wt: 0, line_total: 0,
  };
}

function newPayment(): SalePaymentDraft {
  return { id: crypto.randomUUID(), mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false };
}

interface Props { saleId?: string }

export default function SaleForm({ saleId }: Props) {
  const t = useT();
  const router = useRouter();
  const globalDate = useGlobalDate((s) => s.date);
  const boardRate = useBoardRate((s) => s.rate);
  const saveSale = useSaveSale();
  const updateSale = useUpdateSale();
  const { data: existingSale, isLoading: loadingExisting } = useSale(saleId ?? null);

  const [series, setSeries] = useState<SaleSeries>("G22");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [billDate, setBillDate] = useState(globalDate);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SaleItemDraft[]>(() => [newItem("G22")]);
  const [payments, setPayments] = useState<SalePaymentDraft[]>([newPayment()]);
  const [desiredTotal, setDesiredTotal] = useState(0);

  // Auto-fill rates when board rate loads (form opens before boardRate is ready)
  useEffect(() => {
    if (!boardRate) return;
    setItems((prev) => prev.map((item) => {
      if (item.rate !== 0 || item.is_value_entry) return item;
      const rate = rateForMetal(boardRate, item.metal);
      if (!rate) return item;
      return { ...item, rate, ...computeLine({ ...item, rate }) };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardRate]);

  useEffect(() => {
    if (!existingSale) return;
    const { sale, items: dbItems, payments: dbPayments } = existingSale;
    setSeries((sale.series as SaleSeries) || "G22");
    setBillDate(sale.bill_date);
    setNotes(sale.notes ?? "");
    if (sale.customers) {
      setCustomer({
        id: sale.customer_id, name: sale.customers.name,
        phone: sale.customers.phone ?? null, address: null,
        opening_balance: 0, gold_balance_g: 0, silver_balance_g: 0,
        notes: null, created_at: "",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setItems(dbItems.map((item: any) => ({
      id: crypto.randomUUID(),
      description: item.description,
      metal: item.metal as Metal,
      gross_wt: item.gross_wt,
      stone_wt: item.stone_wt,
      purity_pct: item.purity_pct,
      rate: item.rate,
      va_pct: item.va_pct,
      making_amt: item.making_amt,
      show_stone: item.stone_wt > 0 || item.stone_amt > 0,
      stone_amt: item.stone_amt,
      show_diamond: item.diamond_amt > 0,
      diamond_amt: item.diamond_amt,
      diamond_carat_rate: 0,
      diamond_cents: 0,
      gst_enabled: item.gst_pct > 0,
      gst_pct: item.gst_pct || 3,
      is_value_entry: item.metal === "silver_mpr",
      is_suspense: item.is_suspense,
      supplier_id: item.supplier_id,
      supplier_name: null,
      net_wt: item.net_wt,
      pure_wt: item.pure_wt,
      line_total: item.line_total,
    })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPayments(dbPayments.map((p: any) => ({
      id: crypto.randomUUID(),
      mode: p.mode as PaymentMode,
      amount: p.amount,
      metal_wt: p.metal_wt ?? 0,
      metal_purity: p.metal_purity ?? 91.6,
      is_advance: p.is_advance,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSale?.sale?.id]);

  function updateItem(idx: number, patch: Partial<SaleItemDraft>) {
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const merged = { ...item, ...patch };

      if (patch.metal !== undefined && boardRate) {
        merged.rate = rateForMetal(boardRate, patch.metal);
        merged.is_value_entry = patch.metal === "silver_mpr";
        merged.purity_pct = defaultPurityForMetal(patch.metal as Metal);
      }

      if (merged.is_value_entry) return merged;

      // Recompute diamond_amt from cents when carat_rate or cents change
      if (merged.show_diamond && merged.diamond_cents > 0) {
        merged.diamond_amt = (merged.diamond_cents / 100) * merged.diamond_carat_rate;
      }
      merged.gst_pct = merged.gst_enabled ? 3 : 0;
      const computed = computeLine(merged);
      return { ...merged, ...computed };
    }));
  }

  function handleDistribute() {
    if (!desiredTotal) return;
    const nonMpr = items.filter((i) => !i.is_value_entry);
    const mprTotal = items.filter((i) => i.is_value_entry).reduce((s, i) => s + i.line_total, 0);
    const target = desiredTotal - mprTotal;
    const computed = nonMpr.map((item) => ({ ...item, ...computeLine(item) }));
    const adjusted = distributeTotalByVa(computed, target);
    const adjMap = new Map(nonMpr.map((item, j) => [item.id, adjusted[j]]));
    setItems((prev) => prev.map((item) => {
      if (item.is_value_entry) return item;
      const adj = adjMap.get(item.id);
      if (!adj) return item;
      return { ...item, ...adj, ...computeLine(adj) };
    }));
  }

  const grandTotal = items.reduce((s, i) => s + i.line_total, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = grandTotal - totalPaid;
  const isPending = saveSale.isPending || updateSale.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (balance > 0.01 && !customer) return; // blocked by UI error below
    const draft: SaleDraft = {
      series, customer_id: customer?.id ?? null, bill_date: billDate, notes,
      items, payments: payments.filter((p) => p.amount > 0),
    };
    if (saleId) {
      await updateSale.mutateAsync({ id: saleId, draft });
    } else {
      await saveSale.mutateAsync(draft);
    }
    router.push("/sales");
  }

  if (saleId && loadingExisting) return <p className="text-ink-dim text-sm p-6">Loading…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">Series</label>
          <select value={series}
            onChange={(e) => setSeries(e.target.value as SaleSeries)}
            className={inp}>
            {SERIES_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("customers")}</label>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("date")}</label>
          <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inp} />
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-ink">Items</h3>
          <button type="button" onClick={() => setItems((p) => [...p, newItem(series, boardRate)])}
            className="text-xs text-gold hover:underline">+ {t("add_item")}</button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">

              {/* Row 1: Description + Metal + Rate/Purity or Direct Value */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim">Description</label>
                  <input value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="Item description" className={inp} />
                </div>
                <div>
                  <label className="text-xs text-ink-dim">Metal</label>
                  <select value={item.metal ?? ""} onChange={(e) => updateItem(idx, { metal: e.target.value as Metal })} className={inp}>
                    {METALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                {!item.is_value_entry ? (
                  <>
                    <div>
                      <label className="text-xs text-ink-dim">Purity%</label>
                      <Num value={item.purity_pct} onChange={(v) => updateItem(idx, { purity_pct: v })} step="0.01" />
                    </div>
                    <div>
                      <label className="text-xs text-ink-dim">Rate/g</label>
                      <Num value={item.rate} onChange={(v) => updateItem(idx, { rate: v })} step="0.01" />
                    </div>
                  </>
                ) : (
                  <div className="col-span-2">
                    <label className="text-xs text-ink-dim">Item Value (₹) <span className="text-gold">— direct entry</span></label>
                    <Num value={item.line_total} onChange={(v) => updateItem(idx, { line_total: v })} step="0.01" />
                  </div>
                )}
              </div>

              {/* Row 2: Weights + VA + Making + Toggles (only for non-MPR) */}
              {!item.is_value_entry && (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                  <div>
                    <label className="text-xs text-ink-dim">Gross Wt (g)</label>
                    <Num value={item.gross_wt} onChange={(v) => updateItem(idx, { gross_wt: v })} step="0.001" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim">VA%</label>
                    <Num value={Math.round(item.va_pct * 100) / 100} onChange={(v) => updateItem(idx, { va_pct: v })} step="0.01" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim">Making (₹)</label>
                    <Num value={item.making_amt} onChange={(v) => updateItem(idx, { making_amt: v })} step="0.01" />
                  </div>
                  <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center gap-2 pt-4">
                    <label className={clsx("flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1.5 rounded-lg2 border", item.gst_enabled ? "bg-ok/10 border-ok text-ok" : "border-line text-ink-dim")}>
                      <input type="checkbox" checked={item.gst_enabled} onChange={(e) => updateItem(idx, { gst_enabled: e.target.checked })} className="accent-gold" />
                      GST 3%
                    </label>
                    <button type="button" onClick={() => updateItem(idx, { show_stone: !item.show_stone })}
                      className={clsx("text-xs px-2.5 py-1.5 rounded-lg2 border transition-colors", item.show_stone ? "bg-info/10 border-info text-info" : "border-line text-ink-dim hover:border-gold hover:text-gold")}>
                      {item.show_stone ? "✓ Stone" : "+ Stone"}
                    </button>
                    <button type="button" onClick={() => updateItem(idx, { show_diamond: !item.show_diamond })}
                      className={clsx("text-xs px-2.5 py-1.5 rounded-lg2 border transition-colors", item.show_diamond ? "bg-warn/10 border-warn text-warn" : "border-line text-ink-dim hover:border-gold hover:text-gold")}>
                      {item.show_diamond ? "✓ Diamond" : "+ Diamond"}
                    </button>
                  </div>
                </div>
              )}

              {/* Silver MPR: optional gross weight */}
              {item.is_value_entry && (
                <div className="w-36">
                  <label className="text-xs text-ink-dim">Gross Wt (optional)</label>
                  <Num value={item.gross_wt} onChange={(v) => updateItem(idx, { gross_wt: v })} step="0.001" />
                </div>
              )}

              {/* Stone section */}
              {item.show_stone && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-canvas rounded-lg2 p-3 border border-line">
                  <div>
                    <label className="text-xs text-ink-dim">Stone Wt (g)</label>
                    <Num value={item.stone_wt} onChange={(v) => updateItem(idx, { stone_wt: v })} step="0.001" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim">Stone Charge (₹)</label>
                    <Num value={item.stone_amt} onChange={(v) => updateItem(idx, { stone_amt: v })} step="0.01" />
                  </div>
                </div>
              )}

              {/* Diamond section */}
              {item.show_diamond && (
                <div className="grid grid-cols-3 gap-2 bg-canvas rounded-lg2 p-3 border border-line">
                  <div>
                    <label className="text-xs text-ink-dim">Carat Rate (₹/ct)</label>
                    <Num value={item.diamond_carat_rate} onChange={(v) => updateItem(idx, { diamond_carat_rate: v })} step="1" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim">Cents (100 = 1ct)</label>
                    <Num value={item.diamond_cents} onChange={(v) => updateItem(idx, { diamond_cents: v })} step="0.01" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim">Diamond Value (₹)</label>
                    <Num value={item.diamond_amt} onChange={(v) => updateItem(idx, { diamond_amt: v, diamond_cents: 0 })} step="0.01" />
                  </div>
                  {item.diamond_cents > 0 && item.diamond_carat_rate > 0 && (
                    <p className="col-span-3 text-xs text-ink-dim">
                      {item.diamond_cents} cents × ₹{item.diamond_carat_rate}/ct = <strong>{inr(item.diamond_amt)}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Item footer: totals + suspense */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-line">
                <div className="flex items-center gap-4 text-xs text-ink-dim">
                  {!item.is_value_entry && (
                    <>
                      <span>Net: <strong>{grams(item.net_wt)}</strong></span>
                      <span>Pure: <strong>{grams(item.pure_wt)}</strong></span>
                    </>
                  )}
                  <span>Total: <strong className="text-gold text-sm">{inr(item.line_total)}</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={item.is_suspense}
                      onChange={(e) => updateItem(idx, { is_suspense: e.target.checked })} className="accent-gold" />
                    Suspense
                  </label>
                  {item.is_suspense && (
                    <div className="w-44">
                      <SupplierPicker
                        value={item.supplier_id ? { id: item.supplier_id, name: item.supplier_name || "Select…", phone: null } : null}
                        onChange={(s: Supplier) => updateItem(idx, { supplier_id: s.id, supplier_name: s.name })}
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

      {/* VA Distribute */}
      <div className="flex items-center gap-3">
        <Num value={desiredTotal} onChange={setDesiredTotal} step="0.01"
          className="border border-line rounded-lg2 px-3 py-2 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-gold"
          placeholder="Desired total…" />
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
              <select value={p.mode}
                onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, mode: e.target.value as PaymentMode } : x))}
                className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <Num value={p.amount}
                onChange={(v) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: v } : x))}
                step="0.01" className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
              {(p.mode === "old_gold" || p.mode === "old_silver") && (
                <>
                  <Num value={p.metal_wt}
                    onChange={(v) => setPayments((prev) => prev.map((x, i) => {
                      if (i !== idx) return x;
                      const amt = boardRate
                        ? v * (x.metal_purity / 100) * (x.mode === "old_gold" ? boardRate.gold_24k : boardRate.silver_pure)
                        : x.amount;
                      return { ...x, metal_wt: v, amount: Math.round(amt) };
                    }))}
                    step="0.001" className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" placeholder="Weight (g)" />
                  <Num value={p.metal_purity}
                    onChange={(v) => setPayments((prev) => prev.map((x, i) => {
                      if (i !== idx) return x;
                      const amt = boardRate
                        ? x.metal_wt * (v / 100) * (x.mode === "old_gold" ? boardRate.gold_24k : boardRate.silver_pure)
                        : x.amount;
                      return { ...x, metal_purity: v, amount: Math.round(amt) };
                    }))}
                    step="0.01" className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" placeholder="Purity%" />
                </>
              )}
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={p.is_advance}
                  onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, is_advance: e.target.checked } : x))}
                  className="accent-gold" />
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

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-ink-dim mb-1">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} placeholder="Optional notes…" />
      </div>

      {/* Summary + Actions */}
      <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="flex gap-6 text-sm">
            <div><span className="text-ink-dim">Total: </span><strong className="text-gold text-lg">{inr(grandTotal)}</strong></div>
            <div><span className="text-ink-dim">Paid: </span><strong>{inr(totalPaid)}</strong></div>
            <div><span className="text-ink-dim">Balance: </span><strong className={balance > 0.01 ? "text-err" : "text-ok"}>{inr(Math.abs(balance))}</strong></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push("/sales")}
              className="border border-line text-ink-mid text-sm px-5 py-2.5 rounded-lg2 hover:bg-canvas">
              {t("cancel")}
            </button>
            <button type="submit" disabled={isPending || (balance > 0.01 && !customer)}
              className="bg-gold hover:bg-gold-dark text-white font-semibold text-sm px-6 py-2.5 rounded-lg2 disabled:opacity-50">
              {isPending ? "Saving…" : saleId ? "Update Sale" : t("save")}
            </button>
          </div>
        </div>
        {balance > 0.01 && !customer && (
          <p className="text-xs text-err font-medium">
            Balance due &#8212; select a customer to track this amount for follow-up.
          </p>
        )}
      </div>

    </form>
  );
}
