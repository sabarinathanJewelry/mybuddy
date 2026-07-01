"use client";

import { useState, useRef, KeyboardEvent, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { grams, shortDate } from "@/lib/format";
import { clsx } from "clsx";

const PRESET_CATEGORIES = [
  "75KDM", "Bangle", "Bracelet", "Chain", "Diamond", "Dollar",
  "Gold Kolusu", "Malaim", "Necklace", "Ring", "Stud", "Thali",
];

type StockType = "vault" | "outer";

interface StockEntry {
  id: string;
  entry_date: string;
  stock_type: StockType;
  category: string;
  total_weight_g: number;
  qty: number | null;
  notes: string | null;
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function useStockEntries(date: string) {
  return useQuery<StockEntry[]>({
    queryKey: ["gold_stock", date],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("gold_stock_entries")
        .select("*")
        .eq("entry_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useStockPeriod(fromDate: string, toDate: string, enabled: boolean) {
  return useQuery<StockEntry[]>({
    queryKey: ["gold_stock_period", fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("gold_stock_entries")
        .select("*")
        .in("entry_date", [fromDate, toDate]);
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });
}

function useUpsertStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { entry_date: string; stock_type: StockType; category: string; total_weight_g: number; qty: number | null; notes: string }) => {
      const { error } = await supabase().from("gold_stock_entries").upsert(
        { ...d, updated_at: new Date().toISOString() },
        { onConflict: "entry_date,stock_type,category" }
      );
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["gold_stock", v.entry_date] }),
  });
}

function useDeleteStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase().from("gold_stock_entries").delete().eq("id", id);
      if (error) throw error;
      return date;
    },
    onSuccess: (date) => qc.invalidateQueries({ queryKey: ["gold_stock", date] }),
  });
}

// ── Period Report ────────────────────────────────────────────────────────────

