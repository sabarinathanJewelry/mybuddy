"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, grams } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

// Today's snapshot
function useDaily(date: string) {
  const client = supabase();
  return useQuery({
    queryKey: ["daily-sheet", date],
    queryFn: async () => {
      const [cashRes, bankRes, salesRes, metalRes, walkinRes, chitRes, gsdRes, cbRes, expRes] = await Promise.all([
        client.from("cash_ledger").select("direction, amount").eq("tx_date", date),
        client.from("bank_ledger").select("direction, amount").eq("tx_date", date),
        client.from("sales").select("id, total, gst_amount, status, sale_items(metal, net_wt, line_total)").eq("bill_date", date).eq("status", "confirmed"),
        client.from("old_metal_intake").select("metal, pure_wt").eq("intake_date", date),
        client.from("walk_in_summaries").select("gold_walkin,silver_walkin,other_walkin,gold_walkout,silver_walkout,other_walkout").eq("summary_date", date),
        client.from("chit_payments").select("amount, metal_grams, metal_type").eq("pay_date", date),
        client.from("gold_savings_deposits").select("pure_wt, metal_type").eq("deposit_date", date),
        client.from("cash_savings_deposits").select("amount").eq("deposit_date", date),
        client.from("expenses").select("amount").eq("exp_date", date),
      ]);

      const cashIn   = (cashRes.data ?? []).filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0);
      const cashOut  = (cashRes.data ?? []).filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0);
      const bankIn   = (bankRes.data ?? []).filter((r) => r.direction === "in").reduce((s, r) => s + Number(r.amount), 0);
      const bankOut  = (bankRes.data ?? []).filter((r) => r.direction === "out").reduce((s, r) => s + Number(r.amount), 0);
      const salesTotal = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total), 0);
      const gstTotal   = (salesRes.data ?? []).reduce((s, r) => s + (Number(r.gst_amount) || 0), 0);
      const salesCount = salesRes.data?.length ?? 0;

      // Flatten all sale_items for the day
      const allItems = (salesRes.data ?? []).flatMap((s: any) => s.sale_items ?? []);
      const goldSoldG   = allItems.filter((i: any) => (i.metal ?? "").startsWith("gold")).reduce((s: number, i: any) => s + (Number(i.net_wt) || 0), 0);
      const silverSoldG = allItems.filter((i: any) => i.metal === "silver" || i.metal === "silver_pure").reduce((s: number, i: any) => s + (Number(i.net_wt) || 0), 0);
      const mrpTotal    = allItems.filter((i: any) => i.metal === "silver_mpr").reduce((s: number, i: any) => s + (Number(i.line_total) || 0), 0);

      const expenseTotal = (expRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const oldGoldG   = (metalRes.data ?? []).filter((r) => r.metal?.startsWith("gold")).reduce((s, r) => s + (Number(r.pure_wt) || 0), 0);
      const oldSilverG = (metalRes.data ?? []).filter((r) => r.metal?.startsWith("silver")).reduce((s, r) => s + (Number(r.pure_wt) || 0), 0);
      const walkinRow = (walkinRes.data ?? [])[0];
      const walkinInCount  = walkinRow ? (walkinRow.gold_walkin ?? 0) + (walkinRow.silver_walkin ?? 0) + (walkinRow.other_walkin ?? 0) : 0;
      const walkinOutCount = walkinRow ? (walkinRow.gold_walkout ?? 0) + (walkinRow.silver_walkout ?? 0) + (walkinRow.other_walkout ?? 0) : 0;
      const walkinGoldIn   = walkinRow?.gold_walkin ?? 0;
      const walkinSilverIn = walkinRow?.silver_walkin ?? 0;

      // Metal Chit Savings (chit_payments)
      const chitAmt    = (chitRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const chitGoldG  = (chitRes.data ?? []).filter((r) => r.metal_type === "gold").reduce((s, r) => s + (Number(r.metal_grams) || 0), 0);
      const chitSilverG= (chitRes.data ?? []).filter((r) => r.metal_type === "silver").reduce((s, r) => s + (Number(r.metal_grams) || 0), 0);
      const chitCount  = chitRes.data?.length ?? 0;

      // Smart Gold Chit (gold_savings_deposits — customer brings physical gold)
      const smartGoldG  = (gsdRes.data ?? []).filter((r) => r.metal_type === "gold").reduce((s, r) => s + (Number(r.pure_wt) || 0), 0);
      const smartSilverG= (gsdRes.data ?? []).filter((r) => r.metal_type === "silver").reduce((s, r) => s + (Number(r.pure_wt) || 0), 0);
      const smartCount  = gsdRes.data?.length ?? 0;

      // Cash Bonus deposits
      const cashBonusAmt  = (cbRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const cashBonusCount= cbRes.data?.length ?? 0;

      return {
        cashIn, cashOut, bankIn, bankOut, salesTotal, gstTotal, salesCount,
        oldGoldG, oldSilverG,
        walkinInCount, walkinOutCount, walkinGoldIn, walkinSilverIn,
        chitAmt, chitGoldG, chitSilverG, chitCount,
        smartGoldG, smartSilverG, smartCount,
        cashBonusAmt, cashBonusCount,
        goldSoldG, silverSoldG, mrpTotal, expenseTotal,
      };
    },
  });
}

