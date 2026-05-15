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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (payments as any[]) ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Metal Chit Savings</h1>
          <p className="text-sm text-ink-dim mt-0.5">Customer metal accumulation account</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          + Add Payment
        </button>
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

      {/* Recent payments */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Amount</th>
                <th className="text-right px-3 py-2.5">Grams</th>
                <th className="text-left px-3 py-2.5">Mode</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p: any) => (
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
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
