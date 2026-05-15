"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import type { Customer } from "@/modules/customers/types";

const CHIT_KINDS = [
  { value: "golden11", label: "Golden 11" },
  { value: "bonus11",  label: "Bonus 11" },
  { value: "smart_gold", label: "Smart Gold" },
];

const PAY_MODES = ["cash", "upi", "bank"];

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

// ──────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────
function useChits() {
  return useQuery({
    queryKey: ["chits"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("chits")
        .select("*, chit_members(id, ticket_no, joined_date, customers(id,name,phone))")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useChitPayments(chitId: string | null) {
  return useQuery({
    queryKey: ["chit_payments", chitId],
    enabled: !!chitId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("chit_payments")
        .select("*, chit_members(ticket_no, customers(name))")
        .eq("chit_id", chitId!)
        .order("pay_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────
export default function ChitsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();
  const { data: chits, isLoading } = useChits();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewChit, setShowNewChit] = useState(false);
  const [showAddMember, setShowAddMember] = useState<string | null>(null); // chit id
  const [showAddPayment, setShowAddPayment] = useState<{ chitId: string; memberId: string; monthlyAmt: number } | null>(null);

  // ── New chit form ──
  const [newChit, setNewChit] = useState({ kind: "golden11", monthly_amt: 0, total_months: 11, start_date: globalDate, notes: "" });

  const saveChit = useMutation({
    mutationFn: async (d: typeof newChit) => {
      const { error } = await supabase().from("chits").insert(d);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chits"] }); setShowNewChit(false); setNewChit({ kind: "golden11", monthly_amt: 0, total_months: 11, start_date: globalDate, notes: "" }); },
  });

  // ── Add member form ──
  const [memberCustomer, setMemberCustomer] = useState<Customer | null>(null);
  const [ticketNo, setTicketNo] = useState("");

  const addMember = useMutation({
    mutationFn: async ({ chitId, customerId, ticket }: { chitId: string; customerId: string; ticket: number }) => {
      const { error } = await supabase().from("chit_members").insert({ chit_id: chitId, customer_id: customerId, ticket_no: ticket, joined_date: globalDate });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["chits"] }); setShowAddMember(null); setMemberCustomer(null); setTicketNo(""); },
  });

  // ── Payment form ──
  const [payForm, setPayForm] = useState({ pay_date: globalDate, month_no: 1, amount: 0, mode: "cash", notes: "" });
  const { data: payments } = useChitPayments(showAddPayment?.chitId ?? null);

  const savePayment = useMutation({
    mutationFn: async (d: typeof payForm & { chitId: string; memberId: string }) => {
      const { data: row, error } = await supabase().from("chit_payments").insert({
        chit_id: d.chitId, member_id: d.memberId,
        pay_date: d.pay_date, month_no: d.month_no,
        amount: d.amount, mode: d.mode, notes: d.notes || null,
      }).select().single();
      if (error) throw error;
      // Fan out to ledger
      const ledger = d.mode === "cash" ? "cash_ledger" : "bank_ledger";
      await supabase().from(ledger).insert({
        tx_date: d.pay_date, direction: "in", amount: d.amount,
        description: "Chit payment", ref_type: "chit_payment", ref_id: row.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chits"] });
      qc.invalidateQueries({ queryKey: ["chit_payments", showAddPayment?.chitId] });
      setShowAddPayment(null);
      setPayForm({ pay_date: globalDate, month_no: 1, amount: 0, mode: "cash", notes: "" });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chitList = (chits as any[]) ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Chit Schemes</h1>
        <button onClick={() => setShowNewChit(true)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          + New Scheme
        </button>
      </div>

      {/* New chit form */}
      {showNewChit && (
        <form onSubmit={(e) => { e.preventDefault(); saveChit.mutate(newChit); }}
          className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-3">
          <h3 className="font-semibold text-sm">New Chit Scheme</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Kind</label>
              <select value={newChit.kind} onChange={(e) => setNewChit({ ...newChit, kind: e.target.value })} className={inp}>
                {CHIT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Monthly Amount (₹)</label>
              <input type="number" required value={newChit.monthly_amt || ""} onChange={(e) => setNewChit({ ...newChit, monthly_amt: parseFloat(e.target.value) || 0 })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Months</label>
              <input type="number" required value={newChit.total_months} onChange={(e) => setNewChit({ ...newChit, total_months: parseInt(e.target.value) || 11 })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Start Date</label>
              <input type="date" value={newChit.start_date} onChange={(e) => setNewChit({ ...newChit, start_date: e.target.value })} className={inp} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs text-ink-dim mb-1">Notes</label>
              <input value={newChit.notes} onChange={(e) => setNewChit({ ...newChit, notes: e.target.value })} className={inp} placeholder="Optional notes…" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saveChit.isPending} className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowNewChit(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-ink-dim text-sm">{t("loading")}</p>}

      {/* Chit list */}
      <div className="space-y-3">
        {chitList.map((chit: any) => {
          const members = chit.chit_members ?? [];
          const isExpanded = expandedId === chit.id;
          const kindLabel = CHIT_KINDS.find((k) => k.value === chit.kind)?.label ?? chit.kind;

          return (
            <div key={chit.id} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
              {/* Chit header */}
              <div className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-canvas/50"
                onClick={() => setExpandedId(isExpanded ? null : chit.id)}>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-semibold text-ink">{kindLabel}</p>
                    <p className="text-xs text-ink-dim">{shortDate(chit.start_date)} · {inr(chit.monthly_amt)}/mo × {chit.total_months} months</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-ink-dim">{members.length} member{members.length !== 1 ? "s" : ""}</span>
                  <span className="text-gold font-bold">{inr(chit.monthly_amt * chit.total_months)}</span>
                  <span className="text-ink-dim text-sm">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded: members */}
              {isExpanded && (
                <div className="border-t border-line px-5 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Members</h4>
                    <button onClick={() => setShowAddMember(chit.id)}
                      className="text-xs text-gold hover:underline">+ Add Member</button>
                  </div>

                  {/* Add member form */}
                  {showAddMember === chit.id && (
                    <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-ink-dim mb-1">Customer</label>
                          <CustomerPicker value={memberCustomer} onChange={setMemberCustomer} />
                        </div>
                        <div>
                          <label className="block text-xs text-ink-dim mb-1">Ticket No</label>
                          <input type="number" value={ticketNo} onChange={(e) => setTicketNo(e.target.value)}
                            placeholder={String(members.length + 1)} className={inp} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button disabled={!memberCustomer || addMember.isPending}
                          onClick={() => memberCustomer && addMember.mutate({ chitId: chit.id, customerId: memberCustomer.id, ticket: parseInt(ticketNo) || members.length + 1 })}
                          className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">Add</button>
                        <button onClick={() => { setShowAddMember(null); setMemberCustomer(null); setTicketNo(""); }}
                          className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Member rows */}
                  {members.length === 0 ? (
                    <p className="text-sm text-ink-dim">No members yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-ink-dim border-b border-line">
                          <th className="text-left pb-2">Ticket</th>
                          <th className="text-left pb-2">Customer</th>
                          <th className="text-left pb-2">Joined</th>
                          <th className="text-right pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m: any) => (
                          <tr key={m.id} className="border-b border-line last:border-0">
                            <td className="py-2 font-mono text-ink-dim">#{m.ticket_no}</td>
                            <td className="py-2 font-medium">{m.customers?.name ?? "—"}</td>
                            <td className="py-2 text-ink-dim text-xs">{m.joined_date ? shortDate(m.joined_date) : "—"}</td>
                            <td className="py-2 text-right">
                              <button
                                onClick={() => {
                                  setShowAddPayment({ chitId: chit.id, memberId: m.id, monthlyAmt: chit.monthly_amt });
                                  setPayForm({ pay_date: globalDate, month_no: 1, amount: chit.monthly_amt, mode: "cash", notes: "" });
                                }}
                                className="text-xs text-gold hover:underline">
                                + Payment
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Payment history for this chit */}
                  {isExpanded && <PaymentHistory chitId={chit.id} />}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && chitList.length === 0 && (
          <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
            No chit schemes yet. Create one to get started.
          </div>
        )}
      </div>

      {/* Add payment modal */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePayment.mutate({ ...payForm, chitId: showAddPayment.chitId, memberId: showAddPayment.memberId });
            }}
            className="bg-white rounded-xl border border-line p-6 shadow-soft w-full max-w-sm space-y-4"
          >
            <h3 className="font-semibold text-ink">Record Chit Payment</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-dim mb-1">Date</label>
                <input type="date" value={payForm.pay_date}
                  onChange={(e) => setPayForm({ ...payForm, pay_date: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Month #</label>
                <input type="number" min={1} value={payForm.month_no}
                  onChange={(e) => setPayForm({ ...payForm, month_no: parseInt(e.target.value) || 1 })} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
                <input type="number" step="0.01" value={payForm.amount || ""}
                  onChange={(e) => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Mode</label>
                <select value={payForm.mode} onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })} className={inp}>
                  {PAY_MODES.map((m) => <option key={m} value={m}>{m === "upi" ? "UPI/GPay" : m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-ink-dim mb-1">Notes</label>
                <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className={inp} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savePayment.isPending || payForm.amount <= 0}
                className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
              <button type="button" onClick={() => setShowAddPayment(null)}
                className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
            </div>
            {savePayment.isError && (
              <p className="text-xs text-err">Save failed. Ensure chit_payments table migration has been run in Supabase.</p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// Lazy-loaded payment history per chit
function PaymentHistory({ chitId }: { chitId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["chit_payments", chitId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("chit_payments")
        .select("*, chit_members(ticket_no, customers(name))")
        .eq("chit_id", chitId)
        .order("pay_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]) ?? [];
  if (isLoading || rows.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">Payment History</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-dim border-b border-line">
            <th className="text-left pb-2">Date</th>
            <th className="text-left pb-2">Member</th>
            <th className="text-left pb-2">Month</th>
            <th className="text-left pb-2">Mode</th>
            <th className="text-right pb-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="py-1.5 text-ink-dim text-xs">{shortDate(p.pay_date)}</td>
              <td className="py-1.5">{p.chit_members?.customers?.name ?? "—"} <span className="text-ink-dim">#{p.chit_members?.ticket_no}</span></td>
              <td className="py-1.5 text-ink-dim">Month {p.month_no}</td>
              <td className="py-1.5 capitalize text-ink-dim">{p.mode}</td>
              <td className="py-1.5 text-right font-mono text-ok">{inr(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
