"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useAuth } from "@/stores/auth";
import { shortDate } from "@/lib/format";

interface Section {
  id: number;
  name: string;
  sort_order: number;
  active: boolean;
}

interface LogItem {
  id: string;
  tag_id: string;
  product_name: string | null;
  section_id: number | null;
  shoot_date: string;
  status: "planned" | "out" | "returned" | "skipped";
  checked_out_at: string | null;
  checked_in_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function fmtTime(ts: string | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function duration(out: string | null, inn: string | null) {
  if (!out || !inn) return "";
  const mins = Math.round((new Date(inn).getTime() - new Date(out).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PhotoShootPage() {
  const qc = useQueryClient();
  const globalDate = useGlobalDate((s) => s.date);
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin";

  const [tab, setTab] = useState<"log" | "pipeline" | "history" | "sections">("log");

  // Checkout form
  const [tagId, setTagId] = useState("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [productName, setProductName] = useState("");
  const tagRef = useRef<HTMLInputElement>(null);

  // Pipeline form
  const [showPipeForm, setShowPipeForm] = useState(false);
  const [pTag, setPTag] = useState("");
  const [pSection, setPSection] = useState<number | "">("");
  const [pName, setPName] = useState("");
  const [pDate, setPDate] = useState("");

  // History
  const [histDate, setHistDate] = useState(globalDate);

  // Sections
  const [newSecName, setNewSecName] = useState("");
  const [editingSec, setEditingSec] = useState<Section | null>(null);

  // ── Queries ──────────────────────────────────────────────────

  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ["photo_sections"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("photo_sections")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeSections = sections.filter((s) => s.active);

  function secName(id: number | null) {
    if (!id) return "";
    return sections.find((s) => s.id === id)?.name ?? "";
  }

  const { data: todayItems = [], isLoading: todayLoading } = useQuery<LogItem[]>({
    queryKey: ["photo_log", globalDate],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("photo_shoot_log")
        .select("*")
        .eq("shoot_date", globalDate)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pipeline = [] } = useQuery<LogItem[]>({
    queryKey: ["photo_pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("photo_shoot_log")
        .select("*")
        .eq("status", "planned")
        .gt("shoot_date", globalDate)
        .order("shoot_date")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: tab === "pipeline",
  });

  const { data: histItems = [], isLoading: histLoading } = useQuery<LogItem[]>({
    queryKey: ["photo_history", histDate],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("photo_shoot_log")
        .select("*")
        .eq("shoot_date", histDate)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    enabled: tab === "history",
  });

  // ── Mutations ─────────────────────────────────────────────────

  const checkout = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase().auth.getUser();
      const { error } = await supabase().from("photo_shoot_log").insert({
        tag_id: tagId.trim().toUpperCase(),
        product_name: productName.trim() || null,
        section_id: sectionId || null,
        shoot_date: globalDate,
        status: "out",
        checked_out_at: new Date().toISOString(),
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo_log", globalDate] });
      setTagId("");
      setProductName("");
      tagRef.current?.focus();
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LogItem["status"] }) => {
      const patch: Partial<LogItem> = { status };
      if (status === "out") patch.checked_out_at = new Date().toISOString();
      if (status === "returned") patch.checked_in_at = new Date().toISOString();
      const { error } = await supabase().from("photo_shoot_log").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photo_log", globalDate] }),
  });

  const addPipeline = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase().auth.getUser();
      const { error } = await supabase().from("photo_shoot_log").insert({
        tag_id: pTag.trim().toUpperCase(),
        product_name: pName.trim() || null,
        section_id: pSection || null,
        shoot_date: pDate,
        status: "planned",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo_pipeline"] });
      setPTag(""); setPSection(""); setPName(""); setPDate("");
      setShowPipeForm(false);
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("photo_shoot_log").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo_log", globalDate] });
      qc.invalidateQueries({ queryKey: ["photo_pipeline"] });
    },
  });

  const saveSection = useMutation({
    mutationFn: async ({ id, name }: { id?: number; name: string }) => {
      if (id) {
        const { error } = await supabase().from("photo_sections").update({ name }).eq("id", id);
        if (error) throw error;
      } else {
        const maxOrder = sections.length ? Math.max(...sections.map((s) => s.sort_order)) : 0;
        const { error } = await supabase()
          .from("photo_sections")
          .insert({ name, sort_order: maxOrder + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo_sections"] });
      setNewSecName("");
      setEditingSec(null);
    },
  });

  const toggleSection = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const { error } = await supabase().from("photo_sections").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photo_sections"] }),
  });

  // ── Derived ───────────────────────────────────────────────────

  const planned  = todayItems.filter((i) => i.status === "planned");
  const out      = todayItems.filter((i) => i.status === "out");
  const returned = todayItems.filter((i) => i.status === "returned");

  const pipelineByDate: Record<string, LogItem[]> = {};
  for (const item of pipeline) {
    (pipelineByDate[item.shoot_date] ??= []).push(item);
  }

  const tabs = ["log", "pipeline", "history", ...(isAdmin ? ["sections"] : [])] as const;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">Photo Shoot Tracker</h1>
        <p className="text-sm text-ink-dim mt-0.5">{globalDate}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as typeof tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}
          >
            {t === "log" ? "Today" : t}
          </button>
        ))}
      </div>

      {/* ═══ LOG / TODAY ═══ */}
      {tab === "log" && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Planned", val: planned.length, color: "text-warn" },
              { label: "Out Now",  val: out.length,     color: "text-err"  },
              { label: "Returned", val: returned.length, color: "text-ok"  },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className="text-xs text-ink-dim mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              </div>
            ))}
          </div>

          {/* Checkout form */}
          <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Check Out Item</p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <input
                ref={tagRef}
                value={tagId}
                onChange={(e) => setTagId(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter" && tagId.trim()) checkout.mutate(); }}
                placeholder="Tag ID"
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold font-mono col-span-2 sm:w-32"
              />
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold flex-1 min-w-[130px]"
              >
                <option value="">Section…</option>
                {activeSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Name (optional)"
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold flex-1 min-w-[110px]"
              />
              <button
                onClick={() => checkout.mutate()}
                disabled={!tagId.trim() || checkout.isPending}
                className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-40 col-span-2 sm:col-auto"
              >
                Check Out
              </button>
            </div>
          </div>

          {/* Planned for today */}
          {planned.length > 0 && (
            <ItemGroup
              title={`Planned for Today (${planned.length})`}
              headerClass="bg-warn/10"
              titleClass="text-warn"
            >
              {planned.map((item) => (
                <ItemRow key={item.id} item={item} secName={secName(item.section_id)}>
                  <button
                    onClick={() => setStatus.mutate({ id: item.id, status: "out" })}
                    className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 shrink-0"
                  >
                    Check Out
                  </button>
                  <button
                    onClick={() => setStatus.mutate({ id: item.id, status: "skipped" })}
                    className="text-xs border border-line text-ink-dim px-3 py-1.5 rounded-lg2 shrink-0"
                  >
                    Skip
                  </button>
                </ItemRow>
              ))}
            </ItemGroup>
          )}

          {/* Currently Out */}
          {out.length > 0 && (
            <ItemGroup
              title={`Currently Out (${out.length})`}
              headerClass="bg-err/10"
              titleClass="text-err"
            >
              {out.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  secName={secName(item.section_id)}
                  sub={item.checked_out_at ? `out at ${fmtTime(item.checked_out_at)}` : undefined}
                >
                  <button
                    onClick={() => setStatus.mutate({ id: item.id, status: "returned" })}
                    className="text-xs bg-ok text-white px-3 py-1.5 rounded-lg2 shrink-0"
                  >
                    Return
                  </button>
                </ItemRow>
              ))}
            </ItemGroup>
          )}

          {/* Returned today */}
          {returned.length > 0 && (
            <ItemGroup
              title={`Returned Today (${returned.length})`}
              headerClass="bg-ok/10"
              titleClass="text-ok"
            >
              {returned.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  secName={secName(item.section_id)}
                  sub={
                    item.checked_out_at && item.checked_in_at
                      ? `${fmtTime(item.checked_out_at)} → ${fmtTime(item.checked_in_at)} · ${duration(item.checked_out_at, item.checked_in_at)}`
                      : undefined
                  }
                >
                  <span className="text-ok text-sm">✓</span>
                  {isAdmin && (
                    <button
                      onClick={() => removeItem.mutate(item.id)}
                      className="text-xs text-err hover:underline shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </ItemRow>
              ))}
            </ItemGroup>
          )}

          {!todayLoading && todayItems.length === 0 && (
            <p className="text-center text-ink-dim text-sm py-8">
              No items logged today. Use the form above to check out an item.
            </p>
          )}
        </div>
      )}

      {/* ═══ PIPELINE ═══ */}
      {tab === "pipeline" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowPipeForm(!showPipeForm)}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2"
            >
              + Plan Items
            </button>
          </div>

          {showPipeForm && (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Add to Pipeline</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Tag ID</label>
                  <input
                    value={pTag}
                    onChange={(e) => setPTag(e.target.value.toUpperCase())}
                    placeholder="e.g. G1234"
                    className={`${inp} font-mono`}
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Section</label>
                  <select
                    value={pSection}
                    onChange={(e) => setPSection(e.target.value ? Number(e.target.value) : "")}
                    className={inp}
                  >
                    <option value="">Select section…</option>
                    {activeSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Product Name</label>
                  <input
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="Optional"
                    className={inp}
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Planned Date</label>
                  <input
                    type="date"
                    value={pDate}
                    onChange={(e) => setPDate(e.target.value)}
                    className={inp}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addPipeline.mutate()}
                  disabled={!pTag.trim() || !pDate || addPipeline.isPending}
                  className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-40"
                >
                  Add to Pipeline
                </button>
                <button
                  onClick={() => setShowPipeForm(false)}
                  className="border border-line text-sm px-4 py-2 rounded-lg2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {Object.keys(pipelineByDate).length === 0 ? (
            <p className="text-center text-ink-dim text-sm py-8">No upcoming shoots planned.</p>
          ) : (
            Object.entries(pipelineByDate).map(([date, items]) => (
              <div key={date} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
                <div className="bg-canvas px-4 py-2.5 border-b border-line flex items-center justify-between">
                  <p className="text-xs font-semibold text-ink uppercase tracking-wide">{shortDate(date)}</p>
                  <span className="text-xs text-ink-dim">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="divide-y divide-line">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-medium">{item.tag_id}</p>
                        <p className="text-xs text-ink-dim">
                          {secName(item.section_id) || "No section"}
                          {item.product_name && ` · ${item.product_name}`}
                        </p>
                      </div>
                      <button
                        onClick={() => removeItem.mutate(item.id)}
                        className="text-xs text-err hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ HISTORY ═══ */}
      {tab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-ink-dim shrink-0">Date:</label>
            <input
              type="date"
              value={histDate}
              max={globalDate}
              onChange={(e) => setHistDate(e.target.value)}
              className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>

          {histLoading && <p className="text-ink-dim text-sm text-center py-8">Loading…</p>}

          {!histLoading && histItems.length === 0 && (
            <p className="text-center text-ink-dim text-sm py-8">No data for {shortDate(histDate)}.</p>
          )}

          {histItems.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Out",  val: histItems.filter((i) => i.status !== "planned").length, color: "text-ink"  },
                  { label: "Returned",   val: histItems.filter((i) => i.status === "returned").length, color: "text-ok"  },
                  { label: "Still Out",  val: histItems.filter((i) => i.status === "out").length,      color: "text-err" },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                    <p className="text-xs text-ink-dim mb-1">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                  </div>
                ))}
              </div>

              {/* Group by section */}
              {(() => {
                const bySec: Record<string, LogItem[]> = {};
                for (const item of histItems) {
                  const key = secName(item.section_id) || "No section";
                  (bySec[key] ??= []).push(item);
                }
                return Object.entries(bySec).map(([sec, items]) => {
                  const done = items.filter((i) => i.status === "returned").length;
                  const total = items.filter((i) => i.status !== "planned").length;
                  return (
                    <div key={sec} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
                      <div className="bg-canvas px-4 py-2.5 border-b border-line flex items-center justify-between">
                        <p className="text-sm font-semibold">{sec}</p>
                        <span className={`text-xs font-medium ${done === total ? "text-ok" : "text-err"}`}>
                          {done}/{total} returned
                        </span>
                      </div>
                      <div className="divide-y divide-line">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="font-mono text-sm font-medium w-20 shrink-0">{item.tag_id}</span>
                            {item.product_name && (
                              <span className="text-xs text-ink-dim flex-1 truncate">{item.product_name}</span>
                            )}
                            <span className="text-xs ml-auto shrink-0">
                              {item.status === "returned" && (
                                <span className="text-ok">
                                  {fmtTime(item.checked_out_at)} → {fmtTime(item.checked_in_at)}
                                  {item.checked_out_at && item.checked_in_at && (
                                    ` (${duration(item.checked_out_at, item.checked_in_at)})`
                                  )}
                                </span>
                              )}
                              {item.status === "out"     && <span className="text-err">Still out</span>}
                              {item.status === "planned" && <span className="text-warn">Not started</span>}
                              {item.status === "skipped" && <span className="text-ink-dim">Skipped</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>
      )}

      {/* ═══ SECTIONS (admin) ═══ */}
      {tab === "sections" && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white border border-line rounded-xl p-4 shadow-soft">
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-3">Add Section</p>
            <div className="flex gap-2">
              <input
                value={newSecName}
                onChange={(e) => setNewSecName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newSecName.trim()) saveSection.mutate({ name: newSecName.trim() }); }}
                placeholder="e.g. Antique Haram"
                className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold flex-1"
              />
              <button
                onClick={() => saveSection.mutate({ name: newSecName.trim() })}
                disabled={!newSecName.trim() || saveSection.isPending}
                className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>

          <div className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
            <div className="divide-y divide-line">
              {sections.map((sec) => (
                <div key={sec.id} className="flex items-center gap-3 px-4 py-3">
                  {editingSec?.id === sec.id ? (
                    <>
                      <input
                        value={editingSec.name}
                        onChange={(e) => setEditingSec({ ...editingSec, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveSection.mutate({ id: sec.id, name: editingSec.name }); }}
                        className="border border-line rounded-lg2 px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-gold"
                        autoFocus
                      />
                      <button
                        onClick={() => saveSection.mutate({ id: sec.id, name: editingSec.name })}
                        className="text-xs text-ok hover:underline shrink-0"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingSec(null)} className="text-xs text-ink-dim hover:underline shrink-0">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`text-sm flex-1 ${!sec.active ? "text-ink-dim line-through" : ""}`}>
                        {sec.name}
                      </span>
                      <button onClick={() => setEditingSec(sec)} className="text-xs text-gold hover:underline shrink-0">
                        Edit
                      </button>
                      <button
                        onClick={() => toggleSection.mutate({ id: sec.id, active: !sec.active })}
                        className="text-xs text-ink-dim hover:underline shrink-0"
                      >
                        {sec.active ? "Hide" : "Show"}
                      </button>
                    </>
                  )}
                </div>
              ))}
              {sections.length === 0 && (
                <p className="px-4 py-6 text-sm text-ink-dim text-center">No sections yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function ItemGroup({
  title,
  headerClass,
  titleClass,
  children,
}: {
  title: string;
  headerClass: string;
  titleClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-line ${headerClass}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{title}</p>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

function ItemRow({
  item,
  secName,
  sub,
  children,
}: {
  item: LogItem;
  secName: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm font-medium">{item.tag_id}</p>
        <p className="text-xs text-ink-dim truncate">
          {secName || "No section"}
          {item.product_name && ` · ${item.product_name}`}
          {sub && ` · ${sub}`}
        </p>
      </div>
      {children}
    </div>
  );
}
