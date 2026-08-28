"use client";

import { useState } from "react";
import {
  useRewardScores, useMyRewardScore, useRefreshRewards,
  REWARD_CATEGORIES, TOTAL_MAX, type RewardScore,
} from "@/modules/rewards/api";

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

const MEDALS = ["🥇", "🥈", "🥉"];

function ScoreBar({ pts, max, color }: { pts: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((pts / max) * 100) : 0;
  return (
    <div className="w-full bg-line rounded-full h-1.5">
      <div
        className={`h-1.5 rounded-full transition-all ${
          color === "text-blue-500"   ? "bg-blue-500"   :
          color === "text-green-500"  ? "bg-green-500"  :
          color === "text-orange-500" ? "bg-orange-500" :
          color === "text-purple-500" ? "bg-purple-500" : "bg-gold"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CategoryBreakdown({ score }: { score: RewardScore }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {REWARD_CATEGORIES.map(cat => {
        const pts = score[cat.key as keyof RewardScore] as number ?? 0;
        const detail =
          cat.key === "punctuality_pts" ? `${score.on_time_days} on-time days` :
          cat.key === "leave_pts"       ? `${score.leave_count} leave${score.leave_count !== 1 ? "s" : ""} taken` :
          cat.key === "break_pts"       ? `${score.disciplined_break_days} disciplined days` :
          cat.key === "cleanliness_pts" ? (score.neat_pct != null ? `${score.neat_pct}% neat` : "N/A") : "";
        return (
          <div key={cat.key} className="bg-canvas border border-line rounded-lg2 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ink-dim">{cat.icon} {cat.label}</span>
              <span className={`text-xs font-bold ${cat.color}`}>{pts}/{cat.max}</span>
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
  const pct = Math.round((score.total_pts / TOTAL_MAX) * 100);
  return (
    <div
      className={`border rounded-lg2 overflow-hidden transition-all ${
        isMe ? "border-gold bg-gold/5" : "border-line bg-canvas"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
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
              className={`h-1.5 rounded-full transition-all ${
                rank === 1 ? "bg-yellow-400" :
                rank === 2 ? "bg-gray-400"   :
                rank === 3 ? "bg-amber-600"  : "bg-gold"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-3 mt-1.5">
            {REWARD_CATEGORIES.map(cat => {
              const pts = score[cat.key as keyof RewardScore] as number ?? 0;
              return (
                <span key={cat.key} className="text-[10px] text-ink-dim">
                  {cat.icon} {pts}
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

export default function RewardsTab({
  isAdmin,
  myBioUserId,
}: {
  isAdmin: boolean;
  myBioUserId: string | null;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: scores = [], isLoading } = useRewardScores(month);
  const { data: myScore } = useMyRewardScore(month, myBioUserId);
  const refresh = useRefreshRewards();

  const myRank = scores.findIndex(s => s.bio_user_id === myBioUserId) + 1;

  function prevMonth() {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() - 1);
    setMonth(d.toISOString().slice(0, 7));
  }
  function nextMonth() {
    const d = new Date(month + "-01");
    d.setMonth(d.getMonth() + 1);
    const now = new Date();
    if (d <= now) setMonth(d.toISOString().slice(0, 7));
  }

  return (
    <div className="space-y-4">
      {/* Header / month picker */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-line text-ink-dim">‹</button>
          <span className="text-sm font-semibold text-ink">{monthLabel(month)}</span>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-line text-ink-dim">›</button>
        </div>
        {isAdmin && (
          <button
            onClick={() => refresh.mutate(month)}
            disabled={refresh.isPending}
            className="text-xs border border-line rounded-lg2 px-3 py-1.5 text-ink-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
          >
            {refresh.isPending ? "Calculating…" : "↻ Recalculate"}
          </button>
        )}
      </div>

      {/* My scorecard (for non-admin staff) */}
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
            <div
              className="h-2 rounded-full bg-gold transition-all"
              style={{ width: `${Math.round((myScore.total_pts / TOTAL_MAX) * 100)}%` }}
            />
          </div>
          <CategoryBreakdown score={myScore} />
        </div>
      )}

      {/* No scores yet */}
      {!isLoading && scores.length === 0 && (
        <div className="text-center py-10 text-ink-dim text-sm">
          {isAdmin
            ? "No scores yet. Click Recalculate to compute this month's scores."
            : "Scores not calculated yet. Check back later."}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Top 3 podium */}
      {scores.length >= 3 && (
        <div className="grid grid-cols-3 gap-2">
          {[scores[1], scores[0], scores[2]].map((s, i) => {
            if (!s) return <div key={i} />;
            const actualRank = i === 1 ? 1 : i === 0 ? 2 : 3;
            return (
              <div
                key={s.bio_user_id}
                className={`border rounded-lg2 p-2 text-center flex flex-col items-center gap-1 ${
                  actualRank === 1 ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20" :
                  actualRank === 2 ? "border-gray-300 bg-gray-50 dark:bg-gray-800/30"     :
                                    "border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                } ${i === 1 ? "order-2" : ""}`}
              >
                <span className="text-2xl">{MEDALS[actualRank - 1]}</span>
                <p className="text-[11px] font-semibold text-ink leading-tight text-center line-clamp-2">
                  {s.staff_name}
                </p>
                <p className="text-base font-bold text-ink">{s.total_pts}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Full leaderboard */}
      {scores.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold tracking-widest text-ink-dim uppercase">
            Leaderboard — {scores.length} staff
          </p>
          {scores.map((s, i) => (
            <LeaderboardRow
              key={s.bio_user_id}
              rank={i + 1}
              score={s}
              isMe={s.bio_user_id === myBioUserId}
              expanded={expandedId === s.bio_user_id}
              onToggle={() =>
                setExpandedId(expandedId === s.bio_user_id ? null : s.bio_user_id)
              }
            />
          ))}
        </div>
      )}

      {/* Scoring guide */}
      <details className="border border-line rounded-lg2 text-sm">
        <summary className="px-4 py-2 cursor-pointer text-ink-dim text-xs font-semibold uppercase tracking-wide">
          How scores are calculated
        </summary>
        <div className="px-4 pb-4 pt-2 space-y-2 text-xs text-ink-dim">
          {REWARD_CATEGORIES.map(cat => (
            <div key={cat.key} className="flex gap-2">
              <span>{cat.icon}</span>
              <div>
                <span className="font-semibold text-ink">{cat.label}</span>
                <span className="text-ink-dim"> (max {cat.max} pts)</span>
                <p>
                  {cat.key === "punctuality_pts" && "+1 per day you arrive by 9:35 am. Max 25 days."}
                  {cat.key === "leave_pts"        && "0 leaves=10 pts · 1=8 · 2=6 · 3=4 · 4+ = 0 pts"}
                  {cat.key === "break_pts"        && "+1 per day your lunch break is within 1 hour. Max 10 days."}
                  {cat.key === "cleanliness_pts"  && "90%+ neat=15 · 75%+=10 · 60%+=5 (supervisor only)"}
                </p>
              </div>
            </div>
          ))}
          <p className="pt-1 border-t border-line">
            Scores are recalculated by the admin at any time. Last update shown in each row.
          </p>
        </div>
      </details>
    </div>
  );
}
