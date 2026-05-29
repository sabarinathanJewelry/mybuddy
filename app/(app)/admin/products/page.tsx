"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useProducts, useSaveProduct, useDeleteProduct, useProductGroups, type Product } from "@/modules/sales/products-api";
import { inr } from "@/lib/format";

const METALS = [
  { value: "gold_22k",     label: "Gold 22K" },
  { value: "gold_18k",     label: "Gold 18K" },
  { value: "gold_24k",     label: "Gold 24K" },
  { value: "silver",       label: "Silver" },
  { value: "silver_pure",  label: "Silver Pure" },
  { value: "silver_mpr",   label: "Silver MRP" },
];

const inp = "w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const BLANK = {
  name: "", metal: "gold_22k", group_id: null as string | null,
  default_purity_pct: "" as string | number, default_va_pct: 0, default_making_amt: 0, active: true,
};

export default function AdminProductsPage() {
  const { data: products = [], isLoading } = useProducts(false);
  const { data: groups = [] } = useProductGroups(false);
  const save   = useSaveProduct();
  const remove = useDeleteProduct();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof BLANK>({ ...BLANK });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [filterGroupId, setFilterGroupId] = useState<string>("");

  const activeGroups = groups.filter(g => g.active);

  let visible = showInactive ? products : products.filter(p => p.active);
  if (filterGroupId) visible = visible.filter(p => p.group_id === filterGroupId);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditForm({
      name: p.name, metal: p.metal, group_id: p.group_id,
      default_purity_pct: p.default_purity_pct ?? "",
      default_va_pct: p.default_va_pct, default_making_amt: p.default_making_amt, active: p.active,
    });
    setDeletingId(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync({
      ...form,
      group_id: form.group_id || null,
      default_purity_pct: form.default_purity_pct !== "" ? Number(form.default_purity_pct) : null,
    });
    setForm({ ...BLANK });
    setShowForm(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await save.mutateAsync({
      id: editingId, ...editForm,
      group_id: editForm.group_id || null,
      default_purity_pct: editForm.default_purity_pct !== "" ? Number(editForm.default_purity_pct) : null,
    });
    setEditingId(null);
  }

  const groupName = (gid: string | null) => gid ? (groups.find(g => g.id === gid)?.name ?? "—") : "—";
  const metalLabel = (m: string) => METALS.find(x => x.value === m)?.label ?? m;

  // Build grouped options for group selector: parent groups, then children indented
  const topGroups = activeGroups.filter(g => !g.parent_id);
  const childGroups = (parentId: string) => activeGroups.filter(g => g.parent_id === parentId);

  function GroupSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
    return (
      <select value={value ?? ""} onChange={e => onChange(e.target.value || null)} className={inp}>
        <option value="">— No group —</option>
        {topGroups.map(parent => (
          <Fragment key={parent.id}>
            <option value={parent.id}>{parent.name}</option>
            {childGroups(parent.id).map(child => (
              <option key={child.id} value={child.id}>&nbsp;&nbsp;↳ {child.name}</option>
            ))}
          </Fragment>
        ))}
        {/* Groups without a top-level parent that aren't top-level themselves */}
        {activeGroups.filter(g => g.parent_id && !topGroups.find(t => t.id === g.parent_id)).map(g => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/users" className="text-xs text-gold hover:underline">← Admin</Link>
          <h1 className="text-xl font-bold text-ink">Product Catalogue</h1>
          <Link href="/admin/product-groups" className="text-xs text-gold hover:underline">Manage Groups →</Link>
        </div>
        <button onClick={() => { setShowForm(v => !v); setEditingId(null); }}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          {showForm ? "Cancel" : "+ Add Product"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
          <h3 className="text-sm font-semibold">New Product</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-ink-dim block mb-1">Product Name *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Gold Chain, Silver Anklet" className={inp} autoFocus />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Group</label>
              <GroupSelect value={form.group_id} onChange={v => setForm({ ...form, group_id: v })} />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Metal</label>
              <select value={form.metal} onChange={e => setForm({ ...form, metal: e.target.value })} className={inp}>
                {METALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Default Purity% <span className="text-ink-dim/60">(opt)</span></label>
              <input type="number" step="0.001" value={form.default_purity_pct}
                onFocus={e => e.target.select()}
                onChange={e => setForm({ ...form, default_purity_pct: e.target.value })}
                placeholder="e.g. 91.6" className={inp} />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Default VA%</label>
              <input type="number" step="0.01" value={form.default_va_pct || ""}
                onFocus={e => e.target.select()}
                onChange={e => setForm({ ...form, default_va_pct: parseFloat(e.target.value) || 0 })}
                placeholder="0" className={inp} />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Default Making (₹)</label>
              <input type="number" step="0.01" value={form.default_making_amt || ""}
                onFocus={e => e.target.select()}
                onChange={e => setForm({ ...form, default_making_amt: parseFloat(e.target.value) || 0 })}
                placeholder="0" className={inp} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending}
              className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save Product"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
          </div>
          {save.isError && <p className="text-xs text-err">Save failed — run migration 042 first.</p>}
        </form>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-ink-dim">{visible.length} products</p>
          <select value={filterGroupId} onChange={e => setFilterGroupId(e.target.value)}
            className="border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold">
            <option value="">All groups</option>
            {topGroups.map(parent => (
              <Fragment key={parent.id}>
                <option value={parent.id}>{parent.name}</option>
                {childGroups(parent.id).map(child => (
                  <option key={child.id} value={child.id}>&nbsp;&nbsp;↳ {child.name}</option>
                ))}
              </Fragment>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-ink-dim cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-gold" />
          Show inactive
        </label>
      </div>

      {isLoading ? <p className="text-sm text-ink-dim">Loading…</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Group</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Purity%</th>
                <th className="text-right px-3 py-2.5">VA%</th>
                <th className="text-right px-3 py-2.5">Making</th>
                <th className="text-center px-3 py-2.5">Active</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <Fragment key={p.id}>
                  <tr className={`border-b border-line last:border-0 hover:bg-canvas/50 ${!p.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-3 py-2.5 text-ink-dim text-xs">{groupName(p.group_id)}</td>
                    <td className="px-3 py-2.5 text-ink-dim capitalize">{metalLabel(p.metal)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-dim">{p.default_purity_pct ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right text-ink-dim">{p.default_va_pct > 0 ? p.default_va_pct : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-ink-dim">{p.default_making_amt > 0 ? inr(p.default_making_amt) : "—"}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => save.mutate({ id: p.id, active: !p.active })}
                        className={`text-xs px-2 py-0.5 rounded-full border ${p.active ? "border-ok/40 text-ok" : "border-line text-ink-dim"}`}>
                        {p.active ? "Yes" : "No"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="text-xs text-gold hover:underline mr-2">Edit</button>
                      <button onClick={() => { setDeletingId(p.id); setEditingId(null); }} className="text-xs text-err hover:underline">Del</button>
                    </td>
                  </tr>

                  {editingId === p.id && (
                    <tr className="border-b border-line bg-gold/5">
                      <td colSpan={8} className="px-4 py-3">
                        <form onSubmit={handleEdit} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="text-xs text-ink-dim block mb-1">Name *</label>
                            <input required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inp} autoFocus />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Group</label>
                            <GroupSelect value={editForm.group_id} onChange={v => setEditForm({ ...editForm, group_id: v })} />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Metal</label>
                            <select value={editForm.metal} onChange={e => setEditForm({ ...editForm, metal: e.target.value })} className={inp}>
                              {METALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Purity%</label>
                            <input type="number" step="0.001" value={editForm.default_purity_pct}
                              onFocus={e => e.target.select()}
                              onChange={e => setEditForm({ ...editForm, default_purity_pct: e.target.value })}
                              className={inp} />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">VA%</label>
                            <input type="number" step="0.01" value={editForm.default_va_pct || ""}
                              onFocus={e => e.target.select()}
                              onChange={e => setEditForm({ ...editForm, default_va_pct: parseFloat(e.target.value) || 0 })}
                              className={inp} />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Making (₹)</label>
                            <input type="number" step="0.01" value={editForm.default_making_amt || ""}
                              onFocus={e => e.target.select()}
                              onChange={e => setEditForm({ ...editForm, default_making_amt: parseFloat(e.target.value) || 0 })}
                              className={inp} />
                          </div>
                          <div className="flex items-end gap-2 col-span-2 sm:col-span-3">
                            <button type="submit" disabled={save.isPending}
                              className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                              {save.isPending ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingId(null)}
                              className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}

                  {deletingId === p.id && (
                    <tr className="border-b border-line bg-err/5">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-err">Delete &ldquo;{p.name}&rdquo;?</span>
                          <button disabled={remove.isPending}
                            onClick={() => remove.mutate(p.id, { onSuccess: () => setDeletingId(null) })}
                            className="text-xs bg-err text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50">
                            {remove.isPending ? "Deleting…" : "Yes, Delete"}
                          </button>
                          <button onClick={() => setDeletingId(null)}
                            className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!visible.length && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-dim">No products yet. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
