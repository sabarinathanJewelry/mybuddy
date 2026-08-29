"use client";

import { useState, useEffect } from "react";
import {
  useRewardScores, useMyRewardScore, useRefreshRewards,
  useConductMarks, useAddConductMark, useDeleteConductMark, useAllStaff,
  REWARD_CATEGORIES, TOTAL_MAX, type RewardScore, type ConductMark,
} from "@/modules/rewards/api";
import { useAuth } from "@/stores/auth";
import { shortDate } from "@/lib/format";

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

const MEDALS = ["🥇", "🥈", "🥉"];

const BEHAVIOR_PRESETS = [
  { label: "Excellent teamwork",    pts: +5  },
  { label: "Good attitude",         pts: +3  },
  { label: "Rude to customer",      pts: -3  },
  { label: "Shouting / argument",   pts: -5  },
  { label: "Serious misconduct",    pts: -10 },
];
const DRESSING_PRESETS = [
  { label: "Perfectly dressed",     pts: +5  },
  { label: "Neat & tidy",           pts: +3  },
  { label: "Untidy appearance",     pts: -3  },
  { label: "Not in uniform",        pts: -5  },
];

function ScoreBar({ pts, max, color }: { pts: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((pts / max) * 100))) : 0;
  const barColor =
    color === "text-blue-500"   ? "bg-blue-500"   :
    color === "text-green-500"  ? "bg-green-500"  :
    color === "text-orange-500" ? "bg-orange-500" :
    color === "text-purple-500" ? "bg-purple-500" :
    color === "text-red-500"    ? (pts < 0 ? "bg-red-500" : "bg-emerald-500") :
    color === "text-pink-500"   ? "bg-pink-500"   : "bg-gold";
  return (
    <div className="w-full bg-line rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CategoryBreakdown({ score }: { score: RewardScore }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {REWARD_CATEGORIES.map(cat => {
        const pts = (score[cat.key as keyof RewardScore] as number) ?? 0;
        const detail =
          cat.key === "punctuality_pts" ? `${score.on_time_days} on-time days` :
          cat.key === "leave_pts"       ? `${score.leave_count} leave${score.leave_count !== 1 ? "s" : ""}` :
          cat.key === "break_pts"       ? `${score.disciplined_break_days} disciplined days` :
          cat.key === "cleanliness_pts" ? (score.neat_pct != null ? `${score.neat_pct}% neat` : "N/A") :
          cat.key === "behavior_pts"    ? (pts >= 0 ? `+${pts} pts` : `${pts} pts`) :
          cat.key === "dressing_pts"    ? `${pts} pts` : "";
        return (
          <div key={cat.key} className="bg-canvas border border-line rounded-lg2 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ink-dim">{cat.icon} {cat.label}</span>
              <span className={`text-xs font-bold ${pts < 0 ? "text-err" : cat.color}`}>
                {pts >= 0 && cat.key !== "behavior_pts" ? "" : pts < 0 ? "" : "+"}
                {pts}/{cat.max}
              </span>
            </div>
            <ScoreBar pts={pts} max={cat.max} color={cat.color} />
            <p className="text-[10px] text-ink-dim mt-1">{detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardRow({
  rank, score, isMe, expanded, onToggle,
}: {
  rank: number;
  score: RewardScore & { staff_name: string };
  isMe: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = Math.round(Math.max(0, (score.total_pts / TOTAL_MAX) * 100));
  return (
    <div className={`border rounded-lg2 overflow-hidden ${isMe ? "border-gold bg-gold/5" : "border-line bg-canvas"}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="text-xl w-7 text-center flex-shrink-0">
          {rank <= 3 ? MEDALS[rank - 1] : <span className="text-ink-dim text-sm font-bold">#{rank}</span>}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold truncate ${isMe ? "text-gold" : "text-ink"}`}>
              {score.staff_name}
              {isMe && <span className="ml-1 text-[10px] text-gold font-normal">(you)</span>}
            </span>
            <span className="text-sm font-bold text-ink ml-2 flex-shrink-0">
              {score.total_pts}
              <span className="text-ink-dim font-normal text-[11px]">/{TOTAL_MAX}</span>
            </span>
          </div>
          <div className="w-full bg-line rounded-full h-1.5 mt-1.5">
            <div
              className={`h-1.5 rounded-full ${rank === 1 ? "bg-yellow-400" : rank === 2 ? "bg-gray-400" : rank === 3 ? "bg-amber-600" : "bg-gold"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-3 mt-1.5 flex-wrap">
            {REWARD_CATEGORIES.map(cat => {
              const pts = (score[cat.key as keyof RewardScore] as number) ?? 0;
              return (
                <span key={cat.key} className={`text-[10px] ${pts < 0 ? "text-err" : "text-ink-dim"}`}>
                  {cat.icon} {pts < 0 ? pts : pts}
                </span>
              );
            })}
          </div>
        </div>
        <span className="text-ink-dim text-xs ml-1">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-line bg-canvas">
          <CategoryBreakdown score={score} />
        </div>
      )}
    </div>
  );
}

function ConductMarkForm({
  month, adminName, onClose,
}: {
  month: string;
  adminName: string;
  onClose: () => void;
}) {
  const { data: allStaff = [] } = useAllStaff();
  const addMark = useAddConductMark();
  const [bioUserId, setBioUserId] = useState("");
  const [category, setCategory] = useState<"behavior" | "dressing">("behavior");
  const [pts, setPts] = useState(0);
  const [note, setNote] = useState("");

  const presets = category === "behavior" ? BEHAVIOR_PRESETS : DRESSING_PRESETS;
  const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-canvas text-ink";

  async function submit() {
    if (!bioUserId || pts === 0 || !note.trim()) return;
    await addMark.mutateAsync({ bio_user_id: bioUserId, month, category, points: pts, note: note.trim(), marked_by: adminName });
    setBioUserId(""); setPts(0); setNote("");
    onClose();
  }

  return (
    <div className="border border-gold/40 rounded-lg2 bg-canvas p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Add Conduct Mark</p>
        <button onClick={onClose} className="text-ink-dim text-xs hover:text-ink">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-ink-dim mb-1 block">Staff</label>
          <select value={bioUserId} onChange={e => setBioUserId(e.target.value)} className={inp}>
            <option value="">Select staff…</option>
            {allStaff.map(s => <option key={s.bio_user_id} value={s.bio_user_id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-ink-dim mb-1 block">Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as any)} className={inp}>
            <option value="behavior">🤝 Behavior</option>
            <option value="dressing">👔 Dressing</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-[11px] text-ink-dim mb-1 block">Quick select</label>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.label}
              onClick={() => { setPts(p.pts); setNote(p.label); }}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                pts === p.pts && note === p.label
                  ? "border-gold bg-gold/10 text-gold"
                  : p.pts > 0 ? "border-green-400 text-green-600" : "border-red-400 text-red-600"
              }`}
            >
              {p.pts > 0 ? "+" : ""}{p.pts} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-ink-dim mb-1 block">Points (+ or −)</label>
          <input type="number" value={pts} onChange={e => setPts(Number(e.target.value))}
            className={inp} min={-15} max={15} />
        </div>
        <div>
          <label className="text-[11px] text-ink-dim mb-1 block">Note (required)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Reason…" className={inp} />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!bioUserId || pts === 0 || !note.trim() || addMark.isPending}
        className="w-full bg-gold text-white text-sm font-semibold rounded-lg2 py-2 disabled:opacity-50"
      >
        {addMark.isPending ? "Saving…" : "Save Mark"}
      </button>
    </div>
  );
}

function ConductHistory({ month, isAdmin }: { month: string; isAdmin: boolean }) {
  const { data: marks = [] } = useConductMarks(month);
  const deleteMark = useDeleteConductMark();
  const { data: staffRows = [] } = useAllStaff();
  const nameMap: Record<string, string> = {};
  staffRows.forEach(s => { nameMap[s.bio_user_id] = s.name; });

  if (marks.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold tracking-widest text-ink-dim uppercase">Conduct History</p>
      {marks.map(m => (
        <div key={m.id} className="flex items-start gap-2 border border-line rounded-lg2 px-3 py-2 bg-canvas">
          <span className="text-lg">{m.category === "behavior" ? "🤝" : "👔"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">{nameMap[m.bio_user_id] ?? m.bio_user_id}</span>
              <span className={`text-xs font-bold ${m.points >= 0 ? "text-ok" : "text-err"}`}>
                {m.points > 0 ? "+" : ""}{m.points} pts
              </span>
            </div>
            <p className="text-xs text-ink-dim truncate">{m.note}</p>
            <p className="text-[10px] text-ink-dim">by {m.marked_by} · {shortDate(m.created_at)}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => deleteMark.mutate({ id: m.id, month })}
              className="text-ink-dim hover:text-err text-xs flex-shrink-0"
            >✕</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RewardsTab({
  isAdmin,
  myBioUserId,
}: {
  isAdmin: boolean;
  myBioUserId: string | null;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMarkForm, setShowMarkForm] = useState(false);
  const profile = useAuth(s => s.profile);
  const adminName = profile?.display_name ?? "Admin";

  const { data: scores = [], isLoading, isError } = useRewardScores(month);
  const { data: myScore } = useMyRewardScore(month, myBioUserId);
  const refresh = useRefreshRewards();

  const myRank = scores.findIndex(s => s.bio_user_id === myBioUserId) + 1;

  useEffect(() => {
    if (isAdmin && !isLoading && !isError && scores.length === 0 && !refresh.isPending) {
      refresh.mutate(month);
    }
  }, [isAdmin, isLoading, isError, scores.length, month]);

  function prevMonth() {
    const d = new Date(month + "-01"); d.setMonth(d.getMonth() - 1);
    setMonth(d.toISOString().slice(0, 7));
  }
  function nextMonth() {
    const d = new Date(month + "-01"); d.setMonth(d.getMonth() + 1);
    if (d <= new Date()) setMonth(d.toISOString().slice(0, 7));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-line text-ink-dim">‹</button>
          <span className="text-sm font-semibold text-ink">{monthLabel(month)}</span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-line text-ink-dim">›</button>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowMarkForm(v => !v)}
              className="text-xs border border-line rounded-lg2 px-3 py-1.5 text-ink hover:border-gold hover:text-gold transition-colors"
            >
              + Conduct Mark
            </button>
            <button
              onClick={() => refresh.mutate(month)}
              disabled={refresh.isPending}
              className="text-xs border border-line rounded-lg2 px-3 py-1.5 text-ink-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
            >
              {refresh.isPending ? "Calculating…" : "↻ Recalculate"}
            </button>
          </div>
        )}
      </div>

      {/* Conduct mark form */}
      {isAdmin && showMarkForm && (
        <ConductMarkForm month={month} adminName={adminName} onClose={() => setShowMarkForm(false)} />
      )}

      {/* My scorecard (staff view) */}
      {!isAdmin && myScore && (
        <div className="bg-canvas border border-gold/40 rounded-lg2 shadow-soft p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs text-ink-dim">Your Score</p>
              <p className="text-2xl font-bold text-ink">
                {myScore.total_pts}
                <span className="text-base font-normal text-ink-dim">/{TOTAL_MAX}</span>
              </p>
            </div>
            {myRank > 0 && (
              <div className="text-center">
                <p className="text-3xl">{myRank <= 3 ? MEDALS[myRank - 1] : `#${myRank}`}</p>
                <p className="text-[10px] text-ink-dim">Rank</p>
              </div>
            )}
          </div>
          <div className="w-full bg-line rounded-full h-2 mb-3">
            <div className="h-2 rounded-full bg-gold" style={{ width: `${Math.round(Math.max(0, (myScore.total_pts / TOTAL_MAX) * 100))}%` }} />
          </div>
          <CategoryBreakdown score={myScore} />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="text-center py-10 space-y-2">
          <p className="text-err text-sm">Could not load scores. Run migration 154_conduct_marks.sql in Supabase.</p>
          {isAdmin && (
            <button onClick={() => refresh.mutate(month)} disabled={refresh.isPending}
              className="text-xs border border-gold rounded-lg2 px-3 py-1.5 text-gold hover:bg-gold/10">
              {refresh.isPending ? "Calculating…" : "↻ Try Recalculate"}
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {(isLoading || (refresh.isPending && scores.length === 0)) && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
          {refresh.isPending && <p className="text-xs text-ink-dim">Calculating scores…</p>}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && !refresh.isPending && scores.length === 0 && (
        <div className="text-center py-10 text-ink-dim text-sm">
          {isAdmin ? "Click Recalculate to compute scores." : "Scores not calculated yet."}
        </div>
      )}

      {/* Podium */}
      {scores.length >= 3 && (
        <div className="grid grid-cols-3 gap-2">
          {[scores[1], scores[0], scores[2]].map((s, i) => {
            if (!s) return <div key={i} />;
            const r = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <div key={s.bio_user_id} className={`border rounded-lg2 p-2 text-center flex flex-col items-center gap-1 ${
                r === 1 ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20" :
                r === 2 ? "border-gray-300 bg-gray-50 dark:bg-gray-800/30" :
                          "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
              }`}>
                <span className="text-2xl">{MEDALS[r - 1]}</span>
                <p className="text-[11px] font-semibold text-ink leading-tight line-clamp-2">{s.staff_name}</p>
                <p className="text-base font-bold text-ink">{s.total_pts}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Leaderboard */}
      {scores.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold tracking-widest text-ink-dim uppercase">Leaderboard — {scores.length} staff</p>
          {scores.map((s, i) => (
            <LeaderboardRow
              key={s.bio_user_id} rank={i + 1} score={s}
              isMe={s.bio_user_id === myBioUserId}
              expanded={expandedId === s.bio_user_id}
              onToggle={() => setExpandedId(expandedId === s.bio_user_id ? null : s.bio_user_id)}
            />
          ))}
        </div>
      )}

      {/* Conduct history */}
      <ConductHistory month={month} isAdmin={isAdmin} />

      {/* Scoring guide */}
      <details className="border border-line rounded-lg2 text-sm">
        <summary className="px-4 py-2 cursor-pointer text-ink-dim text-xs font-semibold uppercase tracking-wide">
          How scores are calculated (100 pts total)
        </summary>
        <div className="px-4 pb-4 pt-2 space-y-2 text-xs text-ink-dim">
          {[
            { icon: "⏰", label: "Punctuality",          max: 40, desc: "+1 per day arrived by 9:50 am. Most on-time days wins." },
            { icon: "📅", label: "Leave Discipline",     max: 10, desc: "0 leaves=10 · 1=8 · 2=6 · 3=4 · 4+=0 pts" },
            { icon: "☕", label: "Break Discipline",     max: 10, desc: "+1 per day lunch break ≤ 1 hour. Consistently short breaks win." },
            { icon: "🤝", label: "Behavior",             max: 15, desc: "Admin marks +/− for teamwork, attitude, misconduct, shouting. Range −15 to +15." },
            { icon: "👔", label: "Dressing & Neatness",  max: 15, desc: "Admin marks +/− for appearance and uniform. Range 0 to +15." },
            { icon: "🧹", label: "Cleanliness",          max: 10, desc: "90%+ neat=10 · 75%+=7 · 60%+=4 (counter supervisor only)" },
          ].map(c => (
            <div key={c.label} className="flex gap-2">
              <span>{c.icon}</span>
              <div>
                <span className="font-semibold text-ink">{c.label}</span>
                <span className="text-ink-dim"> (max {c.max} pts)</span>
                <p>{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
