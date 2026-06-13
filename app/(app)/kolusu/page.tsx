"use client";

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { grams, shortDate } from "@/lib/format";
import { clsx } from "clsx";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold";

interface KolusuBox {
  id: string;
  box_no: string;
  color: string;
  size: string;
  box_tare_g: number;
  initial_gross_wt_g: number;
  current_gross_wt_g: number;
  initial_qty: number;
  current_qty: number;
  notes?: string;
}

interface KolusuTransaction {
  id: string;
  tx_date: string;
  box_id: string;
  qty_change: number;
  raw_wt_g: number;
  cover_wt_g: number;
  total_wt_g: number;
  bill_no?: string;
  notes?: string;
  kolusu_boxes?: { box_no: string };
}

function useKolusuBoxes() {
  return useQuery<KolusuBox[]>({
    queryKey: ["kolusu_boxes"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("kolusu_boxes")
        .select("*");
      if (error) throw error;
      return (data ?? []).sort((a, b) => parseInt(a.box_no) - parseInt(b.box_no) || a.box_no.localeCompare(b.box_no));
    },
  });
}

function useKolusuTransactions() {
  return useQuery<KolusuTransaction[]>({
    queryKey: ["kolusu_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("kolusu_transactions")
        .select("*, kolusu_boxes(box_no)")
        .order("tx_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useAddBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { box_no: string; color: string; size: string; box_tare_g: number; initial_gross_wt_g: number; initial_qty: number; notes?: string }) => {
      const { error } = await supabase().from("kolusu_boxes").insert({
        ...d,
        current_gross_wt_g: d.initial_gross_wt_g,
        current_qty: d.initial_qty,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kolusu_boxes"] }),
  });
}

function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { box_id: string; tx_date: string; qty: number; raw_wt_g: number; cover_wt_g: number; bill_no?: string; notes?: string }) => {
      const client = supabase();
      const total_wt_g = parseFloat((d.raw_wt_g + d.cover_wt_g).toFixed(3));
      const { error: txErr } = await client.from("kolusu_transactions").insert({
        tx_date: d.tx_date,
        box_id: d.box_id,
        qty_change: -d.qty,
        raw_wt_g: d.raw_wt_g,
        cover_wt_g: d.cover_wt_g,
        total_wt_g,
        bill_no: d.bill_no || null,
        notes: d.notes || null,
      });
      if (txErr) throw txErr;
      // Deduct only kolusu weight from box (cover is packaging, not inventory stock)
      const { data: box, error: fetchErr } = await client
        .from("kolusu_boxes")
        .select("current_gross_wt_g, current_qty")
        .eq("id", d.box_id)
        .single();
      if (fetchErr) throw fetchErr;
      const { error: updErr } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: parseFloat((box.current_gross_wt_g - d.raw_wt_g).toFixed(3)),
        current_qty: box.current_qty - d.qty,
        updated_at: new Date().toISOString(),
      }).eq("id", d.box_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kolusu_boxes"] });
      qc.invalidateQueries({ queryKey: ["kolusu_transactions"] });
    },
  });
}

function useRestock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: { box_id: string; tx_date: string; qty: number; gross_wt_g: number; bill_no?: string; notes?: string }) => {
      const client = supabase();
      const { error: txErr } = await client.from("kolusu_transactions").insert({
        tx_date: d.tx_date,
        box_id: d.box_id,
        qty_change: d.qty,
        raw_wt_g: d.gross_wt_g,
        cover_wt_g: 0,
        total_wt_g: d.gross_wt_g,
        bill_no: d.bill_no || null,
        notes: d.notes ? `RESTOCK: ${d.notes}` : "RESTOCK",
      });
      if (txErr) throw txErr;
      const { data: box, error: fetchErr } = await client
        .from("kolusu_boxes")
        .select("current_gross_wt_g, current_qty")
        .eq("id", d.box_id)
        .single();
      if (fetchErr) throw fetchErr;
      const { error: updErr } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: parseFloat((box.current_gross_wt_g + d.gross_wt_g).toFixed(3)),
        current_qty: box.current_qty + d.qty,
        updated_at: new Date().toISOString(),
      }).eq("id", d.box_id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kolusu_boxes"] });
      qc.invalidateQueries({ queryKey: ["kolusu_transactions"] });
    },
  });
}

interface KolusuPendingSale {
  id: string;
  created_at: string;
  tx_date: string;
  raw_wt_g: number;
  cover_wt_g: number;
  qty: number;
  description: string | null;
  bill_no: string | null;
  notes: string | null;
  staff_name: string | null;
  box_id: string | null;
  assigned_at: string | null;
  source: string;
}

