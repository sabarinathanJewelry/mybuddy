"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

function useLedgerEntries(tableType: "cash" | "bank") {
  return useQuery({
    queryKey: ["ledger_detail", tableType],
    queryFn: async () => {
      const table = tableType === "cash" ? "cash_ledger" : "bank_ledger";
      const { data, error } = await supabase()
        .from(table)
        .select("id, tx_date, direction, amount, description, ref_type, created_at")
        .order("tx_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useOpening(balType: "cash" | "bank") {
  return useQuery({
    queryKey: ["opening_balance_val", balType],
    queryFn: async () => {
      const { data } = await supabase()
        .from("opening_balances")
        .select("amount")
        .eq("balance_type", balType)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? Number(data.amount) : 0;
    },
  });
}

const REF_LABELS: Record<string, string> = {
  sale: "Sale",
  expense: "Expense",
  payment: "Payment",
  chit_payment: "Chit",
  cash_savings: "Cash Bonus",
  bullion: "Bullion",
  transfer: "Transfer",
  loan: "Loan",
  old_metal_intake: "Old Gold",
  order: "Order Advance",
  av: "AV Income",
  investment: "Investment",
  investment_return: "Inv. Return",
};

export default function LedgerPage() {
  const t = useT();
  const [tab, setTab] = useState<"cash" | "bank">("cash");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: rawEntries = [], isLoading } = useLedgerEntries(tab);
  const { data: opening = 0 } = useOpening(tab);

  // Compute running balance oldest-first
  const withBalance = useMemo(() => {
    let bal = opening;
    return rawEntries.map((e: any) => {
      const amt = Number(e.amount) || 0;
      bal = e.direction === "in" ? bal + amt : bal - amt;
      return { ...e, runningBalance: bal };
    });
  }, [rawEntries, opening]);

  // Filter by date range
  const filtered = useMemo(() => {
    return withBalance.filter((e: any) => {
      if (fromDate && e.tx_date < fromDate) return false;
      if (toDate && e.tx_date > toDate) return false;
      return true;
    });
  }, [withBalance, fromDate, toDate]);

  // Totals for filtered window
  const totalIn  = filtered.filter((e: any) => e.direction === "in").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const totalOut = filtered.filter((e: any) => e.direction === "out").reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const closing  = filtered.length > 0 ? filtered[filtered.length - 1].runningBalance : opening;

  // Display newest-first (reverse), but balance values are already correct
  const displayed = [...filtered].reverse();

  const inp = "border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cash &amp; Bank Ledger</h1>
        <p className="text-xs text-ink-dim">Every movement, with running balance</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["cash", "bank"] as const).map((type) => (
          <button key={type} onClick={() => setTab(type)}
            className={`px-5 py-2 rounded-lg2 text-sm font-medium transition-colors ${
              tab === type ? "bg-gold text-white" : "border border-line text-ink-dim hover:border-gold"
            }`}>
            {type === "cash" ? "💵 Cash" : "🏦 Bank"}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Opening Balance</p>
          <p className="text-lg font-bold text-ink">{inr(opening)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Total In</p>
          <p className="text-lg font-bold text-ok">{inr(totalIn)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">Total Out</p>
          <p className="text-lg font-bold text-err">{inr(totalOut)}</p>
        </div>
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
          <p className="text-xs text-ink-dim mb-1">{fromDate || toDate ? "Period Closing" : "Current Balance"}</p>
          <p className={`text-lg font-bold ${closing >= 0 ? "text-ok" : "text-err"}`}>{inr(closing)}</p>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-line rounded-xl px-4 py-3 shadow-soft">
        <span className="text-xs text-ink-dim font-medium">Filter by date:</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-dim">From</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inp} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-dim">To</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inp} />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(""); setToDate(""); }}
            className="text-xs text-gold hover:underline">Clear</button>
        )}
        <span className="text-xs text-ink-dim ml-auto">{filtered.length} entries</span>
      </div>

      {/* Ledger table */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Description</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-right px-3 py-2.5 text-ok">In (₹)</th>
                <th className="text-right px-3 py-2.5 text-err">Out (₹)</th>
                <th className="text-right px-4 py-2.5">Balance</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((e: any) => (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2 text-ink-dim">{shortDate(e.tx_date)}</td>
                  <td className="px-3 py-2 max-w-xs truncate">{e.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs bg-canvas border border-line rounded px-1.5 py-0.5 text-ink-dim">
                      {REF_LABELS[e.ref_type] ?? (e.ref_type ?? "—")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ok">
                    {e.direction === "in" ? inr(Number(e.amount)) : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-err">
                    {e.direction === "out" ? inr(Number(e.amount)) : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    <span className={e.runningBalance >= 0 ? "text-ok" : "text-err"}>
                      {inr(e.runningBalance)}
                    </span>
                  </td>
                </tr>
              ))}
              {!displayed.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-dim">
                    No entries{fromDate || toDate ? " in this date range" : ""}
                  </td>
                </tr>
              )}
            </tbody>
            {displayed.length > 0 && (
              <tfoot>
                <tr className="bg-canvas border-t-2 border-line text-sm font-semibold">
                  <td colSpan={3} className="px-4 py-2.5 text-ink-dim">
                    {filtered.length} transactions
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-ok">{inr(totalIn)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-err">{inr(totalOut)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={closing >= 0 ? "text-ok" : "text-err"}>{inr(closing)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
