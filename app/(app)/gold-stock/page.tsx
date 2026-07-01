"use client";

import { useState, useRef, KeyboardEvent, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { grams, shortDate } from "@/lib/format";
import { clsx } from "clsx";

const PRESET_CATEGORIES = [
  "75KDM", "Bangle", "Bracelet", "Chain", "Diamond", "Dollar",
  "Gold Kolusu", "Malaim", "Necklace", "Ring", "Stud", "Thali",
];

type StockType = "vault" | "outer";
type TransferDir = "to_outer" | "to_vault";

interface StockEntry {
  id: string;
  entry_date: string;
  stock_type: StockType;
  category: string;
  total_weight_g: number;
  untagged_weight_g: number;
  qty: number | null;
  notes: string | null;
  reserved_weight_g: number;
  reserved_qty: number;
  reserved_notes: string | null;
}

type UpsertPayload = {
  entry_date: string; stock_type: StockType; category: string;
  total_weight_g: number; qty: number | null; notes: string;
  untagged_weight_g?: number;
  reserved_weight_g?: number; reserved_qty?: number; reserved_notes?: string;
};

interface Reservation { w: number; q: number; ref: string; }

function parseReservations(e: StockEntry): Reservation[] {
  if (e.reserved_notes) {
    try {
      const p = JSON.parse(e.reserved_notes);
      if (Array.isArray(p)) return p as Reservation[];
    } catch {}
    // Legacy single-reservation plain text
    if (e.reserved_weight_g > 0) return [{ w: e.reserved_weight_g, q: e.reserved_qty, ref: e.reserved_notes }];
  }
  if (e.reserved_weight_g > 0) return [{ w: e.reserved_weight_g, q: e.reserved_qty, ref: "" }];
  return [];
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function useStockEntries(date: string) {
  return useQuery<StockEntry[]>({
    queryKey: ["gold_stock", date],
    queryFn: async () => {
      const { data, error } = await supabase().from("gold_stock_entries").select("*").eq("entry_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useStockPeriod(fromDate: string, toDate: string, enabled: boolean) {
  return useQuery<StockEntry[]>({
    queryKey: ["gold_stock_period", fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase().from("gold_stock_entries").select("*").in("entry_date", [fromDate, toDate]);
      if (error) throw error;
      return data ?? [];
    },
    enabled,
  });
}

function useUpsertStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: UpsertPayload) => {
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

function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (category: string) => {
      const { error } = await supabase().from("gold_stock_entries").delete().eq("category", category);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gold_stock"] }),
  });
}

function useRenameCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const { error } = await supabase().from("gold_stock_entries").update({ category: newName }).eq("category", oldName);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gold_stock"] }),
  });
}

// ── Period Report ─────────────────────────────────────────────────────────────

function PeriodReport({ fromDate, toDate }: { fromDate: string; toDate: string }) {
  const [reportType, setReportType] = useState<StockType>("vault");
  const enabled = fromDate !== toDate && !!fromDate && !!toDate;
  const { data: rows = [], isLoading } = useStockPeriod(fromDate, toDate, enabled);

  const openingMap = useMemo(() => {
    const m = new Map<string, StockEntry>();
    rows.filter(r => r.entry_date === fromDate && r.stock_type === reportType).forEach(r => m.set(r.category, r));
    return m;
  }, [rows, fromDate, reportType]);

  const closingMap = useMemo(() => {
    const m = new Map<string, StockEntry>();
    rows.filter(r => r.entry_date === toDate && r.stock_type === reportType).forEach(r => m.set(r.category, r));
    return m;
  }, [rows, toDate, reportType]);

  const allCats = useMemo(() => {
    const cats = new Set([...openingMap.keys(), ...closingMap.keys()]);
    const ordered = PRESET_CATEGORIES.filter(c => cats.has(c));
    cats.forEach(c => { if (!PRESET_CATEGORIES.includes(c)) ordered.push(c); });
    return ordered;
  }, [openingMap, closingMap]);

  if (!enabled) return null;
  if (isLoading) return <div className="text-xs text-ink-dim py-4 text-center">Loading…</div>;

  const openTotal = allCats.reduce((s, c) => s + Number(openingMap.get(c)?.total_weight_g ?? 0), 0);
  const closeTotal = allCats.reduce((s, c) => s + Number(closingMap.get(c)?.total_weight_g ?? 0), 0);
  const soldTotal = openTotal - closeTotal;

  return (
    <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
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
              const op = openingMap.get(cat); const cl = closingMap.get(cat);
              const opWt = Number(op?.total_weight_g ?? 0); const clWt = Number(cl?.total_weight_g ?? 0);
              const soldWt = opWt - clWt;
              const opQty = op?.qty ?? null; const clQty = cl?.qty ?? null;
              const soldQty = (opQty != null && clQty != null) ? opQty - clQty : null;
              const isTagged = op?.qty != null || cl?.qty != null;
              return (
                <tr key={cat} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {cat}{isTagged && <span className="ml-1.5 text-[10px] text-info font-normal">tagged</span>}
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
                    {soldWt === 0 ? <span className="text-ink-dim/50 font-mono text-xs">—</span>
                    : soldWt > 0
                      ? <span className="font-mono font-semibold text-warn">-{grams(soldWt)}{soldQty != null && soldQty !== 0 && <span className="block text-[11px]">{soldQty}pc</span>}</span>
                      : <span className="font-mono font-semibold text-ok">+{grams(Math.abs(soldWt))}{soldQty != null && soldQty !== 0 && <span className="block text-[11px]">{Math.abs(soldQty)}pc</span>}</span>
                    }
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
                {soldTotal > 0 ? <span className="text-warn">-{grams(soldTotal)}</span>
                : soldTotal < 0 ? <span className="text-ok">+{grams(Math.abs(soldTotal))}</span>
                : <span className="text-ink-dim/50">—</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GoldStockPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [stockType, setStockType] = useState<StockType>("vault");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Stock entry
  const [weights, setWeights] = useState<number[]>([]);
  const [weightInput, setWeightInput] = useState("");
  const [qty, setQty] = useState<string>("");
  const [untaggedInput, setUntaggedInput] = useState("");
  const [notes, setNotes] = useState("");
  const weightRef = useRef<HTMLInputElement>(null);

  // Custom category
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCatInput, setCustomCatInput] = useState("");
  const customRef = useRef<HTMLInputElement>(null);

  // Period report
  const [showPeriod, setShowPeriod] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState(today);

  // Sold mode
  const [soldMode, setSoldMode] = useState(false);
  const [soldWeightInput, setSoldWeightInput] = useState("");
  const [soldQtyInput, setSoldQtyInput] = useState("");

  // Transfer mode (vault↔outer)
  const [transferMode, setTransferMode] = useState(false);
  const [transferDir, setTransferDir] = useState<TransferDir>("to_outer");
  const [transferWeightInput, setTransferWeightInput] = useState("");
  const [transferQtyInput, setTransferQtyInput] = useState("");
  const [transferReason, setTransferReason] = useState("");

  // Rename mode
  const [renameMode, setRenameMode] = useState(false);
  const [renameInput, setRenameInput] = useState("");

  // Reserved / custom-order tagging (vault only) — multiple reservations
  const [showReserved, setShowReserved] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [newResW, setNewResW] = useState("");
  const [newResQ, setNewResQ] = useState("");
  const [newResRef, setNewResRef] = useState("");

  const { data: entries = [] } = useStockEntries(date);
  const upsert = useUpsertStock();
  const del = useDeleteStock();
  const rename = useRenameCategory();
  const deleteCategory = useDeleteCategory();

  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  useEffect(() => {
    try {
      const s = localStorage.getItem("gold_stock_hidden_cats");
      if (s) setHiddenCategories(JSON.parse(s));
    } catch {}
  }, []);

  function hideCategory(cat: string) {
    const next = [...hiddenCategories, cat];
    setHiddenCategories(next);
    localStorage.setItem("gold_stock_hidden_cats", JSON.stringify(next));
  }

  const entriesForType = entries.filter(e => e.stock_type === stockType);
  const entryMap = new Map(entries.map(e => [`${e.stock_type}:${e.category}`, e]));
  const hasAnyEntryToday = (cat: string) => entries.some(e => e.category === cat);

  const allCategories = useMemo(() => {
    const saved = entries.map(e => e.category);
    return Array.from(new Set([...PRESET_CATEGORIES, ...saved]))
      .filter(c => !hiddenCategories.includes(c));
  }, [entries, hiddenCategories]);

  const runningTotal = weights.reduce((s, w) => s + w, 0);
  const pendingW = parseFloat(weightInput) || 0;
  const effectiveTotal = runningTotal + (pendingW > 0 ? pendingW : 0);

  function clearModes() {
    setSoldMode(false); setSoldWeightInput(""); setSoldQtyInput("");
    setTransferMode(false); setTransferWeightInput(""); setTransferQtyInput(""); setTransferReason("");
    setRenameMode(false); setRenameInput("");
    setShowReserved(false); setReservations([]); setNewResW(""); setNewResQ(""); setNewResRef("");
  }

  function selectCategory(cat: string) {
    if (activeCategory === cat) {
      setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput("");
      clearModes(); return;
    }
    setActiveCategory(cat);
    setWeightInput(""); setNotes(""); clearModes();
    const existing = entryMap.get(`${stockType}:${cat}`);
    if (existing) {
      setWeights([existing.total_weight_g]);
      setQty(existing.qty != null ? String(existing.qty) : "");
      setUntaggedInput(Number(existing.untagged_weight_g) > 0 ? String(existing.untagged_weight_g) : "");
      const res = parseReservations(existing);
      if (res.length > 0) { setShowReserved(true); setReservations(res); }
    } else {
      setWeights([]); setQty(""); setUntaggedInput("");
    }
    setTimeout(() => weightRef.current?.focus(), 50);
  }

  function addWeight() {
    const w = parseFloat(weightInput);
    if (!w || w <= 0) return;
    setWeights(prev => [...prev, w]);
    setWeightInput(""); weightRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); addWeight(); }
  }

  async function handleSave() {
    const untaggedWt = parseFloat(untaggedInput) || 0;
    if (!activeCategory || (effectiveTotal <= 0 && untaggedWt <= 0)) return;
    const finalWeights = pendingW > 0 ? [...weights, pendingW] : weights;
    const total = parseFloat(finalWeights.reduce((s, w) => s + w, 0).toFixed(3));
    // Only auto-count qty when multiple individual weights were scanned; single weight stays untagged unless qty is explicit
    const autoQty = finalWeights.length > 1 ? finalWeights.length : null;
    const allRes = showReserved ? reservations : [];
    const resWt = parseFloat(allRes.reduce((s, r) => s + r.w, 0).toFixed(3));
    const resQty = allRes.reduce((s, r) => s + r.q, 0);
    await upsert.mutateAsync({
      entry_date: date, stock_type: stockType, category: activeCategory,
      total_weight_g: total,
      qty: qty ? parseInt(qty) : autoQty,
      notes: notes.trim() || "",
      untagged_weight_g: untaggedWt,
      reserved_weight_g: resWt,
      reserved_qty: resQty,
      reserved_notes: allRes.length > 0 ? JSON.stringify(allRes) : undefined,
    });
    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput("");
    clearModes();
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
      entry_date: date, stock_type: stockType, category: activeCategory!,
      total_weight_g: newWt, qty: newQty, notes: existing.notes || "",
      untagged_weight_g: Number(existing.untagged_weight_g) || 0,
      reserved_weight_g: existing.reserved_weight_g, reserved_qty: existing.reserved_qty,
      reserved_notes: existing.reserved_notes || undefined,
    });
    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput("");
    clearModes();
  }

  async function handleTransfer() {
    if (!activeCategory) return;
    const src = transferDir === "to_outer"
      ? entryMap.get(`vault:${activeCategory}`)
      : entryMap.get(`outer:${activeCategory}`);
    const dst = transferDir === "to_outer"
      ? entryMap.get(`outer:${activeCategory}`)
      : entryMap.get(`vault:${activeCategory}`);
    if (!src) return;

    const tWt = parseFloat(transferWeightInput) || 0;
    const tQty = parseInt(transferQtyInput) || 0;
    if (tWt <= 0) return;
    if (tWt > Number(src.total_weight_g)) { alert("Transfer weight cannot exceed source stock"); return; }
    if (src.qty != null && tQty > src.qty) { alert("Transfer qty cannot exceed source qty"); return; }

    const srcType: StockType = transferDir === "to_outer" ? "vault" : "outer";
    const dstType: StockType = transferDir === "to_outer" ? "outer" : "vault";
    const reasonNote = transferReason.trim() ? `[${transferReason.trim()}]` : "";

    const newSrcWt = parseFloat((Number(src.total_weight_g) - tWt).toFixed(3));
    const newSrcQty = src.qty != null ? src.qty - tQty : null;
    const newDstWt = parseFloat((Number(dst?.total_weight_g ?? 0) + tWt).toFixed(3));
    const newDstQty = dst?.qty != null ? dst.qty + tQty : (tQty > 0 ? tQty : null);

    await upsert.mutateAsync({
      entry_date: date, stock_type: srcType, category: activeCategory,
      total_weight_g: newSrcWt, qty: newSrcQty,
      notes: [src.notes, reasonNote].filter(Boolean).join(" ").trim(),
      untagged_weight_g: Number(src.untagged_weight_g) || 0,
      reserved_weight_g: src.reserved_weight_g, reserved_qty: src.reserved_qty,
      reserved_notes: src.reserved_notes || undefined,
    });
    await upsert.mutateAsync({
      entry_date: date, stock_type: dstType, category: activeCategory,
      total_weight_g: newDstWt, qty: newDstQty,
      notes: [dst?.notes, reasonNote].filter(Boolean).join(" ").trim(),
      untagged_weight_g: Number(dst?.untagged_weight_g) || 0,
      reserved_weight_g: dst?.reserved_weight_g ?? 0, reserved_qty: dst?.reserved_qty ?? 0,
      reserved_notes: dst?.reserved_notes || undefined,
    });

    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput("");
    clearModes();
  }

  async function handleRename() {
    if (!activeCategory || !renameInput.trim() || renameInput.trim() === activeCategory) return;
    if (!window.confirm(`Rename "${activeCategory}" → "${renameInput.trim()}" across ALL dates? This cannot be undone.`)) return;
    await rename.mutateAsync({ oldName: activeCategory, newName: renameInput.trim() });
    setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput("");
    clearModes();
  }

  const vaultTagged = entries.filter(e => e.stock_type === "vault" && e.qty != null).reduce((s, e) => s + Number(e.total_weight_g), 0);
  const vaultBulk   = entries.filter(e => e.stock_type === "vault").reduce((s, e) => s + (e.qty == null ? Number(e.total_weight_g) : 0) + Number(e.untagged_weight_g), 0);
  const outerTagged = entries.filter(e => e.stock_type === "outer" && e.qty != null).reduce((s, e) => s + Number(e.total_weight_g), 0);
  const outerBulk   = entries.filter(e => e.stock_type === "outer").reduce((s, e) => s + (e.qty == null ? Number(e.total_weight_g) : 0) + Number(e.untagged_weight_g), 0);
  const vaultTotal = vaultTagged + vaultBulk;
  const outerTotal = outerTagged + outerBulk;
  const reservedTotal = entries.filter(e => e.stock_type === "vault").reduce((s, e) => s + Number(e.reserved_weight_g), 0);
  const grandTotal = vaultTotal + outerTotal;

  const transferSrc = activeCategory
    ? (transferDir === "to_outer" ? entryMap.get(`vault:${activeCategory}`) : entryMap.get(`outer:${activeCategory}`))
    : null;
  const transferDst = activeCategory
    ? (transferDir === "to_outer" ? entryMap.get(`outer:${activeCategory}`) : entryMap.get(`vault:${activeCategory}`))
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            தங்க சரக்கு
            <span className="ml-1.5 text-sm font-normal text-ink-dim">Gold Stock</span>
            <span className="ml-2 text-base font-mono text-gold">{grams(grandTotal)}</span>
          </h1>
          <div className="text-xs text-ink-dim mt-0.5 space-y-0.5">
            <p>
              <span className="font-medium">Vault</span> {grams(vaultTotal)}
              {vaultTagged > 0 && <span className="text-info ml-1.5">{grams(vaultTagged)} tagged</span>}
              {vaultTagged > 0 && vaultBulk > 0 && <span className="mx-0.5">·</span>}
              {vaultBulk > 0 && <span className="text-ok">{vaultTagged > 0 ? "" : " "}{grams(vaultBulk)} bulk</span>}
              {reservedTotal > 0 && <span className="text-warn ml-1.5">· {grams(reservedTotal)} reserved</span>}
            </p>
            <p>
              <span className="font-medium">Outer</span> {grams(outerTotal)}
              {outerTagged > 0 && <span className="text-info ml-1.5">{grams(outerTagged)} tagged</span>}
              {outerTagged > 0 && outerBulk > 0 && <span className="mx-0.5">·</span>}
              {outerBulk > 0 && <span className="text-ok">{outerTagged > 0 ? "" : " "}{grams(outerBulk)} bulk</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPrint(true)} disabled={entries.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg2 border font-medium border-line text-ink-dim hover:text-ink disabled:opacity-40 transition-colors">
            அச்சிடு / Print
          </button>
          <button onClick={() => setShowPeriod(v => !v)}
            className={clsx("text-xs px-3 py-1.5 rounded-lg2 border font-medium transition-colors",
              showPeriod ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:text-ink")}>
            Period Report
          </button>
          <input type="date" value={date} onChange={e => { setDate(e.target.value); setActiveCategory(null); setWeights([]); clearModes(); }}
            className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
        </div>
      </div>

      {/* ── Period Report ── */}
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
      {showPeriod && periodFrom && periodTo && periodFrom !== periodTo && (
        <PeriodReport fromDate={periodFrom} toDate={periodTo} />
      )}

      {hiddenCategories.length > 0 && (
        <div className="text-[11px] text-ink-dim/60 text-right">
          {hiddenCategories.length} categor{hiddenCategories.length === 1 ? "y" : "ies"} hidden —{" "}
          <button className="underline hover:text-ink-dim" onClick={() => {
            setHiddenCategories([]);
            localStorage.removeItem("gold_stock_hidden_cats");
          }}>Restore all</button>
        </div>
      )}

      <hr className="border-line" />

      {/* ── Stock type tabs ── */}
      <div className="flex border border-line rounded-lg2 overflow-hidden text-sm font-medium">
        {(["vault", "outer"] as StockType[]).map(t => (
          <button key={t} onClick={() => { setStockType(t); setActiveCategory(null); setWeights([]); setWeightInput(""); clearModes(); }}
            className={clsx("flex-1 py-2 transition-colors", stockType === t ? "bg-gold text-white" : "text-ink-dim hover:text-ink")}>
            {t === "vault" ? <span>வால்ட் <span className="text-xs font-normal opacity-75">Vault</span></span> : <span>வெளி சரக்கு <span className="text-xs font-normal opacity-75">Outer</span></span>}
          </button>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 text-[11px] text-ink-dim flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-info/60"></span> குறியிடப்பட்டது <span className="text-ink-dim/50">(Tagged)</span></span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-ok/60"></span> தொகுதி எடை <span className="text-ink-dim/50">(Bulk/Untagged)</span></span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-warn/50"></span> ஒதுக்கிடு <span className="text-ink-dim/50">(Reserved)</span></span>
      </div>

      {/* ── Category grid ── */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {allCategories.map(cat => {
          const existing = entryMap.get(`${stockType}:${cat}`);
          const isActive = activeCategory === cat;
          const isTagged = existing?.qty != null;
          const hasUntagged = Number(existing?.untagged_weight_g) > 0;
          const hasReserved = (existing?.reserved_weight_g ?? 0) > 0;
          const isCustom = !PRESET_CATEGORIES.includes(cat);
          return (
            <button key={cat} onClick={() => selectCategory(cat)}
              className={clsx(
                "rounded-xl border px-3 py-2.5 text-left transition-all",
                isActive ? "border-gold bg-gold/10 ring-1 ring-gold"
                : existing
                  ? isTagged ? "border-info/40 bg-info/5 hover:border-info"
                  : "border-ok/40 bg-ok/5 hover:border-ok"
                : "border-line bg-white hover:border-gold"
              )}>
              <p className={clsx("text-xs font-semibold truncate",
                isActive ? "text-gold" : existing ? (isTagged ? "text-info" : "text-ok") : "text-ink")}>
                {cat}{isCustom && <span className="ml-1 text-[9px] text-ink-dim/60 font-normal">custom</span>}
              </p>
              {existing ? (
                <div className="mt-0.5">
                  {Number(existing.total_weight_g) > 0 && (
                    <p className="text-[11px] font-mono text-ink-dim">
                      {grams(existing.total_weight_g)}{existing.qty != null ? <span className="text-info"> · {existing.qty}pc</span> : ""}
                    </p>
                  )}
                  {hasUntagged && (
                    <p className="text-[11px] font-mono text-ok">+{grams(existing.untagged_weight_g)} bulk</p>
                  )}
                  {hasReserved && (
                    <p className="text-[10px] text-warn/70 font-medium">{grams(existing.reserved_weight_g)} reserved</p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-ink-dim/60 mt-0.5">—</p>
              )}
            </button>
          );
        })}

        {/* Custom tile */}
        {showCustomInput ? (
          <div className="rounded-xl border border-gold/40 bg-gold/5 px-3 py-2.5 flex flex-col gap-1.5">
            <input ref={customRef} value={customCatInput} onChange={e => setCustomCatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { const n = customCatInput.trim(); if (n) { selectCategory(n); setShowCustomInput(false); setCustomCatInput(""); } }
                if (e.key === "Escape") { setShowCustomInput(false); setCustomCatInput(""); }
              }}
              placeholder="e.g. Coin" autoFocus
              className="text-xs border border-line rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gold w-full" />
            <div className="flex gap-1">
              <button onClick={() => { const n = customCatInput.trim(); if (n) { selectCategory(n); setShowCustomInput(false); setCustomCatInput(""); } }}
                className="text-[10px] bg-gold text-white px-2 py-0.5 rounded font-medium">Add</button>
              <button onClick={() => { setShowCustomInput(false); setCustomCatInput(""); }} className="text-[10px] text-ink-dim px-1">✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setShowCustomInput(true); setTimeout(() => customRef.current?.focus(), 50); }}
            className="rounded-xl border border-dashed border-line px-3 py-2.5 text-left hover:border-gold transition-all">
            <p className="text-xs font-semibold text-ink-dim">+ Custom</p>
            <p className="text-[11px] text-ink-dim/60 mt-0.5">Coin, Bar…</p>
          </button>
        )}
      </div>

      {/* ── Entry Panel ── */}
      {activeCategory && (
        <div className="bg-white border border-gold/30 rounded-xl p-5 shadow-soft space-y-4">

          {/* Panel header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            {renameMode ? (
              <div className="flex items-center gap-2 flex-1">
                <input value={renameInput} onChange={e => setRenameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenameMode(false); setRenameInput(""); } }}
                  autoFocus
                  className="border border-gold rounded-lg2 px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-gold flex-1 max-w-[180px]" />
                <button onClick={handleRename} disabled={rename.isPending || !renameInput.trim() || renameInput.trim() === activeCategory}
                  className="text-xs bg-gold text-white px-3 py-1 rounded-lg2 disabled:opacity-40">
                  {rename.isPending ? "Saving…" : "Rename"}
                </button>
                <button onClick={() => { setRenameMode(false); setRenameInput(""); }} className="text-xs text-ink-dim hover:text-ink">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold text-ink">{activeCategory}
                  <span className="ml-2 text-xs font-normal text-ink-dim capitalize">{stockType}</span>
                </h2>
                <button onClick={() => { clearModes(); setRenameMode(true); setRenameInput(activeCategory!); }}
                  title="Rename category" className="text-ink-dim/50 hover:text-gold transition-colors text-xs px-1">✎</button>
              </div>
            )}

            {!renameMode && entryMap.has(`${stockType}:${activeCategory}`) && (
              <div className="flex items-center gap-2 flex-wrap">
                {effectiveTotal > 0 && !soldMode && !transferMode && (
                  <span className="text-sm font-bold text-gold font-mono">{grams(effectiveTotal)}</span>
                )}
                {/* Vault → Outer */}
                {stockType === "vault" && (
                  <button onClick={() => { clearModes(); setTransferDir("to_outer"); setTransferMode(true); }}
                    className={clsx("text-xs px-3 py-1 rounded-lg2 border font-medium transition-colors",
                      transferMode && transferDir === "to_outer" ? "bg-info/20 border-info text-info" : "border-line text-ink-dim hover:border-info hover:text-info")}>
                    → Outer
                  </button>
                )}
                {/* Outer → Vault */}
                {stockType === "outer" && (
                  <button onClick={() => { clearModes(); setTransferDir("to_vault"); setTransferMode(true); }}
                    className={clsx("text-xs px-3 py-1 rounded-lg2 border font-medium transition-colors",
                      transferMode && transferDir === "to_vault" ? "bg-info/20 border-info text-info" : "border-line text-ink-dim hover:border-info hover:text-info")}>
                    → Vault
                  </button>
                )}
                <button onClick={() => { clearModes(); setSoldMode(true); }}
                  className={clsx("text-xs px-3 py-1 rounded-lg2 border font-medium transition-colors",
                    soldMode ? "bg-warn/20 border-warn text-warn" : "border-line text-ink-dim hover:border-warn hover:text-warn")}>
                  Record Sold
                </button>
              </div>
            )}
          </div>

          {/* ── Transfer mode ── */}
          {transferMode && transferSrc && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-canvas rounded-lg2 px-3 py-2">
                  <p className="text-ink-dim mb-0.5 capitalize">{transferDir === "to_outer" ? "Vault" : "Outer"} (source)</p>
                  <p className="font-mono font-semibold text-ink">
                    {grams(transferSrc.total_weight_g)}{transferSrc.qty != null ? ` · ${transferSrc.qty}pc` : ""}
                  </p>
                </div>
                <div className="bg-canvas rounded-lg2 px-3 py-2">
                  <p className="text-ink-dim mb-0.5 capitalize">{transferDir === "to_outer" ? "Outer" : "Vault"} (destination)</p>
                  <p className="font-mono font-semibold text-ink">
                    {transferDst ? `${grams(transferDst.total_weight_g)}${transferDst.qty != null ? ` · ${transferDst.qty}pc` : ""}` : "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Transfer weight (g) *</label>
                  <input type="number" step="0.001" min="0" value={transferWeightInput}
                    onChange={e => setTransferWeightInput(e.target.value)}
                    placeholder="e.g. 10.500" autoFocus className={clsx(inp, "font-mono")} />
                </div>
                {transferSrc.qty != null && (
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Transfer qty (pieces)</label>
                    <input type="number" step="1" min="0" value={transferQtyInput}
                      onChange={e => setTransferQtyInput(e.target.value)} placeholder="e.g. 3" className={inp} />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-ink-dim mb-1">Reason *</label>
                <input value={transferReason} onChange={e => setTransferReason(e.target.value)}
                  placeholder="e.g. Repair, Suspense, Customer return, Custom order…"
                  className={inp} />
              </div>

              {(() => {
                const tWt = parseFloat(transferWeightInput) || 0;
                const tQty = parseInt(transferQtyInput) || 0;
                if (tWt <= 0) return null;
                const afterSrcWt = parseFloat((Number(transferSrc.total_weight_g) - tWt).toFixed(3));
                const afterDstWt = parseFloat((Number(transferDst?.total_weight_g ?? 0) + tWt).toFixed(3));
                const afterSrcQty = transferSrc.qty != null ? transferSrc.qty - tQty : null;
                const afterDstQty = transferDst?.qty != null ? transferDst.qty + tQty : (tQty > 0 ? tQty : null);
                const invalid = afterSrcWt < 0 || (afterSrcQty != null && afterSrcQty < 0);
                return (
                  <div className={clsx("border rounded-lg2 px-3 py-2 text-xs grid grid-cols-2 gap-2", invalid ? "bg-err/5 border-err/30" : "bg-info/5 border-info/30")}>
                    <div>
                      <p className="text-ink-dim mb-0.5">Source after</p>
                      <p className={clsx("font-mono font-semibold", invalid ? "text-err" : "text-ink")}>
                        {grams(Math.max(afterSrcWt, 0))}{afterSrcQty != null ? ` · ${Math.max(afterSrcQty, 0)}pc` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-dim mb-0.5">Destination after</p>
                      <p className="font-mono font-semibold text-ok">
                        {grams(afterDstWt)}{afterDstQty != null ? ` · ${afterDstQty}pc` : ""}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {upsert.isError && <p className="text-xs text-err">{(upsert.error as Error).message}</p>}
              <div className="flex gap-2">
                <button
                  disabled={upsert.isPending || !transferReason.trim() || (parseFloat(transferWeightInput) || 0) <= 0
                    || (parseFloat(transferWeightInput) || 0) > Number(transferSrc.total_weight_g)}
                  onClick={handleTransfer}
                  className="bg-info text-white text-sm font-medium px-6 py-2 rounded-lg2 disabled:opacity-50 hover:opacity-90">
                  {upsert.isPending ? "Transferring…" : transferDir === "to_outer" ? "Transfer to Outer" : "Transfer to Vault"}
                </button>
                <button onClick={() => { setTransferMode(false); setTransferWeightInput(""); setTransferQtyInput(""); setTransferReason(""); }}
                  className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Sold mode ── */}
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
                      onChange={e => setSoldWeightInput(e.target.value)} placeholder="e.g. 5.234" autoFocus className={clsx(inp, "font-mono")} />
                  </div>
                  {existing.qty != null && (
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Sold qty (pieces)</label>
                      <input type="number" step="1" min="0" value={soldQtyInput}
                        onChange={e => setSoldQtyInput(e.target.value)} placeholder="e.g. 2" className={inp} />
                    </div>
                  )}
                </div>
                {(soldWt > 0 || soldQty > 0) && (
                  <div className="bg-warn/5 border border-warn/30 rounded-lg2 px-3 py-2 text-xs">
                    After:&nbsp;
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
                    className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim hover:text-ink">Cancel</button>
                </div>
              </div>
            );
          })()}

          {/* ── Normal entry (hidden when in sold/transfer/rename mode) ── */}
          {!soldMode && !transferMode && !renameMode && (
            <>
              {/* Weight list */}
              {weights.length > 0 && (
                <div className="bg-canvas rounded-lg2 px-3 py-2 space-y-1">
                  {weights.map((w, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-ink-dim">#{i + 1}</span>
                      <span className="font-mono text-ink">{w.toFixed(3)}g</span>
                      <button onClick={() => setWeights(prev => prev.filter((_, j) => j !== i))} className="text-err hover:underline ml-3">×</button>
                    </div>
                  ))}
                  <div className="border-t border-line pt-1 flex justify-between text-xs font-semibold">
                    <span>Total ({weights.length})</span>
                    <span className="font-mono text-gold">{grams(runningTotal)}</span>
                  </div>
                </div>
              )}

              {/* Weight input */}
              <div className="flex gap-2">
                <input ref={weightRef} type="number" step="0.001" min="0" value={weightInput}
                  onChange={e => setWeightInput(e.target.value)} onKeyDown={handleKeyDown} onFocus={e => e.target.select()}
                  placeholder="Enter weight (g) — press Enter to add"
                  className={clsx(inp, "font-mono flex-1")} autoFocus />
                <button onClick={addWeight} disabled={!weightInput || parseFloat(weightInput) <= 0}
                  className="bg-gold text-white text-sm px-4 rounded-lg2 disabled:opacity-40 hover:opacity-90 shrink-0">+ Add</button>
              </div>

              {/* Qty + Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">
                    Quantity{stockType === "outer" ? " *" : ""}
                    <span className="ml-1 text-info/70 text-[10px]">= tagged</span>
                    {!qty && weights.length > 0 && <span className="ml-1 text-ink-dim/50">auto: {weights.length + (pendingW > 0 ? 1 : 0)}</span>}
                  </label>
                  <input type="number" step="1" min="0" value={qty} onChange={e => setQty(e.target.value)}
                    placeholder={stockType === "outer" ? "Required" : "Leave blank = untagged"} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={inp} />
                </div>
              </div>

              {/* Bulk / Untagged weight */}
              <div className="border border-ok/30 rounded-xl p-3 space-y-2">
                <label className="block text-xs font-medium text-ok/90">
                  Bulk / Untagged weight
                  <span className="ml-1.5 font-normal text-ink-dim/60">= no individual piece tracking</span>
                </label>
                <input type="number" step="0.001" min="0" value={untaggedInput}
                  onChange={e => setUntaggedInput(e.target.value)}
                  placeholder="e.g. 50.000 (loose chains, kolusu, scrap gold…)"
                  className={clsx(inp, "font-mono")} />
                {(parseFloat(untaggedInput) || 0) > 0 && (
                  <p className="text-xs text-ok font-mono">Bulk: {grams(parseFloat(untaggedInput))}</p>
                )}
              </div>

              {/* Reserved / Custom Order section (vault only) */}
              {stockType === "vault" && (() => {
                const totalReserved = parseFloat(reservations.reduce((s, r) => s + r.w, 0).toFixed(3));
                const availableWt = Math.max(0, effectiveTotal - totalReserved);
                function addReservation() {
                  const w = parseFloat(newResW);
                  if (!w || w <= 0) return;
                  setReservations(prev => [...prev, { w, q: parseInt(newResQ) || 0, ref: newResRef.trim() }]);
                  setNewResW(""); setNewResQ(""); setNewResRef("");
                }
                return (
                  <div className="border border-warn/30 rounded-xl overflow-hidden">
                    <button onClick={() => setShowReserved(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-warn/5 hover:bg-warn/10 transition-colors text-sm">
                      <span className="font-medium text-warn/90">
                        Custom Order Reserved
                        {reservations.length > 0 && <span className="ml-2 text-[11px] bg-warn/20 text-warn px-1.5 py-0.5 rounded font-semibold">{reservations.length}</span>}
                      </span>
                      <span className="text-xs text-ink-dim">{showReserved ? "▲ Hide" : "▼ Manage"}</span>
                    </button>
                    {showReserved && (
                      <div className="px-4 py-3 space-y-3 bg-white">
                        {/* Existing reservations list */}
                        {reservations.length > 0 && (
                          <div className="space-y-1.5">
                            {reservations.map((r, i) => (
                              <div key={i} className="flex items-center gap-2 bg-warn/5 border border-warn/20 rounded-lg2 px-3 py-2 text-xs">
                                <span className="font-mono font-semibold text-warn shrink-0">{grams(r.w)}</span>
                                {r.q > 0 && <span className="text-ink-dim shrink-0">{r.q}pc</span>}
                                <span className="text-ink flex-1 truncate">{r.ref || <em className="text-ink-dim/50">no reference</em>}</span>
                                <button onClick={() => setReservations(prev => prev.filter((_, j) => j !== i))}
                                  className="text-err hover:underline shrink-0 ml-1">×</button>
                              </div>
                            ))}
                            <div className="flex justify-between text-xs pt-1 border-t border-warn/20">
                              <span className="text-ink-dim">Total reserved</span>
                              <span className="font-mono font-semibold text-warn">{grams(totalReserved)}</span>
                            </div>
                          </div>
                        )}

                        {/* Add new reservation */}
                        <p className="text-xs text-ink-dim font-medium">Add reservation</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" step="0.001" min="0" value={newResW}
                            onChange={e => setNewResW(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addReservation(); } }}
                            placeholder="Weight (g)" className={clsx(inp, "font-mono text-xs py-1.5")} />
                          <input type="number" step="1" min="0" value={newResQ}
                            onChange={e => setNewResQ(e.target.value)}
                            placeholder="Qty (optional)" className={clsx(inp, "text-xs py-1.5")} />
                        </div>
                        <div className="flex gap-2">
                          <input value={newResRef} onChange={e => setNewResRef(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addReservation(); } }}
                            placeholder="Customer / Order reference (e.g. Ravi wedding ring)"
                            className={clsx(inp, "text-xs py-1.5 flex-1")} />
                          <button onClick={addReservation} disabled={!newResW || parseFloat(newResW) <= 0}
                            className="bg-warn text-white text-xs px-3 rounded-lg2 disabled:opacity-40 shrink-0">+ Add</button>
                        </div>

                        {effectiveTotal > 0 && totalReserved > 0 && (
                          <p className="text-xs text-ok">
                            Available for sale: <span className="font-mono font-semibold">{grams(availableWt)}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {upsert.isError && <p className="text-xs text-err">{(upsert.error as Error).message}</p>}

              <div className="flex gap-2">
                <button
                  disabled={upsert.isPending || (effectiveTotal <= 0 && (parseFloat(untaggedInput) || 0) <= 0)}
                  onClick={handleSave}
                  className="bg-gold text-white text-sm font-medium px-6 py-2 rounded-lg2 disabled:opacity-50 hover:opacity-90">
                  {upsert.isPending ? "Saving…" : entryMap.has(`${stockType}:${activeCategory}`) ? "Update" : "Save"}
                </button>
                <button onClick={() => { setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput(""); clearModes(); }}
                  className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim hover:text-ink">Cancel</button>
                {entryMap.has(`${stockType}:${activeCategory}`) && (
                  <button
                    onClick={() => {
                      const e = entryMap.get(`${stockType}:${activeCategory}`)!;
                      if (window.confirm(`Delete ${activeCategory} entry?`)) {
                        del.mutate({ id: e.id, date });
                        setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput(""); clearModes();
                      }
                    }}
                    className="ml-auto text-xs text-err hover:underline">Delete entry</button>
                )}
                {!hasAnyEntryToday(activeCategory!) && (
                  <button
                    disabled={deleteCategory.isPending}
                    onClick={async () => {
                      if (!window.confirm(`Remove "${activeCategory}" from the category list? Any stored entries for this category will also be deleted.`)) return;
                      await deleteCategory.mutateAsync(activeCategory!);
                      hideCategory(activeCategory!);
                      setActiveCategory(null); setWeights([]); setWeightInput(""); setQty(""); setNotes(""); setUntaggedInput(""); clearModes();
                    }}
                    className="ml-auto text-xs text-err hover:underline disabled:opacity-40">Delete category</button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Summary table ── */}
      {entriesForType.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-dim uppercase tracking-wide capitalize">
              {stockType} Stock — {shortDate(date)}
            </span>
            <span className="text-xs font-mono font-semibold text-gold">
              Total: {grams(entriesForType.reduce((s, e) => s + Number(e.total_weight_g) + Number(e.untagged_weight_g), 0))}
              {` · ${entriesForType.reduce((s, e) => s + (e.qty ?? 0), 0)} tagged pcs`}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2">வகை <span className="font-normal opacity-60">Category</span></th>
                <th className="text-left px-4 py-2">வகை <span className="font-normal opacity-60">Type</span></th>
                <th className="text-right px-3 py-2">எடை <span className="font-normal opacity-60">Weight</span></th>
                <th className="text-right px-3 py-2">எண் <span className="font-normal opacity-60">Qty</span></th>
                {stockType === "vault" && <th className="text-right px-3 py-2 text-warn/70">ஒதுக்கிடு <span className="font-normal opacity-60">Reserved</span></th>}
                <th className="text-left px-4 py-2">குறிப்பு <span className="font-normal opacity-60">Notes</span></th>
              </tr>
            </thead>
            <tbody>
              {allCategories.filter(c => entriesForType.some(e => e.category === c)).map(cat => {
                const e = entryMap.get(`${stockType}:${cat}`)!;
                const isTagged = e.qty != null;
                const rowUntagged = Number(e.untagged_weight_g) || 0;
                const hasRes = (e.reserved_weight_g ?? 0) > 0;
                return (
                  <tr key={cat} className="border-b border-line last:border-0 hover:bg-canvas/40 cursor-pointer" onClick={() => selectCategory(cat)}>
                    <td className="px-4 py-2.5 font-medium text-ink">{cat}</td>
                    <td className="px-4 py-2.5">
                      {isTagged && <span className="text-[10px] font-semibold text-info bg-info/10 px-1.5 py-0.5 rounded">Tagged</span>}
                      {rowUntagged > 0 && <span className={clsx("text-[10px] font-semibold text-ok bg-ok/10 px-1.5 py-0.5 rounded", isTagged && "ml-1")}>Bulk</span>}
                      {!isTagged && rowUntagged === 0 && <span className="text-[10px] font-semibold text-ok bg-ok/10 px-1.5 py-0.5 rounded">Untagged</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {Number(e.total_weight_g) > 0 && <p className="font-mono font-semibold text-gold">{grams(e.total_weight_g)}</p>}
                      {rowUntagged > 0 && <p className="font-mono font-semibold text-ok text-xs">+{grams(rowUntagged)} bulk</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-info font-semibold">{e.qty != null ? `${e.qty}pc` : "—"}</td>
                    {stockType === "vault" && (
                      <td className="px-3 py-2.5 text-right">
                        {hasRes
                          ? <span className="font-mono text-warn font-semibold text-xs">{grams(e.reserved_weight_g)}{e.reserved_qty > 0 ? ` · ${e.reserved_qty}pc` : ""}</span>
                          : <span className="text-ink-dim/40 text-xs">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-xs text-ink-dim">
                      {e.notes || "—"}
                      {hasRes && e.reserved_notes && <span className="block text-warn/70">{e.reserved_notes}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {entries.length === 0 && !activeCategory && (
        <div className="bg-white border border-line rounded-xl p-8 text-center text-ink-dim shadow-soft text-sm">
          {shortDate(date)} அன்று சரக்கு இல்லை. மேலே ஒரு வகையை கிளிக் செய்யுங்கள்.
        </div>
      )}

      {/* ── Tamil Print Overlay ── */}
      {showPrint && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #gold-stock-print, #gold-stock-print * { visibility: visible; }
              #gold-stock-print { position: fixed; top: 0; left: 0; width: 100%; padding: 20px; box-sizing: border-box; font-family: Arial, sans-serif; }
            }
          `}</style>

          <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">
              {/* Actions */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-line sticky top-0 bg-white rounded-t-xl z-10">
                <span className="text-sm font-semibold text-ink">தங்க சரக்கு அறிக்கை / Gold Stock Report</span>
                <div className="flex gap-2">
                  <button onClick={() => window.print()}
                    className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 font-medium">அச்சிடு / Print</button>
                  <button onClick={() => setShowPrint(false)}
                    className="border border-line text-xs px-3 py-1.5 rounded-lg2 text-ink-dim">மூடு</button>
                </div>
              </div>

              {/* Receipt */}
              <div id="gold-stock-print" className="p-6 text-[13px] leading-relaxed">

                {/* Shop header */}
                <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
                  <p className="text-lg font-bold text-gray-900">சபரிநாதன் நகைக்கடை</p>
                  <p className="text-xs text-gray-500">Sabarinathan Jewellery</p>
                  <p className="text-sm font-semibold mt-1 text-gray-800">தங்க சரக்கு நிலை அறிக்கை</p>
                  <p className="text-[11px] text-gray-500">Gold Stock Report</p>
                  <p className="text-xs text-gray-600 mt-1">தேதி / Date: <strong>{shortDate(date)}</strong></p>
                </div>

                {/* Grand totals */}
                <div className="grid grid-cols-3 gap-3 mb-5 text-center">
                  {[
                    ["மொத்தம்", "Grand Total", grams(grandTotal)],
                    ["வால்ட்", "Vault", grams(vaultTotal)],
                    ["வெளி", "Outer", grams(outerTotal)],
                  ].map(([ta, en, val]) => (
                    <div key={ta} className="border border-gray-300 rounded px-2 py-2">
                      <p className="text-[10px] text-gray-500">{ta} / {en}</p>
                      <p className="font-bold text-gray-900 font-mono">{val}</p>
                    </div>
                  ))}
                </div>

                {/* Vault section */}
                {entries.some(e => e.stock_type === "vault") && (
                  <div className="mb-5">
                    <div className="bg-gray-100 px-3 py-1.5 rounded mb-2 flex justify-between items-center">
                      <span className="font-bold text-gray-800 text-sm">வால்ட் சரக்கு <span className="font-normal text-gray-500 text-xs">Vault Stock</span></span>
                      <span className="font-mono font-semibold text-sm">{grams(vaultTotal)}</span>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-gray-300 text-gray-500">
                          <th className="text-left py-1.5 pr-2">#</th>
                          <th className="text-left py-1.5 pr-2">வகை / Category</th>
                          <th className="text-right py-1.5 pr-2">குறி. எடை / Tagged</th>
                          <th className="text-right py-1.5 pr-2">எண் / Qty</th>
                          <th className="text-right py-1.5 pr-2">தொகுதி / Bulk</th>
                          <th className="text-right py-1.5">ஒதுக்கு / Res.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allCategories.filter(c => entries.some(e => e.stock_type === "vault" && e.category === c)).map((cat, i) => {
                          const e = entries.find(e => e.stock_type === "vault" && e.category === cat)!;
                          return (
                            <tr key={cat} className="border-b border-gray-100 last:border-0">
                              <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                              <td className="py-1.5 pr-2 font-semibold text-gray-900">{cat}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{Number(e.total_weight_g) > 0 ? grams(e.total_weight_g) : "—"}</td>
                              <td className="py-1.5 pr-2 text-right">{e.qty != null ? `${e.qty}` : "—"}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{Number(e.untagged_weight_g) > 0 ? grams(e.untagged_weight_g) : "—"}</td>
                              <td className="py-1.5 text-right font-mono">{Number(e.reserved_weight_g) > 0 ? grams(e.reserved_weight_g) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-400 font-semibold">
                          <td colSpan={2} className="py-1.5 pr-2">வால்ட் மொத்தம் / Vault Total</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{grams(vaultTagged)}</td>
                          <td className="py-1.5 pr-2 text-right">{entries.filter(e => e.stock_type === "vault" && e.qty != null).reduce((s, e) => s + (e.qty ?? 0), 0)}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{grams(vaultBulk)}</td>
                          <td className="py-1.5 text-right font-mono">{reservedTotal > 0 ? grams(reservedTotal) : "—"}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Outer section */}
                {entries.some(e => e.stock_type === "outer") && (
                  <div className="mb-5">
                    <div className="bg-gray-100 px-3 py-1.5 rounded mb-2 flex justify-between items-center">
                      <span className="font-bold text-gray-800 text-sm">வெளி சரக்கு <span className="font-normal text-gray-500 text-xs">Outer Stock</span></span>
                      <span className="font-mono font-semibold text-sm">{grams(outerTotal)}</span>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-gray-300 text-gray-500">
                          <th className="text-left py-1.5 pr-2">#</th>
                          <th className="text-left py-1.5 pr-2">வகை / Category</th>
                          <th className="text-right py-1.5 pr-2">குறி. எடை / Tagged</th>
                          <th className="text-right py-1.5 pr-2">எண் / Qty</th>
                          <th className="text-right py-1.5">தொகுதி / Bulk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allCategories.filter(c => entries.some(e => e.stock_type === "outer" && e.category === c)).map((cat, i) => {
                          const e = entries.find(e => e.stock_type === "outer" && e.category === cat)!;
                          return (
                            <tr key={cat} className="border-b border-gray-100 last:border-0">
                              <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                              <td className="py-1.5 pr-2 font-semibold text-gray-900">{cat}</td>
                              <td className="py-1.5 pr-2 text-right font-mono">{Number(e.total_weight_g) > 0 ? grams(e.total_weight_g) : "—"}</td>
                              <td className="py-1.5 pr-2 text-right">{e.qty != null ? `${e.qty}` : "—"}</td>
                              <td className="py-1.5 text-right font-mono">{Number(e.untagged_weight_g) > 0 ? grams(e.untagged_weight_g) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-400 font-semibold">
                          <td colSpan={2} className="py-1.5 pr-2">வெளி மொத்தம் / Outer Total</td>
                          <td className="py-1.5 pr-2 text-right font-mono">{grams(outerTagged)}</td>
                          <td className="py-1.5 pr-2 text-right">{entries.filter(e => e.stock_type === "outer" && e.qty != null).reduce((s, e) => s + (e.qty ?? 0), 0)}</td>
                          <td className="py-1.5 text-right font-mono">{grams(outerBulk)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Signature */}
                <div className="grid grid-cols-2 gap-6 mt-6 pt-4 border-t border-gray-300">
                  <div className="text-center">
                    <div className="border-b border-gray-400 h-8 mb-1"></div>
                    <p className="text-[10px] text-gray-600">தயாரித்தவர் கையொப்பம்</p>
                    <p className="text-[9px] text-gray-400">Prepared By</p>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-gray-400 h-8 mb-1"></div>
                    <p className="text-[10px] text-gray-600">கடை கையொப்பம்</p>
                    <p className="text-[9px] text-gray-400">Authorised Signature</p>
                  </div>
                </div>
                <p className="text-center text-[10px] text-gray-400 mt-4">சபரிநாதன் நகைக்கடை — Sabarinathan Jewellery</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
