"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import { clsx } from "clsx";

type InterestPeriod = "daily" | "monthly" | "yearly";

const KINDS = ["term", "cc", "car", "local"];
const PERIODS: { value: InterestPeriod; label: string; short: string }[] = [
  { value: "daily",   label: "Per Day",   short: "/day" },
  { value: "monthly", label: "Per Month", short: "/mo"  },
  { value: "yearly",  label: "Per Year",  short: "/yr"  },
];

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold";

// Convert any rate to daily rate for uniform accrual
function toDailyRate(rate: number, period: InterestPeriod): number {
  if (period === "daily")   return rate / 100;
  if (period === "monthly") return rate / 100 / 30;
  return rate / 100 / 365;
}

// Show equivalent rates in all 3 periods
function equivalentRates(rate: number, period: InterestPeriod) {
  const daily = toDailyRate(rate, period);
  return {
    daily:   parseFloat((daily * 100).toFixed(4)),
    monthly: parseFloat((daily * 30 * 100).toFixed(4)),
    yearly:  parseFloat((daily * 365 * 100).toFixed(2)),
  };
}

// Segment-based interest: each principal repayment resets the accrual on the reduced balance
function accruedInterest(loan: any, today: string): number {
  if (!loan.loan_date || !loan.principal) return 0;
  const dailyRate = toDailyRate(Number(loan.interest_rate), (loan.interest_period ?? "monthly") as InterestPeriod);
  const payments: any[] = [...(loan.loan_payments ?? [])].sort((a, b) => a.pay_date.localeCompare(b.pay_date));

  let segStart = loan.loan_date;
  let segOutstanding = Number(loan.principal);
  let totalAccrued = 0;

  for (const p of payments) {
    const payDate = p.pay_date > today ? today : p.pay_date;
    const days = Math.max(0, Math.floor((new Date(payDate).getTime() - new Date(segStart).getTime()) / 86400000));
    totalAccrued += segOutstanding * dailyRate * days;
    if (p.pay_date > today) break;
    segOutstanding = Math.max(0, segOutstanding - Number(p.principal));
    segStart = p.pay_date;
  }

  // Final segment: last payment date (or loan_date) → today
  const finalDays = Math.max(0, Math.floor((new Date(today).getTime() - new Date(segStart).getTime()) / 86400000));
  totalAccrued += segOutstanding * dailyRate * finalDays;

  // Subtract interest already paid in payments
  const interestPaid = payments.filter(p => p.pay_date <= today).reduce((s, p) => s + Number(p.interest), 0);
  return parseFloat(Math.max(0, totalAccrued - interestPaid).toFixed(2));
}

function rateLabel(rate: number, period: InterestPeriod): string {
  const p = PERIODS.find((x) => x.value === period);
  return `${rate}%${p?.short ?? ""}`;
}

