"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr, grams } from "@/lib/format";
import Link from "next/link";

// ── Date helpers ──────────────────────────────────────────────────────────────
const isoDate = (d: Date) => d.toISOString().split("T")[0];
const getToday = () => isoDate(new Date());
const monthStart = (offset = 0) => {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth() + offset, 1));
};
const monthKey = (offset = 0) => monthStart(offset).slice(0, 7);
const ymToRange = (ym: string) => {
  const ms = ym + "-01";
  const d = new Date(ms);
  d.setMonth(d.getMonth() + 1);
  return { ms, me: isoDate(d) };
};
const prevYM = (ym: string) => {
  const d = new Date(ym + "-01");
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const ymLabel = (ym: string) =>
  new Date(ym + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" });

// ── Chart colors ──────────────────────────────────────────────────────────────
const C = {
  gold:   "#C8A84B",
  blue:   "#6366F1",
  green:  "#10B981",
  orange: "#F59E0B",
  red:    "#EF4444",
  purple: "#8B5CF6",
  gray:   "#94A3B8",
  pink:   "#EC4899",
};

const PAY_COLOR: Record<string, string> = {
  cash: C.orange, bank: C.blue, upi: C.green,
  old_gold: C.gold, advance: C.purple,
  chit_metal: C.pink, old_silver: C.gray,
};

const METAL_COLOR: Record<string, string> = {
  gold_22k: C.gold, gold_18k: "#D4AF37", gold_24k: "#FFD700",
  silver: C.gray, silver_pure: "#B0BEC5", silver_mpr: "#90A4AE",
};

const METAL_LABEL: Record<string, string> = {
  gold_22k: "Gold 22K", gold_18k: "Gold 18K", gold_24k: "Gold 24K",
  silver: "Silver", silver_pure: "Silver Pure", silver_mpr: "Silver MRP",
};
const ml = (m: string) => METAL_LABEL[m] ?? m;

// ── SVG Donut ─────────────────────────────────────────────────────────────────
function Donut({
  segs, size = 148, sw = 20, label, sub,
}: {
  segs: { value: number; color: string }[];
  size?: number; sw?: number;
  label?: string; sub?: string;
}) {
  const total = segs.reduce((s, d) => s + d.value, 0);
  const r = (size - sw) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  let off = 0;
  const arcs = segs.map((s) => {
    const pct = total > 0 ? s.value / total : 0;
    const dash = pct * circ;
    const arc = { ...s, dash, off };
    off += dash;
    return arc;
  });
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#F1F5F9" strokeWidth={sw} />
        {arcs.map((a, i) => (
          <circle key={i} cx={cx} cy={cx} r={r} fill="none"
            stroke={a.color} strokeWidth={sw}
            strokeDasharray={`${a.dash} ${circ - a.dash}`}
            strokeDashoffset={-a.off} strokeLinecap="butt" />
        ))}
      </svg>
      {label && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-lg font-bold text-ink">{label}</span>
          {sub && <span className="text-[11px] text-ink-dim">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────────
function LineChart({
  data, color = C.blue, h = 170,
}: {
  data: { label: string; value: number }[];
  color?: string; h?: number;
}) {
  if (data.length < 2) return <div className="flex items-center justify-center h-32 text-ink-dim text-sm">Not enough data</div>;
  const W = 480;
  const pad = { t: 12, b: 28, l: 8, r: 8 };
  const iW = W - pad.l - pad.r;
  const iH = h - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * iW,
    y: pad.t + iH - (d.value / max) * iH,
  }));
  const path = pts.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    const pr = arr[i - 1];
    const c1x = (pr.x + (p.x - pr.x) * 0.4).toFixed(1);
    const c2x = (p.x - (p.x - pr.x) * 0.4).toFixed(1);
    return `${acc} C ${c1x} ${pr.y.toFixed(1)}, ${c2x} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }, "");
  const base = pad.t + iH;
  const area = `${path} L ${pts[pts.length - 1].x.toFixed(1)} ${base} L ${pts[0].x.toFixed(1)} ${base} Z`;
  const gid = `g${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" style={{ height: h }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={pts[i].x} y={h - 4} textAnchor="middle" fontSize="11" fill="#94A3B8">{d.label}</text>
      ))}
    </svg>
  );
}

// ── Horizontal bar ─────────────────────────────────────────────────────────────
function HBar({ label, value, max, color, fmt }: { label: string; value: number; max: number; color: string; fmt?: (v: number) => string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const display = fmt ? fmt(value) : inr(value);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-ink truncate max-w-[60%]">{label}</span>
        <span className="text-ink-dim shrink-0">{display}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, up, icon, ibg = "#EEF2FF" }: {
  label: string; value: string; sub?: string;
  trend?: string; up?: boolean; icon: string; ibg?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-line shadow-soft p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">{label}</p>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: ibg }}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-ink leading-tight">{value}</p>
      <div className="flex items-center gap-2 text-xs min-h-[16px]">
        {trend && (
          <span className={up === undefined ? "text-ink-dim" : up ? "text-ok font-medium" : "text-err font-medium"}>
            {up === true ? "▲" : up === false ? "▼" : ""} {trend}
          </span>
        )}
        {sub && <span className="text-ink-dim">{sub}</span>}
      </div>
    </div>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────────
function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-line shadow-soft p-5 flex flex-col gap-4">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Queries ───────────────────────────────────────────────────────────────────
function useTodayStats() {
  return useQuery({
    queryKey: ["adash-today", getToday()],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const t = getToday();
      const [salesRes, itemsRes] = await Promise.all([
        supabase().from("sales").select("id").eq("bill_date", t).eq("status", "confirmed"),
        supabase().from("sale_items")
          .select("line_total, making_amt, stone_amt, diamond_amt, sales!inner(bill_date, status)")
          .eq("sales.bill_date", t).eq("sales.status", "confirmed"),
      ]);
      const items = (itemsRes.data ?? []) as any[];
      const revenue = items.reduce((s, i) => s + (i.line_total ?? 0), 0);
      const va = items.reduce((s, i) => s + (i.making_amt ?? 0) + (i.stone_amt ?? 0) + (i.diamond_amt ?? 0), 0);
      return { bills: salesRes.data?.length ?? 0, revenue, va };
    },
  });
}

function useMonthStats(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-month", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [salesRes, itemsRes] = await Promise.all([
        supabase().from("sales").select("id").gte("bill_date", ms).lt("bill_date", me).eq("status", "confirmed"),
        supabase().from("sale_items")
          .select("line_total, gst_pct, net_wt, metal, sales!inner(bill_date, status)")
          .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed"),
      ]);
      const items = (itemsRes.data ?? []) as any[];
      const revenue = items.reduce((s, i) => s + (i.line_total ?? 0), 0);
      const gst = items.reduce((s, i) => (i.gst_pct > 0 ? s + i.line_total * 3 / 103 : s), 0);
      const goldWt = items.filter((i) => i.metal?.startsWith("gold")).reduce((s, i) => s + (i.net_wt ?? 0), 0);
      const silverWt = items.filter((i) => i.metal?.startsWith("silver")).reduce((s, i) => s + (i.net_wt ?? 0), 0);
      return { bills: salesRes.data?.length ?? 0, revenue, gst, goldWt, silverWt };
    },
  });
}

