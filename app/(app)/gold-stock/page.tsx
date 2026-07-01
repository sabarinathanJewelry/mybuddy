"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { grams, shortDate } from "@/lib/format";
import { clsx } from "clsx";

const CATEGORIES = [
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

  const { data: entries = [] } = useStockEntries(date);
  const upsert = useUpsertStock();
  const del = useDeleteStock();
  const qc = useQueryClient();

  const entriesForType = entries.filter(e => e.stock_type === stockType);
  const entryMap = new Map(entries.map(e => [`${e.stock_type}:${e.category}`, e]));

  const runningTotal = weights.reduce((s, w) => s + w, 0);
  const pendingW = parseFloat(weightInput) || 0;
  const effectiveTotal = runningTotal + (pendingW > 0 ? pendingW : 0);

  function selectCategory(cat: string) {
    if (activeCategory === cat) {
      setActiveCategory(null);
      setWeights([]);
      setWeightInput("");
      setQty("");
      setNotes("");
      return;
    }
    setActiveCategory(cat);
    setWeightInput("");
    setNotes("");
    const existing = entryMap.get(`${stockType}:${cat}`);
    if (existing) {
      setWeights([existing.total_weight_g]);
      setQty(existing.qty != null ? String(existing.qty) : "");
    } else {
      setWeights([]);
      setQty("");
    }
    setTimeout(() => weightRef.current?.focus(), 50);
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
    setActiveCategory(null);
    setWeights([]);
    setWeightInput("");
    setQty("");
    setNotes("");
  }

  const vaultTotal = entries.filter(e => e.stock_type === "vault").reduce((s, e) => s + Number(e.total_weight_g), 0);
  const outerTotal = entries.filter(e => e.stock_type === "outer").reduce((s, e) => s + Number(e.total_weight_g), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Gold Stock</h1>
          <p className="text-xs text-ink-dim mt-0.5">Vault: {grams(vaultTotal)} &nbsp;·&nbsp; Outer: {grams(outerTotal)}</p>
        </div>
        <input type="date" value={date} onChange={e => { setDate(e.target.value); setActiveCategory(null); setWeights([]); }}
          className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
      </div>

      {/* Stock type tabs */}
      <div className="flex border border-line rounded-lg2 overflow-hidden text-sm font-medium">
        {(["vault", "outer"] as StockType[]).map(t => (
          <button key={t} onClick={() => { setStockType(t); setActiveCategory(null); setWeights([]); setWeightInput(""); }}
            className={clsx("flex-1 py-2 capitalize transition-colors", stockType === t ? "bg-gold text-white" : "text-ink-dim hover:text-ink")}>
            {t === "vault" ? "Vault Stock (weight only)" : "Outer Stock (weight + qty)"}
          </button>
        ))}
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {CATEGORIES.map(cat => {
          const existing = entryMap.get(`${stockType}:${cat}`);
          const isActive = activeCategory === cat;
          return (
            <button key={cat} onClick={() => selectCategory(cat)}
              className={clsx(
                "rounded-xl border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-gold bg-gold/10 ring-1 ring-gold"
                  : existing
                  ? "border-ok/40 bg-ok/5 hover:border-ok"
                  : "border-line bg-white hover:border-gold"
              )}>
              <p className={clsx("text-xs font-semibold truncate", isActive ? "text-gold" : existing ? "text-ok" : "text-ink")}>{cat}</p>
              {existing
                ? <p className="text-[11px] font-mono text-ink-dim mt-0.5">{grams(existing.total_weight_g)}{existing.qty != null ? ` · ${existing.qty}pc` : ""}</p>
                : <p className="text-[11px] text-ink-dim/60 mt-0.5">—</p>
              }
            </button>
          );
        })}
      </div>

      {/* Weight entry panel */}
      {activeCategory && (
        <div className="bg-white border border-gold/30 rounded-xl p-5 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">{activeCategory}
              <span className="ml-2 text-xs font-normal text-ink-dim capitalize">{stockType}</span>
            </h2>
            {effectiveTotal > 0 && (
              <span className="text-sm font-bold text-gold font-mono">{grams(effectiveTotal)}</span>
            )}
          </div>

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

          {/* Qty + Notes — both stock types */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">
                Quantity (pieces){stockType === "outer" ? " *" : ""}
                {!qty && weights.length > 0 && (
                  <span className="ml-1 text-ink-dim/60">auto: {weights.length + (pendingW > 0 ? 1 : 0)}</span>
                )}
              </label>
              <input type="number" step="1" min="0" value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder={stockType === "outer" ? "Required" : "Optional"}
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
        </div>
      )}

      {/* Summary table */}
      {entriesForType.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-dim uppercase tracking-wide capitalize">{stockType} Stock — {shortDate(date)}</span>
            <span className="text-xs font-mono font-semibold text-gold">
              Total: {grams(entriesForType.reduce((s, e) => s + Number(e.total_weight_g), 0))}
              {stockType === "outer" && ` · ${entriesForType.reduce((s, e) => s + (e.qty ?? 0), 0)} pcs`}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2">Category</th>
                <th className="text-right px-4 py-2">Weight (g)</th>
                {stockType === "outer" && <th className="text-right px-4 py-2">Qty</th>}
                <th className="text-left px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.filter(c => entriesForType.some(e => e.category === c)).map(cat => {
                const e = entryMap.get(`${stockType}:${cat}`)!;
                return (
                  <tr key={cat} className="border-b border-line last:border-0 hover:bg-canvas/40 cursor-pointer"
                    onClick={() => selectCategory(cat)}>
                    <td className="px-4 py-2.5 font-medium text-ink">{cat}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-gold">{grams(e.total_weight_g)}</td>
                    {stockType === "outer" && <td className="px-4 py-2.5 text-right">{e.qty ?? "—"}</td>}
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
