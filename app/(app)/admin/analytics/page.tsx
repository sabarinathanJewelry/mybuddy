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

function useMonthStats(offset = 0) {
  const ms = monthStart(offset);
  const me = monthStart(offset + 1);
  const mk = monthKey(offset);
  return useQuery({
    queryKey: ["adash-month", mk],
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

function usePaymentMix() {
  return useQuery({
    queryKey: ["adash-paymix", monthKey()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ms = monthStart();
      const me = monthStart(1);
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

function useSalesByMetal(offset = 0) {
  const ms = monthStart(offset);
  const me = monthStart(offset + 1);
  return useQuery({
    queryKey: ["adash-metal", monthKey(offset)],
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

function useDailySales() {
  return useQuery({
    queryKey: ["adash-daily", monthKey()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ms = monthStart();
      const me = monthStart(1);
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

function useTopCustomers() {
  return useQuery({
    queryKey: ["adash-top-cust", monthKey()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ms = monthStart();
      const me = monthStart(1);
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

function useTopProducts() {
  return useQuery({
    queryKey: ["adash-products", monthKey()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ms = monthStart();
      const me = monthStart(1);
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

function useSourceBreakdown() {
  return useQuery({
    queryKey: ["adash-source", monthKey()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ms = monthStart();
      const me = monthStart(1);
      const { data } = await supabase().from("sale_items")
        .select("metal, gross_wt, net_wt, line_total, is_suspense, sales!inner(id, order_id, bill_date, status)")
        .gte("sales.bill_date", ms).lt("sales.bill_date", me).eq("sales.status", "confirmed");
      const items = (data ?? []) as any[];
      const sum = (arr: any[]) => arr.reduce((acc, i) => ({
        count: acc.count + 1,
        grossWt: acc.grossWt + (i.gross_wt ?? 0),
        netWt: acc.netWt + (i.net_wt ?? 0),
        revenue: acc.revenue + (i.line_total ?? 0),
      }), { count: 0, grossWt: 0, netWt: 0, revenue: 0 });
      return {
        ready:    sum(items.filter((i) => !i.is_suspense && !i.sales?.order_id)),
        order:    sum(items.filter((i) => !i.is_suspense &&  i.sales?.order_id)),
        suspense: sum(items.filter((i) =>  i.is_suspense)),
      };
    },
  });
}

function useMonthExpenses() {
  return useQuery({
    queryKey: ["adash-exp", monthKey()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ms = monthStart();
      const me = monthStart(1);
      const { data } = await supabase().from("expenses").select("category, amount")
        .gte("expense_date", ms).lt("expense_date", me);
      const total = (data ?? []).reduce((s, e: any) => s + (e.amount ?? 0), 0);
      const bycat = new Map<string, number>();
      for (const e of (data ?? []) as any[]) {
        const cat = e.category ?? "Other";
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
function OverviewTab() {
  const { data: tod }   = useTodayStats();
  const { data: mon }   = useMonthStats(0);
  const { data: last }  = useMonthStats(-1);
  const { data: trend } = useRevenueTrend();
  const { data: pmix }  = usePaymentMix();
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
function SalesTab() {
  const [offset, setOffset] = useState(0);
  const { data: byMetal } = useSalesByMetal(offset);
  const { data: daily }   = useDailySales();
  const { data: topCust } = useTopCustomers();

  const metals = Object.entries(byMetal ?? {}).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRev = metals.reduce((s, [, v]) => s + v.revenue, 0);
  const maxCust  = Math.max(...(topCust ?? []).map((c) => c.amount), 1);

  const curMonth = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1)
    .toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setOffset((o) => o - 1)}
          className="px-3 py-1.5 text-sm border border-line rounded-lg2 text-ink-dim hover:bg-slate-50">←</button>
        <span className="font-semibold text-ink min-w-[160px] text-center">{curMonth}</span>
        <button onClick={() => setOffset((o) => Math.min(o + 1, 0))} disabled={offset >= 0}
          className="px-3 py-1.5 text-sm border border-line rounded-lg2 text-ink-dim hover:bg-slate-50 disabled:opacity-40">→</button>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Daily Sales — This Month">
          {(daily ?? []).length >= 2
            ? <LineChart data={daily} color={C.green} h={160} />
            : <p className="text-ink-dim text-sm text-center py-8">Not enough data yet</p>}
        </Card>
        <Card title="Top Customers This Month">
          <div className="space-y-3">
            {(topCust ?? []).map((c, i) => (
              <HBar key={i} label={c.name} value={c.amount} max={maxCust}
                color={i === 0 ? C.gold : i < 3 ? C.blue : C.gray} />
            ))}
            {!topCust?.length && <p className="text-ink-dim text-sm text-center py-4">No data</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Tab: Inventory ────────────────────────────────────────────────────────────
function InventoryTab() {
  const { data: src }  = useSourceBreakdown();
  const { data: prod } = useTopProducts();

  const srcTotal = (src?.ready.revenue ?? 0) + (src?.order.revenue ?? 0) + (src?.suspense.revenue ?? 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Ready Stock Sales" value={inr(src?.ready.revenue ?? 0)}
          sub={`${src?.ready.count ?? 0} items · ${grams(src?.ready.netWt ?? 0)}`} icon="🏪" ibg="#F0FDF4" />
        <KpiCard label="Order Deliveries"  value={inr(src?.order.revenue ?? 0)}
          sub={`${src?.order.count ?? 0} items · ${grams(src?.order.netWt ?? 0)}`} icon="📦" ibg="#EFF6FF" />
        <KpiCard label="From Suspense"     value={inr(src?.suspense.revenue ?? 0)}
          sub={`${src?.suspense.count ?? 0} items · ${grams(src?.suspense.netWt ?? 0)}`} icon="🔄" ibg="#FFF7ED" />
        <KpiCard label="Total Month Sales" value={inr(srcTotal)} sub="all sources" icon="💹" ibg="#F5F3FF" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Source Mix">
          <div className="flex flex-col items-center gap-4">
            <Donut
              segs={[
                { value: src?.ready.revenue    ?? 0, color: C.green  },
                { value: src?.order.revenue    ?? 0, color: C.blue   },
                { value: src?.suspense.revenue ?? 0, color: C.orange },
              ]}
              label={inr(srcTotal)} sub="this month" size={148} sw={20}
            />
            <div className="w-full space-y-2 text-sm">
              {[
                { label: "Ready Stock",    color: C.green,  v: src?.ready },
                { label: "Order Delivery", color: C.blue,   v: src?.order },
                { label: "From Suspense",  color: C.orange, v: src?.suspense },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: row.color }} />
                    <span className="text-ink-dim">{row.label}</span>
                  </div>
                  <span className="font-medium text-ink">{grams(row.v?.netWt ?? 0)}</span>
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

function DeepTab() {
  const { data: mon }    = useMonthStats(0);
  const { data: exp }    = useMonthExpenses();
  const { data: topSale} = useTodayTopSales();

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
            { label: "Gold Gross Wt", value: grams(mon?.goldWt ?? 0) },
            { label: "Silver Gross Wt", value: grams(mon?.silverWt ?? 0) },
            { label: "GST %", value: mon?.revenue ? `${((mon.gst / mon.revenue) * 100).toFixed(1)}%` : "—" },
            { label: "Month Bills", value: String(mon?.bills ?? 0) },
            { label: "Avg Bill Value", value: mon?.bills ? inr(mon.revenue / mon.bills) : "—" },
            { label: "Revenue excl. GST", value: inr((mon?.revenue ?? 0) - (mon?.gst ?? 0)) },
          ].map((r) => (
            <div key={r.label} className="border-b border-line pb-3">
              <p className="text-[11px] text-ink-dim uppercase tracking-wide">{r.label}</p>
              <p className="font-semibold text-ink mt-0.5">{r.value}</p>
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
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Analytics Dashboard</h1>
          <p className="text-[11px] text-ink-dim mt-0.5">Sabarinathan Jewellery — business intelligence</p>
        </div>
        <Link href="/dashboard" className="text-sm text-ink-dim hover:text-ink">← Home</Link>
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

      {tab === "overview"  && <OverviewTab />}
      {tab === "sales"     && <SalesTab />}
      {tab === "inventory" && <InventoryTab />}
      {tab === "deep"      && <DeepTab />}
    </div>
  );
}