function useRevenueTrend() {
  return useQuery({
    queryKey: ["adash-trend", monthKey()],
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      const from = monthStart(-7);
      const { data } = await supabase().from("sales").select("bill_date, bill_total")
        .gte("bill_date", from).eq("status", "confirmed");
      const map = new Map<string, number>();
      for (let i = -7; i <= 0; i++) {
        const d = new Date();
        const key = isoDate(new Date(d.getFullYear(), d.getMonth() + i, 1)).slice(0, 7);
        map.set(key, 0);
      }
      for (const s of data ?? []) {
        const key = (s.bill_date as string).slice(0, 7);
        if (map.has(key)) map.set(key, (map.get(key) ?? 0) + ((s.bill_total as number) ?? 0));
      }
      return Array.from(map.entries()).map(([key, value]) => ({
        label: new Date(key + "-01").toLocaleString("en-IN", { month: "short" }),
        value,
      }));
    },
  });
}

function usePaymentMix(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-paymix", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sale_payments")
        .select("mode, amount, sales!inner(bill_date, status)")
        .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed");
      const map: Record<string, number> = {};
      for (const p of (data ?? []) as any[]) {
        const m = p.mode ?? "other";
        map[m] = (map[m] ?? 0) + (p.amount ?? 0);
      }
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    },
  });
}

function useRecentSales() {
  return useQuery({
    queryKey: ["adash-recent"],
    staleTime: 1 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sales")
        .select("id, bill_no, bill_date, bill_total, customers(name)")
        .eq("status", "confirmed").order("bill_date", { ascending: false }).limit(8);
      return (data ?? []) as any[];
    },
  });
}

function useSalesByMetal(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-metal", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sale_items")
        .select("metal, gross_wt, net_wt, line_total, sales!inner(bill_date, status)")
        .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed");
      const map: Record<string, { grossWt: number; netWt: number; revenue: number; count: number }> = {};
      for (const item of (data ?? []) as any[]) {
        const m = item.metal ?? "other";
        if (!map[m]) map[m] = { grossWt: 0, netWt: 0, revenue: 0, count: 0 };
        map[m].grossWt += item.gross_wt ?? 0;
        map[m].netWt += item.net_wt ?? 0;
        map[m].revenue += item.line_total ?? 0;
        map[m].count++;
      }
      return map;
    },
  });
}

function useDailySales(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-daily", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sales").select("bill_date, bill_total")
        .gte("bill_date", ms).lt("bill_date", me).eq("status", "confirmed").order("bill_date");
      const map = new Map<string, number>();
      for (const s of (data ?? []) as any[]) {
        map.set(s.bill_date, (map.get(s.bill_date) ?? 0) + (s.bill_total ?? 0));
      }
      return Array.from(map.entries()).map(([date, value]) => ({
        label: String(new Date(date + "T00:00:00").getDate()),
        value,
      }));
    },
  });
}

function useTopCustomers(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-top-cust", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sales").select("bill_total, customers(name)")
        .gte("bill_date", ms).lt("bill_date", me).eq("status", "confirmed");
      const map = new Map<string, number>();
      for (const s of (data ?? []) as any[]) {
        const name = s.customers?.name ?? "Walk-in";
        map.set(name, (map.get(name) ?? 0) + (s.bill_total ?? 0));
      }
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, amount]) => ({ name, amount }));
    },
  });
}

function useTopProducts(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-products", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sale_items")
        .select("description, gross_wt, net_wt, metal, line_total, is_suspense, sales!inner(id, order_id, bill_date, status)")
        .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed");
      const map = new Map<string, { wt: number; count: number; revenue: number; metal: string }>();
      for (const item of (data ?? []) as any[]) {
        const key = item.description ?? "—";
        const ex = map.get(key) ?? { wt: 0, count: 0, revenue: 0, metal: item.metal };
        map.set(key, { wt: ex.wt + (item.net_wt ?? 0), count: ex.count + 1, revenue: ex.revenue + (item.line_total ?? 0), metal: ex.metal });
      }
      return Array.from(map.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 12)
        .map(([description, stats]) => ({ description, ...stats }));
    },
  });
}

