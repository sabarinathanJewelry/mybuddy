"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useProductGroups, useSaveProductGroup, useDeleteProductGroup, type ProductGroup } from "@/modules/sales/products-api";

const METALS = [
  { value: "gold_22k",    label: "Gold 22K" },
  { value: "gold_18k",    label: "Gold 18K" },
  { value: "gold_24k",    label: "Gold 24K" },
  { value: "silver",      label: "Silver" },
  { value: "silver_pure", label: "Silver Pure" },
  { value: "silver_mpr",  label: "Silver MRP" },
  { value: "diamond",     label: "Diamond" },
  { value: "platinum",    label: "Platinum" },
];

const inp = "w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const BLANK = { name: "", parent_id: null as string | null, metal: "gold_22k", active: true };

export default function AdminProductGroupsPage() {
  const { data: groups = [], isLoading } = useProductGroups(false);
  const save   = useSaveProductGroup();
  const remove = useDeleteProductGroup();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<typeof BLANK>({ ...BLANK });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const visible = showInactive ? groups : groups.filter(g => g.active);

  // parent groups = those with no parent_id
  const parentGroups = groups.filter(g => !g.parent_id && g.active);

  function startEdit(g: ProductGroup) {
    setEditingId(g.id);
    setEditForm({ name: g.name, parent_id: g.parent_id, metal: g.metal, active: g.active });
    setDeletingId(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync({ ...form, parent_id: form.parent_id || null });
    setForm({ ...BLANK });
    setShowForm(false);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await save.mutateAsync({ id: editingId, ...editForm, parent_id: editForm.parent_id || null });
    setEditingId(null);
  }

  const metalLabel = (m: string) => METALS.find(x => x.value === m)?.label ?? m;
  const parentLabel = (pid: string | null) => pid ? (groups.find(g => g.id === pid)?.name ?? "—") : "";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/products" className="text-xs text-gold hover:underline">← Products</Link>
          <h1 className="text-xl font-bold text-ink">Product Groups</h1>
        </div>
        <button onClick={() => { setShowForm(v => !v); setEditingId(null); }}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          {showForm ? "Cancel" : "+ Add Group"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
          <h3 className="text-sm font-semibold">New Group</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-ink-dim block mb-1">Group Name *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. BANGLES, NECKLACE" className={inp} autoFocus />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Parent Group <span className="text-ink-dim/60">(opt)</span></label>
              <select value={form.parent_id ?? ""} onChange={e => setForm({ ...form, parent_id: e.target.value || null })} className={inp}>
                <option value="">— None (top level) —</option>
                {parentGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Metal / Ornament Type</label>
              <select value={form.metal} onChange={e => setForm({ ...form, metal: e.target.value })} className={inp}>
                {METALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending}
              className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save Group"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
          </div>
          {save.isError && <p className="text-xs text-err">Save failed — run migration 042 first.</p>}
        </form>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-dim">{visible.length} groups</p>
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
                <th className="text-left px-4 py-2.5">Group Name</th>
                <th className="text-left px-3 py-2.5">Parent</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-center px-3 py-2.5">Active</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map(g => (
                <Fragment key={g.id}>
                  <tr className={`border-b border-line last:border-0 hover:bg-canvas/50 ${!g.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium">
                      {g.parent_id ? <span className="text-ink-dim mr-1">↳</span> : null}
                      {g.name}
                    </td>
                    <td className="px-3 py-2.5 text-ink-dim">{parentLabel(g.parent_id) || "—"}</td>
                    <td className="px-3 py-2.5 text-ink-dim">{metalLabel(g.metal)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => save.mutate({ id: g.id, active: !g.active })}
                        className={`text-xs px-2 py-0.5 rounded-full border ${g.active ? "border-ok/40 text-ok" : "border-line text-ink-dim"}`}>
                        {g.active ? "Yes" : "No"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(g)} className="text-xs text-gold hover:underline mr-2">Edit</button>
                      <button onClick={() => { setDeletingId(g.id); setEditingId(null); }} className="text-xs text-err hover:underline">Del</button>
                    </td>
                  </tr>

                  {editingId === g.id && (
                    <tr className="border-b border-line bg-gold/5">
                      <td colSpan={5} className="px-4 py-3">
                        <form onSubmit={handleEdit} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <label className="text-xs text-ink-dim block mb-1">Name *</label>
                            <input required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inp} autoFocus />
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Parent Group</label>
                            <select value={editForm.parent_id ?? ""} onChange={e => setEditForm({ ...editForm, parent_id: e.target.value || null })} className={inp}>
                              <option value="">— None —</option>
                              {parentGroups.filter(p => p.id !== g.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-ink-dim block mb-1">Metal</label>
                            <select value={editForm.metal} onChange={e => setEditForm({ ...editForm, metal: e.target.value })} className={inp}>
                              {METALS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
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

                  {deletingId === g.id && (
                    <tr className="border-b border-line bg-err/5">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-err">Delete &ldquo;{g.name}&rdquo;? Products in this group will be ungrouped.</span>
                          <button disabled={remove.isPending}
                            onClick={() => remove.mutate(g.id, { onSuccess: () => setDeletingId(null) })}
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">No groups yet. Add one above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