function PeriodReport({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [reportType, setReportType] = useState<StockType>("vault");
  const enabled = fromDate !== toDate && !!fromDate && !!toDate;
  const { data: rows = [], isLoading } = useStockPeriod(fromDate, toDate, enabled);

  const openingMap = useMemo(() => {
    const m = new Map<string, StockEntry>();
    rows.filter(r => r.entry_date === fromDate && r.stock_type === reportType)
        .forEach(r => m.set(r.category, r));
    return m;
  }, [rows, fromDate, reportType]);

  const closingMap = useMemo(() => {
    const m = new Map<string, StockEntry>();
    rows.filter(r => r.entry_date === toDate && r.stock_type === reportType)
        .forEach(r => m.set(r.category, r));
    return m;
  }, [rows, toDate, reportType]);

  const allCats = useMemo(() => {
    const cats = new Set([...openingMap.keys(), ...closingMap.keys()]);
    const ordered = PRESET_CATEGORIES.filter(c => cats.has(c));
    cats.forEach(c => { if (!PRESET_CATEGORIES.includes(c)) ordered.push(c); });
    return ordered;
  }, [openingMap, closingMap]);

  if (!enabled) return null;
  if (isLoading) return <div className="text-xs text-ink-dim py-4 text-center">Loading period data…</div>;

  const openTotal = allCats.reduce((s, c) => s + Number(openingMap.get(c)?.total_weight_g ?? 0), 0);
  const closeTotal = allCats.reduce((s, c) => s + Number(closingMap.get(c)?.total_weight_g ?? 0), 0);
  const soldTotal = openTotal - closeTotal;

  return (
    <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line bg-canvas flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-xs font-semibold text-ink uppercase tracking-wide">Period Report</span>
          <span className="ml-2 text-xs text-ink-dim">{shortDate(fromDate)} → {shortDate(toDate)}</span>
        </div>
        <div className="flex border border-line rounded-lg2 overflow-hidden text-xs font-medium">
          {(["vault", "outer"] as StockType[]).map(t => (
            <button key={t} onClick={() => setReportType(t)}
              className={clsx("px-3 py-1 capitalize", reportType === t ? "bg-gold text-white" : "text-ink-dim hover:text-ink")}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {allCats.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-dim text-center">No {reportType} stock entries found for these dates.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-dim border-b border-line bg-canvas/50">
              <th className="text-left px-4 py-2">Category</th>
              <th className="text-right px-3 py-2">Opening<br /><span className="font-normal text-ink-dim/70">{shortDate(fromDate)}</span></th>
              <th className="text-right px-3 py-2">Closing<br /><span className="font-normal text-ink-dim/70">{shortDate(toDate)}</span></th>
              <th className="text-right px-4 py-2">Sold</th>
            </tr>
          </thead>
          <tbody>
            {allCats.map(cat => {
              const op = openingMap.get(cat);
              const cl = closingMap.get(cat);
              const opWt = Number(op?.total_weight_g ?? 0);
              const clWt = Number(cl?.total_weight_g ?? 0);
              const soldWt = opWt - clWt;
              const opQty = op?.qty ?? null;
              const clQty = cl?.qty ?? null;
              const soldQty = (opQty != null && clQty != null) ? opQty - clQty : null;
              const isTagged = op?.qty != null || cl?.qty != null;
              return (
                <tr key={cat} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {cat}
                    {isTagged && <span className="ml-1.5 text-[10px] text-info font-normal">tagged</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-ink-dim">{opWt > 0 ? grams(opWt) : "—"}</span>
                    {opQty != null && <span className="block text-[11px] text-ink-dim/60">{opQty}pc</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-mono text-ink-dim">{clWt > 0 ? grams(clWt) : "—"}</span>
                    {clQty != null && <span className="block text-[11px] text-ink-dim/60">{clQty}pc</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {soldWt === 0 ? (
                      <span className="text-ink-dim/50 font-mono text-xs">—</span>
                    ) : soldWt > 0 ? (
                      <span className="font-mono font-semibold text-warn">
                        -{grams(soldWt)}
                        {soldQty != null && soldQty !== 0 && <span className="block text-[11px]">{soldQty}pc</span>}
                      </span>
                    ) : (
                      <span className="font-mono font-semibold text-ok">
                        +{grams(Math.abs(soldWt))}
                        {soldQty != null && soldQty !== 0 && <span className="block text-[11px]">{Math.abs(soldQty)}pc</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-canvas/60 font-semibold text-xs">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{grams(openTotal)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{grams(closeTotal)}</td>
              <td className="px-4 py-2.5 text-right font-mono">
                {soldTotal > 0
                  ? <span className="text-warn">-{grams(soldTotal)}</span>
                  : soldTotal < 0
                  ? <span className="text-ok">+{grams(Math.abs(soldTotal))}</span>
                  : <span className="text-ink-dim/50">—</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function GoldStockPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [stockType, setStockType] = useState<StockType>("vault");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [weights, setWeights] = useState<number[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [qty, setQty] = useState<string>("");
  const [notes, setNotes] = useState("");
  const weightRef = useRef<HTMLInputElement>(null);

  // Sold mode — reduce existing stock by entered amount
  const [soldMode, setSoldMode] = useState(false);
  const [soldWeightInput, setSoldWeightInput] = useState("");
  const [soldQtyInput, setSoldQtyInput] = useState("");

  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCatInput, setCustomCatInput] = useState("");
  const customRef = useRef<HTMLInputElement>(null);

  // Period report state
  const [showPeriod, setShowPeriod] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState(today);

  const { data: entries = [] } = useStockEntries(date);
  const upsert = useUpsertStock();
  const del = useDeleteStock();

  const entriesForType = entries.filter(e => e.stock_type === stockType);
  const entryMap = new Map(entries.map(e => [`${e.stock_type}:${e.category}`, e]));

  const allCategories = useMemo(() => {
    const saved = entries.map(e => e.category);
    return Array.from(new Set([...PRESET_CATEGORIES, ...saved]));
  }, [entries]);

  const runningTotal = weights.reduce((s, w) => s + w, 0);
  const pendingW = parseFloat(weightInput) || 0;
  const effectiveTotal = runningTotal + (pendingW > 0 ? pendingW : 0);

  function selectCategory(cat: string) {
    if (activeCategory === cat) {
      setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes("");
      setSoldMode(false); setSoldWeightInput(""); setSoldQtyInput("");
      return;
    }
    setActiveCategory(cat);
    setWeightInput(""); setNotes("");
    setSoldMode(false); setSoldWeightInput(""); setSoldQtyInput("");
    const existing = entryMap.get(`${stockType}:${cat}`);
    if (existing) {
      setWeights([existing.total_weight_g]);
      setQty(existing.qty != null ? String(existing.qty) : "");
    } else {
      setWeights([]); setQty("");
    }
    setTimeout(() => weightRef.current?.focus(), 50);
  }

  async function handleReduceSold() {
    if (!activeCategory) return;
    const existing = entryMap.get(`${stockType}:${activeCategory}`);
    if (!existing) return;
    const soldWt = parseFloat(soldWeightInput) || 0;
    const soldQty = parseInt(soldQtyInput) || 0;
    if (soldWt <= 0 && soldQty <= 0) return;
    const newWt = parseFloat((Number(existing.total_weight_g) - soldWt).toFixed(3));
    const newQty = existing.qty != null ? existing.qty - soldQty : null;
    if (newWt < 0) { alert("Sold weight cannot exceed current stock weight"); return; }
    if (newQty != null && newQty < 0) { alert("Sold qty cannot exceed current stock qty"); return; }
    await upsert.mutateAsync({
      entry_date: date,
      stock_type: stockType,
      category: activeCategory,
      total_weight_g: newWt,
      qty: newQty,
      notes: existing.notes || "",
    });
    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes("");
    setSoldMode(false); setSoldWeightInput(""); setSoldQtyInput("");
  }

  function addWeight() {
    const w = parseFloat(weightInput);
    if (!w || w <= 0) return;
    setWeights(prev => [...prev, w]);
    setWeightInput("");
    weightRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addWeight(); }
  }

  async function handleSave() {
    if (!activeCategory || effectiveTotal <= 0) return;
    const finalWeights = pendingW > 0 ? [...weights, pendingW] : weights;
    const total = parseFloat(finalWeights.reduce((s, w) => s + w, 0).toFixed(3));
    const autoQty = finalWeights.length;
    await upsert.mutateAsync({
      entry_date: date,
      stock_type: stockType,
      category: activeCategory,
      total_weight_g: total,
      qty: qty ? parseInt(qty) : (autoQty > 0 ? autoQty : null),
      notes: notes.trim() || "",
    });
    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes("");
  }

  const vaultTotal = entries.filter(e => e.stock_type === "vault").reduce((s, e) => s + Number(e.total_weight_g), 0);
  const outerTotal = entries.filter(e => e.stock_type === "outer").reduce((s, e) => s + Number(e.total_weight_g), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Gold Stock</h1>
          <p className="text-xs text-ink-dim mt-0.5">Vault: {grams(vaultTotal)} &nbsp;·&nbsp; Outer: {grams(outerTotal)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPeriod(v => !v)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg2 border font-medium transition-colors",
              showPeriod ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:text-ink")}>
            Period Report
          </button>
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setActiveCategory(null); setWeights([]); }}
            className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
        </div>
      </div>

      {/* Period Report inputs */}
      {showPeriod && (
        <div className="bg-canvas border border-line rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Compare stock between two dates</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Opening date</label>
              <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)}
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
            </div>
            <div className="text-ink-dim mt-4">→</div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Closing date</label>
              <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)}
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
            </div>
          </div>
          <p className="text-[11px] text-ink-dim/60">Sold = Opening weight − Closing weight per category</p>
        </div>
      )}

      {/* Period report table */}
      {showPeriod && periodFrom && periodTo && periodFrom !== periodTo && (
        <PeriodReport fromDate={periodFrom} toDate={periodTo} />
      )}

      <hr className="border-line" />

      {/* Stock type tabs */}
      <div className="flex border border-line rounded-lg2 overflow-hidden text-sm font-medium">
        {(["vault", "outer"] as StockType[]).map(t => (
          <button key={t} onClick={() => { setStockType(t); setActiveCategory(null); setWeights([]); setWeightInput(""); }}
            className={clsx("flex-1 py-2 capitalize transition-colors", stockType === t ? "bg-gold text-white" : "text-ink-dim hover:text-ink")}>
            {t === "vault" ? "Vault Stock" : "Outer Stock"}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-ink-dim">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-info/60"></span> Tagged (with qty)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-ok/60"></span> Untagged (weight only)</span>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {allCategories.map(cat => {
          const existing = entryMap.get(`${stockType}:${cat}`);
          const isActive = activeCategory === cat;
          const isTagged = existing?.qty != null;
          const isCustom = !PRESET_CATEGORIES.includes(cat);
          return (
            <button key={cat} onClick={() => selectCategory(cat)}
              className={clsx(
                "rounded-xl border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-gold bg-gold/10 ring-1 ring-gold"
                  : existing
                    ? isTagged
                      ? "border-info/40 bg-info/5 hover:border-info"
                      : "border-ok/40 bg-ok/5 hover:border-ok"
                    : "border-line bg-white hover:border-gold"
              )}>
              <p className={clsx("text-xs font-semibold truncate",
                isActive ? "text-gold" : existing ? (isTagged ? "text-info" : "text-ok") : "text-ink")}>
                {cat}
                {isCustom && <span className="ml-1 text-[9px] text-ink-dim/60 font-normal">custom</span>}
              </p>
              {existing
                ? <p className="text-[11px] font-mono text-ink-dim mt-0.5">
                    {grams(existing.total_weight_g)}
                    {existing.qty != null ? <span className="text-info"> · {existing.qty}pc</span> : ""}
                  </p>
                : <p className="text-[11px] text-ink-dim/60 mt-0.5">—</p>
              }
            </button>
          );
        })}

        {/* Custom category tile */}
        {showCustomInput ? (
          <div className="rounded-xl border border-gold/40 bg-gold/5 px-3 py-2.5 flex flex-col gap-1.5">
            <input
              ref={customRef}
              value={customCatInput}
              onChange={e => setCustomCatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = customCatInput.trim();
                  if (name) { selectCategory(name); setShowCustomInput(false); setCustomCatInput(""); }
                }
                if (e.key === "Escape") { setShowCustomInput(false); setCustomCatInput(""); }
              }}
              placeholder="e.g. Coin"
              autoFocus
              className="text-xs border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gold w-full"
            />
            <div className="flex gap-1">
              <button
                onClick={() => {
                  const name = customCatInput.trim();
                  if (name) { selectCategory(name); setShowCustomInput(false); setCustomCatInput(""); }
                }}
                className="text-[10px] bg-gold text-white px-2 py-0.5 rounded font-medium">Add</button>
              <button onClick={() => { setShowCustomInput(false); setCustomCatInput(""); }}
                className="text-[10px] text-ink-dim px-1">✕</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setShowCustomInput(true); setTimeout(() => customRef.current?.focus(), 50); }}
            className="rounded-xl border border-dashed border-line px-3 py-2.5 text-left hover:border-gold transition-all">
            <p className="text-xs font-semibold text-ink-dim">+ Custom</p>
            <p className="text-[11px] text-ink-dim/60 mt-0.5">Coin, Bar…</p>
          </button>
        )}
      </div>

      {/* Weight entry panel */}
      {activeCategory && (
        <div className="bg-white border border-gold/30 rounded-xl p-5 shadow-soft space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-ink">{activeCategory}
              <span className="ml-2 text-xs font-normal text-ink-dim capitalize">{stockType}</span>
            </h2>
            <div className="flex items-center gap-2">
              {effectiveTotal > 0 && !soldMode && (
                <span className="text-sm font-bold text-gold font-mono">{grams(effectiveTotal)}</span>
              )}
              {entryMap.has(`${stockType}:${activeCategory}`) && (
                <button
                  onClick={() => { setSoldMode(v => !v); setSoldWeightInput(""); setSoldQtyInput(""); }}
                  className={clsx("text-xs px-3 py-1 rounded-lg2 border font-medium transition-colors",
                    soldMode ? "bg-warn/20 border-warn text-warn" : "border-line text-ink-dim hover:border-warn hover:text-warn")}>
                  {soldMode ? "Cancel Sold" : "Record Sold"}
                </button>
              )}
            </div>
          </div>

          {/* Sold mode form */}
          {soldMode && (() => {
            const existing = entryMap.get(`${stockType}:${activeCategory}`)!;
            const soldWt = parseFloat(soldWeightInput) || 0;
            const soldQty = parseInt(soldQtyInput) || 0;
            const afterWt = parseFloat((Number(existing.total_weight_g) - soldWt).toFixed(3));
            const afterQty = existing.qty != null ? existing.qty - soldQty : null;
            return (
              <div className="space-y-3">
                <div className="bg-canvas rounded-lg2 px-3 py-2 text-xs text-ink-dim">
                  Current stock: <span className="font-mono text-ink font-semibold">{grams(existing.total_weight_g)}</span>
                  {existing.qty != null && <span className="ml-2 text-info font-semibold">{existing.qty}pc</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Sold weight (g)</label>
                    <input type="number" step="0.001" min="0" value={soldWeightInput}
                      onChange={e => setSoldWeightInput(e.target.value)}
                      placeholder="e.g. 5.234"
                      autoFocus
                      className={clsx(inp, "font-mono")} />
                  </div>
                  {existing.qty != null && (
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Sold qty (pieces)</label>
                      <input type="number" step="1" min="0" value={soldQtyInput}
                        onChange={e => setSoldQtyInput(e.target.value)}
                        placeholder="e.g. 2"
                        className={inp} />
                    </div>
                  )}
                </div>
                {(soldWt > 0 || soldQty > 0) && (
                  <div className="bg-warn/5 border border-warn/30 rounded-lg2 px-3 py-2 text-xs">
                    After reduction:&nbsp;
                    <span className={clsx("font-mono font-semibold", afterWt < 0 ? "text-err" : "text-ok")}>{grams(Math.max(afterWt, 0))}</span>
                    {afterQty != null && <span className={clsx("ml-2 font-semibold", afterQty < 0 ? "text-err" : "text-info")}>{Math.max(afterQty, 0)}pc</span>}
                  </div>
                )}
                {upsert.isError && <p className="text-xs text-err">{(upsert.error as Error).message}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={upsert.isPending || (soldWt <= 0 && soldQty <= 0) || afterWt < 0 || (afterQty != null && afterQty < 0)}
                    onClick={handleReduceSold}
                    className="bg-warn text-white text-sm font-medium px-6 py-2 rounded-lg2 disabled:opacity-50 hover:opacity-90">
                    {upsert.isPending ? "Saving…" : "Apply Reduction"}
                  </button>
                  <button onClick={() => { setSoldMode(false); setSoldWeightInput(""); setSoldQtyInput(""); }}
                    className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim hover:text-ink">
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Normal entry — hidden when in sold mode */}
          {!soldMode && <>

          {/* Weight list */}
          {weights.length > 0 && (
            <div className="bg-canvas rounded-lg2 px-3 py-2 space-y-1">
              {weights.map((w, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-ink-dim">#{i + 1}</span>
                  <span className="font-mono text-ink">{w.toFixed(3)}g</span>
                  <button onClick={() => setWeights(prev => prev.filter((_, j) => j !== i))}
                    className="text-err hover:underline ml-3">×</button>
                </div>
              ))}
              <div className="border-t border-line pt-1 flex justify-between text-xs font-semibold">
                <span>Total ({weights.length} item{weights.length !== 1 ? "s" : ""})</span>
                <span className="font-mono text-gold">{grams(runningTotal)}</span>
              </div>
            </div>
          )}

          {/* Weight input */}
          <div className="flex gap-2">
            <input
              ref={weightRef}
              type="number"
              step="0.001"
              min="0"
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={e => e.target.select()}
              placeholder="Enter weight (g) then press Enter"
              className={clsx(inp, "font-mono flex-1")}
              autoFocus
            />
            <button onClick={addWeight} disabled={!weightInput || parseFloat(weightInput) <= 0}
              className="bg-gold text-white text-sm px-4 rounded-lg2 disabled:opacity-40 hover:opacity-90 shrink-0">
              + Add
            </button>
          </div>

          {/* Qty + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">
                Quantity (pieces){stockType === "outer" ? " *" : ""}
                <span className="ml-1 text-info/70 text-[10px]">= tagged items</span>
                {!qty && weights.length > 0 && (
                  <span className="ml-1 text-ink-dim/50">auto: {weights.length + (pendingW > 0 ? 1 : 0)}</span>
                )}
              </label>
              <input type="number" step="1" min="0" value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder={stockType === "outer" ? "Required" : "Leave blank = untagged"}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={inp} />
            </div>
          </div>

          {upsert.isError && <p className="text-xs text-err">{(upsert.error as Error).message}</p>}

          <div className="flex gap-2">
            <button
              disabled={upsert.isPending || effectiveTotal <= 0 || (stockType === "outer" && !qty && weights.length === 0 && pendingW <= 0)}
              onClick={handleSave}
              className="bg-gold text-white text-sm font-medium px-6 py-2 rounded-lg2 disabled:opacity-50 hover:opacity-90">
              {upsert.isPending ? "Saving…" : entryMap.has(`${stockType}:${activeCategory}`) ? "Update" : "Save"}
            </button>
            <button onClick={() => { setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); }}
              className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim hover:text-ink">
              Cancel
            </button>
            {entryMap.has(`${stockType}:${activeCategory}`) && (
              <button
                onClick={() => {
                  const e = entryMap.get(`${stockType}:${activeCategory}`)!;
                  if (window.confirm(`Delete ${activeCategory} entry?`)) {
                    del.mutate({ id: e.id, date });
                    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes("");
                  }
                }}
                className="ml-auto text-xs text-err hover:underline">
                Delete entry
              </button>
            )}
          </div>

          </>}
        </div>
      )}

      {/* Summary table */}
      {entriesForType.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-dim uppercase tracking-wide capitalize">
              {stockType} Stock — {shortDate(date)}
            </span>
            <span className="text-xs font-mono font-semibold text-gold">
              Total: {grams(entriesForType.reduce((s, e) => s + Number(e.total_weight_g), 0))}
              {` · ${entriesForType.reduce((s, e) => s + (e.qty ?? 0), 0)} tagged pcs`}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">Weight (g)</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-left px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {allCategories.filter(c => entriesForType.some(e => e.category === c)).map(cat => {
                const e = entryMap.get(`${stockType}:${cat}`)!;
                const isTagged = e.qty != null;
                return (
                  <tr key={cat} className="border-b border-line last:border-0 hover:bg-canvas/40 cursor-pointer"
                    onClick={() => selectCategory(cat)}>
                    <td className="px-4 py-2.5 font-medium text-ink">{cat}</td>
                    <td className="px-4 py-2.5">
                      {isTagged
                        ? <span className="text-[10px] font-semibold text-info bg-info/10 px-1.5 py-0.5 rounded">Tagged</span>
                        : <span className="text-[10px] font-semibold text-ok bg-ok/10 px-1.5 py-0.5 rounded">Untagged</span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-gold">{grams(e.total_weight_g)}</td>
                    <td className="px-4 py-2.5 text-right text-info font-semibold">{e.qty != null ? `${e.qty}pc` : "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-dim">{e.notes || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && !activeCategory && (
        <div className="bg-white border border-line rounded-xl p-8 text-center text-ink-dim shadow-soft text-sm">
          No stock entered for {shortDate(date)}. Click a category above to start.
        </div>
      )}
    </div>
  );
}
