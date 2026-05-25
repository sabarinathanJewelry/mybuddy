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

  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payLoanId, setPayLoanId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ pay_date: globalDate, principal: 0, interest: 0, mode: "cash", notes: "" });

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
    mutationFn: async (l: any) => {
      const client = supabase();
      // Remove ledger entries for each payment
      for (const p of (l.loan_payments ?? [])) {
        await client.from("cash_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", p.id);
        await client.from("bank_ledger").delete().eq("ref_type", "loan_payment").eq("ref_id", p.id);
      }
      // Remove the loan's own cash ledger entry (matched by ref_type + date + amount)
      if (l.affects_cash) {
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

  // Total summary
  const totalOutstanding = (loans as any[])?.reduce((s, l) => s + Number(l.outstanding), 0) ?? 0;
  const totalAccrued = (loans as any[])?.reduce((s, l) => s + accruedInterest(l, globalDate), 0) ?? 0;

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
          {(loans as any[])?.map((l) => {
            const accrued = accruedInterest(l, globalDate);
            const totalDue = Number(l.outstanding) + accrued;
            const startDate = new Date(l.loan_date);
            const today = new Date(globalDate);
            const daysElapsed = Math.max(0, Math.floor((today.getTime() - startDate.getTime()) / 86400000));
            const isOpen = expanded === l.id;
            const period = (l.interest_period ?? "monthly") as InterestPeriod;
            const eq = equivalentRates(Number(l.interest_rate), period);

            return (
              <div key={l.id} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                {/* Summary row */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-canvas/50"
                  onClick={() => setExpanded(isOpen ? null : l.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{l.lender}</p>
                    <p className="text-xs text-ink-dim">{shortDate(l.loan_date)} · {l.kind}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Principal</p>
                    <p className="font-mono text-sm">{inr(l.principal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Outstanding</p>
                    <p className="font-mono text-sm font-semibold text-err">{inr(l.outstanding)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Accrued Int.</p>
                    <p className="font-mono text-sm text-warn">{inr(accrued)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-ink-dim">Total Due</p>
                    <p className="font-mono text-sm font-bold text-err">{inr(totalDue)}</p>
                  </div>
                  <div className={clsx("text-xs px-2 py-0.5 rounded-full", l.outstanding <= 0 ? "bg-ok/10 text-ok" : "bg-err/10 text-err")}>
                    {l.outstanding <= 0 ? "Closed" : "Active"}
                  </div>
                  <span className="text-ink-dim text-xs">{isOpen ? "▲" : "▼"}</span>
                </div>

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
                            <div key={p.id} className="flex items-center gap-3 text-sm bg-canvas rounded-lg2 px-3 py-2">
                              <span className="text-ink-dim text-xs">{shortDate(p.pay_date)}</span>
                              <span className="capitalize text-xs border border-line rounded px-1.5 py-0.5 text-ink-dim">{p.mode}</span>
                              {p.principal > 0 && <span className="text-xs text-ok">Principal: {inr(p.principal)}</span>}
                              {p.interest > 0 && <span className="text-xs text-warn">Interest: {inr(p.interest)}</span>}
                              <span className="font-mono font-medium ml-auto">{inr(p.total)}</span>
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

                    <div className="flex justify-end border-t border-line pt-3">
                      <button
                        disabled={deleteLoan.isPending}
                        onClick={async () => {
                          if (!confirm(`Delete loan "${l.lender}" (${shortDate(l.loan_date)})? This will also remove all its payments and ledger entries.`)) return;
                          await deleteLoan.mutateAsync(l);
                        }}
                        className="text-xs text-err hover:underline disabled:opacity-40"
                      >
                        {deleteLoan.isPending ? "Deleting…" : "Delete this loan"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!loans?.length && (
            <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
              No loans yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
