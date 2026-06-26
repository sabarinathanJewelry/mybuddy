"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import WeekoffsView from "@/components/weekoffs/WeekoffsView";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import {
  useMyPermissions, useCreatePermission,
  useMyLeaveRequests, useSubmitLeaveRequest,
  useMyOutsideDuties, useCreateOutsideDuty,
  useLastSyncTime,
  useMyKyc, useUpsertKyc, KYC_DOCS,
  useStaffTasks, useCompleteTask, useCreateTask,
  type PermissionRequest, type LeaveRequest, type OutsideDuty, type StaffTask,
} from "@/modules/attendance/api";
import { parseKolusuChat } from "@/lib/kolusu-parse";

// ── helpers ──────────────────────────────────────────────────────────────────
const IST_MS = 5.5 * 3600000;

function istMinutes(ts: string) {
  const ist = new Date(new Date(ts).getTime() + IST_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function deduplicatePunches(punches: string[], thresholdMs = 30_000) {
  if (punches.length <= 1) return { deduped: [...punches], double_punch: false };
  const sorted = [...punches].sort();
  const deduped: string[] = [sorted[0]];
  let double_punch = false;
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime() <= thresholdMs) {
      double_punch = true;
    } else {
      deduped.push(sorted[i]);
    }
  }
  return { deduped, double_punch };
}

