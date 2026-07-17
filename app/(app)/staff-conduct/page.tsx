"use client";

import { useState } from "react";
import { useT } from "@/i18n";
import { useAuth } from "@/stores/auth";
import {
  useActiveStaff, useConductCategories, useAddConductCategory, useDeleteConductCategory,
  useConductNotes, useAddConductNote, useResolveConductNote,
} from "@/modules/staff-conduct/api";
import type { ConductNote } from "@/modules/staff-conduct/types";
import { inr, shortDate } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function LogNoteForm() {
  const t = useT();
  const { data: staff = [] } = useActiveStaff();
  const { data: categories = [] } = useConductCategories();
  const addNote = useAddConductNote();
  const [staffId, setStaffId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    const staffMember = staff.find((s) => s.id === staffId);
    if (!staffMember) { setErr("Pick a staff member."); return; }
    try {
      await addNote.mutateAsync({
        staff_id: staffId,
        staff_name: staffMember.name,
        category_id: categoryId ? Number(categoryId) : null,
        note,
        note_date: date,
      });
      setStaffId(""); setCategoryId(""); setNote("");
      setOk(true);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save note.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-3">
      <h2 className="font-medium text-ink">Log a note</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">Staff member *</label>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required className={inp}>
            <option value="">Select…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.designation ? ` — ${s.designation}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inp}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-dim mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-dim mb-1">Note</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inp} placeholder="What happened…" />
        </div>
      </div>
      {err && <p className="text-xs text-err">{err}</p>}
      {ok && <p className="text-xs text-ok">Saved.</p>}
      <button type="submit" disabled={addNote.isPending} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-5 py-2 rounded-lg2 disabled:opacity-50">
        {t("save")}
      </button>
    </form>
  );
}

function CategoryManager() {
  const { data: categories = [] } = useConductCategories();
  const addCategory = useAddConductCategory();
  const deleteCategory = useDeleteConductCategory();
  const [name, setName] = useState("");

  async function handleAdd() {
    if (!name.trim()) return;
    await addCategory.mutateAsync(name.trim());
    setName("");
  }

  return (
    <div className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-3">
      <h2 className="font-medium text-ink">Categories</h2>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" className={inp} />
        <button onClick={handleAdd} className="border border-line text-ink-mid text-sm px-4 py-2 rounded-lg2 hover:bg-canvas whitespace-nowrap">Add</button>
      </div>
      <div className="divide-y divide-line">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{c.name}</span>
            <button
              onClick={() => { if (confirm(`Delete "${c.name}"?`)) deleteCategory.mutate(c.id); }}
              className="text-xs text-err px-2 py-1 hover:bg-err/5 rounded"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResolveActions({ note }: { note: ConductNote }) {
  const resolve = useResolveConductNote();
  const [amount, setAmount] = useState("");
  const [showFineInput, setShowFineInput] = useState(false);

  async function applyFine() {
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    await resolve.mutateAsync({ id: note.id, status: "fined", fine_amount: value });
  }

  if (showFineInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="₹ amount" className="w-24 border border-line rounded-lg2 px-2 py-1 text-xs"
        />
        <button onClick={applyFine} disabled={resolve.isPending} className="text-xs bg-gold hover:bg-gold-dark text-white px-2.5 py-1 rounded-full disabled:opacity-50">
          Confirm
        </button>
        <button onClick={() => setShowFineInput(false)} className="text-xs text-ink-dim px-2 py-1">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => setShowFineInput(true)} className="text-xs px-2.5 py-1 rounded-full border border-err/30 text-err hover:bg-err/5">
        Apply Fine
      </button>
      <button
        onClick={() => resolve.mutate({ id: note.id, status: "dismissed" })}
        disabled={resolve.isPending}
        className="text-xs px-2.5 py-1 rounded-full border border-line text-ink-dim hover:bg-canvas"
      >
        Dismiss
      </button>
    </div>
  );
}

function StatusBadge({ note }: { note: ConductNote }) {
  if (note.status === "fined") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-err/10 text-err">Fined {note.fine_amount != null ? inr(note.fine_amount) : ""}</span>;
  }
  if (note.status === "dismissed") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-canvas text-ink-dim border border-line">Dismissed</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-warn/10 text-warn">Pending</span>;
}

export default function StaffConductPage() {
  const t = useT();
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin";
  const [month, setMonth] = useState(currentMonth());
  const { data: categories = [] } = useConductCategories();
  const { data: notes = [], isLoading } = useConductNotes(month);

  const visibleNotes = isAdmin ? notes : notes.filter((n) => n.noted_by === profile?.id);
  const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name;

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-ink">{t("nav_conduct_notes")}</h1>

      <LogNoteForm />
      {isAdmin && <CategoryManager />}

      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-ink">Notes</h2>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inp} w-auto`} />
        </div>

        {isLoading ? (
          <p className="text-sm text-ink-dim">{t("loading")}</p>
        ) : visibleNotes.length === 0 ? (
          <p className="text-sm text-ink-dim">{t("no_data")}</p>
        ) : (
          <div className="space-y-2">
            {visibleNotes.map((note) => (
              <div key={note.id} className="border border-line rounded-lg2 p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{note.staff_name}</p>
                    <p className="text-xs text-ink-dim">
                      {shortDate(note.note_date)}
                      {categoryName(note.category_id) ? ` · ${categoryName(note.category_id)}` : ""}
                      {note.noted_by_name ? ` · by ${note.noted_by_name}` : ""}
                    </p>
                  </div>
                  <StatusBadge note={note} />
                </div>
                {note.note && <p className="text-sm text-ink-mid">{note.note}</p>}
                {isAdmin && note.status === "pending" && <ResolveActions note={note} />}
                {note.status !== "pending" && note.resolved_by_name && (
                  <p className="text-xs text-ink-dim">{note.status === "fined" ? "Fined" : "Dismissed"} by {note.resolved_by_name}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
