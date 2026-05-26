"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCustomers, useUpsertCustomer, useDeleteCustomer } from "@/modules/customers/api";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/i18n";
import { inr, grams } from "@/lib/format";
import type { Customer, CustomerFormData } from "@/modules/customers/types";

type Tab = "customers" | "balances";

function CustomerForm({ initial, onSave, onCancel }: {
  initial?: Partial<Customer>;
  onSave: (d: CustomerFormData & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormData>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    opening_balance: initial?.opening_balance ?? 0,
    gold_balance_g: initial?.gold_balance_g ?? 0,
    silver_balance_g: initial?.silver_balance_g ?? 0,
    notes: initial?.notes ?? "",
  });

  function set(k: keyof CustomerFormData, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await onSave({ ...form, id: initial?.id });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save customer.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("customer_name")} *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("phone")}</label>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("opening_balance")}</label>
          <input type="number" step="0.01" value={form.opening_balance} onChange={(e) => set("opening_balance", parseFloat(e.target.value) || 0)}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("gold_balance")} (g)</label>
          <input type="number" step="0.001" value={form.gold_balance_g} onChange={(e) => set("gold_balance_g", parseFloat(e.target.value) || 0)}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("silver_balance")} (g)</label>
          <input type="number" step="0.001" value={form.silver_balance_g} onChange={(e) => set("silver_balance_g", parseFloat(e.target.value) || 0)}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-dim mb-1">{t("address")}</label>
          <textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2}
            className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        </div>
      </div>
      {err && <p className="text-xs text-err">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-5 py-2 rounded-lg2">{t("save")}</button>
        <button type="button" onClick={onCancel} className="border border-line text-ink-mid text-sm px-5 py-2 rounded-lg2 hover:bg-canvas">{t("cancel")}</button>
      </div>
    </form>
  );
}

function useCustomerBalances() {
  return useQuery({
    queryKey: ["customer_balances"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("customer_balances")
        .select("*")
        .order("balance", { ascending: true }); // most negative (most owed) first
      if (error) return []; // graceful if migration 023 not yet run
      return (data ?? []) as any[];
    },
  });
}

