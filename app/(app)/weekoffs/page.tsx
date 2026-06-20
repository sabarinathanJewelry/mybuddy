"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { clsx } from "clsx";

const MAX_DAYS = 3;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDay(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

interface Weekoff {
  id: string;
  user_id: string;
  month: string;
  dates: string[];
  status: "draft" | "pending" | "approved" | "rejected";
  review_note: string | null;
  profiles?: { display_name: string };
}

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-ink-dim/10 text-ink-dim",
  pending:  "bg-warn/10 text-warn",
  approved: "bg-ok/10 text-ok",
  rejected: "bg-err/10 text-err",
};

export default function WeekoffsPage() {
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();
  const isAdmin = profile?.role === "admin";

  const now = new Date();
  const [year, setYear]   = useState(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 11 ? 0 : now.getMonth() + 1);
  const monthKey = getMonthKey(year, month);

  // All weekoffs for this month (team view)
  const { data: allWeekoffs = [] } = useQuery<Weekoff[]>({
    queryKey: ["weekoffs", monthKey],
    queryFn: async () => {
      const { data } = await supabase()
        .from("monthly_weekoffs")
        .select("*, profiles(display_name)")
        .eq("month", monthKey)
        .order("created_at");
      return (data ?? []) as Weekoff[];
    },
  });

  const myWeekoff = allWeekoffs.find((w) => w.user_id === profile?.id);
  const [selected, setSelected] = useState<string[]>([]);
  const draftDates: string[] = myWeekoff ? myWeekoff.dates : selected;

  // Build calendar
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDay(year, month);

  // Team approved dates map: date → [names]
  const approvedMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const w of allWeekoffs) {
      if (w.status !== "approved") continue;
      for (const d of w.dates) {
        const name = (w.profiles as any)?.display_name ?? "Staff";
        map[d] = [...(map[d] ?? []), name];
      }
    }
    return map;
  }, [allWeekoffs]);

  function toggleDate(dateStr: string) {
    if (myWeekoff && myWeekoff.status !== "draft" && myWeekoff.status !== "rejected") return;
    setSelected((prev) => {
      if (prev.includes(dateStr)) return prev.filter((d) => d !== dateStr);
      if (prev.length >= MAX_DAYS) return prev;
      return [...prev, dateStr];
    });
  }

  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = { user_id: profile!.id, month: monthKey, dates: selected, status: "draft" as const, updated_at: new Date().toISOString() };
      if (myWeekoff) {
        const { error } = await supabase().from("monthly_weekoffs").update(payload).eq("id", myWeekoff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase().from("monthly_weekoffs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekoffs", monthKey] }),
  });

  const submitForApproval = useMutation({
    mutationFn: async () => {
      const dates = myWeekoff ? myWeekoff.dates : selected;
      if (dates.length === 0) throw new Error("Select at least 1 day");
      const payload = { status: "pending" as const, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (myWeekoff) {
        const { error } = await supabase().from("monthly_weekoffs").update(payload).eq("id", myWeekoff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase().from("monthly_weekoffs").insert({ ...payload, user_id: profile!.id, month: monthKey, dates: selected });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekoffs", monthKey] }); setSelected([]); },
  });

  const canEdit = !myWeekoff || myWeekoff.status === "draft" || myWeekoff.status === "rejected";
  const currentDates = myWeekoff?.dates ?? selected;

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Week-off Planning</h1>
          <p className="text-sm text-ink-dim mt-0.5">Pick your {MAX_DAYS} days off for the month and submit for approval.</p>
        </div>
        {isAdmin && (
          <a href="/admin/weekoffs" className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
            Manage Approvals
          </a>
        )}
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">‹</button>
        <span className="font-semibold text-ink min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">›</button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* My plan */}
        <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">My Week-offs</p>
            {myWeekoff && (
              <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[myWeekoff.status])}>
                {myWeekoff.status.charAt(0).toUpperCase() + myWeekoff.status.slice(1)}
              </span>
            )}
          </div>
          {myWeekoff?.review_note && myWeekoff.status === "rejected" && (
            <p className="text-xs text-err bg-err/5 rounded-lg2 px-3 py-2">Note: {myWeekoff.review_note}</p>
          )}

          {/* Calendar grid */}
          <div className="select-none">
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-[10px] text-ink-dim font-medium py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isMine = currentDates.includes(dateStr);
                const isSelected = selected.includes(dateStr);
                const isSunday = new Date(year, month, day).getDay() === 0;
                return (
                  <button
                    key={day}
                    onClick={() => canEdit && toggleDate(dateStr)}
                    disabled={!canEdit}
                    className={clsx(
                      "aspect-square flex items-center justify-center text-xs rounded-full transition-colors",
                      isMine && myWeekoff ? "bg-gold text-white font-bold" :
                      isSelected ? "bg-gold text-white font-bold" :
                      isSunday ? "text-err" : "hover:bg-canvas text-ink",
                      !canEdit && "cursor-default"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-ink-dim">
            {currentDates.length}/{MAX_DAYS} days selected
            {canEdit && currentDates.length < MAX_DAYS && ` — pick ${MAX_DAYS - currentDates.length} more`}
          </p>

          {canEdit && (
            <div className="flex gap-2">
              {selected.length > 0 && (
                <button
                  onClick={() => saveDraft.mutate()}
                  disabled={saveDraft.isPending}
                  className="border border-line text-xs px-3 py-1.5 rounded-lg2 text-ink-dim hover:border-gold"
                >
                  {saveDraft.isPending ? "Saving…" : "Save Draft"}
                </button>
              )}
              <button
                onClick={() => submitForApproval.mutate()}
                disabled={submitForApproval.isPending || currentDates.length === 0}
                className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-40 hover:opacity-90"
              >
                {submitForApproval.isPending ? "Submitting…" : "Submit for Approval"}
              </button>
            </div>
          )}
          {submitForApproval.isError && (
            <p className="text-xs text-err">{(submitForApproval.error as Error).message}</p>
          )}
        </div>

        {/* Team view */}
        <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
          <p className="text-sm font-semibold text-ink">Team Week-offs — {MONTHS[month]}</p>
          {allWeekoffs.filter(w => w.status === "approved").length === 0 ? (
            <p className="text-xs text-ink-dim">No approved week-offs yet for this month.</p>
          ) : (
            <div className="space-y-2">
              {allWeekoffs.filter(w => w.status === "approved").map((w) => (
                <div key={w.id} className="flex items-start gap-3 text-xs border-b border-line last:border-0 pb-2">
                  <span className="font-medium text-ink min-w-[100px]">{(w.profiles as any)?.display_name}</span>
                  <div className="flex flex-wrap gap-1">
                    {w.dates.sort().map((d) => (
                      <span key={d} className="bg-gold/10 text-gold px-1.5 py-0.5 rounded-full font-mono">
                        {new Date(d + "T00:00:00").getDate()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending submissions */}
          {allWeekoffs.filter(w => w.status === "pending").length > 0 && (
            <>
              <p className="text-xs font-medium text-warn mt-2">Pending approval:</p>
              {allWeekoffs.filter(w => w.status === "pending").map((w) => (
                <div key={w.id} className="text-xs text-ink-dim flex items-center gap-2">
                  <span>{(w.profiles as any)?.display_name}</span>
                  <span className="text-warn">— {w.dates.length} days pending</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
