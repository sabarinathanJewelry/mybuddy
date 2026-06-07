"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import {
  useAttendanceByDate, useMonthlyAttendanceSummary,
  useAllPermissions, useDecidePermission,
  useAllLeaveRequests, useDecideLeaveRequest,
  type AttendanceEntry, type MonthlyEmployeeSummary,
  type PermissionRequest, type LeaveRequest,
} from "@/modules/attendance/api";

// ── incentive helpers (inline) ────────────────────────────────────────────────
interface MasterEntry { code: string; rate: number; minWastage: number }
interface IncRow { idx: number; product: string; wastage: number; netWt: number; balance: number; sp1: string; sp2: string }
interface RowOverride { balanceZero?: boolean; minWastage?: number; sp1Share?: number; wastage?: number }

function parseNum(s: string) { const m = (s ?? "").match(/[-\d.]+/); return m ? parseFloat(m[0]) : 0; }
function parseErpRows(raw: string): IncRow[] {
  const lines = raw.split("\n").map((l: string) => l.trimEnd());
  const hi = lines.findIndex((l: string) => /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l));
  if (hi < 0) return [];
  const rows: IncRow[] = [];
  lines.slice(hi + 1).forEach((line: string, i: number) => {
    if (!line.trim()) return;
    const c = line.split("\t");
    const product = (c[1] ?? "").trim().toUpperCase();
    const netWt = parseNum(c[8] ?? "");
    if (!product || netWt <= 0) return;
    rows.push({ idx: i, product, wastage: parseNum(c[3] ?? ""), netWt, balance: Math.max(0, parseNum(c[7] ?? "")), sp1: (c[5] ?? "").trim().toUpperCase(), sp2: (c[6] ?? "").trim().toUpperCase() });
  });
  return rows;
}
function staffEarned(rows: IncRow[], name: string, master: MasterEntry[], overrides: Record<number, RowOverride>, defaultSplit: number) {
  let earned = 0, eligible = 0, total = 0;
  for (const r of rows) {
    if (r.sp1 !== name && r.sp2 !== name) continue;
    total++;
    const ov = overrides[r.idx];
    const me = master.find((m) => m.code.toUpperCase() === r.product);
    const rate = me?.rate ?? 0;
    const minW = ov?.minWastage ?? me?.minWastage ?? 0;
    const bal  = ov?.balanceZero ? 0 : r.balance;
    const wst  = ov?.wastage ?? r.wastage;
    if (!me || rate === 0 || wst < minW || bal > 0) continue;
    eligible++;
    const sp1Share = ov?.sp1Share ?? defaultSplit;
    const totalInc = parseFloat((rate * r.netWt).toFixed(2));
    earned += !r.sp2 ? totalInc
      : r.sp1 === name ? parseFloat((totalInc * sp1Share / 100).toFixed(2))
      : parseFloat((totalInc * (100 - sp1Share) / 100).toFixed(2));
  }
  return { earned, eligible, total };
}

// ── attendance helpers ────────────────────────────────────────────────────────
function fmtIST(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtHrs(h: number | null) {
  if (h === null) return "—";
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}
function fmtMins(m: number) { if (!m) return "—"; const h = Math.floor(m / 60); return h ? `${h}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`; }
function todayStr() { return new Date().toLocaleDateString("en-CA"); }
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" }); }
function shiftMonthStr(m: string, dir: -1 | 1) {
  const [y, mo] = m.split("-").map(Number);
  const next = mo + dir;
  return next < 1 ? `${y - 1}-12` : next > 12 ? `${y + 1}-01` : `${y}-${String(next).padStart(2, "0")}`;
}

// ── chat types ────────────────────────────────────────────────────────────────
interface ChatMsg { id: string; sender_id: string; sender_name: string; message: string; is_deleted: boolean; edited_at: string | null; created_at: string }

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
}