function useSourceBreakdown(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-source", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("sale_items")
        .select("metal, gross_wt, net_wt, line_total, is_suspense, sales!inner(id, order_id, bill_date, status)")
        .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed");
      const items = (data ?? []) as any[];
      const zero = () => ({ count: 0, grossWt: 0, netWt: 0, revenue: 0 });
      const add = (acc: ReturnType<typeof zero>, i: any) => ({
        count:   acc.count + 1,
        grossWt: acc.grossWt + (i.gross_wt ?? 0),
        netWt:   acc.netWt   + (i.net_wt   ?? 0),
        revenue: acc.revenue  + (i.line_total ?? 0),
      });
      const result = {
        gold:   { ready: zero(), order: zero(), suspense: zero() },
        silver: { ready: zero(), order: zero(), suspense: zero() },
        all:    { ready: zero(), order: zero(), suspense: zero() },
      };
      for (const i of items) {
        const isGold   = (i.metal as string)?.startsWith("gold");
        const isSilver = (i.metal as string)?.startsWith("silver");
        const bucket   = i.is_suspense ? "suspense" : i.sales?.order_id ? "order" : "ready";
        result.all[bucket] = add(result.all[bucket], i);
        if (isGold)   result.gold[bucket]   = add(result.gold[bucket], i);
        if (isSilver) result.silver[bucket] = add(result.silver[bucket], i);
      }
      return result;
    },
  });
}

function useMonthExpenses(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-exp", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase().from("expenses").select("amount, expense_categories(name)")
        .gte("exp_date", ms).lt("exp_date", me);
      const total = (data ?? []).reduce((s, e: any) => s + (e.amount ?? 0), 0);
      const bycat = new Map<string, number>();
      for (const e of (data ?? []) as any[]) {
        const cat = (e.expense_categories as any)?.name ?? "Uncategorised";
        bycat.set(cat, (bycat.get(cat) ?? 0) + (e.amount ?? 0));
      }
      return {
        total,
        categories: Array.from(bycat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([cat, amount]) => ({ cat, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 })),
      };
    },
  });
}

// Full purchase-vs-sales profit analysis for selected month
function useProfitAnalysis(ym = monthKey()) {
  const { ms, me } = ymToRange(ym);
  return useQuery({
    queryKey: ["adash-profit", ym],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [purchRes, payRes, itemsRes, expRes] = await Promise.all([
        supabase().from("supplier_purchases")
          .select("metal, gross_wt, purity_pct")
          .gte("purchase_date", ms).lt("purchase_date", me),
        supabase().from("supplier_payments")
          .select("mode, amount, metal_wt")
          .gte("pay_date", ms).lt("pay_date", me),
        supabase().from("sale_items")
          .select("metal, gross_wt, net_wt, line_total, gst_pct, sales!inner(bill_date, status)")
          .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed"),
        supabase().from("expenses").select("amount")
          .gte("exp_date", ms).lt("exp_date", me),
      ]);

      const purchases = (purchRes.data ?? []) as any[];
      const payments  = (payRes.data  ?? []) as any[];
      const items     = (itemsRes.data ?? []) as any[];
      const expenses  = (expRes.data  ?? []) as any[];

      // Metal purchased from suppliers
      const gPurch = purchases.filter(p => (p.metal as string)?.startsWith("gold"));
      const sPurch = purchases.filter(p => (p.metal as string)?.startsWith("silver"));
      const goldBoughtGross   = gPurch.reduce((s, p) => s + (p.gross_wt ?? 0), 0);
      const goldBoughtPure    = gPurch.reduce((s, p) => s + (p.gross_wt ?? 0) * ((p.purity_pct ?? 91.6) / 100), 0);
      const silverBoughtGross = sPurch.reduce((s, p) => s + (p.gross_wt ?? 0), 0);
      const silverBoughtPure  = sPurch.reduce((s, p) => s + (p.gross_wt ?? 0) * ((p.purity_pct ?? 92.5) / 100), 0);

      // Supplier payments this month
      const bankPay = payments.filter(p => p.mode === "bank" || p.mode === "upi");
      const cutPay  = payments.filter(p => p.mode === "cut_rate");
      const bankAmt  = bankPay.reduce((s, p) => s + (p.amount ?? 0), 0);
      const cutAmt   = cutPay.reduce((s, p) => s + (p.amount ?? 0), 0);
      const cutWt    = cutPay.reduce((s, p) => s + (p.metal_wt ?? 0), 0);
      const totalCost = bankAmt + cutAmt;

      // Sales this month
      const gSold = items.filter(i => (i.metal as string)?.startsWith("gold"));
      const sSold = items.filter(i => (i.metal as string)?.startsWith("silver"));
      const goldSoldGross   = gSold.reduce((s, i) => s + (i.gross_wt ?? 0), 0);
      const goldSoldNet     = gSold.reduce((s, i) => s + (i.net_wt   ?? 0), 0);
      const silverSoldGross = sSold.reduce((s, i) => s + (i.gross_wt ?? 0), 0);
      const silverSoldNet   = sSold.reduce((s, i) => s + (i.net_wt   ?? 0), 0);

      // Revenue
      const totalRevenue   = items.reduce((s, i) => s + (i.line_total ?? 0), 0);
      const totalGST       = items.reduce((s, i) => i.gst_pct > 0 ? s + i.line_total * 3 / 103 : s, 0);
      const revenueExclGST = totalRevenue - totalGST;

      // Profit
      const totalExpenses = expenses.reduce((s, e: any) => s + (e.amount ?? 0), 0);
      const grossProfit   = revenueExclGST - totalCost;
      const netProfit     = grossProfit - totalExpenses;
      const gpPct = revenueExclGST > 0 ? (grossProfit / revenueExclGST) * 100 : 0;
      const npPct = revenueExclGST > 0 ? (netProfit  / revenueExclGST) * 100 : 0;

      return {
        goldBoughtGross, goldBoughtPure, silverBoughtGross, silverBoughtPure,
        goldSoldGross, goldSoldNet, silverSoldGross, silverSoldNet,
        bankAmt, cutAmt, cutWt, totalCost,
        revenueExclGST, totalGST, totalRevenue,
        grossProfit, netProfit, totalExpenses, gpPct, npPct,
      };
    },
  });
}

