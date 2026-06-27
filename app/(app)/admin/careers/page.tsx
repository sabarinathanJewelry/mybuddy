"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// ── helpers ────────────────────────────────────────────────────────────────

const SECTIONS_MAP: Record<string, string> = {
  gold: "Gold", silver: "Silver", diamond: "Diamond",
  billing: "Billing", inventory: "Inventory", old_gold: "Old Gold Exchange",
};

const STATUS_OPTIONS = ["new", "reviewed", "shortlisted", "called", "hired", "rejected"] as const;
type AppStatus = typeof STATUS_OPTIONS[number];

const STATUS_STYLE: Record<AppStatus, string> = {
  new:         "bg-blue-50 text-blue-700 border-blue-200",
  reviewed:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  shortlisted: "bg-purple-50 text-purple-700 border-purple-200",
  called:      "bg-orange-50 text-orange-700 border-orange-200",
  hired:       "bg-green-50 text-green-700 border-green-200",
  rejected:    "bg-red-50 text-red-700 border-red-200",
};

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ── hooks ──────────────────────────────────────────────────────────────────

function usePositions() {
  return useQuery({
    queryKey: ["job_positions"],
    queryFn: async () => {
      const { data, error } = await supabase().from("job_positions").select("*").order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });
}

function useApplications() {
  return useQuery({
    queryKey: ["job_applications"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("job_applications").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

// ── Positions tab ──────────────────────────────────────────────────────────

function PositionsTab() {
  const qc = useQueryClient();
  const { data: positions = [], isLoading } = usePositions();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const origin = typeof window !== "undefined" ? window.location.origin : "https://mybuddy-inky.vercel.app";

  async function addPosition() {
    if (!name.trim()) { setErr("Position name is required."); return; }
    setErr(""); setAdding(true);
    const slug = slugify(name.trim());
    const { error } = await supabase().from("job_positions").insert({
      name: name.trim(), slug, description: desc.trim() || null,
    });
    setAdding(false);
    if (error) { setErr(error.message); return; }
    setName(""); setDesc("");
    qc.invalidateQueries({ queryKey: ["job_positions"] });
  }

  const toggleActive = useMutation({
    mutationFn: async ({ id, val }: { id: string; val: boolean }) => {
      await supabase().from("job_positions").update({ is_active: val }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job_positions"] }),
  });

  const inp = "border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-full";

  return (
    <div className="space-y-5">
      {/* Add position form */}
      <div className="bg-canvas border border-line rounded-lg2 shadow-soft p-4 space-y-3">
        <p className="text-sm font-semibold text-ink">Add New Position</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Position Name</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Accountant" onKeyDown={e => e.key === "Enter" && addPosition()} />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Description (optional)</label>
            <input className={inp} value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Brief role description" />
          </div>
        </div>
        {name.trim() && (
          <p className="text-xs text-ink-dim">
            Apply link: <span className="text-gold font-mono">{origin}/apply/{slugify(name.trim())}</span>
          </p>
        )}
        {err && <p className="text-xs text-err">{err}</p>}
        <button onClick={addPosition} disabled={adding}
          className="text-sm bg-gold text-white px-4 py-1.5 rounded-lg2 hover:opacity-90 disabled:opacity-50">
          {adding ? "Adding…" : "+ Add Position"}
        </button>
      </div>

      {/* Positions list */}
      {isLoading && <p className="text-sm text-ink-dim">Loading…</p>}
      <div className="space-y-3">
        {positions.map((p: any) => {
          const link = `${origin}/apply/${p.slug}`;
          return (
            <div key={p.id} className="bg-canvas border border-line rounded-lg2 shadow-soft p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink text-sm">{p.name}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${p.is_active ? "bg-ok/10 text-ok border-ok/30" : "bg-err/10 text-err border-err/30"}`}>
                      {p.is_active ? "Active" : "Closed"}
                    </span>
                  </div>
                  {p.description && <p className="text-xs text-ink-dim mt-0.5">{p.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <code className="text-xs text-gold font-mono bg-gold/5 px-2 py-0.5 rounded truncate max-w-xs">{link}</code>
                    <button onClick={() => navigator.clipboard.writeText(link)}
                      className="text-xs border border-line px-2 py-0.5 rounded-lg2 hover:border-gold hover:text-gold transition-colors shrink-0">
                      Copy
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive.mutate({ id: p.id, val: !p.is_active })}
                  className={`text-xs px-3 py-1.5 rounded-lg2 border shrink-0 ${p.is_active ? "border-err/30 text-err hover:bg-err/5" : "border-ok/30 text-ok hover:bg-ok/5"}`}>
                  {p.is_active ? "Close" : "Reopen"}
                </button>
              </div>
            </div>
          );
        })}
        {!isLoading && positions.length === 0 && (
          <p className="text-sm text-ink-dim text-center py-8">No positions yet. Add one above.</p>
        )}
      </div>
    </div>
  );
}

// ── Application row ────────────────────────────────────────────────────────

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
    mutationFn: async (status: AppStatus) => {
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

  const status: AppStatus = app.status ?? "new";
  const applied = new Date(app.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="bg-canvas border border-line rounded-lg2 shadow-soft overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gold/5 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink text-sm">{app.full_name}</p>
          <p className="text-xs text-ink-dim mt-0.5">
            {app.mobile}
            {app.position_name && <> · <span className="text-gold">{app.position_name}</span></>}
            {app.current_designation && <> · {app.current_designation}</>}
            {app.jewellery_experience && <> · {app.jewellery_experience} exp</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-ink-dim hidden sm:block">{applied}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize border ${STATUS_STYLE[status]}`}>
            {status}
          </span>
          <span className="text-ink-dim text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-1 space-y-6 border-t border-line">
          {app.position_name && (
            <p className="text-xs font-semibold text-gold pt-1">Position: {app.position_name}</p>
          )}

          {/* Status */}
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => updateStatus.mutate(s)}
                disabled={updateStatus.isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full capitalize transition-all border
                  ${status === s ? STATUS_STYLE[s] + " ring-2 ring-offset-1 ring-current" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
                {s}
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Personal</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" value={app.full_name} />
              <Field label="Age" value={app.age} />
              <Field label="Mobile" value={app.mobile} />
              <Field label="Address" value={app.address} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Employment</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company" value={app.current_company} />
              <Field label="Experience" value={app.jewellery_experience} />
              <Field label="Designation" value={app.current_designation} />
              <Field label="Current Salary" value={app.current_salary} />
              <Field label="Incentive" value={app.incentive} />
              <Field label="Notice Period" value={app.notice_period} />
            </div>
            <div className="mt-3"><Field label="Reason for Leaving" value={app.reason_leaving} /></div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Jewellery Knowledge</p>
            {app.sections_worked?.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(app.sections_worked as string[]).map(s => (
                  <span key={s} className="text-xs bg-gold/10 text-gold px-2 py-0.5 rounded-full font-medium">
                    {SECTIONS_MAP[s] ?? s}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <Field label="Daily Responsibilities" value={app.daily_responsibilities} />
              <Field label="Biggest Achievement" value={app.biggest_achievement} />
              <Field label="Skills to Improve" value={app.skills_to_improve} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Customer Handling</p>
            <div className="grid grid-cols-1 gap-3">
              <Field label="High Making Charges" value={app.handle_making_charges} />
              <Field label="Angry Customer" value={app.handle_angry_customer} />
              <Field label="Old Gold Exchange" value={app.old_gold_experience} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Salary & Career</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected Salary" value={app.expected_salary} />
              <Field label="Stay if Raised" value={app.stay_if_raised} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3">
              <Field label="Salary Justification" value={app.salary_justification} />
              <Field label="Explanation (maybe)" value={app.stay_explanation} />
              <Field label="Career Vision" value={app.career_vision} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-3">Integrity</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Disciplinary Action" value={app.disciplinary_action} />
              <Field label="Extended Hours" value={app.willing_extended_hours} />
            </div>
            <div className="mt-3"><Field label="Additional Info" value={app.additional_info} /></div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-widest text-ink-dim uppercase mb-2">Admin Notes</p>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Interview notes, remarks…"
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

// ── Applications tab ───────────────────────────────────────────────────────

function ApplicationsTab() {
  const { data: positions = [] } = usePositions();
  const { data = [], isLoading } = useApplications();
  const [filterStatus, setFilterStatus] = useState<AppStatus | "all">("all");
  const [filterPosition, setFilterPosition] = useState<string>("all");

  let filtered = data;
  if (filterPosition !== "all") filtered = filtered.filter((a: any) => a.position_slug === filterPosition);
  if (filterStatus !== "all") filtered = filtered.filter((a: any) => a.status === filterStatus);

  const counts: Record<string, number> = {};
  for (const a of data) counts[a.status] = (counts[a.status] ?? 0) + 1;

  return (
    <div className="space-y-4">
      {/* Position filter */}
      {positions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterPosition("all")}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterPosition === "all" ? "bg-ink text-white border-ink" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
            All Positions
          </button>
          {positions.map((p: any) => (
            <button key={p.slug} onClick={() => setFilterPosition(p.slug)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterPosition === p.slug ? "bg-gold/10 text-gold border-gold/40" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterStatus("all")}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${filterStatus === "all" ? "bg-ink text-white border-ink" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
          All ({data.length})
        </button>
        {STATUS_OPTIONS.map(s => counts[s] ? (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-full capitalize border font-medium transition-colors ${filterStatus === s ? STATUS_STYLE[s] + " ring-2 ring-offset-1 ring-current" : "bg-canvas border-line text-ink-dim hover:border-gold"}`}>
            {s} ({counts[s]})
          </button>
        ) : null)}
      </div>

      {isLoading && <p className="text-sm text-ink-dim">Loading…</p>}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-ink-dim">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm">No applications match the selected filters.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((app: any) => <ApplicationRow key={app.id} app={app} />)}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function CareersPage() {
  const [tab, setTab] = useState<"positions" | "applications">("positions");
  const { data: applications = [] } = useApplications();
  const newCount = applications.filter((a: any) => a.status === "new").length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-ink">Recruitment</h1>

      <div className="flex border-b border-line gap-1">
        {([
          { key: "positions",    label: "Positions" },
          { key: "applications", label: `Applications${newCount ? ` (${newCount} new)` : ""}` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "positions"    && <PositionsTab />}
      {tab === "applications" && <ApplicationsTab />}
    </div>
  );
}