function usePendingSales() {
  return useQuery<KolusuPendingSale[]>({
    queryKey: ["kolusu_pending_sales"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("kolusu_pending_sales")
        .select("*")
        .is("assigned_at", null)
        .order("tx_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function KolusuPage() {
  const globalDate = useGlobalDate((s) => s.date);
  const { data: boxes, isLoading } = useKolusuBoxes();
  const { data: transactions } = useKolusuTransactions();
  const addBox = useAddBox();
  const recordSale = useRecordSale();
  const restock = useRestock();
  const { data: pendingSales = [], isLoading: pendingLoading } = usePendingSales();

  const [tab, setTab] = useState<"boxes" | "history" | "pending" | "add_box" | "report">("boxes");
  const [reportFrom, setReportFrom] = useState("2026-06-01");

  // Direct box weight/qty correction
  const [editBoxId, setEditBoxId]   = useState<string | null>(null);
  const [editForm, setEditForm]     = useState({ gross_wt_g: 0, qty: 0, reason: "" });

  const editBox = useMutation({
    mutationFn: async ({ id, gross_wt_g, qty, reason }: { id: string; gross_wt_g: number; qty: number; reason: string }) => {
      const client = supabase();
      const { error } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: gross_wt_g,
        current_qty: qty,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      // Audit log as a correction transaction (zero qty_change so it doesn't affect counts)
      await client.from("kolusu_transactions").insert({
        tx_date:     new Date().toISOString().slice(0, 10),
        box_id:      id,
        qty_change:  0,
        raw_wt_g:    0,
        cover_wt_g:  0,
        total_wt_g:  0,
        notes:       `CORRECTION: set gross=${gross_wt_g}g qty=${qty}${reason ? ` — ${reason}` : ""}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kolusu_boxes"] });
      qc.invalidateQueries({ queryKey: ["kolusu_transactions"] });
      setEditBoxId(null);
    },
  });

  // Assign pending sale to a box
  const [assignId, setAssignId] = useState<string | null>(null);
  const [assignBoxId, setAssignBoxId] = useState("");

  const qc = useQueryClient();
  const assignPending = useMutation({
    mutationFn: async ({ pendingId, boxId }: { pendingId: string; boxId: string }) => {
      const client = supabase();
      const pending = pendingSales.find(p => p.id === pendingId);
      if (!pending) throw new Error("Entry not found");
      const total_wt_g = parseFloat((pending.raw_wt_g + pending.cover_wt_g).toFixed(3));
      // Create actual transaction
      const { error: txErr } = await client.from("kolusu_transactions").insert({
        tx_date:    pending.tx_date,
        box_id:     boxId,
        qty_change: -pending.qty,
        raw_wt_g:   pending.raw_wt_g,
        cover_wt_g: pending.cover_wt_g,
        total_wt_g,
        bill_no:    pending.bill_no || null,
        notes:      pending.description ? `${pending.description}${pending.notes ? ` · ${pending.notes}` : ""}` : (pending.notes || null),
      });
      if (txErr) throw txErr;
      // Deduct only kolusu weight from box (cover is packaging, not inventory stock)
      const { data: box, error: boxErr } = await client.from("kolusu_boxes").select("current_gross_wt_g, current_qty").eq("id", boxId).single();
      if (boxErr) throw boxErr;
      const { error: updErr } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: parseFloat((box.current_gross_wt_g - pending.raw_wt_g).toFixed(3)),
        current_qty: box.current_qty - pending.qty,
        updated_at: new Date().toISOString(),
      }).eq("id", boxId);
      if (updErr) throw updErr;
      // Mark pending as assigned
      await client.from("kolusu_pending_sales").update({ box_id: boxId, assigned_at: new Date().toISOString() }).eq("id", pendingId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kolusu_pending_sales"] });
      qc.invalidateQueries({ queryKey: ["kolusu_boxes"] });
      qc.invalidateQueries({ queryKey: ["kolusu_transactions"] });
      setAssignId(null);
      setAssignBoxId("");
    },
  });

  // Transfer sale to a different box
  const [transferTxId, setTransferTxId]   = useState<string | null>(null);
  const [transferBoxId, setTransferBoxId] = useState("");

  const transferSale = useMutation({
    mutationFn: async ({ txId, oldBoxId, newBoxId }: { txId: string; oldBoxId: string; newBoxId: string }) => {
      const client = supabase();
      const tx = transactions?.find(t => t.id === txId);
      if (!tx) throw new Error("Transaction not found");
      const absQty = Math.abs(tx.qty_change);

      // Reverse deduction on old box
      const { data: oldBox, error: e1 } = await client.from("kolusu_boxes").select("current_gross_wt_g, current_qty").eq("id", oldBoxId).single();
      if (e1) throw e1;
      const { error: e2 } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: parseFloat((oldBox.current_gross_wt_g + tx.raw_wt_g).toFixed(3)),
        current_qty: oldBox.current_qty + absQty,
        updated_at: new Date().toISOString(),
      }).eq("id", oldBoxId);
      if (e2) throw e2;

      // Apply deduction on new box
      const { data: newBox, error: e3 } = await client.from("kolusu_boxes").select("current_gross_wt_g, current_qty").eq("id", newBoxId).single();
      if (e3) throw e3;
      const { error: e4 } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: parseFloat((newBox.current_gross_wt_g - tx.raw_wt_g).toFixed(3)),
        current_qty: newBox.current_qty - absQty,
        updated_at: new Date().toISOString(),
      }).eq("id", newBoxId);
      if (e4) throw e4;

      // Update the transaction's box
      const { error: e5 } = await client.from("kolusu_transactions").update({ box_id: newBoxId }).eq("id", txId);
      if (e5) throw e5;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kolusu_boxes"] });
      qc.invalidateQueries({ queryKey: ["kolusu_transactions"] });
      setTransferTxId(null);
      setTransferBoxId("");
    },
  });

  const dismissPending = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("kolusu_pending_sales")
        .update({ assigned_at: new Date().toISOString(), notes: "dismissed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kolusu_pending_sales"] }),
  });

  // Sale form state (per box inline)
  const [saleBoxId, setSaleBoxId] = useState<string | null>(null);
  const [saleForm, setSaleForm] = useState({ tx_date: globalDate, qty: 1, raw_wt_g: 0, cover_per_piece: 1.3, bill_no: "", notes: "" });

  // Restock form state
  const [restockBoxId, setRestockBoxId] = useState<string | null>(null);
  const [restockForm, setRestockForm] = useState({ tx_date: globalDate, qty: 0, gross_wt_g: 0, bill_no: "", notes: "" });

  // Box search
  const [boxSearch, setBoxSearch] = useState("");

  // Add box form
  const [boxForm, setBoxForm] = useState({ box_no: "", color: "", size: "", box_tare_g: 0, initial_gross_wt_g: 0, initial_qty: 0, notes: "" });

  const coverTotal = parseFloat((saleForm.qty * saleForm.cover_per_piece).toFixed(3));
  const totalWt = parseFloat((saleForm.raw_wt_g + coverTotal).toFixed(3));

  const q = boxSearch.trim().toLowerCase();
  const filteredBoxes = q
    ? (boxes ?? []).filter(b =>
        b.box_no.toLowerCase().includes(q) ||
        b.color.toLowerCase().includes(q) ||
        b.size.toLowerCase().includes(q)
      )
    : (boxes ?? []);

  // Summary
  const totalGross = boxes?.reduce((s, b) => s + b.current_gross_wt_g, 0) ?? 0;
  const totalTare = boxes?.reduce((s, b) => s + b.box_tare_g, 0) ?? 0;
  const netKolusuWt = totalGross - totalTare;
  const totalPieces = boxes?.reduce((s, b) => s + b.current_qty, 0) ?? 0;

  async function handleSale(e: React.FormEvent) {
    e.preventDefault();
    if (!saleBoxId || saleForm.qty <= 0 || saleForm.raw_wt_g <= 0) return;
    await recordSale.mutateAsync({
      box_id: saleBoxId,
      tx_date: saleForm.tx_date,
      qty: saleForm.qty,
      raw_wt_g: saleForm.raw_wt_g,
      cover_wt_g: coverTotal,
      bill_no: saleForm.bill_no,
      notes: saleForm.notes,
    });
    setSaleBoxId(null);
    setSaleForm({ tx_date: globalDate, qty: 1, raw_wt_g: 0, cover_per_piece: 1.3, bill_no: "", notes: "" });
  }

  async function handleRestock(e: React.FormEvent) {
    e.preventDefault();
    if (!restockBoxId || restockForm.qty <= 0 || restockForm.gross_wt_g <= 0) return;
    await restock.mutateAsync({
      box_id: restockBoxId,
      tx_date: restockForm.tx_date,
      qty: restockForm.qty,
      gross_wt_g: restockForm.gross_wt_g,
      bill_no: restockForm.bill_no,
      notes: restockForm.notes,
    });
    setRestockBoxId(null);
    setRestockForm({ tx_date: globalDate, qty: 0, gross_wt_g: 0, bill_no: "", notes: "" });
  }

  async function handleAddBox(e: React.FormEvent) {
    e.preventDefault();
    await addBox.mutateAsync(boxForm);
    setBoxForm({ box_no: "", color: "", size: "", box_tare_g: 0, initial_gross_wt_g: 0, initial_qty: 0, notes: "" });
    setTab("boxes");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Kolusu Inventory</h1>
        <button onClick={() => setTab(tab === "add_box" ? "boxes" : "add_box")}
          className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          {tab === "add_box" ? "Cancel" : "+ Add Box"}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Gross (g)", value: grams(totalGross) },
          { label: "Total Tare (g)", value: grams(totalTare) },
          { label: "Net Kolusu (g)", value: grams(netKolusuWt), highlight: true },
          { label: "Total Pieces", value: totalPieces.toString() },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim">{s.label}</p>
            <p className={clsx("text-lg font-bold mt-0.5", s.highlight ? "text-gold" : "text-ink")}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add Box Form */}
      {tab === "add_box" && (
        <form onSubmit={handleAddBox} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
          <h2 className="font-semibold text-ink">Add New Box</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Box No *</label>
              <input type="text" value={boxForm.box_no} onChange={(e) => setBoxForm({ ...boxForm, box_no: e.target.value })} className={inp} placeholder="e.g. BOX01" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Color</label>
              <input type="text" value={boxForm.color} onChange={(e) => setBoxForm({ ...boxForm, color: e.target.value })} className={inp} placeholder="e.g. Yellow" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Size</label>
              <input type="text" value={boxForm.size} onChange={(e) => setBoxForm({ ...boxForm, size: e.target.value })} className={inp} placeholder="e.g. Small" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Box Tare (g)</label>
              <input type="number" step="0.001" value={boxForm.box_tare_g || ""} onChange={(e) => setBoxForm({ ...boxForm, box_tare_g: parseFloat(e.target.value) || 0 })} className={inp} placeholder="Plastic box weight" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Gross Weight (g) *</label>
              <input type="number" step="0.001" value={boxForm.initial_gross_wt_g || ""} onChange={(e) => setBoxForm({ ...boxForm, initial_gross_wt_g: parseFloat(e.target.value) || 0 })} className={inp} placeholder="Total weight incl. box" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Initial Qty *</label>
              <input type="number" step="1" value={boxForm.initial_qty || ""} onChange={(e) => setBoxForm({ ...boxForm, initial_qty: parseInt(e.target.value) || 0 })} className={inp} placeholder="Piece count" required />
            </div>
            {boxForm.box_tare_g > 0 && boxForm.initial_gross_wt_g > 0 && (
              <div className="col-span-2 sm:col-span-3 text-sm text-ink-dim">
                Net kolusu weight: <strong className="text-gold">{grams(boxForm.initial_gross_wt_g - boxForm.box_tare_g)}</strong>
                {boxForm.initial_qty > 0 && <> · Avg per piece: <strong>{grams((boxForm.initial_gross_wt_g - boxForm.box_tare_g) / boxForm.initial_qty)}</strong></>}
              </div>
            )}
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-xs font-medium text-ink-dim mb-1">Notes</label>
              <input type="text" value={boxForm.notes} onChange={(e) => setBoxForm({ ...boxForm, notes: e.target.value })} className={inp} placeholder="Optional" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={addBox.isPending} className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">Save Box</button>
            <button type="button" onClick={() => setTab("boxes")} className="border border-line text-sm px-5 py-2 rounded-lg2">Cancel</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      {tab !== "add_box" && (
        <div className="flex border-b border-line gap-1">
          {(["boxes", "pending", "history", "report"] as const).map((t_) => (
            <button key={t_} onClick={() => setTab(t_)}
              className={clsx("px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px relative", tab === t_ ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink")}>
              {t_ === "boxes" ? "Boxes" : t_ === "pending" ? "Pending" : t_ === "history" ? "History" : "Report"}
              {t_ === "pending" && pendingSales.length > 0 && (
                <span className="ml-1.5 bg-err text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendingSales.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Boxes tab */}
      {tab === "boxes" && !isLoading && (
        <>
          <div className="flex items-center gap-2">
            <input
              value={boxSearch}
              onChange={e => setBoxSearch(e.target.value)}
              placeholder="Search by size, color or box no… e.g. 9.5 M"
              className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
            {boxSearch && (
              <button onClick={() => setBoxSearch("")} className="text-xs text-err hover:underline">Clear</button>
            )}
          </div>
          {q && <p className="text-xs text-ink-dim">{filteredBoxes.length} box(es) match &quot;{boxSearch}&quot;</p>}
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "540px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Box No</th>
                <th className="text-left px-3 py-2.5">Color / Size</th>
                <th className="text-right px-3 py-2.5">Tare (g)</th>
                <th className="text-right px-3 py-2.5">Gross (g)</th>
                <th className="text-right px-3 py-2.5">Net Kolusu (g)</th>
                <th className="text-right px-3 py-2.5">Qty</th>
                <th className="px-3 py-2.5 w-36"></th>
              </tr>
            </thead>
            <tbody>
              {filteredBoxes.map((box) => {
                const netWt = box.current_gross_wt_g - box.box_tare_g;
                const sold = box.initial_qty - box.current_qty;
                return (
                  <Fragment key={box.id}>
                    <tr className={clsx("border-b border-line last:border-0 hover:bg-canvas/50", saleBoxId === box.id && "bg-canvas")}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-info">{box.box_no}</td>
                      <td className="px-3 py-2.5 text-ink-dim">{[box.color, box.size].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{grams(box.box_tare_g)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{grams(box.current_gross_wt_g)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-gold">{grams(netWt)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-semibold">{box.current_qty}</span>
                        {sold > 0 && <span className="text-ink-dim text-xs ml-1">(-{sold})</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => {
                            setRestockBoxId(null);
                            setSaleBoxId(saleBoxId === box.id ? null : box.id);
                            setSaleForm({ tx_date: globalDate, qty: 1, raw_wt_g: 0, cover_per_piece: 1.3, bill_no: "", notes: "" });
                          }}
                            className="text-xs bg-gold text-white px-2 py-1 rounded-lg2 hover:opacity-80">
                            Sale
                          </button>
                          <button onClick={() => {
                            setSaleBoxId(null);
                            setRestockBoxId(restockBoxId === box.id ? null : box.id);
                            setRestockForm({ tx_date: globalDate, qty: 0, gross_wt_g: 0, bill_no: "", notes: "" });
                          }}
                            className="text-xs bg-ok/80 text-white px-2 py-1 rounded-lg2 hover:opacity-80">
                            +Stock
                          </button>
                          <button onClick={() => {
                            setSaleBoxId(null);
                            setRestockBoxId(null);
                            setEditBoxId(editBoxId === box.id ? null : box.id);
                            setEditForm({ gross_wt_g: box.current_gross_wt_g, qty: box.current_qty, reason: "" });
                          }}
                            className="text-xs border border-line text-ink-dim px-2 py-1 rounded-lg2 hover:border-gold hover:text-gold">
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                    {restockBoxId === box.id && (
                      <tr className="border-b border-line bg-ok/5">
                        <td colSpan={7} className="px-4 py-4">
                          <form onSubmit={handleRestock} className="space-y-3">
                            <p className="text-xs font-semibold text-ok uppercase tracking-wide">Add Stock to {box.box_no} — {[box.color, box.size].filter(Boolean).join(" / ")}</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Date</label>
                                <input type="date" value={restockForm.tx_date}
                                  onChange={e => setRestockForm({ ...restockForm, tx_date: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Qty Added *</label>
                                <input type="number" step="1" min="1" value={restockForm.qty || ""}
                                  onChange={e => setRestockForm({ ...restockForm, qty: parseInt(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full"
                                  autoFocus />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Gross Weight Added (g) *</label>
                                <input type="number" step="0.001" min="0" value={restockForm.gross_wt_g || ""}
                                  onChange={e => setRestockForm({ ...restockForm, gross_wt_g: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Bill / Ref No</label>
                                <input type="text" value={restockForm.bill_no}
                                  onChange={e => setRestockForm({ ...restockForm, bill_no: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full"
                                  placeholder="Optional" />
                              </div>
                            </div>
                            {restockForm.qty > 0 && restockForm.gross_wt_g > 0 && (
                              <div className="text-xs text-ink-dim bg-white rounded-lg px-3 py-2 border border-line">
                                New gross: <strong className="text-ok">{grams(box.current_gross_wt_g + restockForm.gross_wt_g)}</strong>
                                {" · "}New qty: <strong className="text-ok">{box.current_qty + restockForm.qty}</strong>
                                {restockForm.qty > 0 && <> · Avg/piece added: <strong>{grams(restockForm.gross_wt_g / restockForm.qty)}</strong></>}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button type="submit" disabled={restock.isPending || restockForm.qty <= 0 || restockForm.gross_wt_g <= 0}
                                className="bg-ok text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                {restock.isPending ? "Saving…" : "Add Stock"}
                              </button>
                              <button type="button" onClick={() => setRestockBoxId(null)}
                                className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                    {editBoxId === box.id && (
                      <tr className="border-b border-line bg-warn/5">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-3">
                            <p className="text-xs font-semibold text-warn uppercase tracking-wide">
                              Correct stock for {box.box_no} — {[box.color, box.size].filter(Boolean).join(" / ")}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Correct Gross Weight (g) *</label>
                                <input type="number" step="0.001" min="0"
                                  value={editForm.gross_wt_g || ""}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setEditForm(f => ({ ...f, gross_wt_g: parseFloat(e.target.value) || 0 }))}
                                  className="border border-warn rounded-lg2 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-warn w-full"
                                  autoFocus />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Correct Qty *</label>
                                <input type="number" step="1" min="0"
                                  value={editForm.qty || ""}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setEditForm(f => ({ ...f, qty: parseInt(e.target.value) || 0 }))}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="text-xs text-ink-dim block mb-1">Reason for correction</label>
                                <input type="text" value={editForm.reason} placeholder="e.g. wrong initial weight entered"
                                  onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                            </div>
                            {editForm.gross_wt_g > 0 && (
                              <p className="text-xs text-ink-dim">
                                Change: <span className="font-mono">{grams(box.current_gross_wt_g)}</span> → <span className="font-mono font-semibold text-warn">{grams(editForm.gross_wt_g)}</span>
                                {" · "}Qty: <span className="font-semibold">{box.current_qty}</span> → <span className="font-semibold text-warn">{editForm.qty}</span>
                                {" · "}Net kolusu will be: <span className="font-semibold text-gold">{grams(editForm.gross_wt_g - box.box_tare_g)}</span>
                              </p>
                            )}
                            {editBox.isError && <p className="text-xs text-err">{(editBox.error as Error).message}</p>}
                            <div className="flex gap-2">
                              <button
                                disabled={editBox.isPending || editForm.gross_wt_g <= 0}
                                onClick={() => editBox.mutate({ id: box.id, gross_wt_g: editForm.gross_wt_g, qty: editForm.qty, reason: editForm.reason })}
                                className="bg-warn text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                {editBox.isPending ? "Saving…" : "Save Correction"}
                              </button>
                              <button onClick={() => setEditBoxId(null)}
                                className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {saleBoxId === box.id && (
                      <tr className="border-b border-line bg-canvas/60">
                        <td colSpan={7} className="px-4 py-4">
                          <form onSubmit={handleSale} className="space-y-3">
                            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Record Sale from {box.box_no}</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Date</label>
                                <input type="date" value={saleForm.tx_date}
                                  onChange={(e) => setSaleForm({ ...saleForm, tx_date: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Qty Sold *</label>
                                <input type="number" step="1" min="1" max={box.current_qty} value={saleForm.qty || ""}
                                  onChange={(e) => setSaleForm({ ...saleForm, qty: parseInt(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Raw Wt (g) from Bill *</label>
                                <input type="number" step="0.001" value={saleForm.raw_wt_g || ""}
                                  onChange={(e) => setSaleForm({ ...saleForm, raw_wt_g: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full"
                                  autoFocus />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Cover/piece (g)</label>
                                <input type="number" step="0.1" value={saleForm.cover_per_piece || ""}
                                  onChange={(e) => setSaleForm({ ...saleForm, cover_per_piece: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full" />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Bill No</label>
                                <input type="text" value={saleForm.bill_no}
                                  onChange={(e) => setSaleForm({ ...saleForm, bill_no: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full"
                                  placeholder="Optional" />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="text-xs text-ink-dim block mb-1">Notes</label>
                                <input type="text" value={saleForm.notes}
                                  onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full"
                                  placeholder="Optional" />
                              </div>
                            </div>
                            {saleForm.raw_wt_g > 0 && (
                              <div className="text-xs text-ink-dim bg-white rounded-lg px-3 py-2 border border-line">
                                Cover total: <strong>{grams(coverTotal)}</strong> ({saleForm.qty} × {saleForm.cover_per_piece}g)
                                {" · "}Kolusu deducted: <strong className="text-err">{grams(saleForm.raw_wt_g)}</strong>
                                {" · "}Remaining gross: <strong className="text-ok">{grams(box.current_gross_wt_g - saleForm.raw_wt_g)}</strong>
                                {" · "}Remaining qty: <strong className="text-ok">{box.current_qty - saleForm.qty}</strong>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button type="submit" disabled={recordSale.isPending || saleForm.qty <= 0 || saleForm.raw_wt_g <= 0}
                                className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">Save</button>
                              <button type="button" onClick={() => setSaleBoxId(null)}
                                className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filteredBoxes.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">
                  {q ? `No boxes match "${boxSearch}".` : "No boxes yet. Add your first box."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Pending tab */}
      {tab === "pending" && (
        <div className="space-y-3">
          {pendingLoading ? (
            <p className="text-ink-dim text-sm">Loading…</p>
          ) : pendingSales.length === 0 ? (
            <div className="bg-white border border-line rounded-xl p-8 text-center text-ink-dim shadow-soft text-sm">
              No pending entries — all caught up!
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-dim">{pendingSales.length} unassigned sale(s) from staff. Pick the box for each and confirm.</p>
              <div className="space-y-2">
                {pendingSales.map((p) => (
                  <div key={p.id} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
                    <div className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink">{p.raw_wt_g}g</span>
                          <span className="text-xs text-ink-dim">+ {p.cover_wt_g}g cover</span>
                          {p.qty > 1 && <span className="text-xs bg-info/10 text-info px-1.5 py-0.5 rounded-full">×{p.qty}</span>}
                          {p.source === "chat" && <span className="text-xs bg-warn/10 text-warn px-1.5 py-0.5 rounded-full">chat</span>}
                        </div>
                        {p.description && <div className="text-xs text-ink-dim font-medium">{p.description}</div>}
                        <div className="text-xs text-ink-dim">
                          {shortDate(p.tx_date)} · by {p.staff_name ?? "—"}
                          {p.bill_no && <> · Bill {p.bill_no}</>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-err">
                          −{grams(parseFloat((p.raw_wt_g + p.cover_wt_g).toFixed(3)))}
                        </div>
                      </div>
                    </div>

                    {/* Assign form */}
                    {assignId === p.id ? (
                      <div className="border-t border-line px-4 py-3 bg-canvas/50 space-y-2">
                        <p className="text-xs text-ink-dim font-medium">Which box?</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {(boxes ?? []).map(b => (
                            <button key={b.id}
                              onClick={() => setAssignBoxId(assignBoxId === b.id ? "" : b.id)}
                              className={clsx(
                                "text-xs px-2 py-1.5 rounded-lg2 border text-left transition-colors",
                                assignBoxId === b.id ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"
                              )}>
                              <span className="font-mono font-medium">{b.box_no}</span>
                              <span className="block text-[11px] opacity-80">{[b.color, b.size].filter(Boolean).join(" / ")}</span>
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={!assignBoxId || assignPending.isPending}
                            onClick={() => assignPending.mutate({ pendingId: p.id, boxId: assignBoxId })}
                            className="bg-ok text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                            {assignPending.isPending ? "Saving…" : "Confirm"}
                          </button>
                          <button onClick={() => { setAssignId(null); setAssignBoxId(""); }}
                            className="border border-line text-xs px-4 py-1.5 rounded-lg2 text-ink-dim">Cancel</button>
                          <button
                            onClick={() => { if (window.confirm("Dismiss this entry without recording?")) dismissPending.mutate(p.id); }}
                            className="text-xs text-err hover:underline ml-auto">Dismiss</button>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-line px-4 py-2 flex gap-2">
                        <button onClick={() => { setAssignId(p.id); setAssignBoxId(""); }}
                          className="text-xs bg-gold text-white px-3 py-1 rounded-lg2 hover:opacity-80">
                          Assign to Box
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "520px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Box</th>
                <th className="text-right px-3 py-2.5">Qty</th>
                <th className="text-right px-3 py-2.5">Raw (g)</th>
                <th className="text-right px-3 py-2.5">Cover (g)</th>
                <th className="text-right px-3 py-2.5">Total (g)</th>
                <th className="text-left px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {transactions?.map((tx) => {
                const isRestock = tx.qty_change > 0;
                const isTransferring = transferTxId === tx.id;
                return (
                  <Fragment key={tx.id}>
                    <tr className={clsx("border-b border-line last:border-0 hover:bg-canvas/50", isRestock && "bg-ok/5", isTransferring && "bg-warn/5")}>
                      <td className="px-4 py-2.5 text-ink-dim">{shortDate(tx.tx_date)}</td>
                      <td className="px-3 py-2.5 font-mono text-info">{tx.kolusu_boxes?.box_no ?? "—"}</td>
                      <td className={clsx("px-3 py-2.5 text-right font-semibold", isRestock ? "text-ok" : "text-err")}>
                        {isRestock ? `+${tx.qty_change}` : tx.qty_change}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{grams(tx.raw_wt_g)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{isRestock ? "—" : grams(tx.cover_wt_g)}</td>
                      <td className={clsx("px-3 py-2.5 text-right font-mono font-semibold", isRestock ? "text-ok" : "text-err")}>
                        {isRestock ? `+${grams(tx.total_wt_g)}` : grams(tx.total_wt_g)}
                      </td>
                      <td className="px-3 py-2.5 text-ink-dim text-xs">
                        {tx.bill_no && <span className="mr-1">{tx.bill_no}</span>}
                        {isRestock && <span className="text-ok font-medium">Restock</span>}
                        {tx.notes && !isRestock && <span className="text-ink-dim">{tx.notes}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!isRestock && (
                          <button
                            onClick={() => {
                              setTransferTxId(isTransferring ? null : tx.id);
                              setTransferBoxId("");
                            }}
                            className={clsx(
                              "text-xs px-2 py-1 rounded-lg2 border transition-colors",
                              isTransferring
                                ? "border-warn/40 bg-warn/10 text-warn"
                                : "border-line text-ink-dim hover:border-gold hover:text-gold"
                            )}>
                            {isTransferring ? "Cancel" : "Transfer"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isTransferring && (
                      <tr className="border-b border-line bg-warn/5">
                        <td colSpan={8} className="px-4 py-4 space-y-3">
                          <p className="text-xs font-semibold text-warn uppercase tracking-wide">
                            Move this sale from Box <span className="font-mono">{tx.kolusu_boxes?.box_no ?? "?"}</span> to:
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {(boxes ?? [])
                              .filter(b => b.id !== tx.box_id)
                              .map(b => (
                                <button key={b.id}
                                  onClick={() => setTransferBoxId(transferBoxId === b.id ? "" : b.id)}
                                  className={clsx(
                                    "text-xs px-2 py-1.5 rounded-lg2 border text-left transition-colors",
                                    transferBoxId === b.id ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"
                                  )}>
                                  <span className="font-mono font-medium">{b.box_no}</span>
                                  <span className="block text-[11px] opacity-80">{[b.color, b.size].filter(Boolean).join(" / ")}</span>
                                </button>
                              ))}
                          </div>
                          {transferSale.isError && (
                            <p className="text-xs text-err">{(transferSale.error as Error).message}</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              disabled={!transferBoxId || transferSale.isPending}
                              onClick={() => transferSale.mutate({ txId: tx.id, oldBoxId: tx.box_id, newBoxId: transferBoxId })}
                              className="bg-warn text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                              {transferSale.isPending ? "Moving…" : "Confirm Transfer"}
                            </button>
                            <button onClick={() => { setTransferTxId(null); setTransferBoxId(""); }}
                              className="border border-line text-xs px-4 py-1.5 rounded-lg2 text-ink-dim">
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!transactions?.length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-dim">No transactions recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Report tab */}
      {tab === "report" && (() => {
        // Aggregate transactions per box from the chosen start date
        const txByBox = new Map<string, { addedWt: number; addedQty: number; soldWt: number; soldQty: number }>();
        for (const tx of transactions ?? []) {
          if (tx.tx_date < reportFrom) continue;
          if (!txByBox.has(tx.box_id)) txByBox.set(tx.box_id, { addedWt: 0, addedQty: 0, soldWt: 0, soldQty: 0 });
          const row = txByBox.get(tx.box_id)!;
          if (tx.qty_change > 0) {
            row.addedWt  += Number(tx.raw_wt_g);
            row.addedQty += tx.qty_change;
          } else {
            row.soldWt  += Number(tx.raw_wt_g);
            row.soldQty += Math.abs(tx.qty_change);
          }
        }

        const reportBoxes = (boxes ?? []);
        const totals = reportBoxes.reduce((acc, box) => {
          const t = txByBox.get(box.id) ?? { addedWt: 0, addedQty: 0, soldWt: 0, soldQty: 0 };
          // Opening = current − added + sold (reverse from current state)
          const openWt  = parseFloat((box.current_gross_wt_g - t.addedWt + t.soldWt).toFixed(3));
          const openQty = box.current_qty - t.addedQty + t.soldQty;
          acc.openWt  += openWt;
          acc.openQty += openQty;
          acc.addedWt  += t.addedWt;
          acc.addedQty += t.addedQty;
          acc.soldWt  += t.soldWt;
          acc.soldQty += t.soldQty;
          acc.curWt   += box.current_gross_wt_g;
          acc.curQty  += box.current_qty;
          return acc;
        }, { openWt: 0, openQty: 0, addedWt: 0, addedQty: 0, soldWt: 0, soldQty: 0, curWt: 0, curQty: 0 });

        return (
          <div className="space-y-4">
            {/* Date picker */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-ink-dim font-medium">Opening date</label>
              <input type="date" value={reportFrom}
                onChange={e => setReportFrom(e.target.value)}
                className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
              <span className="text-xs text-ink-dim">All transactions on or after this date are counted as movements</span>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Opening Gross",  value: grams(totals.openWt),  sub: `${totals.openQty} pcs`, color: "text-ink" },
                { label: "Added (Restock)", value: grams(totals.addedWt), sub: `${totals.addedQty} pcs`, color: "text-ok" },
                { label: "Sold",           value: grams(totals.soldWt),  sub: `${totals.soldQty} pcs`, color: "text-err" },
                { label: "Current Gross",  value: grams(totals.curWt),   sub: `${totals.curQty} pcs`, color: "text-gold" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft">
                  <p className="text-xs text-ink-dim">{s.label}</p>
                  <p className={clsx("text-lg font-bold mt-0.5", s.color)}>{s.value}</p>
                  <p className="text-xs text-ink-dim mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Box-wise table */}
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Box</th>
                    <th className="text-left px-3 py-2.5">Color / Size</th>
                    <th className="text-right px-3 py-2.5 border-l border-line">Opening Gross</th>
                    <th className="text-right px-3 py-2.5">Opening Qty</th>
                    <th className="text-right px-3 py-2.5 border-l border-line text-ok">+ Added (g)</th>
                    <th className="text-right px-3 py-2.5 text-ok">+ Qty</th>
                    <th className="text-right px-3 py-2.5 border-l border-line text-err">− Sold (g)</th>
                    <th className="text-right px-3 py-2.5 text-err">− Qty</th>
                    <th className="text-right px-3 py-2.5 border-l border-line text-gold">Current Gross</th>
                    <th className="text-right px-3 py-2.5 text-gold">Current Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {reportBoxes.map(box => {
                    const t = txByBox.get(box.id) ?? { addedWt: 0, addedQty: 0, soldWt: 0, soldQty: 0 };
                    const openWt  = parseFloat((box.current_gross_wt_g - t.addedWt + t.soldWt).toFixed(3));
                    const openQty = box.current_qty - t.addedQty + t.soldQty;
                    const noMovement = t.addedWt === 0 && t.soldWt === 0;
                    return (
                      <tr key={box.id} className={clsx("border-b border-line last:border-0", noMovement ? "opacity-50" : "hover:bg-canvas/40")}>
                        <td className="px-4 py-2.5 font-mono font-semibold text-info">{box.box_no}</td>
                        <td className="px-3 py-2.5 text-ink-dim text-xs">{[box.color, box.size].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono border-l border-line">{grams(openWt)}</td>
                        <td className="px-3 py-2.5 text-right">{openQty}</td>
                        <td className={clsx("px-3 py-2.5 text-right font-mono border-l border-line", t.addedWt > 0 ? "text-ok font-semibold" : "text-ink-dim")}>
                          {t.addedWt > 0 ? `+${grams(t.addedWt)}` : "—"}
                        </td>
                        <td className={clsx("px-3 py-2.5 text-right", t.addedQty > 0 ? "text-ok font-semibold" : "text-ink-dim")}>
                          {t.addedQty > 0 ? `+${t.addedQty}` : "—"}
                        </td>
                        <td className={clsx("px-3 py-2.5 text-right font-mono border-l border-line", t.soldWt > 0 ? "text-err font-semibold" : "text-ink-dim")}>
                          {t.soldWt > 0 ? grams(t.soldWt) : "—"}
                        </td>
                        <td className={clsx("px-3 py-2.5 text-right", t.soldQty > 0 ? "text-err font-semibold" : "text-ink-dim")}>
                          {t.soldQty > 0 ? t.soldQty : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-gold border-l border-line">{grams(box.current_gross_wt_g)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gold">{box.current_qty}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-canvas border-t-2 border-line text-xs font-semibold">
                    <td colSpan={2} className="px-4 py-2.5 text-ink-dim">Total</td>
                    <td className="px-3 py-2.5 text-right font-mono border-l border-line">{grams(totals.openWt)}</td>
                    <td className="px-3 py-2.5 text-right">{totals.openQty}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ok border-l border-line">+{grams(totals.addedWt)}</td>
                    <td className="px-3 py-2.5 text-right text-ok">+{totals.addedQty}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-err border-l border-line">{grams(totals.soldWt)}</td>
                    <td className="px-3 py-2.5 text-right text-err">{totals.soldQty}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gold border-l border-line">{grams(totals.curWt)}</td>
                    <td className="px-3 py-2.5 text-right text-gold">{totals.curQty}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-ink-dim">Boxes with no movement since the opening date are dimmed. Opening = Current − Added + Sold.</p>
          </div>
        );
      })()}

      {isLoading && <p className="text-ink-dim text-sm">Loading…</p>}
    </div>
  );
}
