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

type IgItem = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type: "REELS" | "FEED" | "STORY";
  permalink: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  insights: Partial<Record<"views" | "reach" | "saved" | "shares" | "total_interactions" | "ig_reels_avg_watch_time", number>>;
};
type IgData = {
  profile: { username: string; followers_count: number; media_count: number };
  items: IgItem[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOTS = [
  { label: "Morning (6–11)", from: 6, to: 11 },
  { label: "Noon (11–15)", from: 11, to: 15 },
  { label: "Evening (15–19)", from: 15, to: 19 },
  { label: "Night (19–23)", from: 19, to: 23 },
  { label: "Late (23–6)", from: 23, to: 30 },
];

function istParts(ts: string) {
  const d = new Date(ts.replace(/\+0000$/, "Z"));
  const ist = new Date(d.getTime() + 330 * 60000);
  return { day: ist.getUTCDay(), hour: ist.getUTCHours(), date: d };
}
function typeLabel(m: IgItem) {
  if (m.media_product_type === "REELS") return "Reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "Carousel";
  return m.media_type === "VIDEO" ? "Video" : "Photo";
}
function views(m: IgItem) { return m.insights.views ?? 0; }
function engRate(m: IgItem) {
  const r = m.insights.reach ?? 0;
  return r ? ((m.insights.total_interactions ?? 0) / r) * 100 : 0;
}
function num(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(Math.round(n));
}
function avg(xs: number[]) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

function GroupBars({ title, rows }: { title: string; rows: { label: string; count: number; avgViews: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.avgViews));
  const best = rows.filter(r => r.count > 0).sort((a, b) => b.avgViews - a.avgViews)[0]?.label;
  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-soft">
      <h3 className="text-xs font-semibold text-ink-dim mb-3">{title}</h3>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            <span className={`w-28 shrink-0 ${r.label === best ? "font-semibold text-ok" : "text-ink"}`}>{r.label}</span>
            <div className="flex-1 bg-canvas rounded h-3 overflow-hidden">
              <div className={`h-full ${r.label === best ? "bg-ok" : "bg-gold/70"}`} style={{ width: `${(r.avgViews / max) * 100}%` }} />
            </div>
            <span className="w-14 text-right tabular-nums">{num(r.avgViews)}</span>
            <span className="w-8 text-right text-ink-dim tabular-nums">{r.count}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-ink-dim mt-2">Avg views · number of posts</p>
    </div>
  );
}

function InsightsTab() {
  const [limit, setLimit] = useState(60);
  const [sort, setSort] = useState<"recent" | "views" | "saved" | "shares" | "eng">("recent");
  const { data, isLoading, error, refetch, isFetching } = useQuery<IgData>({
    queryKey: ["ig_insights", limit],
    queryFn: async () => {
      const res = await fetch(`/api/instagram/insights?limit=${limit}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      return json;
    },
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <p className="text-ink-dim text-sm">Loading Instagram insights…</p>;
  if (error) return <p className="text-sm text-err">{(error as Error).message}</p>;
  if (!data) return null;

  const items = data.items;
  const reels = items.filter(m => m.media_product_type === "REELS");
  const avgViews = avg(items.map(views));
  const avgReelViews = avg(reels.map(views));
  const avgEng = avg(items.map(engRate));
  const avgWatch = avg(reels.map(m => m.insights.ig_reels_avg_watch_time ?? 0)) / 1000;

  const group = (keyOf: (m: IgItem) => string, labels: string[]) =>
    labels.map(label => {
      const g = items.filter(m => keyOf(m) === label);
      return { label, count: g.length, avgViews: avg(g.map(views)) };
    });
  const byType = group(typeLabel, ["Reel", "Carousel", "Photo", "Video"]).filter(r => r.count > 0);
  const byDay = group(m => WEEKDAYS[istParts(m.timestamp).day], WEEKDAYS);
  const bySlot = group(m => {
    const h = istParts(m.timestamp).hour;
    const hh = h < 6 ? h + 24 : h;
    return SLOTS.find(s => hh >= s.from && hh < s.to)?.label ?? "";
  }, SLOTS.map(s => s.label));

  const sorted = [...items].sort((a, b) => {
    if (sort === "views") return views(b) - views(a);
    if (sort === "saved") return (b.insights.saved ?? 0) - (a.insights.saved ?? 0);
    if (sort === "shares") return (b.insights.shares ?? 0) - (a.insights.shares ?? 0);
    if (sort === "eng") return engRate(b) - engRate(a);
    return b.timestamp.localeCompare(a.timestamp);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-ink-dim">@{data.profile.username} · last {items.length} posts</p>
        <div className="flex items-center gap-2">
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="border border-line rounded-lg2 px-2 py-1 text-xs bg-white">
            {[30, 60, 100, 150].map(n => <option key={n} value={n}>Last {n} posts</option>)}
          </select>
          <button onClick={() => refetch()} disabled={isFetching} className="text-xs border border-line rounded-lg2 px-3 py-1 hover:bg-canvas disabled:opacity-40">
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Followers", value: num(data.profile.followers_count) },
          { label: "Avg views / post", value: num(avgViews) },
          { label: "Avg views / reel", value: num(avgReelViews) },
          { label: "Engagement rate", value: avgEng.toFixed(1) + "%" },
          { label: "Avg reel watch", value: avgWatch.toFixed(1) + "s" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-line p-4 shadow-soft text-center">
            <p className="text-xl font-bold text-gold">{s.value}</p>
            <p className="text-[11px] text-ink-dim mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <GroupBars title="By post type" rows={byType} />
        <GroupBars title="By day posted (IST)" rows={byDay} />
        <GroupBars title="By time posted (IST)" rows={bySlot} />
      </div>

      <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold">Posts</h3>
          <select value={sort} onChange={e => setSort(e.target.value as any)} className="border border-line rounded-lg2 px-2 py-1 text-xs bg-white">
            <option value="recent">Most recent</option>
            <option value="views">Most views</option>
            <option value="saved">Most saves</option>
            <option value="shares">Most shares</option>
            <option value="eng">Best engagement</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-canvas text-ink-dim">
              <tr>
                <th className="text-left px-3 py-2">Post</th>
                <th className="text-right px-2 py-2">Views</th>
                <th className="text-right px-2 py-2">vs avg</th>
                <th className="text-right px-2 py-2">Reach</th>
                <th className="text-right px-2 py-2">Likes</th>
                <th className="text-right px-2 py-2">Comm.</th>
                <th className="text-right px-2 py-2">Saves</th>
                <th className="text-right px-2 py-2">Shares</th>
                <th className="text-right px-2 py-2">Eng.</th>
                <th className="text-right px-3 py-2">Watch</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => {
                const ratio = avgViews ? views(m) / avgViews : 0;
                const { date } = istParts(m.timestamp);
                return (
                  <tr key={m.id} className="border-t border-line hover:bg-canvas/50">
                    <td className="px-3 py-2">
                      <a href={m.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-[220px]">
                        {(m.thumbnail_url || m.media_url) && (
                          <img src={m.thumbnail_url || m.media_url} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-ink truncate max-w-[260px]">{m.caption?.split("\n")[0] || "(no caption)"}</p>
                          <p className="text-ink-dim text-[10px]">
                            {typeLabel(m)} · {date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })} {WEEKDAYS[istParts(m.timestamp).day]} {date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          </p>
                        </div>
                      </a>
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums font-medium">{num(views(m))}</td>
                    <td className={`text-right px-2 py-2 tabular-nums font-semibold ${ratio >= 1.5 ? "text-ok" : ratio < 0.6 ? "text-err" : "text-ink-dim"}`}>
                      {ratio.toFixed(1)}×
                    </td>
                    <td className="text-right px-2 py-2 tabular-nums">{num(m.insights.reach ?? 0)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{num(m.like_count ?? 0)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{num(m.comments_count ?? 0)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{num(m.insights.saved ?? 0)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{num(m.insights.shares ?? 0)}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{engRate(m).toFixed(1)}%</td>
                    <td className="text-right px-3 py-2 tabular-nums">
                      {m.insights.ig_reels_avg_watch_time ? (m.insights.ig_reels_avg_watch_time / 1000).toFixed(1) + "s" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SocialPage() {
  const [tab, setTab] = useState<"insights" | "autodm">("insights");
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-1 border-b border-line">
        {([["insights", "Instagram Insights"], ["autodm", "Auto-DM"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${tab === k ? "border-gold text-gold font-semibold" : "border-transparent text-ink-dim hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "insights" ? <InsightsTab /> : <AutoDmTab />}
    </div>
  );
}

function AutoDmTab() {
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