// Running all-time position (opening + all movements)
function usePosition() {
  return useQuery({
    queryKey: ["position"],
    queryFn: async () => {
      const client = supabase();
      const [openingRes, cashAllRes, bankAllRes] = await Promise.all([
        client.from("opening_balances").select("balance_type, amount, effective_date")
          .order("effective_date", { ascending: false }),
        client.from("cash_ledger").select("direction, amount"),
        client.from("bank_ledger").select("direction, amount"),
      ]);

      // Take the latest opening entry per type
      const seen = new Set<string>();
      const opening: Record<string, number> = {};
      for (const o of (openingRes.data ?? []) as any[]) {
        if (!seen.has(o.balance_type)) {
          seen.add(o.balance_type);
          opening[o.balance_type] = Number(o.amount) || 0;
        }
      }

      const cashRows = (cashAllRes.data ?? []) as any[];
      const totalCashIn  = cashRows.filter((r) => r.direction === "in").reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const totalCashOut = cashRows.filter((r) => r.direction === "out").reduce((s, r) => s + (Number(r.amount) || 0), 0);

      const bankRows = (bankAllRes.data ?? []) as any[];
      const totalBankIn  = bankRows.filter((r) => r.direction === "in").reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const totalBankOut = bankRows.filter((r) => r.direction === "out").reduce((s, r) => s + (Number(r.amount) || 0), 0);

      return {
        openingCash:    opening["cash"]    ?? 0,
        openingBank:    opening["bank"]    ?? 0,
        openingGoldG:   opening["gold_g"]  ?? 0,
        openingSilverG: opening["silver_g"] ?? 0,
        hasOpening: Object.keys(opening).length > 0,
        currentCash: (opening["cash"] ?? 0) + totalCashIn - totalCashOut,
        currentBank: (opening["bank"] ?? 0) + totalBankIn - totalBankOut,
      };
    },
  });
}

function useCashCount(date: string) {
  return useQuery({
    queryKey: ["cash_count", date],
    queryFn: async () => {
      const { data } = await supabase()
        .from("cash_counts")
        .select("actual_amount, notes, updated_at")
        .eq("count_date", date)
        .maybeSingle();
      return data ? { actual: Number(data.actual_amount), notes: data.notes ?? "", updatedAt: data.updated_at } : null;
    },
  });
}

interface StatCardProps { label: string; value: string; sub?: string; color?: string }
function StatCard({ label, value, sub, color = "text-ink" }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
      <p className="text-xs text-ink-dim mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-ink-dim mt-1">{sub}</p>}
    </div>
  );
}

