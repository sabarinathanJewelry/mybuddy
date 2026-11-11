"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";

interface SopDoc {
  id: string;
  title: string;
  category: string;
  content: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: "shop_opening", label: "Shop Opening" },
  { value: "shop_closing", label: "Shop Closing" },
  { value: "sales",        label: "Sales" },
  { value: "exchange",     label: "Exchange" },
  { value: "return",       label: "Return" },
  { value: "general",      label: "General" },
];

function catLabel(c: string) {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const blank = (label: string) => `<tr><td>${label}</td><td></td></tr>`;

const ACCEPTANCE_FORM = `
<div class="form">
<h2>Employee details &amp; acceptance</h2>
<p>I have read and understood the Staff Policy of Sabarinathan Jewellers, and I agree to follow it.</p>
<table>${["Employee name", "Designation", "Date of joining", "Residential address", "Phone number", "Aadhaar number",
  "Monthly salary (₹)", "Per-day salary (₹) (Monthly salary ÷ 30)", "Bank account holder name", "Bank name &amp; branch",
  "Account number", "IFSC code", "Employee signature", "Date"].map(blank).join("")}</table>
<h3>Family / guardian details (all fields must be filled)</h3>
<table><tr><th>Relation</th><th>Name</th><th>Address</th><th>Phone number</th></tr>
${["Father", "Mother", "Guardian"].map((r) => `<tr><td>${r}</td><td></td><td></td><td></td></tr>`).join("")}</table>
<h3>Original documents submitted at joining</h3>
<table><tr><th>Document</th><th>Received (✓)</th><th>Remarks</th></tr>
${["Aadhaar card", "Address proof", "Educational certificates", "Passport-size photos", "Other:", "Other:"].map((d) => `<tr><td>${d}</td><td>☐</td><td></td></tr>`).join("")}</table>
<h3>For Sabarinathan Jewellers (Management / HR)</h3>
<p>I confirm that the employee's personal and family details above are recorded, and that the original documents ticked above have been received and are kept with the shop.</p>
<table>${["Authorised signatory", "Name", "Date"].map(blank).join("")}</table>
</div>`;

function printDoc(doc: { title: string; content: string }) {
  const body = esc(doc.content).split("\n").map((l) =>
    /^\d+\.\s+[A-Z]/.test(l) ? `<h2>${l}</h2>` :
    /^\s*-\s/.test(l) ? `<li>${l.replace(/^\s*-\s/, "")}</li>` :
    l.trim() === "" ? "" :
    /^[A-Z][^.:]{0,60}$/.test(l) ? `<h3>${l}</h3>` : `<p>${l}</p>`
  ).join("\n");
  const isPolicy = /staff policy/i.test(doc.title);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
    body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111;margin:0 auto;max-width:780px;padding:24px}
    h1{font-size:18pt;margin:0 0 8px;text-align:center}
    h2{font-size:12.5pt;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:2px;break-after:avoid}
    h3{font-size:11pt;margin:10px 0 4px;break-after:avoid}
    p{margin:4px 0} li{margin:2px 0 2px 18px}
    table{width:100%;border-collapse:collapse;margin:6px 0 12px}
    td,th{border:1px solid #555;padding:8px 6px;text-align:left;vertical-align:top;height:18px}
    td:first-child{width:38%}
    .form{break-before:page}
    @page{size:A4;margin:14mm}
  </style></head><body><h1>${esc(doc.title)}</h1>${body}${isPolicy ? ACCEPTANCE_FORM : ""}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
const BLANK: Omit<SopDoc, "id" | "created_at" | "updated_at"> = {
  title: "", category: "general", content: "", sort_order: 0, is_active: true,
};

export default function SopAdminPage() {
  const profile = useAuth((s) => s.profile);
  const qc      = useQueryClient();

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm]           = useState({ ...BLANK });
  const [err, setErr]             = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["sop_docs_admin"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sop_documents")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("category");
      if (error) throw error;
      return (data ?? []) as SopDoc[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      if (!form.content.trim()) throw new Error("Content is required.");
      const payload = {
        title:      form.title.trim(),
        category:   form.category,
        content:    form.content.trim(),
        sort_order: form.sort_order,
        is_active:  form.is_active,
        updated_at: new Date().toISOString(),
      };
      if (editingId === "new") {
        const { error } = await supabase().from("sop_documents").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase().from("sop_documents").update(payload).eq("id", editingId!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop_docs_admin"] });
      qc.invalidateQueries({ queryKey: ["sop_docs_staff"] });
      setEditingId(null);
      setForm({ ...BLANK });
      setErr("");
    },
    onError: (e: any) => setErr(e?.message ?? "Save failed."),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase().from("sop_documents").update({ is_active: value, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop_docs_admin"] });
      qc.invalidateQueries({ queryKey: ["sop_docs_staff"] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("sop_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sop_docs_admin"] });
      qc.invalidateQueries({ queryKey: ["sop_docs_staff"] });
    },
  });

  function startEdit(doc: SopDoc) {
    setEditingId(doc.id);
    setForm({ title: doc.title, category: doc.category, content: doc.content, sort_order: doc.sort_order, is_active: doc.is_active });
    setErr("");
  }
  function startNew() {
    setEditingId("new");
    setForm({ ...BLANK });
    setErr("");
  }
  function cancelEdit() { setEditingId(null); setForm({ ...BLANK }); setErr(""); }

  if (profile?.role !== "admin") {
    return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;
  }

  // Group docs by category for display
  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    docs: docs.filter((d) => d.category === cat.value),
  })).filter((g) => g.docs.length > 0);

  const uncategorized = docs.filter((d) => !CATEGORIES.find((c) => c.value === d.category));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">SOPs & Policies</h1>
          <p className="text-xs text-ink-dim mt-0.5">Standard Operating Procedures visible to all staff.</p>
        </div>
        {editingId === null && (
          <button onClick={startNew}
            className="bg-gold text-white px-4 py-2 rounded-lg2 text-sm font-medium">
            + New SOP
          </button>
        )}
      </div>

      {/* ── Create / Edit form ── */}
      {editingId !== null && (
        <div className="bg-white rounded-xl border border-gold/30 shadow-soft p-5 space-y-4">
          <p className="text-sm font-semibold">{editingId === "new" ? "New SOP" : "Edit SOP"}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-ink-dim block mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Sales Process, Exchange Policy…" className={inp} />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className={inp}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Sort Order</label>
              <input type="number" value={form.sort_order} min={0}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                className={inp} />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="accent-gold" />
                Active (visible to staff)
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-dim block mb-1">Content *</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={16}
              placeholder={`Write the SOP content here. Use blank lines to separate sections.\n\nExample:\nOPENING PROCEDURE\n1. Unlock the shop at 9:00 AM.\n2. Check the display cases.\n3. Switch on all lights and AC.\n\nGOLD RATE\n- Update the board rate by 9:15 AM.\n- Confirm with manager before updating.`}
              className={`${inp} resize-y font-mono text-xs leading-relaxed`}
            />
            <p className="text-[10px] text-ink-dim mt-1">Use plain text with numbered steps, headings in CAPS, and blank lines between sections. Staff will see it exactly as typed.</p>
          </div>
          {err && <p className="text-xs text-err">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim() || !form.content.trim()}
              className="bg-gold text-white px-5 py-2 rounded-lg2 text-sm font-medium disabled:opacity-40">
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={cancelEdit}
              className="border border-line px-4 py-2 rounded-lg2 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Doc list ── */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-line shadow-soft p-10 text-center">
          <p className="text-ink-dim text-sm">No SOPs yet. Run migration 071 in Supabase, then create your first SOP.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byCategory, ...(uncategorized.length > 0 ? [{ value: "other", label: "Other", docs: uncategorized }] : [])].map((group) => (
            <div key={group.value}>
              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-2">{group.label}</p>
              <div className="space-y-2">
                {group.docs.map((doc) => (
                  <div key={doc.id} className={`bg-white rounded-xl border border-line shadow-soft overflow-hidden ${!doc.is_active ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                        className="text-ink-dim text-xs w-4 shrink-0 select-none">
                        {expandedId === doc.id ? "▼" : "▶"}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{doc.title}</p>
                        <p className="text-[10px] text-ink-dim mt-0.5">
                          {catLabel(doc.category)} · Updated {new Date(doc.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0 items-center">
                        <button onClick={() => toggle.mutate({ id: doc.id, value: !doc.is_active })}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${doc.is_active ? "bg-ok/10 border-ok/30 text-ok" : "border-line text-ink-dim hover:border-gold hover:text-gold"}`}>
                          {doc.is_active ? "Active" : "Inactive"}
                        </button>
                        <button onClick={() => printDoc(doc)}
                          className="text-xs text-info hover:underline">Print</button>
                        <button onClick={() => startEdit(doc)}
                          className="text-xs text-gold hover:underline">Edit</button>
                        <button onClick={() => { if (confirm(`Delete "${doc.title}"?`)) del.mutate(doc.id); }}
                          className="text-xs text-err hover:underline">Delete</button>
                      </div>
                    </div>
                    {expandedId === doc.id && (
                      <div className="border-t border-line bg-canvas px-6 py-4">
                        <pre className="text-sm text-ink whitespace-pre-wrap font-sans leading-relaxed">{doc.content}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
