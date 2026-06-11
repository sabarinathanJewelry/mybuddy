"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useAuth } from "@/stores/auth";
import { grams, shortDate } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const METAL_LABELS: Record<string, string> = {
  gold_22k: "Gold 22K",
  gold_24k: "Gold 24K",
  gold_18k: "Gold 18K",
  silver: "Silver",
  silver_pure: "Silver Pure",
};

const DEFAULT_PURITY: Record<string, number> = {
  gold_22k: 91.6,
  gold_24k: 99.9,
  gold_18k: 75.0,
  silver: 92.5,
  silver_pure: 99.9,
};

function useReserve() {
  return useQuery({
    queryKey: ["metal_reserve"],
    queryFn: async () => {
      const client = supabase();
      const [batchRes, dispatchRes, bullionRes, openingRes] = await Promise.all([
        client.from("melt_batches").select("metal, output_wt").eq("status", "refined"),
        client.from("metal_dispatches").select("metal, weight_g, purity_pct"),
        client.from("bullion_trades").select("trade_type, metal, pure_wt"),
        client.from("opening_balances").select("balance_type, amount")
          .in("balance_type", ["gold_g", "silver_g"])
          .order("effective_date", { ascending: false }),
      ]);
      const sum = (arr: any[], fn: (r: any) => boolean, key: string) =>
        (arr ?? []).filter(fn).reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0);

      const batches    = batchRes.data   ?? [];
      const dispatches = dispatchRes.data ?? [];
      const bullion    = bullionRes.data  ?? [];
      const openings   = openingRes.data  ?? [];

      const openingGoldG   = Number(openings.find((o: any) => o.balance_type === "gold_g")?.amount) || 0;
      const openingSilverG = Number(openings.find((o: any) => o.balance_type === "silver_g")?.amount) || 0;

      const goldRefined    = sum(batches, (r) => r.metal?.startsWith("gold"), "output_wt");
      const goldBullionIn  = sum(bullion,  (r) => r.trade_type === "buy"  && r.metal === "gold", "pure_wt");
      const goldDispatched = (dispatches ?? []).filter((r: any) => r.metal === "gold").reduce((s: number, r: any) => s + (Number(r.weight_g) || 0) * (Number(r.purity_pct) || 100) / 100, 0);
      const goldBullionOut = sum(bullion,  (r) => r.trade_type === "sell" && r.metal === "gold", "pure_wt");

      const silverRefined    = sum(batches, (r) => r.metal?.startsWith("silver"), "output_wt");
      const silverBullionIn  = sum(bullion,  (r) => r.trade_type === "buy"  && r.metal === "silver", "pure_wt");
      const silverDispatched = (dispatches ?? []).filter((r: any) => r.metal === "silver").reduce((s: number, r: any) => s + (Number(r.weight_g) || 0) * (Number(r.purity_pct) || 100) / 100, 0);
      const silverBullionOut = sum(bullion,  (r) => r.trade_type === "sell" && r.metal === "silver", "pure_wt");

      return {
        gold:   openingGoldG   + goldRefined   + goldBullionIn   - goldDispatched   - goldBullionOut,
        silver: openingSilverG + silverRefined + silverBullionIn - silverDispatched - silverBullionOut,
      };
    },
  });
}

