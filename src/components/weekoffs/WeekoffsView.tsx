"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useMyMonthlyLeaveCount } from "@/modules/attendance/api";
import { clsx } from "clsx";
import { shortDate } from "@/lib/format";

const BASE_MAX_DAYS = 3;
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
  submitted_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-ink-dim/10 text-ink-dim",
  pending:  "bg-warn/10 text-warn",
  approved: "bg-ok/10 text-ok",
  rejected: "bg-err/10 text-err",
};

async function sendPush(user_ids: string[], title: string, body: string) {
  try {
    await supabase().functions.invoke("send-notification", {
      body: { user_ids, title, body },
    });
  } catch {
    // non-fatal — approval still succeeded
  }
}

export default function WeekoffsView() {
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();
  const isAdmin = profile?.role === "admin";

  const now = new Date();
  const [year, setYear]   = useState(now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() === 11 ? 0 : now.getMonth() + 1);
  const monthKey = getMonthKey(year, month);

  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});

  const { data: allWeekoffs = [], error: weekoffsError } = useQuery<Weekoff[]>({
    queryKey: ["weekoffs", monthKey],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("monthly_weekoffs")
        .select("id, user_id, month, dates, status, review_note, submitted_at")
        .eq("month", monthKey)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Weekoff[];
    },
  });

  const userIds = [...new Set(allWeekoffs.map(w => w.user_id))];
  const { data: profileNames = {} } = useQuery<Record<string, string>>({
    queryKey: ["profiles_names", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase()
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.display_name;
      return map;
    },
  });

  const { data: leaveCount = 0 } = useMyMonthlyLeaveCount(monthKey);
  const maxDays = Math.max(0, BASE_MAX_DAYS - leaveCount);

  const myWeekoff = allWeekoffs.find((w) => w.user_id === profile?.id);
  const [selected, setSelected] = useState<string[]>([]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay    = getFirstDay(year, month);

  const approvedMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const w of allWeekoffs) {
      if (w.status !== "approved") continue;
      for (const d of w.dates) {
        const name = profileNames[w.user_id] ?? "Staff";
        map[d] = [...(map[d] ?? []), name];
      }
    }
    return map;
  }, [allWeekoffs, profileNames]);

  function toggleDate(dateStr: string) {
    if (myWeekoff && myWeekoff.status !== "draft" && myWeekoff.status !== "rejected") return;
    setSelected((prev) => {
      if (prev.includes(dateStr)) return prev.filter((d) => d !== dateStr);
      if (prev.length >= maxDays) return prev;
      return [...prev, dateStr];
    });
  }

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Not logged in");
      const payload = { user_id: profile.id, month: monthKey, dates: selected, status: "draft" as const, updated_at: new Date().toISOString() };
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
      if (!profile?.id) throw new Error("Not logged in");
      const dates = myWeekoff ? myWeekoff.dates : selected;
      if (dates.length === 0) throw new Error("Select at least 1 day");
      const payload = { status: "pending" as const, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      if (myWeekoff) {
        const { error } = await supabase().from("monthly_weekoffs").update(payload).eq("id", myWeekoff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase().from("monthly_weekoffs").insert({ ...payload, user_id: profile.id, month: monthKey, dates: selected });
        if (error) throw error;
      }
      // Notify all admins
      const { data: admins } = await supabase().from("profiles").select("id").eq("role", "admin");
      if (admins?.length) {
        await sendPush(
          admins.map((a: any) => a.id),
          "Week-off Request",
          `${profile.display_name ?? "Staff"} has requested week-offs for ${MONTHS[month]} ${year}.`
        );
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["weekoffs", monthKey] }); setSelected([]); },
  });

  const reviewWeekoff = useMutation({
    mutationFn: async ({ id, status, note, staffUserId, staffName }: {
      id: string;
      status: "approved" | "rejected";
      note?: string;
      staffUserId: string;
      staffName: string;
    }) => {
      const { error } = await supabase().from("monthly_weekoffs").update({
        status,
        reviewed_by: profile!.id,
        reviewed_at: new Date().toISOString(),
        review_note: note ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      // Notify the staff member
      const label = status === "approved" ? "Approved" : "Rejected";
      await sendPush(
        [staffUserId],
        `Week-off ${label}`,
        `Your week-off request for ${MONTHS[month]} ${year} has been ${status}.${note ? ` Note: ${note}` : ""}`
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekoffs", monthKey] });
      setRejectNote({});
    },
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

  if (weekoffsError) {
    return (
      <div className="max-w-xl mx-auto mt-10 bg-err/10 border border-err/30 rounded-xl p-6 text-sm text-err">
        <p className="font-semibold mb-1">Week-offs table not set up yet</p>
        <p className="text-ink-dim">Ask admin to run migration 095 in the Supabase SQL Editor.</p>
        <p className="font-mono text-xs mt-2 text-err/70">{(weekoffsError as Error).message}</p>
      </div>
    );
  }

  const pendingWeekoffs  = allWeekoffs.filter(w => w.status === "pending");
  const approvedWeekoffs = allWeekoffs.filter(w => w.status === "approved" && w.user_id !== profile?.id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Week-off Planning</h1>
          <p className="text-sm text-ink-dim mt-0.5">
            Pick your {maxDays} day{maxDays !== 1 ? "s" : ""} off for the month and submit for approval.
            {leaveCount > 0 && (
              <span className="ml-1 text-warn">({leaveCount} absent day{leaveCount > 1 ? "s" : ""} this month — {Math.max(0, BASE_MAX_DAYS - leaveCount)} of {BASE_MAX_DAYS} remaining)</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={prevMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">‹</button>
        <span className="font-semibold text-ink min-w-[140px] text-center">{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">›</button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: My Week-offs */}
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
                const isMine = myWeekoff ? myWeekoff.dates.includes(dateStr) : selected.includes(dateStr);
                const isSunday = new Date(year, month, day).getDay() === 0;
                return (
                  <button
                    key={day}
                    onClick={() => canEdit && toggleDate(dateStr)}
                    disabled={!canEdit}
                    className={clsx(
                      "aspect-square flex items-center justify-center text-xs rounded-full transition-colors",
                      isMine ? "bg-gold text-white font-bold" :
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
            {currentDates.length}/{maxDays} days selected
            {canEdit && currentDates.length < maxDays && ` — pick ${maxDays - currentDates.length} more`}
            {maxDays === 0 && <span className="text-warn ml-1">No weekoffs available this month due to leaves taken.</span>}
          </p>

          {canEdit && (
            <div className="flex gap-2 flex-wrap">
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
                disabled={submitForApproval.isPending || currentDates.length === 0 || maxDays === 0}
                className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-40 hover:opacity-90"
              >
                {submitForApproval.isPending ? "Submitting…" : "Submit for Approval"}
              </button>
            </div>
          )}
          {saveDraft.isError && (
            <p className="text-xs text-err">{(saveDraft.error as Error).message}</p>
          )}
          {submitForApproval.isError && (
            <p className="text-xs text-err">{(submitForApproval.error as Error).message}</p>
          )}
          {(saveDraft.isSuccess || submitForApproval.isSuccess) && (
            <p className="text-xs text-ok">Saved!</p>
          )}
        </div>

        {/* Right: Admin — Pending Approvals + Team view | Staff — Team view */}
        <div className="space-y-4">
          {/* Admin: Pending approvals */}
          {isAdmin && pendingWeekoffs.length > 0 && (
            <div className="bg-white rounded-xl border border-warn/30 shadow-soft p-4 space-y-3">
              <p className="text-sm font-semibold text-warn">{pendingWeekoffs.length} Pending Approval</p>
              {pendingWeekoffs.map((w) => {
                const name = profileNames[w.user_id] ?? "Staff";
                return (
                  <div key={w.id} className="border border-line rounded-lg2 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">{name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {w.dates.sort().map(d => (
                            <span key={d} className="bg-gold/10 text-gold text-xs px-1.5 py-0.5 rounded-full font-mono">
                              {new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </span>
                          ))}
                        </div>
                        {w.submitted_at && (
                          <p className="text-[11px] text-ink-dim mt-1">Submitted {shortDate(w.submitted_at)}</p>
                        )}
                      </div>
                    </div>
                    <input
                      value={rejectNote[w.id] ?? ""}
                      onChange={e => setRejectNote(prev => ({ ...prev, [w.id]: e.target.value }))}
                      placeholder="Rejection reason (optional)"
                      className="w-full border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => reviewWeekoff.mutate({ id: w.id, status: "approved", staffUserId: w.user_id, staffName: name })}
                        disabled={reviewWeekoff.isPending}
                        className="bg-ok text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reviewWeekoff.mutate({ id: w.id, status: "rejected", note: rejectNote[w.id], staffUserId: w.user_id, staffName: name })}
                        disabled={reviewWeekoff.isPending}
                        className="bg-err text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Team approved week-offs */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Team Week-offs — {MONTHS[month]}</p>
            {allWeekoffs.filter(w => w.status === "approved").length === 0 ? (
              <p className="text-xs text-ink-dim">No approved week-offs yet for this month.</p>
            ) : (
              <div className="space-y-2">
                {allWeekoffs.filter(w => w.status === "approved").map((w) => (
                  <div key={w.id} className="flex items-start gap-3 text-xs border-b border-line last:border-0 pb-2">
                    <span className="font-medium text-ink min-w-[100px]">{profileNames[w.user_id] ?? "Staff"}</span>
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
            {allWeekoffs.filter(w => w.status === "pending" && w.user_id !== profile?.id).length > 0 && (
              <>
                <p className="text-xs font-medium text-warn mt-2">Pending approval:</p>
                {allWeekoffs.filter(w => w.status === "pending" && w.user_id !== profile?.id).map((w) => (
                  <div key={w.id} className="text-xs text-ink-dim flex items-center gap-2">
                    <span>{profileNames[w.user_id] ?? "Staff"}</span>
                    <span className="text-warn">— {w.dates.length} days pending</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
