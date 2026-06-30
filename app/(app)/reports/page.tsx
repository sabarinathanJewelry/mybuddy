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
        .select("metal, gross_wt, net_wt, pure_wt, rate, va_pct, making_amt, stone_amt, diamond_amt, gst_pct, line_total, is_suspense, sales!inner(id, bill_date, status, bill_no)")
        .gte("sales.bill_date", from)
        .lte("sales.bill_date", to)
        .eq("sales.status", "confirmed");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// All sale_ids that came from an order delivery — checked against actual sale bill_date via usePnlItems
function useOrderSaleIds() {
  return useQuery({
    queryKey: ["order-sale-ids"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase()
        .from("orders")
        .select("sale_id")
        .not("sale_id", "is", null);
      return new Set<string>((data ?? []).map((o: any) => o.sale_id).filter(Boolean));
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

function useKolusuItems(from: string, to: string) {
  return useQuery({
    queryKey: ["kolusu-pnl", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sale_items")
        .select("id, description, metal, gross_wt, net_wt, line_total, is_suspense, sales!inner(bill_date, status)")
        .gte("sales.bill_date", from)
        .lte("sales.bill_date", to)
        .eq("sales.status", "confirmed")
        .ilike("description", "%KOLUSU%");
      if (error) throw error;
      return (data ?? []) as any[];
    },
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

// Weighted average cost across ALL-TIME bullion buys + old metal intake (no date filter)
function useMetalWAC() {
  return useQuery({
    queryKey: ["metal-wac"],
    queryFn: async () => {
      const client = supabase();
      const [{ data: bullion, error: e1 }, { data: intake, error: e2 }] = await Promise.all([
        client.from("bullion_trades").select("metal, pure_wt, total_amount").eq("trade_type", "buy"),
        client.from("old_metal_intake").select("metal, pure_wt, payout_amount").gt("payout_amount", 0),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      function calcWac(items: { pure_wt: any; cost: any }[]) {
        const wt   = items.reduce((s, i) => s + Number(i.pure_wt || 0), 0);
        const cost = items.reduce((s, i) => s + Number(i.cost    || 0), 0);
        return { wt, cost, rate: wt > 0 ? cost / wt : 0 };
      }

      const goldItems = [
        ...(bullion ?? []).filter(t => t.metal === "gold").map(t => ({ pure_wt: t.pure_wt, cost: t.total_amount })),
        ...(intake  ?? []).filter(i => (i.metal as string).startsWith("gold")).map(i => ({ pure_wt: i.pure_wt, cost: i.payout_amount })),
      ];
      const silvItems = [
        ...(bullion ?? []).filter(t => t.metal === "silver").map(t => ({ pure_wt: t.pure_wt, cost: t.total_amount })),
        ...(intake  ?? []).filter(i => (i.metal as string).startsWith("silver")).map(i => ({ pure_wt: i.pure_wt, cost: i.payout_amount })),
      ];

      return { gold: calcWac(goldItems), silver: calcWac(silvItems) };
    },
  });
}

// Cut rate payments settled in the selected period
function useCutRatePayments(from: string, to: string) {
  return useQuery({
    queryKey: ["cut-rate-payments", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("supplier_payments")
        .select("amount, metal_wt, cut_rate, pay_date, suppliers(name)")
        .eq("mode", "cut_rate")
        .gte("pay_date", from)
        .lte("pay_date", to)
        .order("pay_date");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// Physical metal dispatches to suppliers/goldsmiths in the period
function useMetalDispatches(from: string, to: string) {
  return useQuery({
    queryKey: ["metal-dispatches-period", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("metal_dispatches")
        .select("dispatch_date, metal, weight_g, purpose, party_name, suppliers(name)")
        .gte("dispatch_date", from)
        .lte("dispatch_date", to)
        .in("purpose", ["supplier", "goldsmith"])
        .order("dispatch_date");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// Orders placed in the period (pending + in-progress + delivered + converted)
function useOrdersReport(from: string, to: string) {
  return useQuery({
    queryKey: ["orders-report", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("orders")
        .select("id, status, order_date, delivery_date, sale_id, order_items(metal, estimated_wt, amount)")
        .gte("order_date", from)
        .lte("order_date", to);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// Bullion sell trades in the period (old gold/refined sold to dealer or supplier)
function useBullionSells(from: string, to: string) {
  return useQuery({
    queryKey: ["bullion-sells", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("bullion_trades")
        .select("trade_date, metal, pure_wt, rate_per_g, total_amount, party_name, suppliers(name)")
        .eq("trade_type", "sell")
        .gte("trade_date", from)
        .lte("trade_date", to)
        .order("trade_date");
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

function MetalCard({ title, color, data }: {
  title: string; color: string;
  data: ReturnType<typeof metalSection>;
}) {
  return (
    <div className={clsx("bg-white rounded-xl border border-line shadow-soft overflow-x-auto")}>
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
    <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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

// ── item search ───────────────────────────────────────────────────────────────

function useItemSearch(term: string, from: string, to: string) {
  return useQuery({
    queryKey: ["item-search", term, from, to],
    enabled: term.trim().length >= 2 && !!from && !!to,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sale_items")
        .select("description, metal, gross_wt, net_wt, line_total, sales!inner(id, bill_no, bill_date, total, customers!inner(id, name))")
        .ilike("description", `%${term.trim()}%`)
        .gte("sales.bill_date", from)
        .lte("sales.bill_date", to)
        .limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const t = useT();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab]     = useState<"pnl" | "detail" | "products" | "expenses" | "items" | "kolusu">("pnl");
  const [kolusuPureRate,       setKolusuPureRate]       = useState(263);
  const [kolusuBoardRate,      setKolusuBoardRate]      = useState(285);
  const [kolusuSuspenseMargin, setKolusuSuspenseMargin] = useState(2);
  const [kolusuActualTouch,    setKolusuActualTouch]    = useState(65);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [useCustom, setUseCustom]   = useState(false);
  const [itemTerm, setItemTerm]     = useState("");
  const [itemFrom, setItemFrom]     = useState("");
  const [itemTo, setItemTo]         = useState("");
  const [mergeMode, setMergeMode]   = useState(false);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeTo, setMergeTo]       = useState("");
  const [purchVaGold,   setPurchVaGold]   = useState<number | "">(0);
  const [purchVaSilver, setPurchVaSilver] = useState<number | "">(0);

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
  const { data: kolusuItems = [],  isLoading: loadingKolusu }      = useKolusuItems(range.from, range.to);
  const { data: itemResults = [], isFetching: itemSearching }      = useItemSearch(itemTerm, itemFrom, itemTo);
  const { data: wacData }                                           = useMetalWAC();
  const { data: cutRatePayments = [] }                              = useCutRatePayments(range.from, range.to);
  const { data: metalDispatches = [] }                              = useMetalDispatches(range.from, range.to);
  const { data: bullionSells = [] }                                 = useBullionSells(range.from, range.to);
  const { data: ordersReport = [] }                                 = useOrdersReport(range.from, range.to);
  const { data: orderSaleIds = new Set<string>() }                  = useOrderSaleIds();

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

  // Sales source breakdown: ready stock vs order delivery vs suspense
  function sourceBucket(metals: string[]) {
    const filtered = (items as any[]).filter(i => metals.includes(i.metal));
    const sum = (arr: any[]) => ({
      count:   arr.length,
      grossWt: arr.reduce((s, i) => s + Number(i.gross_wt || 0), 0),
      netWt:   arr.reduce((s, i) => s + Number(i.net_wt   || 0), 0),
      revenue: arr.reduce((s, i) => s + Number(i.line_total || 0), 0),
    });
    const suspense     = filtered.filter(i => i.is_suspense);
    const orderDel     = filtered.filter(i => !i.is_suspense && orderSaleIds.has(i.sales?.id));
    const readyStock   = filtered.filter(i => !i.is_suspense && !orderSaleIds.has(i.sales?.id));
    return { readyStock: sum(readyStock), orderDel: sum(orderDel), suspense: sum(suspense) };
  }
  const goldBreakdown   = sourceBucket(GOLD_METALS);
  const silverBreakdown = sourceBucket(SILVER_METALS);

  const goldPurchases   = purchaseSection(purchases, GOLD_METALS);
  const silverPurchases = purchaseSection(purchases, SILVER_METALS);

  const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount||0), 0);

  const totalRevenue  = gold.revenueExGst + silver.revenueExGst + mprRevenue;
  const totalGst      = gold.gstAmt + silver.gstAmt;
  const supplierCogs  = goldPurchases.amount + silverPurchases.amount;
  const totalCogs     = supplierCogs + totalOldMetalCost;
  const totalService  = gold.makingAmt + gold.vaAmt + gold.stoneAmt +
                        silver.makingAmt + silver.vaAmt + silver.stoneAmt;

  // WAC of reserve (all-time weighted average cost per gram)
  const goldWAC   = wacData?.gold.rate   ?? 0;
  const silverWAC = wacData?.silver.rate ?? 0;

  // Physical metal dispatches → cost = grams × WAC (gold from reserve sent to suppliers)
  const dispatchGoldWt   = (metalDispatches as any[]).filter((d: any) => d.metal === "gold").reduce((s: number, d: any) => s + Number(d.weight_g || 0), 0);
  const dispatchSilvWt   = (metalDispatches as any[]).filter((d: any) => d.metal === "silver").reduce((s: number, d: any) => s + Number(d.weight_g || 0), 0);
  const dispatchGoldCost = dispatchGoldWt * goldWAC;
  const dispatchSilvCost = dispatchSilvWt * silverWAC;

  // Rate cut payments → cost = amount paid (the cash IS the purchase price, not WAC)
  const cutRatePaid   = (cutRatePayments as any[]).reduce((s: number, p: any) => s + Number(p.amount   || 0), 0);
  const cutRateGrams  = (cutRatePayments as any[]).reduce((s: number, p: any) => s + Number(p.metal_wt || 0), 0);

  // Total metal purchase cost in period
  const totalMetalPurchaseCost = dispatchGoldCost + dispatchSilvCost + cutRatePaid;
  const metalGrossMargin = totalRevenue - totalMetalPurchaseCost;

  // Bullion sell trading P&L (old gold/refined sold to dealer or supplier at a rate)
  const bullionSellGoldRevenue = (bullionSells as any[]).filter((t: any) => t.metal === "gold").reduce((s: number, t: any) => s + Number(t.total_amount || 0), 0);
  const bullionSellGoldWt      = (bullionSells as any[]).filter((t: any) => t.metal === "gold").reduce((s: number, t: any) => s + Number(t.pure_wt    || 0), 0);
  const bullionSellSilvRevenue = (bullionSells as any[]).filter((t: any) => t.metal === "silver").reduce((s: number, t: any) => s + Number(t.total_amount || 0), 0);
  const bullionSellSilvWt      = (bullionSells as any[]).filter((t: any) => t.metal === "silver").reduce((s: number, t: any) => s + Number(t.pure_wt    || 0), 0);
  const bullionSellGoldCost    = bullionSellGoldWt * goldWAC;
  const bullionSellSilvCost    = bullionSellSilvWt * silverWAC;
  const bullionTradingProfit   = (bullionSellGoldRevenue + bullionSellSilvRevenue) - (bullionSellGoldCost + bullionSellSilvCost);

  // Orders placed in the period
  const ordersAll        = ordersReport as any[];
  const ordersDelivered  = ordersAll.filter(o => o.status === "delivered" || o.sale_id);
  const ordersConverted  = ordersAll.filter(o => !!o.sale_id);
  const goldOrderItems   = ordersAll.flatMap((o: any) => (o.order_items ?? []).filter((i: any) => GOLD_METALS.includes(i.metal)));
  const silverOrderItems = ordersAll.flatMap((o: any) => (o.order_items ?? []).filter((i: any) => SILVER_METALS.includes(i.metal)));
  const orderGoldWt      = goldOrderItems.reduce((s: number, i: any) => s + Number(i.estimated_wt || 0), 0);
  const orderSilverWt    = silverOrderItems.reduce((s: number, i: any) => s + Number(i.estimated_wt || 0), 0);
  const orderGoldValue   = goldOrderItems.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const orderSilverValue = silverOrderItems.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  // Effective P&L: use WAC-based metal cost when reserve data exists, else fall back to period purchases
  const hasWac = goldWAC > 0;
  const effectivePurchaseCost  = hasWac ? totalMetalPurchaseCost : (supplierCogs + totalOldMetalCost);
  const effectiveGrossProfit   = hasWac ? (metalGrossMargin + bullionTradingProfit) : (totalRevenue - supplierCogs - totalOldMetalCost);
  const grossProfit   = totalRevenue - totalCogs; // kept for P&L summary fallback row
  const netProfit     = effectiveGrossProfit - totalExpenses;

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
        {([["pnl", "P&L Report"], ["detail", "Sales Detail"], ["products", "Product Mix"], ["expenses", "Expenses"], ["items", "Item Search"], ["kolusu", "Kolusu P&L"]] as const).map(([k, label]) => (
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
              { label: "Revenue (excl GST)",                                       value: inr(totalRevenue),            color: "text-ink" },
              { label: "GST Collected",                                            value: inr(totalGst),                color: "text-warn" },
              { label: hasWac ? "Metal Purchase Cost (WAC)" : "Supplier Purchases", value: inr(effectivePurchaseCost),  color: "text-err" },
              { label: hasWac ? "Bullion Trading Profit" : "Old Metal Bought",     value: hasWac ? inr(bullionTradingProfit) : inr(totalOldMetalCost), color: hasWac ? (bullionTradingProfit >= 0 ? "text-ok" : "text-err") : "text-err" },
              { label: "Gross Profit",                                             value: inr(effectiveGrossProfit),    color: effectiveGrossProfit >= 0 ? "text-ok" : "text-err" },
              { label: "Net Profit",                                               value: inr(netProfit),               color: netProfit >= 0 ? "text-ok" : "text-err" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">{s.label}</p>
                <p className={clsx("text-lg font-bold mt-0.5", s.color)}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Gold section */}
          {gold.count > 0 && (
            <MetalCard title="Gold (22K + 18K + 24K)" color="text-gold bg-gold/5" data={gold} />
          )}

          {/* Silver section */}
          {silver.count > 0 && (
            <MetalCard title="Silver (Standard + Pure)" color="text-ink-mid bg-canvas" data={silver} />
          )}

          {/* Sales source breakdown */}
          {items.length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm bg-canvas/50">
                Sales Breakdown — Source of Items Sold
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-dim border-b border-line bg-canvas">
                    <th className="text-left px-4 py-2">Metal</th>
                    <th className="text-right px-3 py-2">Ready Stock</th>
                    <th className="text-right px-3 py-2">Order Delivery</th>
                    <th className="text-right px-3 py-2">From Suspense</th>
                    <th className="text-right px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: "Gold — Gross Wt",   gB: goldBreakdown,   sB: silverBreakdown, field: "grossWt" as const, fmt: grams,  metal: "gold"   },
                    { label: "Gold — Net Wt",     gB: goldBreakdown,   sB: silverBreakdown, field: "netWt"   as const, fmt: grams,  metal: "gold"   },
                    { label: "Gold — Items",       gB: goldBreakdown,   sB: silverBreakdown, field: "count"   as const, fmt: (n: number) => String(n), metal: "gold" },
                    { label: "Silver — Gross Wt", gB: silverBreakdown, sB: silverBreakdown, field: "grossWt" as const, fmt: grams,  metal: "silver" },
                    { label: "Silver — Net Wt",   gB: silverBreakdown, sB: silverBreakdown, field: "netWt"   as const, fmt: grams,  metal: "silver" },
                    { label: "Silver — Items",     gB: silverBreakdown, sB: silverBreakdown, field: "count"   as const, fmt: (n: number) => String(n), metal: "silver" },
                  ] as const).map(({ label, gB, field, fmt, metal }) => {
                    const bk = metal === "gold" ? goldBreakdown : silverBreakdown;
                    const rs = bk.readyStock[field];
                    const od = bk.orderDel[field];
                    const sp = bk.suspense[field];
                    const total = (rs as number) + (od as number) + (sp as number);
                    if (total === 0) return null;
                    const isGold = metal === "gold";
                    return (
                      <tr key={label} className="border-b border-line/50 last:border-0 hover:bg-canvas/30">
                        <td className={clsx("px-4 py-2.5 font-medium text-xs", isGold ? "text-gold" : "text-ink-mid")}>{label}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">
                          {(rs as number) > 0 ? fmt(rs as number) : <span className="text-ink-dim">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-info">
                          {(od as number) > 0 ? fmt(od as number) : <span className="text-ink-dim">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-warn">
                          {(sp as number) > 0 ? fmt(sp as number) : <span className="text-ink-dim">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                          {fmt(total as number)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-canvas/50 text-xs font-semibold">
                    <td className="px-4 py-2.5">Revenue (excl GST)</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(goldBreakdown.readyStock.revenue + silverBreakdown.readyStock.revenue)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-info">{inr(goldBreakdown.orderDel.revenue + silverBreakdown.orderDel.revenue)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-warn">{inr(goldBreakdown.suspense.revenue + silverBreakdown.suspense.revenue)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{inr(gold.revenueExGst + silver.revenueExGst)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="px-4 py-2 border-t border-line bg-canvas/30 flex gap-6 text-[11px] text-ink-dim">
                <span><span className="font-medium text-ink">Ready Stock</span> — sold from shelf inventory</span>
                <span><span className="font-medium text-info">Order Delivery</span> — converted from customer orders</span>
                <span><span className="font-medium text-warn">Suspense</span> — items received from supplier on suspense</span>
              </div>
            </div>
          )}

          {/* Silver MPR */}
          {mprItems.length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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

          {/* Orders placed this period */}
          {ordersAll.length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-info bg-info/5 flex items-center justify-between">
                <span>Orders Placed — {MONTHS[month - 1]} {year}
                  <span className="ml-2 text-xs font-normal text-ink-dim">{ordersAll.length} order{ordersAll.length !== 1 ? "s" : ""}</span>
                </span>
                <div className="flex gap-3 text-xs font-normal">
                  <span className="text-ok">{ordersConverted.length} converted to sale</span>
                  <span className="text-warn">{ordersDelivered.length - ordersConverted.length > 0 ? `${ordersDelivered.length - ordersConverted.length} delivered` : ""}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm">
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Gold Ordered (est. wt)</p>
                  <p className="font-semibold text-gold">{orderGoldWt > 0 ? grams(orderGoldWt) : "—"}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Gold Est. Value</p>
                  <p className="font-semibold text-gold">{orderGoldValue > 0 ? inr(orderGoldValue) : "—"}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Silver Ordered (est. wt)</p>
                  <p className="font-semibold text-ink-mid">{orderSilverWt > 0 ? grams(orderSilverWt) : "—"}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Silver Est. Value</p>
                  <p className="font-semibold text-ink-mid">{orderSilverValue > 0 ? inr(orderSilverValue) : "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-0 divide-x divide-line text-sm border-t border-line">
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Total Orders</p>
                  <p className="font-semibold">{ordersAll.length}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Delivered this month</p>
                  <p className="font-semibold text-ok">{ordersDelivered.length}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Converted to Sale</p>
                  <p className="font-bold text-ok">{ordersConverted.length}</p>
                </div>
              </div>
            </div>
          )}

          {/* Service income summary */}
          {(() => {
            const goldSaleVaAmt     = Math.max(0, gold.vaAmt);
            const silverSaleVaAmt   = Math.max(0, silver.vaAmt);
            const goldAvgSaleVaPct  = gold.metalValue   > 0 ? (gold.vaAmt   / gold.metalValue)   * 100 : 0;
            const silverAvgSaleVaPct= silver.metalValue > 0 ? (silver.vaAmt / silver.metalValue) * 100 : 0;
            const pVaG = Number(purchVaGold)   || 0;
            const pVaS = Number(purchVaSilver) || 0;
            const goldPurchVaCost   = pVaG > 0 ? (pVaG / 100) * gold.metalValue   : 0;
            const silverPurchVaCost = pVaS > 0 ? (pVaS / 100) * silver.metalValue : 0;
            const goldNetVa         = goldSaleVaAmt   - goldPurchVaCost;
            const silverNetVa       = silverSaleVaAmt - silverPurchVaCost;
            const hasEstimate       = pVaG > 0 || pVaS > 0;
            const netServiceIncome  = gold.makingAmt + goldNetVa + gold.stoneAmt +
                                      silver.makingAmt + silverNetVa + silver.stoneAmt;
            return (
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
                <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-ok bg-ok/5">
                  Service Income Breakdown (Making + VA + Stone/Diamond)
                </div>

                {/* Revenue row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm">
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Making Charges (Gold)</p>
                    <p className="font-semibold text-gold">{inr(gold.makingAmt)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">VA Revenue (Gold)</p>
                    <p className="font-semibold text-gold">{inr(goldSaleVaAmt)}</p>
                    {goldAvgSaleVaPct > 0 && (
                      <p className="text-[10px] text-ink-dim mt-0.5">avg {goldAvgSaleVaPct.toFixed(1)}% of metal value</p>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Making Charges (Silver)</p>
                    <p className="font-semibold text-ink-mid">{inr(silver.makingAmt)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">VA Revenue (Silver)</p>
                    <p className="font-semibold text-ink-mid">{inr(silverSaleVaAmt)}</p>
                    {silverAvgSaleVaPct > 0 && (
                      <p className="text-[10px] text-ink-dim mt-0.5">avg {silverAvgSaleVaPct.toFixed(1)}% of metal value</p>
                    )}
                  </div>
                </div>

                {/* Purchase VA estimate input */}
                <div className="border-t border-dashed border-line bg-canvas/50 px-4 py-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <p className="text-xs font-semibold text-ink-dim">Purchase VA% you paid (estimate):</p>
                    <label className="flex items-center gap-2 text-xs text-ink-dim">
                      Gold VA%
                      <input
                        type="number" min="0" max="20" step="0.5"
                        value={purchVaGold === 0 ? "" : purchVaGold}
                        placeholder="e.g. 6"
                        onChange={e => setPurchVaGold(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-20 border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold text-ink"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-ink-dim">
                      Silver VA%
                      <input
                        type="number" min="0" max="20" step="0.5"
                        value={purchVaSilver === 0 ? "" : purchVaSilver}
                        placeholder="e.g. 4"
                        onChange={e => setPurchVaSilver(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-20 border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold text-ink"
                      />
                    </label>
                    {hasEstimate && (
                      <button onClick={() => { setPurchVaGold(0); setPurchVaSilver(0); }}
                        className="text-xs text-ink-dim hover:text-err ml-auto">Clear</button>
                    )}
                  </div>

                  {hasEstimate && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      {pVaG > 0 && (
                        <>
                          <div>
                            <p className="text-xs text-ink-dim">Est. Purchase VA Cost (Gold)</p>
                            <p className="font-semibold text-err text-sm">{inr(goldPurchVaCost)}</p>
                            <p className="text-[10px] text-ink-dim">at {pVaG}% of metal value</p>
                          </div>
                          <div>
                            <p className="text-xs text-ink-dim">Est. Net VA Income (Gold)</p>
                            <p className={clsx("font-semibold text-sm", goldNetVa >= 0 ? "text-ok" : "text-err")}>{inr(goldNetVa)}</p>
                            <p className="text-[10px] text-ink-dim">{goldAvgSaleVaPct.toFixed(1)}% sale − {pVaG}% purchase</p>
                          </div>
                        </>
                      )}
                      {pVaS > 0 && (
                        <>
                          <div>
                            <p className="text-xs text-ink-dim">Est. Purchase VA Cost (Silver)</p>
                            <p className="font-semibold text-err text-sm">{inr(silverPurchVaCost)}</p>
                            <p className="text-[10px] text-ink-dim">at {pVaS}% of metal value</p>
                          </div>
                          <div>
                            <p className="text-xs text-ink-dim">Est. Net VA Income (Silver)</p>
                            <p className={clsx("font-semibold text-sm", silverNetVa >= 0 ? "text-ok" : "text-err")}>{inr(silverNetVa)}</p>
                            <p className="text-[10px] text-ink-dim">{silverAvgSaleVaPct.toFixed(1)}% sale − {pVaS}% purchase</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className={clsx("px-4 py-3 border-t border-line", hasEstimate ? "bg-ok/5" : "bg-ok/5")}>
                  {!hasEstimate ? (
                    <>
                      <span className="text-sm text-ink-dim">Total Service Revenue: </span>
                      <span className="text-lg font-bold text-ok">{inr(totalService)}</span>
                      <span className="ml-3 text-xs text-ink-dim">(VA is gross revenue — enter purchase VA% above to see net)</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-ink-dim">Est. Net Service Income: </span>
                      <span className="text-lg font-bold text-ok">{inr(netServiceIncome)}</span>
                      <span className="ml-3 text-xs text-warn">estimate — based on your purchase VA% inputs</span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Expenses */}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-line font-semibold text-sm">Profit & Loss Summary</div>
            <div className="divide-y divide-line text-sm">
              {(hasWac ? [
                { label: "Total Revenue (incl GST)",                          value: gold.revenueInclGst + silver.revenueInclGst + mprRevenue, indent: false, bold: false, color: "" },
                { label: "  Less: GST Collected",                             value: -totalGst,                  indent: true,  bold: false, color: "text-warn" },
                { label: "Net Revenue (excl GST)",                            value: totalRevenue,                indent: false, bold: true,  color: "text-ink" },
                { label: "  Less: Metal Dispatched to Suppliers (at WAC)",    value: -(dispatchGoldCost + dispatchSilvCost), indent: true, bold: false, color: "text-err" },
                { label: "  Less: Rate Cut Payments (cash)",                  value: -cutRatePaid,               indent: true,  bold: false, color: "text-err" },
                { label: "  Add: Bullion Trading Profit",                     value: bullionTradingProfit,       indent: true,  bold: false, color: bullionTradingProfit >= 0 ? "text-ok" : "text-err" },
                { label: "Gross Profit",                                      value: effectiveGrossProfit,       indent: false, bold: true,  color: effectiveGrossProfit >= 0 ? "text-ok" : "text-err" },
                { label: "  Less: Operating Expenses",                        value: -totalExpenses,             indent: true,  bold: false, color: "text-err" },
                { label: "Net Profit",                                        value: netProfit,                  indent: false, bold: true,  color: netProfit >= 0 ? "text-ok" : "text-err" },
              ] : [
                { label: "Total Revenue (incl GST)",                          value: gold.revenueInclGst + silver.revenueInclGst + mprRevenue, indent: false, bold: false, color: "" },
                { label: "  Less: GST Collected",                             value: -totalGst,                  indent: true,  bold: false, color: "text-warn" },
                { label: "Net Revenue (excl GST)",                            value: totalRevenue,                indent: false, bold: true,  color: "text-ink" },
                { label: "  Less: Supplier Purchases",                        value: -supplierCogs,              indent: true,  bold: false, color: "text-err" },
                { label: "  Less: Old Metal Purchased (cash)",                value: -totalOldMetalCost,         indent: true,  bold: false, color: "text-err" },
                { label: "Gross Profit",                                      value: grossProfit,                indent: false, bold: true,  color: grossProfit >= 0 ? "text-ok" : "text-err" },
                { label: "  Less: Operating Expenses",                        value: -totalExpenses,             indent: true,  bold: false, color: "text-err" },
                { label: "Net Profit",                                        value: netProfit,                  indent: false, bold: true,  color: netProfit >= 0 ? "text-ok" : "text-err" },
              ]).map((row, i) => (
                <div key={i} className={clsx("flex items-center justify-between px-4 py-3", row.bold && "bg-canvas/50")}>
                  <span className={clsx(row.indent && "pl-4 text-ink-dim", row.bold && "font-semibold")}>{row.label}</span>
                  <span className={clsx("font-mono", row.bold && "text-base font-bold", row.color)}>
                    {row.value < 0 ? `(${inr(Math.abs(row.value))})` : inr(row.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Metal Purchase Cost P&L (WAC-based) */}
          {goldWAC > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-gold bg-gold/5">
                Metal Purchase Cost P&L
              </div>

              {/* WAC info row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm border-b border-dashed border-line bg-canvas/30">
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Gold Reserve WAC (all-time)</p>
                  <p className="font-semibold text-gold">{inr(goldWAC)}<span className="text-xs font-normal text-ink-dim">/g</span></p>
                  <p className="text-[10px] text-ink-dim mt-0.5">{grams(wacData?.gold.wt ?? 0)} total · {inr(wacData?.gold.cost ?? 0)} paid</p>
                </div>
                {silverWAC > 0 && (
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Silver Reserve WAC (all-time)</p>
                    <p className="font-semibold text-ink-mid">{inr(silverWAC)}<span className="text-xs font-normal text-ink-dim">/g</span></p>
                    <p className="text-[10px] text-ink-dim mt-0.5">{grams(wacData?.silver.wt ?? 0)} total · {inr(wacData?.silver.cost ?? 0)} paid</p>
                  </div>
                )}
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Includes</p>
                  <p className="text-xs text-ink-dim mt-1">Bullion purchases + old/exchange gold (payout amounts)</p>
                </div>
              </div>

              {/* Purchase cost breakdown */}
              <div className="divide-y divide-line text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line">
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Gold Dispatched this period</p>
                    <p className="font-semibold">{grams(dispatchGoldWt)}</p>
                    <p className="text-[10px] text-ink-dim mt-0.5">{(metalDispatches as any[]).filter((d: any) => d.metal === "gold").length} dispatch(es)</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Dispatch Cost (gold × WAC)</p>
                    <p className="font-semibold text-err">{goldWAC > 0 ? inr(dispatchGoldCost) : "—"}</p>
                    <p className="text-[10px] text-ink-dim mt-0.5">{grams(dispatchGoldWt)} × {inr(goldWAC)}/g</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Rate Cuts (cash paid)</p>
                    <p className="font-semibold text-err">{inr(cutRatePaid)}</p>
                    <p className="text-[10px] text-ink-dim mt-0.5">{grams(cutRateGrams)} grams cut · {(cutRatePayments as any[]).length} settlement(s)</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Total Purchase Cost</p>
                    <p className="font-bold text-err text-base">{inr(totalMetalPurchaseCost)}</p>
                    <p className="text-[10px] text-ink-dim mt-0.5">dispatches + rate cuts</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line bg-canvas/50">
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Sales Revenue (excl GST)</p>
                    <p className="font-semibold">{inr(totalRevenue)}</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-ink-dim">Total Purchase Cost</p>
                    <p className="font-semibold text-err">{inr(totalMetalPurchaseCost)}</p>
                  </div>
                  <div className="px-4 py-3 sm:col-span-2">
                    <p className="text-xs text-ink-dim">Gross Margin (Revenue − Purchase Cost)</p>
                    <p className={clsx("text-lg font-bold", metalGrossMargin >= 0 ? "text-ok" : "text-err")}>
                      {inr(metalGrossMargin)}
                      <span className={clsx("ml-2 text-xs font-normal", metalGrossMargin >= 0 ? "text-ok" : "text-err")}>
                        {totalRevenue > 0 ? `${((metalGrossMargin / totalRevenue) * 100).toFixed(1)}%` : ""}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bullion Trading P&L */}
          {(bullionSells as any[]).length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-ok bg-ok/5">
                Bullion Trading P&L — {(bullionSells as any[]).length} sale(s) in period
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-line text-sm border-b border-dashed border-line">
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Gold Sold</p>
                  <p className="font-semibold text-gold">{grams(bullionSellGoldWt)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Sale Revenue</p>
                  <p className="font-semibold">{inr(bullionSellGoldRevenue + bullionSellSilvRevenue)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Cost at WAC</p>
                  <p className="font-semibold text-err">{inr(bullionSellGoldCost + bullionSellSilvCost)}</p>
                  {goldWAC > 0 && <p className="text-[10px] text-ink-dim mt-0.5">{grams(bullionSellGoldWt)} × {inr(goldWAC)}/g</p>}
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-ink-dim">Trading Profit</p>
                  <p className={clsx("font-bold text-base", bullionTradingProfit >= 0 ? "text-ok" : "text-err")}>
                    {inr(bullionTradingProfit)}
                  </p>
                  {bullionSellGoldWt > 0 && goldWAC > 0 && (
                    <p className="text-[10px] text-ink-dim mt-0.5">
                      avg {inr((bullionSellGoldRevenue / bullionSellGoldWt) - goldWAC)}/g spread
                    </p>
                  )}
                </div>
              </div>

              {/* Detail rows */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-3 py-2">Buyer (Dealer / Supplier)</th>
                    <th className="text-left px-3 py-2">Metal</th>
                    <th className="text-right px-3 py-2">Grams (pure)</th>
                    <th className="text-right px-3 py-2">Sell Rate/g</th>
                    <th className="text-right px-3 py-2">Sale Amount</th>
                    <th className="text-right px-3 py-2">Cost at WAC</th>
                    <th className="text-right px-4 py-2">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(bullionSells as any[]).map((t: any, i: number) => {
                    const wac    = t.metal === "gold" ? goldWAC : silverWAC;
                    const cost   = Number(t.pure_wt || 0) * wac;
                    const profit = Number(t.total_amount || 0) - cost;
                    const buyer  = t.suppliers?.name ?? t.party_name ?? "—";
                    return (
                      <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim">{shortDate(t.trade_date)}</td>
                        <td className="px-3 py-2.5">{buyer}</td>
                        <td className="px-3 py-2.5 text-ink-dim capitalize">{t.metal}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(Number(t.pure_wt || 0))}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{inr(Number(t.rate_per_g || 0))}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{inr(Number(t.total_amount || 0))}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-err">{wac > 0 ? inr(cost) : "—"}</td>
                        <td className={clsx("px-4 py-2.5 text-right font-mono font-semibold", profit >= 0 ? "text-ok" : "text-err")}>
                          {wac > 0 ? inr(profit) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Rate Cut detail table */}
          {(cutRatePayments as any[]).length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-info bg-info/5">
                Rate Cut Settlements — {(cutRatePayments as any[]).length} in period
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-3 py-2">Supplier</th>
                    <th className="text-right px-3 py-2">Grams Cut</th>
                    <th className="text-right px-3 py-2">Rate/g</th>
                    <th className="text-right px-4 py-2">Cash Paid (Purchase Cost)</th>
                  </tr>
                </thead>
                <tbody>
                  {(cutRatePayments as any[]).map((p: any, i: number) => (
                    <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                      <td className="px-3 py-2.5">{p.suppliers?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(Number(p.metal_wt || 0))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{inr(Number(p.cut_rate || 0))}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-err">{inr(Number(p.amount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-canvas/50 border-t border-line font-semibold text-sm">
                    <td className="px-4 py-2.5" colSpan={2}>Total</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(cutRateGrams)}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-err">{inr(cutRatePaid)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Metal dispatch detail table */}
          {(metalDispatches as any[]).length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-warn bg-warn/5">
                Metal Dispatched to Suppliers — {(metalDispatches as any[]).length} in period
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-3 py-2">Supplier / Party</th>
                    <th className="text-left px-3 py-2">Metal</th>
                    <th className="text-right px-3 py-2">Weight</th>
                    <th className="text-right px-4 py-2">Cost at WAC</th>
                  </tr>
                </thead>
                <tbody>
                  {(metalDispatches as any[]).map((d: any, i: number) => {
                    const wac  = d.metal === "gold" ? goldWAC : silverWAC;
                    const cost = Number(d.weight_g || 0) * wac;
                    return (
                      <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim">{shortDate(d.dispatch_date)}</td>
                        <td className="px-3 py-2.5">{d.suppliers?.name ?? d.party_name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-ink-dim capitalize">{d.metal}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(Number(d.weight_g || 0))}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-err">{wac > 0 ? inr(cost) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-canvas/50 border-t border-line font-semibold text-sm">
                    <td className="px-4 py-2.5" colSpan={3}>Total</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(dispatchGoldWt + dispatchSilvWt)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-err">{inr(dispatchGoldCost + dispatchSilvCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Note about accuracy */}
          <div className="bg-canvas border border-line rounded-xl px-4 py-3 text-xs text-ink-dim space-y-1">
            <p><strong>Notes on accuracy:</strong></p>
            <p>• <strong>Metal Purchase Cost P&L</strong> uses two methods: (1) Rate cuts — the cash paid IS the purchase price. (2) Physical dispatches — cost = grams × WAC of reserve.</p>
            <p>• <strong>Gold Reserve WAC</strong> is the weighted average cost per gram across all bullion purchases + old/exchange gold (payout amounts). Refining loss is not yet deducted — actual WAC per refined gram may be slightly higher.</p>
            <p>• <strong>Exchange gold is NOT a cost</strong> — when a customer exchanges old jewelry, you gave them credit in the sale. The old gold you received is a raw material asset tracked via Metal Flow → Intake.</p>
            <p>• <strong>Making + VA income</strong> is the most reliable profitability metric — it reflects your service margin regardless of metal price movements.</p>
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
                items={productItems.filter((i: any) => GOLD_METALS.includes(i.metal) && !Number(i.diamond_amt))}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
              <ProductTable
                title="Silver Items"
                color="text-ink-mid bg-canvas"
                items={productItems.filter((i: any) => SILVER_METALS.includes(i.metal) && !Number(i.diamond_amt))}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
              <ProductTable
                title="Silver MPR (Fixed Price)"
                color="text-info bg-info/5"
                showGrams={false}
                items={productItems.filter((i: any) => i.metal === "silver_mpr" && !Number(i.diamond_amt))}
                mergeMode={mergeMode}
                mergeSelected={mergeSelected}
                onToggleMerge={toggleMergeSelect}
                onRename={handleRename}
              />
              <ProductTable
                title="Diamond Items"
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
                  <div key={cat} className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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

      {/* ── ITEM SEARCH TAB ─────────────────────────────────────── */}
      {tab === "items" && (
        <div className="space-y-5">
          {/* Search controls */}
          <div className="bg-white rounded-xl border border-line p-4 shadow-soft space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="text"
                value={itemTerm}
                onChange={e => setItemTerm(e.target.value)}
                placeholder="Search item description (e.g. malai, chain, ring…)"
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold flex-1 min-w-52"
              />
              <div className="flex items-center gap-2">
                <input type="date" value={itemFrom} onChange={e => setItemFrom(e.target.value)}
                  className="border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
                <span className="text-ink-dim text-xs">–</span>
                <input type="date" value={itemTo} onChange={e => setItemTo(e.target.value)}
                  className="border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
              </div>
            </div>
            {itemTerm.trim().length > 0 && itemTerm.trim().length < 2 && (
              <p className="text-xs text-warn">Enter at least 2 characters to search.</p>
            )}
            {(!itemFrom || !itemTo) && itemTerm.trim().length >= 2 && (
              <p className="text-xs text-warn">Select a date range to search.</p>
            )}
          </div>

          {/* Results */}
          {itemSearching && <p className="text-ink-dim text-sm">{t("loading")}</p>}

          {!itemSearching && itemResults.length > 0 && (() => {
            const totalQty    = itemResults.length;
            const totalWt     = itemResults.reduce((s: number, i: any) => s + Number(i.gross_wt || 0), 0);
            const totalNetWt  = itemResults.reduce((s: number, i: any) => s + Number(i.net_wt || 0), 0);
            const totalAmt    = itemResults.reduce((s: number, i: any) => s + Number(i.line_total || 0), 0);
            return (
              <>
                {/* Summary strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Items Found", value: String(totalQty) },
                    { label: "Gross Weight", value: grams(totalWt) },
                    { label: "Net Weight",   value: grams(totalNetWt) },
                    { label: "Total Amount", value: inr(totalAmt) },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
                      <p className="text-xs text-ink-dim">{s.label}</p>
                      <p className="text-lg font-bold mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Results table */}
                <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
                  <div className="px-4 py-2.5 border-b border-line font-semibold text-sm text-ink bg-canvas/50">
                    Results for &ldquo;{itemTerm}&rdquo;
                    <span className="ml-2 text-xs font-normal text-ink-dim">{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-3 py-2">Bill No</th>
                        <th className="text-left px-3 py-2">Customer</th>
                        <th className="text-left px-3 py-2">Description</th>
                        <th className="text-right px-3 py-2">Metal</th>
                        <th className="text-right px-3 py-2">Gross Wt</th>
                        <th className="text-right px-3 py-2">Net Wt</th>
                        <th className="text-right px-4 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemResults.map((item: any, idx: number) => {
                        const sale = item.sales as any;
                        const customer = sale?.customers as any;
                        return (
                          <tr key={idx} className="border-b border-line last:border-0 hover:bg-canvas/50">
                            <td className="px-4 py-2.5 text-ink-dim">{shortDate(sale?.bill_date)}</td>
                            <td className="px-3 py-2.5 font-mono text-info">{sale?.bill_no ?? "—"}</td>
                            <td className="px-3 py-2.5">{customer?.name ?? "—"}</td>
                            <td className="px-3 py-2.5 font-medium">{item.description || "—"}</td>
                            <td className="px-3 py-2.5 text-right text-xs text-ink-dim uppercase">{item.metal || "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs">{Number(item.gross_wt) > 0 ? grams(Number(item.gross_wt)) : "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs">{Number(item.net_wt) > 0 ? grams(Number(item.net_wt)) : "—"}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">{inr(Number(item.line_total || 0))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-canvas/50 border-t border-line font-semibold text-sm">
                        <td colSpan={5} className="px-4 py-2.5">Total</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(totalWt)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(totalNetWt)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">{inr(totalAmt)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            );
          })()}

          {!itemSearching && itemTerm.trim().length >= 2 && itemFrom && itemTo && itemResults.length === 0 && (
            <p className="text-ink-dim text-sm text-center py-10">No items found matching &ldquo;{itemTerm}&rdquo; in this period.</p>
          )}

          {!itemTerm.trim() && (
            <p className="text-ink-dim text-sm text-center py-10">Enter an item name and date range to search across all sales.</p>
          )}
        </div>
      )}

      {/* ── SALES DETAIL TAB ────────────────────────────────────── */}
      {tab === "detail" && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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

      {/* ── KOLUSU P&L TAB ──────────────────────────────────────── */}
      {tab === "kolusu" && (() => {
        const silverKolusu = (kolusuItems as any[]).filter(i =>
          ["silver", "silver_pure"].includes(i.metal)
        );
        const ownStock  = silverKolusu.filter(i => !i.is_suspense);
        const suspense  = silverKolusu.filter(i => !!i.is_suspense);

        // Own stock: cost = gross_wt × (actualTouch/100) × pureRate
        const ownStockCalc = ownStock.map(i => {
          const gw       = Number(i.gross_wt || 0);
          const revenue  = Number(i.line_total || 0);
          const cost     = parseFloat((gw * (kolusuActualTouch / 100) * kolusuPureRate).toFixed(2));
          const margin   = parseFloat((revenue - cost).toFixed(2));
          return { ...i, gw, revenue, cost, margin };
        });

        // Suspense: supplier gets (boardRate - suspenseMargin)/g, shop keeps suspenseMargin/g
        const suspenseCalc = suspense.map(i => {
          const gw            = Number(i.gross_wt || 0);
          const revenue       = Number(i.line_total || 0);
          const supplierCost  = parseFloat((gw * (kolusuBoardRate - kolusuSuspenseMargin)).toFixed(2));
          const margin        = parseFloat((gw * kolusuSuspenseMargin).toFixed(2));
          return { ...i, gw, revenue, supplierCost, margin };
        });

        const ownTotalWt      = ownStockCalc.reduce((s, i) => s + i.gw, 0);
        const ownTotalRev     = ownStockCalc.reduce((s, i) => s + i.revenue, 0);
        const ownTotalCost    = ownStockCalc.reduce((s, i) => s + i.cost, 0);
        const ownTotalMargin  = ownStockCalc.reduce((s, i) => s + i.margin, 0);
        const suspTotalWt     = suspenseCalc.reduce((s, i) => s + i.gw, 0);
        const suspTotalRev    = suspenseCalc.reduce((s, i) => s + i.revenue, 0);
        const suspTotalCost   = suspenseCalc.reduce((s, i) => s + i.supplierCost, 0);
        const suspTotalMargin = suspenseCalc.reduce((s, i) => s + i.margin, 0);
        const grandMargin     = ownTotalMargin + suspTotalMargin;
        const grandRevenue    = ownTotalRev + suspTotalRev;

        const inp2 = "border border-line rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-gold text-right";

        return (
          <div className="space-y-5">
            {loadingKolusu && <p className="text-ink-dim text-sm">Loading…</p>}

            {/* Rate config */}
            <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3">
              <p className="text-xs font-medium text-ink-dim uppercase tracking-wide mb-3">Calculation Rates (editable)</p>
              <div className="flex flex-wrap gap-5 text-sm">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Pure Silver Rate (₹/g)</label>
                  <input type="number" value={kolusuPureRate}
                    onChange={e => setKolusuPureRate(Number(e.target.value))}
                    className={inp2} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Board Rate (₹/g)</label>
                  <input type="number" value={kolusuBoardRate}
                    onChange={e => setKolusuBoardRate(Number(e.target.value))}
                    className={inp2} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Actual Touch (%) — Own Stock</label>
                  <input type="number" value={kolusuActualTouch}
                    onChange={e => setKolusuActualTouch(Number(e.target.value))}
                    className={inp2} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Suspense Margin (₹/g)</label>
                  <input type="number" value={kolusuSuspenseMargin}
                    onChange={e => setKolusuSuspenseMargin(Number(e.target.value))}
                    className={inp2} />
                </div>
              </div>
              <p className="text-xs text-ink-dim mt-2">
                Own stock cost = gross_wt × {kolusuActualTouch}% × ₹{kolusuPureRate} &nbsp;·&nbsp;
                Suspense margin = gross_wt × ₹{kolusuSuspenseMargin}/g &nbsp;·&nbsp;
                Sell at ₹{kolusuBoardRate}/g
              </p>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Revenue",   value: inr(grandRevenue),  color: "text-ink" },
                { label: "Own Stock Margin",value: inr(ownTotalMargin), color: ownTotalMargin >= 0 ? "text-ok" : "text-err" },
                { label: "Suspense Margin", value: inr(suspTotalMargin), color: "text-ok" },
                { label: "Total Margin",    value: inr(grandMargin),    color: grandMargin >= 0 ? "text-ok" : "text-err" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
                  <p className="text-xs text-ink-dim">{s.label}</p>
                  <p className={clsx("text-lg font-bold mt-0.5", s.color)}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Own stock table */}
            {ownStockCalc.length > 0 && (
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line font-semibold text-sm flex justify-between bg-gold/5 text-gold">
                  <span>Own Stock Kolusu <span className="text-xs font-normal text-ink-dim ml-1">{ownStockCalc.length} items</span></span>
                  <span className="text-xs font-normal text-ink-dim">Cost = gross_wt × {kolusuActualTouch}% × ₹{kolusuPureRate}</span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-right px-3 py-2">Gross Wt</th>
                    <th className="text-right px-3 py-2">Revenue</th>
                    <th className="text-right px-3 py-2 text-err">Cost ({kolusuActualTouch}%×₹{kolusuPureRate})</th>
                    <th className="text-right px-4 py-2 text-ok">Margin</th>
                  </tr></thead>
                  <tbody>
                    {ownStockCalc.map((i: any, idx: number) => (
                      <tr key={idx} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 font-medium">{i.description || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(i.gw)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{inr(i.revenue)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-err">{inr(i.cost)}</td>
                        <td className={clsx("px-4 py-2.5 text-right font-mono font-semibold", i.margin >= 0 ? "text-ok" : "text-err")}>{inr(i.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-canvas border-t-2 border-line font-semibold text-sm">
                    <td className="px-4 py-2.5 text-ink-dim">Total ({ownStockCalc.length})</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(ownTotalWt)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(ownTotalRev)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-err">{inr(ownTotalCost)}</td>
                    <td className={clsx("px-4 py-2.5 text-right font-mono font-bold", ownTotalMargin >= 0 ? "text-ok" : "text-err")}>{inr(ownTotalMargin)}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}

            {/* Suspense table */}
            {suspenseCalc.length > 0 && (
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line font-semibold text-sm flex justify-between bg-info/5 text-info">
                  <span>Suspense Kolusu <span className="text-xs font-normal text-ink-dim ml-1">{suspenseCalc.length} items</span></span>
                  <span className="text-xs font-normal text-ink-dim">Margin = gross_wt × ₹{kolusuSuspenseMargin}/g</span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2">Description</th>
                    <th className="text-right px-3 py-2">Gross Wt</th>
                    <th className="text-right px-3 py-2">Revenue (to customer)</th>
                    <th className="text-right px-3 py-2 text-err">Supplier Cost (₹{kolusuBoardRate - kolusuSuspenseMargin}/g)</th>
                    <th className="text-right px-4 py-2 text-ok">Margin (₹{kolusuSuspenseMargin}/g)</th>
                  </tr></thead>
                  <tbody>
                    {suspenseCalc.map((i: any, idx: number) => (
                      <tr key={idx} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 font-medium">{i.description || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(i.gw)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{inr(i.revenue)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-err">{inr(i.supplierCost)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-ok">{inr(i.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-canvas border-t-2 border-line font-semibold text-sm">
                    <td className="px-4 py-2.5 text-ink-dim">Total ({suspenseCalc.length})</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(suspTotalWt)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(suspTotalRev)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-err">{inr(suspTotalCost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-ok">{inr(suspTotalMargin)}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}

            {!loadingKolusu && silverKolusu.length === 0 && (
              <p className="text-ink-dim text-sm text-center py-10">No silver kolusu sales in this period.</p>
            )}

            {/* Margin note */}
            {silverKolusu.length > 0 && (
              <div className="bg-canvas border border-line rounded-xl px-4 py-3 text-xs text-ink-dim space-y-1">
                <p><strong>How margins are calculated:</strong></p>
                <p>• <strong>Own Stock:</strong> Revenue − (gross_wt × {kolusuActualTouch}% × ₹{kolusuPureRate}) — item is sold at ₹{kolusuBoardRate}/g board rate but actual silver content is only {kolusuActualTouch} touch, costing ₹{kolusuPureRate}/g for pure silver.</p>
                <p>• <strong>Suspense:</strong> Supplier settles at board rate − ₹{kolusuSuspenseMargin} = ₹{kolusuBoardRate - kolusuSuspenseMargin}/g. Your margin is ₹{kolusuSuspenseMargin}/g × gross weight.</p>
                <p>• Update the rate fields above if board rate or pure rate has changed for the period.</p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
