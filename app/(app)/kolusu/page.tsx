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
        .select("*")
        .order("box_no");
      if (error) throw error;
      return data ?? [];
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
      // Deduct from box
      const { data: box, error: fetchErr } = await client
        .from("kolusu_boxes")
        .select("current_gross_wt_g, current_qty")
        .eq("id", d.box_id)
        .single();
      if (fetchErr) throw fetchErr;
      const { error: updErr } = await client.from("kolusu_boxes").update({
        current_gross_wt_g: parseFloat((box.current_gross_wt_g - total_wt_g).toFixed(3)),
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

export default function KolusuPage() {
  const globalDate = useGlobalDate((s) => s.date);
  const { data: boxes, isLoading } = useKolusuBoxes();
  const { data: transactions } = useKolusuTransactions();
  const addBox = useAddBox();
  const recordSale = useRecordSale();

  const [tab, setTab] = useState<"boxes" | "history" | "add_box">("boxes");

  // Sale form state (per box inline)
  const [saleBoxId, setSaleBoxId] = useState<string | null>(null);
  const [saleForm, setSaleForm] = useState({ tx_date: globalDate, qty: 1, raw_wt_g: 0, cover_per_piece: 1.3, bill_no: "", notes: "" });

  // Add box form
  const [boxForm, setBoxForm] = useState({ box_no: "", color: "", size: "", box_tare_g: 0, initial_gross_wt_g: 0, initial_qty: 0, notes: "" });

  const coverTotal = parseFloat((saleForm.qty * saleForm.cover_per_piece).toFixed(3));
  const totalWt = parseFloat((saleForm.raw_wt_g + coverTotal).toFixed(3));

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
          {(["boxes", "history"] as const).map((t_) => (
            <button key={t_} onClick={() => setTab(t_)}
              className={clsx("px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px", tab === t_ ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink")}>
              {t_ === "boxes" ? "Boxes" : "Sale History"}
            </button>
          ))}
        </div>
      )}

      {/* Boxes tab */}
      {tab === "boxes" && !isLoading && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Box No</th>
                <th className="text-left px-3 py-2.5">Color / Size</th>
                <th className="text-right px-3 py-2.5">Tare (g)</th>
                <th className="text-right px-3 py-2.5">Gross (g)</th>
                <th className="text-right px-3 py-2.5">Net Kolusu (g)</th>
                <th className="text-right px-3 py-2.5">Qty</th>
                <th className="px-3 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {boxes?.map((box) => {
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
                        <button onClick={() => { setSaleBoxId(saleBoxId === box.id ? null : box.id); setSaleForm({ tx_date: globalDate, qty: 1, raw_wt_g: 0, cover_per_piece: 1.3, bill_no: "", notes: "" }); }}
                          className="text-xs bg-gold text-white px-2 py-1 rounded-lg2 hover:opacity-80">
                          Record Sale
                        </button>
                      </td>
                    </tr>
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
                                {" · "}Total deducted: <strong className="text-err">{grams(totalWt)}</strong>
                                {" · "}Remaining gross: <strong className="text-ok">{grams(box.current_gross_wt_g - totalWt)}</strong>
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
              {!boxes?.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">No boxes yet. Add your first box.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Box</th>
                <th className="text-right px-3 py-2.5">Qty</th>
                <th className="text-right px-3 py-2.5">Raw (g)</th>
                <th className="text-right px-3 py-2.5">Cover (g)</th>
                <th className="text-right px-3 py-2.5">Total (g)</th>
                <th className="text-left px-3 py-2.5">Bill No</th>
              </tr>
            </thead>
            <tbody>
              {transactions?.map((tx) => (
                <tr key={tx.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(tx.tx_date)}</td>
                  <td className="px-3 py-2.5 font-mono text-info">{tx.kolusu_boxes?.box_no ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-err">{tx.qty_change}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{grams(tx.raw_wt_g)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{grams(tx.cover_wt_g)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-err">{grams(tx.total_wt_g)}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{tx.bill_no ?? "—"}</td>
                </tr>
              ))}
              {!transactions?.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">No sales recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && <p className="text-ink-dim text-sm">Loading…</p>}
    </div>
  );
}