function useRecentEntries() {
  return useQuery({
    queryKey: ["refinery_entries"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("melt_batches")
        .select("id, batch_no, batch_date, metal, melt_wt, loss_wt, debris_wt, output_purity_pct, output_wt, input_wt, notes")
        .eq("status", "refined")
        .order("batch_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function defaultForm(globalDate: string, metal = "gold_22k") {
  return {
    batch_date: globalDate,
    batch_no: "",
    metal,
    gross_wt: 0,
    dust_wt: 0,
    debris_wt: 0,
    purity_pct: DEFAULT_PURITY[metal] ?? 91.6,
    notes: "",
  };
}

export default function RefineryEntryPage() {
  const globalDate = useGlobalDate((s) => s.date);
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();

  const { data: reserve } = useReserve();
  const { data: entries = [], isLoading } = useRecentEntries();

  const [form, setForm] = useState(() => defaultForm(globalDate));
  const [lastResult, setLastResult] = useState<{ batch_no: string; output_wt: number; metal: string } | null>(null);

  function setMetal(metal: string) {
    setForm(f => ({ ...f, metal, purity_pct: DEFAULT_PURITY[metal] ?? f.purity_pct }));
  }

  const gross   = Number(form.gross_wt)   || 0;
  const dust    = Number(form.dust_wt)    || 0;
  const debris  = Number(form.debris_wt)  || 0;
  const purity  = Number(form.purity_pct) || 0;
  const net_wt  = Math.max(0, gross - dust - debris);
  const pure_wt = parseFloat((net_wt * purity / 100).toFixed(3));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.batch_no.trim()) throw new Error("Batch number required");
      if (gross <= 0) throw new Error("Gross weight required");
      const { data, error } = await supabase().from("melt_batches").insert({
        batch_no:          form.batch_no.trim(),
        batch_date:        form.batch_date,
        metal:             form.metal,
        status:            "refined",
        input_wt:          0,
        melt_wt:           parseFloat(net_wt.toFixed(3)),
        loss_wt:           parseFloat(dust.toFixed(3)),
        debris_wt:         parseFloat(debris.toFixed(3)),
        output_purity_pct: purity,
        output_wt:         pure_wt,
        notes:             form.notes || null,
      }).select("id, batch_no, output_wt, metal").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setLastResult({ batch_no: data.batch_no, output_wt: data.output_wt, metal: data.metal });
      setForm(defaultForm(globalDate, form.metal));
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      qc.invalidateQueries({ queryKey: ["refinery_entries"] });
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
    },
  });

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      <h1 className="text-lg font-semibold text-ink">Refinery Entry</h1>

      {/* Reserve display */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-line rounded-xl p-4 shadow-soft text-center">
          <div className="text-xs text-ink-dim mb-1">Gold Reserve</div>
          <div className="text-xl font-semibold text-gold">{grams(reserve?.gold ?? 0)}</div>
        </div>
        <div className="bg-white border border-line rounded-xl p-4 shadow-soft text-center">
          <div className="text-xs text-ink-dim mb-1">Silver Reserve</div>
          <div className="text-xl font-semibold text-info">{grams(reserve?.silver ?? 0)}</div>
        </div>
      </div>

      {/* Success banner */}
      {lastResult && (
        <div className="bg-ok/10 border border-ok/30 rounded-xl px-4 py-3 text-sm text-ok font-medium">
          {lastResult.batch_no} — {grams(lastResult.output_wt)} pure {METAL_LABELS[lastResult.metal] ?? lastResult.metal} added to reserve.
          {isAdmin && <span className="text-ink-dim font-normal ml-2">Link old metal items in Metal Flow → Batches.</span>}
        </div>
      )}

      {/* Entry form */}
      <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-4">
        <h2 className="text-sm font-semibold">Record Refinery Return</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Date</label>
            <input type="date" value={form.batch_date}
              onChange={e => setForm(f => ({ ...f, batch_date: e.target.value }))}
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Batch / Ref No *</label>
            <input value={form.batch_no} placeholder="RF-001"
              onChange={e => setForm(f => ({ ...f, batch_no: e.target.value }))}
              className={inp} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-ink-dim mb-1">Metal</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(METAL_LABELS).map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => setMetal(val)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${form.metal === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Actual / Gross Weight (g) *</label>
            <input type="number" step="0.001" min="0" value={form.gross_wt || ""}
              placeholder="0.000"
              onFocus={e => e.target.select()}
              onChange={e => setForm(f => ({ ...f, gross_wt: parseFloat(e.target.value) || 0 }))}
              className={`${inp} font-mono`} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Dust / Loss (g)</label>
            <input type="number" step="0.001" min="0" value={form.dust_wt || ""}
              placeholder="0.000"
              onFocus={e => e.target.select()}
              onChange={e => setForm(f => ({ ...f, dust_wt: parseFloat(e.target.value) || 0 }))}
              className={`${inp} font-mono`} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Debris / Sediment (g)</label>
            <input type="number" step="0.001" min="0" value={form.debris_wt || ""}
              placeholder="0.000"
              onFocus={e => e.target.select()}
              onChange={e => setForm(f => ({ ...f, debris_wt: parseFloat(e.target.value) || 0 }))}
              className={`${inp} font-mono`} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Purity %</label>
            <input type="number" step="0.1" min="0" max="100" value={form.purity_pct || ""}
              placeholder="91.6"
              onFocus={e => e.target.select()}
              onChange={e => setForm(f => ({ ...f, purity_pct: parseFloat(e.target.value) || 0 }))}
              className={`${inp} font-mono`} />
          </div>
        </div>

        {/* Live calculation */}
        {gross > 0 && (
          <div className="bg-canvas rounded-lg2 px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between text-ink-dim">
              <span>Gross weight</span>
              <span className="font-mono">{grams(gross)}</span>
            </div>
            <div className="flex justify-between text-ink-dim">
              <span>− Dust / loss</span>
              <span className="font-mono text-err">−{grams(dust)}</span>
            </div>
            <div className="flex justify-between text-ink-dim">
              <span>− Debris</span>
              <span className="font-mono text-err">−{grams(debris)}</span>
            </div>
            <div className="flex justify-between text-ink-dim border-t border-line pt-1">
              <span>Net usable</span>
              <span className="font-mono">{grams(net_wt)}</span>
            </div>
            <div className="flex justify-between font-semibold text-ok">
              <span>Pure weight ({purity}%) → Reserve</span>
              <span className="font-mono">+{grams(pure_wt)}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-ink-dim mb-1">Notes</label>
          <input value={form.notes} placeholder="Optional notes"
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className={inp} />
        </div>

        {save.isError && (
          <p className="text-xs text-err">{(save.error as Error).message}</p>
        )}

        <button
          disabled={save.isPending || !form.batch_no.trim() || gross <= 0 || pure_wt <= 0}
          onClick={() => save.mutate()}
          className="w-full bg-gold text-white text-sm font-medium py-2.5 rounded-lg2 disabled:opacity-50 hover:opacity-90 transition-opacity">
          {save.isPending ? "Saving…" : `Add ${grams(pure_wt)} to Reserve`}
        </button>
      </div>

      {/* Recent entries */}
      <div className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="text-sm font-semibold">Recent Entries</h2>
        </div>
        {isLoading ? (
          <p className="text-ink-dim text-sm px-4 py-3">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-ink-dim text-sm px-4 py-3">No entries yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {entries.map((e: any) => {
              const hasItems = Number(e.input_wt) > 0;
              return (
                <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-info text-sm font-medium">{e.batch_no}</span>
                      <span className="text-xs text-ink-dim">{shortDate(e.batch_date)}</span>
                      <span className="text-xs text-ink-dim">{METAL_LABELS[e.metal] ?? e.metal}</span>
                    </div>
                    <div className="text-xs text-ink-dim">
                      Gross {grams(Number(e.melt_wt) || 0)} · Dust {grams(Number(e.loss_wt) || 0)} · Debris {grams(Number(e.debris_wt) || 0)} · {e.output_purity_pct ?? "—"}%
                    </div>
                    {e.notes && <div className="text-xs text-ink-dim truncate">{e.notes}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-ok font-semibold text-sm">+{grams(Number(e.output_wt) || 0)}</div>
                    {isAdmin && !hasItems && (
                      <span className="text-xs text-warn">No items linked</span>
                    )}
                    {isAdmin && hasItems && (
                      <span className="text-xs text-ok">Items linked</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
