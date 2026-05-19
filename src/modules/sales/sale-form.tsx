"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { useGlobalDate } from "@/stores/global-date";
import { useBoardRate } from "@/stores/board-rate";
import { computeLine, distributeTotalByVa, rateForMetal } from "@/lib/sales-calc";
import { inr, grams } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import SupplierPicker from "@/modules/suppliers/supplier-picker";
import type { Supplier } from "@/modules/suppliers/supplier-picker";
import { useSaveSale, useUpdateSale, useSale } from "./api";
import type { SaleDraft, SaleItemDraft, SalePaymentDraft, Metal, PaymentMode, SaleSeries, SaleType } from "./types";
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
  { value: "chit_metal", label: "Chit Metal" },
];

function defaultMetalForSeries(series: SaleSeries): Metal {
  if (series === "G18") return "gold_18k";
  if (series === "G24") return "gold_24k";
  if (series === "S")   return "silver";
  return "gold_22k";
}

function seriesForMetal(metal: Metal): SaleSeries {
  if (metal === "gold_18k")  return "G18";
  if (metal === "gold_24k")  return "G24";
  if (metal === "silver" || metal === "silver_pure" || metal === "silver_mpr") return "S";
  return "G22";
}

const GOLD_METALS: Metal[] = ["gold_22k", "gold_18k", "gold_24k"];
const SILVER_METALS: Metal[] = ["silver", "silver_pure", "silver_mpr"];

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
  return { id: crypto.randomUUID(), mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, rate: 0, is_advance: false };
}

