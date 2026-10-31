"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

type YtRule = { id: string; keywords: string; reply_text: string; sort_order: number; active: boolean; trigger_count: number };
type YtLog = { id: string; author: string | null; comment_text: string | null; status: "pending" | "replied" | "failed" | "no_match"; error: string | null; created_at: string };
type YtStatus = { configured: boolean; connected: boolean; channel_title: string | null; last_polled_at: string | null; last_error: string | null };

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const STATUS_STYLE: Record<YtLog["status"], string> = {
  pending:  "bg-canvas text-ink-dim",
  replied:  "bg-ok/10 text-ok",
  failed:   "bg-err/10 text-err",
  no_match: "bg-canvas text-ink-dim",
};
const STATUS_LABEL: Record<YtLog["status"], string> = {
  pending: "pending", replied: "replied", failed: "reply failed", no_match: "no keyword",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}

export function YoutubeReplies() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { setNotice(new URLSearchParams(window.location.search).get("yt")); }, []);
  const [keywords, setKeywords] = useState("");
  const [replyText, setReplyText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ keywords: string; reply_text: string; sort_order: number }>({ keywords: "", reply_text: "", sort_order: 0 });

  const { data: status } = useQuery<YtStatus>({
    queryKey: ["yt_status"],
    queryFn: async () => {
      const res = await fetch("/api/youtube/status");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    refetchInterval: 60 * 1000,
  });

  const { data: rules = [], isError: rulesError } = useQuery<YtRule[]>({
    queryKey: ["yt_reply_rules"],
    queryFn: async () => {
      const { data, error } = await supabase().from("yt_reply_rules").select("*").order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as YtRule[];
    },
  });

  const { data: log = [], refetch: refetchLog, isFetching: logFetching } = useQuery<YtLog[]>({
    queryKey: ["yt_reply_log"],
    queryFn: async () => {
      const { data, error } = await supabase().from("yt_reply_log")
        .select("id, author, comment_text, status, error, created_at")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as YtLog[];
    },
    refetchInterval: 30 * 1000,
  });

  const invalidateRules = () => qc.invalidateQueries({ queryKey: ["yt_reply_rules"] });

  const create = useMutation({
    mutationFn: async () => {
      const next = rules.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
      const { error } = await supabase().from("yt_reply_rules").insert({ keywords: keywords.trim(), reply_text: replyText.trim(), sort_order: next });
      if (error) throw error;
    },
    onSuccess: () => { invalidateRules(); setKeywords(""); setReplyText(""); },
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("yt_reply_rules").update({
        keywords: editForm.keywords.trim(), reply_text: editForm.reply_text.trim(), sort_order: editForm.sort_order,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateRules(); setEditId(null); },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase().from("yt_reply_rules").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateRules,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("yt_reply_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateRules,
  });

  const checkNow = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/youtube/poll");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as { checked?: number; replied?: number; skipped?: string };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["yt_reply_log"] });
      qc.invalidateQueries({ queryKey: ["yt_status"] });
      invalidateRules();
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">YouTube Auto-Reply</h1>
        <p className="text-xs text-ink-dim mt-0.5">
          New comments on your channel are checked every few minutes. If a comment has a keyword, MyBuddy posts a public reply under it. YouTube has no DMs.
        </p>
      </div>

      {notice && (
        <p className={`text-xs px-3 py-2 rounded-lg2 ${notice === "connected" ? "bg-ok/10 text-ok" : "bg-err/10 text-err"}`}>
          {notice === "connected" ? "YouTube channel connected." : `YouTube connect failed: ${notice}`}
        </p>
      )}

      {/* Connection */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0 text-sm">
          {!status ? (
            <span className="text-ink-dim">Checking…</span>
          ) : status.connected ? (
            <>
              <p>Connected: <span className="font-semibold">{status.channel_title ?? "channel"}</span></p>
              <p className="text-xs text-ink-dim">
                Last checked: {status.last_polled_at ? fmt(status.last_polled_at) : "never"}
              </p>
              {status.last_error && <p className="text-xs text-err mt-0.5">{status.last_error}</p>}
            </>
          ) : (
            <span className="text-ink-dim">
              {status.configured ? "Not connected." : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first."}
            </span>
          )}
        </div>
        {status?.connected && (
          <button onClick={() => checkNow.mutate()} disabled={checkNow.isPending}
            className="text-xs px-3 py-1.5 rounded-lg2 border border-line text-ink-dim hover:text-gold disabled:opacity-50">
            {checkNow.isPending ? "Checking…" : "Check now"}
          </button>
        )}
        {status?.configured && (
          <a href="/api/youtube/connect"
            className="text-xs px-3 py-1.5 rounded-lg2 bg-gold text-white hover:bg-gold-dark">
            {status.connected ? "Reconnect" : "Connect YouTube"}
          </a>
        )}
        {checkNow.data && (
          <p className="w-full text-[11px] text-ink-dim">
            {checkNow.data.skipped ?? `Checked ${checkNow.data.checked} new comment(s), replied to ${checkNow.data.replied}.`}
          </p>
        )}
        {checkNow.isError && <p className="w-full text-[11px] text-err">{(checkNow.error as Error).message}</p>}
      </div>

      {/* Add rule */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
        <h2 className="text-sm font-semibold">Add Reply Rule</h2>
        <div>
          <label className="block text-xs text-ink-dim mb-1">Keywords (comma separated, English or Tamil)</label>
          <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="price, rate, evlo, விலை" className={inp} />
        </div>
        <div>
          <label className="block text-xs text-ink-dim mb-1">Public reply</label>
          <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={2}
            placeholder="Hi {name}! For price and details, please WhatsApp us at +91 73053 93916."
            className={inp + " resize-none"} />
          <p className="text-[11px] text-ink-dim mt-1">
            Use <code>{"{name}"}</code> for their YouTube name. Rules are checked top to bottom; the first match is used. English keywords match whole words only.
          </p>
        </div>
        <button disabled={!keywords.trim() || !replyText.trim() || create.isPending} onClick={() => create.mutate()}
          className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 hover:bg-gold-dark disabled:opacity-40">
          {create.isPending ? "Adding…" : "Add Rule"}
        </button>
        {(create.isError || rulesError) && <p className="text-xs text-err">Failed — run migration 172 in Supabase first.</p>}
      </div>

      {/* Rules */}
      <div className="space-y-3">
        {rules.map(r => (
          <div key={r.id} className={`bg-white rounded-xl border border-line shadow-soft overflow-hidden ${r.active ? "" : "opacity-60"}`}>
            {editId === r.id ? (
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px] gap-3">
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Keywords</label>
                    <input value={editForm.keywords} onChange={e => setEditForm(f => ({ ...f, keywords: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Order</label>
                    <input type="number" value={editForm.sort_order} onChange={e => setEditForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))} className={inp} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Public reply</label>
                  <textarea value={editForm.reply_text} onChange={e => setEditForm(f => ({ ...f, reply_text: e.target.value }))} rows={3} className={inp + " resize-none"} />
                </div>
                <div className="flex gap-2">
                  <button disabled={update.isPending} onClick={() => update.mutate(r.id)}
                    className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-40">
                    {update.isPending ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditId(null)} className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] border border-line text-ink-dim px-1.5 py-0.5 rounded">#{r.sort_order}</span>
                    <span className="text-sm font-bold text-gold">{r.keywords}</span>
                    {r.trigger_count > 0 && (
                      <span className="text-[10px] bg-ok/10 text-ok px-1.5 py-0.5 rounded font-medium">{r.trigger_count}× replied</span>
                    )}
                    {!r.active && <span className="text-[10px] bg-err/10 text-err px-1.5 py-0.5 rounded font-medium">paused</span>}
                  </div>
                  <p className="text-xs text-ink-dim leading-relaxed">{r.reply_text}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                    className={`text-xs px-2.5 py-1 rounded-lg2 border transition-colors ${r.active ? "border-ok/40 text-ok hover:bg-ok/5" : "border-line text-ink-dim hover:bg-canvas"}`}>
                    {r.active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => { setEditId(r.id); setEditForm({ keywords: r.keywords, reply_text: r.reply_text, sort_order: r.sort_order }); }}
                    className="text-xs text-gold hover:underline">Edit</button>
                  <button onClick={() => { if (window.confirm("Delete this rule?")) remove.mutate(r.id); }}
                    className="text-xs text-err hover:underline">Del</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Log */}
      <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent YouTube comments</h2>
          <button onClick={() => refetchLog()} disabled={logFetching}
            className="text-xs px-3 py-1 rounded-lg2 border border-line text-ink-dim hover:text-gold disabled:opacity-50">
            {logFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {log.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-dim">No comments checked yet. Only comments posted after connecting are answered.</p>
        ) : (
          <div className="divide-y divide-line">
            {log.map(l => (
              <div key={l.id} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-ink"><span className="font-semibold">{l.author ?? "unknown"}</span> {l.comment_text}</p>
                  {l.error && <p className="text-err text-[11px] mt-0.5 truncate">{l.error}</p>}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STATUS_STYLE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
                <span className="text-ink-dim shrink-0">{fmt(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
