"use client";

import { useState } from "react";
import Link from "next/link";
import { useSuppliers, useUpsertSupplier } from "@/modules/suppliers/api";
import { useT } from "@/i18n";
import { inr } from "@/lib/format";

const blank = { name: "", phone: "", address: "", opening_balance: 0, gold_opening_g: 0, silver_opening_g: 0, notes: "" };

export default function SuppliersPage() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...blank });
  const { data: suppliers, isLoading } = useSuppliers(search);
  const upsert = useUpsertSupplier();

  function startEdit(s: typeof suppliers extends (infer T)[] | undefined ? T : never) {
    setEditingId((s as any).id);
    setForm({ name: (s as any).name ?? "", phone: (s as any).phone ?? "", address: (s as any).address ?? "", opening_balance: Number((s as any).opening_balance) || 0, gold_opening_g: Number((s as any).gold_opening_g) || 0, silver_opening_g: Number((s as any).silver_opening_g) || 0, notes: (s as any).notes ?? "" });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await upsert.mutateAsync(editingId ? { ...form, id: editingId } : form);
    setShowForm(false);
    setEditingId(null);
    setForm({ ...blank });
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...blank });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <input type="search" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
        <button onClick={() => { setEditingId(null); setForm({ ...blank }); setShowForm(true); }} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 shrink-0">
          + {t("add_supplier")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-3">
          <h3 className="text-sm font-semibold">{editingId ? "Edit Supplier" : t("add_supplier")}</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: t("name"), key: "name", required: true },
              { label: t("phone"), key: "phone" },
              { label: t("opening_balance") + " (₹)", key: "opening_balance", type: "number" },
              { label: "Gold Opening (g)", key: "gold_opening_g", type: "number" },
              { label: "Silver Opening (g)", key: "silver_opening_g", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-ink-dim mb-1">{f.label}</label>
                <input type={f.type ?? "text"} required={f.required} value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={upsert.isPending} className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={handleCancel} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">{t("name")}</th>
              <th className="text-left px-3 py-2.5 hidden sm:table-cell">{t("phone")}</th>
              <th className="text-right px-3 py-2.5">Opening (₹)</th>
              <th className="text-right px-3 py-2.5 hidden sm:table-cell">Gold (g)</th>
              <th className="text-right px-3 py-2.5 hidden sm:table-cell">Silver (g)</th>
              <th className="px-3 py-2.5" />
            </tr></thead>
            <tbody>
              {suppliers?.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5 text-ink-dim hidden sm:table-cell">{s.phone}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(s.opening_balance)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink-dim hidden sm:table-cell">{s.gold_opening_g > 0 ? `${Number(s.gold_opening_g).toFixed(3)}g` : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ink-dim hidden sm:table-cell">{s.silver_opening_g > 0 ? `${Number(s.silver_opening_g).toFixed(3)}g` : "—"}</td>
                  <td className="px-3 py-2.5 text-right flex items-center gap-3 justify-end">
                    <button onClick={() => startEdit(s)} className="text-xs text-gold hover:underline">Edit</button>
                    <Link href={`/suppliers/${s.id}`} className="text-xs text-info hover:underline">{t("view")}</Link>
                  </td>
                </tr>
              ))}
              {!suppliers?.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