// 8-month supplier payment trend: bank transfers + cut-rate (old gold dispatched)
function useSupplierPaymentsTrend() {
  return useQuery({
    queryKey: ["adash-sup-pay", monthKey(-7)],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const from = monthStart(-7);
      const { data } = await supabase().from("supplier_payments")
        .select("pay_date, mode, amount, metal_wt")
        .gte("pay_date", from)
        .order("pay_date");
      const map = new Map<string, { bank: number; cutRate: number; cutRateWt: number }>();
      for (let i = -7; i <= 0; i++) {
        const k = monthStart(i).slice(0, 7);
        map.set(k, { bank: 0, cutRate: 0, cutRateWt: 0 });
      }
      for (const p of (data ?? []) as any[]) {
        const k = (p.pay_date as string).slice(0, 7);
        if (!map.has(k)) continue;
        const row = map.get(k)!;
        if (p.mode === "bank" || p.mode === "upi") {
          row.bank += p.amount ?? 0;
        } else if (p.mode === "cut_rate") {
          row.cutRate  += p.amount    ?? 0;
          row.cutRateWt += p.metal_wt ?? 0;
        }
      }
      return Array.from(map.entries()).map(([key, v]) => ({
        label: new Date(key + "-01").toLocaleString("en-IN", { month: "short" }),
        ...v,
      }));
    },
  });
}

// 8-month weighted-average rate per metal (gold 22K + silver)
function useAvgMetalRates() {
  return useQuery({
    queryKey: ["adash-rates", monthKey(-7)],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const from = monthStart(-7);
      const { data } = await supabase().from("sale_items")
        .select("metal, rate, gross_wt, sales!inner(bill_date, status)")
        .gte("sales.bill_date", from)
        .eq("sales.status", "confirmed")
        .in("metal", ["gold_22k", "gold_18k", "silver", "silver_pure"]);
      // Accumulate per month per metal: sum(rate*gross_wt) and sum(gross_wt)
      type Acc = { rateWt: number; wt: number };
      const map = new Map<string, { gold_22k: Acc; gold_18k: Acc; silver: Acc }>();
      for (let i = -7; i <= 0; i++) {
        const k = monthStart(i).slice(0, 7);
        map.set(k, {
          gold_22k: { rateWt: 0, wt: 0 },
          gold_18k: { rateWt: 0, wt: 0 },
          silver:   { rateWt: 0, wt: 0 },
        });
      }
      for (const item of (data ?? []) as any[]) {
        const k = (item.sales?.bill_date as string)?.slice(0, 7);
        if (!map.has(k)) continue;
        const row = map.get(k)!;
        const wt = item.gross_wt ?? 0;
        const rv = (item.rate ?? 0) * wt;
        if (item.metal === "gold_22k") { row.gold_22k.rateWt += rv; row.gold_22k.wt += wt; }
        else if (item.metal === "gold_18k") { row.gold_18k.rateWt += rv; row.gold_18k.wt += wt; }
        else if (item.metal === "silver" || item.metal === "silver_pure") { row.silver.rateWt += rv; row.silver.wt += wt; }
      }
      const avg = (a: Acc) => a.wt > 0 ? Math.round(a.rateWt / a.wt) : null;
      return Array.from(map.entries()).map(([key, v]) => ({
        label: new Date(key + "-01").toLocaleString("en-IN", { month: "short" }),
        gold22k: avg(v.gold_22k),
        gold18k: avg(v.gold_18k),
        silver:  avg(v.silver),
      }));
    },
  });
}

