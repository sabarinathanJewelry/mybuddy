"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const blank = { title: "", body: "", expires_at: "" };
const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function AnnouncementsPage() {
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();
  const [form, setForm] = useState(blank);
  const [formErr, setFormErr] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["announcements_admin"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      const { error } = await supabase().from("announcements").insert({
        title: form.title.trim(),
        body: form.body.trim() || null,
        expires_at: form.expires_at || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements_admin"] });
      qc.invalidateQueries({ queryKey: ["announcements_staff"] });
      setForm(blank);
      setFormErr("");
    },
    onError: (e: any) => setFormErr(e?.message ?? "Failed to save."),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase().from("announcements").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements_admin"] });
      qc.invalidateQueries({ queryKey: ["announcements_staff"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements_admin"] });
      qc.invalidateQueries({ queryKey: ["announcements_staff"] });
    },
  });

  if (profile?.role !== "admin") {
    return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Announcements</h1>
      <p className="text-sm text-ink-dim -mt-4">
        Active announcements are shown to all staff on their attendance page. Write in Tamil, English, or both.
      </p>

      {/* Create form */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
        <p className="text-sm font-semibold text-ink">New Announcement</p>
        <div>
          <label className="text-xs text-ink-dim block mb-1">Title *</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Holiday Notice / விடுமுறை அறிவிப்பு"
            className={inp}
          />
        </div>
        <div>
          <label className="text-xs text-ink-dim block mb-1">Message (optional)</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Type the full message here — Tamil, English, or both…"
            rows={4}
            className={`${inp} resize-none`}
          />
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-ink-dim block mb-1">Expires on (optional)</label>
            <input
              type="date"
              value={form.expires_at}
              onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending || !form.title.trim()}
            className="bg-gold text-white px-5 py-2 rounded-lg2 text-sm font-medium disabled:opacity-40 hover:opacity-90"
          >
            {create.isPending ? "Posting…" : "Post Announcement"}
          </button>
        </div>
        {formErr && <p className="text-xs text-err">{formErr}</p>}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-line p-6 text-center text-ink-dim text-sm">
          No announcements yet.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((a) => {
            const expired = a.expires_at ? a.expires_at < new Date().toISOString().slice(0, 10) : false;
            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl border shadow-soft p-4 space-y-2 ${
                  a.is_active && !expired ? "border-line" : "border-line opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm">{a.title}</p>
                    {a.body && (
                      <p className="text-xs text-ink-dim mt-1 whitespace-pre-wrap">{a.body}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive.mutate({ id: a.id, value: !a.is_active })}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        a.is_active && !expired
                          ? "bg-ok/10 border-ok/30 text-ok"
                          : "border-line text-ink-dim hover:border-gold hover:text-gold"
                      }`}
                    >
                      {a.is_active && !expired ? "Active" : expired ? "Expired" : "Inactive"}
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this announcement?")) remove.mutate(a.id); }}
                      className="text-xs text-err hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-[10px] text-ink-dim">
                  <span>Posted {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  {a.expires_at && <span>Expires {a.expires_at}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