export default function CustomersPage() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("customers");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const { data: customers, isLoading } = useCustomers(search);
  const { data: balances = [], isLoading: balLoading } = useCustomerBalances();
  const upsert = useUpsertCustomer();
  const deleteMut = useDeleteCustomer();

  async function handleSave(data: CustomerFormData & { id?: string }) {
    await upsert.mutateAsync(data);
    setAdding(false);
    setEditing(null);
  }

  async function handleDelete(c: Customer) {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteMut.mutateAsync(c.id);
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete customer.");
    }
  }

  // Split into "owe us" (negative balance) and "has credit" (positive)
  const owingRows = balances.filter((r: any) => Number(r.balance) < -0.01)
    .sort((a: any, b: any) => Number(a.balance) - Number(b.balance));
  const creditRows = balances.filter((r: any) => Number(r.balance) > 0.01)
    .sort((a: any, b: any) => Number(b.balance) - Number(a.balance));
  const totalOwed    = owingRows.reduce((s: number, r: any) => s + Math.abs(Number(r.balance)), 0);
  const totalCredit  = creditRows.reduce((s: number, r: any) => s + Number(r.balance), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header row */}
      <div className="flex items-center gap-3">
        {tab === "customers" && (
          <input
            type="search"
            placeholder={`${t("search")} customers…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
          />
        )}
        {tab === "balances" && <div className="flex-1" />}
        <button
          onClick={() => { setAdding(true); setEditing(null); }}
          className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 shrink-0"
        >
          + {t("add_customer")}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {(["customers", "balances"] as Tab[]).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              tab === tb ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {tb === "customers" ? "Customers" : "Customer Balances"}
            {tb === "balances" && owingRows.length > 0 && (
              <span className="ml-1.5 bg-err/10 text-err text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                {owingRows.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Add / Edit forms */}
      {adding && <CustomerForm onSave={handleSave} onCancel={() => setAdding(false)} />}
      {editing && <CustomerForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}

      {/* ── Customers list tab ─────────────────────────────── */}
      {tab === "customers" && (
        isLoading ? (
          <p className="text-ink-dim text-sm">{t("loading")}</p>
        ) : (
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">{t("name")}</th>
                  <th className="text-left px-3 py-2.5 hidden sm:table-cell">{t("phone")}</th>
                  <th className="text-right px-3 py-2.5">{t("balance")}</th>
                  <th className="text-right px-3 py-2.5 hidden sm:table-cell">{t("gold_balance")}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {customers?.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{c.phone}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(c.opening_balance)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-dim hidden sm:table-cell">{grams(c.gold_balance_g)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/customers/${c.id}`} className="text-xs text-info hover:underline">{t("view")}</Link>
                        <button onClick={() => { setEditing(c); setAdding(false); }} className="text-xs text-gold hover:underline">{t("edit")}</button>
                        <button onClick={() => handleDelete(c)} className="text-xs text-err hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!customers?.length && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_customers")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Balances tab ───────────────────────────────────── */}
      {tab === "balances" && (
        balLoading ? (
          <p className="text-ink-dim text-sm">{t("loading")}</p>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">Total Receivable</p>
                <p className="text-xl font-bold text-err">{inr(totalOwed)}</p>
                <p className="text-xs text-ink-dim mt-0.5">{owingRows.length} customer{owingRows.length !== 1 ? "s" : ""} owe us</p>
              </div>
              <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
                <p className="text-xs text-ink-dim">Total Advance Credit</p>
                <p className="text-xl font-bold text-ok">{inr(totalCredit)}</p>
                <p className="text-xs text-ink-dim mt-0.5">{creditRows.length} customer{creditRows.length !== 1 ? "s" : ""} have credit</p>
              </div>
            </div>

            {/* Customers who owe us */}
            {owingRows.length > 0 && (
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
                <div className="px-4 py-2.5 bg-err/5 border-b border-line">
                  <p className="text-xs font-semibold text-err uppercase tracking-wide">Amount Due to Company</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                      <th className="text-left px-4 py-2">#</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Phone</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Sales</th>
                      <th className="text-right px-3 py-2 hidden sm:table-cell">Paid</th>
                      <th className="text-right px-3 py-2">Amount Due</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {owingRows.map((r: any, idx: number) => (
                      <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim text-xs">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{r.phone ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ink-dim hidden sm:table-cell">{inr(r.total_sales)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ok hidden sm:table-cell">{inr(Number(r.total_paid_in) - Number(r.total_paid_out))}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-err">
                          {inr(Math.abs(Number(r.balance)))}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/customers/${r.id}`} className="text-xs text-info hover:underline">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-err/5 border-t border-line">
                      <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-err text-right hidden sm:table-cell">Total Receivable</td>
                      <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-err text-right sm:hidden">Total Receivable</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-err">{inr(totalOwed)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Customers with advance credit */}
            {creditRows.length > 0 && (
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
                <div className="px-4 py-2.5 bg-ok/5 border-b border-line">
                  <p className="text-xs font-semibold text-ok uppercase tracking-wide">Advance Credit (Company Owes Them)</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                      <th className="text-left px-4 py-2">#</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2 hidden sm:table-cell">Phone</th>
                      <th className="text-right px-3 py-2">Credit Balance</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {creditRows.map((r: any, idx: number) => (
                      <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim text-xs">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-medium">{r.name}</td>
                        <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{r.phone ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-ok">{inr(Number(r.balance))}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/customers/${r.id}`} className="text-xs text-info hover:underline">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {owingRows.length === 0 && creditRows.length === 0 && (
              <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
                <p className="font-medium">All balances are settled</p>
                <p className="text-xs mt-1">Run migration 023 in Supabase SQL Editor if balances are not showing.</p>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
