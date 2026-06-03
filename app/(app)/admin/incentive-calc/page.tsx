"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { inr } from "@/lib/format";
import { clsx } from "clsx";

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
  balance: number;
  sp1: string;
  sp2: string;
  rate: number;
  minWastage: number;
  unknown: boolean;
}

interface RowOverride {
  balanceZero?: boolean;
  minWastage?: number;
  sp1Share?: number;
  wastage?: number;
}

function parseNum(s: string): number {
  const m = (s ?? "").match(/[-\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function parseErp(raw: string): CalcRow[] {
  const lines = raw.split("\n").map(l => l.trimEnd());
  const hi = lines.findIndex(l =>
    /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l)
  );
  if (hi < 0) return [];
  const rows: CalcRow[] = [];
  lines.slice(hi + 1).forEach((line, i) => {
    if (!line.trim()) return;
    const c = line.split("\t");
    const product = (c[1] ?? "").trim().toUpperCase();
    const netWt   = parseNum(c[8] ?? "");
    if (!product || netWt <= 0) return;
    const master  = MASTER[product];
    const balance = Math.max(0, parseNum(c[7] ?? ""));
    rows.push({
      idx:        i,
      date:       (c[0] ?? "").trim(),
      product,
      wastage:    parseNum(c[3] ?? ""),
      netWt,
      balance,
      sp1:        (c[5] ?? "").trim(),
      sp2:        (c[6] ?? "").trim(),
      rate:       master?.rate ?? 0,
      minWastage: master?.minWastage ?? 0,
      unknown:    !master,
    });
  });
  return rows;
}

// ─── Effective calculation ────────────────────────────────────────────────────

function calc(row: CalcRow, ov: RowOverride | undefined, defaultSplit: number) {
  const wastage    = ov?.wastage    ?? row.wastage;
  const minWastage = ov?.minWastage ?? row.minWastage;
  const balance    = ov?.balanceZero ? 0 : row.balance;
  const sp1Share   = ov?.sp1Share   ?? defaultSplit;
  const eligible   = !row.unknown && row.rate > 0 && wastage >= minWastage && balance <= 0;
  const totalInc   = eligible ? parseFloat((row.rate * row.netWt).toFixed(2)) : 0;
  const sp1Inc     = row.sp2 ? parseFloat((totalInc * sp1Share / 100).toFixed(2)) : totalInc;
  const sp2Inc     = row.sp2 ? parseFloat((totalInc * (100 - sp1Share) / 100).toFixed(2)) : 0;
  return { wastage, minWastage, balance, sp1Share, eligible, totalInc, sp1Inc, sp2Inc };
}

// ─── Inline cell editor ───────────────────────────────────────────────────────

function EditCell({
  value, onSave, type = "number", width = 64,
}: {
  value: number; onSave: (v: number) => void; type?: string; width?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          autoFocus type={type} value={draft}
          onChange={e => setDraft(e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => {
            if (e.key === "Enter") { onSave(parseFloat(draft) || 0); setEditing(false); }
            if (e.key === "Escape") setEditing(false);
          }}
          style={{ width }}
          className="border border-gold rounded px-1 py-0.5 text-xs focus:outline-none text-center"
        />
        <button onClick={() => { onSave(parseFloat(draft) || 0); setEditing(false); }}
          className="text-ok text-[10px]">✓</button>
        <button onClick={() => setEditing(false)} className="text-err text-[10px]">✕</button>
      </span>
    );
  }
  return (
    <button onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="underline decoration-dashed text-ink hover:text-gold">
      {value}
    </button>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type ViewTab = "data" | "staff";

export default function IncentiveCalcPage() {
  const [raw, setRaw]           = useState("");
  const [rows, setRows]         = useState<CalcRow[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({});
  const [tab, setTab]           = useState<ViewTab>("data");
  const [filterStaff, setFilterStaff] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<"all" | "eligible" | "balance" | "lowwaste" | "unknown">("all");
  const [defaultSplit, setDefaultSplit] = useState(70);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

  function parse() {
    const r = parseErp(raw);
    setRows(r);
    setOverrides({});
    setFilterStaff("ALL");
    setFilterStatus("all");
    setTab("data");
    const names = new Set<string>();
    r.forEach(x => { if (x.sp1) names.add(x.sp1); if (x.sp2) names.add(x.sp2); });
    setExpandedStaff(names);
  }

  function setOv(idx: number, patch: Partial<RowOverride>) {
    setOverrides(prev => ({ ...prev, [idx]: { ...prev[idx], ...patch } }));
  }

  const allStaff = useMemo(() => {
    const s = new Set<string>();
    (rows ?? []).forEach(r => { if (r.sp1) s.add(r.sp1); if (r.sp2) s.add(r.sp2); });
    return [...s].sort();
  }, [rows]);

  // Computed rows with effective values
  const computed = useMemo(() =>
    (rows ?? []).map(r => ({ row: r, eff: calc(r, overrides[r.idx], defaultSplit) })),
  [rows, overrides, defaultSplit]);

  // Per-staff totals
  const staffTotals = useMemo(() => {
    const m = new Map<string, number>();
    computed.forEach(({ row, eff }) => {
      if (row.sp1) m.set(row.sp1, (m.get(row.sp1) ?? 0) + eff.sp1Inc);
      if (row.sp2) m.set(row.sp2, (m.get(row.sp2) ?? 0) + eff.sp2Inc);
    });
    return m;
  }, [computed]);

  const grandTotal = useMemo(() =>
    [...staffTotals.values()].reduce((s, v) => s + v, 0),
  [staffTotals]);

  const unknownProducts = useMemo(() =>
    [...new Set((rows ?? []).filter(r => r.unknown).map(r => r.product))].sort(),
  [rows]);

  // Filtered rows for data tab
  const filteredRows = useMemo(() => {
    return computed.filter(({ row, eff }) => {
      if (filterStaff !== "ALL" && row.sp1 !== filterStaff && row.sp2 !== filterStaff) return false;
      if (filterStatus === "eligible" && !eff.eligible) return false;
      if (filterStatus === "balance" && eff.balance <= 0) return false;
      if (filterStatus === "lowwaste" && (eff.balance > 0 || eff.eligible || row.unknown)) return false;
      if (filterStatus === "unknown" && !row.unknown) return false;
      return true;
    });
  }, [computed, filterStaff, filterStatus]);

  const balanceCount  = computed.filter(({ eff }) => eff.balance > 0).length;
  const lowWasteCount = computed.filter(({ row, eff }) => !row.unknown && eff.balance <= 0 && !eff.eligible).length;
  const unknownCount  = computed.filter(({ row }) => row.unknown).length;

  const inp = "border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/staff-incentives" className="text-xs text-gold hover:underline">← Staff Incentives</Link>
          <h1 className="text-xl font-bold text-ink">Incentive Calculator</h1>
        </div>
        {rows && (
          <span className="text-sm text-ink-dim">
            {rows.length} rows · <span className="font-semibold text-gold">{inr(grandTotal)}</span> total
          </span>
        )}
      </div>

      {/* Paste + settings */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Paste ERP Export (include header row)</p>
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            <span>Default SP1/SP2 split:</span>
            <input type="number" min={0} max={100} value={defaultSplit}
              onChange={e => setDefaultSplit(Number(e.target.value))}
              className={`${inp} w-14 text-center`} />
            <span>/ {100 - defaultSplit}</span>
          </div>
        </div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={5}
          placeholder={"Date\tProduct\tProduct Group Name\tWastage\tMC\tSales Person 1\tSales Person 2\tBalance\tNet Wt\tCustomer Name\n01/05/2026\tFANCY BANGLES\t..."}
          className="w-full border border-line rounded-lg2 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gold resize-y"
        />
        <div className="flex gap-2">
          <button onClick={parse} disabled={!raw.trim()}
            className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-40">
            Calculate
          </button>
          {rows && (
            <button onClick={() => { setRows(null); setRaw(""); setOverrides({}); }}
              className="border border-line text-sm px-4 py-2 rounded-lg2 hover:border-err hover:text-err">
              Clear
            </button>
          )}
        </div>
      </div>

      {!rows && (
        <div className="bg-canvas rounded-xl border border-line px-6 py-10 text-center text-ink-dim text-sm">
          Paste ERP export above and click Calculate to see incentives.
        </div>
      )}

      {rows && <>
        {/* Unknown products warning */}
        {unknownProducts.length > 0 && (
          <div className="bg-warn/5 border border-warn/30 rounded-xl px-4 py-3 text-xs">
            <span className="font-semibold text-warn">Products not in master table (rate = 0): </span>
            <span className="text-ink-dim">{unknownProducts.join(" · ")}</span>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-2 border-b border-line">
          {(["data", "staff"] as ViewTab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx("px-4 py-1.5 text-sm rounded-t-lg2 -mb-px border border-b-0 transition-colors", {
                "bg-white border-line text-ink font-medium": tab === t,
                "border-transparent text-ink-dim hover:text-ink": tab !== t,
              })}>
              {t === "data" ? `Edit Data (${rows.length})` : `By Staff (${staffTotals.size})`}
            </button>
          ))}
        </div>

        {/* ── DATA TAB ── */}
        {tab === "data" && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 bg-white border border-line rounded-xl px-4 py-2.5 shadow-soft text-xs">
              <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)} className={inp}>
                <option value="ALL">All Staff</option>
                {allStaff.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex gap-1">
                {([
                  { val: "all",      label: "All" },
                  { val: "eligible", label: "Eligible" },
                  { val: "balance",  label: `Has Balance (${balanceCount})` },
                  { val: "lowwaste", label: `Low Wastage (${lowWasteCount})` },
                  { val: "unknown",  label: `Unknown (${unknownCount})` },
                ] as { val: typeof filterStatus; label: string }[]).map(opt => (
                  <button key={opt.val} onClick={() => setFilterStatus(opt.val)}
                    className={clsx("px-2.5 py-1 rounded-lg2 transition-colors", {
                      "bg-gold text-white": filterStatus === opt.val,
                      "border border-line text-ink-dim hover:border-gold": filterStatus !== opt.val,
                    })}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-ink-dim">{filteredRows.length} rows shown</span>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="text-ink-dim border-b border-line bg-canvas">
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-right px-2 py-2">Waste%</th>
                    <th className="text-right px-2 py-2 text-gold" title="Click value to edit">Min%↓</th>
                    <th className="text-right px-2 py-2">Net Wt</th>
                    <th className="text-center px-2 py-2">Balance</th>
                    <th className="text-left px-2 py-2">SP1</th>
                    <th className="text-left px-2 py-2">SP2</th>
                    <th className="text-center px-2 py-2 text-gold" title="Click to edit">Split%↓</th>
                    <th className="text-center px-2 py-2">Ok?</th>
                    <th className="text-right px-3 py-2">Total Inc</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-ink-dim">No rows match filter</td></tr>
                  )}
                  {filteredRows.map(({ row, eff }) => {
                    const ov = overrides[row.idx];
                    const minChanged = ov?.minWastage !== undefined;
                    const splitChanged = ov?.sp1Share !== undefined;

                    return (
                      <tr key={row.idx}
                        className={clsx("border-b border-line last:border-0", {
                          "bg-err/5":    eff.balance > 0,
                          "bg-warn/5":   !eff.eligible && eff.balance <= 0 && !row.unknown,
                          "bg-canvas/30": eff.eligible,
                          "opacity-60":  row.unknown,
                        })}>
                        <td className="px-3 py-1.5 text-ink-dim whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-1.5 font-medium">
                          {row.product}
                          {row.unknown && <span className="ml-1 text-[10px] text-warn">?</span>}
                        </td>

                        {/* Wastage */}
                        <td className={clsx("px-2 py-1.5 text-right", {
                          "text-ok": eff.eligible,
                          "text-err": !eff.eligible && eff.balance <= 0,
                          "text-ink-dim": eff.balance > 0,
                        })}>
                          {eff.wastage > 0 ? `${eff.wastage}%` : "—"}
                        </td>

                        {/* Min wastage — editable */}
                        <td className="px-2 py-1.5 text-right">
                          <span className={minChanged ? "text-info font-bold" : "text-ink-dim"}>
                            <EditCell
                              value={eff.minWastage}
                              onSave={v => setOv(row.idx, { minWastage: v })}
                            />%
                          </span>
                        </td>

                        <td className="px-2 py-1.5 text-right">{row.netWt.toFixed(3)}g</td>

                        {/* Balance */}
                        <td className="px-2 py-1.5 text-center">
                          {eff.balance > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-err font-medium">{inr(eff.balance)}</span>
                              <button
                                onClick={() => setOv(row.idx, { balanceZero: !ov?.balanceZero })}
                                title="Mark as paid — include in incentive"
                                className="text-[10px] bg-ok/10 text-ok border border-ok/30 px-1.5 py-0.5 rounded hover:bg-ok/20">
                                Mark paid
                              </button>
                            </span>
                          ) : ov?.balanceZero ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-ok text-[10px]">Paid ✓</span>
                              <button onClick={() => setOv(row.idx, { balanceZero: false })}
                                className="text-[10px] text-ink-dim hover:text-err">undo</button>
                            </span>
                          ) : (
                            <span className="text-ok text-[10px]">—</span>
                          )}
                        </td>

                        <td className="px-2 py-1.5 text-ink-dim truncate max-w-[80px]">{row.sp1 || "—"}</td>
                        <td className="px-2 py-1.5 text-ink-dim truncate max-w-[80px]">{row.sp2 || "—"}</td>

                        {/* Split — editable */}
                        <td className="px-2 py-1.5 text-center">
                          {row.sp2 ? (
                            <span className={splitChanged ? "text-info font-bold" : "text-ink-dim"}>
                              <EditCell
                                value={eff.sp1Share}
                                onSave={v => setOv(row.idx, { sp1Share: Math.min(100, Math.max(0, v)) })}
                              />/{100 - eff.sp1Share}
                            </span>
                          ) : <span className="text-ink-dim">—</span>}
                        </td>

                        {/* Eligible badge */}
                        <td className="px-2 py-1.5 text-center">
                          {eff.eligible
                            ? <span className="text-ok font-bold">✓</span>
                            : eff.balance > 0
                              ? <span className="text-err text-[10px] font-medium">Balance</span>
                              : row.unknown
                                ? <span className="text-warn text-[10px]">Unknown</span>
                                : <span className="text-err text-[10px]">Low%</span>}
                        </td>

                        <td className={clsx("px-3 py-1.5 text-right font-mono font-semibold", {
                          "text-ok": eff.totalInc > 0,
                          "text-ink-dim": eff.totalInc === 0,
                        })}>
                          {eff.totalInc > 0 ? inr(eff.totalInc) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-canvas border-t-2 border-line font-semibold">
                      <td colSpan={10} className="px-3 py-2 text-right text-ink-dim text-xs">
                        Visible total ({filteredRows.length} rows)
                      </td>
                      <td className="px-3 py-2 text-right text-ok font-mono">
                        {inr(filteredRows.reduce((s, { eff }) => s + eff.totalInc, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── BY STAFF TAB ── */}
        {tab === "staff" && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...staffTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => (
                <button key={name} onClick={() => setExpandedStaff(prev => {
                  const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n;
                })}
                  className={clsx("rounded-xl border p-3 text-left shadow-soft transition-colors", {
                    "border-gold/50 bg-gold/5": expandedStaff.has(name),
                    "border-line bg-white hover:border-gold/30": !expandedStaff.has(name),
                  })}>
                  <p className="text-xs text-ink-dim truncate">{name}</p>
                  <p className="text-base font-bold text-gold">{inr(total)}</p>
                  <p className="text-[10px] text-ink-dim mt-0.5">
                    {computed.filter(({ row }) => row.sp1 === name || row.sp2 === name).length} sales ·{" "}
                    {expandedStaff.has(name) ? "▲" : "▼"}
                  </p>
                </button>
              ))}
            </div>

            {/* Per-staff detail */}
            {[...staffTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => {
              if (!expandedStaff.has(name)) return null;
              const staffRows = computed.filter(({ row }) => row.sp1 === name || row.sp2 === name);
              return (
                <div key={name} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-canvas">
                    <span className="font-semibold text-sm">{name}</span>
                    <span className="text-sm font-bold text-gold">{inr(total)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 620 }}>
                      <thead>
                        <tr className="text-ink-dim border-b border-line">
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Product</th>
                          <th className="text-right px-2 py-2">Waste / Min%</th>
                          <th className="text-right px-2 py-2">Net Wt</th>
                          <th className="text-center px-2 py-2">Balance</th>
                          <th className="text-left px-2 py-2">Partner</th>
                          <th className="text-center px-2 py-2">Split</th>
                          <th className="text-right px-3 py-2 text-ok">My Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffRows.map(({ row, eff }) => {
                          const isSp1    = row.sp1 === name;
                          const myShare  = isSp1 ? eff.sp1Inc : eff.sp2Inc;
                          const partner  = isSp1 ? row.sp2 : row.sp1;
                          const splitLabel = isSp1
                            ? `${eff.sp1Share}%`
                            : `${100 - eff.sp1Share}%`;

                          return (
                            <tr key={row.idx}
                              className={clsx("border-b border-line last:border-0", {
                                "opacity-40":   !eff.eligible,
                                "hover:bg-canvas/50": eff.eligible,
                              })}>
                              <td className="px-3 py-1.5 text-ink-dim whitespace-nowrap">{row.date}</td>
                              <td className="px-3 py-1.5 font-medium">{row.product}</td>
                              <td className={clsx("px-2 py-1.5 text-right", eff.eligible ? "text-ok" : "text-err")}>
                                {eff.wastage > 0 ? `${eff.wastage}%` : "—"} / {eff.minWastage}%
                              </td>
                              <td className="px-2 py-1.5 text-right">{row.netWt.toFixed(3)}g</td>
                              <td className="px-2 py-1.5 text-center">
                                {eff.balance > 0
                                  ? <span className="text-err">{inr(eff.balance)}</span>
                                  : <span className="text-ok text-[10px]">Paid</span>}
                              </td>
                              <td className="px-2 py-1.5 text-ink-dim">{partner || "—"}</td>
                              <td className="px-2 py-1.5 text-center text-ink-dim">{row.sp2 ? splitLabel : "—"}</td>
                              <td className={clsx("px-3 py-1.5 text-right font-mono font-semibold",
                                myShare > 0 ? "text-ok" : "text-ink-dim")}>
                                {myShare > 0 ? inr(myShare) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-canvas border-t-2 border-line">
                          <td colSpan={7} className="px-3 py-2 text-right text-ink-dim font-medium">Total</td>
                          <td className="px-3 py-2 text-right font-bold text-ok">{inr(total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {staffTotals.size > 1 && (
              <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-sm">Grand Total — All Staff</span>
                <span className="text-lg font-bold text-gold">{inr(grandTotal)}</span>
              </div>
            )}
          </div>
        )}
      </>}
    </div>
  );
}