export default function DailySheetPage() {
  const t = useT();
  const date = useGlobalDate((s) => s.date);
  const qc = useQueryClient();
  const { data, isLoading } = useDaily(date);
  const { data: pos } = usePosition();
  const { data: cashCount } = useCashCount(date);

  // Cash reconciliation
  const [showCountForm, setShowCountForm] = useState(false);
  const [countAmt, setCountAmt] = useState(0);
  const [countNotes, setCountNotes] = useState("");

  const saveCashCount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase()
        .from("cash_counts")
        .upsert({ count_date: date, actual_amount: countAmt, notes: countNotes || null, updated_at: new Date().toISOString() }, { onConflict: "count_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash_count", date] });
      setShowCountForm(false);
    },
  });

  // Cash → Bank transfer form
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmt, setTransferAmt] = useState(0);
  const [transferDate, setTransferDate] = useState(date);
  const [transferNotes, setTransferNotes] = useState("");

  // Opening balance setup form
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [obDate, setObDate] = useState(date);
  const [obCash, setObCash] = useState(0);
  const [obBank, setObBank] = useState(0);
  const [obGold, setObGold] = useState(0);
  const [obSilver, setObSilver] = useState(0);

  const transfer = useMutation({
    mutationFn: async () => {
      if (transferAmt <= 0) throw new Error("Invalid amount");
      const client = supabase();
      const desc = transferNotes ? `Cash → Bank: ${transferNotes}` : "Cash → Bank transfer";
      await Promise.all([
        client.from("cash_ledger").insert({
          tx_date: transferDate, direction: "out", amount: transferAmt,
          description: desc, ref_type: "transfer",
        }),
        client.from("bank_ledger").insert({
          tx_date: transferDate, direction: "in", amount: transferAmt,
          description: desc, ref_type: "transfer",
        }),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-sheet", date] });
      qc.invalidateQueries({ queryKey: ["position"] });
      setTransferAmt(0); setTransferNotes(""); setShowTransfer(false);
    },
  });

  const saveOpening = useMutation({
    mutationFn: async () => {
      const client = supabase();
      const entries = [
        { balance_type: "cash",     amount: obCash },
        { balance_type: "bank",     amount: obBank },
        { balance_type: "gold_g",   amount: obGold },
        { balance_type: "silver_g", amount: obSilver },
      ];
      for (const e of entries) {
        await client.from("opening_balances").upsert(
          { effective_date: obDate, balance_type: e.balance_type, amount: e.amount },
          { onConflict: "effective_date,balance_type" }
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["position"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      setShowOpeningForm(false);
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("daily_sheet")}</h1>
        <span className="text-sm text-ink-dim">{date}</span>
      </div>

      {/* Opening balance setup banner */}
      {pos && !pos.hasOpening && !showOpeningForm && (
        <div className="bg-warn/5 border border-warn/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-ink-dim">Set your <strong>FY opening balances</strong> to see accurate cash-in-hand and bank position.</p>
          <button onClick={() => setShowOpeningForm(true)}
            className="text-xs bg-warn text-white px-3 py-1.5 rounded-lg2 ml-4 whitespace-nowrap">
            Setup Opening
          </button>
        </div>
      )}

      {/* Opening balance form */}
      {showOpeningForm && (
        <div className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Financial Year Opening Balances</h3>
            <button onClick={() => setShowOpeningForm(false)} className="text-ink-dim text-sm">✕</button>
          </div>
          <p className="text-xs text-ink-dim">Set once at FY start. All subsequent movements are tracked from here.</p>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Effective Date (FY start)</label>
            <input type="date" value={obDate} onChange={(e) => setObDate(e.target.value)} className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Opening Cash in Hand (₹)</label>
              <input type="number" step="0.01" value={obCash || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setObCash(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Opening Bank Balance (₹)</label>
              <input type="number" step="0.01" value={obBank || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setObBank(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Opening Gold Reserve (g)</label>
              <input type="number" step="0.001" value={obGold || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setObGold(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Opening Silver Reserve (g)</label>
              <input type="number" step="0.001" value={obSilver || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setObSilver(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
          </div>

          <div className="flex gap-2">
            <button disabled={saveOpening.isPending} onClick={() => saveOpening.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {saveOpening.isPending ? "Saving…" : "Save Opening Balances"}
            </button>
            <button type="button" onClick={() => setShowOpeningForm(false)}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {saveOpening.isError && (
            <p className="text-xs text-err">Save failed — run migration 005 in Supabase SQL Editor first.</p>
          )}
        </div>
      )}

      {/* Current position (running balance) */}
      {pos && pos.hasOpening && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Current Position</h2>
            <div className="flex gap-2">
              <button onClick={() => { setShowOpeningForm(true); setObCash(pos.openingCash); setObBank(pos.openingBank); setObGold(pos.openingGoldG); setObSilver(pos.openingSilverG); }}
                className="text-xs text-ink-dim hover:text-gold">Edit Opening</button>
              <button onClick={() => setShowTransfer(!showTransfer)}
                className="text-xs bg-canvas border border-line px-3 py-1 rounded-lg2 hover:border-gold">
                💳 Cash → Bank
              </button>
              <button
                onClick={() => { setShowCountForm(true); setCountAmt(cashCount?.actual ?? 0); setCountNotes(cashCount?.notes ?? ""); }}
                className="text-xs bg-gold/10 border border-gold/30 text-gold px-3 py-1 rounded-lg2 hover:bg-gold/20">
                🧾 Count Cash
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Cash in Hand (Calculated)"
              value={inr(pos.currentCash)}
              color={pos.currentCash >= 0 ? "text-ok" : "text-err"}
              sub={`Opening ${inr(pos.openingCash)} + all movements`}
            />
            <StatCard
              label="Bank Balance"
              value={inr(pos.currentBank)}
              color={pos.currentBank >= 0 ? "text-ok" : "text-err"}
              sub={`Opening ${inr(pos.openingBank)} + all movements`}
            />
          </div>

          {/* Cash reconciliation result — shown when a count exists for today */}
          {cashCount && (() => {
            const diff = cashCount.actual - pos.currentCash;
            const matched = Math.abs(diff) < 0.01;
            return (
              <div className={`rounded-xl border p-4 shadow-soft ${matched ? "bg-ok/5 border-ok/30" : "bg-warn/5 border-warn/30"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink">Cash Count — {date}</h3>
                  <button
                    onClick={() => { setShowCountForm(true); setCountAmt(cashCount.actual); setCountNotes(cashCount.notes); }}
                    className="text-xs text-ink-dim hover:text-gold">
                    Edit Count
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-xs text-ink-dim mb-1">Calculated</p>
                    <p className="text-lg font-bold text-ok">{inr(pos.currentCash)}</p>
                    <p className="text-xs text-ink-dim">From ledger</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-ink-dim mb-1">Actual (Counted)</p>
                    <p className="text-lg font-bold text-ink">{inr(cashCount.actual)}</p>
                    <p className="text-xs text-ink-dim">Physical count</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-ink-dim mb-1">Difference</p>
                    <p className={`text-lg font-bold ${matched ? "text-ok" : diff > 0 ? "text-warn" : "text-err"}`}>
                      {diff >= 0 ? "+" : ""}{inr(diff)}
                    </p>
                    <p className="text-xs text-ink-dim">
                      {matched ? "Tallied ✓" : diff > 0 ? "Extra cash (unrecorded income?)" : "Cash short (unrecorded expense?)"}
                    </p>
                  </div>
                </div>
                {cashCount.notes && (
                  <p className="text-xs text-ink-dim mt-3 border-t border-line/50 pt-2">Note: {cashCount.notes}</p>
                )}
              </div>
            );
          })()}

          {/* Cash count entry form */}
          {showCountForm && (
            <div className="bg-white border border-gold/30 rounded-xl p-4 shadow-soft space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Enter Actual Cash in Hand</h3>
                <span className="text-xs text-ink-dim">Calculated: <strong className="text-ok">{inr(pos.currentCash)}</strong></span>
              </div>
              <p className="text-xs text-ink-dim">Count the physical cash in your drawer/counter and enter the total here.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Actual Cash in Hand (₹) *</label>
                  <input
                    type="number" step="0.01" value={countAmt || ""}
                    placeholder="0.00" onFocus={(e) => e.target.select()}
                    onChange={(e) => setCountAmt(parseFloat(e.target.value) || 0)}
                    className={inp} autoFocus />
                  {countAmt > 0 && (
                    <p className={`text-xs mt-1 font-medium ${Math.abs(countAmt - pos.currentCash) < 0.01 ? "text-ok" : countAmt > pos.currentCash ? "text-warn" : "text-err"}`}>
                      Difference: {countAmt - pos.currentCash >= 0 ? "+" : ""}{inr(countAmt - pos.currentCash)}
                      {Math.abs(countAmt - pos.currentCash) < 0.01 ? " — Tallied ✓" : ""}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes (optional)</label>
                  <input value={countNotes}
                    onChange={(e) => setCountNotes(e.target.value)}
                    className={inp} placeholder="e.g. ₹500 notes: 10, ₹100 notes: 20…" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={countAmt <= 0 || saveCashCount.isPending}
                  onClick={() => saveCashCount.mutate()}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                  {saveCashCount.isPending ? "Saving…" : "Save Count"}
                </button>
                <button onClick={() => setShowCountForm(false)}
                  className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
              {saveCashCount.isError && (
                <p className="text-xs text-err">Save failed — run migration 007 in Supabase SQL Editor first.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cash → Bank transfer form */}
      {showTransfer && (
        <div className="bg-white border border-gold/30 rounded-xl p-4 shadow-soft space-y-3">
          <h3 className="text-sm font-semibold text-ink">Cash → Bank Transfer</h3>
          <p className="text-xs text-ink-dim">Cash leaves hand, enters bank account. Net position unchanged.</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Amount (₹) *</label>
              <input type="number" step="0.01" value={transferAmt || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setTransferAmt(parseFloat(e.target.value) || 0)}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Notes</label>
              <input value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)}
                className={inp} placeholder="Optional…" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={transfer.isPending || transferAmt <= 0}
              onClick={() => transfer.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {transfer.isPending ? "Saving…" : "Transfer"}
            </button>
            <button type="button" onClick={() => setShowTransfer(false)}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {transfer.isError && <p className="text-xs text-err">Transfer failed.</p>}
        </div>
      )}

      {/* --- TODAY's snapshot below --- */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">{t("loading")}</p>
      ) : data ? (
        <>
          <h2 className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Today&apos;s Activity</h2>

          {/* Sales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label={t("sales_count")} value={String(data.salesCount)} color="text-gold" />
            <StatCard label={t("sales_total")} value={inr(data.salesTotal)} color="text-gold" />
            <StatCard label={t("gst_collected")} value={inr(data.gstTotal)} color="text-warn" />
          </div>

          {/* Weight sold + MRP + Expenses */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Gold Sold" value={grams(data.goldSoldG)} color="text-gold" sub="Net wt today" />
            <StatCard label="Silver Sold" value={grams(data.silverSoldG)} color="text-ink-mid" sub="Net wt today" />
            <StatCard label="MRP Items" value={inr(data.mrpTotal)} color="text-info" sub="Silver MPR line total" />
            <StatCard label="Total Expenses" value={inr(data.expenseTotal)} color="text-err" sub="All expenses today" />
          </div>

          {/* Cash & Bank today */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label={t("cash_in")} value={inr(data.cashIn)} color="text-ok" />
            <StatCard label={t("cash_out")} value={inr(data.cashOut)} color="text-err" />
            <StatCard label={t("bank_in")} value={inr(data.bankIn)} color="text-ok" />
            <StatCard label={t("bank_out")} value={inr(data.bankOut)} color="text-err" />
          </div>

          {/* Net today */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("net_cash")}
              value={inr(data.cashIn - data.cashOut)}
              color={data.cashIn - data.cashOut >= 0 ? "text-ok" : "text-err"}
              sub="Today: Cash In − Cash Out"
            />
            <StatCard
              label={t("net_bank")}
              value={inr(data.bankIn - data.bankOut)}
              color={data.bankIn - data.bankOut >= 0 ? "text-ok" : "text-err"}
              sub="Today: Bank In − Bank Out"
            />
          </div>

          {/* Metal */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label={t("old_gold_g")} value={grams(data.oldGoldG)} color="text-gold" sub="Pure weight received today" />
            <StatCard label={t("old_silver_g")} value={grams(data.oldSilverG)} color="text-ink-mid" sub="Pure weight received today" />
          </div>

          {/* Walk-ins */}
          {(data.walkinInCount > 0 || data.walkinOutCount > 0) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Walk-ins" value={String(data.walkinInCount)} color="text-ok" />
              <StatCard label="Walk-outs" value={String(data.walkinOutCount)} color="text-err" />
              <StatCard label="Gold Interest" value={String(data.walkinGoldIn)} color="text-gold" />
              <StatCard label="Silver Interest" value={String(data.walkinSilverIn)} color="text-ink-mid" />
            </div>
          )}

          {/* Scheme activity — Chit, Smart Gold, Cash Bonus */}
          {(data.chitCount > 0 || data.smartCount > 0 || data.cashBonusCount > 0) && (
            <>
              <h2 className="text-sm font-semibold text-ink-dim uppercase tracking-wide">Scheme Activity</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.chitCount > 0 && (
                  <>
                    <StatCard
                      label="Metal Chit — Amount"
                      value={inr(data.chitAmt)}
                      color="text-gold"
                      sub={`${data.chitCount} payment${data.chitCount > 1 ? "s" : ""} today`}
                    />
                    {data.chitGoldG > 0 && (
                      <StatCard
                        label="Metal Chit — Gold Credited"
                        value={grams(data.chitGoldG, 4)}
                        color="text-gold"
                        sub="Pure grams → customer account"
                      />
                    )}
                    {data.chitSilverG > 0 && (
                      <StatCard
                        label="Metal Chit — Silver Credited"
                        value={grams(data.chitSilverG, 4)}
                        color="text-ink-mid"
                        sub="Pure grams → customer account"
                      />
                    )}
                  </>
                )}
                {data.smartCount > 0 && (
                  <>
                    {data.smartGoldG > 0 && (
                      <StatCard
                        label="Smart Gold Chit — Gold Received"
                        value={grams(data.smartGoldG, 4)}
                        color="text-gold"
                        sub={`${data.smartCount} deposit${data.smartCount > 1 ? "s" : ""} · physical gold in`}
                      />
                    )}
                    {data.smartSilverG > 0 && (
                      <StatCard
                        label="Smart Gold Chit — Silver Received"
                        value={grams(data.smartSilverG, 4)}
                        color="text-ink-mid"
                        sub="Physical silver in"
                      />
                    )}
                  </>
                )}
                {data.cashBonusCount > 0 && (
                  <StatCard
                    label="Cash Bonus Deposits"
                    value={inr(data.cashBonusAmt)}
                    color="text-ok"
                    sub={`${data.cashBonusCount} deposit${data.cashBonusCount > 1 ? "s" : ""} today`}
                  />
                )}
              </div>
            </>
          )}
        </>
      ) : null}

      {/* Edit Opening link if already set */}
      {pos && pos.hasOpening && !showOpeningForm && (
        <p className="text-xs text-ink-dim text-center">
          Opening set: Cash {inr(pos.openingCash)}, Bank {inr(pos.openingBank)}, Gold {grams(pos.openingGoldG)}, Silver {grams(pos.openingSilverG)}.{" "}
          <button onClick={() => { setShowOpeningForm(true); setObCash(pos.openingCash); setObBank(pos.openingBank); setObGold(pos.openingGoldG); setObSilver(pos.openingSilverG); }}
            className="text-gold hover:underline">Edit</button>
        </p>
      )}
    </div>
  );
}
