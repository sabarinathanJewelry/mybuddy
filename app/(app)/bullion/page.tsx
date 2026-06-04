"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, grams, shortDate } from "@/lib/format";
import SupplierPicker, { type Supplier } from "@/modules/suppliers/supplier-picker";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const PAY_MODES = [
  { value: "cash",           label: "Cash" },
  { value: "upi",            label: "UPI/GPay" },
  { value: "bank",           label: "Bank" },
  { value: "balance_offset", label: "Balance Offset (non-cash)" },
];

type TradeType = "buy" | "sell";
type Metal = "gold" | "silver";
type PurityPreset = "999" | "916" | "750" | "585" | "custom";

const PURITY_PRESETS: { key: PurityPreset; label: string; value: number }[] = [
  { key: "999", label: "999 Pure",  value: 99.9  },
  { key: "916", label: "22K 91.6%", value: 91.6  },
  { key: "750", label: "18K 75%",   value: 75.0  },
  { key: "585", label: "14K 58.5%", value: 58.5  },
  { key: "custom", label: "Custom", value: 0     },
];

// Supabase returns numeric columns as strings — coerce everything via Number()
function sumBy(arr: any[], filter: (r: any) => boolean, key: string): number {
  return arr.filter(filter).reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0);
}

function useReserve() {
  return useQuery({
    queryKey: ["metal_reserve"],
    queryFn: async () => {
      const client = supabase();
      const [batchRes, dispatchRes, bullionRes, openingRes] = await Promise.all([
        client.from("melt_batches").select("metal, output_wt").eq("status", "refined"),
        client.from("metal_dispatches").select("metal, weight_g"),
        client.from("bullion_trades").select("trade_type, metal, pure_wt"),
        client.from("opening_balances").select("balance_type, amount")
          .in("balance_type", ["gold_g", "silver_g"])
          .order("effective_date", { ascending: false }),
      ]);

      const batches   = batchRes.data   ?? [];
      const dispatches= dispatchRes.data ?? [];
      const bullion   = bullionRes.data  ?? [];
      const openings  = openingRes.data  ?? [];

      // Latest opening per type
      const openingGoldG   = Number(openings.find((o: any) => o.balance_type === "gold_g")?.amount)   || 0;
      const openingSilverG = Number(openings.find((o: any) => o.balance_type === "silver_g")?.amount) || 0;

      const goldFromBatches   = sumBy(batches,    (r) => r.metal?.startsWith("gold"),   "output_wt");
      const silverFromBatches = sumBy(batches,    (r) => r.metal?.startsWith("silver"), "output_wt");
      const goldDispatched    = sumBy(dispatches, (r) => r.metal === "gold",   "weight_g");
      const silverDispatched  = sumBy(dispatches, (r) => r.metal === "silver", "weight_g");
      const goldBullionIn     = sumBy(bullion, (r) => r.trade_type === "buy"  && r.metal === "gold",   "pure_wt");
      const silverBullionIn   = sumBy(bullion, (r) => r.trade_type === "buy"  && r.metal === "silver", "pure_wt");
      const goldBullionOut    = sumBy(bullion, (r) => r.trade_type === "sell" && r.metal === "gold",   "pure_wt");
      const silverBullionOut  = sumBy(bullion, (r) => r.trade_type === "sell" && r.metal === "silver", "pure_wt");

      return {
        goldReserve:   openingGoldG   + goldFromBatches   + goldBullionIn   - goldDispatched   - goldBullionOut,
        silverReserve: openingSilverG + silverFromBatches + silverBullionIn - silverDispatched - silverBullionOut,
        openingGoldG,
        openingSilverG,
      };
    },
  });
}

