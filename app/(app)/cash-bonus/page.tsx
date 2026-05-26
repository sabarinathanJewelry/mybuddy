"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import type { Customer } from "@/modules/customers/types";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const PAY_MODES = [
  { value: "cash",  label: "Cash" },
  { value: "upi",   label: "UPI/GPay" },
  { value: "bank",  label: "Bank" },
];

export default function CashBonusPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [depositDate, setDepositDate] = useState(globalDate);
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("cash");
  const [notes, setNotes] = useState("");

  const { data: deposits, isLoading } = useQuery({
    queryKey: ["cash_savings_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("cash_savings_deposits")
        .select("*, customers(name)")
        .order("deposit_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  function resetForm() {
    setCustomer(null); setAmount(0); setMode("cash");
    setDepositDate(globalDate); setNotes(""); setShowForm(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!customer || amount <= 0) throw new Error("Invalid input");
      const client = supabase();

      // 1. Record the savings deposit
      const { data: row, error } = await client.from("cash_savings_deposits").insert({
        customer_id: customer.id,
        deposit_date: depositDate,
        amount,
        mode,
        notes: notes || null,
      }).select().single();
      if (error) throw error;

      // 2. Credit to customer balance via payments table (direction=in means customer gave us money)
      await client.from("payments").insert({
        pay_date: depositDate,
        direction: "in",
        mode,
        amount,
        customer_id: customer.id,
        notes: `Cash Bonus deposit`,
      });

      // 3. Fan out to ledger so daily sheet and cash/bank totals are correct
      if (mode === "cash") {
        await client.from("cash_ledger").insert({
          tx_date: depositDate, direction: "in", amount,
          description: `Cash Bonus: ${customer.name}`,
          ref_type: "cash_savings", ref_id: row.id,
        });
      } else {
        await client.from("bank_ledger").insert({
          tx_date: depositDate, direction: "in", amount,
          description: `Cash Bonus: ${customer.name}`,
          ref_type: "cash_savings", ref_id: row.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash_savings_deposits"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      resetForm();
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (deposits as any[]) ?? [];
  const totalDeposited = rows.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const memberCount = new Set(rows.map((r: any) => r.customer_id as string)).size;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cash Bonus Scheme</h1>
          <p className="text-sm text-ink-dim mt-0.5">Customer deposits cash — credited to their account balance</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          + Add Deposit
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Total Deposited (last 100)</p>
          <p className="text-xl font-bold text-ok">{inr(totalDeposited)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Active Members</p>
          <p className="text-xl font-bold text-gold">{memberCount}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4">
          <h3 className="font-semibold text-sm text-ink">Record Cash Deposit</h3>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Customer *</label>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Amount (₹) *</label>
              <input type="number" step="0.01" value={amount || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className={inp} />
            </div>

            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)} className={inp} />
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-ink-dim mb-1">Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={inp}>
                {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {amount > 0 && (
            <div className="bg-ok/5 border border-ok/20 rounded-lg2 px-4 py-3 text-sm flex justify-between">
              <span className="text-ink-dim">This deposit increases customer credit by</span>
              <span className="font-bold text-ok">{inr(amount)}</span>
            </div>
          )}

          <div>
            <label className="block text-xs text-ink-dim mb-1">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className={inp} placeholder="Optional…" />
          </div>

          <div className="flex gap-2">
            <button
              disabled={save.isPending || !customer || amount <= 0}
              onClick={() => save.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save Deposit"}
            </button>
            <button type="button" onClick={resetForm}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {save.isError && (
            <p className="text-xs text-err">Save failed — run migration 004 in Supabase SQL Editor first.</p>
          )}
        </div>
      )}

      {/* History */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-right px-3 py-2.5">Amount</th>
                <th className="text-left px-3 py-2.5">Mode</th>
                <th className="text-left px-3 py-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d: any) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(d.deposit_date)}</td>
                  <td className="px-3 py-2.5 font-medium">{d.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ok font-semibold">{inr(d.amount)}</td>
                  <td className="px-3 py-2.5 text-ink-dim capitalize">{d.mode}</td>
                  <td className="px-3 py-2.5 text-ink-dim text-xs">{d.notes ?? "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
