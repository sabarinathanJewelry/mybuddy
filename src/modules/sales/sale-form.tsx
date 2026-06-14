"use client";

import { useState, useEffect } from "react";
import GroupCombobox from "@/components/ui/group-combobox";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { useGlobalDate } from "@/stores/global-date";
import { useBoardRate } from "@/stores/board-rate";
import { computeLine, distributeTotalByVa, rateForMetal } from "@/lib/sales-calc";
import { inr, grams, shortDate } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import CustomerBalanceBadge from "@/modules/customers/customer-balance-badge";
import SupplierPicker from "@/modules/suppliers/supplier-picker";
import type { Supplier } from "@/modules/suppliers/supplier-picker";
import { useSaveSale, useUpdateSale, useSale } from "./api";
import { useProducts, useProductGroups } from "./products-api";
import type { SaleDraft, SaleItemDraft, SalePaymentDraft, Metal, PaymentMode, SaleSeries, SaleType } from "./types";
import { useStaff } from "@/modules/attendance/api";
import { usePartnerAccounts } from "@/modules/partner-accounts/api";
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
  { value: "misc",        label: "Misc / Stone / Service" },
];

const PAY_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash",       label: "Cash" },
  { value: "upi",        label: "UPI/GPay" },
  { value: "bank",       label: "Bank" },
  { value: "old_gold",   label: "Old Gold" },
  { value: "old_silver", label: "Old Silver" },
  { value: "advance",    label: "Advance" },
  { value: "chit_metal",  label: "Chit Metal" },
  { value: "chit_bonus",  label: "Chit Bonus" },
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
    is_value_entry: metal === "silver_mpr" || metal === "misc",
    is_suspense: false, from_vault: false, supplier_id: null, supplier_name: null,
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
  const [salesperson1Id, setSalesperson1Id] = useState<string>("");
  const [salesperson2Id, setSalesperson2Id] = useState<string>("");
  const [marketingStaffId, setMarketingStaffId] = useState<string>("");
  const [refBillPreview, setRefBillPreview] = useState<{
    bill_no: string; bill_date: string; customer_name: string | null;
    items: { description: string; metal: string; gross_wt: number; net_wt: number; line_total: number }[];
    total: number;
  } | null>(null);
  const [refBillError, setRefBillError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSalesperson1Id((sale as any).salesperson1_id ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSalesperson2Id((sale as any).salesperson2_id ?? "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setMarketingStaffId((sale as any).marketing_staff_id ?? "");
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
      is_value_entry: item.metal === "silver_mpr" || item.metal === "misc",
      is_suspense: item.is_suspense,
      from_vault: item.from_vault ?? false,
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
    // Auto-update series when the first item's metal changes (misc items don't drive series)
    if (patch.metal !== undefined && patch.metal !== "misc") {
      setSeries(seriesForMetal(patch.metal as Metal));
    }
    setItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const merged = { ...item, ...patch };

      if (patch.metal !== undefined && boardRate) {
        merged.rate = rateForMetal(boardRate, patch.metal);
        merged.is_value_entry = patch.metal === "silver_mpr" || patch.metal === "misc";
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

  function handleDistribute(forceNoGst = false) {
    if (!desiredTotal) return;
    const nonMpr = items
      .filter((i) => !i.is_value_entry)
      .map((item) => forceNoGst ? { ...item, gst_enabled: false, gst_pct: 0 } : item);
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
    const chitWt = chitPayment.metal_wt || 0;
    const chitRate = chitPayment.rate || 0;
    const useWeightBased = chitWt > 0 && chitRate > 0;

    setItems((prev: SaleItemDraft[]) => {
      let remainingWt = chitWt;
      return prev.map((item: SaleItemDraft) => {
        if (item.is_value_entry) return item;
        if (useWeightBased) {
          if (remainingWt <= 0) return item;
          const covered = Math.min(item.net_wt, remainingWt);
          const metalValue = item.net_wt * item.rate;
          // va_amt = covered × (chitRate − item.rate); negative when chitRate < board rate
          const va_amt = covered * (chitRate - item.rate);
          const va_pct = metalValue > 0 ? (va_amt / metalValue) * 100 : 0;
          remainingWt -= covered;
          const updated = { ...item, va_pct };
          return { ...updated, ...computeLine(updated) };
        }
        // Fallback: no weight info — monetary coverage, allow negative VA
        return item;
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

  const { data: products = [] } = useProducts(true);
  const { data: productGroups = [] } = useProductGroups(true);
  const { data: staffList = [] } = useStaff();
  const { data: partnerAccounts = [] } = usePartnerAccounts();
  const activeStaff = staffList.filter((s) => s.active);

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

  async function lookupRefBill() {
    if (!exchangeRefBill.trim()) return;
    setLookingUp(true);
    setRefBillPreview(null);
    setRefBillError(null);
    try {
      const { data, error } = await supabase()
        .from("sales")
        .select("bill_no, bill_date, total, customers(name), sale_items(description, metal, gross_wt, net_wt, line_total)")
        .eq("bill_no", exchangeRefBill.trim())
        .single();
      if (error || !data) {
        setRefBillError("Bill not found");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRefBillPreview({
          bill_no: data.bill_no,
          bill_date: data.bill_date,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          customer_name: (data.customers as any)?.name ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: (data.sale_items as any[]) ?? [],
          total: data.total,
        });
      }
    } finally {
      setLookingUp(false);
    }
  }

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
      salesperson1_id: salesperson1Id || null,
      salesperson2_id: salesperson2Id || null,
      marketing_staff_id: marketingStaffId || null,
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
          {customer && <CustomerBalanceBadge customerId={customer.id} />}
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("date")}</label>
          <input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className={inp} />
        </div>
      </div>

      {/* Staff Attribution */}
      {activeStaff.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-dim mb-1">Salesperson 1</label>
            <select value={salesperson1Id} onChange={(e) => setSalesperson1Id(e.target.value)} className={inp}>
              <option value="">— none —</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-dim mb-1">Salesperson 2</label>
            <select value={salesperson2Id} onChange={(e) => setSalesperson2Id(e.target.value)} className={inp}>
              <option value="">— none —</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-dim mb-1">Marketing Staff</label>
            <select value={marketingStaffId} onChange={(e) => setMarketingStaffId(e.target.value)} className={inp}>
              <option value="">— none —</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      )}

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
            <div className="flex gap-2">
              <input
                value={exchangeRefBill}
                onChange={(e) => { setExchangeRefBill(e.target.value); setRefBillPreview(null); setRefBillError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupRefBill(); } }}
                placeholder="e.g. S/2026-27/0047"
                className={clsx(inp, "flex-1")}
              />
              <button type="button" onClick={lookupRefBill}
                disabled={!exchangeRefBill.trim() || lookingUp}
                className="px-3 py-1.5 text-xs font-medium bg-gold/10 text-gold border border-gold/30 rounded-lg2 hover:bg-gold/20 disabled:opacity-40 whitespace-nowrap">
                {lookingUp ? "Looking…" : "Lookup"}
              </button>
            </div>
            {refBillError && (
              <p className="text-xs text-err mt-1">{refBillError}</p>
            )}
            {refBillPreview && (
              <div className="mt-2 bg-white border border-gold/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">{refBillPreview.bill_no}</span>
                  <span className="text-xs text-ink-dim">{shortDate(refBillPreview.bill_date)}</span>
                </div>
                {refBillPreview.customer_name && (
                  <p className="text-xs text-ink-dim">Customer: <strong className="text-ink">{refBillPreview.customer_name}</strong></p>
                )}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-ink-dim border-b border-line">
                      <th className="text-left pb-1 font-medium">Item</th>
                      <th className="text-right pb-1 font-medium">Gross</th>
                      <th className="text-right pb-1 font-medium">Net</th>
                      <th className="text-right pb-1 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refBillPreview.items.map((item, i) => (
                      <tr key={i} className="border-b border-line/40">
                        <td className="py-0.5">{item.description || item.metal}</td>
                        <td className="text-right py-0.5 font-semibold text-warn">{grams(item.gross_wt)}</td>
                        <td className="text-right py-0.5">{grams(item.net_wt)}</td>
                        <td className="text-right py-0.5">{inr(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between pt-1 border-t border-line">
                  <span className="text-xs text-ink-dim">Bill Total</span>
                  <span className="text-xs font-semibold text-gold">{inr(refBillPreview.total)}</span>
                </div>
                <p className="text-xs bg-warn/10 text-warn rounded-lg2 px-2 py-1.5 font-medium">
                  ↓ Original items totalled {grams(refBillPreview.items.reduce((s, i) => s + (i.gross_wt || 0), 0))} — enter the weight the customer is returning in the Old Silver / Old Gold payment below
                </p>
              </div>
            )}
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
                <div className="col-span-2 space-y-1">
                  <label className="text-xs text-ink-dim">Description</label>
                  {productGroups.length > 0 && (
                    <GroupCombobox
                      groups={productGroups}
                      metal={item.metal ?? "gold_22k"}
                      onSelect={(grp) => updateItem(idx, { description: grp.name, metal: grp.metal as Metal })}
                      placeholder="Search group…"
                    />
                  )}
                  {products.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const matched = products.find((p) => p.id === e.target.value);
                        if (matched) {
                          updateItem(idx, {
                            description: matched.name,
                            metal: matched.metal as Metal,
                            purity_pct: matched.default_purity_pct ?? item.purity_pct,
                            va_pct: matched.default_va_pct ?? item.va_pct,
                            making_amt: matched.default_making_amt ?? item.making_amt,
                          });
                        }
                      }}
                      className={`${inp} text-xs text-ink-dim`}
                    >
                      <option value="">Pick product…</option>
                      {(() => {
                        const topGroups = productGroups.filter(g => !g.parent_id);
                        const childGroups = (pid: string) => productGroups.filter(g => g.parent_id === pid);
                        const ungrouped = products.filter(p => !p.group_id);
                        const rendered: React.ReactNode[] = [];
                        topGroups.forEach(parent => {
                          const parentProducts = products.filter(p => p.group_id === parent.id);
                          const children = childGroups(parent.id);
                          if (children.length === 0 && parentProducts.length > 0) {
                            rendered.push(
                              <optgroup key={parent.id} label={parent.name}>
                                {parentProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </optgroup>
                            );
                          } else {
                            if (parentProducts.length > 0) {
                              rendered.push(
                                <optgroup key={parent.id} label={parent.name}>
                                  {parentProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </optgroup>
                              );
                            }
                            children.forEach(child => {
                              const childProducts = products.filter(p => p.group_id === child.id);
                              if (childProducts.length > 0) {
                                rendered.push(
                                  <optgroup key={child.id} label={`${parent.name} › ${child.name}`}>
                                    {childProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </optgroup>
                                );
                              }
                            });
                          }
                        });
                        if (ungrouped.length > 0) {
                          rendered.push(
                            <optgroup key="__ungrouped" label="Other">
                              {ungrouped.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                          );
                        }
                        return rendered;
                      })()}
                    </select>
                  )}
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="Item description"
                    className={inp}
                  />
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
                    <input type="checkbox" checked={item.from_vault}
                      onChange={(e) => updateItem(idx, { from_vault: e.target.checked })} className="accent-gold" />
                    From Vault
                  </label>
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
        <button type="button" onClick={() => handleDistribute()}
          className="text-xs bg-gold/10 text-gold border border-gold/30 px-3 py-2 rounded-lg2 hover:bg-gold/20">
          {t("distribute_va")}
        </button>
      </div>
      {desiredTotal > 0 && (() => {
        const nonMprItems = items.filter((i) => !i.is_value_entry);
        const mprT = items.filter((i) => i.is_value_entry).reduce((s, i) => s + i.line_total, 0);
        const minWithGst = mprT + nonMprItems.reduce((s, item) => s + computeLine({ ...item, va_pct: 0 }).line_total, 0);
        const minNoGst = mprT + nonMprItems.reduce((s, item) => s + computeLine({ ...item, va_pct: 0, gst_enabled: false, gst_pct: 0 }).line_total, 0);
        if (desiredTotal >= minWithGst) return null;
        return (
          <div className="text-xs flex flex-wrap items-center gap-2">
            <span className="text-warn">Below base+GST — VA will go negative.</span>
            {desiredTotal >= minNoGst ? (
              <button type="button" onClick={() => handleDistribute(true)}
                className="text-gold underline">
                Remove GST + Distribute
              </button>
            ) : (
              <span className="text-err">Below cost even without GST.</span>
            )}
          </div>
        );
      })()}

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
              {(p.mode === "old_gold" || p.mode === "old_silver") ? (
                <>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-ink-dim">Weight (g)</span>
                    <Num value={p.metal_wt}
                      onChange={(v) => setPayments((prev) => prev.map((x, i) => {
                        if (i !== idx) return x;
                        const pureRate = boardRate ? (x.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                        const amt = pureRate ? v * (x.metal_purity / 100) * pureRate : x.amount;
                        return { ...x, metal_wt: v, amount: Math.round(amt) };
                      }))}
                      step="0.001" className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-ink-dim">Total (₹)</span>
                    <Num value={p.amount}
                      onChange={(v) => setPayments((prev) => prev.map((x, i) => {
                        if (i !== idx) return x;
                        const pureRate = boardRate ? (x.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                        const purity = (pureRate && x.metal_wt) ? (v / (x.metal_wt * pureRate)) * 100 : x.metal_purity;
                        return { ...x, amount: v, metal_purity: Math.round(purity * 10) / 10 };
                      }))}
                      step="0.01" className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-ink-dim">Purity %</span>
                    <Num value={p.metal_purity}
                      onChange={(v) => setPayments((prev) => prev.map((x, i) => {
                        if (i !== idx) return x;
                        const pureRate = boardRate ? (x.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                        const amt = pureRate ? x.metal_wt * (v / 100) * pureRate : x.amount;
                        return { ...x, metal_purity: v, amount: Math.round(amt) };
                      }))}
                      step="0.01" className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                </>
              ) : (
                <Num value={p.amount}
                  onChange={(v) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: v } : x))}
                  step="0.01" className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
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
              {(p.mode === "upi" || p.mode === "bank") && partnerAccounts.length > 0 && (
                <select value={p.partner_account_id ?? ""}
                  onChange={e => setPayments(prev => prev.map((x, i) => i === idx ? { ...x, partner_account_id: e.target.value || undefined } : x))}
                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                  <option value="">Shop account</option>
                  {partnerAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
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
      {chitTotal > 0 && (() => {
        const cp = payments.find((p: SalePaymentDraft) => p.mode === "chit_metal");
        const chitWt = cp?.metal_wt || 0;
        const chitRate = cp?.rate || 0;
        const hintText = chitWt > 0 && chitRate > 0
          ? `Chit metal ${grams(chitWt)} @ ${inr(chitRate)}/g = ${inr(chitTotal)} — covered at chit rate, GST on full amount, balance at board rate`
          : `Chit metal ${inr(chitTotal)}`;
        return (
          <div className="flex items-center gap-3 bg-gold/5 border border-gold/20 rounded-xl px-4 py-3">
            <div className="flex-1 text-xs text-ink-dim">{hintText}</div>
            <button type="button" onClick={applyChitVaBenefit}
              className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90 whitespace-nowrap">
              Apply Chit VA Benefit
            </button>
          </div>
        );
      })()}

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

      {/* Mixed metal note */}
      {isMixed && (
        <div className="bg-info/5 border border-info/20 rounded-xl px-4 py-2 text-xs text-info">
          Mixed bill — gold and silver items on the same bill. Bill counter uses the selected series ({series}). Reports will separate gold and silver totals automatically.
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
