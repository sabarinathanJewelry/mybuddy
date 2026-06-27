"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { calcItemIncentive } from "@/modules/kpi/incentive-master";
import { clsx } from "clsx";

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function shiftMonth(month: string, dir: -1 | 1) {
  const [y, m] = month.split("-").map(Number);
  const next = m + dir;
  if (next < 1) return `${y - 1}-12`;
  if (next > 12) return `${y + 1}-01`;
  return `${y}-${String(next).padStart(2, "0")}`;
}

interface SaleItem { description: string; net_wt: number; va_pct: number; line_total: number }
interface MySale {
  id: string; bill_no: string; bill_date: string;
  salesperson1_id: string | null; salesperson2_id: string | null;
  sale_items: SaleItem[];
}

export default function MyKpiPage() {
  const [month, setMonth] = useState(currentMonth());
  const [showAll, setShowAll] = useState(false);

  // Get my staff record (id + bio_user_id)
  const { data: myStaff } = useQuery({
    queryKey: ["my-staff-for-kpi"],
    queryFn: async () => {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) return null;
      const { data } = await supabase().from("staff").select("id, bio_user_id, name").eq("user_id", user.id).maybeSingle();
      return data as { id: string; bio_user_id: string; name: string } | null;
    },
  });

  // My sales for the month (both as SP1 and SP2)
  const { data: sales = [], isLoading: salesLoading } = useQuery<MySale[]>({
    queryKey: ["my-kpi-sales", month, myStaff?.id],
    enabled: !!myStaff?.id,
    queryFn: async () => {
      const [y, mo] = month.split("-");
      const lastDay = new Date(Number(y), Number(mo), 0).getDate();
      const client = supabase();
      const [sp1Res, sp2Res] = await Promise.all([
        client.from("sales")
          .select("id, bill_no, bill_date, salesperson1_id, salesperson2_id, sale_items(description, net_wt, va_pct, line_total)")
          .eq("salesperson1_id", myStaff!.id)
          .gte("bill_date", `${month}-01`)
          .lte("bill_date", `${month}-${String(lastDay).padStart(2, "0")}`),
        client.from("sales")
          .select("id, bill_no, bill_date, salesperson1_id, salesperson2_id, sale_items(description, net_wt, va_pct, line_total)")
          .eq("salesperson2_id", myStaff!.id)
          .gte("bill_date", `${month}-01`)
          .lte("bill_date", `${month}-${String(lastDay).padStart(2, "0")}`),
      ]);
      const sp1 = (sp1Res.data ?? []) as MySale[];
      const sp2 = (sp2Res.data ?? []) as MySale[];
      const seen = new Set<string>();
      return [...sp1, ...sp2].filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
        .sort((a, b) => a.bill_date.localeCompare(b.bill_date));
    },
  });

  // Attendance for the month (simplified — punch log count per day)
  const { data: attData } = useQuery({
    queryKey: ["my-kpi-att", month, myStaff?.bio_user_id],
    enabled: !!myStaff?.bio_user_id,
    queryFn: async () => {
      const [y, mo] = month.split("-");
      const lastDay = new Date(Number(y), Number(mo), 0).getDate();
      const nextMon = Number(mo) === 12 ? `${Number(y) + 1}-01` : `${y}-${String(Number(mo) + 1).padStart(2, "0")}`;
      const { data } = await supabase()
        .from("attendance_logs")
        .select("punch_time")
        .eq("bio_user_id", myStaff!.bio_user_id)
        .gte("punch_time", `${month}-01T00:00:00+05:30`)
        .lt("punch_time", `${nextMon}-01T00:00:00+05:30`);
      const IST = 5.5 * 3600000;
      const days = new Set<string>();
      for (const log of data ?? []) {
        days.add(new Date(new Date(log.punch_time).getTime() + IST).toISOString().slice(0, 10));
      }
      const today = new Date(new Date().getTime() + IST).toISOString().slice(0, 10);
      const maxDay = month < today.slice(0, 7) ? lastDay : Math.min(lastDay, new Date(today).getDate());
      let workDays = 0;
      for (let d = 1; d <= maxDay; d++) {
        const date = new Date(Number(y), Number(mo) - 1, d);
        const dow = date.getDay();
        if (dow !== 0) workDays++; // Count all days except Sunday
      }
      return { presentDays: days.size, workDays };
    },
  });

  // My KPI target
  const { data: myTarget } = useQuery({
    queryKey: ["my-kpi-target", month, myStaff?.id],
    enabled: !!myStaff?.id,
    queryFn: async () => {
      const { data } = await supabase().from("kpi_targets").select("sales_target").eq("staff_id", myStaff!.id).eq("month", month).maybeSingle();
      return (data?.sales_target ?? 0) as number;
    },
  });

  const { summary, billRows } = useMemo(() => {
    if (!myStaff?.id) return { summary: null, billRows: [] };

    let totalSales = 0, totalNetWt = 0, totalInc = 0, billsSp1 = 0, billsSp2 = 0;

    const billRows = sales.map(sale => {
      const isSp1 = sale.salesperson1_id === myStaff.id;
      const hasSp2 = !!sale.salesperson2_id;
      const share = isSp1 ? (hasSp2 ? 0.7 : 1.0) : 0.3;

      const saleAmt = sale.sale_items.reduce((s, i) => s + i.line_total * share, 0);
      const saleWt  = sale.sale_items.reduce((s, i) => s + i.net_wt * share, 0);
      const saleInc = sale.sale_items.reduce((s, i) => s + calcItemIncentive(i.description, i.va_pct, i.net_wt, share), 0);

      totalSales   += saleAmt;
      totalNetWt   += saleWt;
      totalInc     += saleInc;
      if (isSp1) billsSp1++; else billsSp2++;

      return { sale, role: isSp1 ? "SP1" as const : "SP2" as const, share, saleAmt, saleWt, saleInc };
    });

    return {
      summary: { totalSales, totalNetWt, totalInc, billsSp1, billsSp2 },
      billRows,
    };
  }, [sales, myStaff]);

  const attPct = attData && attData.workDays > 0
    ? Math.round((attData.presentDays / attData.workDays) * 100)
    : null;

  const achievementPct = myTarget && myTarget > 0 && summary
    ? Math.round((summary.totalSales / myTarget) * 100)
    : null;

  const visibleBills = showAll ? billRows : billRows.filter(r => r.saleInc > 0);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <Link href="/my-attendance" className="text-sm text-gold font-medium">← Home</Link>
          <span className="text-ink-dim">|</span>
          <span className="text-sm font-semibold text-ink">My KPI</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="px-2 py-1 border border-line rounded-lg2 text-xs hover:bg-canvas">◄</button>
          <span className="text-xs font-medium w-32 text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="px-2 py-1 border border-line rounded-lg2 text-xs hover:bg-canvas">►</button>
        </div>
      </div>

      {!myStaff && (
        <div className="bg-canvas rounded-xl border border-line p-6 text-center text-ink-dim text-sm">
          No staff profile linked to your account. Contact admin.
        </div>
      )}

      {myStaff && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim">Bills (SP1 + SP2)</p>
              <p className="text-2xl font-bold mt-1">
                {summary ? (
                  <>{summary.billsSp1 > 0 && <span className="text-gold">{summary.billsSp1}</span>}
                  {summary.billsSp1 > 0 && summary.billsSp2 > 0 && <span className="text-ink-dim mx-1">+</span>}
                  {summary.billsSp2 > 0 && <span className="text-info">{summary.billsSp2}</span>}
                  {summary.billsSp1 === 0 && summary.billsSp2 === 0 && <span className="text-ink-dim">0</span>}</>
                ) : "—"}
              </p>
              <p className="text-[10px] text-ink-dim mt-0.5">gold=SP1 / blue=SP2</p>
            </div>

            <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim">Sales ₹ (weighted)</p>
              <p className="text-xl font-bold mt-1 font-mono">{summary ? inr(summary.totalSales) : "—"}</p>
              <p className="text-[10px] text-ink-dim mt-0.5">SP1×70% + SP2×30%</p>
            </div>

            <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim">Net Weight Sold</p>
              <p className="text-2xl font-bold mt-1 font-mono">{summary ? `${summary.totalNetWt.toFixed(2)}g` : "—"}</p>
            </div>

            <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim">Incentive Earned</p>
              <p className={clsx("text-2xl font-bold mt-1 font-mono", summary && summary.totalInc > 0 ? "text-ok" : "")}>
                {summary ? inr(summary.totalInc) : "—"}
              </p>
            </div>
          </div>

          {/* Attendance + target */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim">Attendance</p>
              {attData ? (
                <div className="mt-1">
                  <p className={clsx("text-2xl font-bold", attPct !== null && attPct < 90 ? "text-err" : "text-ok")}>
                    {attPct !== null ? `${attPct}%` : "—"}
                  </p>
                  <p className="text-xs text-ink-dim mt-0.5">{attData.presentDays} / {attData.workDays} days</p>
                </div>
              ) : <p className="text-sm text-ink-dim mt-1">Loading…</p>}
            </div>

            <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim">Target</p>
              {myTarget != null && myTarget > 0 ? (
                <div className="mt-1">
                  <p className="text-xl font-bold font-mono">{inr(myTarget)}</p>
                  {achievementPct !== null && (
                    <>
                      <div className="mt-2 h-2 bg-canvas rounded-full overflow-hidden">
                        <div
                          className={clsx("h-full rounded-full transition-all", achievementPct >= 100 ? "bg-ok" : achievementPct >= 70 ? "bg-warn" : "bg-err")}
                          style={{ width: `${Math.min(achievementPct, 100)}%` }}
                        />
                      </div>
                      <p className={clsx("text-xs font-semibold mt-1", achievementPct >= 100 ? "text-ok" : achievementPct >= 70 ? "text-warn" : "text-err")}>
                        {achievementPct}% achieved
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-dim mt-1">Not set yet</p>
              )}
            </div>
          </div>

          {/* Bill breakdown */}
          {salesLoading && <p className="text-sm text-ink-dim">Loading sales…</p>}

          {!salesLoading && billRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Bill Breakdown</p>
                <button onClick={() => setShowAll(v => !v)} className="text-xs text-gold hover:underline">
                  {showAll ? "Incentive only" : `Show all ${billRows.length} bills`}
                </button>
              </div>

              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                      <th className="text-left px-4 py-2">Bill</th>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-center px-3 py-2">Role</th>
                      <th className="text-right px-3 py-2">Amount</th>
                      <th className="text-right px-3 py-2">Incentive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBills.map(({ sale, role, share, saleAmt, saleInc }) => (
                      <tr key={sale.id} className={clsx("border-b border-line last:border-0", saleInc === 0 && "opacity-50")}>
                        <td className="px-4 py-2 font-mono text-xs">{sale.bill_no}</td>
                        <td className="px-3 py-2 text-xs text-ink-dim">{sale.bill_date}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded",
                            role === "SP1" ? "bg-gold/10 text-gold" : "bg-info/10 text-info"
                          )}>
                            {role} {Math.round(share * 100)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{inr(saleAmt)}</td>
                        <td className={clsx("px-3 py-2 text-right font-mono font-semibold text-xs", saleInc > 0 ? "text-ok" : "text-ink-dim")}>
                          {saleInc > 0 ? inr(saleInc) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summary && summary.totalInc > 0 && (
                    <tfoot>
                      <tr className="bg-ok/5 border-t border-ok/20">
                        <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-ink-dim text-right">Total incentive this month</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-ok">{inr(summary.totalInc)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="text-[10px] text-ink-dim text-center">
                Incentive based on product VA%. Faded rows = no incentive eligible.
              </p>
            </div>
          )}

          {!salesLoading && billRows.length === 0 && (
            <div className="bg-canvas rounded-xl border border-line p-6 text-center text-ink-dim text-sm">
              No sales attributed to you in {monthLabel(month)}.
            </div>
          )}
        </>
      )}
    </div>
  );
}