function useTodayTopSales() {
  return useQuery({
    queryKey: ["adash-today-top", getToday()],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const t = getToday();
      const { data } = await supabase().from("sales")
        .select("id, bill_no, bill_total, customers(name), sale_items(metal, net_wt)")
        .eq("bill_date", t).eq("status", "confirmed")
        .order("bill_total", { ascending: false }).limit(5);
      return (data ?? []) as any[];
    },
  });
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────
function OverviewTab({ selYM }: { selYM: string }) {
  const { data: tod }   = useTodayStats();
  const { data: mon }   = useMonthStats(selYM);
  const { data: last }  = useMonthStats(prevYM(selYM));
  const { data: trend } = useRevenueTrend();
  const { data: pmix }  = usePaymentMix(selYM);
  const { data: recent} = useRecentSales();

  const vsLast = mon && last && last.revenue > 0
    ? Math.round(((mon.revenue - last.revenue) / last.revenue) * 100) : null;
  const targetPct = last?.revenue && mon
    ? Math.min(Math.round((mon.revenue / last.revenue) * 100), 100) : 0;
  const payTotal = (pmix ?? []).reduce((s, [, v]) => s + v, 0);
  const paySegs  = (pmix ?? []).map(([m, v]) => ({ value: v, color: PAY_COLOR[m] ?? C.gray }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Today's Bills"   value={String(tod?.bills ?? 0)}  sub="confirmed sales"     icon="🧾" ibg="#FFF7ED" />
        <KpiCard label="Today's Revenue" value={inr(tod?.revenue ?? 0)}    sub="incl. metal"         icon="💰" ibg="#F0FDF4" />
        <KpiCard label="Month Revenue"   value={inr(mon?.revenue ?? 0)}
          trend={vsLast !== null ? `${vsLast > 0 ? "+" : ""}${vsLast}% vs last month` : undefined}
          up={vsLast !== null ? vsLast > 0 : undefined} icon="📈" ibg="#EFF6FF" />
        <KpiCard label="Month Bills"     value={String(mon?.bills ?? 0)}
          sub={`Gold ${grams(mon?.goldWt ?? 0)} · Silver ${grams(mon?.silverWt ?? 0)}`} icon="📦" ibg="#F5F3FF" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card title="Revenue Growth Trend">
            <p className="text-xs text-ink-dim -mt-2">8-month rolling revenue</p>
            <LineChart data={trend ?? []} color={C.blue} h={170} />
          </Card>
        </div>
        <Card title="vs Last Month">
          <div className="flex flex-col items-center gap-4 py-1">
            <Donut
              segs={[
                { value: targetPct,          color: C.blue },
                { value: Math.max(0, 100 - targetPct), color: "#E2E8F0" },
              ]}
              label={`${targetPct}%`} sub="achieved"
              size={148} sw={20}
            />
            <div className="w-full space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-dim">This month</span>
                <span className="font-medium text-ink">{inr(mon?.revenue ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-dim">Last month</span>
                <span className="font-medium text-ink">{inr(last?.revenue ?? 0)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-line font-medium">
                <span className="text-ink-dim">Remaining</span>
                <span className="text-ink">{inr(Math.max(0, (last?.revenue ?? 0) - (mon?.revenue ?? 0)))}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Card title="Recent Transactions" action={<Link href="/sales" className="text-xs text-gold hover:underline">View All</Link>}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-dim border-b border-line">
                  <th className="pb-2 font-medium">Bill No</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(recent ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 font-mono text-xs text-gold">{s.bill_no}</td>
                    <td className="py-2.5 text-ink">{s.customers?.name ?? "Walk-in"}</td>
                    <td className="py-2.5 text-right font-medium text-ink">{inr(s.bill_total)}</td>
                    <td className="py-2.5 text-ink-dim text-xs hidden sm:table-cell">{s.bill_date}</td>
                  </tr>
                ))}
                {!recent?.length && <tr><td colSpan={4} className="py-8 text-center text-ink-dim">No sales yet</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
        <Card title="Payment Methods">
          <div className="flex flex-col items-center gap-4">
            <Donut
              segs={paySegs.length ? paySegs : [{ value: 1, color: "#E2E8F0" }]}
              label={payTotal > 0 ? inr(payTotal) : "—"} sub="this month"
              size={148} sw={20}
            />
            <div className="w-full space-y-2">
              {(pmix ?? []).slice(0, 5).map(([mode, amt]) => (
                <div key={mode} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PAY_COLOR[mode] ?? C.gray }} />
                    <span className="text-ink capitalize">{mode.replace(/_/g, " ")}</span>
                  </div>
                  <span className="text-ink-dim text-xs">{payTotal > 0 ? Math.round((amt / payTotal) * 100) : 0}%</span>
                </div>
              ))}
              {!pmix?.length && <p className="text-xs text-ink-dim text-center">No data this month</p>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Sales Analysis ───────────────────────────────────────────────────────
const EXP_COLORS_SALES = [C.red, C.orange, C.purple, C.blue, C.green, C.gray];

function SalesTab({ selYM }: { selYM: string }) {
  const { data: byMetal } = useSalesByMetal(selYM);
  const { data: daily }   = useDailySales(selYM);
  const { data: topCust } = useTopCustomers(selYM);
  const { data: exp }     = useMonthExpenses(selYM);

  const metals   = Object.entries(byMetal ?? {}).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRev = metals.reduce((s, [, v]) => s + v.revenue, 0);
  const maxCust  = Math.max(...(topCust ?? []).map((c) => c.amount), 1);
  const monthLabel = ymLabel(selYM);

  return (
    <div className="space-y-5">
      {/* Sales by metal */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {metals.slice(0, 6).map(([metal, s]) => (
          <div key={metal} className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: METAL_COLOR[metal] ?? C.gray }} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">{ml(metal)}</span>
            </div>
            <p className="text-xl font-bold text-ink">{inr(s.revenue)}</p>
            <p className="text-xs text-ink-dim">{grams(s.netWt)} net wt · {s.count} items</p>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${totalRev > 0 ? (s.revenue / totalRev) * 100 : 0}%`, background: METAL_COLOR[metal] ?? C.gray }} />
            </div>
          </div>
        ))}
        {!metals.length && (
          <div className="col-span-3 py-10 text-center text-ink-dim text-sm">No sales this month</div>
        )}
      </div>

      {/* Daily sales + top customers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={`Daily Sales — ${monthLabel}`}>
          {(daily ?? []).length >= 2
            ? <LineChart data={daily!} color={C.green} h={160} />
            : <p className="text-ink-dim text-sm text-center py-8">Not enough data yet</p>}
        </Card>
        <Card title={`Top Customers — ${monthLabel}`}>
          <div className="space-y-3">
            {(topCust ?? []).map((c, i) => (
              <HBar key={i} label={c.name} value={c.amount} max={maxCust}
                color={i === 0 ? C.gold : i < 3 ? C.blue : C.gray} />
            ))}
            {!topCust?.length && <p className="text-ink-dim text-sm text-center py-4">No data</p>}
          </div>
        </Card>
      </div>

      {/* Expenses */}
      <Card title={`Expenses — ${monthLabel}`}>
        {(exp?.categories ?? []).length > 0 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-3 border-b border-line">
              {exp!.categories.map((c, i) => (
                <div key={c.cat} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink truncate">{c.cat}</span>
                    <span className="text-ink-dim shrink-0 ml-1 text-xs">{c.pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: EXP_COLORS_SALES[i] ?? C.gray }} />
                  </div>
                  <p className="text-xs font-medium text-ink-dim">{inr(c.amount)}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-ink">Total Expenses</span>
              <span className="text-err">{inr(exp?.total ?? 0)}</span>
            </div>
            {totalRev > 0 && (
              <p className="text-xs text-ink-dim">
                Expenses are {((exp!.total / totalRev) * 100).toFixed(1)}% of sales revenue this month
              </p>
            )}
          </div>
        ) : (
          <p className="text-ink-dim text-sm text-center py-6">No expenses recorded this month</p>
        )}
      </Card>
    </div>
  );
}

// ── Tab: Inventory ────────────────────────────────────────────────────────────
function InventoryTab({ selYM }: { selYM: string }) {
  const { data: src }  = useSourceBreakdown(selYM);
  const { data: prod } = useTopProducts(selYM);

  const srcTotal = (src?.all.ready.revenue ?? 0) + (src?.all.order.revenue ?? 0) + (src?.all.suspense.revenue ?? 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Ready Stock Sales" value={inr(src?.all.ready.revenue ?? 0)}
          sub={`${src?.all.ready.count ?? 0} items · ${grams(src?.all.ready.netWt ?? 0)}`} icon="🏪" ibg="#F0FDF4" />
        <KpiCard label="Order Deliveries"  value={inr(src?.all.order.revenue ?? 0)}
          sub={`${src?.all.order.count ?? 0} items · ${grams(src?.all.order.netWt ?? 0)}`} icon="📦" ibg="#EFF6FF" />
        <KpiCard label="From Suspense"     value={inr(src?.all.suspense.revenue ?? 0)}
          sub={`${src?.all.suspense.count ?? 0} items · ${grams(src?.all.suspense.netWt ?? 0)}`} icon="🔄" ibg="#FFF7ED" />
        <KpiCard label="Total Month Sales" value={inr(srcTotal)} sub="all sources" icon="💹" ibg="#F5F3FF" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Gold source mix */}
        <Card title="Gold — Source Mix">
          <div className="flex flex-col items-center gap-4">
            <Donut
              segs={[
                { value: src?.gold.ready.netWt    ?? 0, color: C.green  },
                { value: src?.gold.order.netWt    ?? 0, color: C.blue   },
                { value: src?.gold.suspense.netWt ?? 0, color: C.orange },
              ]}
              label={grams((src?.gold.ready.netWt ?? 0) + (src?.gold.order.netWt ?? 0) + (src?.gold.suspense.netWt ?? 0))}
              sub="net wt sold" size={132} sw={18}
            />
            <div className="w-full space-y-2 text-sm">
              {([
                { label: "Ready Stock",    color: C.green,  v: src?.gold.ready },
                { label: "Order Delivery", color: C.blue,   v: src?.gold.order },
                { label: "From Suspense",  color: C.orange, v: src?.gold.suspense },
              ] as const).map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: row.color }} />
                      <span className="text-ink-dim text-xs">{row.label}</span>
                    </div>
                    <span className="font-medium text-ink text-xs">{grams(row.v?.netWt ?? 0)}</span>
                  </div>
                  <div className="text-[11px] text-ink-dim text-right">{inr(row.v?.revenue ?? 0)} · {row.v?.count ?? 0} items</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Silver source mix */}
        <Card title="Silver — Source Mix">
          <div className="flex flex-col items-center gap-4">
            <Donut
              segs={[
                { value: src?.silver.ready.netWt    ?? 0, color: C.green  },
                { value: src?.silver.order.netWt    ?? 0, color: C.blue   },
                { value: src?.silver.suspense.netWt ?? 0, color: C.orange },
              ]}
              label={grams((src?.silver.ready.netWt ?? 0) + (src?.silver.order.netWt ?? 0) + (src?.silver.suspense.netWt ?? 0))}
              sub="net wt sold" size={132} sw={18}
            />
            <div className="w-full space-y-2 text-sm">
              {([
                { label: "Ready Stock",    color: C.green,  v: src?.silver.ready },
                { label: "Order Delivery", color: C.blue,   v: src?.silver.order },
                { label: "From Suspense",  color: C.orange, v: src?.silver.suspense },
              ] as const).map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: row.color }} />
                      <span className="text-ink-dim text-xs">{row.label}</span>
                    </div>
                    <span className="font-medium text-ink text-xs">{grams(row.v?.netWt ?? 0)}</span>
                  </div>
                  <div className="text-[11px] text-ink-dim text-right">{inr(row.v?.revenue ?? 0)} · {row.v?.count ?? 0} items</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <div className="md:col-span-2">
          <Card title="Top Products This Month" action={<Link href="/reports" className="text-xs text-gold hover:underline">Full Report</Link>}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-dim border-b border-line">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Metal</th>
                  <th className="pb-2 font-medium text-right">Items</th>
                  <th className="pb-2 font-medium text-right">Net Wt</th>
                  <th className="pb-2 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(prod ?? []).map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2 text-ink-dim text-xs">{i + 1}</td>
                    <td className="py-2 text-ink font-medium text-sm">{p.description}</td>
                    <td className="py-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: (METAL_COLOR[p.metal] ?? C.gray) + "22", color: METAL_COLOR[p.metal] ?? C.gray }}>
                        {ml(p.metal)}
                      </span>
                    </td>
                    <td className="py-2 text-right text-ink-dim">{p.count}</td>
                    <td className="py-2 text-right text-ink-dim">{grams(p.wt)}</td>
                    <td className="py-2 text-right font-semibold text-ink">{inr(p.revenue)}</td>
                  </tr>
                ))}
                {!prod?.length && <tr><td colSpan={6} className="py-8 text-center text-ink-dim">No sales this month</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Deep Analytics ───────────────────────────────────────────────────────
const EXP_COLORS = [C.blue, C.green, C.orange, C.red, C.purple, C.gray];

function DeepTab({ selYM }: { selYM: string }) {
  const { data: mon }     = useMonthStats(selYM);
  const { data: exp }     = useMonthExpenses(selYM);
  const { data: topSale } = useTodayTopSales();
  const { data: supPay }  = useSupplierPaymentsTrend();
  const { data: rates }   = useAvgMetalRates();
  const { data: pa }      = useProfitAnalysis(selYM);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Month Revenue"   value={inr(mon?.revenue ?? 0)} sub="confirmed sales" icon="💹" ibg="#EFF6FF" />
        <KpiCard label="GST Collected"   value={inr(mon?.gst ?? 0)}     sub="3% on taxable items" icon="🏛️" ibg="#F0FDF4" />
        <KpiCard label="Month Expenses"  value={inr(exp?.total ?? 0)}   sub="all categories" icon="📋" ibg="#FFF7ED" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Top 5 Sales Today">
          {(topSale ?? []).length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-dim border-b border-line">
                  <th className="pb-2 font-medium">Invoice</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium text-right">Weight</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topSale!.map((s) => {
                  const items: any[] = s.sale_items ?? [];
                  const wt = items.reduce((a: number, i: any) => a + (i.net_wt ?? 0), 0);
                  const metals = [...new Set(items.map((i: any) => ml(i.metal)))].join(", ");
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-xs text-gold">{s.bill_no}</td>
                      <td className="py-2.5">
                        <div className="text-ink">{s.customers?.name ?? "Walk-in"}</div>
                        {metals && <div className="text-[11px] text-ink-dim">{metals}</div>}
                      </td>
                      <td className="py-2.5 text-right text-ink-dim text-xs">{grams(wt)}</td>
                      <td className="py-2.5 text-right font-semibold text-ink">{inr(s.bill_total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-ink-dim text-sm text-center py-10">No sales today</p>
          )}
        </Card>

        <Card title="Expense Breakdown — This Month">
          {(exp?.categories ?? []).length > 0 ? (
            <div className="space-y-3">
              {exp!.categories.map((c, i) => (
                <div key={c.cat} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink">{c.cat}</span>
                    <span className="text-ink-dim">{inr(c.amount)} <span className="text-[11px]">({c.pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.pct}%`, background: EXP_COLORS[i] ?? C.gray }} />
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-2 border-t border-line font-semibold">
                <span className="text-ink">Total Expenses</span>
                <span className="text-ink">{inr(exp?.total ?? 0)}</span>
              </div>
            </div>
          ) : (
            <p className="text-ink-dim text-sm text-center py-10">No expenses this month</p>
          )}
        </Card>
      </div>

      <Card title="Metal Performance — This Month">
        <div className="grid grid-cols-3 gap-x-8 gap-y-3">
          {[
            { label: "Gold Gross Wt",     value: grams(mon?.goldWt ?? 0) },
            { label: "Silver Gross Wt",   value: grams(mon?.silverWt ?? 0) },
            { label: "GST %",             value: mon?.revenue ? `${((mon.gst / mon.revenue) * 100).toFixed(1)}%` : "—" },
            { label: "Month Bills",       value: String(mon?.bills ?? 0) },
            { label: "Avg Bill Value",    value: mon?.bills ? inr(mon.revenue / mon.bills) : "—" },
            { label: "Revenue excl. GST", value: inr((mon?.revenue ?? 0) - (mon?.gst ?? 0)) },
          ].map((r) => (
            <div key={r.label} className="border-b border-line pb-3">
              <p className="text-[11px] text-ink-dim uppercase tracking-wide">{r.label}</p>
              <p className="font-semibold text-ink mt-0.5">{r.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Supplier payments trend */}
      <Card title="Supplier Payments — Monthly (8 months)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-dim border-b border-line">
                <th className="pb-2 font-medium">Month</th>
                <th className="pb-2 font-medium text-right">Bank / UPI Transfer</th>
                <th className="pb-2 font-medium text-right">Old Gold (Cut Rate ₹)</th>
                <th className="pb-2 font-medium text-right">Old Gold Wt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(supPay ?? []).map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2.5 font-medium text-ink">{row.label}</td>
                  <td className="py-2.5 text-right text-ink">{row.bank > 0 ? inr(row.bank) : <span className="text-ink-dim">—</span>}</td>
                  <td className="py-2.5 text-right" style={{ color: row.cutRate > 0 ? C.gold : undefined }}>
                    {row.cutRate > 0 ? inr(row.cutRate) : <span className="text-ink-dim">—</span>}
                  </td>
                  <td className="py-2.5 text-right text-ink-dim">
                    {row.cutRateWt > 0 ? grams(row.cutRateWt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line">
              <tr>
                <td className="pt-2.5 font-semibold text-ink text-xs uppercase tracking-wide">Total</td>
                <td className="pt-2.5 text-right font-semibold text-ink">
                  {inr((supPay ?? []).reduce((s, r) => s + r.bank, 0))}
                </td>
                <td className="pt-2.5 text-right font-semibold" style={{ color: C.gold }}>
                  {inr((supPay ?? []).reduce((s, r) => s + r.cutRate, 0))}
                </td>
                <td className="pt-2.5 text-right font-semibold text-ink">
                  {grams((supPay ?? []).reduce((s, r) => s + r.cutRateWt, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Average metal rates trend */}
      <Card title="Avg Sale Rate per Gram — Monthly (weighted)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-dim border-b border-line">
                <th className="pb-2 font-medium">Month</th>
                <th className="pb-2 font-medium text-right" style={{ color: C.gold }}>Gold 22K (₹/g)</th>
                <th className="pb-2 font-medium text-right" style={{ color: "#D4AF37" }}>Gold 18K (₹/g)</th>
                <th className="pb-2 font-medium text-right" style={{ color: C.gray }}>Silver (₹/g)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(rates ?? []).map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2.5 font-medium text-ink">{row.label}</td>
                  <td className="py-2.5 text-right font-mono">
                    {row.gold22k != null ? <span style={{ color: C.gold }}>{row.gold22k.toLocaleString("en-IN")}</span> : <span className="text-ink-dim">—</span>}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {row.gold18k != null ? <span style={{ color: "#D4AF37" }}>{row.gold18k.toLocaleString("en-IN")}</span> : <span className="text-ink-dim">—</span>}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {row.silver != null ? <span style={{ color: C.gray }}>{row.silver.toLocaleString("en-IN")}</span> : <span className="text-ink-dim">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-dim">Weighted average: Σ(rate × gross wt) ÷ Σ(gross wt) per month from confirmed sales.</p>
      </Card>

      {/* Purchase vs Sales — GP / NP */}
      <Card title="Purchase vs Sales — Profit Analysis (This Month)">
        {/* Metal weight comparison */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-dim border-b border-line">
                <th className="pb-2 font-medium">Metal</th>
                <th className="pb-2 font-medium text-right">Bought Gross</th>
                <th className="pb-2 font-medium text-right">Bought Pure</th>
                <th className="pb-2 font-medium text-right">Sold Gross</th>
                <th className="pb-2 font-medium text-right">Sold Net</th>
                <th className="pb-2 font-medium text-right">Diff (Gross)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 font-medium" style={{ color: C.gold }}>Gold</td>
                <td className="py-2.5 text-right text-ink">{grams(pa?.goldBoughtGross ?? 0)}</td>
                <td className="py-2.5 text-right text-ink-dim">{grams(pa?.goldBoughtPure ?? 0)}</td>
                <td className="py-2.5 text-right text-ink">{grams(pa?.goldSoldGross ?? 0)}</td>
                <td className="py-2.5 text-right text-ink-dim">{grams(pa?.goldSoldNet ?? 0)}</td>
                <td className="py-2.5 text-right font-medium">
                  {(() => { const d = (pa?.goldBoughtGross ?? 0) - (pa?.goldSoldGross ?? 0); return <span style={{ color: d >= 0 ? C.green : C.red }}>{d >= 0 ? "+" : ""}{grams(d)}</span>; })()}
                </td>
              </tr>
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 font-medium text-ink-dim">Silver</td>
                <td className="py-2.5 text-right text-ink">{grams(pa?.silverBoughtGross ?? 0)}</td>
                <td className="py-2.5 text-right text-ink-dim">{grams(pa?.silverBoughtPure ?? 0)}</td>
                <td className="py-2.5 text-right text-ink">{grams(pa?.silverSoldGross ?? 0)}</td>
                <td className="py-2.5 text-right text-ink-dim">{grams(pa?.silverSoldNet ?? 0)}</td>
                <td className="py-2.5 text-right font-medium">
                  {(() => { const d = (pa?.silverBoughtGross ?? 0) - (pa?.silverSoldGross ?? 0); return <span style={{ color: d >= 0 ? C.green : C.red }}>{d >= 0 ? "+" : ""}{grams(d)}</span>; })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* P&L waterfall */}
        <div className="border-t border-line pt-4 space-y-0">
          {[
            { label: "Revenue (excl GST)",             value: pa?.revenueExclGST ?? 0,    sign: 1,  bold: false, color: C.blue   },
            { label: "GST Collected",                  value: pa?.totalGST ?? 0,           sign: 1,  bold: false, color: C.gray   },
            { label: "Bank / UPI to Suppliers",        value: pa?.bankAmt ?? 0,             sign: -1, bold: false, color: C.red    },
            { label: `Old Gold Cut Rate (${grams(pa?.cutWt ?? 0)})`, value: pa?.cutAmt ?? 0, sign: -1, bold: false, color: C.orange },
            { label: "Gross Profit",                   value: pa?.grossProfit ?? 0,         sign: 1,  bold: true,  color: (pa?.grossProfit ?? 0) >= 0 ? C.green : C.red },
            { label: "Month Expenses",                 value: pa?.totalExpenses ?? 0,       sign: -1, bold: false, color: C.red    },
            { label: "Net Profit",                     value: pa?.netProfit ?? 0,           sign: 1,  bold: true,  color: (pa?.netProfit ?? 0) >= 0 ? C.green : C.red },
          ].map((row, i) => (
            <div key={i} className={`flex justify-between items-center py-2 ${row.bold ? "border-t border-line mt-1" : ""}`}>
              <span className={`text-sm ${row.bold ? "font-semibold text-ink" : "text-ink-dim"}`}>{row.label}</span>
              <div className="text-right">
                <span className={`text-sm font-${row.bold ? "bold" : "medium"}`} style={{ color: row.color }}>
                  {row.sign === -1 ? "− " : ""}{inr(Math.abs(row.value))}
                </span>
                {row.bold && pa && (
                  <span className="ml-2 text-xs text-ink-dim">
                    {row.label.startsWith("Gross") ? `${pa.gpPct.toFixed(1)}% GP` : `${pa.npPct.toFixed(1)}% NP`}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Tabs config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",   label: "Overview"        },
  { id: "sales",      label: "Sales Analysis"  },
  { id: "inventory",  label: "Inventory"       },
  { id: "deep",       label: "Deep Analytics"  },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [tab, setTab]     = useState<TabId>("overview");
  const [selYM, setSelYM] = useState(monthKey());
  const maxYM = monthKey();

  const shiftYM = (dir: -1 | 1) => {
    const d = new Date(selYM + "-01");
    d.setMonth(d.getMonth() + dir);
    const next = d.toISOString().slice(0, 7);
    if (next <= maxYM) setSelYM(next);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Analytics Dashboard</h1>
          <p className="text-[11px] text-ink-dim mt-0.5">Sabarinathan Jewellery — business intelligence</p>
        </div>
        <Link href="/dashboard" className="text-sm text-ink-dim hover:text-ink">← Home</Link>
      </div>

      {/* Global month filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-dim font-medium uppercase tracking-wide mr-1">Month</span>
        <button onClick={() => shiftYM(-1)}
          className="px-3 py-1.5 text-sm border border-line rounded-lg2 text-ink-dim hover:bg-slate-50">←</button>
        <div className="relative">
          <input
            type="month"
            value={selYM}
            max={maxYM}
            onChange={(e) => e.target.value && setSelYM(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <span className="px-4 py-1.5 text-sm font-semibold text-ink border border-line rounded-lg2 bg-white inline-block min-w-[160px] text-center cursor-pointer select-none">
            {ymLabel(selYM)}
          </span>
        </div>
        <button onClick={() => shiftYM(1)} disabled={selYM >= maxYM}
          className="px-3 py-1.5 text-sm border border-line rounded-lg2 text-ink-dim hover:bg-slate-50 disabled:opacity-40">→</button>
        {selYM !== maxYM && (
          <button onClick={() => setSelYM(maxYM)}
            className="ml-1 px-2 py-1 text-xs text-gold border border-gold/30 rounded-lg2 hover:bg-gold/5">
            Current
          </button>
        )}
      </div>

      <div className="flex border-b border-line gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview"  && <OverviewTab selYM={selYM} />}
      {tab === "sales"     && <SalesTab selYM={selYM} />}
      {tab === "inventory" && <InventoryTab selYM={selYM} />}
      {tab === "deep"      && <DeepTab selYM={selYM} />}
    </div>
  );
}
