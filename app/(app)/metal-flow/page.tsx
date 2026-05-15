"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { grams, shortDate } from "@/lib/format";

const TABS = ["intake", "batches", "reserve"] as const;
type Tab = (typeof TABS)[number];

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

// ─── Data hooks ────────────────────────────────────────────────────────────────

function useIntake() {
  return useQuery({
    queryKey: ["metal_intake"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("old_metal_intake")
        .select("*, customers(name)")
        .order("intake_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useBatches() {
  return useQuery({
    queryKey: ["melt_batches"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("melt_batches")
        .select("*, melt_batch_items(id, gross_wt, purity_pct, pure_wt, intake_id)")
        .order("batch_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useDispatches() {
  return useQuery({
    queryKey: ["metal_dispatches"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("metal_dispatches")
        .select("*")
        .order("dispatch_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function MetalFlowPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("intake");

  // Intake
  const { data: intakeData, isLoading: intakeLoading } = useIntake();
  const [selectedIntake, setSelectedIntake] = useState<Set<string>>(new Set());

  // Batches
  const { data: batchData, isLoading: batchLoading } = useBatches();
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [newBatch, setNewBatch] = useState({ batch_no: "", batch_date: globalDate, metal: "gold_22k", notes: "" });
  const [refineryForm, setRefineryForm] = useState<{ batchId: string; output_wt: number; loss_wt: number; output_purity_pct: number } | null>(null);

  // Reserve & dispatches
  const { data: dispatchData, isLoading: dispatchLoading } = useDispatches();
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({ dispatch_date: globalDate, metal: "gold", weight_g: 0, purpose: "supplier", party_name: "", notes: "" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const intake = (intakeData as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batches = (batchData as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatches = (dispatchData as any[]) ?? [];

  // ── Reserve calculation ──
  const refinedGold = batches
    .filter((b: any) => b.status === "refined" && b.metal?.startsWith("gold"))
    .reduce((s: number, b: any) => s + (b.output_wt ?? 0), 0);
  const refinedSilver = batches
    .filter((b: any) => b.status === "refined" && b.metal?.startsWith("silver"))
    .reduce((s: number, b: any) => s + (b.output_wt ?? 0), 0);
  const dispatchedGold = dispatches
    .filter((d: any) => d.metal === "gold")
    .reduce((s: number, d: any) => s + (d.weight_g ?? 0), 0);
  const dispatchedSilver = dispatches
    .filter((d: any) => d.metal === "silver")
    .reduce((s: number, d: any) => s + (d.weight_g ?? 0), 0);
  const goldReserve = Math.max(0, refinedGold - dispatchedGold);
  const silverReserve = Math.max(0, refinedSilver - dispatchedSilver);

  // ── Mutations ──

  const createBatch = useMutation({
    mutationFn: async (d: typeof newBatch) => {
      const { error } = await supabase().from("melt_batches").insert({
        batch_no: d.batch_no, batch_date: d.batch_date, metal: d.metal,
        input_wt: 0, status: "open", notes: d.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["melt_batches"] }); setShowNewBatch(false); setNewBatch({ batch_no: "", batch_date: globalDate, metal: "gold_22k", notes: "" }); },
  });

  const addToBatch = useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => {
      const client = supabase();
      const items = intake.filter((i: any) => selectedIntake.has(i.id));
      if (!items.length) throw new Error("No items selected");
      // Get batch
      const { data: batch } = await client.from("melt_batches").select("input_wt").eq("id", batchId).single();
      const addedPureWt = items.reduce((s: number, i: any) => s + (i.pure_wt ?? 0), 0);
      // Insert batch items
      await client.from("melt_batch_items").insert(
        items.map((i: any) => ({ batch_id: batchId, intake_id: i.id, gross_wt: i.gross_wt, purity_pct: i.purity_pct, pure_wt: i.pure_wt }))
      );
      // Update batch input_wt and intake statuses
      await client.from("melt_batches").update({ input_wt: ((batch as any)?.input_wt ?? 0) + addedPureWt }).eq("id", batchId);
      await client.from("old_metal_intake").update({ status: "used" }).in("id", items.map((i: any) => i.id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      setSelectedIntake(new Set());
    },
  });

  const updateBatchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase().from("melt_batches").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["melt_batches"] }),
  });

  const recordRefinery = useMutation({
    mutationFn: async (d: NonNullable<typeof refineryForm>) => {
      const purity = d.output_purity_pct || 99.9;
      const pure_wt_999 = parseFloat((d.output_wt * (purity / 100)).toFixed(3));
      const { error } = await supabase().from("melt_batches").update({
        output_wt: pure_wt_999,
        loss_wt: parseFloat(d.loss_wt.toFixed(3)),
        output_purity_pct: purity,
        status: "refined",
      }).eq("id", d.batchId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["melt_batches"] }); setRefineryForm(null); },
  });

  const saveDispatch = useMutation({
    mutationFn: async (d: typeof dispatchForm) => {
      const { error } = await supabase().from("metal_dispatches").insert({
        dispatch_date: d.dispatch_date, metal: d.metal, weight_g: d.weight_g,
        purpose: d.purpose, party_name: d.party_name || null, notes: d.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal_dispatches"] });
      setShowDispatch(false);
      setDispatchForm({ dispatch_date: globalDate, metal: "gold", weight_g: 0, purpose: "supplier", party_name: "", notes: "" });
    },
  });

  const tabLabel: Record<Tab, string> = { intake: "Old Metal Intake", batches: "Melt Batches", reserve: "Reserve & Dispatch" };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("metal_flow")}</h1>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === tb ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {tabLabel[tb]}
          </button>
        ))}
      </div>

      {/* ── INTAKE TAB ─────────────────────────────────────────── */}
      {tab === "intake" && (
        <div className="space-y-3">
          {selectedIntake.size > 0 && (
            <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm"><strong>{selectedIntake.size}</strong> item(s) selected</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-dim">Add to batch:</span>
                <select
                  onChange={(e) => e.target.value && addToBatch.mutate({ batchId: e.target.value })}
                  className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none">
                  <option value="">— select batch —</option>
                  {batches.filter((b: any) => b.status === "open").map((b: any) => (
                    <option key={b.id} value={b.id}>{b.batch_no} ({b.metal?.replace("_", " ")})</option>
                  ))}
                </select>
                <button onClick={() => setSelectedIntake(new Set())} className="text-xs text-err hover:underline">Clear</button>
              </div>
            </div>
          )}

          {intakeLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="px-4 py-2.5 w-8">
                      <input type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIntake(new Set(intake.filter((i: any) => i.status === "pending").map((i: any) => i.id)));
                          else setSelectedIntake(new Set());
                        }} className="accent-gold" />
                    </th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Customer</th>
                    <th className="text-left px-3 py-2.5">Metal</th>
                    <th className="text-right px-3 py-2.5">Gross</th>
                    <th className="text-right px-3 py-2.5">Purity%</th>
                    <th className="text-right px-3 py-2.5">Pure Wt</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {intake.map((r: any) => (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2.5">
                        {r.status === "pending" && (
                          <input type="checkbox" className="accent-gold"
                            checked={selectedIntake.has(r.id)}
                            onChange={(e) => {
                              const s = new Set(selectedIntake);
                              if (e.target.checked) s.add(r.id); else s.delete(r.id);
                              setSelectedIntake(s);
                            }} />
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-ink-dim">{shortDate(r.intake_date)}</td>
                      <td className="px-3 py-2.5">{r.customers?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 capitalize text-ink-dim">{r.metal?.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2.5 text-right">{grams(r.gross_wt)}</td>
                      <td className="px-3 py-2.5 text-right text-ink-dim">{r.purity_pct}%</td>
                      <td className="px-3 py-2.5 text-right text-gold font-mono">{grams(r.pure_wt)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          r.status === "pending" ? "bg-warn/10 text-warn" :
                          r.status === "used" ? "bg-ok/10 text-ok" : "bg-line text-ink-dim"
                        }`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                  {!intake.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BATCHES TAB ────────────────────────────────────────── */}
      {tab === "batches" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowNewBatch(true)}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
              + New Batch
            </button>
          </div>

          {showNewBatch && (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="text-sm font-semibold">Create Melt Batch</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Batch No *</label>
                  <input value={newBatch.batch_no} onChange={(e) => setNewBatch({ ...newBatch, batch_no: e.target.value })} className={inp} placeholder="B-001" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={newBatch.batch_date} onChange={(e) => setNewBatch({ ...newBatch, batch_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={newBatch.metal} onChange={(e) => setNewBatch({ ...newBatch, metal: e.target.value })} className={inp}>
                    <option value="gold_22k">Gold 22K</option>
                    <option value="gold_24k">Gold 24K</option>
                    <option value="gold_18k">Gold 18K</option>
                    <option value="silver">Silver</option>
                    <option value="silver_pure">Silver Pure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={newBatch.notes} onChange={(e) => setNewBatch({ ...newBatch, notes: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={!newBatch.batch_no || createBatch.isPending}
                  onClick={() => createBatch.mutate(newBatch)}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
                <button onClick={() => setShowNewBatch(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
            </div>
          )}

          {batchLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="space-y-3">
              {batches.map((b: any) => (
                <div key={b.id} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
                  {/* Batch header */}
                  <div className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-canvas/50"
                    onClick={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-info font-medium">{b.batch_no}</span>
                      <span className="text-xs text-ink-dim">{shortDate(b.batch_date)} · {b.metal?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-ink-dim">{(b.melt_batch_items ?? []).length} item(s) · {grams(b.input_wt)} in</span>
                      {b.output_wt && <span className="text-ok font-medium">{grams(b.output_wt)} out</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.status === "open" ? "bg-info/10 text-info" :
                        b.status === "melted" ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"
                      }`}>{b.status}</span>
                      <span className="text-ink-dim text-sm">{expandedBatch === b.id ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expandedBatch === b.id && (
                    <div className="border-t border-line px-5 py-4 space-y-4">
                      {/* Items */}
                      {(b.melt_batch_items ?? []).length > 0 && (
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-ink-dim border-b border-line">
                            <th className="text-right pb-2">Gross</th>
                            <th className="text-right pb-2">Purity%</th>
                            <th className="text-right pb-2">Pure Wt</th>
                          </tr></thead>
                          <tbody>
                            {(b.melt_batch_items ?? []).map((item: any) => (
                              <tr key={item.id} className="border-b border-line last:border-0">
                                <td className="py-1.5 text-right">{grams(item.gross_wt)}</td>
                                <td className="py-1.5 text-right text-ink-dim">{item.purity_pct}%</td>
                                <td className="py-1.5 text-right text-gold">{grams(item.pure_wt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {b.status === "open" && (
                          <button
                            onClick={() => updateBatchStatus.mutate({ id: b.id, status: "melted" })}
                            className="text-sm bg-warn/10 text-warn border border-warn/30 px-4 py-1.5 rounded-lg2 hover:bg-warn/20">
                            → Send to Refinery
                          </button>
                        )}
                        {b.status === "melted" && !refineryForm && (
                          <button
                            onClick={() => setRefineryForm({ batchId: b.id, output_wt: b.input_wt, loss_wt: 0, output_purity_pct: 99.9 })}
                            className="text-sm bg-ok/10 text-ok border border-ok/30 px-4 py-1.5 rounded-lg2 hover:bg-ok/20">
                            ✓ Record Refinery Return
                          </button>
                        )}
                        {b.status === "refined" && (
                          <span className="text-sm text-ok font-medium">
                            ✓ Refined: {grams(b.output_wt)} at {b.output_purity_pct ?? 99.9}% purity
                            {b.loss_wt > 0 && <span className="text-ink-dim ml-2">(loss: {grams(b.loss_wt)})</span>}
                          </span>
                        )}
                      </div>

                      {/* Refinery return form */}
                      {refineryForm !== null && refineryForm.batchId === b.id && (
                        <div className="bg-ok/5 border border-ok/20 rounded-lg2 p-4 space-y-3">
                          <h4 className="text-sm font-semibold text-ok">Refinery Return for {b.batch_no}</h4>
                          <p className="text-xs text-ink-dim">Input weight: <strong>{grams(b.input_wt)}</strong> (pure wt sent)</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-ink-dim mb-1">Output Weight (g) *</label>
                              <input type="number" step="0.001" value={refineryForm.output_wt || ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setRefineryForm({ ...refineryForm, output_wt: parseFloat(e.target.value) || 0 })}
                                className={inp} />
                            </div>
                            <div>
                              <label className="block text-xs text-ink-dim mb-1">Actual Purity %</label>
                              <input type="number" step="0.01" value={refineryForm.output_purity_pct || ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setRefineryForm({ ...refineryForm, output_purity_pct: parseFloat(e.target.value) || 99.9 })}
                                className={inp} placeholder="99.9" />
                            </div>
                            <div>
                              <label className="block text-xs text-ink-dim mb-1">Loss (g)</label>
                              <input type="number" step="0.001" value={refineryForm.loss_wt || ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setRefineryForm({ ...refineryForm, loss_wt: parseFloat(e.target.value) || 0 })}
                                className={inp} placeholder="0" />
                            </div>
                          </div>
                          <div className="text-sm text-ok font-medium">
                            999 pure gold added to reserve: <strong>
                              {((refineryForm.output_wt * (refineryForm.output_purity_pct / 100))).toFixed(3)}g
                            </strong>
                          </div>
                          <div className="flex gap-2">
                            <button disabled={!refineryForm.output_wt || recordRefinery.isPending}
                              onClick={() => recordRefinery.mutate(refineryForm)}
                              className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">Save</button>
                            <button onClick={() => setRefineryForm(null)}
                              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {!batches.length && <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">No batches yet. Add old metal intake from the Intake tab, then create a batch.</div>}
            </div>
          )}
        </div>
      )}

      {/* ── RESERVE & DISPATCH TAB ─────────────────────────────── */}
      {tab === "reserve" && (
        <div className="space-y-4">
          {/* Reserve balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gold/5 border border-gold/20 rounded-xl p-5 shadow-soft">
              <p className="text-xs text-ink-dim mb-1">Gold Reserve (999 pure)</p>
              <p className="text-3xl font-bold text-gold">{grams(goldReserve)}</p>
              <p className="text-xs text-ink-dim mt-2">
                From refinery: {grams(refinedGold)} — Dispatched: {grams(dispatchedGold)}
              </p>
            </div>
            <div className="bg-ink-mid/5 border border-line rounded-xl p-5 shadow-soft">
              <p className="text-xs text-ink-dim mb-1">Silver Reserve (999 pure)</p>
              <p className="text-3xl font-bold text-ink-mid">{grams(silverReserve)}</p>
              <p className="text-xs text-ink-dim mt-2">
                From refinery: {grams(refinedSilver)} — Dispatched: {grams(dispatchedSilver)}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowDispatch(true)}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
              + Dispatch Metal
            </button>
          </div>

          {showDispatch && (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="text-sm font-semibold">Dispatch from Reserve</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={dispatchForm.dispatch_date}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, dispatch_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={dispatchForm.metal}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, metal: e.target.value })} className={inp}>
                    <option value="gold">Gold 999</option>
                    <option value="silver">Silver 999</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Weight (g) *</label>
                  <input type="number" step="0.001" value={dispatchForm.weight_g || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, weight_g: parseFloat(e.target.value) || 0 })}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Purpose</label>
                  <select value={dispatchForm.purpose}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, purpose: e.target.value })} className={inp}>
                    <option value="supplier">Supplier</option>
                    <option value="goldsmith">Goldsmith</option>
                    <option value="sale">Sale</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Party / Name</label>
                  <input value={dispatchForm.party_name}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, party_name: e.target.value })} className={inp} placeholder="Supplier / goldsmith name" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={dispatchForm.notes}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={!dispatchForm.weight_g || saveDispatch.isPending}
                  onClick={() => saveDispatch.mutate(dispatchForm)}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
                <button onClick={() => setShowDispatch(false)}
                  className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
              {saveDispatch.isError && (
                <p className="text-xs text-err">Save failed — run migration 003 in Supabase SQL Editor first (metal_dispatches table).</p>
              )}
            </div>
          )}

          {/* Dispatch history */}
          {dispatchLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line bg-canvas">
                <h3 className="text-xs font-semibold text-ink-dim">Dispatch History</h3>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-3 py-2.5">Metal</th>
                  <th className="text-right px-3 py-2.5">Weight</th>
                  <th className="text-left px-3 py-2.5">Purpose</th>
                  <th className="text-left px-3 py-2.5">Party</th>
                </tr></thead>
                <tbody>
                  {dispatches.map((d: any) => (
                    <tr key={d.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2.5 text-ink-dim">{shortDate(d.dispatch_date)}</td>
                      <td className="px-3 py-2.5 capitalize font-medium" style={{ color: d.metal === "gold" ? "var(--color-gold)" : "var(--color-ink-mid)" }}>{d.metal} 999</td>
                      <td className="px-3 py-2.5 text-right font-mono">{grams(d.weight_g)}</td>
                      <td className="px-3 py-2.5 capitalize text-ink-dim">{d.purpose}</td>
                      <td className="px-3 py-2.5">{d.party_name ?? "—"}</td>
                    </tr>
                  ))}
                  {!dispatches.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
