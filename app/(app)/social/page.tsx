"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

type Rule = {
  id: string;
  keyword: string;
  reply_text: string;
  active: boolean;
  match_type: "contains" | "exact";
  trigger_count: number;
  created_at: string;
};

function useRules() {
  return useQuery<Rule[]>({
    queryKey: ["ig_keyword_rules"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("ig_keyword_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function SocialPage() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useRules();

  const [keyword, setKeyword]     = useState("");
  const [replyText, setReplyText] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "exact">("contains");
  const [editId, setEditId]       = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<Partial<Rule>>({});

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase().from("ig_keyword_rules").insert({
        keyword: keyword.trim(),
        reply_text: replyText.trim(),
        match_type: matchType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig_keyword_rules"] });
      setKeyword(""); setReplyText(""); setMatchType("contains");
    },
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("ig_keyword_rules").update({
        keyword:    editForm.keyword?.trim(),
        reply_text: editForm.reply_text?.trim(),
        match_type: editForm.match_type,
        active:     editForm.active,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig_keyword_rules"] });
      setEditId(null);
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase().from("ig_keyword_rules").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig_keyword_rules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("ig_keyword_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig_keyword_rules"] }),
  });

  const activeCount = rules.filter(r => r.active).length;
  const totalTriggers = rules.reduce((s, r) => s + r.trigger_count, 0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Instagram Auto-DM</h1>
          <p className="text-xs text-ink-dim mt-0.5">
            When someone comments a keyword on your reels or posts, they get an automatic DM.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Rules",    value: activeCount },
          { label: "Total Rules",     value: rules.length },
          { label: "Total Triggered", value: totalTriggers },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
            <p className="text-2xl font-bold text-gold">{s.value}</p>
            <p className="text-xs text-ink-dim mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Webhook info */}
      <div className="bg-info/5 border border-info/20 rounded-xl px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-info">Webhook Setup</p>
        <p className="text-xs text-ink-dim">
          Callback URL to enter in Meta Developer Console:
        </p>
        <code className="block text-xs bg-white border border-line rounded px-2 py-1.5 text-ink font-mono break-all">
          {typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/instagram/webhook
        </code>
        <p className="text-xs text-ink-dim mt-1">
          Verify token: set <code className="bg-white border border-line rounded px-1">INSTAGRAM_VERIFY_TOKEN</code> in your environment variables to any secret string, then enter the same value in the Meta console.
        </p>
      </div>

      {/* Add rule form */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-4">
        <h2 className="text-sm font-semibold">Add Keyword Rule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Keyword (what they comment)</label>
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="e.g. PRICE, OFFER, BUY"
              className={inp}
            />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Match type</label>
            <select value={matchType} onChange={e => setMatchType(e.target.value as any)}
              className={inp + " bg-white"}>
              <option value="contains">Contains keyword (e.g. "what is the PRICE?" matches)</option>
              <option value="exact">Exact match only (comment must be exactly the keyword)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-ink-dim mb-1">Auto DM reply message</label>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              rows={3}
              placeholder="Hi! Thank you for your interest. Today's gold rate is ₹X/g. Visit us at..."
              className={inp + " resize-none"}
            />
          </div>
        </div>
        <button
          disabled={!keyword.trim() || !replyText.trim() || create.isPending}
          onClick={() => create.mutate()}
          className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 hover:bg-gold-dark disabled:opacity-40">
          {create.isPending ? "Adding…" : "Add Rule"}
        </button>
        {create.isError && (
          <p className="text-xs text-err">Failed — run migration 082 in Supabase first.</p>
        )}
      </div>

      {/* Rules list */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
          No keyword rules yet. Add one above.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(r => (
            <div key={r.id} className={`bg-white rounded-xl border shadow-soft overflow-hidden ${r.active ? "border-line" : "border-line opacity-60"}`}>
              {editId === r.id ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Keyword</label>
                      <input value={editForm.keyword ?? ""} onChange={e => setEditForm(f => ({ ...f, keyword: e.target.value }))}
                        className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Match type</label>
                      <select value={editForm.match_type ?? "contains"} onChange={e => setEditForm(f => ({ ...f, match_type: e.target.value as any }))}
                        className={inp + " bg-white"}>
                        <option value="contains">Contains</option>
                        <option value="exact">Exact</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-ink-dim mb-1">Reply message</label>
                      <textarea value={editForm.reply_text ?? ""} onChange={e => setEditForm(f => ({ ...f, reply_text: e.target.value }))}
                        rows={3} className={inp + " resize-none"} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button disabled={update.isPending} onClick={() => update.mutate(r.id)}
                      className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-40">
                      {update.isPending ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setEditId(null)}
                      className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gold uppercase">{r.keyword}</span>
                      <span className="text-[10px] border border-line text-ink-dim px-1.5 py-0.5 rounded">
                        {r.match_type}
                      </span>
                      {r.trigger_count > 0 && (
                        <span className="text-[10px] bg-ok/10 text-ok px-1.5 py-0.5 rounded font-medium">
                          {r.trigger_count}× triggered
                        </span>
                      )}
                      {!r.active && (
                        <span className="text-[10px] bg-err/10 text-err px-1.5 py-0.5 rounded font-medium">paused</span>
                      )}
                    </div>
                    <p className="text-xs text-ink-dim leading-relaxed line-clamp-2">{r.reply_text}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                      className={`text-xs px-2.5 py-1 rounded-lg2 border transition-colors ${r.active ? "border-ok/40 text-ok hover:bg-ok/5" : "border-line text-ink-dim hover:bg-canvas"}`}>
                      {r.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => { setEditId(r.id); setEditForm({ keyword: r.keyword, reply_text: r.reply_text, match_type: r.match_type, active: r.active }); }}
                      className="text-xs text-gold hover:underline">Edit</button>
                    <button
                      onClick={() => { if (window.confirm(`Delete rule "${r.keyword}"?`)) remove.mutate(r.id); }}
                      className="text-xs text-err hover:underline">Del</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
