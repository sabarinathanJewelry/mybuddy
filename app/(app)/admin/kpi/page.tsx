"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { useMonthlyAttendanceSummary } from "@/modules/attendance/api";
import { calcItemIncentive } from "@/modules/kpi/incentive-master";
import { loadSavedSheet, calcRow, periodToMonth, type SavedSheet } from "@/modules/kpi/incentive-sheet";
import { useConductNoteCounts, CONDUCT_NOTE_KPI_PENALTY_PCT } from "@/modules/staff-conduct/api";
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
interface KpiTarget { staff_id: string; weight_target: number }
interface StaffRow { id: string; bio_user_id: string; name: string; designation: string }

interface BillLine {
  id: string; billNo: string; date: string; role: "SP1" | "SP2"; share: number;
  products: string; netWt: number; amount: number | null; incentive: number;
}
interface SheetStaff { sp1Bills: Set<string>; sp2Bills: Set<string>; netWt: number; incentive: number; bills: Map<string, BillLine> }

// ERP names are usually upper-case first names; fall back to a unique first-word match
function matchSheetName(staffName: string, sheetNames: string[]): string | null {
  const full = staffName.trim().toUpperCase();
  if (sheetNames.includes(full)) return full;
  const first = full.split(/\s+/)[0];
  const hits = sheetNames.filter(n => n.split(/\s+/)[0] === first);
  return hits.length === 1 ? hits[0] : null;
}

interface StaffKpi {
  staff: StaffRow;
  sheetName: string | null;
  billsSp1: number;
  billsSp2: number;
  salesAmt: number;
  netWt: number;
  incentive: number;
  presentDays: number;
  totalDays: number;
  lateDays: number;
  weightTarget: number;
  achievementPct: number | null;
  conductNoteCount: number;
}

