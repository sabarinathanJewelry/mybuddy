"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";

// ─── Master Rate Table ────────────────────────────────────────────────────────
const MASTER: Record<string, { rate: number; minWastage: number }> = {
  "18K CHAIN":              { rate: 3,   minWastage: 15 },
  "K SUNDARI CHAIN":        { rate: 3,   minWastage: 5  },
  "SUNDRI CHAIN":           { rate: 3,   minWastage: 5  },
  "Chain-SU":               { rate: 3,   minWastage: 5  },
  "KAJUKATLI CHAIN":        { rate: 3,   minWastage: 7  },
  "KERALA CHAIN":           { rate: 3,   minWastage: 5  },
  "MACHINE CHAIN":          { rate: 3,   minWastage: 5  },
  "DELHI CHAIN":            { rate: 3,   minWastage: 5  },
  "LOTUS CHAIN":            { rate: 3,   minWastage: 5  },
  "FANCY LOTUS CHAIN":      { rate: 3,   minWastage: 5  },
  "S LEAF BALLS CHAIN":     { rate: 3,   minWastage: 5  },
  "S LEAF CHAIN":           { rate: 3,   minWastage: 5  },
  "IPL CHAIN":              { rate: 3,   minWastage: 6  },
  "Chain-IPL":              { rate: 3,   minWastage: 6  },
  "MUGAPPU CHAIN":          { rate: 3,   minWastage: 6  },
  "BAAHUBALI CHAIN":        { rate: 3,   minWastage: 6  },
  "FANCY BAAHUBALI CHAIN":  { rate: 3,   minWastage: 6  },
  "INDO ITALY CHAIN":       { rate: 3,   minWastage: 7  },
  "MILLER CHAIN":           { rate: 3,   minWastage: 7  },
  "ITALY CHAIN":            { rate: 3,   minWastage: 8  },
  "Chain-BOM":              { rate: 3,   minWastage: 8  },
  "BACK CHAIN":             { rate: 3,   minWastage: 5  },
  "CHOCO CHAIN":            { rate: 3,   minWastage: 7  },
  "NAAGINI CHAIN":          { rate: 3,   minWastage: 7  },
  "SACHIN TENDULKAR CHAIN": { rate: 3,   minWastage: 6  },
  "FANCY BALLS CHAIN":      { rate: 3,   minWastage: 8  },
  "FANCY S L CHAIN":        { rate: 3,   minWastage: 8  },
  "FANCY CHAIN":            { rate: 3,   minWastage: 8  },
  "ROPE CHAIN":             { rate: 2,   minWastage: 3  },
  "COINS":                  { rate: 0,   minWastage: 0  },
  "BABY BANGLES":           { rate: 5,   minWastage: 7  },
  "CBE BANGLES":            { rate: 3,   minWastage: 5  },
  "FANCY BANGLES":          { rate: 4,   minWastage: 7  },
  "BOMBAY BANGLES":         { rate: 4,   minWastage: 7  },
  "ANTIQUE BANGLES":        { rate: 7,   minWastage: 9  },
  "STAMPING BRACELET":      { rate: 4,   minWastage: 8  },
  "BOMBAY BRACELET":        { rate: 4,   minWastage: 8  },
  "LEATHER BRACELET":       { rate: 2,   minWastage: 8  },
  "CBE BRACELET":           { rate: 5,   minWastage: 6  },
  "BABY BRACELET":          { rate: 5,   minWastage: 6  },
  "FANCY BRACELET":         { rate: 5,   minWastage: 8  },
  "FANCY KAPPU":            { rate: 5,   minWastage: 10 },
  "CASTING BRACELET":       { rate: 5,   minWastage: 11 },
  "CUBAN BRACELET":         { rate: 5,   minWastage: 8  },
  "MUGAPPU DOLLAR":         { rate: 8,   minWastage: 11 },
  "FISH DOLLAR":            { rate: 8,   minWastage: 10 },
  "CASTING DOLLAR":         { rate: 8,   minWastage: 11 },
  "BOMBAY DOLLAR":          { rate: 8,   minWastage: 11 },
  "LAKSHMI DOLLAR":         { rate: 8,   minWastage: 11 },
  "FANCY DOLLAR":           { rate: 8,   minWastage: 9  },
  "ROSE DOLLAR":            { rate: 8,   minWastage: 11 },
  "KERALA MALAI":           { rate: 6,   minWastage: 5  },
  "KASU MALAI":             { rate: 6,   minWastage: 7  },
  "CBE MALAI":              { rate: 6,   minWastage: 7  },
  "CASTING MALA":           { rate: 6,   minWastage: 9  },
  "TURKEY MALAI":           { rate: 6,   minWastage: 9  },
  "BOMBAY MALAI":           { rate: 5,   minWastage: 9  },
  "FANCY MALAI":            { rate: 5,   minWastage: 9  },
  "ANTIQUE MALAI":          { rate: 7,   minWastage: 9  },
  "ANTIQUE LAKSHMI MALAI":  { rate: 7,   minWastage: 9  },
  "LAKSHMI MALAI":          { rate: 7,   minWastage: 9  },
  "KERALA NECKLACE":        { rate: 5,   minWastage: 5  },
  "CBE NECKLACE":           { rate: 6,   minWastage: 7  },
  "FANCY NECKLACE":         { rate: 5,   minWastage: 9  },
  "TURKEY NECKLACE":        { rate: 6,   minWastage: 9  },
  "CASTING NECKLACE":       { rate: 6,   minWastage: 9  },
  "BOMBAY NECKLACE":        { rate: 6,   minWastage: 9  },
  "BOMBAY CHOKER":          { rate: 6,   minWastage: 9  },
  "ANTIQUE NECKLACE":       { rate: 7,   minWastage: 9  },
  "ANTIQUE CHOKER":         { rate: 7,   minWastage: 9  },
  "BABY RING":              { rate: 7,   minWastage: 9  },
  "BOMBAY RING":            { rate: 7,   minWastage: 9  },
  "BOLE TV RING":           { rate: 7,   minWastage: 6  },
  "CBE RING":               { rate: 7,   minWastage: 6  },
  "MAHARAJA RING":          { rate: 7,   minWastage: 7  },
  "MALABAR RING":           { rate: 7,   minWastage: 8  },
  "WEDDING RING":           { rate: 7,   minWastage: 8  },
  "FANCY RING":             { rate: 7,   minWastage: 11 },
  "CASTING RING":           { rate: 7,   minWastage: 11 },
  "ANTIQUE-RING":           { rate: 7,   minWastage: 11 },
  "VALAIYAM":               { rate: 7,   minWastage: 5  },
  "CBE STUD":               { rate: 7,   minWastage: 8  },
  "CBE MATTAL":             { rate: 7,   minWastage: 8  },
  "BOMBAY MATTAL":          { rate: 7,   minWastage: 8  },
  "FANCY MATTAL":           { rate: 7,   minWastage: 8  },
  "DELHI MATTAL":           { rate: 7,   minWastage: 8  },
  "TITANIC MATTAL":         { rate: 7,   minWastage: 8  },
  "BABY STUD":              { rate: 7,   minWastage: 12 },
  "FANCY JIMIKKI":          { rate: 7,   minWastage: 11 },
  "JIMIKKI KAMMAL":         { rate: 7,   minWastage: 11 },
  "JIMMIKI":                { rate: 7,   minWastage: 11 },
  "KERALA STUD":            { rate: 7,   minWastage: 11 },
  "NAGMA STUD":             { rate: 7,   minWastage: 16 },
  "FANCY STUD":             { rate: 7,   minWastage: 11 },
  "ROSE GOLD STUD":         { rate: 7,   minWastage: 15 },
  "CASTING STUD":           { rate: 7,   minWastage: 11 },
  "BOMBAY STUD":            { rate: 7,   minWastage: 11 },
  "KASA STUD":              { rate: 7,   minWastage: 9  },
  "TURKEY STUD":            { rate: 7,   minWastage: 11 },
  "KUMKI STUD":             { rate: 7,   minWastage: 9  },
  "BOMMI STUD":             { rate: 7,   minWastage: 9  },
  "STONE STUD":             { rate: 7,   minWastage: 16 },
  "ANTIQUE STUD":           { rate: 7,   minWastage: 11 },
  "ANTIQUE JIMIKKI":        { rate: 7,   minWastage: 11 },
  "THALI":                  { rate: 7,   minWastage: 11 },
  "MANI":                   { rate: 7,   minWastage: 11 },
  "PAVALA MANI":            { rate: 7,   minWastage: 11 },
  "LAKSHMI KASU":           { rate: 7,   minWastage: 11 },
  "MANGA KASU":             { rate: 7,   minWastage: 11 },
  "PLAIN THAYATTU":         { rate: 7,   minWastage: 11 },
  "ROUND THAYATTU":         { rate: 7,   minWastage: 11 },
  "SIDE STUD":              { rate: 10,  minWastage: 1  },
  "75K SIDE STUD":          { rate: 10,  minWastage: 1  },
  "DIAMOND BESARI":         { rate: 100, minWastage: 1  },
  "DIAMOND STUD":           { rate: 200, minWastage: 1  },
  "DIAMOND RING":           { rate: 200, minWastage: 1  },
  "SB":                     { rate: 0,   minWastage: 1  },
  "PURE SILVER":            { rate: 0,   minWastage: 1  },
  "PURE GOLD":              { rate: 0,   minWastage: 0  },
  "S":                      { rate: 0.5, minWastage: 1  },
  "92.5-S":                 { rate: 5,   minWastage: 1  },
  "92.5-L":                 { rate: 3,   minWastage: 1  },
  "GOLD KOLUSU":            { rate: 3,   minWastage: 7  },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CalcRow {
  idx: number;
  date: string;
  product: string;
  wastage: number;
  netWt: number;
  sp1: string;
  sp2: string;
  rate: number;
  minWastage: number;
  eligible: boolean;
  totalIncentive: number;
  sp1Share: number;   // 0–100, editable per row
  unknown: boolean;
}

// ─── Parse helpers ─────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  if (!s) return 0;
  const m = (s + "").match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function parseErp(raw: string): CalcRow[] {
  const lines = raw.split("\n").map(l => l.trimEnd());
  const headerIdx = lines.findIndex(l =>
    /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l)
  );
  if (headerIdx < 0) return [];

  const rows: CalcRow[] = [];
  lines.slice(headerIdx + 1).forEach((line, i) => {
    if (!line.trim()) return;
    const c = line.split("\t");
    // Date | Product | Group | Wastage | MC | SP1 | SP2 | Balance | NetWt | Customer
    const date    = (c[0] ?? "").trim();
    const product = (c[1] ?? "").trim().toUpperCase();
    const wastage = parseNum(c[3] ?? "");
    const sp1     = (c[5] ?? "").trim();
    const sp2     = (c[6] ?? "").trim();
    const netWt   = parseNum(c[8] ?? "");

    if (!product || netWt <= 0) return;

    const master = MASTER[product];
    const rate       = master?.rate ?? 0;
    const minWastage = master?.minWastage ?? 0;
    const eligible   = !!master && wastage >= minWastage;
    const totalIncentive = eligible ? parseFloat((rate * netWt).toFixed(2)) : 0;

    rows.push({
      idx: i,
      date,
      product,
      wastage,
      netWt,
      sp1,
      sp2,
      rate,
      minWastage,
      eligible,
      totalIncentive,
      sp1Share: 70,
      unknown: !master,
    });
  });
  return rows;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function IncentiveCalcPage() {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<CalcRow[] | null>(null);
  const [splits, setSplits] = useState<Record<number, number>>({});
  const [editSplitIdx, setEditSplitIdx] = useState<number | null>(null);
  const [editSplitVal, setEditSplitVal] = useState(70);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);

  function parse() {
    const rows = parseErp(raw);
    setParsed(rows);
    setSplits({});
    setEditSplitIdx(null);
    // Auto-expand all staff
    const names = new Set<string>();
    rows.forEach(r => { if (r.sp1) names.add(r.sp1); if (r.sp2) names.add(r.sp2); });
    setExpandedStaff(names);
  }

  function clear() {
    setRaw(""); setParsed(null); setSplits({}); setEditSplitIdx(null);
  }

  // Effective split for a row
  function sp1ShareFor(row: CalcRow) {
    return splits[row.idx] ?? row.sp1Share;
  }

  function sp1Inc(row: CalcRow) {
    if (!row.sp2) return row.totalIncentive;
    return parseFloat((row.totalIncentive * sp1ShareFor(row) / 100).toFixed(2));
  }
  function sp2Inc(row: CalcRow) {
    if (!row.sp2) return 0;
    return parseFloat((row.totalIncentive * (100 - sp1ShareFor(row)) / 100).toFixed(2));
  }

  // Per-staff totals
  const staffMap = useMemo(() => {
    if (!parsed) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const row of parsed) {
      if (row.sp1) m.set(row.sp1, (m.get(row.sp1) ?? 0) + sp1Inc(row));
      if (row.sp2) m.set(row.sp2, (m.get(row.sp2) ?? 0) + sp2Inc(row));
    }
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, splits]);

  const unknownProducts = useMemo(() => {
    if (!parsed) return [];
    return [...new Set(parsed.filter(r => r.unknown).map(r => r.product))].sort();
  }, [parsed]);

  const staffList = useMemo(() =>
    [...staffMap.entries()].sort((a, b) => b[1] - a[1]),
  [staffMap]);

  const grandTotal = useMemo(() =>
    staffList.reduce((s, [, v]) => s + v, 0),
  [staffList]);

  function toggleStaff(name: string) {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function rowsForStaff(name: string) {
    return (parsed ?? []).filter(r => r.sp1 === name || r.sp2 === name);
  }

  function startEditSplit(row: CalcRow) {
    setEditSplitIdx(row.idx);
    setEditSplitVal(sp1ShareFor(row));
  }

  function saveSplit(row: CalcRow) {
    const v = Math.max(0, Math.min(100, editSplitVal));
    setSplits(prev => ({ ...prev, [row.idx]: v }));
    setEditSplitIdx(null);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/staff-incentives" className="text-xs text-gold hover:underline">← Staff Incentives</Link>
          <h1 className="text-xl font-bold text-ink">Incentive Calculator</h1>
        </div>
        {parsed && (
          <div className="text-sm text-ink-dim">
            {parsed.length} rows · {staffList.length} staff ·{" "}
            <span className="font-semibold text-gold">{inr(grandTotal)} total</span>
          </div>
        )}
      </div>

      {/* Paste area */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
        <p className="text-xs text-ink-dim font-medium uppercase tracking-wide">
          Paste ERP Export (include header row)
        </p>
        <textarea
          ref={textRef}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          rows={6}
          placeholder={"Date\tProduct\tProduct Group Name\tWastage\tMC\tSales Person 1\tSales Person 2\tBalance\tNet Wt\tCustomer Name\n01/05/2026\tFANCY BANGLES\t..."}
          className="w-full border border-line rounded-lg2 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gold resize-y"
        />
        <div className="flex gap-2">
          <button onClick={parse} disabled={!raw.trim()}
            className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-40">
            Calculate
          </button>
          {parsed && (
            <button onClick={clear}
              className="border border-line text-sm px-5 py-2 rounded-lg2 hover:border-err hover:text-err">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Unknown products warning */}
      {unknownProducts.length > 0 && (
        <div className="bg-warn/5 border border-warn/30 rounded-xl px-4 py-3 text-sm">
          <p className="font-medium text-warn mb-1">Products not found in master table (rate = 0):</p>
          <p className="text-ink-dim text-xs">{unknownProducts.join(" · ")}</p>
        </div>
      )}

      {/* Staff summary cards */}
      {staffList.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {staffList.map(([name, total]) => (
            <button key={name}
              onClick={() => toggleStaff(name)}
              className={`rounded-xl border p-3 text-left transition-colors shadow-soft ${
                expandedStaff.has(name)
                  ? "border-gold/50 bg-gold/5"
                  : "border-line bg-white hover:border-gold/30"
              }`}>
              <p className="text-xs text-ink-dim truncate">{name}</p>
              <p className="text-base font-bold text-gold mt-0.5">{inr(total)}</p>
              <p className="text-[10px] text-ink-dim mt-0.5">
                {rowsForStaff(name).length} items ·{" "}
                {expandedStaff.has(name) ? "collapse ▲" : "details ▼"}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Per-staff detail tables */}
      {parsed && staffList.map(([name]) => {
        if (!expandedStaff.has(name)) return null;
        const rows = rowsForStaff(name);
        const myTotal = staffMap.get(name) ?? 0;

        return (
          <div key={name} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-canvas">
              <span className="font-semibold text-sm">{name}</span>
              <span className="text-sm font-bold text-gold">{inr(myTotal)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 700 }}>
                <thead>
                  <tr className="text-ink-dim border-b border-line">
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-right px-2 py-2">Wastage</th>
                    <th className="text-right px-2 py-2">Min%</th>
                    <th className="text-right px-2 py-2">Net Wt</th>
                    <th className="text-right px-2 py-2">Rate</th>
                    <th className="text-right px-2 py-2">Total Inc.</th>
                    <th className="text-left px-2 py-2">SP2</th>
                    <th className="text-center px-2 py-2">Split%</th>
                    <th className="text-right px-3 py-2 text-ok">My Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const isSp1 = row.sp1 === name;
                    const myShare = isSp1 ? sp1Inc(row) : sp2Inc(row);
                    const splitVal = sp1ShareFor(row);
                    const isEditing = editSplitIdx === row.idx;
                    const customSplit = splits[row.idx] !== undefined;

                    return (
                      <tr key={row.idx}
                        className={`border-b border-line last:border-0 ${
                          !row.eligible ? "opacity-50" :
                          row.unknown ? "bg-warn/5" : "hover:bg-canvas/50"
                        }`}>
                        <td className="px-3 py-1.5 text-ink-dim whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-1.5 font-medium">
                          {row.product}
                          {row.unknown && <span className="ml-1 text-warn text-[10px]">?</span>}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${row.eligible ? "text-ok" : "text-err"}`}>
                          {row.wastage > 0 ? `${row.wastage}%` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-ink-dim">{row.minWastage > 0 ? `${row.minWastage}%` : "—"}</td>
                        <td className="px-2 py-1.5 text-right">{row.netWt.toFixed(3)}g</td>
                        <td className="px-2 py-1.5 text-right text-ink-dim">
                          {row.rate > 0 ? `₹${row.rate}/g` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {row.totalIncentive > 0 ? inr(row.totalIncentive) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-ink-dim truncate max-w-[80px]">
                          {row.sp2 || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {row.sp2 ? (
                            isEditing ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="number" min={0} max={100} step={5}
                                  value={editSplitVal}
                                  onChange={e => setEditSplitVal(Number(e.target.value))}
                                  onFocus={e => e.target.select()}
                                  className="w-14 border border-gold rounded px-1 py-0.5 text-center text-xs focus:outline-none"
                                  autoFocus
                                />
                                <button onClick={() => saveSplit(row)} className="text-ok text-[10px] hover:underline">✓</button>
                                <button onClick={() => setEditSplitIdx(null)} className="text-err text-[10px] hover:underline">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => startEditSplit(row)}
                                className={`text-[11px] px-1.5 py-0.5 rounded hover:bg-canvas ${customSplit ? "text-info font-bold" : "text-ink-dim"}`}>
                                {isSp1 ? `${splitVal}/` : ""}{!isSp1 ? `/${100 - splitVal}` : ""}
                                {isSp1 ? `${100 - splitVal}` : ""} ✎
                              </button>
                            )
                          ) : (
                            <span className="text-ink-dim">100</span>
                          )}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-mono font-semibold ${myShare > 0 ? "text-ok" : "text-ink-dim"}`}>
                          {myShare > 0 ? inr(myShare) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-canvas border-t-2 border-line">
                    <td colSpan={9} className="px-3 py-2 text-xs text-ink-dim font-medium text-right">
                      Total for {name}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-ok">{inr(myTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Grand total */}
      {staffList.length > 1 && (
        <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-sm">Grand Total — All Staff</span>
          <span className="text-lg font-bold text-gold">{inr(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}