export default function BullionPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();
  const { data: reserve } = useReserve();

  const { data: trades, isLoading } = useQuery({
    queryKey: ["bullion_trades"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("bullion_trades")
        .select("*, bullion_payments(id, pay_date, amount, mode)")
        .order("trade_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // New trade form
  const [showForm, setShowForm] = useState(false);
  const [tradeType, setTradeType] = useState<TradeType>("buy");
  const [metal, setMetal] = useState<Metal>("gold");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [partyName, setPartyName] = useState("");   // fallback free-text
  const [tradeDate, setTradeDate] = useState(globalDate);
  // Purity / weight
  const [purityPreset, setPurityPreset] = useState<PurityPreset>("999");
  const [customPurity, setCustomPurity] = useState(91.6);
  const [grossWt, setGrossWt] = useState(0);
  const [pureWt, setPureWt] = useState(0);
  const [ratePerG, setRatePerG] = useState(0);
  const [totalAmt, setTotalAmt] = useState(0);
  const [activeField, setActiveField] = useState<"rate" | "total">("total");
  const [firstPayAmt, setFirstPayAmt] = useState(0);
  const [firstPayMode, setFirstPayMode] = useState("cash");
  const [formNotes, setFormNotes] = useState("");

  function effectivePurity(): number {
    if (purityPreset === "custom") return customPurity;
    return PURITY_PRESETS.find(p => p.key === purityPreset)?.value ?? 99.9;
  }
  const isPure = effectivePurity() >= 99.5;

  // When gross weight changes, recalculate pure weight then re-derive rate/total
  function onGrossWtChange(val: number) {
    setGrossWt(val);
    const pure = isPure ? val : parseFloat((val * effectivePurity() / 100).toFixed(4));
    setPureWt(pure);
    if (activeField === "total" && totalAmt > 0 && pure > 0) {
      setRatePerG(parseFloat((totalAmt / pure).toFixed(2)));
    } else if (activeField === "rate" && ratePerG > 0) {
      setTotalAmt(parseFloat((pure * ratePerG).toFixed(2)));
    }
  }
  function onPureWtChange(val: number) {
    setPureWt(val);
    if (isPure) setGrossWt(val);
    if (activeField === "total" && totalAmt > 0 && val > 0) {
      setRatePerG(parseFloat((totalAmt / val).toFixed(2)));
    } else if (activeField === "rate" && ratePerG > 0) {
      setTotalAmt(parseFloat((val * ratePerG).toFixed(2)));
    }
  }
  function onWtChange(val: number) { onGrossWtChange(val); }
  function onRateChange(val: number) {
    setRatePerG(val);
    setActiveField("rate");
    setTotalAmt(parseFloat((pureWt * val).toFixed(2)));
  }
  function onTotalChange(val: number) {
    setTotalAmt(val);
    setActiveField("total");
    if (pureWt > 0) setRatePerG(parseFloat((val / pureWt).toFixed(2)));
  }
  function onPurityPresetChange(preset: PurityPreset) {
    setPurityPreset(preset);
    const pct = PURITY_PRESETS.find(p => p.key === preset)?.value ?? customPurity;
    const pure = (pct >= 99.5 || preset === "custom") ? grossWt : parseFloat((grossWt * pct / 100).toFixed(4));
    if (preset !== "custom") { setPureWt(pure); }
  }

  // Add payment panel
  const [payingTradeId, setPayingTradeId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMode, setPayMode] = useState("cash");
  const [payDate, setPayDate] = useState(globalDate);
  // Balance offset fields (used when payMode === "balance_offset")
  const [offsetWt, setOffsetWt] = useState(0);
  const [offsetRate, setOffsetRate] = useState(0);
  // First-payment offset on trade creation (for sell trades)
  const [firstOffsetWt, setFirstOffsetWt] = useState(0);
  const [firstOffsetRate, setFirstOffsetRate] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setSupplier(null); setPartyName(""); setGrossWt(0); setPureWt(0); setRatePerG(0); setTotalAmt(0);
    setPurityPreset("999"); setCustomPurity(91.6);
    setActiveField("total"); setFirstPayAmt(0); setFirstPayMode("cash"); setFormNotes("");
    setFirstOffsetWt(0); setFirstOffsetRate(0);
    setTradeDate(globalDate); setShowForm(false); setEditingId(null);
  }

  function openEdit(r: any) {
    setEditingId(r.id);
    setTradeType(r.trade_type as TradeType);
    setMetal(r.metal as Metal);
    setPartyName(r.party_name ?? "");
    setSupplier(r.supplier_id ? { id: r.supplier_id, name: r.party_name, phone: null } : null);
    setTradeDate(r.trade_date ?? globalDate);
    const pur = Number(r.purity) || 99.9;
    const existingPreset = PURITY_PRESETS.find(p => Math.abs(p.value - pur) < 0.1 && p.key !== "custom");
    setPurityPreset(existingPreset?.key ?? "custom");
    setCustomPurity(pur);
    setGrossWt(Number(r.gross_wt) || Number(r.pure_wt) || 0);
    setPureWt(Number(r.pure_wt) || 0);
    setRatePerG(Number(r.rate_per_g) || 0);
    setTotalAmt(Number(r.total_amount) || 0);
    setActiveField("rate");
    setFormNotes(r.notes ?? "");
    setFirstPayAmt(0);
    setShowForm(true);
  }

  const saveTrade = useMutation({
    mutationFn: async () => {
      if ((!supplier && !partyName) || pureWt <= 0 || totalAmt <= 0 || ratePerG <= 0) throw new Error("Invalid input");
      const client = supabase();

      const effectiveName = supplier?.name || partyName;
      const pct = effectivePurity();
      const tradePayload = {
        trade_date: tradeDate, trade_type: tradeType,
        party_name: effectiveName, metal,
        supplier_id: supplier?.id ?? null,
        gross_wt: grossWt > 0 ? grossWt : pureWt,
        purity: pct,
        pure_wt: pureWt, rate_per_g: ratePerG, total_amount: totalAmt,
        notes: formNotes || null,
      };

      if (editingId) {
        const { error } = await client.from("bullion_trades").update(tradePayload).eq("id", editingId);
        if (error) throw error;
        return;
      }

      const { data: row, error } = await client.from("bullion_trades").insert(tradePayload).select().single();
      if (error) throw error;

      const desc = `Bullion ${tradeType}: ${partyName}`;
      const direction = tradeType === "buy" ? "out" : "in";

      if (firstPayAmt > 0) {
        await client.from("bullion_payments").insert({
          trade_id: row.id, pay_date: tradeDate,
          amount: firstPayAmt, mode: firstPayMode,
        });
        if (firstPayMode === "cash") {
          await client.from("cash_ledger").insert({
            tx_date: tradeDate, direction, amount: firstPayAmt,
            description: desc, ref_type: "bullion", ref_id: row.id,
          });
        } else if (firstPayMode !== "balance_offset") {
          await client.from("bank_ledger").insert({
            tx_date: tradeDate, direction, amount: firstPayAmt,
            description: desc, ref_type: "bullion", ref_id: row.id,
          });
        }
      }

      // Balance offset on creation (for sell trades)
      const firstOffsetAmt = parseFloat((firstOffsetWt * firstOffsetRate).toFixed(2));
      if (firstOffsetWt > 0 && firstOffsetRate > 0 && firstOffsetAmt > 0) {
        await client.from("bullion_payments").insert({
          trade_id: row.id, pay_date: tradeDate,
          amount: firstOffsetAmt, mode: "balance_offset",
          notes: `Offset: ${firstOffsetWt}g @ ₹${firstOffsetRate}/g`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bullion_trades"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      resetForm();
    },
  });

  const deleteTrade = useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "bullion").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "bullion").eq("ref_id", id),
      ]);
      await client.from("bullion_payments").delete().eq("trade_id", id);
      const { error } = await client.from("bullion_trades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bullion_trades"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      setDeletingId(null);
    },
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      const client = supabase();
      const trade = (trades ?? []).find((t: any) => t.id === payingTradeId);
      if (!trade || !payingTradeId) throw new Error("Trade not found");

      const isOffset = payMode === "balance_offset";
      // For offset: compute amount from weight × rate
      const effectiveAmt = isOffset
        ? parseFloat((offsetWt * offsetRate).toFixed(2))
        : payAmount;
      if (effectiveAmt <= 0) throw new Error("Invalid amount");

      const offsetNotes = isOffset
        ? `Offset: ${offsetWt}g @ ₹${offsetRate}/g`
        : undefined;

      await client.from("bullion_payments").insert({
        trade_id: payingTradeId, pay_date: payDate,
        amount: effectiveAmt, mode: payMode,
        notes: offsetNotes ?? null,
      });

      // Only hit the cash/bank ledger for real money movements
      if (!isOffset) {
        const direction = trade.trade_type === "buy" ? "out" : "in";
        const desc = `Bullion ${trade.trade_type}: ${trade.party_name}`;
        if (payMode === "cash") {
          await client.from("cash_ledger").insert({
            tx_date: payDate, direction, amount: effectiveAmt,
            description: desc, ref_type: "bullion", ref_id: trade.id,
          });
        } else {
          await client.from("bank_ledger").insert({
            tx_date: payDate, direction, amount: effectiveAmt,
            description: desc, ref_type: "bullion", ref_id: trade.id,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bullion_trades"] });
      setPayingTradeId(null); setPayAmount(0); setPayDate(globalDate);
      setOffsetWt(0); setOffsetRate(0);
    },
  });

  const rows = (trades ?? []) as any[];

  function cashPaidFor(row: any): number {
    return ((row.bullion_payments ?? []) as any[])
      .filter((p: any) => p.mode !== "balance_offset")
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  }
  function offsetFor(row: any): number {
    return ((row.bullion_payments ?? []) as any[])
      .filter((p: any) => p.mode === "balance_offset")
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
  }
  function paidFor(row: any): number {
    return cashPaidFor(row) + offsetFor(row);
  }
  function pendingFor(row: any): number {
    return Number(row.total_amount) - paidFor(row);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Bullion Trading</h1>
          <p className="text-sm text-ink-dim mt-0.5">Buy / sell pure gold & silver — partial payments supported</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setTradeType("buy"); setShowForm(true); }}
            className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 font-medium">
            + Buy
          </button>
          <button onClick={() => { setTradeType("sell"); setShowForm(true); }}
            className="bg-ok text-white text-sm px-4 py-2 rounded-lg2 font-medium">
            + Sell
          </button>
        </div>
      </div>

      {/* Net reserve */}
      {reserve && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim mb-1">Gold Reserve (net)</p>
            <p className="text-xl font-bold text-gold">{grams(reserve.goldReserve)}</p>
            <p className="text-xs text-ink-dim mt-1">
              Opening {grams(reserve.openingGoldG)} + Refined + Bought − Dispatched − Sold
            </p>
          </div>
          <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim mb-1">Silver Reserve (net)</p>
            <p className="text-xl font-bold text-ink-mid">{grams(reserve.silverReserve)}</p>
            <p className="text-xs text-ink-dim mt-1">
              Opening {grams(reserve.openingSilverG)} + same calculation
            </p>
          </div>
        </div>
      )}

      {/* Trade form */}
      {showForm && (
        <div className={`bg-white border rounded-xl p-5 shadow-soft space-y-4 ${tradeType === "buy" ? "border-gold/40" : "border-ok/40"}`}>
          <h3 className={`font-semibold text-sm ${tradeType === "buy" ? "text-gold" : "text-ok"}`}>
            {editingId ? `Edit ${tradeType === "buy" ? "Purchase" : "Sale"}` : tradeType === "buy" ? "🔶 Buy from Bullion Dealer" : "💰 Sell to Bullion Dealer"}
          </h3>

          <div className="space-y-3">
            {/* Supplier picker */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-ink-dim mb-1">Supplier / Dealer *</label>
                <SupplierPicker value={supplier} onChange={(s) => { setSupplier(s); setPartyName(s.name); }} />
                {!supplier && (
                  <input value={partyName} onChange={(e) => setPartyName(e.target.value)}
                    className={`${inp} mt-1.5`} placeholder="Or type name if not in supplier list…" />
                )}
              </div>

              <div>
                <label className="block text-xs text-ink-dim mb-1">Metal</label>
                <div className="flex gap-2">
                  {(["gold", "silver"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMetal(m)}
                      className={`flex-1 py-2 rounded-lg2 text-sm font-medium border transition-colors ${
                        metal === m
                          ? m === "gold" ? "bg-gold/10 border-gold text-gold" : "bg-ink-mid/10 border-ink-mid text-ink-mid"
                          : "border-line text-ink-dim hover:border-gold"
                      }`}>
                      {m === "gold" ? "Gold" : "Silver"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-ink-dim mb-1">Date</label>
                <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} className={inp} />
              </div>
            </div>

            {/* Purity preset */}
            <div>
              <label className="block text-xs text-ink-dim mb-1">Purity / Metal Type</label>
              <div className="flex gap-1.5 flex-wrap">
                {PURITY_PRESETS.map(p => (
                  <button key={p.key} type="button"
                    onClick={() => onPurityPresetChange(p.key)}
                    className={`px-3 py-1.5 rounded-lg2 text-xs font-medium border transition-colors ${
                      purityPreset === p.key
                        ? "bg-gold/10 border-gold text-gold"
                        : "border-line text-ink-dim hover:border-gold"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {purityPreset === "custom" && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" step="0.1" min="1" max="100"
                    value={customPurity || ""}
                    onFocus={e => e.target.select()}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setCustomPurity(v);
                      const pure = parseFloat((grossWt * v / 100).toFixed(4));
                      setPureWt(pure);
                      if (activeField === "rate" && ratePerG > 0) setTotalAmt(parseFloat((pure * ratePerG).toFixed(2)));
                      if (activeField === "total" && totalAmt > 0 && pure > 0) setRatePerG(parseFloat((totalAmt / pure).toFixed(2)));
                    }}
                    className="border border-line rounded-lg2 px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-gold text-right" />
                  <span className="text-xs text-ink-dim">%</span>
                </div>
              )}
            </div>

            {/* Weight inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-dim mb-1">
                  {isPure ? "Weight (g) *" : "Gross Weight (g) *"}
                </label>
                <input type="number" step="0.001" value={grossWt || ""}
                  placeholder="0.000" onFocus={e => e.target.select()}
                  onChange={e => onGrossWtChange(parseFloat(e.target.value) || 0)}
                  className={inp} />
              </div>

              {!isPure && (
                <div>
                  <label className="block text-xs text-ink-dim mb-1">
                    Pure Weight (g) <span className="text-gold">(auto — {effectivePurity()}%)</span>
                  </label>
                  <input type="number" step="0.001" value={pureWt || ""}
                    placeholder="0.000" onFocus={e => e.target.select()}
                    onChange={e => onPureWtChange(parseFloat(e.target.value) || 0)}
                    className={`${inp} bg-gold/5`} />
                  {grossWt > 0 && (
                    <p className="text-xs text-ink-dim mt-0.5">
                      {grams(grossWt)} × {effectivePurity()}% = {grams(pureWt)}
                    </p>
                  )}
                </div>
              )}

              {/* Rate */}
              <div>
                <label className="block text-xs text-ink-dim mb-1">
                  Rate per pure gram (₹)
                  {activeField === "total" && pureWt > 0 && <span className="ml-1 text-gold">(auto)</span>}
                </label>
                <input type="number" step="0.01" value={ratePerG || ""}
                  placeholder="0" onFocus={e => e.target.select()}
                  onChange={e => onRateChange(parseFloat(e.target.value) || 0)}
                  className={inp} />
              </div>

              {/* Total */}
              <div>
                <label className="block text-xs text-ink-dim mb-1">
                  Total Amount (₹) *
                  {activeField === "rate" && pureWt > 0 && <span className="ml-1 text-gold">(auto)</span>}
                </label>
                <input type="number" step="0.01" value={totalAmt || ""}
                  placeholder="0" onFocus={e => e.target.select()}
                  onChange={e => onTotalChange(parseFloat(e.target.value) || 0)}
                  className={`${inp} font-semibold`} />
              </div>
            </div>

            {pureWt > 0 && ratePerG > 0 && totalAmt > 0 && (
              <p className="text-xs text-ink-dim bg-canvas rounded-lg2 px-3 py-2">
                {!isPure && `Gross ${grams(grossWt)} × ${effectivePurity()}% = `}
                {grams(pureWt)} pure × {inr(ratePerG)}/g = <strong className="text-gold">{inr(totalAmt)}</strong>
              </p>
            )}
          </div>

          {/* Optional first payment — only for new trades */}
          {!editingId && <div className="border-t border-line pt-3 space-y-3">
            <p className="text-xs font-medium text-ink-dim">
              {tradeType === "buy" ? "Pay now (optional — add more later)" : "Receive now (optional — add more later)"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-dim mb-1">
                  {tradeType === "buy" ? "Amount Paid (cash/bank)" : "Cash / Bank Received"}
                </label>
                <input type="number" step="0.01" value={firstPayAmt || ""}
                  placeholder="0" onFocus={(e) => e.target.select()}
                  onChange={(e) => setFirstPayAmt(parseFloat(e.target.value) || 0)}
                  className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Mode</label>
                <select value={firstPayMode} onChange={(e) => setFirstPayMode(e.target.value)} className={inp}>
                  {PAY_MODES.filter(m => m.value !== "balance_offset").map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            {/* Balance offset — sell trades only */}
            {tradeType === "sell" && (
              <div className="bg-info/5 border border-info/20 rounded-lg2 p-3 space-y-2">
                <p className="text-xs font-medium text-info">Balance Offset (non-cash netting)</p>
                <p className="text-xs text-ink-dim">Use when you owe the supplier gold/silver and are deducting its value from this sale.</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Owed Weight (g)</label>
                    <input type="number" step="0.001" value={firstOffsetWt || ""}
                      placeholder="0.000" onFocus={(e) => e.target.select()}
                      onChange={(e) => setFirstOffsetWt(parseFloat(e.target.value) || 0)}
                      className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Rate (₹/g)</label>
                    <input type="number" step="0.01" value={firstOffsetRate || ""}
                      placeholder="0" onFocus={(e) => e.target.select()}
                      onChange={(e) => setFirstOffsetRate(parseFloat(e.target.value) || 0)}
                      className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Offset Amount</label>
                    <div className={`${inp} bg-canvas font-mono font-semibold text-info text-right`}>
                      {firstOffsetWt > 0 && firstOffsetRate > 0
                        ? inr(parseFloat((firstOffsetWt * firstOffsetRate).toFixed(2)))
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(firstPayAmt > 0 || (firstOffsetWt > 0 && firstOffsetRate > 0)) && totalAmt > 0 && (() => {
              const offsetAmt = parseFloat((firstOffsetWt * firstOffsetRate).toFixed(2));
              const totalPaid = firstPayAmt + offsetAmt;
              const pending   = totalAmt - totalPaid;
              return (
                <div className="text-xs text-ink-dim space-y-0.5">
                  {firstPayAmt > 0 && <p>Cash/Bank: <strong className="text-ok">{inr(firstPayAmt)}</strong></p>}
                  {offsetAmt > 0 && <p>Offset: <strong className="text-info">{inr(offsetAmt)}</strong></p>}
                  <p>Pending after this: <strong className={pending > 0.01 ? "text-err" : "text-ok"}>{pending > 0.01 ? inr(pending) : "Fully settled ✓"}</strong></p>
                </div>
              );
            })()}
          </div>}

          <div>
            <label className="block text-xs text-ink-dim mb-1">Notes</label>
            <input value={formNotes} onChange={(e) => setFormNotes(e.target.value)}
              className={inp} placeholder="Optional…" />
          </div>

          <div className="flex gap-2">
            <button
              disabled={saveTrade.isPending || (!supplier && !partyName) || pureWt <= 0 || totalAmt <= 0 || ratePerG <= 0}
              onClick={() => saveTrade.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {saveTrade.isPending ? "Saving…" : editingId ? "Save Changes" : `Record ${tradeType === "buy" ? "Purchase" : "Sale"}`}
            </button>
            <button type="button" onClick={resetForm}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {saveTrade.isError && (
            <p className="text-xs text-err">Save failed — run migration 004 &amp; 005 in Supabase SQL Editor first.</p>
          )}
        </div>
      )}

      {/* Add payment panel */}
      {payingTradeId !== null && (() => {
        const trade = rows.find((r: any) => r.id === payingTradeId);
        if (!trade) return null;
        const paid = paidFor(trade);
        const pend = pendingFor(trade);
        return (
          <div className="bg-white border border-ok/40 rounded-xl p-4 shadow-soft space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ok">Add Payment — {trade.party_name}</h3>
              <button onClick={() => setPayingTradeId(null)} className="text-ink-dim text-sm hover:text-ink">✕</button>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-ink-dim">Total: <strong className="text-ink">{inr(Number(trade.total_amount))}</strong></span>
              <span className="text-ink-dim">Paid: <strong className="text-ok">{inr(paid)}</strong></span>
              <span className="text-ink-dim">Pending: <strong className="text-err">{inr(pend)}</strong></span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-ink-dim mb-1">Mode</label>
                <select value={payMode} onChange={(e) => { setPayMode(e.target.value); setOffsetWt(0); setOffsetRate(0); setPayAmount(0); }} className={inp}>
                  {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Date</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inp} />
              </div>
              {payMode !== "balance_offset" ? (
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
                  <input type="number" step="0.01" value={payAmount || ""}
                    placeholder="0" onFocus={(e) => e.target.select()}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)} className={inp} />
                </div>
              ) : (
                <div className="col-span-1">
                  <label className="block text-xs text-ink-dim mb-1">Offset Amount</label>
                  <div className={`${inp} bg-canvas font-mono text-info font-semibold text-right`}>
                    {offsetWt > 0 && offsetRate > 0 ? inr(parseFloat((offsetWt * offsetRate).toFixed(2))) : "—"}
                  </div>
                </div>
              )}
            </div>

            {/* Offset weight + rate fields */}
            {payMode === "balance_offset" && (
              <div className="bg-info/5 border border-info/20 rounded-lg2 p-3 space-y-2">
                <p className="text-xs font-medium text-info">Balance Offset — non-cash netting against outstanding balance</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Owed Weight (g)</label>
                    <input type="number" step="0.001" value={offsetWt || ""}
                      placeholder="e.g. 18.390" onFocus={(e) => e.target.select()}
                      onChange={(e) => setOffsetWt(parseFloat(e.target.value) || 0)} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Rate (₹/g)</label>
                    <input type="number" step="0.01" value={offsetRate || ""}
                      placeholder="e.g. 15050" onFocus={(e) => e.target.select()}
                      onChange={(e) => setOffsetRate(parseFloat(e.target.value) || 0)} className={inp} />
                  </div>
                </div>
                {offsetWt > 0 && offsetRate > 0 && (
                  <p className="text-xs text-info font-medium">
                    {grams(offsetWt)} × {inr(offsetRate)}/g = <strong>{inr(parseFloat((offsetWt * offsetRate).toFixed(2)))}</strong> — will be deducted from supplier's payment (no cash entry)
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                disabled={addPayment.isPending || (payMode === "balance_offset" ? offsetWt <= 0 || offsetRate <= 0 : payAmount <= 0)}
                onClick={() => addPayment.mutate()}
                className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                {addPayment.isPending ? "Saving…" : payMode === "balance_offset" ? "Record Offset" : "Record Payment"}
              </button>
              <button onClick={() => { setPayingTradeId(null); setOffsetWt(0); setOffsetRate(0); }}
                className="border border-line text-sm px-5 py-2 rounded-lg2">Cancel</button>
            </div>
          </div>
        );
      })()}

      {/* Delete confirmation */}
      {deletingId && (() => {
        const trade = rows.find((r: any) => r.id === deletingId);
        if (!trade) return null;
        return (
          <div className="bg-white border border-err/40 rounded-xl p-4 shadow-soft space-y-3">
            <p className="text-sm font-semibold text-err">Delete this trade?</p>
            <p className="text-xs text-ink-dim">
              {shortDate(trade.trade_date)} · {trade.trade_type === "buy" ? "Buy" : "Sell"} · {trade.party_name} · {grams(Number(trade.pure_wt))} · {inr(Number(trade.total_amount))}
            </p>
            <p className="text-xs text-ink-dim">All payments and ledger entries for this trade will also be removed.</p>
            <div className="flex gap-2">
              <button
                disabled={deleteTrade.isPending}
                onClick={() => deleteTrade.mutate(deletingId)}
                className="bg-err text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                {deleteTrade.isPending ? "Deleting…" : "Yes, Delete"}
              </button>
              <button onClick={() => setDeletingId(null)}
                className="border border-line text-sm px-5 py-2 rounded-lg2">Cancel</button>
            </div>
          </div>
        );
      })()}

      {/* Trades table */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Party</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Weight</th>
                <th className="text-right px-3 py-2.5">Rate/g</th>
                <th className="text-right px-3 py-2.5">Total</th>
                <th className="text-right px-3 py-2.5 text-ok">Cash Paid</th>
                <th className="text-right px-3 py-2.5 text-info">Offset</th>
                <th className="text-right px-3 py-2.5">Pending</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const cash   = cashPaidFor(r);
                const offset = offsetFor(r);
                const pend   = pendingFor(r);
                // Show offset payments as tooltip/sub-line
                const offPays = ((r.bullion_payments ?? []) as any[]).filter((p: any) => p.mode === "balance_offset");
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(r.trade_date)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.trade_type === "buy" ? "bg-gold/10 text-gold" : "bg-ok/10 text-ok"}`}>
                        {r.trade_type === "buy" ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{r.party_name}</p>
                    </td>
                    <td className="px-3 py-2.5 capitalize">
                      <div>
                        <span className={r.metal === "gold" ? "text-gold" : "text-ink-mid"}>{r.metal}</span>
                        {r.purity && Number(r.purity) < 99 && (
                          <span className="ml-1 text-[10px] text-ink-dim">{Number(r.purity)}%</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <div>{grams(Number(r.pure_wt))}</div>
                      {r.gross_wt && Number(r.gross_wt) !== Number(r.pure_wt) && (
                        <div className="text-[10px] text-ink-dim">gross: {grams(Number(r.gross_wt))}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-ink-dim">{inr(Number(r.rate_per_g))}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{inr(Number(r.total_amount))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-ok">
                      {cash > 0 ? inr(cash) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-info">
                      {offset > 0 ? (
                        <span title={offPays.map((p: any) => p.notes || "Offset").join(", ")}>
                          {inr(offset)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      <span className={pend > 0.01 ? "text-err font-semibold" : "text-ink-dim"}>{pend > 0.01 ? inr(pend) : "✓"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {pend > 0.01 && (
                          <button
                            onClick={() => { setPayingTradeId(r.id); setPayAmount(0); setOffsetWt(0); setOffsetRate(0); setPayDate(globalDate); setPayMode("cash"); }}
                            className="text-xs text-gold hover:underline whitespace-nowrap">
                            + Pay
                          </button>
                        )}
                        <button onClick={() => openEdit(r)} className="text-xs text-info hover:underline">Edit</button>
                        <button onClick={() => setDeletingId(r.id)} className="text-xs text-err hover:underline">Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
