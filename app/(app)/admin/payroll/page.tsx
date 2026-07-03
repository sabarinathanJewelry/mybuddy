"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useMonthlyAttendanceSummary, useApprovedPermsByMonth, useApprovedLeavesByMonth } from "@/modules/attendance/api";
import { inr } from "@/lib/format";
import { clsx } from "clsx";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PayEntry {
  id: string;
  name: string;
  basicSalary: number;
  noOfLeave: number;
  extraLeave: number;
  deduction: number;      // stored and editable; auto-updates when extraLeave changes
  fine: number;
  advance: number;
  incentive: number;
  arrear: number;
  paid?: boolean;
  payMode?: "cash" | "bank";
}

function derive(e: PayEntry) {
  const calculated = parseFloat((e.basicSalary - e.deduction - (e.fine ?? 0) - e.advance + e.incentive + e.arrear).toFixed(2));
  return { calculated, salary: Math.round(calculated) };
}

function blankEntry(name = ""): PayEntry {
  return { id: crypto.randomUUID(), name, basicSalary: 0, noOfLeave: 0, extraLeave: 0, deduction: 0, fine: 0, advance: 0, incentive: 0, arrear: 0 };
}

function isWeekend(dateStr: string): boolean {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return [0, 6].includes(new Date(Date.UTC(y, mo - 1, d)).getUTCDay());
}

// Convert "May 2026" → "2026-05"
function periodToMonth(period: string): string | null {
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const parts = period.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const mi = MONTHS.indexOf(parts[0].toLowerCase());
  const y  = parseInt(parts[parts.length - 1]);
  if (mi === -1 || isNaN(y)) return null;
  return `${y}-${String(mi + 1).padStart(2, "0")}`;
}

