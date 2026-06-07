"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { inr } from "@/lib/format";

// ─── Types (mirrors incentive-calc) ────────────────────────────────────────────
interface MasterEntry { code: string; rate: number; minWastage: number }
interface MapperEntry  { erpName: string; incentiveCode: string; notes: string }
interface CalcRow {
  idx: number; date: string; product: string; wastage: number;
  netWt: number; balance: number; sp1: string; sp2: string;
}
interface RowOverride { balanceZero?: boolean; minWastage?: number; sp1Share?: number; wastage?: number }

function parseNum(s: string): number {
  const m = (s ?? "").match(/[-\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function parseErp(raw: string): CalcRow[] {
  const lines = raw.split("\n").map(l => l.trimEnd());
  const hi = lines.findIndex(l => /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l));
  if (hi < 0) return [];
  const rows: CalcRow[] = [];
  lines.slice(hi + 1).forEach((line, i) => {
    if (!line.trim()) return;
    const c = line.split("\t");
    const product = (c[1] ?? "").trim().toUpperCase();
    const netWt   = parseNum(c[8] ?? "");
    if (!product || netWt <= 0) return;
    rows.push({
      idx: i, date: (c[0] ?? "").trim(), product,
      wastage: parseNum(c[3] ?? ""),
      netWt,
      balance: Math.max(0, parseNum(c[7] ?? "")),
      sp1: (c[5] ?? "").trim().toUpperCase(),
      sp2: (c[6] ?? "").trim().toUpperCase(),
    });
  });
  return rows;
}

function lookupProduct(erpProduct: string, netWt: number, mapper: MapperEntry[], master: MasterEntry[]) {
  const mapEntry = mapper.find(m => m.erpName.toUpperCase() === erpProduct);
  let incentiveCode = (mapEntry?.incentiveCode ?? erpProduct).toUpperCase();
  if (incentiveCode === "92.5-S" && netWt >= 20) incentiveCode = "92.5-L";
  const masterEntry = master.find(m => m.code.toUpperCase() === incentiveCode) ?? null;
  return { masterEntry, incentiveCode, mapped: !!mapEntry };
}

function calcRow(
  row: CalcRow, ov: RowOverride | undefined, defaultSplit: number,
  myName: string, mapper: MapperEntry[], master: MasterEntry[]
) {
  const { masterEntry, incentiveCode, mapped } = lookupProduct(row.product, row.netWt, mapper, master);
  const rate       = masterEntry?.rate ?? 0;
  const minWastage = ov?.minWastage ?? masterEntry?.minWastage ?? 0;
  const balance    = ov?.balanceZero ? 0 : row.balance;
  const sp1Share   = ov?.sp1Share   ?? defaultSplit;
  const wastage    = ov?.wastage    ?? row.wastage;
  const eligible   = !!masterEntry && rate > 0 && wastage >= minWastage && balance <= 0;
  const totalInc   = eligible ? parseFloat((rate * row.netWt).toFixed(2)) : 0;
  const isSp1      = row.sp1 === myName;
  const myShare    = !row.sp2 ? totalInc
    : isSp1 ? parseFloat((totalInc * sp1Share / 100).toFixed(2))
    : parseFloat((totalInc * (100 - sp1Share) / 100).toFixed(2));
  const myPct      = !row.sp2 ? 100 : isSp1 ? sp1Share : 100 - sp1Share;

  let reason = "";
  if (!masterEntry) reason = mapped ? "Unknown code" : "Unmapped product";
  else if (rate === 0) reason = "No incentive";
  else if (wastage < minWastage) reason = `Wastage ${wastage.toFixed(1)}% < ${minWastage}%`;
  else if (balance > 0) reason = `Balance ₹${balance.toFixed(0)} pending`;

  return { rate, minWastage, balance, wastage, eligible, totalInc, myShare, myPct, incentiveCode, reason };
}

export default function MyIncentivePage() {
  const profile = useAuth((s) => s.profile);
  const myName  = (profile?.display_name ?? "").trim().toUpperCase();
  const isAdmin = profile?.role === "admin";
  const hasAccess = isAdmin || profile?.incentive_access === true;

  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [showIneligible, setShowIneligible] = useState(false);

  const { data: sheets = [], isLoading: sheetsLoading } = useQuery({
    queryKey: ["incentive_sheets_list"],
    enabled: hasAccess,
    queryFn: async () => {
      const { data } = await supabase()
        .from("incentive_sheets")
        .select("id, period, updated_at")
        .order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; updated_at: string }[];
    },
  });

  const activeId = selectedSheetId ?? (sheets[0]?.id ?? null);

  const { data: sheet, isLoading: sheetLoading } = useQuery({
    queryKey: ["incentive_sheet_detail", activeId],
    enabled: hasAccess && !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("incentive_sheets")
        .select("*")
        .eq("id", activeId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { rows, myRows, summary, mapper, master } = useMemo(() => {
    if (!sheet || !myName) return { rows: [], myRows: [], summary: null, mapper: [], master: [] };
    const mapper: MapperEntry[]  = sheet.mapper_entries ?? [];
    const master: MasterEntry[]  = sheet.master_entries ?? [];
    const overrides: Record<number, RowOverride> = sheet.overrides ?? {};
    const defaultSplit: number   = sheet.default_split ?? 70;
    const rows = parseErp(sheet.raw_data ?? "");
    const myRows = rows.filter(r => r.sp1 === myName || r.sp2 === myName);
    const computed = myRows.map(r => ({
      row: r,
      calc: calcRow(r, overrides[r.idx], defaultSplit, myName, mapper, master),
    }));
    const eligibleCount = computed.filter(x => x.calc.eligible).length;
    const totalEarned   = computed.reduce((s, x) => s + x.calc.myShare, 0);
    const totalNetWt    = computed.reduce((s, x) => s + x.row.netWt, 0);
    return { rows, myRows: computed, summary: { total: myRows.length, eligibleCount, totalEarned, totalNetWt }, mapper, master };
  }, [sheet, myName]);

  if (!hasAccess) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-2">
        <p className="text-2xl">🔒</p>
        <p className="text-ink font-semibold">Incentive access not enabled</p>
        <p className="text-sm text-ink-dim">Ask your admin to enable incentive access for your account.</p>
      </div>
    );
  }

  const visible = showIneligible ? myRows : myRows.filter(x => x.calc.eligible);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">My Incentive</h1>
        {!sheetsLoading && sheets.length > 0 && (
          <select
            value={activeId ?? ""}
            onChange={(e) => setSelectedSheetId(e.target.value || null)}
            className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white"
          >
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>{s.period}</option>
            ))}
          </select>
        )}
      </div>

      {(sheetsLoading || sheetLoading) && <p className="text-ink-dim text-sm">Loading…</p>}

      {!sheetsLoading && sheets.length === 0 && (
        <div className="bg-canvas rounded-xl border border-line p-6 text-center text-ink-dim text-sm">
          No incentive sheets saved yet. Admin needs to save a sheet in Incentive Calc.
        </div>
      )}

      {sheet && myName && (
        <>
          {/* Name mismatch hint */}
          {myRows.length === 0 && rows.length > 0 && (
            <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-sm text-warn">
              No rows found for <strong>{myName}</strong> in this sheet.
              Your display name must match the SP1/SP2 name in the ERP export exactly.
              Names in this sheet: <span className="font-mono">{[...new Set(rows.flatMap(r => [r.sp1, r.sp2].filter(Boolean)))].join(", ")}</span>
            </div>
          )}

          {/* Summary cards */}
          {summary && myRows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">Total Items</p>
                <p className="text-2xl font-bold">{summary.total}</p>
              </div>
              <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">Eligible</p>
                <p className="text-2xl font-bold text-ok">{summary.eligibleCount}</p>
                <p className="text-xs text-ink-dim/60">{summary.total - summary.eligibleCount} not eligible</p>
              </div>
              <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">Net Weight</p>
                <p className="text-2xl font-bold font-mono">{summary.totalNetWt.toFixed(3)}g</p>
              </div>
              <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">Total Earned</p>
                <p className="text-2xl font-bold text-gold">{inr(summary.totalEarned)}</p>
              </div>
            </div>
          )}

          {/* Filter toggle */}
          {myRows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowIneligible(!showIneligible)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  showIneligible
                    ? "bg-gold/10 border-gold/30 text-gold"
                    : "border-line text-ink-dim hover:border-gold hover:text-gold"
                }`}
              >
                {showIneligible ? "Showing all rows" : "Show ineligible too"}
              </button>
              <span className="text-xs text-ink-dim">{visible.length} rows shown</span>
            </div>
          )}

          {/* Items table */}
          {visible.length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Product</th>
                    <th className="text-right px-3 py-2.5">Net Wt</th>
                    <th className="text-right px-3 py-2.5">Wastage%</th>
                    <th className="text-right px-3 py-2.5">Min%</th>
                    <th className="text-right px-3 py-2.5">Rate ₹/g</th>
                    <th className="text-right px-3 py-2.5">My Share</th>
                    <th className="text-right px-3 py-2.5">Earned</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ row, calc }, i) => (
                    <tr key={i} className={`border-b border-line last:border-0 ${calc.eligible ? "hover:bg-canvas/40" : "opacity-50"}`}>
                      <td className="px-4 py-2.5 text-ink-dim text-xs whitespace-nowrap">{row.date}</td>
                      <td className="px-3 py-2.5 font-medium text-xs">
                        <div>{row.product}</div>
                        {calc.incentiveCode !== row.product && (
                          <div className="text-ink-dim/60 text-[10px]">→ {calc.incentiveCode}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{row.netWt.toFixed(3)}g</td>
                      <td className={`px-3 py-2.5 text-right font-mono text-xs ${!calc.eligible && calc.reason.startsWith("Wastage") ? "text-err font-semibold" : ""}`}>
                        {calc.wastage.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{calc.minWastage}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{calc.rate > 0 ? `₹${calc.rate}` : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-ink-dim">
                        {row.sp2 ? `${calc.myPct}%` : "100%"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-semibold text-xs ${calc.eligible ? "text-gold" : "text-ink-dim"}`}>
                        {calc.eligible ? inr(calc.myShare) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {calc.eligible ? (
                          <span className="text-ok font-medium">Eligible</span>
                        ) : (
                          <span className="text-ink-dim">{calc.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary && summary.eligibleCount > 0 && (
                  <tfoot>
                    <tr className="bg-gold/5 border-t border-gold/20">
                      <td colSpan={7} className="px-4 py-2.5 text-xs font-semibold text-ink-dim text-right">Total earned this period</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gold">{inr(summary.totalEarned)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* No access note for staff */}
          {!isAdmin && (
            <p className="text-xs text-ink-dim text-center">
              This is a read-only view. Contact admin for any corrections.
            </p>
          )}
        </>
      )}
    </div>
  );
}
