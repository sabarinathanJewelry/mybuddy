"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { inr, shortDate, grams } from "@/lib/format";
import { clsx } from "clsx";

// ── helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2,"0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  return { from, to };
}

const GOLD_METALS = ["gold_22k","gold_18k","gold_24k"];
const SILVER_METALS = ["silver","silver_pure"];

// ── data hooks ────────────────────────────────────────────────────────────────

function usePnlItems(from: string, to: string) {
  return useQuery({
    queryKey: ["pnl-items", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sale_items")
        .select("metal, gross_wt, net_wt, pure_wt, rate, va_pct, making_amt, stone_amt, diamond_amt, gst_pct, line_total, sales!inner(bill_date, status, bill_no)")
        .gte("sales.bill_date", from)
        .lte("sales.bill_date", to)
        .eq("sales.status", "confirmed");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function usePnlPurchases(from: string, to: string) {
  return useQuery({
    queryKey: ["pnl-purchases", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("supplier_purchases")
        .select("metal, gross_wt, pure_wt, rate, amount")
        .gte("purchase_date", from)
        .lte("purchase_date", to);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function usePnlExpenses(from: string, to: string) {
  return useQuery({
    queryKey: ["pnl-expenses", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("expenses")
        .select("amount, exp_date, description, expense_categories(name)")
        .gte("exp_date", from)
        .lte("exp_date", to);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useRenameProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, newName }: { key: string; newName: string }) => {
      const { error } = await supabase()
        .from("sale_items")
        .update({ description: newName })
        .ilike("description", key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-items"] }),
  });
}

function useMergeProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ keys, targetName }: { keys: string[]; targetName: string }) => {
      for (const key of keys) {
        const { error } = await supabase()
          .from("sale_items")
          .update({ description: targetName })
          .ilike("description", key);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-items"] }),
  });
}

function useProductItems(from: string, to: string) {
  return useQuery({
    queryKey: ["product-items", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sale_items")
        .select("description, metal, gross_wt, net_wt, making_amt, stone_amt, diamond_amt, line_total, gst_pct, sales!inner(bill_date, status)")
        .gte("sales.bill_date", from)
        .lte("sales.bill_date", to)
        .eq("sales.status", "confirmed");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useSalesDetail(from: string, to: string) {
  return useQuery({
    queryKey: ["report-sales", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sales")
        .select("*, customers(name), sale_items(metal, net_wt, line_total, gst_pct, making_amt, stone_amt, diamond_amt)")
        .gte("bill_date", from).lte("bill_date", to).eq("status","confirmed").order("bill_date");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// Cash paid to customers for old gold/silver bought standalone (Metal Flow → Intake page)
function useOldMetalPurchases(from: string, to: string) {
  return useQuery({
    queryKey: ["pnl-old-metal", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("old_metal_intake")
        .select("metal, gross_wt, pure_wt, payout_amount, source_type")
        .gte("intake_date", from)
        .lte("intake_date", to)
        .gt("payout_amount", 0);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// Old gold/silver received as exchange payment inside sales
function useSaleExchangePayments(from: string, to: string) {
  return useQuery({
    queryKey: ["pnl-exchange-pay", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sale_payments")
        .select("mode, amount, metal_wt, sales!inner(bill_date, status)")
        .in("mode", ["old_gold", "old_silver"])
        .gte("sales.bill_date", from)
        .lte("sales.bill_date", to)
        .eq("sales.status", "confirmed");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ── metric helpers ────────────────────────────────────────────────────────────

function metalSection(items: any[], metals: string[]) {
  const filtered = items.filter(i => metals.includes(i.metal));
  const grossWt = filtered.reduce((s, i) => s + Number(i.gross_wt||0), 0);
  const netWt   = filtered.reduce((s, i) => s + Number(i.net_wt||0), 0);
  const pureWt  = filtered.reduce((s, i) => s + Number(i.pure_wt||0), 0);
  // Revenue excl GST
  const revenueInclGst = filtered.reduce((s, i) => s + Number(i.line_total||0), 0);
  const gstAmt = filtered.reduce((s, i) => {
    const gstR = Number(i.gst_pct||0) / 100;
    return s + (gstR > 0 ? Number(i.line_total||0) - Number(i.line_total||0) / (1 + gstR) : 0);
  }, 0);
  const revenueExGst = revenueInclGst - gstAmt;
  // Components
  const metalValue = filtered.reduce((s, i) => s + Number(i.net_wt||0) * Number(i.rate||0), 0);
  const makingAmt  = filtered.reduce((s, i) => s + Number(i.making_amt||0), 0);
  const stoneAmt   = filtered.reduce((s, i) => s + Number(i.stone_amt||0) + Number(i.diamond_amt||0), 0);
  const vaAmt      = revenueExGst - metalValue - makingAmt - stoneAmt; // residual = VA charges
  return { count: filtered.length, grossWt, netWt, pureWt, revenueInclGst, gstAmt, revenueExGst, metalValue, makingAmt, vaAmt, stoneAmt };
}

function purchaseSection(purchases: any[], metals: string[]) {
  const filtered = purchases.filter(p => metals.includes(p.metal ?? ""));
  return {
    grossWt: filtered.reduce((s, p) => s + Number(p.gross_wt||0), 0),
    pureWt:  filtered.reduce((s, p) => s + Number(p.pure_wt||0), 0),
    amount:  filtered.reduce((s, p) => s + Number(p.amount||0), 0),
    count:   filtered.length,
  };
}

// ── sub-components ────────────────────────────────────────────────────────────

function MetalCard({ title, color, data, purchases }: {
  title: string; color: string;
  data: ReturnType<typeof metalSection>;
  purchases: ReturnType<typeof purchaseSection>;
}) {
  const grossProfit = data.revenueExGst - purchases.amount;
  return (
    <div className={clsx("bg-white rounded-xl border border-line shadow-soft overflow-hidden")}>
      <div className={clsx("px-4 py-2.5 border-b border-line font-semibold text-sm", color)}>
        {title}
        <span className="ml-2 text-xs font-normal text-ink-dim">{data.count} item{data.count !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm">
        {[
          { label: "Gross Wt", value: grams(data.grossWt) },
          { label: "Net Wt", value: grams(data.netWt) },
          { label: "Pure Wt", value: grams(data.pureWt) },
          { label: "Bills", value: `${data.count}` },
        ].map(s => (
          <div key={s.label} className="px-4 py-3 border-b border-line">
            <p className="text-xs text-ink-dim">{s.label}</p>
            <p className="font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm">
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Revenue (incl GST)</p>
          <p className="font-semibold">{inr(data.revenueInclGst)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">GST Collected</p>
          <p className="font-semibold text-warn">{inr(data.gstAmt)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Revenue (excl GST)</p>
          <p className="font-bold text-ink">{inr(data.revenueExGst)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Metal Value at Sale Rate</p>
          <p className="font-semibold">{inr(data.metalValue)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm border-t border-line">
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Making Charges</p>
          <p className="font-semibold text-ok">{inr(data.makingAmt)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">VA (Wastage) Charges</p>
          <p className="font-semibold text-ok">{inr(Math.max(0, data.vaAmt))}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Stone / Diamond</p>
          <p className="font-semibold text-info">{inr(data.stoneAmt)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Service Income Total</p>
          <p className="font-bold text-ok">{inr(data.makingAmt + Math.max(0, data.vaAmt) + data.stoneAmt)}</p>
        </div>
      </div>
      {/* Purchases row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm border-t border-dashed border-line bg-canvas/50">
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Purchased from Suppliers</p>
          <p className="font-semibold text-err">{inr(purchases.amount)}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-ink-dim">Purchased Weight</p>
          <p className="font-semibold">{grams(purchases.grossWt)}</p>
        </div>
        <div className="px-4 py-3 sm:col-span-2">
          <p className="text-xs text-ink-dim">Gross Profit (Revenue excl GST − Purchases)</p>
          <p className={clsx("text-lg font-bold", grossProfit >= 0 ? "text-ok" : "text-err")}>
            {inr(grossProfit)}
            <span className={clsx("ml-2 text-xs font-normal", grossProfit >= 0 ? "text-ok" : "text-err")}>
              {data.revenueExGst > 0 ? `${((grossProfit / data.revenueExGst) * 100).toFixed(1)}%` : ""}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function groupByDescription(items: any[]) {
  const map = new Map<string, { count: number; grossWt: number; netWt: number; makingAmt: number; diamondAmt: number; stoneAmt: number; revenue: number }>();
  for (const item of items) {
    const key = (item.description || "unknown").trim().toLowerCase();
    const cur = map.get(key) ?? { count: 0, grossWt: 0, netWt: 0, makingAmt: 0, diamondAmt: 0, stoneAmt: 0, revenue: 0 };
    map.set(key, {
      count: cur.count + 1,
      grossWt: cur.grossWt + Number(item.gross_wt || 0),
      netWt: cur.netWt + Number(item.net_wt || 0),
      makingAmt: cur.makingAmt + Number(item.making_amt || 0),
      diamondAmt: cur.diamondAmt + Number(item.diamond_amt || 0),
      stoneAmt: cur.stoneAmt + Number(item.stone_amt || 0),
      revenue: cur.revenue + Number(item.line_total || 0),
    });
  }
  return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
}

function groupExpensesByCategory(expenses: any[]) {
  const map = new Map<string, { count: number; total: number; items: any[] }>();
  for (const exp of expenses) {
    const key = exp.expense_categories?.name || "Uncategorized";
    const cur = map.get(key) ?? { count: 0, total: 0, items: [] };
    map.set(key, { count: cur.count + 1, total: cur.total + Number(exp.amount || 0), items: [...cur.items, exp] });
  }
  return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
}

function ProductTable({ title, color, items, showGrams = true, mergeMode, mergeSelected, onToggleMerge, onRename }: {
  title: string; color: string; items: any[]; showGrams?: boolean;
  mergeMode: boolean;
  mergeSelected: Set<string>;
  onToggleMerge: (key: string) => void;
  onRename: (key: string, newName: string) => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const grouped = groupByDescription(items);
  const totalRevenue = items.reduce((s, i) => s + Number(i.line_total || 0), 0);
  if (!grouped.length) return null;

  function startEdit(key: string) {
    setEditingKey(key);
    setEditVal(key);
  }

  function commitEdit() {
    if (editingKey && editVal.trim() && editVal.trim().toLowerCase() !== editingKey) {
      onRename(editingKey, editVal.trim().toLowerCase());
    }
    setEditingKey(null);
  }

  return (
    <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
      <div className={clsx("px-4 py-2.5 border-b border-line font-semibold text-sm flex items-center justify-between", color)}>
        <span>{title} <span className="ml-1 text-xs font-normal text-ink-dim">{items.length} item{items.length !== 1 ? "s" : ""}</span></span>
        <span className="font-bold">{inr(totalRevenue)}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
            {mergeMode && <th className="px-3 py-2 w-8" />}
            <th className="text-left px-4 py-2">Product</th>
            <th className="text-right px-3 py-2">Qty</th>
            {showGrams && <th className="text-right px-3 py-2">Gross Wt</th>}
            {showGrams && <th className="text-right px-3 py-2">Net Wt</th>}
            <th className="text-right px-3 py-2">Making</th>
            <th className="text-right px-3 py-2">Diamond/Stone</th>
            <th className="text-right px-4 py-2">Revenue</th>
            {!mergeMode && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {grouped.map(([key, d]) => (
            <tr key={key} className={clsx("border-b border-line last:border-0 hover:bg-canvas/50", mergeSelected.has(key) && "bg-gold/5")}>
              {mergeMode && (
                <td className="px-3 py-2.5 text-center">
                  <input type="checkbox" checked={mergeSelected.has(key)} onChange={() => onToggleMerge(key)} className="accent-gold cursor-pointer" />
                </td>
              )}
              <td className="px-4 py-2.5 font-medium">
                {editingKey === key ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingKey(null); }}
                      className="border border-line rounded px-2 py-1 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                    <button onClick={commitEdit} className="text-xs text-ok font-medium hover:underline">Save</button>
                    <button onClick={() => setEditingKey(null)} className="text-xs text-ink-dim hover:underline">Cancel</button>
                  </div>
                ) : key}
              </td>
              <td className="px-3 py-2.5 text-right text-ink-dim">{d.count}</td>
              {showGrams && <td className="px-3 py-2.5 text-right font-mono text-xs">{d.grossWt > 0 ? grams(d.grossWt) : "—"}</td>}
              {showGrams && <td className="px-3 py-2.5 text-right font-mono text-xs">{d.netWt > 0 ? grams(d.netWt) : "—"}</td>}
              <td className="px-3 py-2.5 text-right font-mono text-ok">{d.makingAmt > 0 ? inr(d.makingAmt) : "—"}</td>
              <td className="px-3 py-2.5 text-right font-mono text-info">{(d.diamondAmt + d.stoneAmt) > 0 ? inr(d.diamondAmt + d.stoneAmt) : "—"}</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold">{inr(d.revenue)}</td>
              {!mergeMode && (
                <td className="px-2 py-2.5 text-center">
                  {editingKey !== key && (
                    <button onClick={() => startEdit(key)} className="text-ink-dim hover:text-gold text-sm leading-none" title="Rename">✎</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-canvas/50 border-t border-line font-semibold text-sm">
            {mergeMode && <td />}
            <td className="px-4 py-2.5">Total</td>
            <td className="px-3 py-2.5 text-right text-ink-dim">{items.length}</td>
            {showGrams && <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(items.reduce((s, i) => s + Number(i.gross_wt || 0), 0))}</td>}
            {showGrams && <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(items.reduce((s, i) => s + Number(i.net_wt || 0), 0))}</td>}
            <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(items.reduce((s, i) => s + Number(i.making_amt || 0), 0))}</td>
            <td className="px-3 py-2.5 text-right font-mono text-info">{inr(items.reduce((s, i) => s + Number(i.diamond_amt || 0) + Number(i.stone_amt || 0), 0))}</td>
            <td className="px-4 py-2.5 text-right font-mono font-bold">{inr(totalRevenue)}</td>
            {!mergeMode && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const t = useT();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab]     = useState<"pnl" | "detail" | "products" | "expenses">("pnl");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [useCustom, setUseCustom]   = useState(false);
  const [mergeMode, setMergeMode]   = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeTo, setMergeTo]       = useState("");

  const renameProduct = useRenameProduct();
  const mergeProducts = useMergeProducts();

  function toggleMergeSelect(key: string) {
    setMergeSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleRename(key: string, newName: string) {
    renameProduct.mutate({ key, newName });
  }

  function handleMerge() {
    if (!mergeTo.trim() || mergeSelected.size < 2) return;
    mergeProducts.mutate(
      { keys: Array.from(mergeSelected), targetName: mergeTo.trim().toLowerCase() },
      { onSuccess: () => { setMergeMode(false); setMergeSelected(new Set()); setMergeTo(""); } }
    );
  }

  const range = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : monthRange(year, month);

  const { data: items = [],           isLoading: loadingItems }     = usePnlItems(range.from, range.to);
  const { data: purchases = [],       isLoading: loadingPurchases } = usePnlPurchases(range.from, range.to);
  const { data: expenses = [],        isLoading: loadingExpenses }  = usePnlExpenses(range.from, range.to);
  const { data: salesDetail = [] }                                  = useSalesDetail(range.from, range.to);
  const { data: oldMetalBuys = [] }                                 = useOldMetalPurchases(range.from, range.to);
  const { data: exchangePayments = [] }                             = useSaleExchangePayments(range.from, range.to);
  const { data: productItems = [] }                                 = useProductItems(range.from, range.to);

  const isLoading = loadingItems || loadingPurchases || loadingExpenses;

  // Old metal purchase totals (cash paid to buy old gold/silver from public)
  const oldGoldBuyAmt    = (oldMetalBuys as any[]).filter(x => (x.metal ?? "").startsWith("gold")).reduce((s, x) => s + Number(x.payout_amount || 0), 0);
  const oldSilverBuyAmt  = (oldMetalBuys as any[]).filter(x => (x.metal ?? "").startsWith("silver")).reduce((s, x) => s + Number(x.payout_amount || 0), 0);
  const oldGoldBuyWt     = (oldMetalBuys as any[]).filter(x => (x.metal ?? "").startsWith("gold")).reduce((s, x) => s + Number(x.gross_wt || 0), 0);
  const oldSilverBuyWt   = (oldMetalBuys as any[]).filter(x => (x.metal ?? "").startsWith("silver")).reduce((s, x) => s + Number(x.gross_wt || 0), 0);
  const totalOldMetalCost = oldGoldBuyAmt + oldSilverBuyAmt;

  // Exchange metal received in sales (ASSETS — not a cost in this period)
  const exchGoldWt  = (exchangePayments as any[]).filter(x => x.mode === "old_gold").reduce((s, x) => s + Number(x.metal_wt || 0), 0);
  const exchSilvWt  = (exchangePayments as any[]).filter(x => x.mode === "old_silver").reduce((s, x) => s + Number(x.metal_wt || 0), 0);
  const exchGoldVal = (exchangePayments as any[]).filter(x => x.mode === "old_gold").reduce((s, x) => s + Number(x.amount || 0), 0);
  const exchSilvVal = (exchangePayments as any[]).filter(x => x.mode === "old_silver").reduce((s, x) => s + Number(x.amount || 0), 0);

  // Computed sections
  const gold   = metalSection(items, GOLD_METALS);
  const silver = metalSection(items, SILVER_METALS);
  const mprItems = items.filter(i => i.metal === "silver_mpr");
  const mprRevenue = mprItems.reduce((s, i) => s + Number(i.line_total||0), 0);

  const goldPurchases   = purchaseSection(purchases, GOLD_METALS);
  const silverPurchases = purchaseSection(purchases, SILVER_METALS);

  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount||0), 0);

  const totalRevenue  = gold.revenueExGst + silver.revenueExGst + mprRevenue;
  const totalGst      = gold.gstAmt + silver.gstAmt;
  const supplierCogs  = goldPurchases.amount + silverPurchases.amount;
  const totalCogs     = supplierCogs + totalOldMetalCost;
  const totalService  = gold.makingAmt + gold.vaAmt + gold.stoneAmt +
                        silver.makingAmt + silver.vaAmt + silver.stoneAmt;
  const grossProfit   = totalRevenue - totalCogs;
  const netProfit     = grossProfit - totalExpenses;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("reports")}</h1>

      {/* Period picker */}
      <div className="bg-white rounded-xl border border-line p-4 shadow-soft space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Year */}
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setUseCustom(false); }}
            className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {/* Month pills */}
          <div className="flex gap-1 flex-wrap">
            {MONTHS.map((m, i) => (
              <button key={m} onClick={() => { setMonth(i + 1); setUseCustom(false); }}
                className={clsx("px-2.5 py-1 text-xs rounded-lg2 border transition-colors",
                  !useCustom && month === i + 1 ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold")}>
                {m}
              </button>
            ))}
          </div>
          <span className="text-ink-dim text-xs">or</span>
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setUseCustom(true); }}
              className="border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
            <span className="text-ink-dim text-xs">–</span>
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setUseCustom(true); }}
              className="border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
        </div>
        <p className="text-xs text-ink-dim">
          Period: <strong>{range.from}</strong> to <strong>{range.to}</strong>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {([["pnl", "P&L Report"], ["detail", "Sales Detail"], ["products", "Product Mix"], ["expenses", "Expenses"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={clsx("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === k ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-ink-dim text-sm">{t("loading")}</p>}

      {/* ── P&L TAB ─────────────────────────────────────────────── */}
      {tab === "pnl" && !isLoading && (
        <div className="space-y-5">

          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Revenue (excl GST)",       value: inr(totalRevenue),       color: "text-ink" },
              { label: "GST Collected",             value: inr(totalGst),           color: "text-warn" },
              { label: "Supplier Purchases",        value: inr(supplierCogs),       color: "text-err" },
              { label: "Old Metal Bought (cash)",   value: inr(totalOldMetalCost),  color: "text-err" },
              { label: "Gross Profit",              value: inr(grossProfit),        color: grossProfit >= 0 ? "text-ok" : "text-err" },
              { label: "Net Profit",                value: inr(netProfit),          color: netProfit >= 0 ? "text-ok" : "text-err" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">{s.label}</p>
                <p className={clsx("text-lg font-bold mt-0.5", s.color)}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Gold section */}
          {(gold.count > 0 || goldPurchases.count > 0) && (
            <MetalCard title="Gold (22K + 18K + 24K)" color="text-gold bg-gold/5"
              data={gold} purchases={goldPurchases} />
          )}

          {/* Silver section */}
          {(silver.count > 0 || silverPurchases.count > 0) && (
            <MetalCard title="Silver (Standard + Pure)" color="text-ink-mid bg-canvas"
              data={silver} purchases={silverPurchases} />
          )}

          {/* Silver MPR */}
          {mprItems.length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-info bg-info/5">
                Silver MPR (Fixed-price items)
                <span className="ml-2 text-xs font-normal text-ink-dim">{mprItems.length} items</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 divide-x divide-line text-sm">
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Items Sold</p>
                  <p className="font-semibold">{mprItems.length}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Total Revenue</p>
                  <p className="font-bold text-info">{inr(mprRevenue)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Note</p>
                  <p className="text-xs text-ink-dim">MPR items are direct-value; purchase cost tracked separately</p>
                </div>
              </div>
            </div>
          )}

          {/* Service income summary */}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-ok bg-ok/5">
              Service Income Breakdown (Making + VA + Stone/Diamond)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm">
              {[
                { label: "Making Charges (Gold)", value: gold.makingAmt, color: "text-gold" },
                { label: "VA Charges (Gold)",     value: Math.max(0, gold.vaAmt), color: "text-gold" },
                { label: "Making Charges (Silver)", value: silver.makingAmt, color: "text-ink-mid" },
                { label: "VA Charges (Silver)",   value: Math.max(0, silver.vaAmt), color: "text-ink-mid" },
              ].map(s => (
                <div key={s.label} className="px-4 py-3">
                  <p className="text-xs text-ink-dim">{s.label}</p>
                  <p className={clsx("font-semibold", s.color)}>{inr(s.value)}</p>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-line bg-ok/5">
              <span className="text-sm text-ink-dim">Total Service Income: </span>
              <span className="text-lg font-bold text-ok">{inr(totalService)}</span>
              <span className="ml-3 text-xs text-ink-dim">(this is the "guaranteed" margin — independent of metal price changes)</span>
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-err bg-err/5">
              Operating Expenses
            </div>
            {expenses.length > 0 ? (
              <table className="w-full text-sm">
                <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-right px-3 py-2">Amount</th>
                </tr></thead>
                <tbody>
                  {(expenses as any[]).map((e, i) => (
                    <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2 text-ink-dim">{shortDate(e.exp_date)}</td>
                      <td className="px-3 py-2">{e.description || "—"}</td>
                      <td className="px-3 py-2 text-ink-dim">{e.expense_categories?.name || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono text-err">{inr(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-6 text-center text-ink-dim text-sm">No expenses in this period</p>
            )}
            <div className="px-4 py-3 border-t border-line bg-err/5 text-right">
              <span className="text-sm text-ink-dim">Total Expenses: </span>
              <span className="text-lg font-bold text-err">{inr(totalExpenses)}</span>
            </div>
          </div>

          {/* Old Metal Flow — exchange (assets) vs purchased (costs) */}
          {(exchGoldWt > 0 || exchSilvWt > 0 || oldGoldBuyWt > 0 || oldSilverBuyWt > 0) && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-warn bg-warn/5">
                Old Metal Acquired this Period
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-line">
                {/* Purchased for cash */}
                <div className="px-4 py-4 space-y-2">
                  <p className="text-xs font-semibold text-err">Bought for Cash (COST — included in COGS)</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-ink-dim">Gold bought</p>
                      <p className="font-semibold text-gold">{grams(oldGoldBuyWt)}</p>
                      <p className="text-xs text-err font-medium">{inr(oldGoldBuyAmt)} paid</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-dim">Silver bought</p>
                      <p className="font-semibold text-ink-mid">{grams(oldSilverBuyWt)}</p>
                      <p className="text-xs text-err font-medium">{inr(oldSilverBuyAmt)} paid</p>
                    </div>
                  </div>
                  {totalOldMetalCost === 0 && (
                    <p className="text-xs text-ink-dim italic">No standalone old metal purchases recorded via Metal Flow → Intake this period.</p>
                  )}
                </div>
                {/* Received in exchange */}
                <div className="px-4 py-4 space-y-2">
                  <p className="text-xs font-semibold text-ok">Received in Exchange (ASSET — not a P&L cost yet)</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-ink-dim">Gold from exchanges</p>
                      <p className="font-semibold text-gold">{grams(exchGoldWt)}</p>
                      <p className="text-xs text-ok font-medium">{inr(exchGoldVal)} credited to customers</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-dim">Silver from exchanges</p>
                      <p className="font-semibold text-ink-mid">{grams(exchSilvWt)}</p>
                      <p className="text-xs text-ok font-medium">{inr(exchSilvVal)} credited to customers</p>
                    </div>
                  </div>
                  <p className="text-xs text-ink-dim">This metal is now your raw material stock. When sold to supplier or refined+used, it will offset future COGS.</p>
                </div>
              </div>
            </div>
          )}

          {/* Final P&L summary */}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line font-semibold text-sm">Profit & Loss Summary</div>
            <div className="divide-y divide-line text-sm">
              {[
                { label: "Total Revenue (incl GST)",             value: gold.revenueInclGst + silver.revenueInclGst + mprRevenue, indent: false, bold: false, color: "" },
                { label: "  Less: GST Collected",                value: -totalGst,           indent: true,  bold: false, color: "text-warn" },
                { label: "Net Revenue (excl GST)",               value: totalRevenue,         indent: false, bold: true,  color: "text-ink" },
                { label: "  Less: Supplier Purchases",           value: -supplierCogs,        indent: true,  bold: false, color: "text-err" },
                { label: "  Less: Old Metal Purchased (cash)",   value: -totalOldMetalCost,   indent: true,  bold: false, color: "text-err" },
                { label: "Gross Profit",                         value: grossProfit,          indent: false, bold: true,  color: grossProfit >= 0 ? "text-ok" : "text-err" },
                { label: "  Less: Operating Expenses",           value: -totalExpenses,       indent: true,  bold: false, color: "text-err" },
                { label: "Net Profit",                           value: netProfit,            indent: false, bold: true,  color: netProfit >= 0 ? "text-ok" : "text-err" },
              ].map((row, i) => (
                <div key={i} className={clsx("flex items-center justify-between px-4 py-3", row.bold && "bg-canvas/50")}>
                  <span className={clsx(row.indent && "pl-4 text-ink-dim", row.bold && "font-semibold")}>{row.label}</span>
                  <span className={clsx("font-mono", row.bold && "text-base font-bold", row.color)}>
                    {row.value < 0 ? `(${inr(Math.abs(row.value))})` : inr(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Note about accuracy */}
          <div className="bg-canvas border border-line rounded-xl px-4 py-3 text-xs text-ink-dim space-y-1">
            <p><strong>Notes on accuracy:</strong></p>
            <p>• <strong>COGS now includes:</strong> supplier purchases + cash paid for old gold/silver bought from public (via Metal Flow → Intake).</p>
            <p>• <strong>Exchange gold is NOT a cost</strong> — when a customer exchanges old jewelry, you gave them credit (already embedded in the sale amount). The old gold you received is a raw material asset. Record it using Metal Flow → Intake so the stock is tracked.</p>
            <p>• <strong>Making + VA income</strong> is the most reliable profitability metric — it reflects your service margin regardless of metal price movements.</p>
            <p>• <strong>Metal rate profit/loss</strong> (buying old gold cheap, selling at higher rate) is not shown here — it appears when the metal is dispatched to a supplier and their payment is reconciled.</p>
          </div>
        </div>
      )}

      {/* ── PRODUCT MIX TAB ─────────────────────────────────────── */}
      {tab === "products" && (
        <div className="space-y-5">
          {/* Merge / manage bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { setMergeMode(m => !m); setMergeSelected(new Set()); setMergeTo(""); }}
              className={clsx("px-3 py-1.5 text-sm rounded-lg2 border transition-colors",
                mergeMode ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold")}>
              {mergeMode ? "Cancel" : "Merge Products"}
            </button>
            {mergeMode && mergeSelected.size >= 2 && (
              <>
                <span className="text-sm text-ink-dim">{mergeSelected.size} selected →</span>
                <input
                  value={mergeTo}
                  onChange={e => setMergeTo(e.target.value)}
                  placeholder="merged product name"
                  className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-52"
                />
                <button
                  onClick={handleMerge}
                  disabled={!mergeTo.trim() || mergeProducts.isPending}
                  className="px-3 py-1.5 text-sm bg-gold text-white rounded-lg2 disabled:opacity-50 hover:bg-gold/90">
                  {mergeProducts.isPending ? "Merging..." : "Merge"}
                </button>
              </>
            )}
            {mergeMode && mergeSelected.size < 2 && (
              <span className="text-xs text-ink-dim">Check 2 or more products to merge them</span>
            )}
          </div>

          {productItems.length === 0 ? (
            <p className="text-ink-dim text-sm text-center py-10">No confirmed sales in this period.</p>
          ) : (
            <>
              <ProductTable
                title="Gold Items"
                color="text-gold bg-gold/5"
                items={productItems.filter((i: any) => GOLD_METALS.includes(i.metal))}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
              <ProductTable
                title="Silver Items"
                color="text-ink-mid bg-canvas"
                items={productItems.filter((i: any) => SILVER_METALS.includes(i.metal))}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
              <ProductTable
                title="Silver MPR (Fixed Price)"
                color="text-info bg-info/5"
                showGrams={false}
                items={productItems.filter((i: any) => i.metal === "silver_mpr")}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
              <ProductTable
                title="Diamond Items (all metals)"
                color="text-purple-600 bg-purple-50"
                items={productItems.filter((i: any) => Number(i.diamond_amt) > 0)}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
            </>
          )}
        </div>
      )}

      {/* ── EXPENSES TAB ────────────────────────────────────────── */}
      {tab === "expenses" && (
        <div className="space-y-5">
          {/* Category summary cards */}
          {(() => {
            const cats = groupExpensesByCategory(expenses as any[]);
            const total = (expenses as any[]).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {cats.map(([cat, d]) => (
                    <div key={cat} className="bg-white rounded-xl border border-line p-4 shadow-soft">
                      <p className="text-xs text-ink-dim">{cat}</p>
                      <p className="text-lg font-bold text-err mt-0.5">{inr(d.total)}</p>
                      <p className="text-xs text-ink-dim mt-0.5">{d.count} entry{d.count !== 1 ? "ies" : "y"}</p>
                    </div>
                  ))}
                  <div className="bg-white rounded-xl border border-gold/30 p-4 shadow-soft">
                    <p className="text-xs text-ink-dim">Total Expenses</p>
                    <p className="text-lg font-bold text-err mt-0.5">{inr(total)}</p>
                    <p className="text-xs text-ink-dim mt-0.5">{(expenses as any[]).length} entries</p>
                  </div>
                </div>

                {/* Category-wise detail tables */}
                {cats.map(([cat, d]) => (
                  <div key={cat} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-err bg-err/5 flex justify-between">
                      <span>{cat}</span>
                      <span>{inr(d.total)}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                          <th className="text-left px-4 py-2">Date</th>
                          <th className="text-left px-3 py-2">Description</th>
                          <th className="text-right px-4 py-2">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((e: any, i: number) => (
                          <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/50">
                            <td className="px-4 py-2.5 text-ink-dim">{shortDate(e.exp_date)}</td>
                            <td className="px-3 py-2.5">{e.description || "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-err">{inr(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {cats.length === 0 && (
                  <p className="text-ink-dim text-sm text-center py-10">No expenses in this period.</p>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── SALES DETAIL TAB ────────────────────────────────────── */}
      {tab === "detail" && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">{t("bill_no")}</th>
              <th className="text-left px-3 py-2.5">{t("date")}</th>
              <th className="text-left px-3 py-2.5">Customer</th>
              <th className="text-right px-3 py-2.5 text-gold">Gold (g)</th>
              <th className="text-right px-3 py-2.5 text-ink-mid">Silver (g)</th>
              <th className="text-right px-3 py-2.5 text-ok">Making</th>
              <th className="text-right px-3 py-2.5 text-warn">GST</th>
              <th className="text-right px-3 py-2.5">{t("total")}</th>
            </tr></thead>
            <tbody>
              {(salesDetail as any[]).map((s: any) => {
                const its = s.sale_items ?? [];
                const billGoldG = its.filter((i: any) => GOLD_METALS.includes(i.metal)).reduce((a: number, i: any) => a + Number(i.net_wt||0), 0);
                const billSilvG = its.filter((i: any) => SILVER_METALS.includes(i.metal)).reduce((a: number, i: any) => a + Number(i.net_wt||0), 0);
                const billMaking = its.reduce((a: number, i: any) => a + Number(i.making_amt||0), 0);
                return (
                  <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-mono text-info">{s.bill_no}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                    <td className="px-3 py-2.5">{s.customers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gold">{billGoldG > 0 ? grams(billGoldG) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-mid">{billSilvG > 0 ? grams(billSilvG) : "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ok">{billMaking > 0 ? inr(billMaking) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-warn">{inr(s.gst_amount ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{inr(Number(s.total))}</td>
                  </tr>
                );
              })}
              {!salesDetail.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