export default function AdminKpiPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [editingTarget, setEditingTarget] = useState<{ staffId: string; value: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: staffList = [] } = useQuery<StaffRow[]>({
    queryKey: ["staff-list-kpi"],
    queryFn: async () => {
      const { data } = await supabase().from("staff").select("id, bio_user_id, name, designation").eq("active", true).order("name");
      return (data ?? []) as StaffRow[];
    },
  });

  const { data: attSummary = [] } = useMonthlyAttendanceSummary(month);
  const { data: conductCounts = {} } = useConductNoteCounts(month);

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

  const { data: sheetList = [] } = useQuery({
    queryKey: ["incentive_sheets"],
    queryFn: async () => {
      const { data } = await supabase().from("incentive_sheets").select("id, period, updated_at").order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; updated_at: string }[];
    },
  });
  const sheetMeta = sheetList.find(s => periodToMonth(s.period) === month) ?? null;

  const { data: sheet } = useQuery<SavedSheet | null>({
    queryKey: ["kpi-incentive-sheet", sheetMeta?.id],
    enabled: !!sheetMeta,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("incentive_sheets")
        .select("raw_data, overrides, deleted_idxs, default_split, mapper_entries, master_entries")
        .eq("id", sheetMeta!.id)
        .single();
      if (error) throw error;
      return data as SavedSheet;
    },
  });

  const sheetStaff = useMemo(() => {
    if (!sheetMeta || !sheet) return null;
    const { rows, overrides, defaultSplit, mapper, master } = loadSavedSheet(sheet);
    const map = new Map<string, SheetStaff>();
    const entry = (name: string) => {
      const key = name.trim().toUpperCase();
      if (!map.has(key)) map.set(key, { sp1Bills: new Set(), sp2Bills: new Set(), netWt: 0, incentive: 0, bills: new Map() });
      return map.get(key)!;
    };
    rows.forEach((row, i) => {
      const eff = calcRow(row, overrides[row.idx], defaultSplit, mapper, master);
      const add = (name: string, role: "SP1" | "SP2", share: number, inc: number) => {
        const e = entry(name);
        (role === "SP1" ? e.sp1Bills : e.sp2Bills).add(row.billNo);
        e.netWt += row.netWt * share;
        e.incentive += inc;
        const key = `${role}:${row.billNo || i}`;
        const b = e.bills.get(key) ?? { id: key, billNo: row.billNo, date: row.date, role, share, products: "", netWt: 0, amount: null, incentive: 0 };
        if (!b.products.split(", ").includes(row.product)) b.products = b.products ? `${b.products}, ${row.product}` : row.product;
        b.netWt += row.netWt * share;
        b.incentive += inc;
        e.bills.set(key, b);
      };
      const sp1Share = row.sp2 ? eff.sp1Share / 100 : 1;
      if (row.sp1) add(row.sp1, "SP1", sp1Share, eff.sp1Inc);
      if (row.sp2) add(row.sp2, "SP2", 1 - eff.sp1Share / 100, eff.sp2Inc);
    });
    return map;
  }, [sheetMeta, sheet]);

  const { data: targets = [] } = useQuery<KpiTarget[]>({
    queryKey: ["kpi-targets", month],
    queryFn: async () => {
      const { data } = await supabase().from("kpi_targets").select("staff_id, weight_target").eq("month", month);
      return (data ?? []) as KpiTarget[];
    },
  });

  const saveTarget = useMutation({
    mutationFn: async ({ staffId, value }: { staffId: string; value: string }) => {
      const wt = parseFloat(value) || 0;
      const client = supabase();
      if (wt === 0) {
        await client.from("kpi_targets").delete().eq("staff_id", staffId).eq("month", month);
      } else {
        await client.from("kpi_targets").upsert(
          { staff_id: staffId, month, weight_target: wt, updated_at: new Date().toISOString() },
          { onConflict: "staff_id,month" }
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kpi-targets", month] });
      setEditingTarget(null);
    },
  });

  const kpiRows = useMemo<StaffKpi[]>(() => {
    const sheetNames = sheetStaff ? [...sheetStaff.keys()] : [];
    return staffList.map((staff) => {
      const sheetName = sheetStaff ? matchSheetName(staff.name, sheetNames) : null;
      const fromSheet = sheetName ? sheetStaff!.get(sheetName)! : null;
      const sp1Sales = sales.filter(s => s.salesperson1_id === staff.id);
      const sp2Sales = sales.filter(s => s.salesperson2_id === staff.id);

      let salesAmt = 0, netWt = 0, incentive = 0;

      for (const sale of sp1Sales) {
        const share = sale.salesperson2_id ? 0.7 : 1.0;
        for (const item of sale.sale_items) {
          salesAmt  += item.line_total * share;
          netWt     += item.net_wt    * share;
          incentive += calcItemIncentive(item.description, item.va_pct, item.net_wt, share);
        }
      }
      for (const sale of sp2Sales) {
        for (const item of sale.sale_items) {
          salesAmt  += item.line_total * 0.3;
          netWt     += item.net_wt    * 0.3;
          incentive += calcItemIncentive(item.description, item.va_pct, item.net_wt, 0.3);
        }
      }

      if (sheetStaff) {
        netWt     = fromSheet?.netWt ?? 0;
        incentive = fromSheet?.incentive ?? 0;
      }

      const att = attSummary.find(a => a.bio_user_id === staff.bio_user_id);
      const weightTarget = targets.find(t => t.staff_id === staff.id)?.weight_target ?? 0;
      const conductNoteCount = conductCounts[staff.id] ?? 0;
      const rawAchievementPct = weightTarget > 0 ? (netWt / weightTarget) * 100 : null;
      // Conduct notes deduct from Achievement % regardless of whether admin applied
      // a fine — the KPI hit isn't conditional on the fine decision. Floored at 0.
      const achievementPct = rawAchievementPct !== null
        ? Math.max(0, rawAchievementPct - conductNoteCount * CONDUCT_NOTE_KPI_PENALTY_PCT)
        : null;

      return {
        staff,
        sheetName,
        billsSp1: sheetStaff ? (fromSheet?.sp1Bills.size ?? 0) : sp1Sales.length,
        billsSp2: sheetStaff ? (fromSheet?.sp2Bills.size ?? 0) : sp2Sales.length,
        salesAmt,
        netWt,
        incentive,
        presentDays: att?.present_days ?? 0,
        totalDays:   att?.total_days   ?? 0,
        lateDays:    att?.late_days    ?? 0,
        weightTarget,
        achievementPct,
        conductNoteCount,
      };
    });
  }, [staffList, sales, sheetStaff, attSummary, targets, conductCounts]);

  const totals = useMemo(() => ({
    bills:           kpiRows.reduce((s, r) => s + r.billsSp1 + r.billsSp2, 0),
    netWt:           kpiRows.reduce((s, r) => s + r.netWt, 0),
    incentive:       kpiRows.reduce((s, r) => s + r.incentive, 0),
    staffWithTarget: kpiRows.filter(r => r.weightTarget > 0).length,
  }), [kpiRows]);

  const unmatchedSheetNames = useMemo(() => {
    if (!sheetStaff) return [];
    const used = new Set(kpiRows.map(r => r.sheetName).filter(Boolean));
    return [...sheetStaff.keys()].filter(n => !used.has(n)).sort();
  }, [sheetStaff, kpiRows]);

  const expandedSales = useMemo<BillLine[]>(() => {
    if (!expandedId) return [];
    const staff = staffList.find(s => s.id === expandedId);
    if (!staff) return [];
    if (sheetStaff) {
      const name = kpiRows.find(r => r.staff.id === staff.id)?.sheetName;
      return name ? [...sheetStaff.get(name)!.bills.values()] : [];
    }
    const toLine = (s: Sale, role: "SP1" | "SP2", share: number): BillLine => ({
      id: `${role}:${s.id}`, billNo: s.bill_no, date: s.bill_date, role, share,
      products: [...new Set(s.sale_items.map(i => i.description))].join(", "),
      netWt: s.sale_items.reduce((t, i) => t + i.net_wt * share, 0),
      amount: s.sale_items.reduce((t, i) => t + i.line_total * share, 0),
      incentive: s.sale_items.reduce((t, i) => t + calcItemIncentive(i.description, i.va_pct, i.net_wt, share), 0),
    });
    return [
      ...sales.filter(s => s.salesperson1_id === staff.id).map(s => toLine(s, "SP1", s.salesperson2_id ? 0.7 : 1.0)),
      ...sales.filter(s => s.salesperson2_id === staff.id).map(s => toLine(s, "SP2", 0.3)),
    ].sort((a, b) => a.date.localeCompare(b.date));
  }, [expandedId, staffList, sales, sheetStaff, kpiRows]);

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

      <div className="text-xs text-ink-dim">
        {sheetMeta ? (
          <span>
            Bills, net weight and incentive from incentive sheet <span className="font-semibold text-ink">{sheetMeta.period}</span>{" "}
            (<Link href="/admin/incentive-calc" className="text-gold hover:underline">Incentive Calculator</Link>)
            {unmatchedSheetNames.length > 0 && (
              <span className="text-warn"> · Not matched to staff: {unmatchedSheetNames.join(", ")}</span>
            )}
          </span>
        ) : (
          <span>
            No incentive sheet saved for {monthLabel(month)} — save one in the{" "}
            <Link href="/admin/incentive-calc" className="text-gold hover:underline">Incentive Calculator</Link> with this month as the period.
          </span>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Bills",        value: totals.bills.toString() },
          { label: "Total Wt Sold (wtd)", value: `${totals.netWt.toFixed(3)}g` },
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
              <th className="text-right px-3 py-2.5">Net Wt (wtd)</th>
              <th className="text-right px-3 py-2.5">Incentive</th>
              <th className="text-center px-3 py-2.5">Attd%</th>
              <th className="text-center px-3 py-2.5">Late</th>
              <th className="text-right px-3 py-2.5">Target (g)</th>
              <th className="text-center px-3 py-2.5">Wt Achievement</th>
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
                    <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold">
                      {row.netWt > 0 ? `${row.netWt.toFixed(3)}g` : <span className="text-ink-dim font-normal">—</span>}
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
                      {row.lateDays > 0
                        ? <span className={clsx(row.lateDays > 3 ? "text-err font-semibold" : "text-warn")}>{row.lateDays}d</span>
                        : <span className="text-ink-dim">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <input
                            type="number" step="0.001" min="0"
                            value={editingTarget.value}
                            onChange={e => setEditingTarget(t => t ? { ...t, value: e.target.value } : null)}
                            onKeyDown={e => {
                              if (e.key === "Enter") saveTarget.mutate({ staffId: row.staff.id, value: editingTarget.value });
                              if (e.key === "Escape") setEditingTarget(null);
                            }}
                            placeholder="0.000"
                            autoFocus
                            className={`${inp} w-24 text-right`}
                          />
                          <span className="text-xs text-ink-dim">g</span>
                          <button onClick={() => saveTarget.mutate({ staffId: row.staff.id, value: editingTarget.value })} className="text-xs bg-gold text-white px-2 py-1 rounded-lg2">✓</button>
                          <button onClick={() => setEditingTarget(null)} className="text-xs border border-line px-2 py-1 rounded-lg2">✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingTarget({ staffId: row.staff.id, value: row.weightTarget > 0 ? String(row.weightTarget) : "" })}
                          className="text-sm font-mono hover:text-gold transition-colors"
                        >
                          {row.weightTarget > 0
                            ? <span>{row.weightTarget.toFixed(3)}g</span>
                            : <span className="text-ink-dim text-xs">Set target</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.achievementPct !== null ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded-full",
                            row.achievementPct >= 100 ? "bg-ok/10 text-ok" :
                            row.achievementPct >= 70  ? "bg-warn/10 text-warn" : "bg-err/10 text-err"
                          )}>
                            {Math.round(row.achievementPct)}%
                          </span>
                          <span className="text-[10px] text-ink-dim">{row.netWt.toFixed(2)}g / {row.weightTarget.toFixed(2)}g</span>
                          {row.conductNoteCount > 0 && (
                            <span className="text-[10px] text-err" title="Conduct notes reduce Achievement %">
                              -{row.conductNoteCount * CONDUCT_NOTE_KPI_PENALTY_PCT}% ({row.conductNoteCount} note{row.conductNoteCount > 1 ? "s" : ""})
                            </span>
                          )}
                        </div>
                      ) : <span className="text-ink-dim text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {(row.billsSp1 + row.billsSp2 > 0) && (
                        <button onClick={() => setExpandedId(isExpanded ? null : row.staff.id)}
                          className="text-xs text-gold hover:underline">{isExpanded ? "▲" : "▼"}</button>
                      )}
                    </td>
                  </tr>

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
                                  const { netWt: saleNetWt, amount: saleAmt, incentive: saleInc, products } = sale;
                                  return (
                                    <tr key={sale.id} className="border-b border-line/50 last:border-0">
                                      <td className="py-1.5 pr-3 font-mono">{sale.billNo}</td>
                                      <td className="py-1.5 pr-3 text-ink-dim">{sale.date}</td>
                                      <td className="py-1.5 pr-3 text-center">
                                        <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                          sale.role === "SP1" ? "bg-gold/10 text-gold" : "bg-info/10 text-info"
                                        )}>
                                          {sale.role} ({Math.round(sale.share * 100)}%)
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-3 text-ink-dim truncate max-w-[200px]">{products}</td>
                                      <td className="py-1.5 pr-3 text-right font-mono font-semibold">{saleNetWt.toFixed(3)}g</td>
                                      <td className="py-1.5 pr-3 text-right font-mono">{saleAmt !== null ? inr(saleAmt) : "—"}</td>
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
        Weight and incentive are weighted by the SP1/SP2 split ({sheetMeta ? "as set in the incentive sheet" : "SP1 = 70%, SP2 = 30%"}). Achievement = net weight sold vs weight target.
      </p>
    </div>
  );
}