type Tab = "attendance" | "requests" | "incentive" | "chat" | "announcements";
type AttView = "day" | "month";
type ReqType = "leave" | "permission";
type ReqFilter = "pending" | "approved" | "rejected" | "all";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function StaffManagementPage() {
  const profile  = useAuth((s) => s.profile);
  const qc       = useQueryClient();
  const [tab, setTab]           = useState<Tab>("attendance");
  const [attView, setAttView]   = useState<AttView>("day");
  const [attDate, setAttDate]   = useState(todayStr());
  const [attMonth, setAttMonth] = useState(currentMonth());
  const [reqType, setReqType]   = useState<ReqType>("leave");
  const [reqFilter, setReqFilter] = useState<ReqFilter>("pending");
  const [notes, setNotes]       = useState<Record<string, string>>({});

  // Incentive
  const [incSheetId, setIncSheetId] = useState<string | null>(null);

  // Announcements
  const [annForm, setAnnForm] = useState({ title: "", body: "", expires_at: "" });
  const [annErr, setAnnErr]   = useState("");

  // Chat
  const [chatMsgs, setChatMsgs]   = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText]   = useState("");
  const chatBottom = useRef<HTMLDivElement>(null);

  // ── data hooks ──────────────────────────────────────────────────────────────
  const { data: attendance = [], isLoading: attLoading, refetch: refetchAtt } = useAttendanceByDate(attDate);
  const { data: monthlySummary = [], isLoading: monthlyLoading } = useMonthlyAttendanceSummary(attMonth);

  const { data: leaves = []      } = useAllLeaveRequests();
  const { data: permissions = [] } = useAllPermissions();
  const decideLeave = useDecideLeaveRequest();
  const decidePerm  = useDecidePermission();

  const { data: incSheets = [] } = useQuery({
    queryKey: ["inc_sheets_mgmt"],
    queryFn: async () => {
      const { data } = await supabase().from("incentive_sheets").select("id, period, updated_at").order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string }[];
    },
  });
  const activeIncId = incSheetId ?? (incSheets[0]?.id ?? null);
  const { data: incSheet } = useQuery({
    queryKey: ["inc_sheet_mgmt", activeIncId],
    enabled: !!activeIncId,
    queryFn: async () => {
      const { data, error } = await supabase().from("incentive_sheets").select("*").eq("id", activeIncId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: announcements = [], isLoading: annLoading } = useQuery({
    queryKey: ["announcements_admin"],
    queryFn: async () => {
      const { data, error } = await supabase().from("announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const createAnn = useMutation({
    mutationFn: async () => {
      if (!annForm.title.trim()) throw new Error("Title is required.");
      const { error } = await supabase().from("announcements").insert({ title: annForm.title.trim(), body: annForm.body.trim() || null, expires_at: annForm.expires_at || null });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements_admin"] }); qc.invalidateQueries({ queryKey: ["announcements_staff"] }); setAnnForm({ title: "", body: "", expires_at: "" }); setAnnErr(""); },
    onError: (e: any) => setAnnErr(e?.message ?? "Failed."),
  });
  const toggleAnn = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => { const { error } = await supabase().from("announcements").update({ is_active: value }).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements_admin"] }); qc.invalidateQueries({ queryKey: ["announcements_staff"] }); },
  });
  const deleteAnn = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase().from("announcements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["announcements_admin"] }); qc.invalidateQueries({ queryKey: ["announcements_staff"] }); },
  });

  // Chat realtime
  useEffect(() => {
    const client = supabase();
    client.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setChatMsgs((data ?? []) as ChatMsg[]));
    const ch = client.channel("staff_mgmt_chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (p) => {
        if (p.eventType === "INSERT") setChatMsgs((prev) => [...prev, p.new as ChatMsg]);
        else if (p.eventType === "UPDATE") setChatMsgs((prev) => prev.map((m) => m.id === p.new.id ? p.new as ChatMsg : m));
        else if (p.eventType === "DELETE") setChatMsgs((prev) => prev.filter((m) => m.id !== (p.old as any).id));
      }).subscribe();
    return () => { client.removeChannel(ch); };
  }, []);
  useEffect(() => { if (tab === "chat") chatBottom.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs, tab]);

  // ── incentive staff summary ─────────────────────────────────────────────────
  const incSummary = useMemo(() => {
    if (!incSheet) return [];
    const rows = parseErpRows(incSheet.raw_data ?? "");
    const master: MasterEntry[] = incSheet.master_entries ?? [];
    const overrides: Record<number, RowOverride> = incSheet.overrides ?? {};
    const defaultSplit: number = incSheet.default_split ?? 70;
    const names = [...new Set(rows.flatMap((r: IncRow) => [r.sp1, r.sp2].filter(Boolean)))];
    return names
      .map((name: string) => ({ name, ...staffEarned(rows, name, master, overrides, defaultSplit) }))
      .sort((a, b) => b.earned - a.earned);
  }, [incSheet]);

  // ── chat helpers ────────────────────────────────────────────────────────────
  async function sendChat() {
    if (!chatInput.trim() || !profile) return;
    setChatSending(true);
    const { data: { user } } = await supabase().auth.getUser();
    if (user) await supabase().from("chat_messages").insert({ sender_id: user.id, sender_name: profile.display_name, message: chatInput.trim() });
    setChatInput("");
    setChatSending(false);
  }
  async function toggleDeleteMsg(id: string, cur: boolean) { await supabase().from("chat_messages").update({ is_deleted: !cur }).eq("id", id); }
  async function hardDeleteMsg(id: string) { if (!confirm("Permanently delete?")) return; await supabase().from("chat_messages").delete().eq("id", id); }
  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await supabase().from("chat_messages").update({ message: editText.trim(), edited_at: new Date().toISOString() }).eq("id", id);
    setEditingId(null);
  }

  if (profile?.role !== "admin") return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;

  // ── filtered requests ───────────────────────────────────────────────────────
  const filteredLeaves = (leaves as LeaveRequest[]).filter((l) => reqFilter === "all" || l.status === reqFilter);
  const filteredPerms  = (permissions as PermissionRequest[]).filter((p) => reqFilter === "all" || p.status === reqFilter);
  const pendingLeave = (leaves as LeaveRequest[]).filter((l) => l.status === "pending").length;
  const pendingPerm  = (permissions as PermissionRequest[]).filter((p) => p.status === "pending").length;

  const tabBtn = (key: Tab, label: string, badge?: number) => (
    <button key={key} onClick={() => setTab(key)}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === key ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"}`}>
      {label}
      {!!badge && <span className="bg-err text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{badge}</span>}
    </button>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">Staff Management</h1>
        <p className="text-xs text-ink-dim mt-0.5">Requests, incentive overview, chat moderation, announcements.</p>
      </div>

      {/* Top tabs */}
      <div className="flex border-b border-line gap-0.5 flex-wrap">
        {tabBtn("attendance",    "Attendance")}
        {tabBtn("requests",      "Requests",      pendingLeave + pendingPerm)}
        {tabBtn("incentive",     "Incentive")}
        {tabBtn("chat",          "Chat")}
        {tabBtn("announcements", "Announcements")}
      </div>

      {/* ── ATTENDANCE ── */}
      {tab === "attendance" && (
        <div className="space-y-4">
          {/* Day / Month toggle */}
          <div className="flex items-center gap-2">
            {(["day", "month"] as AttView[]).map((v) => (
              <button key={v} onClick={() => setAttView(v)}
                className={`text-sm px-4 py-1.5 rounded-lg2 border transition-colors ${attView === v ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold hover:text-gold"}`}>
                {v === "day" ? "Daily View" : "Monthly View"}
              </button>
            ))}
          </div>

          {attView === "day" && (
            <div className="space-y-4">
              {/* Date + refresh */}
              <div className="flex items-center gap-3 flex-wrap">
                <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)}
                  className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                <button onClick={() => refetchAtt()}
                  className="border border-line text-ink-dim px-3 py-2 rounded-lg2 text-sm hover:border-gold hover:text-gold transition-colors">
                  Refresh
                </button>
                <button onClick={() => setAttDate(todayStr())}
                  className="border border-line text-ink-dim px-3 py-2 rounded-lg2 text-sm hover:border-gold hover:text-gold transition-colors">
                  Today
                </button>
              </div>

              {attLoading ? (
                <p className="text-ink-dim text-sm">Loading attendance…</p>
              ) : (
                <>
                  {/* Summary cards */}
                  {(() => {
                    const present = attendance.filter((a) => a.present).length;
                    const late    = attendance.filter((a) => a.is_late).length;
                    const absent  = attendance.filter((a) => !a.present).length;
                    return (
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: "Total Staff", value: attendance.length, color: "text-ink" },
                          { label: "Present",     value: present,           color: "text-ok" },
                          { label: "Late",        value: late,              color: "text-warn" },
                          { label: "Absent",      value: absent,            color: "text-err" },
                        ].map((c) => (
                          <div key={c.label} className="bg-white rounded-xl border border-line shadow-soft p-4 text-center">
                            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                            <p className="text-xs text-ink-dim mt-1">{c.label}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Staff table */}
                  <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
                    {attendance.length === 0 ? (
                      <p className="text-ink-dim text-sm p-5 text-center">No attendance data for this date.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                            <th className="text-left px-4 py-2.5">Name</th>
                            <th className="text-left px-3 py-2.5">Shift</th>
                            <th className="text-center px-3 py-2.5">Status</th>
                            <th className="text-center px-3 py-2.5">In</th>
                            <th className="text-center px-3 py-2.5">Out</th>
                            <th className="text-center px-3 py-2.5">Hours</th>
                            <th className="text-center px-3 py-2.5">Lunch OT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendance.map((a) => (
                            <tr key={a.bio_user_id} className="border-b border-line last:border-0 hover:bg-canvas/40">
                              <td className="px-4 py-2.5 font-medium">
                                {a.name}
                                {a.double_punch_detected && <span className="ml-1 text-[10px] text-warn">(DP)</span>}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-ink-dim capitalize">{a.shift}</td>
                              <td className="px-3 py-2.5 text-center">
                                {!a.present ? (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-err/10 text-err">Absent</span>
                                ) : a.is_late ? (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-warn/10 text-warn">Late</span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ok/10 text-ok">Present</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono text-xs">{fmtIST(a.first_in)}</td>
                              <td className="px-3 py-2.5 text-center font-mono text-xs">{fmtIST(a.last_out)}</td>
                              <td className="px-3 py-2.5 text-center text-xs">{fmtHrs(a.effective_hours)}</td>
                              <td className="px-3 py-2.5 text-center text-xs">
                                {a.lunch_overrun_minutes > 0 ? (
                                  <span className="text-warn">{fmtMins(a.lunch_overrun_minutes)}</span>
                                ) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {attView === "month" && (
            <div className="space-y-4">
              {/* Month navigation */}
              <div className="flex items-center gap-3">
                <button onClick={() => setAttMonth((m) => shiftMonthStr(m, -1))}
                  className="border border-line px-3 py-2 rounded-lg2 text-sm text-ink-dim hover:border-gold hover:text-gold transition-colors">‹ Prev</button>
                <span className="text-sm font-semibold text-ink">{monthLabel(attMonth)}</span>
                <button onClick={() => setAttMonth((m) => shiftMonthStr(m, 1))}
                  className="border border-line px-3 py-2 rounded-lg2 text-sm text-ink-dim hover:border-gold hover:text-gold transition-colors">Next ›</button>
                <button onClick={() => setAttMonth(currentMonth())}
                  className="ml-2 border border-line text-ink-dim px-3 py-2 rounded-lg2 text-sm hover:border-gold hover:text-gold transition-colors">This Month</button>
              </div>

              {monthlyLoading ? (
                <p className="text-ink-dim text-sm">Loading monthly summary…</p>
              ) : (
                <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
                  {monthlySummary.length === 0 ? (
                    <p className="text-ink-dim text-sm p-5 text-center">No data for {monthLabel(attMonth)}.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                          <th className="text-left px-4 py-2.5">Name</th>
                          <th className="text-left px-3 py-2.5">Shift</th>
                          <th className="text-center px-3 py-2.5">Present</th>
                          <th className="text-center px-3 py-2.5">Absent</th>
                          <th className="text-center px-3 py-2.5">Late</th>
                          <th className="text-center px-3 py-2.5">OT</th>
                          <th className="text-right px-3 py-2.5">Salary</th>
                          <th className="text-right px-3 py-2.5">Deduction</th>
                          <th className="text-right px-3 py-2.5">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlySummary.map((s) => (
                          <tr key={s.bio_user_id} className="border-b border-line last:border-0 hover:bg-canvas/40">
                            <td className="px-4 py-2.5 font-medium">{s.name}</td>
                            <td className="px-3 py-2.5 text-xs text-ink-dim capitalize">{s.shift}</td>
                            <td className="px-3 py-2.5 text-center text-ok font-medium">{s.present_days}</td>
                            <td className="px-3 py-2.5 text-center text-err">{s.absent_days}</td>
                            <td className="px-3 py-2.5 text-center text-warn">{s.late_days}</td>
                            <td className="px-3 py-2.5 text-center text-xs">{fmtMins(s.total_ot_minutes)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs">₹{s.monthly_salary.toLocaleString("en-IN")}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-err">
                              {s.leave_deduction > 0 ? `−₹${s.leave_deduction.toLocaleString("en-IN")}` : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-gold">
                              ₹{(s.monthly_salary - s.leave_deduction).toLocaleString("en-IN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gold/5 border-t border-gold/20">
                          <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-ink-dim">Total ({monthlySummary.length} staff)</td>
                          <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                            ₹{monthlySummary.reduce((s, r) => s + r.monthly_salary, 0).toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-err font-semibold">
                            −₹{monthlySummary.reduce((s, r) => s + r.leave_deduction, 0).toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gold text-sm">
                            ₹{monthlySummary.reduce((s, r) => s + r.monthly_salary - r.leave_deduction, 0).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── REQUESTS ── */}
      {tab === "requests" && (
        <div className="space-y-4">
          {/* Type + filter row */}
          <div className="flex flex-wrap items-center gap-2">
            {(["leave", "permission"] as ReqType[]).map((t) => (
              <button key={t} onClick={() => setReqType(t)}
                className={`text-sm px-4 py-1.5 rounded-lg2 border transition-colors ${reqType === t ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold hover:text-gold"}`}>
                {t === "leave" ? `Leave ${pendingLeave ? `(${pendingLeave})` : ""}` : `Permission ${pendingPerm ? `(${pendingPerm})` : ""}`}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              {(["pending", "all", "approved", "rejected"] as ReqFilter[]).map((f) => (
                <button key={f} onClick={() => setReqFilter(f)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${reqFilter === f ? "bg-gold/10 border-gold/30 text-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Leave requests */}
          {reqType === "leave" && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              {filteredLeaves.length === 0 ? (
                <p className="text-ink-dim text-sm p-5 text-center">No {reqFilter === "all" ? "" : reqFilter} leave requests.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Staff</th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Type</th>
                    <th className="text-left px-3 py-2.5">Reason</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-left px-3 py-2.5">Action</th>
                  </tr></thead>
                  <tbody>
                    {filteredLeaves.map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5 font-medium">{(l as any).staff?.name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-ink-dim text-xs">{l.leave_date}</td>
                        <td className="px-3 py-2.5 text-xs capitalize">{l.leave_type.replace("_", " ")}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-dim max-w-[140px] truncate">{l.reason || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${l.status === "approved" ? "bg-ok/10 text-ok" : l.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"}`}>
                            {l.status}
                          </span>
                          {l.admin_note && <p className="text-[10px] text-ink-dim mt-0.5">{l.admin_note}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.status === "pending" && (
                            <div className="space-y-1">
                              <input placeholder="Note (optional)" value={notes[l.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))}
                                className="border border-line rounded px-2 py-0.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-gold" />
                              <div className="flex gap-1">
                                <button onClick={() => decideLeave.mutate({ id: l.id, bio_user_id: l.bio_user_id, leave_date: l.leave_date, leave_type: l.leave_type, status: "approved", admin_note: notes[l.id] })}
                                  className="text-xs bg-ok text-white px-2 py-0.5 rounded">Approve</button>
                                <button onClick={() => decideLeave.mutate({ id: l.id, bio_user_id: l.bio_user_id, leave_date: l.leave_date, leave_type: l.leave_type, status: "rejected", admin_note: notes[l.id] })}
                                  className="text-xs bg-err text-white px-2 py-0.5 rounded">Reject</button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Permission requests */}
          {reqType === "permission" && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              {filteredPerms.length === 0 ? (
                <p className="text-ink-dim text-sm p-5 text-center">No {reqFilter === "all" ? "" : reqFilter} permission requests.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Staff</th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Time</th>
                    <th className="text-left px-3 py-2.5">Reason</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-left px-3 py-2.5">Action</th>
                  </tr></thead>
                  <tbody>
                    {filteredPerms.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5 font-medium">{(p as any).staff?.name ?? "—"}</td>
                        <td className="px-3 py-2.5 text-ink-dim text-xs">{p.permission_date}</td>
                        <td className="px-3 py-2.5 text-xs font-mono">
                          {p.from_time && p.to_time ? `${p.from_time.slice(0, 5)} – ${p.to_time.slice(0, 5)}` : `${p.late_minutes}m`}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-dim max-w-[140px] truncate">{p.reason || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.status === "approved" ? "bg-ok/10 text-ok" : p.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"}`}>
                            {p.status}
                          </span>
                          {p.admin_note && <p className="text-[10px] text-ink-dim mt-0.5">{p.admin_note}</p>}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.status === "pending" && (
                            <div className="space-y-1">
                              <input placeholder="Note (optional)" value={notes[p.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                                className="border border-line rounded px-2 py-0.5 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-gold" />
                              <div className="flex gap-1">
                                <button onClick={() => decidePerm.mutate({ id: p.id, status: "approved", admin_note: notes[p.id] })}
                                  className="text-xs bg-ok text-white px-2 py-0.5 rounded">Approve</button>
                                <button onClick={() => decidePerm.mutate({ id: p.id, status: "rejected", admin_note: notes[p.id] })}
                                  className="text-xs bg-err text-white px-2 py-0.5 rounded">Reject</button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── INCENTIVE SUMMARY ── */}
      {tab === "incentive" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-ink-dim">Per-staff earned summary from the incentive sheet.</p>
            {incSheets.length > 0 && (
              <select value={activeIncId ?? ""} onChange={(e) => setIncSheetId(e.target.value || null)}
                className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white">
                {incSheets.map((s: any) => <option key={s.id} value={s.id}>{s.period}</option>)}
              </select>
            )}
          </div>
          {!incSheet && <p className="text-ink-dim text-sm">No incentive sheet found.</p>}
          {incSheet && incSummary.length === 0 && <p className="text-ink-dim text-sm">No data in this sheet yet.</p>}
          {incSummary.length > 0 && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">Staff Name</th>
                  <th className="text-right px-3 py-2.5">Total Items</th>
                  <th className="text-right px-3 py-2.5">Eligible</th>
                  <th className="text-right px-3 py-2.5">Not Eligible</th>
                  <th className="text-right px-3 py-2.5">Earned (₹)</th>
                </tr></thead>
                <tbody>
                  {incSummary.map((s: any) => (
                    <tr key={s.name} className="border-b border-line last:border-0 hover:bg-canvas/40">
                      <td className="px-4 py-2.5 font-medium">{s.name}</td>
                      <td className="px-3 py-2.5 text-right text-ink-dim">{s.total}</td>
                      <td className="px-3 py-2.5 text-right text-ok font-medium">{s.eligible}</td>
                      <td className="px-3 py-2.5 text-right text-ink-dim">{s.total - s.eligible}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gold">
                        {s.earned > 0 ? `₹${s.earned.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gold/5 border-t border-gold/20">
                    <td className="px-4 py-2 text-xs font-semibold text-ink-dim">Total</td>
                    <td className="px-3 py-2 text-right text-xs">{incSummary.reduce((s: number, x: any) => s + x.total, 0)}</td>
                    <td className="px-3 py-2 text-right text-xs text-ok font-semibold">{incSummary.reduce((s: number, x: any) => s + x.eligible, 0)}</td>
                    <td className="px-3 py-2 text-right text-xs">{incSummary.reduce((s: number, x: any) => s + x.total - x.eligible, 0)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gold text-sm">
                      ₹{incSummary.reduce((s: number, x: any) => s + x.earned, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CHAT MODERATION ── */}
      {tab === "chat" && (
        <div className="flex flex-col gap-3" style={{ height: "65vh" }}>
          <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-line shadow-soft p-3 space-y-1 min-h-0">
            {chatMsgs.length === 0 && <p className="text-center text-ink-dim text-sm py-8">No messages yet.</p>}
            {chatMsgs.map((m) => (
              <div key={m.id} className="flex justify-start mb-1">
                <div className="max-w-[80%] flex flex-col items-start">
                  <span className="text-[10px] font-semibold text-gold-dark px-1 mb-0.5">{m.sender_name}</span>
                  <div className={`rounded-2xl px-3 py-2 text-sm ${m.is_deleted ? "bg-canvas border border-line text-ink-dim italic text-xs" : "bg-canvas border border-line text-ink"}`}>
                    {editingId === m.id ? (
                      <div className="flex gap-2 items-center min-w-[200px]">
                        <input value={editText} onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m.id); if (e.key === "Escape") setEditingId(null); }}
                          className="flex-1 bg-white border border-line rounded px-2 py-0.5 text-xs text-ink focus:outline-none" autoFocus />
                        <button onClick={() => saveEdit(m.id)} className="text-xs text-ok font-semibold">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-ink-dim">✕</button>
                      </div>
                    ) : m.is_deleted ? "This message was deleted" : <span className="whitespace-pre-wrap">{m.message}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <span className="text-[10px] text-ink-dim">{fmtTime(m.created_at)}</span>
                    {m.edited_at && !m.is_deleted && <span className="text-[10px] text-ink-dim">(edited)</span>}
                    {!m.is_deleted && <button onClick={() => { setEditingId(m.id); setEditText(m.message); }} className="text-[10px] text-info hover:underline">Edit</button>}
                    <button onClick={() => toggleDeleteMsg(m.id, m.is_deleted)} className="text-[10px] text-warn hover:underline">{m.is_deleted ? "Restore" : "Hide"}</button>
                    <button onClick={() => hardDeleteMsg(m.id)} className="text-[10px] text-err hover:underline">Remove</button>
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatBottom} />
          </div>
          <div className="shrink-0">
            <div className="flex gap-2 bg-white border border-line rounded-xl px-3 py-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Send a message as admin…"
                className="flex-1 text-sm focus:outline-none" />
              <button onClick={sendChat} disabled={chatSending || !chatInput.trim()}
                className="bg-gold text-white px-4 py-1.5 rounded-lg2 text-sm font-medium disabled:opacity-40">Send</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ANNOUNCEMENTS ── */}
      {tab === "announcements" && (
        <div className="space-y-4">
          {/* Create */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
            <p className="text-sm font-semibold">New Announcement</p>
            <input value={annForm.title} onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title — Tamil, English, or both" className={inp} />
            <textarea value={annForm.body} onChange={(e) => setAnnForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Full message (optional)…" rows={3} className={`${inp} resize-none`} />
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs text-ink-dim block mb-1">Expires on (optional)</label>
                <input type="date" value={annForm.expires_at} onChange={(e) => setAnnForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
              </div>
              <button onClick={() => createAnn.mutate()} disabled={createAnn.isPending || !annForm.title.trim()}
                className="bg-gold text-white px-5 py-2 rounded-lg2 text-sm font-medium disabled:opacity-40">
                {createAnn.isPending ? "Posting…" : "Post"}
              </button>
            </div>
            {annErr && <p className="text-xs text-err">{annErr}</p>}
          </div>

          {/* List */}
          {annLoading ? <p className="text-ink-dim text-sm">Loading…</p> : announcements.length === 0 ? (
            <p className="text-ink-dim text-sm text-center py-4">No announcements yet.</p>
          ) : (
            <div className="space-y-2">
              {announcements.map((a: any) => {
                const expired = a.expires_at ? a.expires_at < new Date().toISOString().slice(0, 10) : false;
                return (
                  <div key={a.id} className={`bg-white rounded-xl border border-line shadow-soft p-4 flex items-start gap-3 ${(!a.is_active || expired) ? "opacity-60" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{a.title}</p>
                      {a.body && <p className="text-xs text-ink-dim mt-1 whitespace-pre-wrap">{a.body}</p>}
                      <p className="text-[10px] text-ink-dim mt-1">
                        {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {a.expires_at && ` · Expires ${a.expires_at}`}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 items-center">
                      <button onClick={() => toggleAnn.mutate({ id: a.id, value: !a.is_active })}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${a.is_active && !expired ? "bg-ok/10 border-ok/30 text-ok" : "border-line text-ink-dim hover:border-gold hover:text-gold"}`}>
                        {a.is_active && !expired ? "Active" : expired ? "Expired" : "Inactive"}
                      </button>
                      <button onClick={() => { if (confirm("Delete?")) deleteAnn.mutate(a.id); }}
                        className="text-xs text-err hover:underline">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
