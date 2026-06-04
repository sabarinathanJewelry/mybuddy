"use client";

import { Fragment, useState } from "react";
import { usePayments, useSavePayment, useUpdatePayment, useDeletePayment } from "@/modules/payments/api";
import type { PaymentFilters } from "@/modules/payments/api";
import CustomerPicker from "@/modules/customers/customer-picker";
import CustomerBalanceBadge from "@/modules/customers/customer-balance-badge";
import {
  usePartnerAccounts, usePartnerBalances, usePartnerSettlements,
  useSavePartnerAccount, useDeletePartnerAccount, useAddSettlement, useDeleteSettlement,
} from "@/modules/partner-accounts/api";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import { clsx } from "clsx";

const MODES = ["cash", "upi", "bank", "old_gold", "old_silver", "advance"];
const MODE_LABELS: Record<string, string> = {
  cash: "Cash", upi: "UPI / GPay", bank: "Bank", old_gold: "Old Gold",
  old_silver: "Old Silver", advance: "Advance",
};
const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold";
const finp = "border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold";

type PageTab = "payments" | "partners";

// ── Partner accounts tab ─────────────────────────────────────────────────────
function PartnerAccountsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: balances = [], isLoading } = usePartnerBalances();
  const save = useSavePartnerAccount();
  const remove = useDeletePartnerAccount();
  const addSettlement = useAddSettlement();
  const deleteSettlement = useDeleteSettlement();

  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", account_type: "upi" as "upi" | "bank", account_no: "", notes: "", active: true });

  const [settlePartnerId, setSettlePartnerId] = useState<string | null>(null);
  const [settleForm, setSettleForm] = useState({ amount: "", settled_date: today, notes: "" });
  const { data: settlements = [] } = usePartnerSettlements(settlePartnerId);

  function openNew() {
    setEditId(null);
    setForm({ name: "", account_type: "upi", account_no: "", notes: "", active: true });
    setShowForm(true);
  }
  function openEdit(a: any) {
    setEditId(a.id);
    setForm({ name: a.name, account_type: a.account_type, account_no: a.account_no ?? "", notes: a.notes ?? "", active: a.active });
    setShowForm(true);
  }

  const settlePartner = balances.find(b => b.id === settlePartnerId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-dim">Partner accounts collect UPI/bank payments on behalf of the shop</p>
        <button onClick={openNew} className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">+ Add Account</button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-line p-4 shadow-soft space-y-3">
          <p className="text-sm font-semibold text-ink">{editId ? "Edit Account" : "New Partner Account"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-ink-dim">Partner Name *</label>
              <input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ravi Brother" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink-dim">Account Type</label>
              <select className={inp} value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value as "upi" | "bank" }))}>
                <option value="upi">UPI / GPay</option>
                <option value="bank">Bank Account</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink-dim">UPI ID / Account No.</label>
              <input className={inp} value={form.account_no} onChange={e => setForm(f => ({ ...f, account_no: e.target.value }))} placeholder="e.g. ravi@upi or 9876543210" />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-ink-dim">Notes</label>
              <input className={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={!form.name.trim() || save.isPending}
              onClick={async () => {
                await save.mutateAsync({ ...form, id: editId ?? undefined });
                setShowForm(false);
              }}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-40">
              {save.isPending ? "Saving…" : editId ? "Save Changes" : "Add Account"}
            </button>
            <button onClick={() => setShowForm(false)} className="border border-line text-sm px-4 py-2 rounded-lg2">Cancel</button>
          </div>
        </div>
      )}

      {/* Balance cards */}
      {isLoading ? <p className="text-ink-dim text-sm">Loading…</p> : balances.length === 0 ? (
        <div className="bg-white rounded-xl border border-line p-8 text-center text-ink-dim text-sm">No partner accounts yet</div>
      ) : (
        <div className="space-y-3">
          {balances.map(a => (
            <div key={a.id} className={`bg-white rounded-xl border shadow-soft p-4 ${a.outstanding > 0.005 ? "border-warn/30" : "border-line"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-ink">{a.name}</p>
                  <p className="text-xs text-ink-dim mt-0.5">
                    {a.account_type.toUpperCase()} {a.account_no ? `· ${a.account_no}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold font-mono ${a.outstanding > 0.005 ? "text-warn" : "text-ok"}`}>
                    {inr(a.outstanding)}
                  </p>
                  <p className="text-[10px] text-ink-dim">outstanding</p>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-ink-dim">
                <span>Received: <span className="text-ink font-mono">{inr(a.total_received)}</span></span>
                <span>Settled: <span className="text-ink font-mono">{inr(a.total_settled)}</span></span>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {a.outstanding > 0.005 && (
                  <button
                    onClick={() => { setSettlePartnerId(a.id); setSettleForm({ amount: String(a.outstanding.toFixed(2)), settled_date: today, notes: "" }); }}
                    className="bg-ok text-white text-xs px-3 py-1.5 rounded-lg2">
                    Record Settlement
                  </button>
                )}
                <button onClick={() => setSettlePartnerId(settlePartnerId === a.id ? null : a.id)}
                  className="border border-line text-xs px-3 py-1.5 rounded-lg2">
                  {settlePartnerId === a.id ? "Hide History" : "Settlement History"}
                </button>
                <button onClick={() => openEdit(a)} className="text-xs text-gold hover:underline">Edit</button>
                <button onClick={() => { if (confirm(`Remove ${a.name}?`)) remove.mutate(a.id); }}
                  className="text-xs text-err hover:underline">Remove</button>
              </div>

              {/* Settlement modal inline */}
              {settlePartnerId === a.id && (
                <div className="mt-3 pt-3 border-t border-line space-y-3">
                  {/* Record settlement */}
                  <div className="bg-ok/5 border border-ok/20 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-ok">Record Settlement</p>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-ink-dim">Date</label>
                        <input type="date" className={finp} value={settleForm.settled_date}
                          onChange={e => setSettleForm(f => ({ ...f, settled_date: e.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-ink-dim">Amount (₹)</label>
                        <input type="number" className={finp} style={{ width: 120 }} value={settleForm.amount}
                          onChange={e => setSettleForm(f => ({ ...f, amount: e.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 140 }}>
                        <label className="text-[10px] text-ink-dim">Notes</label>
                        <input type="text" className={finp + " w-full"} value={settleForm.notes}
                          onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. NEFT ref" />
                      </div>
                      <button
                        disabled={!settleForm.amount || Number(settleForm.amount) <= 0 || addSettlement.isPending}
                        onClick={async () => {
                          await addSettlement.mutateAsync({
                            partner_account_id: a.id,
                            amount: Number(settleForm.amount),
                            settled_date: settleForm.settled_date,
                            notes: settleForm.notes || undefined,
                          });
                          setSettleForm({ amount: "", settled_date: today, notes: "" });
                        }}
                        className="bg-ok text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40 shrink-0">
                        Save
                      </button>
                    </div>
                  </div>

                  {/* Settlement history */}
                  {settlements.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-ink-dim">History</p>
                      {settlements.map(s => (
                        <div key={s.id} className="flex items-center justify-between text-xs border border-line rounded-lg px-3 py-1.5">
                          <span className="text-ink-dim">{shortDate(s.settled_date)}</span>
                          <span className="font-mono text-ok font-medium">{inr(s.amount)}</span>
                          <span className="text-ink-dim truncate max-w-[120px]">{s.notes ?? "—"}</span>
                          <button onClick={() => { if (confirm("Delete settlement?")) deleteSettlement.mutate(s.id); }}
                            className="text-err hover:underline ml-2">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main payments page ────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);

  const [pageTab, setPageTab] = useState<PageTab>("payments");

  const [filters, setFilters] = useState<PaymentFilters>({});
  const hasFilters = !!(filters.fromDate || filters.toDate || filters.mode || filters.direction || filters.search);
  const { data: payments, isLoading } = usePayments(filters);
  const save = useSavePayment();
  const update = useUpdatePayment();
  const remove = useDeletePayment();
  const { data: partnerAccounts = [] } = usePartnerAccounts();

  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    pay_date: globalDate, mode: "cash", amount: 0,
    metal_wt: 0, metal_purity: 91.6, is_advance: false, notes: "",
    partner_account_id: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ pay_date: globalDate, mode: "cash", direction: "in", amount: 0, notes: "" });
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  const showPartnerField = (form.mode === "upi" || form.mode === "bank") && direction === "in";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (form.amount <= 0) return;
    const { partner_account_id, ...rest } = form;
    await save.mutateAsync({
      ...rest, direction, customer_id: customer?.id ?? null,
      partner_account_id: partner_account_id || null,
    });
    setShowForm(false);
    setForm({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, is_advance: false, notes: "", partner_account_id: "" });
    setCustomer(null);
  }

  function startEdit(p: any) {
    setEditingId(p.id);
    setEditForm({ pay_date: p.pay_date, mode: p.mode, direction: p.direction, amount: p.amount, notes: p.notes ?? "" });
    setEditCustomer(p.customers ? { id: p.customer_id, name: p.customers.name, phone: null, address: null, opening_balance: 0, gold_balance_g: 0, silver_balance_g: 0, notes: null, created_at: "" } : null);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || editForm.amount <= 0) return;
    await update.mutateAsync({ id: editingId, ...editForm, customer_id: editCustomer?.id ?? null });
    setEditingId(null);
  }

  const partnerMap = new Map(partnerAccounts.map(p => [p.id, p.name]));

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("payments")}</h1>
        {pageTab === "payments" && (
          <button onClick={() => setShowForm(true)} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
            + {t("new_payment")}
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-line pb-1">
        {(["payments", "partners"] as PageTab[]).map(tab => (
          <button key={tab} onClick={() => setPageTab(tab)}
            className={`px-4 py-1.5 text-sm rounded-lg2 transition-colors ${pageTab === tab ? "bg-gold text-white" : "border border-line text-ink-dim hover:text-ink"}`}>
            {tab === "payments" ? "Payments" : "Partner Accounts"}
          </button>
        ))}
      </div>

      {pageTab === "partners" && <PartnerAccountsTab />}

      {pageTab === "payments" && (
        <>
          {showForm && (
            <form onSubmit={handleSave} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
              {/* Direction toggle */}
              <div className="flex rounded-lg overflow-hidden border border-line">
                {(["in", "out"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDirection(d)}
                    className={clsx("flex-1 py-2 text-sm font-medium transition-colors", direction === d ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas")}>
                    {d === "in" ? "⬆ Payment In" : "⬇ Payment Out"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-ink-dim mb-1">{t("customers")}</label>
                  <CustomerPicker value={customer} onChange={setCustomer} />
                  {customer && <CustomerBalanceBadge customerId={customer.id} />}
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">{t("date")}</label>
                  <input type="date" value={form.pay_date} onChange={(e) => setForm({ ...form, pay_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">Mode</label>
                  <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value, partner_account_id: "" })} className={inp}>
                    {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-dim mb-1">{t("amount")} *</label>
                  <input type="number" step="0.01" value={form.amount || ""}
                    placeholder="Enter amount"
                    onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                    className={clsx(inp, form.amount <= 0 && "border-err/50 focus:ring-err")} />
                  {form.amount <= 0 && <p className="text-xs text-err mt-0.5">Amount is required</p>}
                </div>
                {showPartnerField && (
                  <div>
                    <label className="block text-xs font-medium text-ink-dim mb-1">Received in account</label>
                    <select value={form.partner_account_id}
                      onChange={e => setForm(f => ({ ...f, partner_account_id: e.target.value }))}
                      className={inp}>
                      <option value="">Shop account (default)</option>
                      {partnerAccounts.map(p => (
                        <option key={p.id} value={p.id}>{p.name} — {p.account_type.toUpperCase()}{p.account_no ? ` · ${p.account_no}` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                {(form.mode === "old_gold" || form.mode === "old_silver") && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-ink-dim mb-1">Weight (g)</label>
                      <input type="number" step="0.001" value={form.metal_wt} onChange={(e) => setForm({ ...form, metal_wt: parseFloat(e.target.value) || 0 })} className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-dim mb-1">Purity%</label>
                      <input type="number" step="0.01" value={form.metal_purity} onChange={(e) => setForm({ ...form, metal_purity: parseFloat(e.target.value) || 0 })} className={inp} />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.is_advance} onChange={(e) => setForm({ ...form, is_advance: e.target.checked })} className="accent-gold" />
                    {t("is_advance")}
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-ink-dim mb-1">Note (optional)</label>
                  <input type="text" value={form.notes} placeholder="e.g. advance for wedding order, balance payment…"
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className={inp} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={save.isPending || form.amount <= 0}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
                <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
            </form>
          )}

          {/* Filter bar */}
          <div className="bg-white border border-line rounded-xl px-4 py-3 shadow-soft space-y-2">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ink-dim">From</span>
                <input type="date" value={filters.fromDate ?? ""} onChange={e => setFilters(f => ({ ...f, fromDate: e.target.value || undefined }))} className={finp} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-ink-dim">To</span>
                <input type="date" value={filters.toDate ?? ""} onChange={e => setFilters(f => ({ ...f, toDate: e.target.value || undefined }))} className={finp} />
              </div>
              <select value={filters.mode ?? ""} onChange={e => setFilters(f => ({ ...f, mode: e.target.value || undefined }))} className={finp}>
                <option value="">All Modes</option>
                {MODES.map(m => <option key={m} value={m}>{MODE_LABELS[m] ?? m}</option>)}
              </select>
              <select value={filters.direction ?? ""} onChange={e => setFilters(f => ({ ...f, direction: e.target.value || undefined }))} className={finp}>
                <option value="">In &amp; Out</option>
                <option value="in">In only</option>
                <option value="out">Out only</option>
              </select>
              <input type="text" placeholder="Search name / note…" value={filters.search ?? ""}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value || undefined }))}
                className={`${finp} w-44`} />
              {hasFilters && (
                <button onClick={() => setFilters({})} className="text-xs text-gold hover:underline ml-1">Clear</button>
              )}
              <span className="text-xs text-ink-dim ml-auto">{payments?.length ?? 0} records</span>
            </div>

            {/* Totals strip */}
            {payments && payments.length > 0 && (
              <div className="flex gap-4 pt-1 border-t border-line/50 text-xs">
                <span className="text-ink-dim">Total In:
                  <span className="ml-1 font-mono font-semibold text-ok">
                    {inr((payments as any[]).filter(p => p.direction === "in").reduce((s, p) => s + Number(p.amount), 0))}
                  </span>
                </span>
                <span className="text-ink-dim">Total Out:
                  <span className="ml-1 font-mono font-semibold text-err">
                    {inr((payments as any[]).filter(p => p.direction === "out").reduce((s, p) => s + Number(p.amount), 0))}
                  </span>
                </span>
                <span className="text-ink-dim">Net:
                  <span className="ml-1 font-mono font-semibold text-ink">
                    {inr((payments as any[]).reduce((s, p) => s + (p.direction === "in" ? Number(p.amount) : -Number(p.amount)), 0))}
                  </span>
                </span>
              </div>
            )}
          </div>

          {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "480px" }}>
                <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">{t("date")}</th>
                  <th className="text-left px-3 py-2.5">Party</th>
                  <th className="text-left px-3 py-2.5">Mode</th>
                  <th className="text-right px-3 py-2.5">{t("amount")}</th>
                  <th className="px-3 py-2.5 w-20"></th>
                </tr></thead>
                <tbody>
                  {(payments as any[])?.map((p) => (
                    <Fragment key={p.id}>
                      <tr className={clsx("border-b border-line last:border-0 hover:bg-canvas/50", p.amount === 0 && "bg-err/5")}>
                        <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                        <td className="px-3 py-2.5">
                          <div>{p.customers?.name ?? p.suppliers?.name ?? "—"}</div>
                          {p.notes && <div className="text-xs text-ink-dim truncate max-w-[180px]">{p.notes}</div>}
                          {p.partner_account_id && partnerMap.has(p.partner_account_id) && (
                            <div className="text-[10px] text-warn mt-0.5">
                              → {partnerMap.get(p.partner_account_id)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 capitalize text-ink-dim">{p.mode}</td>
                        <td className={clsx(
                          "px-3 py-2.5 text-right font-mono",
                          p.amount === 0 && "font-bold",
                          (p.mode === "chit_metal" || p.mode === "old_gold" || p.mode === "old_silver")
                            ? "text-info"
                            : p.direction === "in" ? "text-ok" : "text-err"
                        )}>
                          {p.direction === "in" ? "+" : "-"}{inr(p.amount)}
                          {p.amount === 0 && <span className="ml-1 text-xs">(fix this)</span>}
                          {(p.mode === "chit_metal" || p.mode === "old_gold" || p.mode === "old_silver") && (
                            <span className="ml-1 text-[10px] text-info font-normal">(no cash)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => startEdit(p)} className="text-xs text-gold hover:underline">Edit</button>
                            <button
                              onClick={() => { if (window.confirm("Delete this payment?")) remove.mutate(p.id); }}
                              className="text-xs text-err hover:underline">Del</button>
                          </div>
                        </td>
                      </tr>
                      {editingId === p.id && (
                        <tr className="border-b border-line bg-canvas/50">
                          <td colSpan={5} className="px-4 py-3">
                            <form onSubmit={handleUpdate} className="flex items-end gap-3 flex-wrap">
                              <div className="w-52">
                                <label className="text-xs text-ink-dim block mb-1">Customer</label>
                                <CustomerPicker value={editCustomer} onChange={setEditCustomer} />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Date</label>
                                <input type="date" value={editForm.pay_date}
                                  onChange={(e) => setEditForm({ ...editForm, pay_date: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Mode</label>
                                <select value={editForm.mode}
                                  onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                                  {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Direction</label>
                                <select value={editForm.direction}
                                  onChange={(e) => setEditForm({ ...editForm, direction: e.target.value })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                                  <option value="in">In</option>
                                  <option value="out">Out</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Amount (₹)</label>
                                <input type="number" step="0.01" value={editForm.amount || ""}
                                  onChange={(e) => setEditForm({ ...editForm, amount: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-gold"
                                  autoFocus />
                              </div>
                              <div className="w-56">
                                <label className="text-xs text-ink-dim block mb-1">Note</label>
                                <input type="text" value={editForm.notes}
                                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                  placeholder="optional note"
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-gold" />
                              </div>
                              <div className="flex gap-2">
                                <button type="submit" disabled={update.isPending || editForm.amount <= 0}
                                  className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">Save</button>
                                <button type="button" onClick={() => setEditingId(null)}
                                  className="border border-line text-xs px-3 py-1.5 rounded-lg2">Cancel</button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {!payments?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
