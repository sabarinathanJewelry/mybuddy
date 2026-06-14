"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useBoardRate } from "@/stores/board-rate";
import { useT } from "@/i18n";
import { inr, grams, shortDate } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import type { Customer } from "@/modules/customers/types";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const PAY_MODES = [
  { value: "cash",    label: "Cash" },
  { value: "upi",     label: "UPI/GPay" },
  { value: "bank",    label: "Bank" },
  { value: "advance", label: "From Customer Advance" },
];

function useChitPayments() {
  return useQuery({
    queryKey: ["chit_payments"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("chit_payments")
        .select("*, customers(name, gold_balance_g, silver_balance_g)")
        .order("pay_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ChitsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const boardRate = useBoardRate((s) => s.rate);
  const qc = useQueryClient();
  const { data: payments, isLoading } = useChitPayments();

  const [showForm, setShowForm] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [metalType, setMetalType] = useState<"gold" | "silver">("gold");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("cash");
  const [payDate, setPayDate] = useState(globalDate);
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);

  const [showBonusForm, setShowBonusForm] = useState(false);
  const [bonusCustomer, setBonusCustomer] = useState<Customer | null>(null);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [bonusNotes, setBonusNotes] = useState("");

  // Current board rate for selected metal
  const boardRateForMetal = metalType === "gold"
    ? (boardRate?.gold_22k ?? 0)
    : (boardRate?.silver ?? 0);

  const metalGrams = boardRateForMetal > 0
    ? parseFloat((amount / boardRateForMetal).toFixed(4))
    : 0;

  function resetForm() {
    setCustomer(null); setMetalType("gold"); setAmount(0);
    setMode("cash"); setPayDate(globalDate); setNotes("");
    setShowForm(false);
  }

  function startEdit(p: any) {
    setEditingId(p.id);
    setEditAmount(Number(p.amount));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAmount(0);
  }

  const updatePayment = useMutation({
    mutationFn: async ({ id, newAmount }: { id: string; newAmount: number }) => {
      const client = supabase();
      const row = (rows as any[]).find((p: any) => p.id === id);
      if (!row) throw new Error("Row not found");

      const oldAmount = Number(row.amount);
      const oldGrams = Number(row.metal_grams);
      const boardRate = Number(row.board_rate);
      const newGrams = boardRate > 0 ? parseFloat((newAmount / boardRate).toFixed(4)) : oldGrams;
      const deltaGrams = newGrams - oldGrams;
      const deltaAmount = newAmount - oldAmount;

      // Update chit_payments row
      const { error } = await client.from("chit_payments")
        .update({ amount: newAmount, metal_grams: newGrams })
        .eq("id", id);
      if (error) throw error;

      // Adjust customer metal balance
      const balanceField = row.metal_type === "gold" ? "gold_balance_g" : "silver_balance_g";
      const { data: cust } = await client.from("customers")
        .select("gold_balance_g, silver_balance_g").eq("id", row.customer_id).single();
      const current = Number((cust as any)?.[balanceField]) || 0;
      await client.from("customers")
        .update({ [balanceField]: parseFloat((current + deltaGrams).toFixed(4)) })
        .eq("id", row.customer_id);

      // Update cash/bank ledger
      if (row.mode === "cash") {
        await client.from("cash_ledger")
          .update({ amount: newAmount })
          .eq("ref_type", "chit_payment").eq("ref_id", id);
      } else if (row.mode === "upi" || row.mode === "bank") {
        await client.from("bank_ledger")
          .update({ amount: newAmount })
          .eq("ref_type", "chit_payment").eq("ref_id", id);
      } else if (row.mode === "advance" && Math.abs(deltaAmount) > 0.01) {
        // Insert a correction entry to balance the advance
        await client.from("payments").insert({
          pay_date: row.pay_date,
          direction: deltaAmount > 0 ? "out" : "in",
          mode: "advance",
          amount: Math.abs(deltaAmount),
          customer_id: row.customer_id,
          is_advance: true,
          notes: `Chit payment correction (${row.metal_type})`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chit_payments"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      cancelEdit();
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!customer || amount <= 0 || boardRateForMetal <= 0) throw new Error("Invalid input");
      const client = supabase();

      // 1. Insert chit payment record
      const { data: row, error } = await client.from("chit_payments").insert({
        customer_id: customer.id,
        pay_date: payDate,
        metal_type: metalType,
        amount,
        mode,
        board_rate: boardRateForMetal,
        metal_grams: metalGrams,
        notes: notes || null,
      }).select().single();
      if (error) throw error;

      // 2. Update customer metal balance
      const balanceField = metalType === "gold" ? "gold_balance_g" : "silver_balance_g";
      const { data: cust } = await client.from("customers")
        .select("gold_balance_g, silver_balance_g").eq("id", customer.id).single();
      const current = (cust as any)?.[balanceField] ?? 0;
      await client.from("customers")
        .update({ [balanceField]: parseFloat((current + metalGrams).toFixed(4)) })
        .eq("id", customer.id);

      // 3. Fan out cash/bank or reduce advance balance
      if (mode === "cash") {
        await client.from("cash_ledger").insert({
          tx_date: payDate, direction: "in", amount,
          description: `Chit (${metalType}): ${customer.name}`,
          ref_type: "chit_payment", ref_id: row.id,
        });
      } else if (mode === "upi" || mode === "bank") {
        await client.from("bank_ledger").insert({
          tx_date: payDate, direction: "in", amount,
          description: `Chit (${metalType}): ${customer.name}`,
          ref_type: "chit_payment", ref_id: row.id,
        });
      } else if (mode === "advance") {
        // Deduct from customer advance balance via payments table
        await client.from("payments").insert({
          pay_date: payDate, direction: "out", mode: "advance",
          amount, customer_id: customer.id,
          is_advance: true,
          notes: `Chit payment (${metalType}) — ${metalGrams.toFixed(4)}g`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chit_payments"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      resetForm();
    },
  });

  const creditBonus = useMutation({
    mutationFn: async ({ customer, amount, notes }: { customer: Customer; amount: number; notes: string }) => {
      const client = supabase();
      const { data: cust } = await client.from("customers").select("bonus_balance").eq("id", customer.id).single();
      const current = Number((cust as any)?.bonus_balance) || 0;
      const { error } = await client.from("customers")
        .update({ bonus_balance: current + amount })
        .eq("id", customer.id);
      if (error) throw error;
      // Record as a payment-in so it appears in customer ledger
      await client.from("payments").insert({
        pay_date: globalDate, direction: "in", mode: "cash",
        amount, customer_id: customer.id,
        notes: notes || "Chit bonus credited",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setShowBonusForm(false);
      setBonusCustomer(null);
      setBonusAmount(0);
      setBonusNotes("");
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (payments as any[]) ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Metal Chit Savings</h1>
          <p className="text-sm text-ink-dim mt-0.5">Customer metal accumulation account</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowBonusForm(true); setShowForm(false); }}
            className="bg-ok/10 text-ok border border-ok/30 text-sm px-4 py-2 rounded-lg2 hover:bg-ok/20">
            + Credit Bonus
          </button>
          <button onClick={() => { setShowForm(true); setShowBonusForm(false); }}
            className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
            + Add Payment
          </button>
        </div>
      </div>

      {/* Payment form */}
      {showForm && (
        <div className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4">
          <h3 className="font-semibold text-sm text-ink">Record Chit Payment</h3>

          {/* Customer */}
          <div>
            <label className="block text-xs text-ink-dim mb-1">Customer *</label>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>

          {/* Show customer's current balance */}
          {customer && (
            <div className="bg-canvas rounded-lg2 px-4 py-2.5 flex gap-6 text-sm">
              <div>
                <span className="text-ink-dim text-xs">Cash Balance: </span>
                <strong className={customer.opening_balance < 0 ? "text-err" : "text-ok"}>
                  {inr(customer.opening_balance)}
                </strong>
              </div>
              <div>
                <span className="text-ink-dim text-xs">Gold: </span>
                <strong className="text-gold">{grams(customer.gold_balance_g)}</strong>
              </div>
              <div>
                <span className="text-ink-dim text-xs">Silver: </span>
                <strong className="text-ink-mid">{grams(customer.silver_balance_g)}</strong>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Metal type */}
            <div>
              <label className="block text-xs text-ink-dim mb-1">Metal</label>
              <div className="flex gap-2">
                {(["gold", "silver"] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => setMetalType(m)}
                    className={`flex-1 py-2 rounded-lg2 text-sm font-medium border transition-colors ${
                      metalType === m
                        ? m === "gold" ? "bg-gold/10 border-gold text-gold" : "bg-ink-mid/10 border-ink-mid text-ink-mid"
                        : "border-line text-ink-dim hover:border-gold"
                    }`}>
                    {m === "gold" ? "Gold" : "Silver"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={payDate}
                onChange={(e) => setPayDate(e.target.value)} className={inp} />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs text-ink-dim mb-1">Amount (₹) *</label>
              <input type="number" step="0.01" value={amount || ""}
                placeholder="0"
                onFocus={(e) => e.target.select()}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className={inp} />
            </div>

            {/* Payment mode */}
            <div>
              <label className="block text-xs text-ink-dim mb-1">Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={inp}>
                {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Board rate + computed grams */}
          <div className="bg-gold/5 border border-gold/20 rounded-lg2 px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-dim">{metalType === "gold" ? "Gold 22K" : "Silver"} rate</span>
              <span className="font-mono">{inr(boardRateForMetal)}/g</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>{metalType === "gold" ? "Gold" : "Silver"} credited</span>
              <span className="text-gold">{metalGrams.toFixed(4)} g</span>
            </div>
            {mode === "advance" && customer && (
              <div className="flex justify-between text-err text-xs pt-1 border-t border-gold/20">
                <span>Advance balance after payment</span>
                <strong>{inr(customer.opening_balance - amount)}</strong>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className={inp} placeholder="Optional…" />
          </div>

          <div className="flex gap-2">
            <button
              disabled={save.isPending || !customer || amount <= 0 || boardRateForMetal <= 0}
              onClick={() => save.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "Saving…" : t("save")}
            </button>
            <button type="button" onClick={resetForm}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {save.isError && (
            <p className="text-xs text-err">
              Save failed — run migration 003 in Supabase SQL Editor first (chit_payments table).
            </p>
          )}
        </div>
      )}

      {/* Bonus credit form */}
      {showBonusForm && (
        <div className="bg-white border border-ok/30 rounded-xl p-5 shadow-soft space-y-4">
          <h3 className="font-semibold text-sm text-ink">Credit Chit Bonus to Customer</h3>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Customer *</label>
            <CustomerPicker value={bonusCustomer} onChange={setBonusCustomer} />
          </div>
          {bonusCustomer && (
            <div className="bg-canvas rounded-lg2 px-4 py-2.5 text-sm flex gap-6">
              <div>
                <span className="text-ink-dim text-xs">Current Bonus Balance: </span>
                <strong className="text-ok">{inr((bonusCustomer as any).bonus_balance ?? 0)}</strong>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Bonus Amount (₹) *</label>
              <input type="number" step="1" min="0" value={bonusAmount || ""}
                onFocus={e => e.target.select()}
                onChange={e => setBonusAmount(parseFloat(e.target.value) || 0)}
                className={inp} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Notes</label>
              <input value={bonusNotes} onChange={e => setBonusNotes(e.target.value)}
                className={inp} placeholder="e.g. Board bonus June 2026" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!bonusCustomer || bonusAmount <= 0 || creditBonus.isPending}
              onClick={() => bonusCustomer && creditBonus.mutate({ customer: bonusCustomer, amount: bonusAmount, notes: bonusNotes })}
              className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {creditBonus.isPending ? "Saving…" : "Credit Bonus"}
            </button>
            <button onClick={() => { setShowBonusForm(false); setBonusCustomer(null); setBonusAmount(0); setBonusNotes(""); }}
              className="border border-line text-sm px-5 py-2 rounded-lg2">Cancel</button>
          </div>
          {creditBonus.isError && <p className="text-xs text-err">Save failed — please try again.</p>}
        </div>
      )}

      {/* Recent payments */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Amount</th>
                <th className="text-right px-3 py-2.5">Grams</th>
                <th className="text-left px-3 py-2.5">Mode</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: any) => {
                const isEditing = editingId === p.id;
                const storedRate = Number(p.board_rate);
                const previewGrams = storedRate > 0
                  ? (editAmount / storedRate).toFixed(4)
                  : Number(p.metal_grams).toFixed(4);
                return isEditing ? (
                  <tr key={p.id} className="border-b border-line bg-gold/5">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                    <td className="px-3 py-2.5 font-medium">{p.customers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 capitalize">
                      <span className={p.metal_type === "gold" ? "text-gold" : "text-ink-mid"}>
                        {p.metal_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="0.01" autoFocus
                        value={editAmount || ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                        className="w-28 border border-gold rounded px-2 py-1 text-sm font-mono text-right focus:outline-none focus:ring-1 focus:ring-gold"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-gold">{previewGrams}g</td>
                    <td className="px-3 py-2.5 text-ink-dim capitalize">{p.mode === "advance" ? "Advance" : p.mode}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        disabled={updatePayment.isPending || editAmount <= 0}
                        onClick={() => updatePayment.mutate({ id: p.id, newAmount: editAmount })}
                        className="bg-gold text-white text-xs px-3 py-1 rounded disabled:opacity-50 mr-1">
                        {updatePayment.isPending ? "…" : "Save"}
                      </button>
                      <button onClick={cancelEdit}
                        className="border border-line text-xs px-3 py-1 rounded text-ink-dim">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                    <td className="px-3 py-2.5 font-medium">{p.customers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 capitalize">
                      <span className={p.metal_type === "gold" ? "text-gold" : "text-ink-mid"}>
                        {p.metal_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(p.amount)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gold">{Number(p.metal_grams).toFixed(4)}g</td>
                    <td className="px-3 py-2.5 text-ink-dim capitalize">{p.mode === "advance" ? "Advance" : p.mode}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => startEdit(p)}
                        className="text-xs text-ink-dim border border-line rounded px-2 py-0.5 hover:border-gold hover:text-gold">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
