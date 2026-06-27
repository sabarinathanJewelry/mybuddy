"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useMonthlyAttendanceSummary } from "@/modules/attendance/api";
import { calcItemIncentive } from "@/modules/kpi/incentive-master";
import { clsx } from "clsx";

const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

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
interface Sale {
  id: string;
  bill_date: string;
  bill_no: string;
  salesperson1_id: string | null;
  salesperson2_id: string | null;
  sale_items: SaleItem[];
}
interface KpiTarget { staff_id: string; sales_target: number }
interface StaffRow { id: string; bio_user_id: string; name: string; designation: string }

interface StaffKpi {
  staff: StaffRow;
  billsSp1: number;
  billsSp2: number;
  salesAmt: number;       // weighted: SP1×70% or SP2×30%
  netWt: number;          // weighted same
  incentive: number;      // product master calc
  presentDays: number;
  totalDays: number;
  lateDays: number;
  target: number;
  achievementPct: number | null;
}

export default function AdminKpiPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [editingTarget, setEditingTarget] = useState<{ staffId: string; value: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Staff list
  const { data: staffList = [] } = useQuery<StaffRow[]>({
    queryKey: ["staff-list-kpi"],
    queryFn: async () => {
      const { data } = await supabase().from("staff").select("id, bio_user_id, name, designation").eq("active", true).order("name");
      return (data ?? []) as StaffRow[];
    },
  });

  // Monthly attendance summary (uses useMonthlyAttendanceSummary from attendance/api)
  const { data: attSummary = [] } = useMonthlyAttendanceSummary(month);

  // All sales for the month with nested items
  const { data: sales = [] } = useQuery<Sale[]>({
    queryKey: ["kpi-sales", month],
    queryFn: async () => {
      const [y, mo] = month.split("-");
      const lastDay = new Date(Number(y), Number(mo), 0).getDate();
      const { data } = await supabase()
        .from("sales")
        .select("id, bill_date, bill_no, salesperson1_id, salesperson2_id, sale_items(description, net_wt, va_pct, line_total)")
        .gte("bill_date", `${month}-01`)
        .lte("bill_date", `${month}-${String(lastDay).padStart(2, "0")}`);
      return (data ?? []) as Sale[];
    },
  });

  // KPI targets for the month
  const { data: targets = [] } = useQuery<KpiTarget[]>({
    queryKey: ["kpi-targets", month],
    queryFn: async () => {
      const { data } = await supabase().from("kpi_targets").select("staff_id, sales_target").eq("month", month);
      return (data ?? []) as KpiTarget[];
    },
  });

  const saveTarget = useMutation({
    mutationFn: async ({ staffId, value }: { staffId: string; value: string }) => {
      const amount = parseFloat(value) || 0;
      const client = supabase();
      if (amount === 0) {
        await client.from("kpi_targets").delete().eq("staff_id", staffId).eq("month", month);
      } else {
        await client.from("kpi_targets").upsert({ staff_id: staffId, month, sales_target: amount, updated_at: new Date().toISOString() }, { onConflict: "staff_id,month" });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi-targets", month] });
      setEditingTarget(null);
    },
  });

  const kpiRows = useMemo<StaffKpi[]>(() => {
    return staffList.map((staff) => {
      const sp1Sales = sales.filter(s => s.salesperson1_id === staff.id);
      const sp2Sales = sales.filter(s => s.salesperson2_id === staff.id);

      let salesAmt = 0;
      let netWt = 0;
      let incentive = 0;

      for (const sale of sp1Sales) {
        const hasSp2 = !!sale.salesperson2_id;
        const share = hasSp2 ? 0.7 : 1.0;
        for (const item of sale.sale_items) {
          salesAmt += item.line_total * share;
          netWt    += item.net_wt    * share;
          incentive += calcItemIncentive(item.description, item.va_pct, item.net_wt, share);
        }
      }
      for (const sale of sp2Sales) {
        for (const item of sale.sale_items) {
          salesAmt += item.line_total * 0.3;
          netWt    += item.net_wt    * 0.3;
          incentive += calcItemIncentive(item.description, item.va_pct, item.net_wt, 0.3);
        }
      }

      const att = attSummary.find(a => a.bio_user_id === staff.bio_user_id);
      const target = targets.find(t => t.staff_id === staff.id)?.sales_target ?? 0;

      return {
        staff,
        billsSp1: sp1Sales.length,
        billsSp2: sp2Sales.length,
        salesAmt,
        netWt,
        incentive,
        presentDays: att?.present_days ?? 0,
        totalDays:   att?.total_days   ?? 0,
        lateDays:    att?.late_days    ?? 0,
        target,
        achievementPct: target > 0 ? (salesAmt / target) * 100 : null,
      };
    });
  }, [staffList, sales, attSummary, targets]);

  const totals = useMemo(() => ({
    bills:     kpiRows.reduce((s, r) => s + r.billsSp1 + r.billsSp2, 0),
    salesAmt:  kpiRows.reduce((s, r) => s + r.salesAmt, 0),
    incentive: kpiRows.reduce((s, r) => s + r.incentive, 0),
    staffWithTarget: kpiRows.filter(r => r.target > 0).length,
  }), [kpiRows]);

  // Expand detail: per-sale items for a given staff
  const expandedSales = useMemo(() => {
    if (!expandedId) return [];
    const staff = staffList.find(s => s.id === expandedId);
    if (!staff) return [];
    return [
      ...sales.filter(s => s.salesperson1_id === staff.id).map(s => ({ ...s, role: "SP1" as const, share: s.salesperson2_id ? 0.7 : 1.0 })),
      ...sales.filter(s => s.salesperson2_id === staff.id).map(s => ({ ...s, role: "SP2" as const, share: 0.3 })),
    ].sort((a, b) => a.bill_date.localeCompare(b.bill_date));
  }, [expandedId, staffList, sales]);

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/attendance" className="text-xs text-gold hover:underline">← Attendance</Link>
          <h1 className="text-xl font-bold">KPI Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">◄</button>
          <span className="font-semibold w-40 text-center text-sm">{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">►</button>
          <button onClick={() => setMonth(currentMonth())} className="text-xs px-3 py-1.5 border border-line rounded-lg2 hover:bg-canvas">Today</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Bills",        value: totals.bills.toString() },
          { label: "Total ₹ (weighted)", value: inr(totals.salesAmt) },
          { label: "Total Incentive",    value: inr(totals.incentive) },
          { label: "Targets Set",        value: `${totals.staffWithTarget} / ${staffList.length}` },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim">{c.label}</p>
            <p className="text-lg font-bold mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Staff table */}
      <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "900px" }}>
          <thead>
            <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Staff</th>
              <th className="text-center px-3 py-2.5">SP1 Bills</th>
              <th className="text-center px-3 py-2.5">SP2 Bills</th>
              <th className="text-right px-3 py-2.5">Sales ₹ (wtd)</th>
              <th className="text-right px-3 py-2.5">Net Wt</th>
              <th className="text-right px-3 py-2.5">Incentive</th>
              <th className="text-center px-3 py-2.5">Attd%</th>
              <th className="text-center px-3 py-2.5">Late</th>
              <th className="text-right px-3 py-2.5">Target ₹</th>
              <th className="text-center px-3 py-2.5">Achievement</th>
              <th className="px-3 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody>
            {kpiRows.map((row) => {
              const isExpanded = expandedId === row.staff.id;
              const attPct = row.totalDays > 0 ? Math.round((row.presentDays / row.totalDays) * 100) : null;
              const isEditing = editingTarget?.staffId === row.staff.id;

              return (
                <>
                  <tr key={row.staff.id}
                    className={clsx("border-b border-line", isExpanded ? "bg-gold/5" : "hover:bg-canvas/50")}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-sm">{row.staff.name}</div>
                      {row.staff.designation && <div className="text-xs text-ink-dim">{row.staff.designation}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-sm">
                      {row.billsSp1 > 0 ? <span className="text-gold font-semibold">{row.billsSp1}</span> : <span className="text-ink-dim">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-sm">
                      {row.billsSp2 > 0 ? <span className="text-info font-semibold">{row.billsSp2}</span> : <span className="text-ink-dim">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-sm">
                      {row.salesAmt > 0 ? inr(row.salesAmt) : <span className="text-ink-dim">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">
                      {row.netWt > 0 ? `${row.netWt.toFixed(2)}g` : "—"}
                    </td>
                    <td className={clsx("px-3 py-2.5 text-right font-mono font-semibold text-sm", row.incentive > 0 ? "text-ok" : "text-ink-dim")}>
                      {row.incentive > 0 ? inr(row.incentive) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {attPct !== null ? (
                        <span className={clsx("font-semibold", attPct < 90 ? "text-err" : "text-ok")}>{attPct}%</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      {row.lateDays > 0 ? <span className={clsx(row.lateDays > 3 ? "text-err font-semibold" : "text-warn")}>{row.lateDays}d</span> : <span className="text-ink-dim">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <input
                            type="number" step="1000" min="0"
                            value={editingTarget.value}
                            onChange={e => setEditingTarget(t => t ? { ...t, value: e.target.value } : null)}
                            onKeyDown={e => { if (e.key === "Enter") saveTarget.mutate({ staffId: row.staff.id, value: editingTarget.value }); if (e.key === "Escape") setEditingTarget(null); }}
                            autoFocus
                            className={`${inp} w-28 text-right`}
                          />
                          <button onClick={() => saveTarget.mutate({ staffId: row.staff.id, value: editingTarget.value })} className="text-xs bg-gold text-white px-2 py-1 rounded-lg2">✓</button>
                          <button onClick={() => setEditingTarget(null)} className="text-xs border border-line px-2 py-1 rounded-lg2">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingTarget({ staffId: row.staff.id, value: row.target > 0 ? String(row.target) : "" })}
                          className="text-sm font-mono hover:text-gold transition-colors"
                        >
                          {row.target > 0 ? inr(row.target) : <span className="text-ink-dim text-xs">Set target</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.achievementPct !== null ? (
                        <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full",
                          row.achievementPct >= 100 ? "bg-ok/10 text-ok" :
                          row.achievementPct >= 70  ? "bg-warn/10 text-warn" : "bg-err/10 text-err"
                        )}>
                          {Math.round(row.achievementPct)}%
                        </span>
                      ) : <span className="text-ink-dim text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {(row.billsSp1 + row.billsSp2 > 0) && (
                        <button onClick={() => setExpandedId(isExpanded ? null : row.staff.id)}
                          className="text-xs text-gold hover:underline">{isExpanded ? "▲" : "▼"}</button>
                      )}
                    </td>
                  </tr>

                  {/* Expanded sale-item detail */}
                  {isExpanded && (
                    <tr key={`${row.staff.id}-expanded`} className="border-b border-line bg-gold/5">
                      <td colSpan={11} className="px-6 py-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-ink-dim uppercase">Bill Breakdown — {row.staff.name}</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs" style={{ minWidth: "700px" }}>
                              <thead>
                                <tr className="text-ink-dim border-b border-line">
                                  <th className="text-left py-1 pr-3">Bill No</th>
                                  <th className="text-left py-1 pr-3">Date</th>
                                  <th className="text-center py-1 pr-3">Role</th>
                                  <th className="text-left py-1 pr-3">Products</th>
                                  <th className="text-right py-1 pr-3">Net Wt</th>
                                  <th className="text-right py-1 pr-3">Amount</th>
                                  <th className="text-right py-1">Incentive</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedSales.map(sale => {
                                  const saleNetWt   = sale.sale_items.reduce((s, i) => s + i.net_wt * sale.share, 0);
                                  const saleAmt     = sale.sale_items.reduce((s, i) => s + i.line_total * sale.share, 0);
                                  const saleInc     = sale.sale_items.reduce((s, i) => s + calcItemIncentive(i.description, i.va_pct, i.net_wt, sale.share), 0);
                                  const products    = [...new Set(sale.sale_items.map(i => i.description))].join(", ");
                                  return (
                                    <tr key={sale.id} className="border-b border-line/50 last:border-0">
                                      <td className="py-1.5 pr-3 font-mono">{sale.bill_no}</td>
                                      <td className="py-1.5 pr-3 text-ink-dim">{sale.bill_date}</td>
                                      <td className="py-1.5 pr-3 text-center">
                                        <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                          sale.role === "SP1" ? "bg-gold/10 text-gold" : "bg-info/10 text-info"
                                        )}>
                                          {sale.role} ({Math.round(sale.share * 100)}%)
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-3 text-ink-dim truncate max-w-[200px]">{products}</td>
                                      <td className="py-1.5 pr-3 text-right font-mono">{saleNetWt.toFixed(2)}g</td>
                                      <td className="py-1.5 pr-3 text-right font-mono">{inr(saleAmt)}</td>
                                      <td className={clsx("py-1.5 text-right font-mono font-semibold", saleInc > 0 ? "text-ok" : "text-ink-dim")}>
                                        {saleInc > 0 ? inr(saleInc) : "—"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {kpiRows.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-ink-dim text-sm">No active staff found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-dim text-center">
        Sales amounts are weighted: SP1 = 70%, SP2 = 30%. Incentive calculated from product master rates.
      </p>
    </div>
  );
}
