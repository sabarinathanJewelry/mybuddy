"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { clsx } from "clsx";
import { shortDate } from "@/lib/format";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

interface Weekoff {
  id: string;
  user_id: string;
  month: string;
  dates: string[];
  status: "draft" | "pending" | "approved" | "rejected";
  submitted_at: string | null;
  review_note: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-ink-dim/10 text-ink-dim",
  pending:  "bg-warn/10 text-warn border-warn/30",
  approved: "bg-ok/10 text-ok border-ok/30",
  rejected: "bg-err/10 text-err border-err/30",
};

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function AdminWeekoffsPage() {
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed; admin defaults to current month
  const monthKey = getMonthKey(year, month);

  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [editId, setEditId]   = useState<string | null>(null);
  const [editDates, setEditDates] = useState<string[]>([]);

  const { data: weekoffs = [], isLoading } = useQuery<Weekoff[]>({
    queryKey: ["weekoffs_admin", monthKey],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("monthly_weekoffs")
        .select("id, user_id, month, dates, status, submitted_at, review_note")
        .eq("month", monthKey)
        .order("submitted_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Weekoff[];
    },
  });

  const today = new Date().toISOString().slice(0, 10);

  // Upcoming approved weekoffs (next 60 days across current + next month)
  const upcomingMonths = [monthKey, (() => {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  })()];
  const { data: upcomingWeekoffs = [] } = useQuery<Weekoff[]>({
    queryKey: ["weekoffs_upcoming", upcomingMonths.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("monthly_weekoffs")
        .select("id, user_id, month, dates, status, submitted_at, review_note")
        .in("month", upcomingMonths)
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []) as Weekoff[];
    },
  });

  // Flatten to individual date entries, filter to today+future, sort by date
  const upcomingEntries = upcomingWeekoffs
    .flatMap(w => (w.dates ?? []).map(d => ({ date: d, user_id: w.user_id })))
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  // All pending across every month — so admin never misses a request in another month
  const { data: allPending = [] } = useQuery<Weekoff[]>({
    queryKey: ["weekoffs_admin_pending_all"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("monthly_weekoffs")
        .select("id, user_id, month, dates, status, submitted_at, review_note")
        .eq("status", "pending")
        .order("submitted_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Weekoff[];
    },
  });

  const pendingOtherMonths = allPending.filter(w => w.month !== monthKey);

  const weekoffUserIds = [...new Set([...weekoffs, ...allPending].map(w => w.user_id))];
  const { data: profileNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["profiles_names", weekoffUserIds.join(",")],
    enabled: weekoffUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase()
        .from("profiles")
        .select("id, display_name")
        .in("id", weekoffUserIds);
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.display_name;
      return map;
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: "approved" | "rejected"; note?: string }) => {
      const { error } = await supabase().from("monthly_weekoffs").update({
        status,
        reviewed_by: profile!.id,
        reviewed_at: new Date().toISOString(),
        review_note: note ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekoffs_admin", monthKey] });
      qc.invalidateQueries({ queryKey: ["weekoffs_admin_pending_all"] });
    },
  });

  const editDraft = useMutation({
    mutationFn: async ({ id, dates }: { id: string; dates: string[] }) => {
      const { error } = await supabase().from("monthly_weekoffs").update({
        dates,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekoffs_admin", monthKey] });
      setEditId(null);
      setEditDates([]);
    },
  });

  if (profile?.role !== "admin") {
    return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;
  }

  const pending  = weekoffs.filter(w => w.status === "pending");
  const approved = weekoffs.filter(w => w.status === "approved");
  const others   = weekoffs.filter(w => w.status === "draft" || w.status === "rejected");

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function toggleEditDate(dateStr: string) {
    setEditDates(prev =>
      prev.includes(dateStr)
        ? prev.filter(d => d !== dateStr)
        : prev.length >= 3 ? prev : [...prev, dateStr]
    );
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function renderDates(dates: string[]) {
    return dates.sort().map(d => (
      <span key={d} className="bg-gold/10 text-gold font-mono text-xs px-1.5 py-0.5 rounded-full">
        {new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
      </span>
    ));
  }

  function WeekoffCard({ w }: { w: Weekoff }) {
    const name = profileNames[w.user_id] ?? "Staff";
    const isEditing = editId === w.id;
    return (
      <div className={clsx("bg-white rounded-xl border shadow-soft p-4 space-y-3", STATUS_COLORS[w.status])}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-ink text-sm">{name}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">{renderDates(w.dates)}</div>
            {w.submitted_at && (
              <p className="text-[11px] text-ink-dim mt-1">Submitted {shortDate(w.submitted_at)}</p>
            )}
            {w.review_note && (
              <p className="text-xs text-err mt-1">Note: {w.review_note}</p>
            )}
          </div>
          <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium shrink-0 border", STATUS_COLORS[w.status])}>
            {w.status.charAt(0).toUpperCase() + w.status.slice(1)}
          </span>
        </div>

        {/* Pending actions */}
        {w.status === "pending" && !isEditing && (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => review.mutate({ id: w.id, status: "approved" })}
                disabled={review.isPending}
                className="bg-ok text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  const note = rejectNote[w.id] || "";
                  review.mutate({ id: w.id, status: "rejected", note });
                }}
                disabled={review.isPending}
                className="bg-err text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => { setEditId(w.id); setEditDates([...w.dates]); }}
                className="border border-line text-xs px-3 py-1.5 rounded-lg2 text-ink-dim hover:border-gold"
              >
                Edit dates
              </button>
            </div>
            <input
              value={rejectNote[w.id] ?? ""}
              onChange={e => setRejectNote(prev => ({ ...prev, [w.id]: e.target.value }))}
              placeholder="Rejection reason (optional)"
              className={inp}
            />
          </div>
        )}

        {/* Approved — admin can still edit */}
        {w.status === "approved" && !isEditing && (
          <button
            onClick={() => { setEditId(w.id); setEditDates([...w.dates]); }}
            className="text-xs text-ink-dim hover:text-gold hover:underline"
          >
            Edit dates
          </button>
        )}

        {/* Inline date editor */}
        {isEditing && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-medium text-ink">Select up to 3 dates:</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const selected = editDates.includes(dateStr);
                return (
                  <button
                    key={day}
                    onClick={() => toggleEditDate(dateStr)}
                    className={clsx(
                      "aspect-square flex items-center justify-center text-xs rounded-full transition-colors",
                      selected ? "bg-gold text-white font-bold" : "hover:bg-canvas text-ink border border-line"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-dim">{editDates.length}/3 selected</p>
            <div className="flex gap-2">
              <button
                onClick={() => editDraft.mutate({ id: w.id, dates: editDates })}
                disabled={editDraft.isPending || editDates.length === 0}
                className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50"
              >
                {editDraft.isPending ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => { setEditId(null); setEditDates([]); }}
                className="border border-line text-xs px-3 py-1.5 rounded-lg2 text-ink-dim">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Week-off Approvals</h1>

      {/* Pending requests in other months */}
      {pendingOtherMonths.length > 0 && (
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-warn">
            {pendingOtherMonths.length} pending request{pendingOtherMonths.length !== 1 ? "s" : ""} in other month{pendingOtherMonths.length !== 1 ? "s" : ""}
          </p>
          <div className="space-y-1.5">
            {pendingOtherMonths.map(w => {
              const [y, m] = w.month.split("-").map(Number);
              const label = `${MONTHS[m - 1]} ${y}`;
              return (
                <div key={w.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">
                    <span className="font-medium">{profileNames[w.user_id] ?? "Staff"}</span>
                    <span className="text-ink-dim ml-1.5">— {label}</span>
                  </span>
                  <button
                    onClick={() => { setYear(y); setMonth(m - 1); }}
                    className="text-xs text-warn underline underline-offset-2 hover:text-err shrink-0"
                  >
                    Go to {label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming approved weekoff dates */}
      {upcomingEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line bg-gold/5 flex items-center justify-between">
            <p className="text-sm font-semibold text-gold">Upcoming Approved Week-offs</p>
            <p className="text-xs text-ink-dim">{upcomingEntries.length} day{upcomingEntries.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-line">
            {upcomingEntries.map((e, i) => {
              const d = new Date(e.date + "T00:00:00");
              const isToday = e.date === today;
              const dow = d.toLocaleDateString("en-IN", { weekday: "short" });
              const dLabel = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={i} className={`flex items-center justify-between px-4 py-2.5 text-sm ${isToday ? "bg-gold/5" : ""}`}>
                  <span className="font-medium text-ink">{profileNames[e.user_id] ?? "Staff"}</span>
                  <span className={`font-mono text-xs ${isToday ? "text-gold font-semibold" : "text-ink-dim"}`}>
                    {dow}, {dLabel}{isToday ? " — Today" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">‹</button>
        <span className="font-semibold text-ink min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">›</button>
      </div>

      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : weekoffs.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-line p-8 text-center text-ink-dim text-sm">
          No week-off submissions for {MONTHS[month]} {year}.
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-warn">{pending.length} Pending Approval</p>
              {pending.map(w => <WeekoffCard key={w.id} w={w} />)}
            </div>
          )}
          {approved.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ok">{approved.length} Approved</p>
              {approved.map(w => <WeekoffCard key={w.id} w={w} />)}
            </div>
          )}
          {others.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-ink-dim">Draft / Rejected</p>
              {others.map(w => <WeekoffCard key={w.id} w={w} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
