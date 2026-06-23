"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr, shortDate } from "@/lib/format";
import { useGlobalDate } from "@/stores/global-date";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function useInvestments() {
  return useQuery({
    queryKey: ["investments"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("investments")
        .select("*, investment_returns(id, return_date, amount, mode, notes)")
        .order("invest_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export default function InvestmentsPage() {
  const qc = useQueryClient();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: investments = [], isLoading } = useInvestments();

  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ invest_date: globalDate, name: "", amount: 0, mode: "cash" as "cash" | "bank", notes: "" });
  const [returnForms, setReturnForms] = useState<Record<string, { return_date: string; amount: number; mode: "cash" | "bank"; notes: string }>>({});

  const addInvestment = useMutation({
    mutationFn: async (d: typeof addForm) => {
      const client = supabase();
      const { data: inv, error } = await client.from("investments")
        .insert({ invest_date: d.invest_date, name: d.name, amount: d.amount, mode: d.mode, notes: d.notes || null })
        .select("id").single();
      if (error) throw error;
      const table = d.mode === "bank" ? "bank_ledger" : "cash_ledger";
      await client.from(table).insert({
        tx_date: d.invest_date, direction: "out", amount: d.amount,
        description: `Investment — ${d.name}`,
        ref_type: "investment", ref_id: inv.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
      setShowAdd(false);
      setAddForm({ invest_date: globalDate, name: "", amount: 0, mode: "cash", notes: "" });
    },
  });

  const addReturn = useMutation({
    mutationFn: async ({ investmentId, investmentName, d }: { investmentId: string; investmentName: string; d: { return_date: string; amount: number; mode: "cash" | "bank"; notes: string } }) => {
      const client = supabase();
      const { data: ret, error } = await client.from("investment_returns")
        .insert({ investment_id: investmentId, return_date: d.return_date, amount: d.amount, mode: d.mode, notes: d.notes || null })
        .select("id").single();
      if (error) throw error;
      const table = d.mode === "bank" ? "bank_ledger" : "cash_ledger";
      await client.from(table).insert({
        tx_date: d.return_date, direction: "in", amount: d.amount,
        description: `Investment return — ${investmentName}`,
        ref_type: "investment_return", ref_id: ret.id,
      });
    },
    onSuccess: (_, { investmentId }) => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
      setReturnForms(prev => ({ ...prev, [investmentId]: { return_date: globalDate, amount: 0, mode: "cash", notes: "" } }));
    },
  });

  const deleteReturn = useMutation({
    mutationFn: async ({ returnId, mode }: { returnId: string; mode: string }) => {
      const client = supabase();
      const table = mode === "bank" ? "bank_ledger" : "cash_ledger";
      await Promise.all([
        client.from("investment_returns").delete().eq("id", returnId),
        client.from(table).delete().eq("ref_type", "investment_return").eq("ref_id", returnId),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
    },
  });

  const deleteInvestment = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: string }) => {
      const client = supabase();
      const table = mode === "bank" ? "bank_ledger" : "cash_ledger";
      await Promise.all([
        client.from("investments").delete().eq("id", id),
        client.from(table).delete().eq("ref_type", "investment").eq("ref_id", id),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["investments"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
    },
  });

  // Summary totals
  const totalDeployed = investments.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const totalReturned = investments.reduce((s: number, i: any) =>
    s + (i.investment_returns ?? []).reduce((r: number, x: any) => r + Number(x.amount), 0), 0);
  const netActive = totalDeployed - totalReturned;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Company Investments</h1>
        <button onClick={() => setShowAdd(v => !v)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 hover:bg-gold-dark">
          + Add Investment
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Total Deployed</p>
          <p className="text-lg font-bold text-err">{inr(totalDeployed)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Total Returned</p>
          <p className="text-lg font-bold text-ok">{inr(totalReturned)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Net Active</p>
          <p className={`text-lg font-bold ${netActive > 0 ? "text-warn" : "text-ok"}`}>{inr(netActive)}</p>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
          <p className="text-sm font-semibold text-ink">New Investment</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={addForm.invest_date}
                onChange={e => setAddForm({ ...addForm, invest_date: e.target.value })}
                className={inp} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-ink-dim mb-1">Name / Where</label>
              <input value={addForm.name} placeholder="e.g. SBI FD, Gold ETF, Partner business"
                onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
              <input type="number" step="1" value={addForm.amount || ""}
                onFocus={e => e.target.select()}
                onChange={e => setAddForm({ ...addForm, amount: parseFloat(e.target.value) || 0 })}
                className={inp} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Paid via</label>
              <select value={addForm.mode}
                onChange={e => setAddForm({ ...addForm, mode: e.target.value as "cash" | "bank" })}
                className={inp}>
                <option value="cash">Cash</option>
                <option value="bank">Bank / UPI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Notes</label>
              <input value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })}
                className={inp} placeholder="Optional" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!addForm.name || !addForm.amount || addInvestment.isPending}
              onClick={() => addInvestment.mutate(addForm)}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {addInvestment.isPending ? "Saving…" : "Save Investment"}
            </button>
            <button onClick={() => setShowAdd(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">Cancel</button>
          </div>
          {addInvestment.isError && <p className="text-xs text-err">Save failed — try again.</p>}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : investments.length === 0 ? (
        <div className="bg-white rounded-xl border border-line p-8 text-center text-ink-dim text-sm">
          No investments recorded yet.
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map((inv: any) => {
            const returns: any[] = inv.investment_returns ?? [];
            const returnedTotal = returns.reduce((s: number, r: any) => s + Number(r.amount), 0);
            const balance = Number(inv.amount) - returnedTotal;
            const isClosed = balance <= 0.5;
            const isExpanded = expandedId === inv.id;
            const rf = returnForms[inv.id] ?? { return_date: globalDate, amount: 0, mode: "cash" as "cash" | "bank", notes: "" };

            return (
              <div key={inv.id} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-canvas/50"
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-ink truncate">{inv.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isClosed ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
                        {isClosed ? "Closed" : "Active"}
                      </span>
                    </div>
                    <p className="text-xs text-ink-dim mt-0.5">{shortDate(inv.invest_date)} · {inv.mode === "bank" ? "Bank" : "Cash"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-err">−{inr(inv.amount)}</p>
                    {returnedTotal > 0 && <p className="text-xs text-ok">+{inr(returnedTotal)} back</p>}
                    {!isClosed && <p className="text-xs text-ink-dim">{inr(balance)} pending</p>}
                  </div>
                  <span className="text-ink-dim text-xs ml-1">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t border-line px-4 py-4 space-y-4 bg-canvas/30">
                    {inv.notes && <p className="text-xs text-ink-dim">Note: {inv.notes}</p>}

                    {/* Returns list */}
                    {returns.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Returns received</p>
                        {returns.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-3 bg-ok/5 border border-ok/20 rounded px-3 py-1.5 text-xs">
                            <span className="text-ink-dim">{shortDate(r.return_date)}</span>
                            <span className="font-semibold text-ok">{inr(r.amount)}</span>
                            <span className="text-ink-dim">{r.mode === "bank" ? "Bank/UPI" : "Cash"}</span>
                            {r.notes && <span className="text-ink-dim truncate">{r.notes}</span>}
                            <button
                              onClick={() => { if (confirm("Delete this return entry?")) deleteReturn.mutate({ returnId: r.id, mode: r.mode }); }}
                              className="ml-auto text-err hover:underline text-xs">Delete</button>
                          </div>
                        ))}
                        <p className="text-xs font-semibold text-ink pt-1">
                          Total returned: {inr(returnedTotal)} / {inr(inv.amount)}
                          {!isClosed && <span className="text-warn ml-2">({inr(balance)} still out)</span>}
                          {isClosed && <span className="text-ok ml-2">Fully recovered</span>}
                        </p>
                      </div>
                    )}

                    {/* Add return form */}
                    {!isClosed && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Record return / withdrawal</p>
                        <div className="flex items-end gap-2 flex-wrap">
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Date</label>
                            <input type="date" value={rf.return_date}
                              onChange={e => setReturnForms(p => ({ ...p, [inv.id]: { ...rf, return_date: e.target.value } }))}
                              className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
                            <input type="number" step="1" value={rf.amount || ""}
                              onFocus={e => e.target.select()}
                              onChange={e => setReturnForms(p => ({ ...p, [inv.id]: { ...rf, amount: parseFloat(e.target.value) || 0 } }))}
                              placeholder="0"
                              className="border border-line rounded-lg2 px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-gold" />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Received via</label>
                            <select value={rf.mode}
                              onChange={e => setReturnForms(p => ({ ...p, [inv.id]: { ...rf, mode: e.target.value as "cash" | "bank" } }))}
                              className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                              <option value="cash">Cash</option>
                              <option value="bank">Bank / UPI</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Notes</label>
                            <input value={rf.notes}
                              onChange={e => setReturnForms(p => ({ ...p, [inv.id]: { ...rf, notes: e.target.value } }))}
                              placeholder="Optional"
                              className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                          </div>
                          <button
                            disabled={!rf.amount || addReturn.isPending}
                            onClick={() => addReturn.mutate({ investmentId: inv.id, investmentName: inv.name, d: rf })}
                            className="bg-ok text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50 whitespace-nowrap">
                            {addReturn.isPending ? "Saving…" : "+ Record Return"}
                          </button>
                        </div>
                        {addReturn.isError && <p className="text-xs text-err">Save failed — try again.</p>}
                      </div>
                    )}

                    {/* Delete investment */}
                    <div className="pt-1 border-t border-line flex justify-end">
                      <button
                        onClick={() => { if (confirm(`Delete "${inv.name}"? This will also remove its ledger entry.`)) deleteInvestment.mutate({ id: inv.id, mode: inv.mode }); }}
                        className="text-xs text-err hover:underline">
                        Delete investment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
