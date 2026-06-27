"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

const SECTIONS_LIST: Record<string, string> = {
  gold: "Gold", silver: "Silver", diamond: "Diamond",
  billing: "Billing", inventory: "Inventory", old_gold: "Old Gold Exchange",
};

const STATUS_OPTIONS = ["new", "reviewed", "shortlisted", "called", "hired", "rejected"] as const;
type Status = typeof STATUS_OPTIONS[number];

const STATUS_STYLE: Record<Status, string> = {
  new:         "bg-blue-50 text-blue-700 border border-blue-200",
  reviewed:    "bg-yellow-50 text-yellow-700 border border-yellow-200",
  shortlisted: "bg-purple-50 text-purple-700 border border-purple-200",
  called:      "bg-orange-50 text-orange-700 border border-orange-200",
  hired:       "bg-green-50 text-green-700 border border-green-200",
  rejected:    "bg-red-50 text-red-700 border border-red-200",
};

function useApplications() {
  return useQuery({
    queryKey: ["job_applications"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("job_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value == null || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold text-ink-dim uppercase tracking-wide">{label}</p>
      <p className="text-sm text-ink whitespace-pre-wrap">{display}</p>
    </div>
  );
}

function ApplicationRow({ app }: { app: any }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(app.admin_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const updateStatus = useMutation({
    mutationFn: async (status: Status) => {
      const { error } = await supabase().from("job_applications").update({ status }).eq("id", app.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_applications"] }),
  });

  async function saveNotes() {
    setSavingNotes(true);
    await supabase().from("job_applications").update({ admin_notes: notes }).eq("id", app.id);
    setSavingNotes(false);
    qc.invalidateQueries({ queryKey: ["job_applications"] });
  }

  const status: Status = app.status ?? "new";
  const applied = new Date(app.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="bg-canvas border border-line rounded-lg2 shadow-soft overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gold/5 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink text-sm">{app.full_name}</p>
          <p className="text-xs text-ink-dim mt-0.5">
            {app.mobile} · {app.current_designation || "—"} · {app.jewellery_experience || "—"} exp
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-ink-dim">{applied}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[status]}`}>
            {status}
          </span>
          <span className="text-ink-dim text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-1 space-y-6 border-t border-line">

          {/* Status buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => updateStatus.mutate(s)}
                disabled={updateStatus.isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full capitalize transition-all border
                  ${status === s ? STATUS_STYLE[s] + " ring-2 ring-offset-1 ring-current" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
                {s}
              </button>
            ))}
          </div>

          {/* Personal */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Personal Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name" value={app.full_name} />
              <Field label="Age" value={app.age} />
              <Field label="Mobile" value={app.mobile} />
              <Field label="Address" value={app.address} />
            </div>
          </div>

          {/* Employment */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Current Employment</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current Company" value={app.current_company} />
              <Field label="Jewellery Experience" value={app.jewellery_experience} />
              <Field label="Designation" value={app.current_designation} />
              <Field label="Current Salary" value={app.current_salary} />
              <Field label="Incentive" value={app.incentive} />
              <Field label="Notice Period" value={app.notice_period} />
            </div>
            <div className="mt-3">
              <Field label="Reason for Leaving" value={app.reason_leaving} />
            </div>
          </div>

          {/* Jewellery Knowledge */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Jewellery Knowledge</p>
            {app.sections_worked?.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-ink-dim uppercase tracking-wide mb-1">Sections Worked</p>
                <div className="flex flex-wrap gap-1.5">
                  {(app.sections_worked as string[]).map(s => (
                    <span key={s} className="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium">
                      {SECTIONS_LIST[s] ?? s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <Field label="Daily Responsibilities" value={app.daily_responsibilities} />
              <Field label="Biggest Achievement" value={app.biggest_achievement} />
              <Field label="Skills to Improve" value={app.skills_to_improve} />
            </div>
          </div>

          {/* Customer Handling */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Customer Handling</p>
            <div className="grid grid-cols-1 gap-3">
              <Field label="Handling High Making Charges" value={app.handle_making_charges} />
              <Field label="Handling Angry Customer" value={app.handle_angry_customer} />
              <Field label="Old Gold Exchange Experience" value={app.old_gold_experience} />
            </div>
          </div>

          {/* Salary & Career */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Salary & Career</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected Salary" value={app.expected_salary} />
              <Field label="Stay if Salary Raised" value={app.stay_if_raised} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <Field label="Salary Justification" value={app.salary_justification} />
              <Field label="Explanation (if maybe)" value={app.stay_explanation} />
              <Field label="Career Vision (3 years)" value={app.career_vision} />
            </div>
          </div>

          {/* Integrity */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Integrity & Commitment</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Disciplinary Action at Work" value={app.disciplinary_action} />
              <Field label="Willing for Extended Hours" value={app.willing_extended_hours} />
            </div>
            <div className="mt-3">
              <Field label="Additional Info" value={app.additional_info} />
            </div>
          </div>

          {/* Admin Notes */}
          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-2">Admin Notes</p>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add interview notes, remarks…"
              className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold resize-none" />
            <button onClick={saveNotes} disabled={savingNotes}
              className="mt-1.5 text-xs bg-gold/10 text-gold border border-gold/30 px-3 py-1.5 rounded-lg2 hover:bg-gold/20 disabled:opacity-50">
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CareersPage() {
  const { data = [], isLoading } = useApplications();
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");

  const link = typeof window !== "undefined"
    ? `${window.location.origin}/apply`
    : "/apply";

  const filtered = filterStatus === "all" ? data : data.filter((a: any) => a.status === filterStatus);

  const counts: Record<string, number> = {};
  for (const a of data) counts[a.status] = (counts[a.status] ?? 0) + 1;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-ink">Job Applications</h1>
        <span className="text-xs text-ink-dim bg-canvas border border-line px-2 py-0.5 rounded-full">{data.length} total</span>
      </div>

      {/* Share link */}
      <div className="bg-canvas border border-line rounded-lg2 p-4 space-y-2">
        <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Application Form Link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-gray-50 border border-line rounded-lg px-3 py-2 text-gold truncate">{link}</code>
          <button
            onClick={() => navigator.clipboard.writeText(link)}
            className="text-xs border border-line px-3 py-2 rounded-lg2 hover:border-gold hover:text-gold transition-colors shrink-0">
            Copy
          </button>
        </div>
        <p className="text-xs text-ink-dim">Share this link with candidates. No login required.</p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterStatus("all")}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterStatus === "all" ? "bg-ink text-white border-ink" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
          All ({data.length})
        </button>
        {STATUS_OPTIONS.map(s => counts[s] ? (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium capitalize transition-colors ${filterStatus === s ? STATUS_STYLE[s] + " ring-2 ring-offset-1 ring-current" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
            {s} ({counts[s]})
          </button>
        ) : null)}
      </div>

      {isLoading && <p className="text-sm text-ink-dim">Loading applications…</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-ink-dim">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm">{filterStatus === "all" ? "No applications yet. Share the link to get started." : `No ${filterStatus} applications.`}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((app: any) => (
          <ApplicationRow key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}
