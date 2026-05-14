"use client";

import { useState } from "react";
import Link from "next/link";
import { useCustomers, useUpsertCustomer } from "@/modules/customers/api";
import { useT } from "@/i18n";
import { inr, grams } from "@/lib/format";
import type { Customer, CustomerFormData } from "@/modules/customers/types";

function CustomerForm({ initial, onSave, onCancel }: {
  initial?: Partial<Customer>;
  onSave: (d: CustomerFormData & { id?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
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
    await onSave({ ...form, id: initial?.id });
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
      <div className="flex gap-2 pt-1">
        <button type="submit" className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-5 py-2 rounded-lg2">{t("save")}</button>
        <button type="button" onClick={onCancel} className="border border-line text-ink-mid text-sm px-5 py-2 rounded-lg2 hover:bg-canvas">{t("cancel")}</button>
      </div>
    </form>
  );
}

export default function CustomersPage() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const { data: customers, isLoading } = useCustomers(search);
  const upsert = useUpsertCustomer();

  async function handleSave(data: CustomerFormData & { id?: string }) {
    await upsert.mutateAsync(data);
    setAdding(false);
    setEditing(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder={`${t("search")} customers…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          onClick={() => { setAdding(true); setEditing(null); }}
          className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 shrink-0"
        >
          + {t("add_customer")}
        </button>
      </div>

      {adding && (
        <CustomerForm onSave={handleSave} onCancel={() => setAdding(false)} />
      )}

      {editing && (
        <CustomerForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      )}

      {isLoading ? (
        <p className="text-ink-dim text-sm">{t("loading")}</p>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
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
      )}
    </div>
  );
}