// ─── Payslip HTML ──────────────────────────────────────────────────────────────
function inrFmt(n: number) {
  return "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: n % 1 !== 0 ? 2 : 0 });
}
function generatePayslip(e: PayEntry, period: string) {
  const d = derive(e);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Payslip — ${e.name} — ${period}</title>
<style>
body{font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#1a1a1a}
h1{text-align:center;font-size:18px;margin:0;color:#b8860b}
h2{text-align:center;font-size:13px;color:#666;margin:4px 0 20px}
.nm{font-size:16px;font-weight:bold;text-align:center;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
td{padding:7px 10px;border-bottom:1px solid #eee;font-size:13px}
td:last-child{text-align:right}
.ded td{color:#c0392b}.add td{color:#27ae60}
.tot td{border-top:2px solid #b8860b;font-weight:bold;font-size:15px;color:#b8860b}
@media print{body{margin:20px}}
</style></head><body>
<h1>SABARINATHAN JEWELLERY</h1>
<h2>Salary Slip — ${period}</h2>
<p class="nm">${e.name}</p>
<table>
<tr><td>Basic Salary</td><td>${inrFmt(e.basicSalary)}</td></tr>
${e.noOfLeave > 0 ? `<tr><td style="color:#888;font-size:12px">Leaves taken</td><td style="color:#888;font-size:12px">${e.noOfLeave} day${e.noOfLeave !== 1 ? "s" : ""} (${e.extraLeave} excess)</td></tr>` : ""}
${e.deduction > 0 ? `<tr class="ded"><td>Leave Deduction</td><td>− ${inrFmt(e.deduction)}</td></tr>` : ""}
${(e.fine ?? 0) > 0 ? `<tr class="ded"><td>Fine</td><td>− ${inrFmt(e.fine ?? 0)}</td></tr>` : ""}
${e.advance > 0 ? `<tr class="ded"><td>Advance Recovered</td><td>− ${inrFmt(e.advance)}</td></tr>` : ""}
${e.incentive > 0 ? `<tr class="add"><td>Incentive</td><td>+ ${inrFmt(e.incentive)}</td></tr>` : ""}
${e.arrear > 0 ? `<tr class="add"><td>Arrear</td><td>+ ${inrFmt(e.arrear)}</td></tr>` : ""}
<tr class="tot" style="${d.salary < 0 ? "color:#c0392b" : ""}"><td>Net Salary</td><td>${d.salary < 0 ? "− " : ""}${inrFmt(d.salary)}</td></tr>
</table>
<p style="font-size:11px;color:#aaa;text-align:center;margin-top:24px">
Generated ${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}
</p>
<script>window.onload=()=>window.print();</script>
</body></html>`;
}

// ─── Shared input styles ────────────────────────────────────────────────────────
const cinp = "border border-line rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold text-right w-full";
function NumCell({ value, onChange, highlight, warn, readOnly }: { value: number; onChange: (v: number) => void; highlight?: boolean; warn?: boolean; readOnly?: boolean }) {
  if (readOnly) return (
    <div className={clsx("text-xs text-right px-1 py-1.5 font-mono", warn && "text-err font-medium", highlight && "font-medium")}>
      {value > 0 ? value.toLocaleString("en-IN") : <span className="text-ink-dim/40">—</span>}
    </div>
  );
  return (
    <input type="number" value={value || ""} placeholder="0"
      onFocus={e => e.target.select()}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className={clsx(cinp, highlight && "bg-gold/5 font-medium", warn && "bg-err/5 text-err font-medium")} />
  );
}

// ─── Incentive calc (mirrors incentive-calc page) ──────────────────────────────
// lockedRows: { "rowIdx": { staff, period } } — rows already paid; skip them
// paidOverridesOnly: when true, only count items manually marked paid (balanceZero override)
function calcStaffIncentives(
  sheetData: any,
  lockedRows: Record<string, { staff: string; period: string }> = {},
  paidOverridesOnly = false
): Map<string, number> {
  const rawData = sheetData.raw_data as string;
  const overrides = sheetData.overrides ?? {};
  const defaultSplit = sheetData.default_split ?? 70;
  const masterEntries = sheetData.master_entries ?? [];
  const mapperEntries = sheetData.mapper_entries ?? [];
  const lines = rawData.split("\n").map((l: string) => l.trimEnd());
  const hi = lines.findIndex((l: string) => /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l));
  if (hi < 0) return new Map();
  const staffInc = new Map<string, number>();
  lines.slice(hi + 1).forEach((line: string, i: number) => {
    if (lockedRows[String(i)]) return; // already paid in a previous period
    const c = line.split("\t");
    const netWt = parseFloat((c[8] ?? "").match(/[\d.]+/)?.[0] ?? "0") || 0;
    if (netWt <= 0) return;
    const ov = overrides[i] ?? {};
    // arrear mode: only items explicitly marked paid (had a balance, now cleared)
    if (paidOverridesOnly && !ov.balanceZero) return;
    const balance = ov.balanceZero ? 0 : Math.max(0, parseFloat((c[7] ?? "").match(/[-\d.]+/)?.[0] ?? "0") || 0);
    if (balance > 0) return;
    const sp1 = (c[5] ?? "").trim();
    const sp2 = (c[6] ?? "").trim();
    const split = ov.sp1Share ?? defaultSplit;
    const product = (c[1] ?? "").trim().toUpperCase();
    const rawWastage = parseFloat((c[3] ?? "").match(/[\d.]+/)?.[0] ?? "0") || 0;
    const wastage = ov.wastage ?? rawWastage;
    const mapEntry = mapperEntries.find((m: any) => m.erpName?.toUpperCase() === product);
    let code = (mapEntry?.incentiveCode ?? product).toUpperCase();
    if (code === "92.5-S" && netWt >= 20) code = "92.5-L";
    const master = masterEntries.find((m: any) => m.code?.toUpperCase() === code);
    if (!master || master.rate <= 0) return;
    const minW = ov.minWastage ?? master.minWastage ?? 0;
    if (wastage < minW) return;
    const total = parseFloat((master.rate * netWt).toFixed(2));
    const sp1Inc = sp2 ? parseFloat((total * split / 100).toFixed(2)) : total;
    const sp2Inc = sp2 ? parseFloat((total * (100 - split) / 100).toFixed(2)) : 0;
    if (sp1) staffInc.set(sp1, (staffInc.get(sp1) ?? 0) + sp1Inc);
    if (sp2) staffInc.set(sp2, (staffInc.get(sp2) ?? 0) + sp2Inc);
  });
  return staffInc;
}

// Returns row indices that are eligible (balance=0, wastage ok, has rate) for a given staff member
function getEligibleRowsForStaff(
  sheetData: any,
  staffName: string,
  lockedRows: Record<string, { staff: string; period: string }>
): number[] {
  const rawData = sheetData.raw_data as string;
  const overrides = sheetData.overrides ?? {};
  const defaultSplit = sheetData.default_split ?? 70;
  const masterEntries = sheetData.master_entries ?? [];
  const mapperEntries = sheetData.mapper_entries ?? [];
  const lines = rawData.split("\n").map((l: string) => l.trimEnd());
  const hi = lines.findIndex((l: string) => /date/i.test(l) && /product/i.test(l) && /net.?wt/i.test(l));
  if (hi < 0) return [];
  const indices: number[] = [];
  lines.slice(hi + 1).forEach((line: string, i: number) => {
    if (lockedRows[String(i)]) return;
    const c = line.split("\t");
    const netWt = parseFloat((c[8] ?? "").match(/[\d.]+/)?.[0] ?? "0") || 0;
    if (netWt <= 0) return;
    const ov = overrides[i] ?? {};
    const balance = ov.balanceZero ? 0 : Math.max(0, parseFloat((c[7] ?? "").match(/[-\d.]+/)?.[0] ?? "0") || 0);
    if (balance > 0) return;
    const sp1 = (c[5] ?? "").trim();
    const sp2 = (c[6] ?? "").trim();
    if (sp1 !== staffName && sp2 !== staffName) return;
    const split = ov.sp1Share ?? defaultSplit;
    const product = (c[1] ?? "").trim().toUpperCase();
    const rawWastage2 = parseFloat((c[3] ?? "").match(/[\d.]+/)?.[0] ?? "0") || 0;
    const wastage2 = ov.wastage ?? rawWastage2;
    const mapEntry = mapperEntries.find((m: any) => m.erpName?.toUpperCase() === product);
    let code = (mapEntry?.incentiveCode ?? product).toUpperCase();
    if (code === "92.5-S" && netWt >= 20) code = "92.5-L";
    const master = masterEntries.find((m: any) => m.code?.toUpperCase() === code);
    if (!master || master.rate <= 0) return;
    const minW = ov.minWastage ?? master.minWastage ?? 0;
    if (wastage2 < minW) return;
    void split; // split used in calc, row is eligible
    indices.push(i);
  });
  return indices;
}

// ─── Main page ─────────────────────────────────────────────────────────────────
type LoadStep = "pick_incentive" | "map_names" | null;

export default function PayrollPage() {
  const qc = useQueryClient();

  const [period, setPeriod] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
  });
  const [entries, setEntries]           = useState<PayEntry[]>([]);
  const [savedSheetId, setSavedSheetId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus]     = useState<"idle"|"saving"|"saved">("idle");

  // ── Incentive load flow
  const [loadStep, setLoadStep]     = useState<LoadStep>(null);
  const [pendingInc, setPendingInc] = useState<Map<string, number>>(new Map());
  const [nameMap, setNameMap]       = useState<Record<string, string>>({});
  const [mapSaving, setMapSaving]   = useState(false);

  // ── Payment status
  const [payingId, setPayingId] = useState<string | null>(null);

  // ── Incentive load mode
  const [loadAsArrear, setLoadAsArrear] = useState(false);

  // ── Incentive sheet lock tracking
  const [incSheetId, setIncSheetId]         = useState<string | null>(null);
  const [incSheetData, setIncSheetData]     = useState<any>(null);
  const [incLockedRows, setIncLockedRows]   = useState<Record<string, { staff: string; period: string }>>({});
  const [lockedStaff, setLockedStaff]       = useState<Set<string>>(new Set());

  // ── Inactive staff picker
  const [showInactivePicker, setShowInactivePicker] = useState(false);
  const { data: inactiveStaff = [] } = useQuery({
    queryKey: ["staff_inactive"],
    queryFn: async () => {
      const { data } = await supabase().from("staff").select("id, name, monthly_salary, bio_user_id").eq("active", false).order("name");
      return (data ?? []) as { id: string; name: string; monthly_salary: number; bio_user_id: string }[];
    },
  });

  // ── Attendance load
  const attMonth = periodToMonth(period) ?? "";
  // Include bio_user_ids of any deactivated staff already in the entries sheet
  const extraBioIds = useMemo(() => {
    const nameToInactive = new Map(inactiveStaff.map(s => [s.name.toUpperCase(), s.bio_user_id]));
    return entries
      .map(e => nameToInactive.get(e.name.toUpperCase()))
      .filter((id): id is string => !!id);
  }, [entries, inactiveStaff]);
  const { data: attSummary = [], isFetching: attLoading } = useMonthlyAttendanceSummary(attMonth, extraBioIds);
  const { data: monthPerms  = [] } = useApprovedPermsByMonth(attMonth);
  const { data: monthLeaves = [] } = useApprovedLeavesByMonth(attMonth);
  const { data: attSettings = null } = useQuery({
    queryKey: ["attendance_settings", attMonth],
    enabled: !!attMonth,
    queryFn: async () => {
      const key = `attendance_settings_${attMonth}`;
      const { data } = await supabase().from("app_settings").select("value").eq("key", key).maybeSingle();
      return (data?.value ?? null) as {
        late_fine_amt?: number; fine_mode?: "day" | "minute";
        apply_fine?: boolean; equalize_ot?: boolean; fine_from_date?: string;
      } | null;
    },
  });
  const [attApplied, setAttApplied] = useState(false);
  const prevAttRef = useRef<string>("");  // tracks last-applied month

  // ── Queries
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff_for_payroll"],
    queryFn: async () => {
      const { data } = await supabase().from("staff").select("id, name, monthly_salary, active, bio_user_id").eq("active", true).order("name");
      return (data ?? []) as { id: string; name: string; monthly_salary: number; active: boolean; bio_user_id: string }[];
    },
  });
  const { data: savedSheets = [] } = useQuery({
    queryKey: ["payroll_sheets"],
    queryFn: async () => {
      const { data } = await supabase().from("payroll_sheets").select("id, period, updated_at").order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; updated_at: string }[];
    },
  });
  const { data: incentiveSheets = [] } = useQuery({
    queryKey: ["incentive_sheets"],
    queryFn: async () => {
      const { data } = await supabase().from("incentive_sheets").select("id, period, updated_at").order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; updated_at: string }[];
    },
  });
  const { data: savedNameMap = [] } = useQuery({
    queryKey: ["staff_name_map"],
    queryFn: async () => {
      const { data } = await supabase().from("staff_name_map").select("incentive_name, staff_name");
      return (data ?? []) as { incentive_name: string; staff_name: string }[];
    },
  });

  const payrollNames = useMemo(() => {
    const fromStaff = staffList.map(s => s.name.toUpperCase());
    const fromEntries = entries.map(e => e.name).filter(Boolean);
    return [...new Set([...fromStaff, ...fromEntries])].sort();
  }, [staffList, entries]);

  // ── Calculate fine from attendance settings (mirrors MonthlyTab logic)
  function calcAttFine(att: typeof attSummary[0]): number {
    if (!attSettings?.apply_fine) return 0;
    const fineAmt  = attSettings.late_fine_amt ?? 100;
    const fineMode = attSettings.fine_mode ?? "day";
    const fromDate = attSettings.fine_from_date ?? "";
    const eqOt     = attSettings.equalize_ot ?? true;
    const pd = new Set(monthPerms.filter(p => p.bio_user_id === att.bio_user_id).map(p => p.permission_date));
    const lateDays = att.daily.filter(d => d.is_late && !pd.has(d.date) && (!fromDate || d.date >= fromDate));
    const eld = lateDays.length;
    const elm = lateDays.reduce((s, d) => s + d.late_minutes, 0);
    if (eld <= 0 && elm <= 0) return 0;
    if (fineMode === "day") return parseFloat((fineAmt * eld).toFixed(2));
    const netMins = eqOt ? Math.max(0, elm - att.total_ot_minutes) : elm;
    return parseFloat((fineAmt * netMins).toFixed(2));
  }

  // ── Apply attendance data to entries
  function applyAttendance(summary: typeof attSummary) {
    const byName = new Map(summary.map(s => [s.name.toUpperCase(), s]));
    setEntries(prev => prev.map(e => {
      const att = byName.get(e.name.toUpperCase());
      if (!att) return e;
      const noOfLeave  = att.absent_days;
      const extraLeave = att.excess_leave_days;
      const deduction  = parseFloat((att.leave_deduction ?? 0).toFixed(2));
      const fine       = calcAttFine(att);
      return { ...e, noOfLeave, extraLeave, deduction, fine };
    }));
  }

  // ── Attendance load button
  function loadAttendanceNow() {
    if (!attMonth) { return; }
    if (attLoading) return;
    prevAttRef.current = attMonth;
    setAttApplied(false);
    // Data is already fetched by the hook; apply immediately
    if (attSummary.length > 0) {
      applyAttendance(attSummary);
      setAttApplied(true);
    }
  }

  // Watch for fresh attendance data to auto-apply after button click
  useEffect(() => {
    if (attLoading || attApplied || !prevAttRef.current) return;
    if (prevAttRef.current !== attMonth || attSummary.length === 0) return;
    applyAttendance(attSummary);
    setAttApplied(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attSummary, attLoading]);

  // Recalculate pending amounts when arrear toggle changes
  useEffect(() => {
    if (!incSheetData || loadStep !== "map_names") return;
    const staffInc = calcStaffIncentives(incSheetData, incLockedRows, loadAsArrear);
    setPendingInc(staffInc);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAsArrear]);

  // ── Incentive load step 1: select sheet
  async function selectIncentiveSheet(id: string) {
    const { data } = await supabase().from("incentive_sheets")
      .select("master_entries, mapper_entries, raw_data, overrides, default_split, locked_rows")
      .eq("id", id).single();
    if (!data) return;
    const d = data as any;
    const locked = d.locked_rows ?? {};
    setIncSheetId(id);
    setIncSheetData(d);
    setIncLockedRows(locked);
    const staffInc = calcStaffIncentives(d, locked);
    const initial: Record<string, string> = {};
    for (const incName of staffInc.keys()) {
      const saved = savedNameMap.find(m => m.incentive_name === incName);
      if (saved) { initial[incName] = saved.staff_name; continue; }
      const exact = payrollNames.find(n => n === incName || n.toLowerCase() === incName.toLowerCase());
      initial[incName] = exact ?? "";
    }
    setPendingInc(staffInc);
    setNameMap(initial);
    setLoadStep("map_names");
  }

  // ── Incentive load step 2: apply with mappings
  async function applyMapping() {
    setMapSaving(true);
    const toSave = Object.entries(nameMap)
      .filter(([, t]) => t.trim())
      .map(([incentive_name, staff_name]) => ({ incentive_name, staff_name: staff_name.trim() }));
    if (toSave.length > 0) {
      await supabase().from("staff_name_map").upsert(toSave, { onConflict: "incentive_name" });
      qc.invalidateQueries({ queryKey: ["staff_name_map"] });
    }
    const resolved = new Map<string, number>();
    for (const [incName, amount] of pendingInc.entries()) {
      const target = (nameMap[incName]?.trim() || incName).toUpperCase();
      if (target) resolved.set(target, (resolved.get(target) ?? 0) + amount);
    }
    const rounded = new Map([...resolved.entries()].map(([k, v]) => [k, Math.round(v)]));
    setEntries(prev => prev.map(e => {
      const inc = rounded.get(e.name.toUpperCase());
      if (inc === undefined) return e;
      return loadAsArrear ? { ...e, arrear: (e.arrear || 0) + inc } : { ...e, incentive: inc };
    }));
    setMapSaving(false);
    setLoadStep(null);
    setPendingInc(new Map());
    setLoadAsArrear(false);
  }

  // ── Lock incentive rows for a staff member (called on "Mark Paid")
  const lockStaffRows = useMutation({
    mutationFn: async (staffName: string) => {
      if (!incSheetId || !incSheetData) throw new Error("No incentive sheet loaded");
      const rowIndices = getEligibleRowsForStaff(incSheetData, staffName, incLockedRows);
      if (rowIndices.length === 0) return staffName;
      const newLocked = { ...incLockedRows };
      for (const idx of rowIndices) {
        newLocked[String(idx)] = { staff: staffName, period };
      }
      const { error } = await supabase()
        .from("incentive_sheets")
        .update({ locked_rows: newLocked })
        .eq("id", incSheetId);
      if (error) throw error;
      setIncLockedRows(newLocked);
      return staffName;
    },
    onSuccess: (staffName) => {
      setLockedStaff(prev => new Set([...prev, staffName]));
    },
  });

  // ── Save payroll
  const saveSheet = useMutation({
    mutationFn: async () => {
      setSaveStatus("saving");
      const payload = { period, entries, updated_at: new Date().toISOString() };
      const client = supabase();
      if (savedSheetId) {
        const { error } = await client.from("payroll_sheets").update(payload).eq("id", savedSheetId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from("payroll_sheets").insert(payload).select("id").single();
        if (error) throw error;
        setSavedSheetId((data as any).id);
      }
    },
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["payroll_sheets"] });
      setTimeout(() => setSaveStatus("idle"), 2500);
    },
    onError: () => setSaveStatus("idle"),
  });

  const deleteSheet = useMutation({
    mutationFn: async (id: string) => {
      await supabase().from("payroll_sheets").delete().eq("id", id);
      if (savedSheetId === id) { setSavedSheetId(null); setSaveStatus("idle"); }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll_sheets"] }),
  });

  async function loadSheet(id: string) {
    const { data } = await supabase().from("payroll_sheets").select("*").eq("id", id).single();
    if (!data) return;
    const d = data as any;
    setPeriod(d.period); setEntries(d.entries ?? []); setSavedSheetId(id); setSaveStatus("idle");
  }

  function initFromStaff() {
    const existing = new Set(entries.map(e => e.name.toUpperCase()));
    const newRows = staffList
      .filter(s => !existing.has(s.name.toUpperCase()))
      .map(s => ({ ...blankEntry(s.name.toUpperCase()), basicSalary: s.monthly_salary || 0 }));
    setEntries(prev => [...prev, ...newRows]);
  }

  function addInactiveStaff(s: { name: string; monthly_salary: number }) {
    const nameUp = s.name.toUpperCase();
    if (entries.some(e => e.name.toUpperCase() === nameUp)) return;
    setEntries(prev => [...prev, { ...blankEntry(nameUp), basicSalary: s.monthly_salary || 0 }]);
    setShowInactivePicker(false);
  }

  // ── Entry update helpers
  function updateField(id: string, patch: Partial<PayEntry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }
  function updateExtraLeave(id: string, v: number) {
    // Auto-recalculate deduction when extra leave changes
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const deduction = parseFloat((e.basicSalary / 30 * v).toFixed(2));
      return { ...e, extraLeave: v, deduction };
    }));
  }
  function updateBasicSalary(id: string, v: number) {
    // If extra leave exists, recalculate deduction
    setEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const deduction = e.extraLeave > 0 ? parseFloat((v / 30 * e.extraLeave).toFixed(2)) : e.deduction;
      return { ...e, basicSalary: v, deduction };
    }));
  }

  function downloadPayslip(entry: PayEntry) {
    const blob = new Blob([generatePayslip(entry, period)], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  const nameToBioId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of attSummary) m.set(r.name.toUpperCase(), r.bio_user_id);
    return m;
  }, [attSummary]);

  function staffAlerts(e: PayEntry) {
    const bioId = nameToBioId.get(e.name.toUpperCase());
    if (!bioId) return { bigPerms: [] as { permission_date: string; late_minutes: number }[], weekendLeaves: [] as { leave_date: string }[] };
    const bigPerms    = monthPerms.filter(p => p.bio_user_id === bioId && p.late_minutes > 120);
    const weekendLeaves = monthLeaves.filter(l => l.bio_user_id === bioId && isWeekend(l.leave_date));
    return { bigPerms, weekendLeaves };
  }

  const totals = useMemo(() => entries.reduce((acc, e) => {
    const d = derive(e);
    return {
      basic: acc.basic + e.basicSalary,
      deduction: acc.deduction + e.deduction,
      fine: acc.fine + (e.fine ?? 0),
      advance: acc.advance + e.advance,
      incentive: acc.incentive + e.incentive,
      arrear: acc.arrear + e.arrear,
      salary: acc.salary + d.salary,
      paidCash: acc.paidCash + (e.paid && e.payMode === "cash" ? derive(e).salary : 0),
      paidBank: acc.paidBank + (e.paid && e.payMode === "bank" ? derive(e).salary : 0),
      paidCount: acc.paidCount + (e.paid ? 1 : 0),
    };
  }, { basic: 0, deduction: 0, fine: 0, advance: 0, incentive: 0, arrear: 0, salary: 0, paidCash: 0, paidBank: 0, paidCount: 0 }), [entries]);

  const unmatchedCount = Object.entries(nameMap).filter(([, v]) => !v.trim()).length;
  const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
  const canLoadAtt = !!attMonth && entries.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/staff-incentives" className="text-xs text-gold hover:underline">← Staff Incentives</Link>
          <h1 className="text-xl font-bold text-ink">Payroll</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {entries.length > 0 && (
            <span className="text-sm text-ink-dim">
              {entries.length} staff · <span className="font-semibold text-gold">{inr(totals.salary)}</span>
              {totals.paidCount > 0 && (
                <span className="ml-2 text-ok font-medium">{totals.paidCount} paid</span>
              )}
            </span>
          )}
          <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="Period (e.g. May 2026)" className={`${inp} w-36`} />
          <button disabled={entries.length === 0 || saveStatus === "saving" || !period.trim()}
            onClick={() => saveSheet.mutate()}
            className={clsx("text-sm px-4 py-1.5 rounded-lg2 font-medium disabled:opacity-40", {
              "bg-ok text-white": saveStatus === "saved",
              "bg-gold text-white": saveStatus !== "saved",
            })}>
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : savedSheetId ? "Update" : "Save"}
          </button>
        </div>
      </div>

      {/* Saved payroll chips */}
      {savedSheets.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Saved Payrolls</p>
          <div className="flex flex-wrap gap-2">
            {savedSheets.map(s => (
              <div key={s.id} className={clsx("flex items-center gap-1.5 border rounded-lg2 px-3 py-1.5 text-xs", {
                "border-gold/50 bg-gold/5 text-gold font-medium": s.id === savedSheetId,
                "border-line text-ink-dim bg-white hover:border-gold/40": s.id !== savedSheetId,
              })}>
                <button onClick={() => loadSheet(s.id)} className="hover:underline">{s.period}</button>
                <span className="text-ink-dim/40">·</span>
                <span className="text-[10px] text-ink-dim">{new Date(s.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                {s.id !== savedSheetId && (
                  <button onClick={() => { if (confirm(`Delete "${s.period}"?`)) deleteSheet.mutate(s.id); }} className="text-err/50 hover:text-err ml-0.5">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {staffList.length > 0 && (
          <button onClick={initFromStaff} className="text-sm border border-line px-4 py-1.5 rounded-lg2 hover:border-gold text-ink-dim">
            + Load Staff
          </button>
        )}
        {inactiveStaff.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowInactivePicker(v => !v)}
              className="text-sm border border-line px-4 py-1.5 rounded-lg2 hover:border-warn text-ink-dim"
            >
              + Add Deactivated Staff
            </button>
            {showInactivePicker && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-canvas border border-line rounded-lg2 shadow-soft min-w-[200px] max-h-60 overflow-y-auto">
                {inactiveStaff.map(s => {
                  const alreadyIn = entries.some(e => e.name.toUpperCase() === s.name.toUpperCase());
                  return (
                    <button
                      key={s.id}
                      disabled={alreadyIn}
                      onClick={() => addInactiveStaff(s)}
                      className={clsx("w-full text-left px-3 py-2 text-sm hover:bg-gold/10", alreadyIn ? "opacity-40 cursor-not-allowed" : "")}
                    >
                      {s.name}
                      {alreadyIn && <span className="ml-2 text-xs text-ink-dim">(added)</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button onClick={() => setEntries(prev => [...prev, blankEntry()])}
          className="text-sm border border-line px-4 py-1.5 rounded-lg2 hover:border-gold text-ink-dim">
          + Add Row
        </button>
        <button
          onClick={loadAttendanceNow}
          disabled={!canLoadAtt}
          title={!attMonth ? "Set a valid period (e.g. May 2026) first" : ""}
          className={clsx("text-sm px-4 py-1.5 rounded-lg2 border font-medium transition-colors", {
            "bg-info/10 text-info border-info/30 hover:bg-info/20": canLoadAtt && !attLoading,
            "opacity-40 border-line text-ink-dim cursor-not-allowed": !canLoadAtt,
            "border-info/30 text-info/60": attLoading,
          })}>
          {attLoading ? "Loading…" : attApplied ? `✓ Attendance Loaded (${attMonth})` : `↓ Load Attendance (${attMonth || "set period"})`}
        </button>
        <button onClick={() => setLoadStep("pick_incentive")} disabled={incentiveSheets.length === 0}
          className="text-sm bg-ok/10 text-ok border border-ok/30 px-4 py-1.5 rounded-lg2 hover:bg-ok/20 disabled:opacity-40">
          ↓ Load Incentive
        </button>
      </div>

      {/* Attendance loaded banner */}
      {attApplied && (
        <div className="bg-info/5 border border-info/30 rounded-xl px-4 py-2.5 text-xs text-info flex items-center justify-between">
          <span>Attendance loaded for <strong>{attMonth}</strong> — leaves, extra leaves and deductions have been filled. Edit any cell directly.</span>
          <button onClick={() => setAttApplied(false)} className="text-info/60 hover:text-info ml-4">✕</button>
        </div>
      )}

      {/* ── MODAL: pick incentive sheet ── */}
      {loadStep === "pick_incentive" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-line shadow-soft p-5 w-full max-w-sm space-y-3">
            <h2 className="font-semibold text-sm">Select Incentive Sheet</h2>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {incentiveSheets.map(s => (
                <button key={s.id} onClick={() => selectIncentiveSheet(s.id)}
                  className="w-full flex items-center justify-between border border-line rounded-lg2 px-3 py-2 text-sm hover:border-gold hover:bg-gold/5 text-left">
                  <span className="font-medium">{s.period}</span>
                  <span className="text-xs text-ink-dim">{new Date(s.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setLoadStep(null)} className="w-full border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim">Cancel</button>
          </div>
        </div>
      )}

      {/* ── MODAL: name mapper ── */}
      {loadStep === "map_names" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-line shadow-soft p-5 w-full max-w-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-sm">Map Incentive Names → Staff Names</h2>
                <p className="text-xs text-ink-dim mt-1">Mappings are saved permanently for future use.</p>
              </div>
              {unmatchedCount > 0 && (
                <span className="text-xs bg-warn/10 text-warn border border-warn/30 px-2 py-1 rounded-lg2 shrink-0">
                  {unmatchedCount} unmapped
                </span>
              )}
            </div>
            <div className="overflow-y-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-dim border-b border-line">
                    <th className="text-left py-2 pr-4">Incentive Name</th>
                    <th className="text-right py-2 pr-4">Amount</th>
                    <th className="text-left py-2">→ Staff Name</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pendingInc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([incName, amount]) => {
                    const mapped = nameMap[incName] ?? "";
                    return (
                      <tr key={incName} className={clsx("border-b border-line last:border-0", !mapped.trim() && "bg-warn/5")}>
                        <td className="py-2 pr-4 font-mono text-xs font-medium">{incName}</td>
                        <td className="py-2 pr-4 text-ok font-mono text-xs text-right">{inr(Math.round(amount))}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <select value={mapped} onChange={e => setNameMap(p => ({ ...p, [incName]: e.target.value }))}
                              className="border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold flex-1">
                              <option value="">— Select —</option>
                              {payrollNames.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <input value={mapped} placeholder="or type"
                              onChange={e => setNameMap(p => ({ ...p, [incName]: e.target.value.toUpperCase() }))}
                              className="border border-line rounded-lg2 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold w-28 uppercase" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3 items-center pt-1 border-t border-line">
              <button onClick={applyMapping} disabled={mapSaving}
                className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                {mapSaving ? "Saving…" : loadAsArrear ? "Save & Apply as Arrear" : "Save & Apply"}
              </button>
              <button onClick={() => setLoadStep(null)} className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim">Cancel</button>
              <label className="ml-auto flex items-center gap-2 cursor-pointer text-sm select-none">
                <input type="checkbox" checked={loadAsArrear} onChange={e => setLoadAsArrear(e.target.checked)}
                  className="accent-gold w-4 h-4" />
                <span className={loadAsArrear ? "text-gold font-medium" : "text-ink-dim"}>Load as Arrear (not Incentive)</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Incentive sheet lock status banner */}
      {incSheetId && (() => {
        const totalLocked = Object.keys(incLockedRows).length;
        const lockedCount = lockedStaff.size;
        return (
          <div className="bg-ok/5 border border-ok/30 rounded-xl px-4 py-2.5 text-xs text-ok flex items-center justify-between flex-wrap gap-2">
            <span>
              Incentive sheet loaded · <strong>{totalLocked}</strong> row{totalLocked !== 1 ? "s" : ""} already locked from previous payments
              {lockedCount > 0 && <> · <strong>{lockedCount}</strong> staff locked this session</>}
            </span>
            <span className="text-ink-dim">Click <strong className="text-warn">Lock</strong> next to each staff after payslip is issued to mark their incentive rows as paid.</span>
          </div>
        );
      })()}

      {/* ── Main table ── */}
      {entries.length === 0 ? (
        <div className="bg-canvas rounded-xl border border-line px-6 py-12 text-center text-ink-dim text-sm space-y-2">
          <p>No rows yet.</p>
          <p className="text-xs">Click <strong>Load Staff</strong> to pull from the staff list, or <strong>Add Row</strong> to enter manually.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1060 }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-3 py-2.5 sticky left-0 bg-canvas z-10 min-w-[130px]">Name</th>
                <th className="text-right px-2 py-2.5">Leaves<br/>Taken</th>
                <th className="text-right px-2 py-2.5">Extra<br/>Leaves</th>
                <th className="text-right px-2 py-2.5">Basic<br/>Salary</th>
                <th className="text-right px-2 py-2.5 text-err">Deduction<br/><span className="font-normal text-ink-dim">(editable)</span></th>
                <th className="text-right px-2 py-2.5 text-err">Fine</th>
                <th className="text-right px-2 py-2.5 text-err">Advance</th>
                <th className="text-right px-2 py-2.5 text-ok">Incentive</th>
                <th className="text-right px-2 py-2.5 text-ok">Arrear</th>
                <th className="text-right px-2 py-2.5">Calculated</th>
                <th className="text-right px-3 py-2.5 text-gold font-bold">Salary</th>
                <th className="px-2 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const d = derive(e);
                const autoDeduction = parseFloat((e.basicSalary / 30 * e.extraLeave).toFixed(2));
                const deductionDiffers = e.deduction !== autoDeduction && e.extraLeave > 0;
                const isPaying = payingId === e.id;

                return (
                  <tr key={e.id} className={clsx("border-b border-line last:border-0", e.paid ? "bg-ok/5" : "hover:bg-canvas/30")}>
                    <td className="px-3 py-1.5 sticky left-0 bg-white z-10">
                      <input value={e.name} onChange={ev => updateField(e.id, { name: ev.target.value.toUpperCase() })}
                        readOnly={e.paid}
                        className={clsx("border border-line rounded px-2 py-1 text-xs uppercase w-full focus:outline-none focus:ring-1 focus:ring-gold font-medium", e.paid && "bg-transparent cursor-default pointer-events-none")} />
                      {(() => {
                        const { bigPerms, weekendLeaves } = staffAlerts(e);
                        if (!bigPerms.length && !weekendLeaves.length) return null;
                        return (
                          <div className="flex gap-1 flex-wrap mt-0.5">
                            {bigPerms.length > 0 && (
                              <span
                                title={bigPerms.map(p => `${p.permission_date} (${p.late_minutes}m)`).join(", ")}
                                className="text-[9px] font-bold bg-err/10 text-err border border-err/20 px-1.5 py-0.5 rounded cursor-help whitespace-nowrap">
                                {bigPerms.length}× perm &gt;2h
                              </span>
                            )}
                            {weekendLeaves.length > 0 && (
                              <span
                                title={`${weekendLeaves.map(l => l.leave_date).join(", ")} | 2× per-day = −₹${Math.round(weekendLeaves.length * (e.basicSalary / 30) * 2)}`}
                                className="text-[9px] font-bold bg-warn/10 text-warn border border-warn/20 px-1.5 py-0.5 rounded cursor-help whitespace-nowrap">
                                {weekendLeaves.length}× wknd leave · −{inr(Math.round(weekendLeaves.length * (e.basicSalary / 30) * 2))}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <NumCell value={e.noOfLeave} onChange={v => updateField(e.id, { noOfLeave: v })} readOnly={e.paid} />
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <NumCell value={e.extraLeave} onChange={v => updateExtraLeave(e.id, v)} highlight={e.extraLeave > 0} readOnly={e.paid} />
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <div className="space-y-0.5">
                        <NumCell value={e.basicSalary} onChange={v => updateBasicSalary(e.id, v)} readOnly={e.paid} />
                        {e.basicSalary > 0 && (
                          <p className="text-[10px] text-ink-dim text-right">{inr(parseFloat((e.basicSalary / 30).toFixed(2)))}/day</p>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <div className="space-y-0.5">
                        <NumCell value={e.deduction} onChange={v => updateField(e.id, { deduction: v })} warn={e.deduction > 0} readOnly={e.paid} />
                        {!e.paid && deductionDiffers && (
                          <button onClick={() => updateField(e.id, { deduction: autoDeduction })}
                            className="text-[10px] text-info hover:underline w-full text-right block">
                            auto: {inr(autoDeduction)}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.fine ?? 0} onChange={v => updateField(e.id, { fine: v })} warn={(e.fine ?? 0) > 0} readOnly={e.paid} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.advance} onChange={v => updateField(e.id, { advance: v })} highlight={e.advance > 0} readOnly={e.paid} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.incentive} onChange={v => updateField(e.id, { incentive: v })} highlight={e.incentive > 0} readOnly={e.paid} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <NumCell value={e.arrear} onChange={v => updateField(e.id, { arrear: v })} highlight={e.arrear > 0} readOnly={e.paid} />
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-dim whitespace-nowrap">
                      {inr(d.calculated)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-gold bg-gold/5 whitespace-nowrap">
                      {inr(d.salary)}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        <button onClick={() => downloadPayslip(e)}
                          className="text-[10px] text-info border border-info/30 px-2 py-1 rounded hover:bg-info/10 whitespace-nowrap">
                          Payslip
                        </button>
                        {incSheetId && e.incentive > 0 && (
                          lockedStaff.has(e.name) ? (
                            <span className="text-[10px] text-ok border border-ok/30 px-2 py-1 rounded whitespace-nowrap bg-ok/5">
                              Locked
                            </span>
                          ) : (
                            <button
                              disabled={lockStaffRows.isPending}
                              onClick={() => lockStaffRows.mutate(e.name)}
                              title="Lock incentive rows for this staff"
                              className="text-[10px] text-warn border border-warn/30 px-2 py-1 rounded hover:bg-warn/10 whitespace-nowrap disabled:opacity-50">
                              Lock
                            </button>
                          )
                        )}
                        {/* Payment status */}
                        {e.paid ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-[10px] text-ok border border-ok/40 px-2 py-1 rounded bg-ok/10 whitespace-nowrap font-medium">
                              Paid · {e.payMode === "bank" ? "Bank" : "Cash"}
                            </span>
                            <button
                              onClick={() => updateField(e.id, { paid: false, payMode: undefined })}
                              title="Undo payment status"
                              className="text-[10px] text-ink-dim hover:text-err">↩</button>
                          </span>
                        ) : isPaying ? (
                          <span className="inline-flex items-center gap-1">
                            <button onClick={() => { updateField(e.id, { paid: true, payMode: "cash" }); setPayingId(null); }}
                              className="text-[10px] bg-ok text-white px-2 py-1 rounded hover:bg-ok/80 whitespace-nowrap">
                              Cash
                            </button>
                            <button onClick={() => { updateField(e.id, { paid: true, payMode: "bank" }); setPayingId(null); }}
                              className="text-[10px] bg-info text-white px-2 py-1 rounded hover:bg-info/80 whitespace-nowrap">
                              Bank
                            </button>
                            <button onClick={() => setPayingId(null)}
                              className="text-[10px] text-ink-dim hover:text-err">✕</button>
                          </span>
                        ) : (
                          <button onClick={() => setPayingId(e.id)}
                            className="text-[10px] text-ok border border-ok/30 px-2 py-1 rounded hover:bg-ok/10 whitespace-nowrap">
                            Mark Paid
                          </button>
                        )}
                        <button onClick={() => setEntries(p => p.filter(x => x.id !== e.id))}
                          className="text-[10px] text-err/60 hover:text-err px-1">×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-canvas border-t-2 border-line font-semibold text-xs">
                <td className="px-3 py-2.5 sticky left-0 bg-canvas text-ink-dim">TOTAL ({entries.length})</td>
                <td colSpan={2} />
                <td className="px-2 py-2.5 text-right font-mono">{inr(totals.basic)}</td>
                <td className="px-2 py-2.5 text-right font-mono text-err">{totals.deduction > 0 ? inr(totals.deduction) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-err">{totals.fine > 0 ? inr(totals.fine) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-err">{totals.advance > 0 ? inr(totals.advance) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-ok">{totals.incentive > 0 ? inr(totals.incentive) : "—"}</td>
                <td className="px-2 py-2.5 text-right font-mono text-ok">{totals.arrear > 0 ? inr(totals.arrear) : "—"}</td>
                <td />
                <td className="px-3 py-2.5 text-right font-mono text-gold font-bold bg-gold/5">{inr(totals.salary)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Payment summary */}
      {entries.length > 0 && totals.paidCount > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3">
          <p className="text-xs font-medium text-ink-dim uppercase tracking-wide mb-2">Payment Summary</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-ink-dim text-xs">Paid (Cash)</span>
              <p className="font-bold text-ok">{inr(totals.paidCash)}</p>
            </div>
            <div>
              <span className="text-ink-dim text-xs">Paid (Bank Transfer)</span>
              <p className="font-bold text-info">{inr(totals.paidBank)}</p>
            </div>
            <div>
              <span className="text-ink-dim text-xs">Total Paid</span>
              <p className="font-bold text-ink">{inr(totals.paidCash + totals.paidBank)}</p>
            </div>
            <div>
              <span className="text-ink-dim text-xs">Pending</span>
              <p className="font-bold text-err">{inr(totals.salary - totals.paidCash - totals.paidBank)}</p>
            </div>
            <div>
              <span className="text-ink-dim text-xs">Staff Paid</span>
              <p className="font-bold text-ink">{totals.paidCount} / {entries.length}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