function ChitHint({ customer, metalWt }: { customer: Customer | null; metalWt: number }) {
  if (!customer) return <span className="text-xs text-err">Select customer</span>;
  const avail = Number(customer.gold_balance_g) || 0;
  return (
    <span className={`text-xs font-medium ${metalWt > avail ? "text-err" : "text-ok"}`}>
      Avail: {grams(avail)}
    </span>
  );
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
  const [changeDueMode, setChangeDueMode] = useState<"cash_back" | "advance" | null>(null);
  const [changePayoutMode, setChangePayoutMode] = useState<"cash" | "bank">("cash");
  const [saleType, setSaleType] = useState<SaleType>("fresh");
  const [exchangeRefBill, setExchangeRefBill] = useState("");

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
    setSaleType((sale.sale_type as SaleType) ?? "fresh");
    setExchangeRefBill(sale.exchange_ref_bill ?? "");
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
      rate: p.rate ?? 0,
      is_advance: p.is_advance,
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSale?.sale?.id]);

  function updateItem(idx: number, patch: Partial<SaleItemDraft>) {
    // Auto-update series when the first item's metal changes
    if (patch.metal !== undefined) {
      setSeries(seriesForMetal(patch.metal as Metal));
    }
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

  function applyChitVaBenefit() {
    const chitPayment = payments.find((p: SalePaymentDraft) => p.mode === "chit_metal");
    if (!chitPayment || chitPayment.amount <= 0) return;
    const chitAmt = chitPayment.amount;
    setItems((prev: SaleItemDraft[]) => {
      let remaining = chitAmt; // inside updater — safe against React StrictMode double-invoke
      return prev.map((item: SaleItemDraft) => {
        if (item.is_value_entry || remaining <= 0) return item;
        const atZeroVa = computeLine({ ...item, va_pct: 0 });
        if (remaining >= atZeroVa.line_total) {
          // Chit covers this whole item — zero VA
          remaining -= atZeroVa.line_total;
          return { ...item, va_pct: 0, ...atZeroVa };
        }
        // Partial coverage: compute VA% so item total == remaining, then exhaust
        const gstRate = item.gst_enabled ? ((item.gst_pct || 3) / 100) : 0;
        const targetBeforeGst = remaining / (1 + gstRate);
        const metalVal = atZeroVa.net_wt * item.rate;
        const vaAmt = Math.max(0, targetBeforeGst - metalVal - item.making_amt);
        const partialVaPct = metalVal > 0 ? (vaAmt / metalVal) * 100 : 0;
        remaining = 0;
        const partial = computeLine({ ...item, va_pct: partialVaPct });
        return { ...item, va_pct: partialVaPct, ...partial };
      });
    });
  }

  const grandTotal = items.reduce((s: number, i: SaleItemDraft) => s + i.line_total, 0);
  const totalPaid = payments.reduce((s: number, p: SalePaymentDraft) => s + p.amount, 0);
  const chitTotal = payments
    .filter((p: SalePaymentDraft) => p.mode === "chit_metal")
    .reduce((s: number, p: SalePaymentDraft) => s + p.amount, 0);
  const rawBalance = grandTotal - totalPaid;
  // When payments exceed bill total, rawBalance is negative → change is owed to customer
  const changeDue = rawBalance < -0.01 ? Math.abs(rawBalance) : 0;
  const balance = changeDue > 0 ? 0 : rawBalance; // balance shown to user is never negative
  const isPending = saveSale.isPending || updateSale.isPending;

  const hasGold   = items.some((i) => GOLD_METALS.includes(i.metal as Metal));
  const hasSilver = items.some((i) => SILVER_METALS.includes(i.metal as Metal));
  const isMixed   = hasGold && hasSilver;

  // Kolusu boxes — only fetched for exchange bills
  const { data: kolusuBoxes = [] } = useQuery({
    queryKey: ["kolusu_boxes"],
    enabled: saleType === "exchange",
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("kolusu_boxes").select("id, box_no, color, size, current_gross_wt_g").order("box_no");
      if (error) throw error;
      return (data ?? []) as { id: string; box_no: string; color: string; size: string; current_gross_wt_g: number }[];
    },
  });

  // Exchange metal flow
  const oldMetalWt = payments.reduce((s, p) =>
    (p.mode === "old_gold" || p.mode === "old_silver") ? s + (p.metal_wt || 0) : s, 0);
  const newItemsWt = items.reduce((s, i) => s + (i.gross_wt || 0), 0);
  const netToShop  = oldMetalWt - newItemsWt;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (balance > 0.01 && !customer) return;
    if (changeDue > 0.01 && !changeDueMode) return;           // must choose
    if (changeDue > 0.01 && changeDueMode === "advance" && !customer) return;
    const draft: SaleDraft = {
      series, customer_id: customer?.id ?? null, bill_date: billDate, notes,
      items, payments: payments.filter((p) => p.amount > 0),
      change_due: changeDue > 0.01 ? changeDue : undefined,
      change_mode: changeDue > 0.01 ? changeDueMode : undefined,
      change_payout_mode: changeDue > 0.01 ? changePayoutMode : undefined,
      sale_type: saleType,
      exchange_ref_bill: saleType === "exchange" && exchangeRefBill ? exchangeRefBill : undefined,
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

      {/* Sale Type Toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-medium text-ink-dim">Sale Type:</span>
        {(["fresh", "exchange"] as const).map((type) => (
          <button key={type} type="button"
            onClick={() => setSaleType(type)}
            className={clsx("px-3 py-1.5 text-xs font-medium rounded-lg2 border transition-colors",
              saleType === type
                ? type === "exchange" ? "bg-warn text-white border-warn" : "bg-gold text-white border-gold"
                : "border-line text-ink-dim hover:border-gold")}>
            {type === "fresh" ? "Fresh Sale" : "Exchange"}
          </button>
        ))}
      </div>

      {/* Exchange Details */}
      {saleType === "exchange" && (
        <div className="bg-warn/5 border border-warn/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-warn">Exchange Details</h3>

          {/* How-to guide */}
          <div className="bg-white rounded-lg2 border border-warn/20 px-3 py-2.5 text-xs text-ink-dim space-y-0.5">
            <p className="font-medium text-ink">How to enter an exchange bill:</p>
            <p>• <strong>Items section below</strong> = new pieces the customer is <strong>taking home</strong> (rings, chains, etc.)</p>
            <p>• <strong>Payments section below</strong> = add <strong>Old Silver / Old Gold</strong> row for the <em>returned piece</em> — enter its weight and the condition (good/damaged) will determine where it goes</p>
            <p>• Any remaining balance the customer pays in cash goes as a normal Cash payment</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-dim mb-1">Original Bill No. (reference)</label>
            <input
              value={exchangeRefBill}
              onChange={(e) => setExchangeRefBill(e.target.value)}
              placeholder="e.g. S/2026-27/0047"
              className={inp}
            />
          </div>

          {/* Metal flow summary — live computed from payments + items */}
          {(oldMetalWt > 0 || newItemsWt > 0) && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg2 px-3 py-2.5 border border-line text-sm">
                <p className="text-xs text-ink-dim mb-0.5">Returned metal (taken in)</p>
                <p className="font-semibold text-warn">{grams(oldMetalWt)}</p>
                <p className="text-xs text-ink-dim">from old gold/silver payments</p>
              </div>
              <div className="bg-white rounded-lg2 px-3 py-2.5 border border-line text-sm">
                <p className="text-xs text-ink-dim mb-0.5">New items going out</p>
                <p className="font-semibold text-gold">{grams(newItemsWt)}</p>
                <p className="text-xs text-ink-dim">total gross weight</p>
              </div>
              <div className="bg-white rounded-lg2 px-3 py-2.5 border border-line text-sm">
                <p className="text-xs text-ink-dim mb-0.5">Net metal to shop</p>
                <p className={clsx("font-semibold", netToShop >= 0 ? "text-ok" : "text-err")}>
                  {grams(Math.abs(netToShop))} {netToShop >= 0 ? "gain" : "loss"}
                </p>
                <p className="text-xs text-ink-dim">{netToShop >= 0 ? "shop keeps this metal" : "shop gave out more"}</p>
              </div>
            </div>
          )}
          {oldMetalWt === 0 && (
            <p className="text-xs text-warn font-medium">
              ↓ Add an Old Silver or Old Gold payment row below and enter the returned item&apos;s weight.
            </p>
          )}
        </div>
      )}

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
              {p.mode === "chit_metal" && (
                <>
                  <Num value={p.metal_wt}
                    onChange={(v) => setPayments((prev: SalePaymentDraft[]) => prev.map((x: SalePaymentDraft, i: number) => {
                      if (i !== idx) return x;
                      return { ...x, metal_wt: v, amount: Math.round(v * (x.rate || 0)) };
                    }))}
                    step="0.001" className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" placeholder="Grams" />
                  <Num value={p.rate}
                    onChange={(v) => setPayments((prev: SalePaymentDraft[]) => prev.map((x: SalePaymentDraft, i: number) => {
                      if (i !== idx) return x;
                      return { ...x, rate: v, amount: Math.round((x.metal_wt || 0) * v) };
                    }))}
                    step="0.01" className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" placeholder="Avg Rate/g" />
                  <ChitHint customer={customer} metalWt={p.metal_wt || 0} />
                </>
              )}
              <label className={clsx("flex items-center gap-1.5 text-xs cursor-pointer", p.mode === "chit_metal" && "hidden")}>
                <input type="checkbox" checked={p.is_advance}
                  onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, is_advance: e.target.checked } : x))}
                  className="accent-gold" />
                Advance
              </label>
              {payments.length > 1 && (
                <button type="button" onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-err hover:underline ml-auto">×</button>
              )}

              {/* Exchange return routing — shown for old_gold/old_silver in exchange bills */}
              {saleType === "exchange" && (p.mode === "old_gold" || p.mode === "old_silver") && p.metal_wt > 0 && (
                <div className="w-full flex flex-wrap items-center gap-2 pt-2 mt-1 border-t border-line/50">
                  <span className="text-xs font-medium text-ink-dim">Returned item condition:</span>
                  {(["good", "damaged"] as const).map((c) => (
                    <button key={c} type="button"
                      onClick={() => setPayments((prev) => prev.map((x, i) =>
                        i === idx ? { ...x, return_condition: c, kolusu_box_id: c === "damaged" ? undefined : x.kolusu_box_id } : x
                      ))}
                      className={clsx("text-xs px-2.5 py-1 rounded-lg2 border font-medium transition-colors",
                        (p.return_condition ?? "good") === c
                          ? c === "good" ? "bg-ok/15 border-ok text-ok" : "bg-err/15 border-err text-err"
                          : "border-line text-ink-dim hover:border-gold")}>
                      {c === "good" ? "Good condition" : "Damaged / for melt"}
                    </button>
                  ))}
                  {(p.return_condition ?? "good") === "good" && (
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-ink-dim">Send to:</span>
                      <button type="button"
                        onClick={() => setPayments((prev) => prev.map((x, i) =>
                          i === idx ? { ...x, kolusu_box_id: undefined } : x
                        ))}
                        className={clsx("text-xs px-2.5 py-1 rounded-lg2 border transition-colors",
                          !p.kolusu_box_id ? "bg-warn/15 border-warn text-warn font-medium" : "border-line text-ink-dim hover:border-gold")}>
                        Metal Flow
                      </button>
                      {p.mode === "old_silver" && kolusuBoxes.length > 0 && (
                        <select value={p.kolusu_box_id || ""}
                          onChange={(e) => setPayments((prev) => prev.map((x, i) =>
                            i === idx ? { ...x, kolusu_box_id: e.target.value || undefined } : x
                          ))}
                          className={clsx("border rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold",
                            p.kolusu_box_id ? "border-ok bg-ok/5 text-ink font-medium" : "border-line text-ink-dim")}>
                          <option value="">— or return to Kolusu Box —</option>
                          {kolusuBoxes.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.box_no} {b.color} {b.size} ({grams(b.current_gross_wt_g)} stock)
                            </option>
                          ))}
                        </select>
                      )}
                      {p.kolusu_box_id && (
                        <span className="text-xs text-ok font-medium">
                          ✓ Will be added back to kolusu stock
                        </span>
                      )}
                    </div>
                  )}
                  {(p.return_condition ?? "good") === "damaged" && (
                    <span className="text-xs text-err font-medium ml-2">→ Goes to Metal Flow for melting</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Chit Metal VA Benefit */}
      {chitTotal > 0 && (
        <div className="flex items-center gap-3 bg-gold/5 border border-gold/20 rounded-xl px-4 py-3">
          <div className="flex-1 text-xs text-ink-dim">
            {`Chit metal ${inr(chitTotal)} — zero VA for items covered left-to-right at base metal cost`}
          </div>
          <button type="button" onClick={applyChitVaBenefit}
            className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90 whitespace-nowrap">
            Apply Chit VA Benefit
          </button>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-ink-dim mb-1">Notes</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inp} placeholder="Optional notes…" />
      </div>

      {/* Change Due — when payments exceed the bill total */}
      {changeDue > 0.01 && (
        <div className={clsx("border rounded-xl p-4 shadow-soft space-y-3",
          !changeDueMode ? "bg-err/5 border-err/40" : "bg-warn/5 border-warn/30")}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-ink">Change Due: </span>
            <span className="text-lg font-bold text-warn">{inr(changeDue)}</span>
            <span className="text-xs text-ink-dim">Payments exceed bill — choose what to do with the excess</span>
          </div>

          {/* Required choice */}
          <div className="flex gap-3">
            <label className={clsx("flex items-center gap-2 px-4 py-2 rounded-lg2 border cursor-pointer text-sm transition-colors",
              changeDueMode === "cash_back" ? "border-gold bg-gold/10 text-gold font-medium" : "border-line text-ink-dim hover:border-gold")}>
              <input type="radio" name="change_mode" value="cash_back" checked={changeDueMode === "cash_back"}
                onChange={() => setChangeDueMode("cash_back")} className="accent-gold" />
              💵 Pay Cash Back
            </label>
            <label className={clsx("flex items-center gap-2 px-4 py-2 rounded-lg2 border cursor-pointer text-sm transition-colors",
              changeDueMode === "advance" ? "border-gold bg-gold/10 text-gold font-medium" : "border-line text-ink-dim hover:border-gold")}>
              <input type="radio" name="change_mode" value="advance" checked={changeDueMode === "advance"}
                onChange={() => setChangeDueMode("advance")} className="accent-gold" />
              🏷️ Keep as Advance
            </label>
          </div>

          {/* No choice yet — block prompt */}
          {!changeDueMode && (
            <p className="text-xs text-err font-semibold">
              ⚠ You must choose how to handle {inr(changeDue)} before saving.
            </p>
          )}

          {/* Cash back: choose payout channel */}
          {changeDueMode === "cash_back" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-ink-dim">Pay via:</span>
              {(["cash", "bank"] as const).map((m) => (
                <label key={m} className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg2 border cursor-pointer text-xs transition-colors",
                  changePayoutMode === m ? "border-gold bg-gold/10 text-gold" : "border-line text-ink-dim hover:border-gold")}>
                  <input type="radio" name="change_payout" value={m} checked={changePayoutMode === m}
                    onChange={() => setChangePayoutMode(m)} className="accent-gold" />
                  {m === "cash" ? "Cash" : "Bank / UPI"}
                </label>
              ))}
              <span className="text-xs text-ok font-medium">{inr(changeDue)} will be paid out as {changePayoutMode}</span>
            </div>
          )}

          {/* Advance: need customer */}
          {changeDueMode === "advance" && !customer && (
            <p className="text-xs text-err font-medium">
              ⚠ Select a customer above — advance credit requires a customer account.
            </p>
          )}
          {changeDueMode === "advance" && customer && (
            <p className="text-xs text-ok font-medium">
              ✓ {inr(changeDue)} will be kept as advance credit for {customer.name}.
            </p>
          )}
        </div>
      )}

      {/* Mixed metal warning */}
      {isMixed && (
        <div className="bg-err/5 border border-err/40 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-err text-lg shrink-0">⚠</span>
          <div>
            <p className="text-sm font-semibold text-err">Cannot mix Gold and Silver in one bill</p>
            <p className="text-xs text-ink-dim mt-0.5">
              This bill has both gold and silver items. Use separate bills — one for gold (G22/G18/G24) and one for silver (S).
            </p>
          </div>
        </div>
      )}

      {/* Summary + Actions */}
      <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div className="flex gap-6 text-sm">
            <div><span className="text-ink-dim">Total: </span><strong className="text-gold text-lg">{inr(grandTotal)}</strong></div>
            <div><span className="text-ink-dim">Paid: </span><strong>{inr(totalPaid)}</strong></div>
            {changeDue > 0.01 ? (
              <div><span className="text-ink-dim">Change: </span><strong className="text-warn">{inr(changeDue)}</strong></div>
            ) : (
              <div><span className="text-ink-dim">Balance: </span><strong className={balance > 0.01 ? "text-err" : "text-ok"}>{inr(balance)}</strong></div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push("/sales")}
              className="border border-line text-ink-mid text-sm px-5 py-2.5 rounded-lg2 hover:bg-canvas">
              {t("cancel")}
            </button>
            <button type="submit"
              disabled={
                isPending ||
                isMixed ||
                (balance > 0.01 && !customer) ||
                (changeDue > 0.01 && !changeDueMode) ||
                (changeDue > 0.01 && changeDueMode === "advance" && !customer)
              }
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