function useLoans() {
  return useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data, error } = await supabase().from("loans")
        .select("*, loan_payments(*)")
        .order("loan_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function LoansPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: loans, isLoading } = useLoans();
  const qc = useQueryClient();

  const [showForm, setShowForm]           = useState(false);
  const [showClosed, setShowClosed]       = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expanded, setExpanded]           = useState<string | null>(null);
  const [payLoanId, setPayLoanId]         = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editGroupLoanId, setEditGroupLoanId] = useState<string | null>(null);
  const [editGroupValue, setEditGroupValue]   = useState("");
  const [deleteOpts, setDeleteOpts]       = useState({ removeLoanLedger: true, removePaymentLedger: true });
  const [payForm, setPayForm] = useState({ pay_date: globalDate, principal: 0, interest: 0, mode: "cash", notes: "" });
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [editPaymentId, setEditPaymentId]     = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({ pay_date: "", principal: 0, interest: 0, mode: "cash", notes: "" });

  const [form, setForm] = useState({
    loan_date: globalDate, kind: "local", lender: "",
    principal: 0, interest_rate: 0, interest_period: "daily" as InterestPeriod,
    tenure_months: 1, affects_cash: true, notes: "",
  });

  const equiv = equivalentRates(form.interest_rate, form.interest_period);

  const save = useMutation({
    mutationFn: async (data: typeof form) => {
      const { data: row, error } = await supabase().from("loans").insert({
        loan_date: data.loan_date, kind: data.kind, lender: data.lender,
        principal: data.principal, interest_rate: data.interest_rate,
        interest_period: data.interest_period,
        tenure_months: data.tenure_months, affects_cash: data.affects_cash,
        outstanding: data.principal, notes: data.notes || null,
      }).select().single();
      if (error) throw error;
      if (data.affects_cash) {
        await supabase().from("cash_ledger").insert({
          tx_date: data.loan_date, direction: "in", amount: data.principal,
          description: `Loan from ${data.lender}`, ref_type: "loan",
        });
      }
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      setShowForm(false);
      setForm({ loan_date: globalDate, kind: "local", lender: "", principal: 0, interest_rate: 0, interest_period: "daily", tenure_months: 1, affects_cash: true, notes: "" });
    },
  });

  const deleteLoan = useMutation({
    mutationFn: async ({ l, opts }: { l: any; opts: { removeLoanLedger: boolean; removePaymentLedger: boolean } }) => {
      const client = supabase();
      if (opts.removePaymentLedger) {
        for (const p of (l.loan_payments ?? [])) {
          await client.from("cash_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", p.id);
          await client.from("bank_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", p.id);
        }
      }
      if (opts.removeLoanLedger && l.affects_cash) {
        await client.from("cash_ledger").delete()
          .eq("ref_type", "loan")
          .eq("tx_date", l.loan_date)
          .eq("amount", l.principal);
      }
      const { error } = await client.from("loans").delete().eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      setExpanded(null);
      setDeleteConfirmId(null);
    },
  });

  const addPayment = useMutation({
    mutationFn: async ({ loan, pf }: { loan: any; pf: typeof payForm }) => {
      const client = supabase();
      const total = parseFloat((pf.principal + pf.interest).toFixed(2));
      const { data: row, error } = await client.from("loan_payments").insert({
        loan_id: loan.id, pay_date: pf.pay_date,
        principal: pf.principal, interest: pf.interest, total,
        mode: pf.mode, notes: pf.notes || null,
      }).select().single();
      if (error) throw error;
      if (pf.principal > 0) {
        await client.from("loans").update({
          outstanding: Math.max(0, Number(loan.outstanding) - pf.principal),
        }).eq("id", loan.id);
      }
      if (total > 0) {
        const desc = `Loan repayment — ${loan.lender}`;
        if (pf.mode === "cash") {
          await client.from("cash_ledger").insert({ tx_date: pf.pay_date, direction: "out", amount: total, description: desc, ref_type: "loan_payment", ref_id: row.id });
        } else if (pf.mode === "bank" || pf.mode === "upi") {
          await client.from("bank_ledger").insert({ tx_date: pf.pay_date, direction: "out", amount: total, description: desc, ref_type: "loan_payment", ref_id: row.id });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      setPayLoanId(null);
      setPayForm({ pay_date: globalDate, principal: 0, interest: 0, mode: "cash", notes: "" });
    },
  });

  const deletePayment = useMutation({
    mutationFn: async ({ payment, loan }: { payment: any; loan: any }) => {
      const client = supabase();
      await client.from("cash_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", payment.id);
      await client.from("bank_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", payment.id);
      await client.from("loan_payments").delete().eq("id", payment.id);
      if (Number(payment.principal) > 0) {
        await client.from("loans").update({
          outstanding: Number(loan.outstanding) + Number(payment.principal),
        }).eq("id", loan.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      setDeletePaymentId(null);
    },
  });

  const updatePayment = useMutation({
    mutationFn: async ({ payment, loan, pf }: { payment: any; loan: any; pf: typeof editPayForm }) => {
      const client = supabase();
      const total = parseFloat((pf.principal + pf.interest).toFixed(2));
      await client.from("loan_payments").update({
        pay_date: pf.pay_date, principal: pf.principal, interest: pf.interest,
        total, mode: pf.mode, notes: pf.notes || null,
      }).eq("id", payment.id);
      // Adjust outstanding: reverse old principal, apply new principal
      const principalDelta = Number(payment.principal) - pf.principal;
      if (principalDelta !== 0) {
        await client.from("loans").update({
          outstanding: Math.max(0, Number(loan.outstanding) + principalDelta),
        }).eq("id", loan.id);
      }
      // Update ledger entries
      await client.from("cash_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", payment.id);
      await client.from("bank_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", payment.id);
      if (total > 0) {
        const desc = `Loan repayment — ${loan.lender}`;
        if (pf.mode === "cash") {
          await client.from("cash_ledger").insert({ tx_date: pf.pay_date, direction: "out", amount: total, description: desc, ref_type: "loan_payment", ref_id: payment.id });
        } else if (pf.mode === "bank" || pf.mode === "upi") {
          await client.from("bank_ledger").insert({ tx_date: pf.pay_date, direction: "out", amount: total, description: desc, ref_type: "loan_payment", ref_id: payment.id });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      setEditPaymentId(null);
    },
  });

  const setGroupLabel = useMutation({
    mutationFn: async ({ loanId, groupLabel }: { loanId: string; groupLabel: string }) => {
      await supabase().from("loans").update({ group_label: groupLabel.trim() || null }).eq("id", loanId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loans"] });
      setEditGroupLoanId(null);
    },
  });

  // Summary: active loans only
  const activeLoans = (loans as any[])?.filter(l => Number(l.outstanding) > 0) ?? [];
  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding), 0);
  const totalAccrued = activeLoans.reduce((s, l) => s + accruedInterest(l, globalDate), 0);

  // Group by lender (filtered by showClosed)
  const visibleLoans = (loans as any[])?.filter(l => showClosed || Number(l.outstanding) > 0) ?? [];
  const allGroupLabels = [...new Set((loans as any[])?.map(l => l.group_label ?? l.lender) ?? [])];

  const groupMap = visibleLoans.reduce((acc: Record<string, any[]>, l) => {
    const key = l.group_label ?? l.lender;
    if (!acc[key]) acc[key] = [];
    acc[key].push(l);
    return acc;
  }, {});
  const sortedGroups = Object.entries(groupMap).sort(([, ga], [, gb]) => {
    const aActive = ga.some(l => Number(l.outstanding) > 0) ? 0 : 1;
    const bActive = gb.some(l => Number(l.outstanding) > 0) ? 0 : 1;
    return aActive - bActive;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("loans")}</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          {showForm ? "Cancel" : `+ ${t("add_loan")}`}
        </button>
      </div>

      {/* Summary strip */}
      {(loans as any[])?.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim">Total Outstanding</p>
            <p className="text-lg font-bold text-err">{inr(totalOutstanding)}</p>
          </div>
          <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim">Accrued Interest (today)</p>
            <p className="text-lg font-bold text-warn">{inr(totalAccrued)}</p>
          </div>
          <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
            <p className="text-xs text-ink-dim">Total Due</p>
            <p className="text-lg font-bold text-err">{inr(totalOutstanding + totalAccrued)}</p>
          </div>
        </div>
      )}

      {/* Add Loan Form */}
      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
          className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4">
          <h2 className="font-semibold text-sm">New Loan</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
              <input type="date" value={form.loan_date}
                onChange={(e) => setForm({ ...form, loan_date: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Lender *</label>
              <input type="text" value={form.lender} required
                onChange={(e) => setForm({ ...form, lender: e.target.value })} className={inp} placeholder="Who gave the loan" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Principal (₹) *</label>
              <input type="number" step="0.01" value={form.principal || ""}
                onChange={(e) => setForm({ ...form, principal: parseFloat(e.target.value) || 0 })} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inp}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {/* Interest rate + period together */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">Interest Rate</label>
              <div className="flex gap-2">
                <input type="number" step="0.0001" value={form.interest_rate || ""}
                  onChange={(e) => setForm({ ...form, interest_rate: parseFloat(e.target.value) || 0 })}
                  className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
                  placeholder="e.g. 0.06" />
                <span className="flex items-center text-sm text-ink-dim px-1">%</span>
                <div className="flex rounded-lg2 overflow-hidden border border-line">
                  {PERIODS.map((p) => (
                    <button key={p.value} type="button"
                      onClick={() => setForm({ ...form, interest_period: p.value })}
                      className={clsx("px-3 py-2 text-xs font-medium transition-colors",
                        form.interest_period === p.value ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas")}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Equivalent rate preview */}
              {form.interest_rate > 0 && (
                <div className="mt-2 flex gap-4 text-xs text-ink-dim bg-canvas rounded-lg px-3 py-2">
                  <span>Daily: <strong className={form.interest_period === "daily" ? "text-gold" : ""}>{equiv.daily}%/day</strong></span>
                  <span>Monthly: <strong className={form.interest_period === "monthly" ? "text-gold" : ""}>{equiv.monthly}%/mo</strong></span>
                  <span>Yearly: <strong className={form.interest_period === "yearly" ? "text-gold" : ""}>{equiv.yearly}%/yr</strong></span>
                  {form.principal > 0 && (
                    <span className="ml-auto">Day 1 interest: <strong className="text-warn">{inr(form.principal * toDailyRate(form.interest_rate, form.interest_period))}</strong></span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Tenure (months)</label>
              <input type="number" value={form.tenure_months || ""}
                onChange={(e) => setForm({ ...form, tenure_months: parseInt(e.target.value) || 1 })} className={inp} />
            </div>
            <div className="flex flex-col justify-center">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.affects_cash}
                  onChange={(e) => setForm({ ...form, affects_cash: e.target.checked })} className="accent-gold w-4 h-4" />
                Affects cash balance
              </label>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">Notes</label>
              <input type="text" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp} placeholder="Optional" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending || !form.lender || form.principal <= 0}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {/* Loans list */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="space-y-2">
          {/* Show/Hide closed toggle */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-dim">{sortedGroups.length} lender{sortedGroups.length !== 1 ? "s" : ""}</p>
            <button onClick={() => setShowClosed(v => !v)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${showClosed ? "bg-ink text-white border-ink" : "border-line text-ink-dim hover:border-gold"}`}>
              {showClosed ? "Hide Closed" : "Show Closed"}
            </button>
          </div>

          {sortedGroups.map(([lender, lenderLoans]) => {
            const groupOutstanding = lenderLoans.reduce((s, l) => s + Number(l.outstanding), 0);
            const groupAccrued = lenderLoans.reduce((s, l) => s + accruedInterest(l, globalDate), 0);
            const groupPrincipal = lenderLoans.reduce((s, l) => s + Number(l.principal), 0);
            const hasActive = lenderLoans.some(l => Number(l.outstanding) > 0);
            const isGroupOpen = expandedGroup === lender;

            return (
              <div key={lender} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                {/* Group header row */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-canvas/50"
                  onClick={() => setExpandedGroup(isGroupOpen ? null : lender)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{lender}</p>
                    <p className="text-xs text-ink-dim">{lenderLoans.length} loan{lenderLoans.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Principal</p>
                    <p className="font-mono text-sm">{inr(groupPrincipal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Outstanding</p>
                    <p className="font-mono text-sm font-semibold text-err">{inr(groupOutstanding)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Accrued Int.</p>
                    <p className="font-mono text-sm text-warn">{inr(groupAccrued)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Total Due</p>
                    <p className="font-mono text-sm font-bold text-err">{inr(groupOutstanding + groupAccrued)}</p>
                  </div>
                  <span className={clsx("text-xs px-2 py-0.5 rounded-full", hasActive ? "bg-err/10 text-err" : "bg-ok/10 text-ok")}>
                    {hasActive ? "Active" : "Closed"}
                  </span>
                  <span className="text-ink-dim text-xs">{isGroupOpen ? "▲" : "▼"}</span>
                </div>

                {/* Individual loans within group */}
                {isGroupOpen && (
                  <div className="border-t border-line divide-y divide-line">
                    {lenderLoans.map((l) => {
                      const accrued = accruedInterest(l, globalDate);
                      const totalDue = Number(l.outstanding) + accrued;
                      const daysElapsed = Math.max(0, Math.floor((new Date(globalDate).getTime() - new Date(l.loan_date).getTime()) / 86400000));
                      const isOpen = expanded === l.id;
                      const period = (l.interest_period ?? "monthly") as InterestPeriod;
                      const eq = equivalentRates(Number(l.interest_rate), period);

                      return (
                        <div key={l.id}>
                          {/* Individual loan summary row */}
                          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-canvas/40 bg-canvas/20"
                            onClick={() => setExpanded(isOpen ? null : l.id)}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-ink">{l.lender}</p>
                              <p className="text-xs text-ink-dim">{shortDate(l.loan_date)} · {l.kind}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm">{inr(l.principal)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold text-err">{inr(l.outstanding)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm text-warn">{inr(accrued)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm font-bold text-err">{inr(totalDue)}</p>
                            </div>
                            <span className={clsx("text-xs px-2 py-0.5 rounded-full", l.outstanding <= 0 ? "bg-ok/10 text-ok" : "bg-err/10 text-err")}>
                              {l.outstanding <= 0 ? "Closed" : "Active"}
                            </span>
                            <span className={clsx("text-xs px-2 py-0.5 rounded-full", l.affects_cash ? "bg-info/10 text-info" : "bg-canvas text-ink-dim border border-line")}>
                              {l.affects_cash ? "Cash" : "Non-cash"}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); setEditGroupLoanId(editGroupLoanId === l.id ? null : l.id); setEditGroupValue(l.group_label ?? l.lender); }}
                              className="text-xs text-ink-dim hover:text-gold border border-line rounded px-1.5 py-0.5 hover:border-gold">
                              Group
                            </button>
                            <span className="text-ink-dim text-xs">{isOpen ? "▲" : "▼"}</span>
                          </div>

                          {/* Set Group inline */}
                          {editGroupLoanId === l.id && (
                            <div className="px-4 py-2 bg-gold/5 border-t border-line flex items-center gap-2 flex-wrap"
                              onClick={e => e.stopPropagation()}>
                              <span className="text-xs text-ink-dim">Group name:</span>
                              <input
                                list="group-labels"
                                value={editGroupValue}
                                onChange={e => setEditGroupValue(e.target.value)}
                                placeholder={l.lender}
                                autoFocus
                                className="border border-line rounded-lg2 px-2 py-1 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-gold"
                              />
                              <datalist id="group-labels">
                                {allGroupLabels.map(g => <option key={g} value={g} />)}
                              </datalist>
                              <button
                                disabled={setGroupLabel.isPending}
                                onClick={() => setGroupLabel.mutate({ loanId: l.id, groupLabel: editGroupValue })}
                                className="bg-gold text-white text-xs px-3 py-1 rounded-lg2 disabled:opacity-50">
                                {setGroupLabel.isPending ? "…" : "Save"}
                              </button>
                              <button onClick={() => setEditGroupLoanId(null)}
                                className="text-xs text-ink-dim hover:underline">Cancel</button>
                            </div>
                          )}

                          {/* Expanded detail */}
                          {isOpen && (
                  <div className="border-t border-line px-4 py-4 space-y-4">
                    {/* Interest breakdown */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-ink-dim">Interest Rate</p>
                        <p className="font-semibold text-gold">{rateLabel(Number(l.interest_rate), period)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Equivalent Daily</p>
                        <p className="font-mono">{eq.daily}%/day</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Equivalent Monthly</p>
                        <p className="font-mono">{eq.monthly}%/mo</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Equivalent Yearly</p>
                        <p className="font-mono">{eq.yearly}%/yr</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Days Elapsed</p>
                        <p className="font-semibold">{daysElapsed} days</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Interest/Day</p>
                        <p className="font-mono text-warn">{inr(Number(l.outstanding) * toDailyRate(Number(l.interest_rate), period))}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Accrued to Date</p>
                        <p className="font-mono font-semibold text-warn">{inr(accrued)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Total Due Now</p>
                        <p className="font-mono font-bold text-err">{inr(totalDue)}</p>
                      </div>
                    </div>

                    {/* Record Payment */}
                    {l.outstanding > 0 && (
                      <div>
                        {payLoanId !== l.id ? (
                          <button
                            onClick={() => {
                              setPayLoanId(l.id);
                              setPayForm({ pay_date: globalDate, principal: 0, interest: parseFloat(accrued.toFixed(2)), mode: "cash", notes: "" });
                            }}
                            className="text-sm bg-ok/10 text-ok border border-ok/30 px-4 py-1.5 rounded-lg2 hover:bg-ok/20"
                          >
                            + Record Payment
                          </button>
                        ) : (
                          <div className="border border-ok/30 rounded-xl p-4 bg-ok/5 space-y-3">
                            <h3 className="text-sm font-semibold text-ok">Record Repayment</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Date</label>
                                <input type="date" value={payForm.pay_date}
                                  onChange={(e) => setPayForm({ ...payForm, pay_date: e.target.value })}
                                  className={inp} />
                              </div>
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Mode</label>
                                <select value={payForm.mode} onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })} className={inp}>
                                  <option value="cash">Cash</option>
                                  <option value="bank">Bank Transfer</option>
                                  <option value="upi">UPI</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">
                                  Principal Paid (₹)
                                  <span className="ml-1 text-ink-dim/60 font-normal">outstanding: {inr(l.outstanding)}</span>
                                </label>
                                <input type="number" step="0.01" value={payForm.principal || ""}
                                  onFocus={(e) => e.target.select()} placeholder="0"
                                  onChange={(e) => setPayForm({ ...payForm, principal: parseFloat(e.target.value) || 0 })}
                                  className={inp} />
                              </div>
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">
                                  Interest Paid (₹)
                                  <span className="ml-1 text-ink-dim/60 font-normal">accrued: {inr(accrued)}</span>
                                </label>
                                <input type="number" step="0.01" value={payForm.interest || ""}
                                  onFocus={(e) => e.target.select()} placeholder="0"
                                  onChange={(e) => setPayForm({ ...payForm, interest: parseFloat(e.target.value) || 0 })}
                                  className={inp} />
                              </div>
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Notes</label>
                                <input value={payForm.notes}
                                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                                  placeholder="Optional" className={inp} />
                              </div>
                            </div>
                            {/* Total preview */}
                            {(payForm.principal + payForm.interest) > 0 && (
                              <div className="flex gap-4 text-xs bg-canvas rounded-lg px-3 py-2">
                                {payForm.principal > 0 && <span>Principal: <strong className="text-ok">{inr(payForm.principal)}</strong></span>}
                                {payForm.interest > 0 && <span>Interest: <strong className="text-warn">{inr(payForm.interest)}</strong></span>}
                                <span className="ml-auto font-semibold">Total: {inr(payForm.principal + payForm.interest)}</span>
                                {payForm.principal > 0 && (
                                  <span className="text-ink-dim">New outstanding: <strong className="text-ok">{inr(Math.max(0, Number(l.outstanding) - payForm.principal))}</strong></span>
                                )}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                disabled={addPayment.isPending || (payForm.principal <= 0 && payForm.interest <= 0)}
                                onClick={() => addPayment.mutate({ loan: l, pf: payForm })}
                                className="bg-ok text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50"
                              >
                                {addPayment.isPending ? "Saving…" : "Save Payment"}
                              </button>
                              <button onClick={() => setPayLoanId(null)}
                                className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Payment history */}
                    {l.loan_payments?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-ink-dim mb-2">Payment History</p>
                        <div className="space-y-1">
                          {[...l.loan_payments].sort((a: any, b: any) => b.pay_date.localeCompare(a.pay_date)).map((p: any) => (
                            <div key={p.id}>
                              {/* Edit form */}
                              {editPaymentId === p.id ? (
                                <div className="bg-gold/5 border border-gold/20 rounded-lg2 px-3 py-3 space-y-2">
                                  <p className="text-xs font-semibold text-ink-dim">Edit Payment</p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Date</label>
                                      <input type="date" value={editPayForm.pay_date}
                                        onChange={e => setEditPayForm(f => ({ ...f, pay_date: e.target.value }))}
                                        className={inp} />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Principal (₹)</label>
                                      <input type="number" step="1" value={editPayForm.principal || ""}
                                        onFocus={e => e.target.select()}
                                        onChange={e => setEditPayForm(f => ({ ...f, principal: parseFloat(e.target.value) || 0 }))}
                                        className={inp} />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Interest (₹)</label>
                                      <input type="number" step="1" value={editPayForm.interest || ""}
                                        onFocus={e => e.target.select()}
                                        onChange={e => setEditPayForm(f => ({ ...f, interest: parseFloat(e.target.value) || 0 }))}
                                        className={inp} />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Mode</label>
                                      <select value={editPayForm.mode}
                                        onChange={e => setEditPayForm(f => ({ ...f, mode: e.target.value }))}
                                        className={inp}>
                                        <option value="cash">Cash</option>
                                        <option value="bank">Bank</option>
                                        <option value="upi">UPI</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Notes</label>
                                      <input value={editPayForm.notes}
                                        onChange={e => setEditPayForm(f => ({ ...f, notes: e.target.value }))}
                                        className={inp} placeholder="Optional" />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      disabled={updatePayment.isPending}
                                      onClick={() => updatePayment.mutate({ payment: p, loan: l, pf: editPayForm })}
                                      className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                      {updatePayment.isPending ? "Saving…" : "Save"}
                                    </button>
                                    <button onClick={() => setEditPaymentId(null)}
                                      className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                                  </div>
                                </div>
                              ) : deletePaymentId === p.id ? (
                                <div className="bg-err/5 border border-err/20 rounded-lg2 px-3 py-2 flex items-center gap-3 flex-wrap">
                                  <span className="text-xs text-err flex-1">Delete {inr(p.total)} payment on {shortDate(p.pay_date)}?</span>
                                  <button
                                    disabled={deletePayment.isPending}
                                    onClick={() => deletePayment.mutate({ payment: p, loan: l })}
                                    className="bg-err text-white text-xs px-3 py-1 rounded-lg2 disabled:opacity-50">
                                    {deletePayment.isPending ? "Deleting…" : "Delete"}
                                  </button>
                                  <button onClick={() => setDeletePaymentId(null)}
                                    className="text-xs text-ink-dim hover:underline">Cancel</button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 text-sm bg-canvas rounded-lg2 px-3 py-2 group">
                                  <span className="text-ink-dim text-xs">{shortDate(p.pay_date)}</span>
                                  <span className="capitalize text-xs border border-line rounded px-1.5 py-0.5 text-ink-dim">{p.mode}</span>
                                  {p.principal > 0 && <span className="text-xs text-ok">Principal: {inr(p.principal)}</span>}
                                  {p.interest > 0 && <span className="text-xs text-warn">Interest: {inr(p.interest)}</span>}
                                  <span className="font-mono font-medium ml-auto">{inr(p.total)}</span>
                                  <button
                                    onClick={() => { setEditPaymentId(p.id); setEditPayForm({ pay_date: p.pay_date, principal: Number(p.principal), interest: Number(p.interest), mode: p.mode ?? "cash", notes: p.notes ?? "" }); }}
                                    className="text-xs text-ink-dim hover:text-gold opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                                  <button
                                    onClick={() => setDeletePaymentId(p.id)}
                                    className="text-xs text-err opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs px-3 py-1.5 bg-canvas/50 rounded-b-lg border-t border-line mt-1">
                          <span className="text-ink-dim">Total paid</span>
                          <span>
                            Principal: <strong className="text-ok">{inr(l.loan_payments.reduce((s: number, p: any) => s + Number(p.principal), 0))}</strong>
                            <span className="mx-2 text-ink-dim">·</span>
                            Interest: <strong className="text-warn">{inr(l.loan_payments.reduce((s: number, p: any) => s + Number(p.interest), 0))}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {l.notes && (
                      <p className="text-xs text-ink-dim bg-canvas rounded-lg px-3 py-2">{l.notes}</p>
                    )}

                    <div className="border-t border-line pt-3">
                      {deleteConfirmId !== l.id ? (
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              setDeleteConfirmId(l.id);
                              setDeleteOpts({ removeLoanLedger: !!l.affects_cash, removePaymentLedger: (l.loan_payments?.length ?? 0) > 0 });
                            }}
                            className="text-xs text-err hover:underline"
                          >
                            Delete this loan
                          </button>
                        </div>
                      ) : (
                        <div className="border border-err/30 bg-err/5 rounded-xl p-4 space-y-3">
                          <p className="text-sm font-semibold text-err">Delete &ldquo;{l.lender}&rdquo; ({shortDate(l.loan_date)})?</p>
                          <p className="text-xs text-ink-dim">The loan record will be removed. Choose what else to clean up:</p>
                          <div className="space-y-2">
                            {l.affects_cash && (
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={deleteOpts.removeLoanLedger}
                                  onChange={e => setDeleteOpts(o => ({ ...o, removeLoanLedger: e.target.checked }))}
                                  className="accent-gold w-4 h-4" />
                                Remove loan cash entry ({inr(l.principal)} on {shortDate(l.loan_date)})
                              </label>
                            )}
                            {(l.loan_payments?.length ?? 0) > 0 && (
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={deleteOpts.removePaymentLedger}
                                  onChange={e => setDeleteOpts(o => ({ ...o, removePaymentLedger: e.target.checked }))}
                                  className="accent-gold w-4 h-4" />
                                Remove {l.loan_payments.length} payment ledger {l.loan_payments.length === 1 ? "entry" : "entries"}
                              </label>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={deleteLoan.isPending}
                              onClick={() => deleteLoan.mutate({ l, opts: deleteOpts })}
                              className="text-xs bg-err text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                              {deleteLoan.isPending ? "Deleting…" : "Confirm Delete"}
                            </button>
                            <button onClick={() => setDeleteConfirmId(null)}
                              className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                          </div>
                        </div>
                      )}
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
          })}
          {!sortedGroups.length && (
            <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
              {(loans as any[])?.length ? "No active loans. Toggle \"Show Closed\" to see all." : "No loans yet."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
