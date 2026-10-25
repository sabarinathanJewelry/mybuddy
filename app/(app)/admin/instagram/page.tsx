"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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

export default function InstagramInsightsPage() {
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
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">Instagram Insights</h1>
          <p className="text-xs text-ink-dim mt-0.5">@{data.profile.username} · last {items.length} posts</p>
        </div>
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