function formatTime(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function formatMins(m: number) {
  if (m <= 0) return "—";
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}
function formatHours(h: number | null) {
  if (h === null) return "—";
  const hrs = Math.floor(h), mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}
function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}
function dayLabel(dateStr: string) {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${String(d).padStart(2, "0")} ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]}`;
}
// ── chat ─────────────────────────────────────────────────────────────────────
interface ChatMessage {
  id: string; sender_id: string; sender_name: string;
  message: string; is_deleted: boolean; edited_at: string | null; created_at: string;
}
function chatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// ── incentive helpers ─────────────────────────────────────────────────────────
interface MasterEntry { code: string; rate: number; minWastage: number }

// ── types ─────────────────────────────────────────────────────────────────────
type DayRow = {
  date: string;
  status: "present" | "late" | "leave";
  first_in: string | null;
  last_out: string | null;
  effective_hours: number | null;
  late_minutes: number;
  ot_minutes: number;
  double_punch: boolean;
  punches: string[];
  lunch_minutes: number | null;
};

type StaffInfo = { bio_user_id: string; name: string; shift: string };

type PageTab = "today" | "monthly" | "requests" | "incentive" | "chat" | "policies" | "kyc" | "tasks" | "weekoffs";

// ── page ─────────────────────────────────────────────────────────────────────
export default function MyAttendancePage() {
  const todayMonth = currentMonth();
  const todayStr   = new Date().toLocaleDateString("en-CA");

  const [tab, setTab]           = useState<PageTab>("today");
  const [month, setMonth]       = useState(todayMonth);
  const [staff, setStaff]       = useState<StaffInfo | null>(null);
  const [rows, setRows]         = useState<DayRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [canSeeRepairs, setCanSeeRepairs]     = useState(false);
  const [canSeeIncentive, setCanSeeIncentive] = useState(false);
  const [canLogKolusu, setCanLogKolusu]       = useState(false);
  const [showGoogleReview, setShowGoogleReview] = useState(false);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [masterSearch, setMasterSearch]       = useState("");

  // Chat state
  const [senderId, setSenderId]         = useState<string | null>(null);
  const [senderName, setSenderName]     = useState("");
  const [senderRole, setSenderRole]     = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatSending, setChatSending]   = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editText, setEditText]         = useState("");
  const chatBottomRef                   = useRef<HTMLDivElement>(null);

  const { data: lastSyncIso }   = useLastSyncTime();

  // Permission requests
  const { data: permissions = [], refetch: refetchPerms } = useMyPermissions();
  const createPerm = useCreatePermission();
  const [showPermForm, setShowPermForm] = useState(false);
  const [permForm, setPermForm] = useState({ permission_date: todayStr, from_time: "09:00", to_time: "09:30", reason: "" });
  const [permError, setPermError] = useState<string | null>(null);

  const thisMonth      = todayStr.slice(0, 7);
  const usedThisMonth  = permissions.filter((p: PermissionRequest) =>
    p.permission_date.startsWith(thisMonth) && (p.status === "pending" || p.status === "approved")
  ).length;
  const canRequest = usedThisMonth < 2;

  // Leave requests
  const { data: myLeaves = [], refetch: refetchLeaves } = useMyLeaveRequests(staff?.bio_user_id ?? null);
  const submitLeave = useSubmitLeaveRequest();
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_date: todayStr, leave_type: "casual", reason: "" });
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Outside duty requests
  const { data: myDuties = [], refetch: refetchDuties } = useMyOutsideDuties(staff?.bio_user_id ?? null);
  const createDuty = useCreateOutsideDuty();
  const [showDutyForm, setShowDutyForm] = useState(false);
  const [dutyForm, setDutyForm] = useState({ duty_date: todayStr, description: "", expected_arrival: "" });
  const [dutyError, setDutyError] = useState<string | null>(null);

  // KYC
  const { data: myKyc, refetch: refetchKyc } = useMyKyc(staff?.bio_user_id ?? null);
  const upsertKyc = useUpsertKyc();
  const [kycForm, setKycForm] = useState({ aadhaar_last4: "", digilocker_confirmed: false, documents_given: [] as string[] });
  const [kycSelfie, setKycSelfie] = useState<string | null>(null);
  const [kycCameraOn, setKycCameraOn] = useState(false);
  const [kycStream, setKycStream] = useState<MediaStream | null>(null);
  const kycVideoRef = useRef<HTMLVideoElement>(null);
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycSaving, setKycSaving] = useState(false);

  async function startKycCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setKycStream(s);
      setKycCameraOn(true);
      setTimeout(() => { if (kycVideoRef.current) kycVideoRef.current.srcObject = s; }, 100);
    } catch { setKycError("Camera access denied. Please allow camera permission."); }
  }

  function captureKycSelfie() {
    if (!kycVideoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = 480; canvas.height = 360;
    canvas.getContext("2d")!.drawImage(kycVideoRef.current, 0, 0, 480, 360);
    setKycSelfie(canvas.toDataURL("image/jpeg", 0.75));
    kycStream?.getTracks().forEach(t => t.stop());
    setKycStream(null); setKycCameraOn(false);
  }

  function retakeKycSelfie() {
    setKycSelfie(null);
    startKycCamera();
  }

  async function submitKyc() {
    setKycError(null);
    if (!staff) return;
    if (kycForm.aadhaar_last4.length !== 4 || !/^\d{4}$/.test(kycForm.aadhaar_last4)) {
      setKycError("Enter the last 4 digits of your Aadhaar number."); return;
    }
    if (!kycSelfie && !myKyc?.selfie_data) {
      setKycError("Please take a selfie photo."); return;
    }
    setKycSaving(true);
    try {
      await upsertKyc.mutateAsync({
        bio_user_id: staff.bio_user_id,
        aadhaar_last4: kycForm.aadhaar_last4,
        selfie_data: kycSelfie ?? myKyc?.selfie_data ?? null,
        digilocker_confirmed: kycForm.digilocker_confirmed,
        documents_given: kycForm.documents_given,
      });
      refetchKyc();
    } catch { setKycError("Failed to save. Please try again."); }
    finally { setKycSaving(false); }
  }

  async function handleLeaveSubmit() {
    setLeaveError(null);
    if (!staff) return;
    try {
      await submitLeave.mutateAsync({
        bio_user_id: staff.bio_user_id,
        leave_date: leaveForm.leave_date,
        leave_type: leaveForm.leave_type,
        reason: leaveForm.reason || undefined,
        staff_name: staff.name,
      });
      setShowLeaveForm(false);
      setLeaveForm({ leave_date: todayStr, leave_type: "casual", reason: "" });
      refetchLeaves();
    } catch (e: any) {
      setLeaveError(e?.message ?? "Failed to submit. Please try again.");
    }
  }

  function calcPermMinutes(from: string, to: string) {
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    return (th * 60 + tm) - (fh * 60 + fm);
  }

  async function submitPermission() {
    setPermError(null);
    if (!staff) return;
    if (!canRequest) { setPermError("You have already used 2 permissions this month."); return; }
    const lateMin = calcPermMinutes(permForm.from_time, permForm.to_time);
    if (lateMin < 1) { setPermError("To time must be after from time."); return; }
    try {
      await createPerm.mutateAsync({ ...permForm, late_minutes: lateMin, bio_user_id: staff.bio_user_id });
      setShowPermForm(false);
      setPermForm({ permission_date: todayStr, from_time: "09:00", to_time: "09:30", reason: "" });
      refetchPerms();
    } catch {
      setPermError("Failed to submit. Please try again.");
    }
  }

  // Fetch staff info once on mount
  useEffect(() => {
    const client = supabase();
    client.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setSenderId(user.id);
        const { data: profile } = await client
          .from("profiles").select("repair_access, incentive_access, kolusu_access, display_name, role").eq("id", user.id).single();
        if (profile?.repair_access === true) setCanSeeRepairs(true);
        if (profile?.incentive_access === true) setCanSeeIncentive(true);
        if (profile?.kolusu_access === true) setCanLogKolusu(true);
        if (profile?.display_name) setSenderName(profile.display_name);
        if (profile?.role) setSenderRole(profile.role);
      }
    });
    client
      .from("staff")
      .select("bio_user_id, name, shift")
      .single()
      .then(({ data, error }) => {
        if (error || !data) setError("Could not load your staff record.");
        else setStaff(data as StaffInfo);
      });
  }, []);

  // Fetch attendance whenever month or staff changes
  useEffect(() => {
    if (!staff) return;
    setLoading(true);

    const [yearStr, monStr] = month.split("-");
    const year = Number(yearStr), mon = Number(monStr);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const monthEnd    = `${month}-${String(daysInMonth).padStart(2, "0")}`;
    const todayISO    = new Date().toISOString().slice(0, 10);
    const lastDay     = month < todayISO.slice(0, 7) ? monthEnd : todayISO;
    const totalDays   = Math.round((new Date(lastDay).getTime() - new Date(`${month}-01`).getTime()) / 86400000) + 1;
    const nextMon     = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, "0")}`;
    const shiftEndMin = staff.shift === "girls" ? 20 * 60 + 30 : 21 * 60 + 30;

    supabase()
      .from("attendance_logs")
      .select("punch_time")
      .eq("bio_user_id", staff.bio_user_id)
      .gte("punch_time", `${month}-01T00:00:00+05:30`)
      .lt("punch_time", `${nextMon}-01T00:00:00+05:30`)
      .order("punch_time")
      .then(({ data, error: logsErr }) => {
        if (logsErr) { setError(logsErr.message); setLoading(false); return; }

        const byDate = new Map<string, string[]>();
        for (const log of data ?? []) {
          const istDate = new Date(new Date(log.punch_time).getTime() + IST_MS).toISOString().slice(0, 10);
          if (!byDate.has(istDate)) byDate.set(istDate, []);
          byDate.get(istDate)!.push(log.punch_time);
        }

        const allRows: DayRow[] = [];
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(Date.UTC(year, mon - 1, 1 + i));
          const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
          const raw = [...(byDate.get(date) ?? [])].sort();
          const { deduped, double_punch } = deduplicatePunches(raw);

          const firstIn = deduped[0] ?? null;
          const lastOut = deduped.length >= 2 && (deduped.length - 1) % 2 === 1
            ? deduped[deduped.length - 1] : null;
          const hw = firstIn && lastOut
            ? (new Date(lastOut).getTime() - new Date(firstIn).getTime()) / 3_600_000 : null;

          const firstInMins  = firstIn ? istMinutes(firstIn) : 0;
          const is_late      = firstIn ? firstInMins > 9 * 60 + 50 : false;
          const late_minutes = is_late ? firstInMins - (9 * 60 + 30) : 0;
          const lastOutMins  = lastOut ? istMinutes(lastOut) : 0;
          const ot_minutes   = lastOut ? Math.max(0, lastOutMins - shiftEndMin) : 0;

          let lunch_minutes: number | null = null;
          if (deduped.length >= 4) {
            lunch_minutes = Math.round((new Date(deduped[deduped.length - 2]).getTime() - new Date(deduped[1]).getTime()) / 60000);
          }
          let effective_hours: number | null = null;
          if (hw !== null) {
            effective_hours = lunch_minutes !== null ? hw - lunch_minutes / 60 : Math.max(0, hw - 1);
          }

          allRows.push({
            date,
            status: !firstIn ? "leave" : is_late ? "late" : "present",
            first_in: firstIn,
            last_out: lastOut,
            effective_hours,
            late_minutes,
            ot_minutes,
            double_punch,
            punches: deduped,
            lunch_minutes,
          });
        }

        setRows(allRows);
        setLoading(false);
      });
  }, [staff, month]);

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements_staff"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase()
        .from("announcements")
        .select("id, title, body")
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gte.${today}`)
        .order("created_at", { ascending: false });
      return (data ?? []) as { id: string; title: string; body: string | null }[];
    },
  });

  const { data: incSheets = [], isLoading: incSheetsLoading } = useQuery({
    queryKey: ["incentive_sheets_list_staff"],
    enabled: canSeeIncentive,
    queryFn: async () => {
      const { data } = await supabase()
        .from("incentive_sheets")
        .select("id, period, updated_at")
        .order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; updated_at: string }[];
    },
  });

  const activeSheetId = selectedSheetId ?? (incSheets[0]?.id ?? null);

  const { data: incSheet, isLoading: incSheetLoading } = useQuery({
    queryKey: ["incentive_sheet_staff", activeSheetId],
    enabled: canSeeIncentive && !!activeSheetId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("incentive_sheets")
        .select("id, period, master_entries")
        .eq("id", activeSheetId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Chat — load history + subscribe to realtime
  useEffect(() => {
    const client = supabase();
    client.from("chat_messages")
      .select("*").order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setChatMessages((data ?? []) as ChatMessage[]));

    const channel = client.channel("staff_chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        if (payload.eventType === "INSERT")
          setChatMessages((prev) => [...prev, payload.new as ChatMessage]);
        else if (payload.eventType === "UPDATE")
          setChatMessages((prev) => prev.map((m) => m.id === payload.new.id ? payload.new as ChatMessage : m));
        else if (payload.eventType === "DELETE")
          setChatMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
      })
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, []);

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    if (tab === "chat") chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, tab]);

  // ── Unread chat count ──────────────────────────────────────────────────────
  const { data: chatUnread = 0, refetch: refetchUnread } = useQuery({
    queryKey: ["chat_unread_kiosk", senderId],
    enabled: !!senderId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!senderId) return 0;
      const client = supabase();
      const { data: receipt } = await client
        .from("chat_read_receipts").select("last_read_at").eq("user_id", senderId).maybeSingle();
      const lastRead = receipt?.last_read_at ?? "1970-01-01T00:00:00Z";
      const { count } = await client
        .from("chat_messages").select("id", { count: "exact", head: true })
        .gt("created_at", lastRead).neq("sender_id", senderId).eq("is_deleted", false);
      return count ?? 0;
    },
  });

  // Mark chat as read when switching to chat tab
  useEffect(() => {
    if (tab === "chat" && senderId) {
      supabase().from("chat_read_receipts")
        .upsert({ user_id: senderId, last_read_at: new Date().toISOString() }, { onConflict: "user_id" })
        .then(() => refetchUnread());
    }
  }, [tab, senderId]);

  async function sendChatMessage() {
    if (!chatInput.trim() || !senderId || !senderName) return;
    setChatSending(true);
    const client = supabase();
    const msg = chatInput.trim();
    await client.from("chat_messages").insert({ sender_id: senderId, sender_name: senderName, message: msg });

    // Auto-log kolusu sale if staff has kolusu_access and message matches KS / kolusu format
    if (canLogKolusu) {
      const parsed = parseKolusuChat(msg);
      if (parsed) {
        const today = new Date().toISOString().slice(0, 10);
        await client.from("kolusu_pending_sales").insert({
          tx_date:     today,
          raw_wt_g:    parsed.raw_wt_g,
          cover_wt_g:  parsed.cover_wt_g,
          qty:         parsed.qty,
          description: parsed.description || null,
          bill_no:     parsed.bill_no || null,
          staff_name:  senderName,
          staff_id:    senderId,
          source:      "chat",
        });
        await client.from("chat_messages").insert({
          sender_id:   senderId,
          sender_name: "MyBuddy",
          message:     `✓ Kolusu logged: ${parsed.raw_wt_g}g + ${parsed.cover_wt_g}g cover${parsed.description ? ` (${parsed.description})` : ""}. Admin will assign box.`,
        });
      }
    }

    setChatInput("");
    setChatSending(false);
  }

  async function softDeleteMessage(id: string) {
    await supabase().from("chat_messages").update({ is_deleted: true }).eq("id", id);
  }

  async function hardDeleteMessage(id: string) {
    if (!confirm("Permanently delete this message?")) return;
    await supabase().from("chat_messages").delete().eq("id", id);
  }

  async function saveEditMessage(id: string) {
    if (!editText.trim()) return;
    await supabase().from("chat_messages")
      .update({ message: editText.trim(), edited_at: new Date().toISOString() })
      .eq("id", id);
    setEditingId(null);
  }

  function shiftMonth(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const next = m + dir;
    const newM = next < 1 ? `${y - 1}-12` : next > 12 ? `${y + 1}-01` : `${y}-${String(next).padStart(2, "0")}`;
    if (newM <= todayMonth) setMonth(newM);
  }

  async function handleLogout() {
    await supabase().auth.signOut();
  }

  const presentDays   = rows.filter(r => r.status !== "leave").length;
  const absentDays    = rows.filter(r => r.status === "leave").length;
  const totalOtMins = rows.reduce((s, r) => s + r.ot_minutes, 0);

  // Load admin-saved fine settings for the current month
  const { data: fineSettings } = useQuery({
    queryKey: ["attendance_settings", month],
    queryFn: async () => {
      const { data } = await supabase().from("app_settings").select("value").eq("key", `attendance_settings_${month}`).maybeSingle();
      return (data?.value ?? null) as { late_fine_amt: number; fine_mode: "day" | "minute"; apply_fine: boolean; equalize_ot: boolean; fine_from_date?: string } | null;
    },
  });

  // Only count late minutes on/after fine_from_date (if set)
  const fineFromDate = fineSettings?.fine_from_date ?? "";
  const totalLateMins = rows
    .filter(r => !fineFromDate || r.date >= fineFromDate)
    .reduce((s, r) => s + r.late_minutes, 0);

  const netLateMins = fineSettings?.equalize_ot
    ? Math.max(0, totalLateMins - totalOtMins)
    : totalLateMins;
  const monthFine = fineSettings?.apply_fine
    ? (fineSettings.fine_mode === "minute"
        ? netLateMins * fineSettings.late_fine_amt
        : 0)
    : 0;

  // Today's row (only meaningful when viewing current month)
  const todayRow = month === todayMonth ? rows.find(r => r.date === todayStr) ?? null : null;

  // Tasks for this staff member
  const { data: myTasks = [] } = useStaffTasks(false, staff?.bio_user_id ?? null);
  const pendingTasks = myTasks.filter((t: StaffTask) => t.status === "pending");
  const overdueTasks = pendingTasks.filter((t: StaffTask) => t.due_date < todayStr);

  const inpCls = "border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink">My Attendance</h1>
          {staff && (
            <p className="text-sm text-ink-dim">
              {staff.name}
              <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                staff.shift === "girls" ? "bg-info/10 text-info" : staff.shift === "helper" ? "bg-ok/10 text-ok" : "bg-gold/10 text-gold"
              }`}>
                {staff.shift === "girls" ? "Girls shift" : staff.shift === "helper" ? "Helper shift" : "Boys shift"}
              </span>
            </p>
          )}
        </div>
        {canSeeRepairs && (
          <Link href="/my-repairs"
            className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-gold hover:border-gold transition-colors">
            Repairs
          </Link>
        )}
        {canLogKolusu && (
          <Link href="/kolusu-sale"
            className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-gold hover:border-gold transition-colors">
            Kolusu Sale
          </Link>
        )}
        <button onClick={() => setShowGoogleReview(true)}
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-gold hover:border-gold transition-colors">
          ⭐ Review
        </button>
        <button onClick={handleLogout}
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-err hover:border-err transition-colors">
          Logout
        </button>
      </div>

      {error && <div className="bg-err/10 text-err text-sm px-4 py-3 rounded-xl">{error}</div>}

      {/* Last sync */}
      {lastSyncIso && (
        <p className="text-xs text-ink-dim text-center -mt-1">
          Last updated: <strong>{new Date(lastSyncIso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</strong>
        </p>
      )}

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="space-y-2">
          {announcements.map((a) => (
            <div key={a.id} className="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-gold-dark">📢 {a.title}</p>
              {a.body && <p className="text-sm text-ink mt-1 whitespace-pre-wrap">{a.body}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-line gap-x-0 gap-y-0">
        {([
          { key: "today",     label: "Today" },
          { key: "weekoffs",  label: "Week-offs" },
          { key: "monthly",   label: "Monthly" },
          { key: "requests",  label: "Requests" },
          ...(canSeeIncentive ? [{ key: "incentive", label: "Incentive" }] : []),
          { key: "chat",       label: "Chat" },
          { key: "tasks",      label: "Tasks" },
          { key: "policies",   label: "Policies" },
          { key: "kyc",        label: "KYC" },
        ] as { key: PageTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1 whitespace-nowrap ${
              tab === t.key ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {t.label}
            {t.key === "chat" && chatUnread > 0 && (
              <span className="bg-err text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
            {t.key === "tasks" && pendingTasks.length > 0 && (
              <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${overdueTasks.length > 0 ? "bg-err" : "bg-warn"}`}>
                {pendingTasks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TODAY TAB ─────────────────────────────────────────────────────────── */}
      {tab === "today" && (
        <div className="space-y-4">
          {/* Today's activity card */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink">
                Today — {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              {todayRow && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  todayRow.status === "leave"   ? "bg-err/10 text-err" :
                  todayRow.status === "late"    ? "bg-warn/10 text-warn" :
                                                  "bg-ok/10 text-ok"
                }`}>
                  {todayRow.status === "leave" ? "Absent" : todayRow.status === "late" ? "Late" : "Present"}
                </span>
              )}
              {!todayRow && !loading && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-err/10 text-err">Absent</span>
              )}
            </div>

            {loading ? (
              <p className="text-xs text-ink-dim py-4 text-center">Loading…</p>
            ) : todayRow && todayRow.punches.length > 0 ? (() => {
              // 3 punches = IN + Lunch out + Lunch in (still working); 4 = complete day with lunch
              const lunchStart   = todayRow.punches.length >= 3 ? todayRow.punches[1] : null;
              const lunchEnd     = todayRow.punches.length >= 3 ? todayRow.punches[2] : null;
              const lunchMins    = lunchStart && lunchEnd
                ? Math.round((new Date(lunchEnd).getTime() - new Date(lunchStart).getTime()) / 60000)
                : null;
              const lunchStatus  = lunchMins === null ? null : lunchMins > 70 ? "over" : lunchMins >= 60 ? "spare" : "ok";
              return (
                <div className="space-y-4">
                  {/* IN / OUT row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-ok/5 border border-ok/20 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-ok uppercase tracking-wide mb-1">IN</p>
                      <p className="text-2xl font-bold text-ok font-mono">{formatTime(todayRow.first_in)}</p>
                      {todayRow.late_minutes > 0 && (
                        <p className="text-xs text-warn mt-1 font-medium">{todayRow.late_minutes}m late</p>
                      )}
                    </div>
                    <div className="bg-canvas border border-line rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-1">OUT</p>
                      {todayRow.last_out ? (
                        <p className="text-2xl font-bold text-ink font-mono">{formatTime(todayRow.last_out)}</p>
                      ) : (
                        <p className="text-lg font-semibold text-ink-dim italic mt-0.5">Still in</p>
                      )}
                      {todayRow.ot_minutes > 0 && (
                        <p className="text-xs text-ok mt-1 font-medium">OT {formatMins(todayRow.ot_minutes)}</p>
                      )}
                    </div>
                  </div>

                  {/* Lunch break row */}
                  {lunchStart && lunchEnd ? (
                    <div className={`border rounded-xl px-4 py-3 ${
                      lunchStatus === "over"  ? "bg-err/5 border-err/20" :
                      lunchStatus === "spare" ? "bg-warn/5 border-warn/20" :
                                               "bg-warn/5 border-warn/20"
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-warn uppercase tracking-wide">Lunch Break</p>
                        {lunchMins !== null && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            lunchStatus === "over"  ? "bg-err/10 text-err" :
                            lunchStatus === "spare" ? "bg-warn/20 text-warn" :
                                                     "bg-ok/10 text-ok"
                          }`}>
                            {lunchStatus === "over" ? "Over" : lunchStatus === "spare" ? "Spare" : "OK"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <p className="text-base font-mono font-semibold text-ink">
                          {formatTime(lunchStart)}
                          <span className="text-ink-dim mx-2">→</span>
                          {formatTime(lunchEnd)}
                        </p>
                        {lunchMins !== null && (
                          <span className={`text-sm font-bold ${
                            lunchStatus === "over"  ? "text-err" :
                            lunchStatus === "spare" ? "text-warn" : "text-ok"
                          }`}>
                            {formatMins(lunchMins)}
                          </span>
                        )}
                      </div>
                      {lunchStatus === "over" && (
                        <p className="text-xs text-err mt-1">Lunch exceeded 1h 10m — will be noted</p>
                      )}
                      {lunchStatus === "spare" && (
                        <p className="text-xs text-warn mt-1">Lunch between 1h and 1h 10m</p>
                      )}
                    </div>
                  ) : todayRow.punches.length <= 2 ? (
                    <div className="bg-canvas border border-line rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Lunch Break</p>
                      <p className="text-sm text-ink-dim italic mt-1">Not recorded yet</p>
                    </div>
                  ) : null}

                  {/* Working hours */}
                  <div className="bg-info/5 border border-info/20 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-info uppercase tracking-wide mb-1">Total Working Hours</p>
                    {todayRow.effective_hours !== null ? (
                      <p className="text-2xl font-bold text-ink">{formatHours(todayRow.effective_hours)}</p>
                    ) : (
                      <p className="text-sm text-ink-dim italic">Calculating when you check out…</p>
                    )}
                    {todayRow.lunch_minutes !== null && todayRow.effective_hours !== null && (
                      <p className="text-xs text-ink-dim mt-1">
                        Total time − {formatMins(todayRow.lunch_minutes)} lunch = {formatHours(todayRow.effective_hours)}
                      </p>
                    )}
                  </div>

                  {todayRow.double_punch && (
                    <p className="text-xs text-warn font-medium text-center">Double punch detected — please check with admin</p>
                  )}
                </div>
              );
            })() : (
              <p className="text-xs text-ink-dim py-3 text-center">No punch records found for today.</p>
            )}
          </div>

          {/* Monthly summary strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Present", value: presentDays, color: "text-ok" },
              { label: "Absent",  value: absentDays,  color: absentDays > 0 ? "text-err" : "text-ink-dim" },
              { label: "Late",    value: totalLateMins > 0 ? formatMins(totalLateMins) : "—", color: totalLateMins > 0 ? "text-warn" : "text-ink-dim" },
              { label: "OT",      value: formatMins(totalOtMins), color: totalOtMins > 0 ? "text-ok" : "text-ink-dim" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-ink-dim mt-0.5">{c.label} · {monthLabel(todayMonth).split(" ")[0]}</p>
              </div>
            ))}
          </div>
          {monthFine > 0 && (
            <div className="bg-err/5 border border-err/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-err font-semibold">Late Fine — {monthLabel(todayMonth).split(" ")[0]}</p>
                <p className="text-[11px] text-ink-dim mt-0.5">
                  {netLateMins}m late × ₹{fineSettings?.late_fine_amt}/min
                  {fineSettings?.equalize_ot && totalOtMins > 0 && ` (after ${formatMins(totalOtMins)} OT offset)`}
                  {fineFromDate && ` · from ${fineFromDate}`}
                </p>
              </div>
              <p className="text-xl font-bold text-err">−₹{monthFine.toFixed(0)}</p>
            </div>
          )}

          <p className="text-xs text-ink-dim text-center">
            Boys: 9:30 AM – 9:30 PM · Girls: 9:30 AM – 8:30 PM · Grace till 9:50 AM
          </p>
        </div>
      )}

      {/* ── MONTHLY TAB ───────────────────────────────────────────────────────── */}
      {tab === "monthly" && (
        <div className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center gap-2">
            <button onClick={() => shiftMonth(-1)}
              className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas">◄</button>
            <span className="font-semibold text-ink w-44 text-center">{monthLabel(month)}</span>
            <button onClick={() => shiftMonth(1)} disabled={month >= todayMonth}
              className="px-2.5 py-1.5 border border-line rounded-lg2 text-sm hover:bg-canvas disabled:opacity-30">►</button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Present", value: presentDays, color: "text-ok" },
              { label: "Absent",  value: absentDays,  color: absentDays > 0 ? "text-err" : "text-ink-dim" },
              { label: "Late",    value: totalLateMins > 0 ? formatMins(totalLateMins) : "—", color: totalLateMins > 0 ? "text-warn" : "text-ink-dim" },
              { label: "OT",      value: formatMins(totalOtMins), color: totalOtMins > 0 ? "text-ok" : "text-ink-dim" },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-ink-dim mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
          {monthFine > 0 && (
            <div className="bg-err/5 border border-err/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-err font-semibold">Late Fine — {monthLabel(month).split(" ")[0]}</p>
                <p className="text-[11px] text-ink-dim mt-0.5">
                  {netLateMins}m late × ₹{fineSettings?.late_fine_amt}/min
                  {fineSettings?.equalize_ot && totalOtMins > 0 && ` (after ${formatMins(totalOtMins)} OT offset)`}
                  {fineFromDate && ` · from ${fineFromDate}`}
                </p>
              </div>
              <p className="text-xl font-bold text-err">−₹{monthFine.toFixed(0)}</p>
            </div>
          )}

          {/* Weekend absence alert */}
          {(() => {
            const approvedLeaveDates = new Set(
              (myLeaves as LeaveRequest[])
                .filter(l => l.status === "approved")
                .map(l => l.leave_date)
            );
            const weekendAbsent = rows.filter(r => {
              if (r.status !== "leave") return false;
              const [y, mo, d] = r.date.split("-").map(Number);
              const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
              return (dow === 0 || dow === 6) && !approvedLeaveDates.has(r.date);
            });
            if (!weekendAbsent.length) return null;
            return (
              <div className="bg-err/10 border border-err/20 rounded-xl px-4 py-3 space-y-1">
                <p className="text-sm font-semibold text-err">Weekend Absence Alert</p>
                <p className="text-xs text-ink">
                  {weekendAbsent.length} weekend day(s) absent without approved leave this month:
                </p>
                <ul className="text-xs text-ink-dim space-y-0.5 ml-2">
                  {weekendAbsent.map(r => (
                    <li key={r.date}>• {dayLabel(r.date)}</li>
                  ))}
                </ul>
                <p className="text-xs text-err font-medium mt-1">
                  Unapproved weekend absence may result in 2× salary deduction (admin discretion applies).
                </p>
              </div>
            );
          })()}

          {/* Day-by-day table */}
          {loading ? (
            <div className="text-center py-12 text-ink-dim text-sm">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-right px-3 py-2.5">IN</th>
                    <th className="text-right px-3 py-2.5">OUT</th>
                    <th className="text-right px-3 py-2.5">Hours</th>
                    <th className="text-right px-3 py-2.5">Lunch</th>
                    <th className="text-right px-3 py-2.5">Late</th>
                    <th className="text-right px-3 py-2.5">OT</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.date}
                      className={`border-b border-line last:border-0 ${r.status === "leave" ? "opacity-50" : ""} ${r.date === todayStr ? "bg-gold/5" : ""}`}>
                      <td className="px-4 py-2 font-mono text-xs">{dayLabel(r.date)}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {r.status === "leave" ? (
                            <span className="text-[10px] font-semibold bg-err/10 text-err px-1.5 py-0.5 rounded">Leave</span>
                          ) : r.status === "late" ? (
                            <span className="text-[10px] font-semibold bg-warn/10 text-warn px-1.5 py-0.5 rounded">Late</span>
                          ) : (
                            <span className="text-[10px] font-semibold bg-ok/10 text-ok px-1.5 py-0.5 rounded">Present</span>
                          )}
                          {r.double_punch && (
                            <span className="text-[9px] text-warn leading-none">dbl punch</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ok">{formatTime(r.first_in)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-ink-dim">{formatTime(r.last_out)}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatHours(r.effective_hours)}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.lunch_minutes !== null ? (
                          <span className={`font-medium ${
                            r.lunch_minutes > 70 ? "text-err" : r.lunch_minutes >= 60 ? "text-warn" : "text-ok"
                          }`}>
                            {formatMins(r.lunch_minutes)}
                          </span>
                        ) : r.punches.length >= 2 ? (
                          <span className="text-ink-dim">—</span>
                        ) : (
                          <span className="text-ink-dim">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-medium ${r.late_minutes > 0 ? "text-warn" : "text-ink-dim"}`}>
                        {r.late_minutes > 0 ? `${r.late_minutes}m` : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-medium ${r.ot_minutes > 0 ? "text-ok" : "text-ink-dim"}`}>
                        {r.ot_minutes > 0 ? formatMins(r.ot_minutes) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-ink-dim text-center pb-2">
            Boys shift: 9:30 AM – 9:30 PM · Girls shift: 9:30 AM – 8:30 PM · Grace till 9:50 AM
          </p>
        </div>
      )}

      {/* ── REQUESTS TAB ──────────────────────────────────────────────────────── */}
      {tab === "requests" && (
        <div className="space-y-4">
          {/* Permission Requests */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Permission Requests</p>
                <p className="text-xs text-ink-dim mt-0.5">Used {usedThisMonth}/2 this month</p>
              </div>
              {canRequest && !showPermForm && (
                <button onClick={() => setShowPermForm(true)}
                  className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
                  + Request Permission
                </button>
              )}
              {!canRequest && (
                <span className="text-xs text-err font-medium">Monthly limit reached</span>
              )}
            </div>

            {showPermForm && (
              <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                <p className="text-xs font-medium text-ink-dim">New Permission Request</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Date</label>
                    <input type="date" value={permForm.permission_date}
                      onChange={e => setPermForm(f => ({ ...f, permission_date: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">From</label>
                    <input type="time" value={permForm.from_time}
                      onChange={e => setPermForm(f => ({ ...f, from_time: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">To</label>
                    <input type="time" value={permForm.to_time}
                      onChange={e => setPermForm(f => ({ ...f, to_time: e.target.value }))}
                      className={inpCls} />
                  </div>
                  {(() => {
                    const mins = calcPermMinutes(permForm.from_time, permForm.to_time);
                    return mins > 0 ? (
                      <span className="text-xs text-ink-dim pb-1.5">{mins} min</span>
                    ) : null;
                  })()}
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-ink-dim block mb-1">Reason</label>
                    <input type="text" value={permForm.reason} placeholder="Briefly explain…"
                      onChange={e => setPermForm(f => ({ ...f, reason: e.target.value }))}
                      className={`${inpCls} w-full`} />
                  </div>
                </div>
                {permError && <p className="text-xs text-err">{permError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitPermission} disabled={createPerm.isPending}
                    className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                    {createPerm.isPending ? "Submitting…" : "Submit"}
                  </button>
                  <button onClick={() => { setShowPermForm(false); setPermError(null); }}
                    className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                </div>
              </div>
            )}

            {permissions.length > 0 ? (
              <div className="space-y-1">
                {(permissions as PermissionRequest[]).slice(0, 6).map(p => (
                  <div key={p.id} className="flex items-center gap-3 text-xs py-1 border-b border-line last:border-0">
                    <span className="text-ink-dim w-20">{p.permission_date}</span>
                    <span className="text-ink">
                      {p.from_time && p.to_time
                        ? `${p.from_time.slice(0, 5)} – ${p.to_time.slice(0, 5)} (${p.late_minutes}m)`
                        : `${p.late_minutes}m`}
                    </span>
                    <span className="flex-1 text-ink-dim truncate">{p.reason || "—"}</span>
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      p.status === "approved" ? "bg-ok/10 text-ok" :
                      p.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"
                    }`}>{p.status}</span>
                    {p.admin_note && <span className="text-ink-dim italic max-w-[100px] truncate">{p.admin_note}</span>}
                  </div>
                ))}
              </div>
            ) : !showPermForm ? (
              <p className="text-xs text-ink-dim">No requests yet.</p>
            ) : null}
          </div>

          {/* Leave Requests */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Leave Requests</p>
              {!showLeaveForm && (
                <button onClick={() => setShowLeaveForm(true)}
                  className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
                  + Request Leave
                </button>
              )}
            </div>

            {showLeaveForm && (
              <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                <p className="text-xs font-medium text-ink-dim">New Leave Request</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Date</label>
                    <input type="date" value={leaveForm.leave_date} min={todayStr}
                      onChange={e => setLeaveForm(f => ({ ...f, leave_date: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Type</label>
                    <select value={leaveForm.leave_type}
                      onChange={e => setLeaveForm(f => ({ ...f, leave_type: e.target.value }))}
                      className={inpCls}>
                      <option value="casual">Casual</option>
                      <option value="sick">Sick</option>
                      <option value="half_day">Half Day</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-ink-dim block mb-1">Reason (optional)</label>
                    <input type="text" value={leaveForm.reason} placeholder="e.g. family function"
                      onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                      className={`${inpCls} w-full`} />
                  </div>
                </div>
                {leaveError && <p className="text-xs text-err">{leaveError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleLeaveSubmit} disabled={submitLeave.isPending || !leaveForm.leave_date}
                    className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                    {submitLeave.isPending ? "Submitting…" : "Submit"}
                  </button>
                  <button onClick={() => { setShowLeaveForm(false); setLeaveError(null); }}
                    className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                </div>
              </div>
            )}

            {myLeaves.length > 0 ? (
              <div className="space-y-1">
                {(myLeaves as LeaveRequest[]).map(l => (
                  <div key={l.id} className="flex items-center gap-3 text-xs py-1 border-b border-line last:border-0">
                    <span className="text-ink-dim w-20">{l.leave_date}</span>
                    <span className="text-ink capitalize">{l.leave_type.replace("_", " ")}</span>
                    <span className="flex-1 text-ink-dim truncate">{l.reason || "—"}</span>
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      l.status === "approved" ? "bg-ok/10 text-ok" :
                      l.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"
                    }`}>{l.status}</span>
                    {l.admin_note && <span className="text-ink-dim italic max-w-[100px] truncate">{l.admin_note}</span>}
                  </div>
                ))}
              </div>
            ) : !showLeaveForm ? (
              <p className="text-xs text-ink-dim">No leave requests yet.</p>
            ) : null}
          </div>

          {/* Outside Duty Requests */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">Outside Duty</p>
                <p className="text-xs text-ink-dim mt-0.5">Came late due to shop work? Apply here.</p>
              </div>
              {!showDutyForm && (
                <button onClick={() => setShowDutyForm(true)}
                  className="text-xs bg-info text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
                  + Apply
                </button>
              )}
            </div>

            {showDutyForm && (
              <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                <p className="text-xs font-medium text-ink-dim">Outside Duty Application</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Date</label>
                    <input type="date" value={dutyForm.duty_date}
                      onChange={e => setDutyForm(f => ({ ...f, duty_date: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Expected arrival (opt.)</label>
                    <input type="time" value={dutyForm.expected_arrival}
                      onChange={e => setDutyForm(f => ({ ...f, expected_arrival: e.target.value }))}
                      className={inpCls} />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="text-xs text-ink-dim block mb-1">What work did you do? *</label>
                    <input type="text" value={dutyForm.description}
                      placeholder="e.g. Bank deposit, Supplier pickup…"
                      onChange={e => setDutyForm(f => ({ ...f, description: e.target.value }))}
                      className={`${inpCls} w-full`} />
                  </div>
                </div>
                {dutyError && <p className="text-xs text-err">{dutyError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setDutyError(null);
                      if (!staff || !dutyForm.description.trim()) {
                        setDutyError("Please describe the work done.");
                        return;
                      }
                      try {
                        await createDuty.mutateAsync({
                          bio_user_id: staff.bio_user_id,
                          duty_date: dutyForm.duty_date,
                          description: dutyForm.description.trim(),
                          expected_arrival: dutyForm.expected_arrival || undefined,
                          initiated_by: "staff",
                        });
                        setShowDutyForm(false);
                        setDutyForm({ duty_date: todayStr, description: "", expected_arrival: "" });
                        refetchDuties();
                      } catch (e: any) {
                        setDutyError(e?.message ?? "Failed to submit. Please try again.");
                      }
                    }}
                    disabled={createDuty.isPending || !dutyForm.description.trim()}
                    className="text-xs bg-info text-white px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                    {createDuty.isPending ? "Submitting…" : "Submit"}
                  </button>
                  <button onClick={() => { setShowDutyForm(false); setDutyError(null); }}
                    className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                </div>
              </div>
            )}

            {myDuties.length > 0 ? (
              <div className="space-y-1">
                {(myDuties as OutsideDuty[]).map(d => (
                  <div key={d.id} className="flex items-center gap-3 text-xs py-1 border-b border-line last:border-0">
                    <span className="text-ink-dim w-20">{d.duty_date}</span>
                    <span className="flex-1 text-ink truncate">{d.description}</span>
                    {d.expected_arrival && (
                      <span className="text-ink-dim font-mono">{d.expected_arrival.slice(0, 5)}</span>
                    )}
                    <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                      d.status === "approved" ? "bg-ok/10 text-ok" :
                      d.status === "rejected" ? "bg-err/10 text-err" : "bg-warn/10 text-warn"
                    }`}>{d.status}</span>
                    {d.admin_note && <span className="text-ink-dim italic max-w-[80px] truncate">{d.admin_note}</span>}
                  </div>
                ))}
              </div>
            ) : !showDutyForm ? (
              <p className="text-xs text-ink-dim">No outside duty records yet.</p>
            ) : null}
          </div>
        </div>
      )}

      {/* ── INCENTIVE TAB ─────────────────────────────────────────────────────── */}
      {tab === "incentive" && (
        <div className="space-y-4">
          {(incSheetsLoading || incSheetLoading) && (
            <p className="text-ink-dim text-sm">Loading…</p>
          )}

          {!incSheetsLoading && incSheets.length === 0 && (
            <div className="bg-canvas rounded-xl border border-line p-6 text-center text-ink-dim text-sm">
              No incentive sheets saved yet.
            </div>
          )}

          {incSheet && (incSheet.master_entries ?? []).length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-ink">
                  Incentive Rate Master
                  {incSheet.period && <span className="ml-2 text-xs text-ink-dim font-normal">{incSheet.period}</span>}
                </p>
                <input
                  type="text"
                  placeholder="Search code…"
                  value={masterSearch}
                  onChange={(e) => setMasterSearch(e.target.value)}
                  className="border border-line rounded-lg2 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold w-44 bg-white"
                />
              </div>
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-canvas text-ink-dim border-b border-line">
                      <th className="text-left px-3 py-2.5">Incentive Code</th>
                      <th className="text-right px-3 py-2.5">Rate (₹/g)</th>
                      <th className="text-right px-3 py-2.5">Min Wastage %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(incSheet.master_entries as MasterEntry[])
                      .filter((m: MasterEntry) =>
                        !masterSearch || m.code.toUpperCase().includes(masterSearch.toUpperCase())
                      )
                      .map((m: MasterEntry, i: number) => (
                        <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/30">
                          <td className="px-3 py-2 font-mono font-medium">{m.code}</td>
                          <td className="px-3 py-2 text-right text-ok font-semibold">{m.rate}</td>
                          <td className="px-3 py-2 text-right text-ink-dim">{m.minWastage}%</td>
                        </tr>
                      ))
                    }
                    {(incSheet.master_entries as MasterEntry[]).filter((m: MasterEntry) =>
                      !masterSearch || m.code.toUpperCase().includes(masterSearch.toUpperCase())
                    ).length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-4 text-center text-ink-dim">No matching codes.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CHAT TAB ──────────────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <div className="flex flex-col gap-3" style={{ height: "65vh" }}>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-line shadow-soft p-3 space-y-1 min-h-0">
            {chatMessages.length === 0 && (
              <p className="text-center text-ink-dim text-sm py-8">No messages yet. Say hi!</p>
            )}
            {chatMessages.filter((m) => senderRole === "admin" || m.sender_name !== "MyBuddy").map((m) => {
              const isOwn = m.sender_id === senderId;
              const isAdmin = senderRole === "admin";
              const canEdit = (isOwn || isAdmin) && !m.is_deleted;
              const canDelete = isOwn || isAdmin;
              return (
                <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}>
                  <div className={`max-w-[78%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                    {!isOwn && !m.is_deleted && (
                      <span className="text-[10px] font-semibold text-gold-dark px-1 mb-0.5">{m.sender_name}</span>
                    )}
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      m.is_deleted
                        ? "bg-canvas border border-line text-ink-dim italic text-xs"
                        : isOwn
                        ? "bg-gold text-white"
                        : "bg-canvas border border-line text-ink"
                    }`}>
                      {editingId === m.id ? (
                        <div className="flex gap-2 items-center min-w-[180px]">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditMessage(m.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="flex-1 bg-white border border-line rounded px-2 py-0.5 text-xs text-ink focus:outline-none"
                            autoFocus
                          />
                          <button onClick={() => saveEditMessage(m.id)} className="text-xs text-ok font-semibold">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-ink-dim">✕</button>
                        </div>
                      ) : m.is_deleted ? (
                        "This message was deleted"
                      ) : (
                        <span className="whitespace-pre-wrap break-words">{m.message}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-2 mt-0.5 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                      <span className="text-[10px] text-ink-dim">{chatTime(m.created_at)}</span>
                      {m.edited_at && !m.is_deleted && (
                        <span className="text-[10px] text-ink-dim">(edited)</span>
                      )}
                      {canEdit && editingId !== m.id && (
                        <button onClick={() => { setEditingId(m.id); setEditText(m.message); }}
                          className="text-[10px] text-ink-dim hover:text-info">Edit</button>
                      )}
                      {canDelete && !m.is_deleted && (
                        <button onClick={() => softDeleteMessage(m.id)}
                          className="text-[10px] text-ink-dim hover:text-err">Delete</button>
                      )}
                      {isAdmin && m.is_deleted && (
                        <button onClick={() => hardDeleteMessage(m.id)}
                          className="text-[10px] text-err hover:underline">Remove</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0">
            <div className="flex gap-2 bg-white border border-line rounded-xl px-3 py-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
                }}
                placeholder={senderName ? `Message as ${senderName}…` : "Loading…"}
                disabled={!senderName}
                className="flex-1 text-sm focus:outline-none bg-transparent"
              />
              <button
                onClick={sendChatMessage}
                disabled={chatSending || !chatInput.trim() || !senderName}
                className="bg-gold text-white px-4 py-1.5 rounded-lg2 text-sm font-medium disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POLICIES TAB ──────────────────────────────────────────────────────── */}
      {tab === "policies" && <PoliciesTab />}

      {tab === "weekoffs" && <WeekoffsView />}

      {/* ── KYC TAB ───────────────────────────────────────────────────────────── */}
      {tab === "kyc" && (
        <div className="space-y-4">
          {/* Status banner */}
          {myKyc && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              myKyc.status === "verified"  ? "bg-ok/10 text-ok border border-ok/20" :
              myKyc.status === "rejected" ? "bg-err/10 text-err border border-err/20" :
              "bg-warn/10 text-warn border border-warn/20"
            }`}>
              KYC {myKyc.status === "verified" ? "Verified" : myKyc.status === "rejected" ? "Rejected" : "Pending review"}
              {myKyc.admin_note && <span className="ml-2 font-normal opacity-80">— {myKyc.admin_note}</span>}
            </div>
          )}

          {/* DigiLocker shortcut */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-blue-800">Step 1 — Verify via DigiLocker (Optional but Recommended)</p>
            <p className="text-xs text-blue-700">DigiLocker is the Government of India's digital document wallet. Log in with your Aadhaar-linked mobile to access your documents.</p>
            <div className="flex items-center gap-3 flex-wrap">
              <a href="https://www.digilocker.gov.in" target="_blank" rel="noopener noreferrer"
                className="text-xs bg-blue-700 text-white px-3 py-1.5 rounded-lg2 hover:bg-blue-800">
                Open DigiLocker →
              </a>
              <label className="flex items-center gap-1.5 text-xs text-blue-800 cursor-pointer">
                <input type="checkbox"
                  checked={kycForm.digilocker_confirmed || (myKyc?.digilocker_confirmed ?? false)}
                  onChange={e => setKycForm(f => ({ ...f, digilocker_confirmed: e.target.checked }))}
                  className="accent-blue-700" />
                I have verified my documents on DigiLocker
              </label>
            </div>
          </div>

          {/* Aadhaar last 4 + Selfie */}
          <div className="bg-white rounded-xl border border-line p-4 space-y-4">
            <p className="text-sm font-semibold text-ink">Step 2 — Identity Details</p>

            <div>
              <label className="text-xs text-ink-dim block mb-1">Last 4 digits of Aadhaar number</label>
              <input type="text" inputMode="numeric" maxLength={4} placeholder="e.g. 5678"
                defaultValue={myKyc?.aadhaar_last4 ?? ""}
                onChange={e => setKycForm(f => ({ ...f, aadhaar_last4: e.target.value.replace(/\D/g,"") }))}
                className={`${inpCls} w-28 tracking-widest font-mono`} />
              <p className="text-[11px] text-ink-dim mt-0.5">Only the last 4 digits are stored — your full Aadhaar is not saved.</p>
            </div>

            {/* Selfie */}
            <div>
              <label className="text-xs text-ink-dim block mb-1">Selfie Photo</label>
              {(kycSelfie || myKyc?.selfie_data) && !kycCameraOn ? (
                <div className="flex items-start gap-3">
                  <img src={kycSelfie ?? myKyc!.selfie_data!} alt="selfie"
                    className="w-28 h-20 object-cover rounded-lg border border-line" />
                  <button type="button" onClick={retakeKycSelfie}
                    className="text-xs border border-line px-2 py-1 rounded-lg2 hover:bg-canvas">Retake</button>
                </div>
              ) : kycCameraOn ? (
                <div className="space-y-2">
                  <video ref={kycVideoRef} autoPlay playsInline muted
                    className="w-64 h-48 rounded-lg bg-black object-cover" />
                  <div className="flex gap-2">
                    <button type="button" onClick={captureKycSelfie}
                      className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2">Capture</button>
                    <button type="button" onClick={() => { kycStream?.getTracks().forEach(t => t.stop()); setKycCameraOn(false); }}
                      className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={startKycCamera}
                  className="text-xs bg-canvas border border-line px-3 py-1.5 rounded-lg2 hover:bg-gold/10">
                  Open Camera &amp; Take Selfie
                </button>
              )}
            </div>
          </div>

          {/* Physical documents checklist */}
          <div className="bg-white rounded-xl border border-line p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Step 3 — Documents Given to Owner</p>
            <p className="text-xs text-ink-dim">Tick each document you have physically submitted to the shop owner.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {KYC_DOCS.map(doc => {
                const checked = (kycForm.documents_given.includes(doc.key)) ||
                  (!kycForm.documents_given.length && (myKyc?.documents_given ?? []).includes(doc.key));
                return (
                  <label key={doc.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox"
                      checked={kycForm.documents_given.length > 0
                        ? kycForm.documents_given.includes(doc.key)
                        : (myKyc?.documents_given ?? []).includes(doc.key)}
                      onChange={e => {
                        const base = kycForm.documents_given.length > 0
                          ? kycForm.documents_given
                          : (myKyc?.documents_given ?? []);
                        setKycForm(f => ({
                          ...f,
                          documents_given: e.target.checked
                            ? [...base, doc.key]
                            : base.filter(k => k !== doc.key),
                        }));
                      }}
                      className="accent-gold" />
                    {doc.label}
                  </label>
                );
              })}
            </div>
          </div>

          {kycError && <p className="text-xs text-err">{kycError}</p>}

          {myKyc?.status !== "verified" && (
            <button type="button" onClick={submitKyc} disabled={kycSaving}
              className="text-sm bg-gold text-white px-4 py-2 rounded-lg2 disabled:opacity-40">
              {kycSaving ? "Saving…" : myKyc ? "Update KYC" : "Submit KYC"}
            </button>
          )}
        </div>
      )}

      {/* ── TASKS TAB ─────────────────────────────────────────────────────────── */}
      {tab === "tasks" && (
        <StaffTasksTab
          tasks={myTasks}
          staffName={staff?.name ?? ""}
          bioUserId={staff?.bio_user_id ?? null}
          todayStr={todayStr}
        />
      )}
    </div>
  );
}

// ── Policies tab (staff read-only view of SOP documents) ─────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  shop_opening: "Shop Opening",
  shop_closing: "Shop Closing",
  sales:        "Sales",
  exchange:     "Exchange",
  return:       "Return",
  general:      "General",
};

function PoliciesTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch]         = useState("");

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["sop_docs_staff"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sop_documents")
        .select("id, title, category, content, sort_order, updated_at")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; category: string; content: string; sort_order: number; updated_at: string }[];
    },
  });

  const filtered = docs.filter((d) =>
    !search.trim() ||
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.content.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const categories = [...new Set(filtered.map((d) => d.category))];

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search policies…"
        className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
      />

      {isLoading ? (
        <p className="text-ink-dim text-sm text-center py-8">Loading policies…</p>
      ) : filtered.length === 0 ? (
        <p className="text-ink-dim text-sm text-center py-8">
          {search ? "No matching policies." : "No policies published yet."}
        </p>
      ) : (
        <div className="space-y-5">
          {categories.map((cat) => {
            const catDocs = filtered.filter((d) => d.category === cat);
            return (
              <div key={cat}>
                <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </p>
                <div className="space-y-2">
                  {catDocs.map((doc) => (
                    <div key={doc.id} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                      <button
                        onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-canvas/40 transition-colors"
                      >
                        <span className="text-ink-dim text-xs shrink-0">{expandedId === doc.id ? "▼" : "▶"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{doc.title}</p>
                          <p className="text-[10px] text-ink-dim mt-0.5">
                            Updated {new Date(doc.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </button>
                      {expandedId === doc.id && (
                        <div className="border-t border-line bg-canvas px-5 py-4">
                          <pre className="text-sm text-ink whitespace-pre-wrap font-sans leading-relaxed">{doc.content}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Staff Tasks (staff view) ──────────────────────────────────────────────────
function StaffTasksTab({ tasks, staffName, bioUserId, todayStr }: {
  tasks: StaffTask[];
  staffName: string;
  bioUserId: string | null;
  todayStr: string;
}) {
  const completeTask = useCompleteTask();
  const createTask   = useCreateTask();
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "completed" | "all">("pending");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", description: "", due_date: todayStr });

  const filtered = tasks.filter(t => filter === "all" || t.status === filter);

  async function handleComplete(task: StaffTask) {
    await completeTask.mutateAsync({
      id: task.id,
      staff_name: staffName,
      task_title: task.title,
      completed_note: noteMap[task.id] || undefined,
    });
    setCompletingId(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!bioUserId || !createForm.title || !createForm.due_date) return;
    await createTask.mutateAsync({
      title: createForm.title,
      description: createForm.description || undefined,
      assigned_to: bioUserId,
      created_by: bioUserId,
      due_date: createForm.due_date,
    });
    setCreateForm({ title: "", description: "", due_date: todayStr });
    setShowCreate(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-ink">My Tasks</h2>
          <button onClick={() => setShowCreate(v => !v)}
            className="text-xs text-gold border border-gold/30 px-2.5 py-1 rounded-lg2 hover:bg-gold/5">
            {showCreate ? "Cancel" : "+ New Task"}
          </button>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-line text-xs w-fit">
          {(["pending", "completed", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas"}`}>
              {f === "pending" ? `Pending (${tasks.filter(t => t.status === "pending").length})`
                : f === "completed" ? `Done (${tasks.filter(t => t.status === "completed").length})`
                : `All (${tasks.length})`}
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-gold/30 rounded-xl p-4 shadow-soft space-y-3">
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">New Task (for yourself)</p>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Task *</label>
              <input required value={createForm.title}
                onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Call customer about order"
                className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-ink-dim block mb-1">Description (optional)</label>
                <input value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="More details…"
                  className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
              </div>
              <div>
                <label className="text-xs text-ink-dim block mb-1">Due Date *</label>
                <input required type="date" value={createForm.due_date}
                  onChange={e => setCreateForm(f => ({ ...f, due_date: e.target.value }))}
                  className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={createTask.isPending}
              className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
              {createTask.isPending ? "Saving…" : "Add Task"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)}
              className="border border-line text-sm px-4 py-1.5 rounded-lg2 text-ink-dim">Cancel</button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-line p-8 text-center text-ink-dim shadow-soft text-sm">
          {filter === "pending" ? "No pending tasks — you are all caught up!" : "No tasks here."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task: StaffTask) => {
            const isOverdue = task.status === "pending" && task.due_date < todayStr;
            const isDueToday = task.status === "pending" && task.due_date === todayStr;
            const isCompleting = completingId === task.id;
            return (
              <div key={task.id} className={`bg-white rounded-xl border shadow-soft p-4 space-y-2 ${
                isOverdue ? "border-err/40" : isDueToday ? "border-warn/40" : "border-line"
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                      task.status === "completed" ? "bg-ok" : isOverdue ? "bg-err" : isDueToday ? "bg-warn" : "bg-gold"
                    }`} />
                    <div>
                      <p className={`text-sm font-semibold ${task.status === "completed" ? "line-through text-ink-dim" : "text-ink"}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-ink-dim mt-0.5">{task.description}</p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    task.status === "completed" ? "bg-ok/10 text-ok" :
                    isOverdue ? "bg-err/10 text-err" :
                    isDueToday ? "bg-warn/10 text-warn" : "bg-gold/10 text-gold"
                  }`}>
                    {task.status === "completed" ? "Done" : isOverdue ? "Overdue" : isDueToday ? "Due today" : "Pending"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-ink-dim pl-5">
                  <span>Due <span className={`font-medium ${isOverdue ? "text-err" : isDueToday ? "text-warn" : "text-ink"}`}>{task.due_date}</span></span>
                  {task.status === "completed" && task.completed_at && (
                    <span className="text-ok">Completed {new Date(task.completed_at).toLocaleDateString("en-IN")}</span>
                  )}
                  {task.completed_note && (
                    <span className="text-ok">— {task.completed_note}</span>
                  )}
                </div>

                {task.status === "pending" && (
                  <div className="pl-5">
                    {!isCompleting ? (
                      <button onClick={() => setCompletingId(task.id)}
                        className="text-xs bg-ok text-white px-3 py-1.5 rounded-lg2 hover:opacity-90">
                        Mark as Done
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Add a note (optional)"
                          value={noteMap[task.id] ?? ""}
                          onChange={e => setNoteMap(m => ({ ...m, [task.id]: e.target.value }))}
                          className="w-full border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ok"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleComplete(task)} disabled={completeTask.isPending}
                            className="text-xs bg-ok text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50 hover:opacity-90">
                            {completeTask.isPending ? "Saving…" : "Confirm Done"}
                          </button>
                          <button onClick={() => setCompletingId(null)}
                            className="text-xs border border-line px-3 py-1.5 rounded-lg2 text-ink-dim">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* ── Google Review full-screen overlay ── */}
    {showGoogleReview && (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
        onClick={() => setShowGoogleReview(false)}
      >
        <p className="absolute top-4 right-4 text-xs text-gray-400">Tap anywhere to close</p>
        <div className="flex flex-col items-center gap-6 px-8 text-center" onClick={(e) => e.stopPropagation()}>
          <div>
            <span className="font-bold tracking-tight text-6xl">
              <span style={{ color: "#4285F4" }}>G</span>
              <span style={{ color: "#EA4335" }}>o</span>
              <span style={{ color: "#FBBC05" }}>o</span>
              <span style={{ color: "#4285F4" }}>g</span>
              <span style={{ color: "#34A853" }}>l</span>
              <span style={{ color: "#EA4335" }}>e</span>
            </span>
            <p className="text-gray-400 text-sm mt-1 font-medium tracking-widest uppercase">Review</p>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800 leading-tight">Enjoyed shopping<br />with us?</h1>
            <p className="text-gray-500 mt-2 text-lg">Share your experience on Google</p>
          </div>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(i => <span key={i} className="text-5xl" style={{ color: "#FBBC05" }}>★</span>)}
          </div>
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 shadow-lg">
            <img src="/google-review-qr.png" alt="Google Review QR Code" className="w-64 h-64 object-contain" />
          </div>
          <div>
            <p className="text-gray-700 font-semibold text-lg">Scan to write a review</p>
            <p className="text-gray-400 text-sm mt-1">Sabarinathan Jewellery</p>
          </div>
        </div>
        <button
          className="absolute bottom-6 px-6 py-2 rounded-full border border-gray-300 text-gray-500 text-sm"
          onClick={() => setShowGoogleReview(false)}
        >
          Close
        </button>
      </div>
    )}
  );
}
