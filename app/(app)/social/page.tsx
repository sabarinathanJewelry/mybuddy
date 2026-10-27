"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

type Rule = {
  id: string;
  keyword: string;
  reply_text: string;
  public_reply: string | null;
  require_follow: boolean;
  gate_text: string | null;
  follow_text: string | null;
  media_id: string | null;
  media_label: string | null;
  active: boolean;
  match_type: "contains" | "exact";
  trigger_count: number;
  created_at: string;
};

type Reel = { id: string; label: string; thumb: string | null; permalink: string };

type DmLog = {
  id: string;
  comment_id: string;
  username: string | null;
  comment_text: string | null;
  dm_status: "pending" | "gate_sent" | "awaiting_follow" | "sent" | "failed" | "no_match";
  reply_status: "sent" | "failed" | null;
  error: string | null;
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

function useReels() {
  return useQuery<Reel[]>({
    queryKey: ["ig_media_list"],
    queryFn: async () => {
      const res = await fetch("/api/instagram/media");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load reels");
      return json.items;
    },
    staleTime: 10 * 60 * 1000,
  });
}

function useDmLog() {
  return useQuery<DmLog[]>({
    queryKey: ["ig_dm_log"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("ig_dm_log")
        .select("id, comment_id, username, comment_text, dm_status, reply_status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DmLog[];
    },
    refetchInterval: 10 * 1000,
  });
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const STATUS_STYLE: Record<DmLog["dm_status"], string> = {
  sent: "bg-ok/10 text-ok",
  failed: "bg-err/10 text-err",
  pending: "bg-warn/10 text-warn",
  gate_sent: "bg-info/10 text-info",
  awaiting_follow: "bg-warn/10 text-warn",
  no_match: "bg-canvas text-ink-dim",
};

const STATUS_LABEL: Record<DmLog["dm_status"], string> = {
  sent: "DM sent",
  failed: "DM failed",
  pending: "pending",
  gate_sent: "button sent",
  awaiting_follow: "waiting for follow",
  no_match: "no keyword",
};

const GATE_HINT = "Hi {name}! 👋 Thanks for your comment. Tap \"Send details\" below and we'll share them right here.";
const FOLLOW_HINT = "Hi {name}! To unlock the details, please follow @{shop} 🙏 Then tap \"I followed ✅\".";

function ReelSelect({ value, onChange, reels }: { value: string; onChange: (id: string, label: string | null) => void; reels: Reel[] }) {
  return (
    <select value={value} onChange={e => {
      const r = reels.find(x => x.id === e.target.value);
      onChange(e.target.value, r?.label ?? null);
    }} className={inp + " bg-white"}>
      <option value="">All reels and posts</option>
      {reels.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
  );
}

function FollowGate({ on, gate, follow, setOn, setGate, setFollow }: {
  on: boolean; gate: string; follow: string;
  setOn: (v: boolean) => void; setGate: (v: string) => void; setFollow: (v: string) => void;
}) {
  return (
    <div className="sm:col-span-2 space-y-2 border border-line rounded-lg2 p-3 bg-canvas/40">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} className="accent-gold" />
        Followers only — ask non-followers to follow first
      </label>
      {on && (
        <>
          <p className="text-[11px] text-ink-dim">
            Instagram only shares follow status after the person messages you, so the first DM has a "Send details" button. When they tap it, followers get your message; others are asked to follow and tap "I followed ✅".
          </p>
          <div>
            <label className="block text-xs text-ink-dim mb-1">First DM (with "Send details" button)</label>
            <textarea value={gate} onChange={e => setGate(e.target.value)} rows={2} placeholder={GATE_HINT} className={inp + " resize-none"} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Message to non-followers (with "I followed ✅" button)</label>
            <textarea value={follow} onChange={e => setFollow(e.target.value)} rows={2} placeholder={FOLLOW_HINT} className={inp + " resize-none"} />
            <p className="text-[11px] text-ink-dim mt-1">Leave empty to use the example text. <code>{"{shop}"}</code> = your Instagram handle.</p>
          </div>
        </>
      )}
    </div>
  );
}

export default function SocialPage() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useRules();
  const { data: reels = [], error: reelsError } = useReels();
  const { data: log = [], refetch: refetchLog, isFetching: logFetching } = useDmLog();

  const [keyword, setKeyword]         = useState("");
  const [replyText, setReplyText]     = useState("");
  const [publicReply, setPublicReply] = useState("");
  const [mediaId, setMediaId]         = useState("");
  const [mediaLabel, setMediaLabel]   = useState<string | null>(null);
  const [matchType, setMatchType]     = useState<"contains" | "exact">("contains");
  const [requireFollow, setRequireFollow] = useState(true);
  const [gateText, setGateText]       = useState("");
  const [followText, setFollowText]   = useState("");
  const [editId, setEditId]           = useState<string | null>(null);
  const [editForm, setEditForm]       = useState<Partial<Rule>>({});

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase().from("ig_keyword_rules").insert({
        keyword: keyword.trim(),
        reply_text: replyText.trim(),
        public_reply: publicReply.trim() || null,
        media_id: mediaId || null,
        media_label: mediaId ? mediaLabel : null,
        match_type: matchType,
        require_follow: requireFollow,
        gate_text: gateText.trim() || null,
        follow_text: followText.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig_keyword_rules"] });
      setKeyword(""); setReplyText(""); setPublicReply(""); setMediaId(""); setMediaLabel(null); setMatchType("contains"); setRequireFollow(true); setGateText(""); setFollowText("");
    },
  });

  const update = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("ig_keyword_rules").update({
        keyword:      editForm.keyword?.trim(),
        reply_text:   editForm.reply_text?.trim(),
        public_reply: editForm.public_reply?.trim() || null,
        media_id:     editForm.media_id || null,
        media_label:  editForm.media_id ? editForm.media_label : null,
        match_type:   editForm.match_type,
        require_follow: editForm.require_follow,
        gate_text:    editForm.gate_text?.trim() || null,
        follow_text:  editForm.follow_text?.trim() || null,
        active:       editForm.active,
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
  const sentCount = log.filter(l => l.dm_status === "sent").length;
  const failedCount = log.filter(l => l.dm_status === "failed").length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Instagram Auto-DM</h1>
          <p className="text-xs text-ink-dim mt-0.5">
            When someone comments a keyword on your reels or posts, they get a personal DM (and optionally a public reply).
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Rules",       value: activeCount },
          { label: "DMs sent (last 50)", value: sentCount },
          { label: "Failed (last 50)",   value: failedCount },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
            <p className="text-2xl font-bold text-gold">{s.value}</p>
            <p className="text-xs text-ink-dim mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Webhook info */}
      <div className="bg-info/5 border border-info/20 rounded-xl px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-info">Meta setup (Instagram use case → API setup with Instagram login → 3. Configure webhooks)</p>
        <p className="text-xs text-ink-dim">Callback URL:</p>
        <code className="block text-xs bg-white border border-line rounded px-2 py-1.5 text-ink font-mono break-all">
          {typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/instagram/webhook
        </code>
        <p className="text-xs text-ink-dim mt-1">
          Verify token = <code className="bg-white border border-line rounded px-1">INSTAGRAM_VERIFY_TOKEN</code>. Set <code className="bg-white border border-line rounded px-1">INSTAGRAM_APP_SECRET</code> (Instagram app secret) so only Meta can call the webhook. Subscribe to the <b>comments</b> and <b>messages</b> fields and turn on Webhook Subscription for your account.
          The app must be <b>Live</b> with Advanced Access to <code className="bg-white border border-line rounded px-1">instagram_business_manage_comments</code> and <code className="bg-white border border-line rounded px-1">instagram_business_manage_messages</code> to DM real customers.
        </p>
      </div>

      {/* Add rule form */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-4">
        <h2 className="text-sm font-semibold">Add Keyword Rule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Keyword (what they comment)</label>
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. PRICE, OFFER, BUY" className={inp} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Match type</label>
            <select value={matchType} onChange={e => setMatchType(e.target.value as any)} className={inp + " bg-white"}>
              <option value="contains">Contains keyword (e.g. "what is the PRICE?" matches)</option>
              <option value="exact">Exact match only (comment must be exactly the keyword)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-ink-dim mb-1">Reel</label>
            <ReelSelect value={mediaId} reels={reels} onChange={(id, label) => { setMediaId(id); setMediaLabel(label); }} />
            {reelsError && <p className="text-[11px] text-err mt-1">{(reelsError as Error).message}</p>}
            <p className="text-[11px] text-ink-dim mt-1">A rule for a specific reel wins over an "All reels" rule with the same keyword.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-ink-dim mb-1">Personal DM message</label>
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
              placeholder="Hi {name}! Thank you for your interest. This Krishna combo is 11 pavan… WhatsApp us on 73053 93916 for the price."
              className={inp + " resize-none"} />
            <p className="text-[11px] text-ink-dim mt-1">Use <code>{"{name}"}</code> for their Instagram username.</p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-ink-dim mb-1">Public reply under the comment (optional)</label>
            <input value={publicReply} onChange={e => setPublicReply(e.target.value)} placeholder="Sent you a DM {name} ✅" className={inp} />
          </div>
          <FollowGate
            on={requireFollow} gate={gateText} follow={followText}
            setOn={setRequireFollow} setGate={setGateText} setFollow={setFollowText} />
        </div>
        <button
          disabled={!keyword.trim() || !replyText.trim() || create.isPending}
          onClick={() => create.mutate()}
          className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 hover:bg-gold-dark disabled:opacity-40">
          {create.isPending ? "Adding…" : "Add Rule"}
        </button>
        {create.isError && (
          <p className="text-xs text-err">Failed — run migrations 082, 170 and 171 in Supabase first.</p>
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
                      <input value={editForm.keyword ?? ""} onChange={e => setEditForm(f => ({ ...f, keyword: e.target.value }))} className={inp} />
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
                      <label className="block text-xs text-ink-dim mb-1">Reel</label>
                      <ReelSelect value={editForm.media_id ?? ""} reels={reels}
                        onChange={(id, label) => setEditForm(f => ({ ...f, media_id: id || null, media_label: label }))} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-ink-dim mb-1">Personal DM message</label>
                      <textarea value={editForm.reply_text ?? ""} onChange={e => setEditForm(f => ({ ...f, reply_text: e.target.value }))}
                        rows={3} className={inp + " resize-none"} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-ink-dim mb-1">Public reply (optional)</label>
                      <input value={editForm.public_reply ?? ""} onChange={e => setEditForm(f => ({ ...f, public_reply: e.target.value }))} className={inp} />
                    </div>
                    <FollowGate
                      on={editForm.require_follow ?? true} gate={editForm.gate_text ?? ""} follow={editForm.follow_text ?? ""}
                      setOn={v => setEditForm(f => ({ ...f, require_follow: v }))}
                      setGate={v => setEditForm(f => ({ ...f, gate_text: v }))}
                      setFollow={v => setEditForm(f => ({ ...f, follow_text: v }))} />
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
                      <span className="text-[10px] border border-line text-ink-dim px-1.5 py-0.5 rounded">{r.match_type}</span>
                      <span className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded font-medium truncate max-w-[260px]">
                        {r.media_id ? r.media_label ?? "Specific reel" : "All reels"}
                      </span>
                      {r.require_follow && (
                        <span className="text-[10px] bg-gold/10 text-gold px-1.5 py-0.5 rounded font-medium">followers only</span>
                      )}
                      {r.trigger_count > 0 && (
                        <span className="text-[10px] bg-ok/10 text-ok px-1.5 py-0.5 rounded font-medium">{r.trigger_count}× sent</span>
                      )}
                      {!r.active && (
                        <span className="text-[10px] bg-err/10 text-err px-1.5 py-0.5 rounded font-medium">paused</span>
                      )}
                    </div>
                    <p className="text-xs text-ink-dim leading-relaxed line-clamp-2">{r.reply_text}</p>
                    {r.public_reply && <p className="text-[11px] text-ink-dim italic">Public reply: {r.public_reply}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                      className={`text-xs px-2.5 py-1 rounded-lg2 border transition-colors ${r.active ? "border-ok/40 text-ok hover:bg-ok/5" : "border-line text-ink-dim hover:bg-canvas"}`}>
                      {r.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => { setEditId(r.id); setEditForm({ keyword: r.keyword, reply_text: r.reply_text, public_reply: r.public_reply, require_follow: r.require_follow, gate_text: r.gate_text, follow_text: r.follow_text, media_id: r.media_id, media_label: r.media_label, match_type: r.match_type, active: r.active }); }}
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

      {/* DM log */}
      <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent comments</h2>
          <button
            onClick={() => refetchLog()}
            disabled={logFetching}
            className="text-xs px-3 py-1 rounded-lg2 border border-line text-ink-dim hover:text-gold disabled:opacity-50"
          >
            {logFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {log.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-dim">No comments received yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {log.map(l => (
              <div key={l.id} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-ink"><span className="font-semibold">@{l.username ?? "unknown"}</span> {l.comment_text}</p>
                  {l.error && <p className="text-err text-[11px] mt-0.5 truncate">{l.error}</p>}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${STATUS_STYLE[l.dm_status]}`}>
                  {STATUS_LABEL[l.dm_status]}
                </span>
                {l.reply_status && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${l.reply_status === "sent" ? "bg-ok/10 text-ok" : "bg-err/10 text-err"}`}>
                    reply {l.reply_status}
                  </span>
                )}
                <span className="text-ink-dim shrink-0">
                  {new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
