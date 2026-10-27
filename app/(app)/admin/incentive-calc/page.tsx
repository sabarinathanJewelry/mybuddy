"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";
import { clsx } from "clsx";
import { useBoardRate } from "@/stores/board-rate";
import {
  INITIAL_MASTER, INITIAL_MAPPER, parseErp, lookupProduct, calcRow, loadSavedSheet,
  type MasterEntry, type MapperEntry, type CalcRow, type RowOverride,
} from "@/modules/kpi/incentive-sheet";

// ─── Small inline editor ────────────────────────────────────────────────────────
function InlineNum({ value, onSave, width = 60, readOnly = false }: { value: number; onSave: (v: number) => void; width?: number; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (readOnly) return <span>{value}</span>;
  if (!editing) return (
    <button onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="underline decoration-dashed hover:text-gold">{value}</button>
  );
  return (
    <span className="inline-flex items-center gap-0.5">
      <input autoFocus type="number" value={draft} onChange={e => setDraft(e.target.value)}
        onFocus={e => e.target.select()}
        onKeyDown={e => { if (e.key === "Enter") { onSave(parseFloat(draft) || 0); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
        style={{ width }} className="border border-gold rounded px-1 py-0.5 text-xs focus:outline-none text-center" />
      <button onClick={() => { onSave(parseFloat(draft) || 0); setEditing(false); }} className="text-ok text-[10px]">✓</button>
      <button onClick={() => setEditing(false)} className="text-err text-[10px]">✕</button>
    </span>
  );
}

function InlineText({ value, onSave, width = 120 }: { value: string; onSave: (v: string) => void; width?: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!editing) return (
    <button onClick={() => { setDraft(value); setEditing(true); }}
      className="underline decoration-dashed hover:text-gold text-left">{value || "—"}</button>
  );
  return (
    <span className="inline-flex items-center gap-0.5">
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { onSave(draft.trim().toUpperCase()); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
        style={{ width }} className="border border-gold rounded px-1 py-0.5 text-xs focus:outline-none uppercase" />
      <button onClick={() => { onSave(draft.trim().toUpperCase()); setEditing(false); }} className="text-ok text-[10px]">✓</button>
      <button onClick={() => setEditing(false)} className="text-err text-[10px]">✕</button>
    </span>
  );
}

// ─── Balance cell with partial payment + write-off ─────────────────────────────
function BalanceCell({ balance, ov, defaultBoardRate, onMarkPaid, onSavePartial, onWriteOff, onUndo }: {
  balance: number;
  ov: RowOverride | undefined;
  defaultBoardRate?: number;
  onMarkPaid: () => void;
  onSavePartial: (paid: number) => void;
  onWriteOff: (paid: number, writeOff: number, boardRate?: number) => void;
  onUndo: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "partial">("idle");
  const [received, setReceived] = useState("");
  const [boardRateInput, setBoardRateInput] = useState(() => defaultBoardRate ? String(defaultBoardRate) : "");

  // ── State 1: fully paid (no write-off)
  if (ov?.balanceZero && !ov.writeOffAmt) {
    return (
      <span className="inline-flex flex-col gap-0.5 text-[10px]">
        <span className="inline-flex items-center gap-1">
          {(ov.amountPaid ?? 0) > 0
            ? <span className="text-ok">Paid {inr(ov.amountPaid!)} ✓</span>
            : <span className="text-ok">Paid ✓</span>}
          <button onClick={onUndo} className="text-ink-dim hover:text-err">undo</button>
        </span>
        {ov.paidDate && <span className="font-mono text-ink-dim">{ov.paidDate}</span>}
      </span>
    );
  }

  // ── State 2: written off
  if (ov?.balanceZero && ov.writeOffAmt) {
    const wo = ov.writeOffAmt;
    const gstLost = parseFloat((wo * 3 / 103).toFixed(2));
    const netLost = parseFloat((wo * 100 / 103).toFixed(2));
    return (
      <span className="inline-flex flex-col gap-0.5 text-[10px]">
        <span className="inline-flex items-center gap-1 flex-wrap">
          {(ov.amountPaid ?? 0) > 0 && <span className="text-ok">Rcvd {inr(ov.amountPaid!)}</span>}
          <span className="text-warn font-medium">W/O {inr(wo)}</span>
          <button onClick={onUndo} className="text-ink-dim hover:text-err">undo</button>
        </span>
        {ov.paidDate && <span className="font-mono text-ink-dim">{ov.paidDate}</span>}
        <span className="text-ink-dim">
          GST lost: <span className="text-err">{inr(gstLost)}</span>
          {" · "}Net lost: <span className="text-err">{inr(netLost)}</span>
        </span>
      </span>
    );
  }

  // ── State 3: partial saved, not yet written off
  if (ov?.amountPaid && !ov.balanceZero) {
    const remaining = Math.max(0, balance - ov.amountPaid);
    const gstLost = parseFloat((remaining * 3 / 103).toFixed(2));
    const netLost = parseFloat((remaining * 100 / 103).toFixed(2));
    return (
      <span className="inline-flex flex-col gap-0.5 text-[10px]">
        <span className="inline-flex items-center gap-1 flex-wrap">
          <span className="text-ok">Rcvd {inr(ov.amountPaid)}</span>
          <span className="text-err font-medium">Rem {inr(remaining)}</span>
          <button onClick={onUndo} className="text-ink-dim hover:text-err">undo</button>
        </span>
        <span className="text-ink-dim">
          GST: <span className="text-err">{inr(gstLost)}</span>
          {" · "}Net: <span className="text-err">{inr(netLost)}</span>
        </span>
        <span className="inline-flex gap-1">
          <button onClick={() => onMarkPaid()}
            className="bg-ok/10 text-ok border border-ok/30 px-1.5 py-0.5 rounded hover:bg-ok/20">
            Fully paid
          </button>
          <button onClick={() => onWriteOff(ov.amountPaid!, remaining)}
            className="bg-warn text-white px-1.5 py-0.5 rounded">
            Write off {inr(remaining)}
          </button>
        </span>
      </span>
    );
  }

  // ── State 4: partial input form
  if (mode === "partial") {
    const rcv = parseFloat(received) || 0;
    const wo  = Math.max(0, balance - rcv);
    const br  = parseFloat(boardRateInput) || undefined;
    const gstLost = parseFloat((wo * 3 / 103).toFixed(2));
    const netLost = parseFloat((wo * 100 / 103).toFixed(2));
    const close = () => { setMode("idle"); setReceived(""); setBoardRateInput(""); };
    return (
      <span className="inline-flex flex-col gap-1 py-0.5 text-[10px]">
        <span className="inline-flex items-center gap-1">
          <span className="text-ink-dim">Due: <span className="text-err font-medium">{inr(balance)}</span></span>
          <button onClick={close} className="text-err ml-1">✕</button>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-ink-dim">Received:</span>
          <input autoFocus type="number" value={received} onChange={e => setReceived(e.target.value)}
            placeholder="0" onKeyDown={e => e.key === "Escape" && close()}
            className="border border-gold rounded px-1 py-0.5 text-[10px] focus:outline-none w-24 text-right" />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-ink-dim">Board rate ₹/g <span className="text-ink-dim/50">(opt):</span></span>
          <input type="number" value={boardRateInput} onChange={e => setBoardRateInput(e.target.value)}
            placeholder="e.g. 9350" onKeyDown={e => e.key === "Escape" && close()}
            className="border border-line rounded px-1 py-0.5 text-[10px] focus:outline-none w-24 text-right focus:border-gold" />
        </span>
        {wo > 0 && (
          <span className="text-ink-dim space-y-0.5">
            <div>Write-off: <span className="text-warn font-medium">{inr(wo)}</span></div>
            <div>GST lost: <span className="text-err">{inr(gstLost)}</span></div>
            <div>Net lost: <span className="text-err">{inr(netLost)}</span></div>
          </span>
        )}
        <span className="inline-flex gap-1 flex-wrap">
          <button onClick={() => { if (rcv > 0) { onSavePartial(rcv); close(); } }}
            disabled={rcv <= 0}
            className="bg-info/10 text-info border border-info/30 px-2 py-0.5 rounded disabled:opacity-40">
            Save received {rcv > 0 ? inr(rcv) : ""}
          </button>
          <button onClick={() => { onWriteOff(rcv, wo, br); close(); }}
            disabled={wo <= 0}
            className="bg-warn text-white px-2 py-0.5 rounded disabled:opacity-40">
            Write off {wo > 0 ? inr(wo) : ""}
          </button>
        </span>
      </span>
    );
  }

  // ── State 5: default — balance outstanding
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="text-err font-medium">{inr(balance)}</span>
      <button onClick={onMarkPaid}
        className="text-[10px] bg-ok/10 text-ok border border-ok/30 px-1.5 py-0.5 rounded hover:bg-ok/20">
        Mark paid
      </button>
      <button onClick={() => setMode("partial")}
        className="text-[10px] bg-warn/10 text-warn border border-warn/30 px-1.5 py-0.5 rounded hover:bg-warn/20">
        Partial
      </button>
    </span>
  );
}

// ─── Inline mapper widget ───────────────────────────────────────────────────────
function InlineMapperAdd({ erpName, masterEntries, onSave }: {
  erpName: string;
  masterEntries: MasterEntry[];
  onSave: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="text-err text-[10px] ml-1 underline decoration-dashed hover:text-gold">
      unmapped
    </button>
  );
  const exists = masterEntries.some(m => m.code.toUpperCase() === code.toUpperCase().trim());
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <input autoFocus value={code} onChange={e => setCode(e.target.value)}
        placeholder="Incentive code"
        onKeyDown={e => {
          if (e.key === "Enter" && code.trim()) { onSave(code.trim().toUpperCase()); setOpen(false); setCode(""); }
          if (e.key === "Escape") { setOpen(false); setCode(""); }
        }}
        className="border border-gold rounded px-1 py-0.5 text-[10px] focus:outline-none uppercase w-28" />
      {code.trim() && !exists && <span className="text-[9px] text-warn">not in master</span>}
      <button disabled={!code.trim()} onClick={() => { onSave(code.trim().toUpperCase()); setOpen(false); setCode(""); }}
        className="text-ok text-[10px] disabled:opacity-40">✓</button>
      <button onClick={() => { setOpen(false); setCode(""); }} className="text-err text-[10px]">✕</button>
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
type ViewTab = "data" | "staff" | "settings";

type SortKey = "score" | "avgPct" | "goldWt" | "silverWt";
interface LeaderboardEntry {
  name: string; avgPct: number; goldWt: number; silverWt: number;
  score: number; goldCount: number; silverCount: number;
  sp1Count: number; sp2Count: number;
  totalBalance: number; wastageModified: number;
}
function SalesLeaderboard({ data }: { data: LeaderboardEntry[] }) {
  const [sort, setSort] = useState<SortKey>("score");
  const sorted = [...data].sort((a, b) => b[sort] - a[sort]);
  const SORTS: { key: SortKey; label: string }[] = [
    { key: "score",    label: "Score" },
    { key: "avgPct",   label: "Avg Making%" },
    { key: "goldWt",   label: "Gold Weight" },
    { key: "silverWt", label: "Silver Weight" },
  ];
  return (
    <div className="bg-canvas rounded-xl border border-line shadow-soft p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-ink text-sm">Sales Performance Leaderboard</h3>
        <div className="flex gap-1">
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSort(s.key)}
              className={clsx("px-2.5 py-1 rounded-md text-xs font-medium border transition-colors", {
                "bg-gold text-white border-gold": sort === s.key,
                "bg-white text-ink-dim border-line hover:border-gold/40": sort !== s.key,
              })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ink-dim border-b border-line">
              <th className="pb-1.5 text-left w-6">#</th>
              <th className="pb-1.5 text-left">Staff</th>
              <th className="pb-1.5 text-right">Score</th>
              <th className="pb-1.5 text-right">Avg Making%</th>
              <th className="pb-1.5 text-right">Gold (g)</th>
              <th className="pb-1.5 text-right">Silver (g)</th>
              <th className="pb-1.5 text-right">Bills</th>
              <th className="pb-1.5 text-right">SP1</th>
              <th className="pb-1.5 text-right">SP2</th>
              <th className="pb-1.5 text-right">Balance Due</th>
              <th className="pb-1.5 text-right" title="Bills where VA% was manually overridden">VA Mod</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.name} className={clsx("border-b border-line/50", i === 0 && "text-gold font-semibold")}>
                <td className="py-1.5 text-ink-dim">{i + 1}</td>
                <td className="py-1.5">{r.name}</td>
                <td className={clsx("py-1.5 text-right font-mono", sort === "score" && "text-gold font-semibold")}>{r.score.toFixed(1)}</td>
                <td className={clsx("py-1.5 text-right font-mono", sort === "avgPct" && "text-gold font-semibold")}>{r.avgPct.toFixed(2)}%</td>
                <td className={clsx("py-1.5 text-right font-mono", sort === "goldWt" && "text-gold font-semibold")}>{r.goldWt.toFixed(3)}</td>
                <td className={clsx("py-1.5 text-right font-mono", sort === "silverWt" && "text-gold font-semibold")}>{r.silverWt.toFixed(3)}</td>
                <td className="py-1.5 text-right text-ink-dim">{r.goldCount + r.silverCount}</td>
                <td className="py-1.5 text-right text-ink-dim">{r.sp1Count}</td>
                <td className="py-1.5 text-right text-ink-dim">{r.sp2Count}</td>
                <td className="py-1.5 text-right font-mono">
                  {r.totalBalance > 0
                    ? <span className="text-err">{inr(r.totalBalance)}</span>
                    : <span className="text-ok text-[10px]">—</span>}
                </td>
                <td className="py-1.5 text-right font-mono">
                  {r.wastageModified > 0
                    ? <span className="text-warn font-semibold">{r.wastageModified}</span>
                    : <span className="text-ink-dim">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-ink-dim">Score = avg making% × gold grams. Higher = better quality on higher volume. SP1/SP2 = unique bills as primary/secondary salesperson. VA Mod = bills where wastage% was manually overridden.</p>
    </div>
  );
}

export default function IncentiveCalcPage() {
  const qc = useQueryClient();
  const boardRateStore = useBoardRate(s => s.rate);
  const [raw, setRaw]           = useState("");
  const [rows, setRows]         = useState<CalcRow[] | null>(null);
  const [overrides, setOverrides] = useState<Record<number, RowOverride>>({});
  const [tab, setTab]           = useState<ViewTab>("data");
  const [filterStaff, setFilterStaff] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<"all"|"eligible"|"balance"|"lowwaste"|"unmapped"|"locked">("all");
  const [defaultSplit, setDefaultSplit] = useState(70);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const [masterEntries, setMasterEntries] = useState<MasterEntry[]>(INITIAL_MASTER);
  const [mapperEntries, setMapperEntries] = useState<MapperEntry[]>(INITIAL_MAPPER);
  const [newMaster, setNewMaster] = useState<MasterEntry>({ code: "", rate: 0, minWastage: 0 });
  const [newMapper, setNewMapper] = useState<MapperEntry>({ erpName: "", incentiveCode: "", notes: "" });
  const [settingsSection, setSettingsSection] = useState<"master"|"mapper">("mapper");
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
  });
  const [savedSheetId, setSavedSheetId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving"|"saved">("idle");
  const [lockedRows, setLockedRows] = useState<Record<string, { staff: string; period: string }>>({});
  const [deletedIdxs, setDeletedIdxs] = useState<number[]>([]);

  const inp = "border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold";

  // ── Load saved sheets list
  const { data: savedSheets = [] } = useQuery({
    queryKey: ["incentive_sheets"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("incentive_sheets")
        .select("id, period, created_at, updated_at")
        .order("updated_at", { ascending: false });
      return (data ?? []) as { id: string; period: string; created_at: string; updated_at: string }[];
    },
  });

  // ── Save mutation — accepts optional mapper/master override to handle async state
  const saveSheet = useMutation({
    mutationFn: async (vars?: { mapperEntries?: MapperEntry[]; masterEntries?: MasterEntry[] }) => {
      setSaveStatus("saving");
      const payload = {
        period,
        raw_data: raw,
        overrides,
        deleted_idxs: deletedIdxs,
        default_split: defaultSplit,
        mapper_entries: vars?.mapperEntries ?? mapperEntries,
        master_entries: vars?.masterEntries ?? masterEntries,
        updated_at: new Date().toISOString(),
      };
      const client = supabase();
      if (savedSheetId) {
        const { error } = await client.from("incentive_sheets").update(payload).eq("id", savedSheetId);
        if (error) throw error;
      } else {
        const { data, error } = await client.from("incentive_sheets").insert(payload).select("id").single();
        if (error) throw error;
        setSavedSheetId((data as any).id);
      }
    },
    onSuccess: () => {
      setSaveStatus("saved");
      qc.invalidateQueries({ queryKey: ["incentive_sheets"] });
      setTimeout(() => setSaveStatus("idle"), 2500);
    },
    onError: (e: unknown) => { setSaveStatus("idle"); alert("Save failed: " + (e instanceof Error ? e.message : String(e))); },
  });

  // ── Load a saved sheet
  async function loadSheet(id: string) {
    const { data, error } = await supabase()
      .from("incentive_sheets")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return;
    const d = data as any;
    const loaded = loadSavedSheet(d);
    setRaw(d.raw_data);
    setOverrides(loaded.overrides);
    setDefaultSplit(loaded.defaultSplit);
    setPeriod(d.period);
    setLockedRows(d.locked_rows ?? {});
    setDeletedIdxs(loaded.deleted);
    setMapperEntries(loaded.mapper);
    setMasterEntries(loaded.master);
    setSavedSheetId(id);
    setSaveStatus("idle");
    const r = loaded.rows;
    setRows(r);
    setTab("data");
    const names = new Set<string>();
    r.forEach((x: CalcRow) => { if (x.sp1) names.add(x.sp1); if (x.sp2) names.add(x.sp2); });
    setExpandedStaff(names);
  }

  // ── Delete a saved sheet
  const deleteSheet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("incentive_sheets").delete().eq("id", id);
      if (error) throw error;
      if (savedSheetId === id) {
        setSavedSheetId(null); setSaveStatus("idle");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incentive_sheets"] }),
  });

  function parse() {
    const r = parseErp(raw);
    setRows(r);
    setOverrides({});
    setLockedRows({});
    setDeletedIdxs([]);
    setFilterStaff("ALL");
    setFilterStatus("all");
    setTab("data");
    setSavedSheetId(null);
    setSaveStatus("idle");
    const names = new Set<string>();
    r.forEach(x => { if (x.sp1) names.add(x.sp1); if (x.sp2) names.add(x.sp2); });
    setExpandedStaff(names);
  }

  function setOv(idx: number, patch: Partial<RowOverride>) {
    setOverrides(prev => ({ ...prev, [idx]: { ...prev[idx], ...patch } }));
  }

  function deleteRow(idx: number) {
    setRows(prev => prev ? prev.filter(r => r.idx !== idx) : prev);
    setOverrides(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setDeletedIdxs(prev => prev.includes(idx) ? prev : [...prev, idx]);
  }

  const allStaff = useMemo(() => {
    const s = new Set<string>();
    (rows ?? []).forEach(r => { if (r.sp1) s.add(r.sp1); if (r.sp2) s.add(r.sp2); });
    return [...s].sort();
  }, [rows]);

  const computed = useMemo(() =>
    (rows ?? []).map(r => ({ row: r, eff: calcRow(r, overrides[r.idx], defaultSplit, mapperEntries, masterEntries) })),
  [rows, overrides, defaultSplit, mapperEntries, masterEntries]);

  const staffTotals = useMemo(() => {
    const m = new Map<string, number>();
    computed.forEach(({ row, eff }) => {
      if (row.sp1) m.set(row.sp1, (m.get(row.sp1) ?? 0) + eff.sp1Inc);
      if (row.sp2) m.set(row.sp2, (m.get(row.sp2) ?? 0) + eff.sp2Inc);
    });
    return m;
  }, [computed]);

  const grandTotal = [...staffTotals.values()].reduce((s, v) => s + v, 0);

  // Sales leaderboard — gold weight, silver weight, avg wastage%, composite score per staff
  const salesLeaderboard = useMemo(() => {
    type Entry = {
      wtdSum: number; goldWt: number; silverWt: number; goldCount: number; silverCount: number;
      sp1Bills: Set<string>; sp2Bills: Set<string>;
      balanceBills: Set<string>; totalBalance: number; wastageModified: number;
    };
    const map = new Map<string, Entry>();
    const getEntry = (name: string): Entry => {
      if (!map.has(name)) map.set(name, {
        wtdSum: 0, goldWt: 0, silverWt: 0, goldCount: 0, silverCount: 0,
        sp1Bills: new Set(), sp2Bills: new Set(),
        balanceBills: new Set(), totalBalance: 0, wastageModified: 0,
      });
      return map.get(name)!;
    };
    for (const { row, eff } of computed) {
      const pfx = row.billNo.split("/").pop()?.[0]?.toUpperCase();
      const isGold   = pfx === "G";
      const isSilver = pfx === "S";
      if (!isGold && !isSilver) continue;
      const wasOverridden = overrides[row.idx]?.wastage !== undefined || overrides[row.idx]?.minWastage !== undefined;
      const processStaff = (name: string, isSP1: boolean) => {
        const e = getEntry(name);
        if (isGold) {
          if (eff.wastage > 0) e.wtdSum += eff.wastage * row.netWt;
          e.goldWt    += row.netWt;
          e.goldCount += 1;
        } else {
          e.silverWt    += row.netWt;
          e.silverCount += 1;
        }
        if (isSP1) e.sp1Bills.add(row.billNo); else e.sp2Bills.add(row.billNo);
        if (eff.balance > 0 && !e.balanceBills.has(row.billNo)) {
          e.balanceBills.add(row.billNo);
          e.totalBalance += eff.balance;
        }
        if (wasOverridden) e.wastageModified++;
      };
      if (row.sp1) processStaff(row.sp1, true);
      if (row.sp2) processStaff(row.sp2, false);
    }
    return [...map.entries()].map(([name, d]) => ({
      name,
      avgPct:    d.goldWt > 0 ? parseFloat((d.wtdSum / d.goldWt).toFixed(2)) : 0,
      goldWt:    parseFloat(d.goldWt.toFixed(3)),
      silverWt:  parseFloat(d.silverWt.toFixed(3)),
      score:     parseFloat(((d.wtdSum / (d.goldWt || 1)) * d.goldWt).toFixed(1)),
      goldCount: d.goldCount,
      silverCount: d.silverCount,
      sp1Count:  d.sp1Bills.size,
      sp2Count:  d.sp2Bills.size,
      totalBalance:    parseFloat(d.totalBalance.toFixed(2)),
      wastageModified: d.wastageModified,
    }));
  }, [computed, overrides]);

  const unmappedProducts = useMemo(() =>
    [...new Set((rows ?? []).filter(r => {
      const { mapped, masterEntry } = lookupProduct(r.product, r.netWt, mapperEntries, masterEntries);
      return !mapped && !masterEntry;
    }).map(r => r.product))].sort(),
  [rows, mapperEntries, masterEntries]);

  const filteredRows = useMemo(() => computed.filter(({ row, eff }) => {
    if (filterStaff !== "ALL" && row.sp1 !== filterStaff && row.sp2 !== filterStaff) return false;
    if (filterStatus === "eligible"  && !eff.eligible) return false;
    if (filterStatus === "balance"   && eff.balance <= 0) return false;
    if (filterStatus === "lowwaste"  && (eff.balance > 0 || eff.eligible || !eff.mapped)) return false;
    if (filterStatus === "unmapped"  && eff.mapped) return false;
    if (filterStatus === "locked"    && !lockedRows[String(row.idx)]) return false;
    return true;
  }), [computed, filterStaff, filterStatus, lockedRows]);

  const balanceCount  = computed.filter(({ eff }) => eff.balance > 0).length;
  const lowWasteCount = computed.filter(({ row, eff }) => eff.mapped && eff.balance <= 0 && !eff.eligible).length;
  const unmappedCount = unmappedProducts.length;
  const lockedCount   = Object.keys(lockedRows).length;

  // ── Master CRUD
  function updateMaster(idx: number, patch: Partial<MasterEntry>) {
    setMasterEntries(p => p.map((e, i) => i === idx ? { ...e, ...patch } : e));
  }
  function deleteMaster(idx: number) {
    setMasterEntries(p => p.filter((_, i) => i !== idx));
  }
  function addMaster() {
    if (!newMaster.code.trim()) return;
    setMasterEntries(p => [...p, { ...newMaster, code: newMaster.code.toUpperCase().trim() }]);
    setNewMaster({ code: "", rate: 0, minWastage: 0 });
  }

  // ── Mapper CRUD
  function updateMapper(idx: number, patch: Partial<MapperEntry>) {
    setMapperEntries(p => p.map((e, i) => i === idx ? { ...e, ...patch } : e));
  }
  function deleteMapper(idx: number) {
    setMapperEntries(p => p.filter((_, i) => i !== idx));
  }
  function addMapper() {
    if (!newMapper.erpName.trim() || !newMapper.incentiveCode.trim()) return;
    setMapperEntries(p => [...p, {
      erpName: newMapper.erpName.toUpperCase().trim(),
      incentiveCode: newMapper.incentiveCode.toUpperCase().trim(),
      notes: newMapper.notes,
    }]);
    setNewMapper({ erpName: "", incentiveCode: "", notes: "" });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/admin/staff-incentives" className="text-xs text-gold hover:underline">← Staff Incentives</Link>
          <h1 className="text-xl font-bold text-ink">Incentive Calculator</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rows && <span className="text-sm text-ink-dim">{rows.length} rows · <span className="font-semibold text-gold">{inr(grandTotal)}</span></span>}
          {rows && (
            <>
              <input value={period} onChange={e => setPeriod(e.target.value)}
                placeholder="Period (e.g. May 2026)"
                className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-36" />
              <button
                disabled={saveStatus === "saving" || !period.trim()}
                onClick={() => saveSheet.mutate(undefined)}
                className={clsx("text-sm px-4 py-1.5 rounded-lg2 font-medium", {
                  "bg-ok text-white": saveStatus === "saved",
                  "bg-gold text-white disabled:opacity-50": saveStatus !== "saved",
                })}>
                {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : savedSheetId ? "Update" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Saved sheets */}
      {savedSheets.length > 0 && (
        <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Saved Sheets — click to load</p>
          <div className="flex flex-wrap gap-2">
            {savedSheets.map(s => (
              <div key={s.id} className={clsx("flex items-center gap-1.5 border rounded-lg2 px-3 py-1.5 text-xs", {
                "border-gold/50 bg-gold/5 text-gold font-medium": s.id === savedSheetId,
                "border-line text-ink-dim hover:border-gold/40 bg-white": s.id !== savedSheetId,
              })}>
                <button onClick={() => loadSheet(s.id)} className="hover:underline">{s.period}</button>
                <span className="text-ink-dim/50">·</span>
                <span className="text-[10px] text-ink-dim">
                  {new Date(s.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                {s.id !== savedSheetId && (
                  <button onClick={() => { if (confirm(`Delete "${s.period}"?`)) deleteSheet.mutate(s.id); }}
                    className="text-err/60 hover:text-err ml-0.5">×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paste + split setting */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-medium text-ink-dim uppercase tracking-wide">Paste ERP Export (include header row)</p>
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            <span>Default SP1 / SP2 split:</span>
            <input type="number" min={0} max={100} value={defaultSplit}
              onChange={e => setDefaultSplit(Number(e.target.value))}
              className={`${inp} w-14 text-center`} />
            <span className="text-gold font-medium">/ {100 - defaultSplit}</span>
          </div>
        </div>
        <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={5}
          placeholder="Date&#9;Product&#9;Product Group Name&#9;Wastage&#9;MC&#9;Sales Person 1&#9;Sales Person 2&#9;Balance&#9;Net Wt&#9;Customer Name"
          className="w-full border border-line rounded-lg2 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gold resize-y"
        />
        <div className="flex gap-2">
          <button onClick={parse} disabled={!raw.trim()}
            className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-40">
            Calculate
          </button>
          {rows && (
            <button onClick={() => { setRows(null); setRaw(""); setOverrides({}); setDeletedIdxs([]); }}
              className="border border-line text-sm px-4 py-2 rounded-lg2 hover:border-err hover:text-err">
              Clear
            </button>
          )}
        </div>
      </div>

      {!rows && tab !== "settings" && (
        <div className="bg-canvas rounded-xl border border-line px-6 py-10 text-center text-ink-dim text-sm">
          Paste ERP export above and click Calculate, or go to{" "}
          <button onClick={() => setTab("settings")} className="text-gold hover:underline">Settings</button>
          {" "}to edit the master table and product mapper.
        </div>
      )}

      {/* Unmapped warning */}
      {rows && unmappedProducts.length > 0 && (
        <div className="bg-err/5 border border-err/30 rounded-xl px-4 py-3 text-xs">
          <span className="font-semibold text-err">Products not in mapper (rate = 0): </span>
          <span className="text-ink-dim">{unmappedProducts.join(" · ")} — </span>
          <button onClick={() => setTab("settings")} className="text-gold hover:underline">Add to mapper →</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line">
        {([
          { key: "data",     label: rows ? `Edit Data (${rows.length})` : "Edit Data" },
          { key: "staff",    label: `By Staff (${staffTotals.size})` },
          { key: "settings", label: "⚙ Master & Mapper" },
        ] as { key: ViewTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={clsx("px-4 py-1.5 text-sm rounded-t-lg2 -mb-px border border-b-0 transition-colors", {
              "bg-white border-line text-ink font-medium": tab === t.key,
              "border-transparent text-ink-dim hover:text-ink": tab !== t.key,
            })}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EDIT DATA TAB ── */}
      {tab === "data" && rows && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 bg-white border border-line rounded-xl px-4 py-2.5 shadow-soft text-xs">
            <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)} className={inp}>
              <option value="ALL">All Staff</option>
              {allStaff.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex gap-1 flex-wrap">
              {([
                { val: "all",      label: "All" },
                { val: "eligible", label: "Eligible" },
                { val: "balance",  label: `Has Balance (${balanceCount})` },
                { val: "lowwaste", label: `Low Wastage (${lowWasteCount})` },
                { val: "unmapped", label: `Unmapped (${unmappedCount})` },
                ...(lockedCount > 0 ? [{ val: "locked" as const, label: `Locked (${lockedCount})` }] : []),
              ] as { val: typeof filterStatus; label: string }[]).map(opt => (
                <button key={opt.val} onClick={() => setFilterStatus(opt.val)}
                  className={clsx("px-2.5 py-1 rounded-lg2", {
                    "bg-gold text-white": filterStatus === opt.val,
                    "border border-line text-ink-dim hover:border-gold": filterStatus !== opt.val,
                  })}>
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="ml-auto text-ink-dim">{filteredRows.length} shown</span>
          </div>

          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 1280 }}>
              <thead>
                <tr className="text-ink-dim border-b border-line bg-canvas">
                  <th className="px-2 py-2"></th>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">ERP Product → Code</th>
                  <th className="text-right px-2 py-2">Waste%</th>
                  <th className="text-right px-2 py-2 text-gold" title="Click to override">Min%↓</th>
                  <th className="text-right px-2 py-2">NetWt</th>
                  <th className="text-center px-2 py-2">Balance</th>
                  <th className="text-left px-2 py-2">SP1</th>
                  <th className="text-left px-2 py-2">SP2</th>
                  <th className="text-center px-2 py-2 text-gold" title="Click to override">Split↓</th>
                  <th className="text-center px-2 py-2">Ok?</th>
                  <th className="text-right px-3 py-2">Inc</th>
                  <th className="text-left px-3 py-2">Bill No</th>
                  <th className="text-left px-3 py-2">Customer</th>
                  <th className="text-left px-3 py-2">Mobile</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-ink-dim">No rows match filter</td></tr>
                )}
                {filteredRows.map(({ row, eff }) => {
                  const ov = overrides[row.idx];
                  const minChanged     = ov?.minWastage !== undefined;
                  const splitChanged   = ov?.sp1Share !== undefined;
                  const wastageChanged = ov?.wastage !== undefined;
                  const lockInfo       = lockedRows[String(row.idx)];

                  return (
                    <tr key={row.idx} className={clsx("border-b border-line last:border-0", {
                      "bg-ok/5 opacity-60": !!lockInfo,
                      "bg-err/5":  !lockInfo && eff.balance > 0,
                      "bg-warn/5": !lockInfo && !eff.eligible && eff.balance <= 0 && eff.mapped,
                      "bg-canvas/30": !lockInfo && eff.eligible,
                      "opacity-60": !eff.mapped,
                    })}>
                      <td className="px-2 py-1.5 text-center">
                        {!lockInfo && (
                          <button
                            onClick={() => deleteRow(row.idx)}
                            title="Remove this row"
                            className="text-ink-dim/40 hover:text-err text-base leading-none font-bold">×</button>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-ink-dim whitespace-nowrap">{row.date}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-medium">{row.product}</span>
                        {eff.mapped && eff.incentiveCode !== row.product && (
                          <span className="text-info text-[10px] ml-1">→ {eff.incentiveCode}</span>
                        )}
                        {!eff.mapped && (
                          <InlineMapperAdd
                            erpName={row.product}
                            masterEntries={masterEntries}
                            onSave={code => {
                              const updated = [...mapperEntries, { erpName: row.product, incentiveCode: code, notes: "" }];
                              setMapperEntries(updated);
                              if (period.trim()) saveSheet.mutate({ mapperEntries: updated });
                            }}
                          />
                        )}
                        {lockInfo && (
                          <span className="ml-1.5 text-[10px] text-ok border border-ok/30 px-1.5 py-0.5 rounded bg-ok/10">
                            paid · {lockInfo.period}
                          </span>
                        )}
                      </td>
                      <td className={clsx("px-2 py-1.5 text-right", { "text-ok": eff.eligible, "text-err": !eff.eligible && eff.balance <= 0, "text-ink-dim": eff.balance > 0 })}>
                        <span className={wastageChanged ? "text-info font-bold" : ""}>
                          <InlineNum value={eff.wastage} onSave={v => setOv(row.idx, { wastage: v })} readOnly={!!lockInfo} />%
                        </span>
                        {!lockInfo && wastageChanged && (
                          <button onClick={() => setOv(row.idx, { wastage: undefined })}
                            className="text-[10px] text-ink-dim hover:text-err ml-1">↩</button>
                        )}
                        {eff.recoveryPct < 100 && (
                          <div className="text-[9px] text-warn mt-0.5">
                            eff. {eff.effectiveVA}%
                            {eff.mcLost !== null && <span className="text-err ml-1">MC lost {inr(eff.mcLost)}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className={minChanged ? "text-info font-bold" : "text-ink-dim"}>
                          <InlineNum value={eff.minWastage} onSave={v => setOv(row.idx, { minWastage: v })} readOnly={!!lockInfo} />%
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">{row.netWt.toFixed(3)}g</td>
                      <td className="px-2 py-1.5 text-center">
                        {!lockInfo && (eff.balance > 0 || ov?.balanceZero) ? (
                          <BalanceCell
                            balance={row.balance}
                            ov={ov}
                            defaultBoardRate={(() => {
                              if (!boardRateStore) return undefined;
                              const pfx = row.billNo.split("/").pop()?.[0]?.toUpperCase();
                              return pfx === "S" ? boardRateStore.silver : boardRateStore.gold_22k;
                            })()}
                            onMarkPaid={() => setOv(row.idx, { balanceZero: true, paidDate: new Date().toISOString().slice(0, 10) })}
                            onSavePartial={paid => setOv(row.idx, { amountPaid: paid })}
                            onWriteOff={(paid, wo, br) => setOv(row.idx, { balanceZero: true, paidDate: new Date().toISOString().slice(0, 10), amountPaid: paid || undefined, writeOffAmt: wo, boardRate: br })}
                            onUndo={() => setOv(row.idx, { balanceZero: false, paidDate: undefined, amountPaid: undefined, writeOffAmt: undefined })}
                          />
                        ) : <span className="text-ok text-[10px]">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-ink-dim truncate max-w-[80px]">{row.sp1 || "—"}</td>
                      <td className="px-2 py-1.5 text-ink-dim truncate max-w-[80px]">{row.sp2 || "—"}</td>
                      <td className="px-2 py-1.5 text-center">
                        {row.sp2 ? (
                          <span className={splitChanged ? "text-info font-bold" : "text-ink-dim"}>
                            <InlineNum value={eff.sp1Share} onSave={v => setOv(row.idx, { sp1Share: Math.min(100, Math.max(0, v)) })} readOnly={!!lockInfo} />/
                            {100 - eff.sp1Share}
                          </span>
                        ) : <span className="text-ink-dim">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {lockInfo ? (
                          <span className="text-ok text-[10px] font-medium">Paid</span>
                        ) : ov?.forceIneligible ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span className="text-ink-dim text-[10px]">Skipped</span>
                            <button onClick={() => setOv(row.idx, { forceIneligible: false })}
                              className="text-[9px] text-ok border border-ok/30 rounded px-1 hover:bg-ok/10">↑ undo</button>
                          </span>
                        ) : eff.eligible ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span className="text-ok font-bold">✓</span>
                            <button onClick={() => setOv(row.idx, { forceIneligible: true })}
                              className="text-[9px] text-ink-dim border border-line rounded px-1 hover:text-err hover:border-err/30">↓ skip</button>
                          </span>
                        ) : eff.balance > 0 ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span className="text-err text-[10px] font-medium">Balance</span>
                            <button onClick={() => setOv(row.idx, { forceIneligible: true })}
                              className="text-[9px] text-ink-dim border border-line rounded px-1 hover:text-err hover:border-err/30">↓ skip</button>
                          </span>
                        ) : !eff.mapped ? (
                          <span className="text-err text-[10px]">Unmapped</span>
                        ) : (
                          <span className="text-err text-[10px]">Low%</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {eff.totalInc > 0 ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span className="font-mono font-semibold text-ok">{inr(eff.totalInc)}</span>
                            {eff.recoveryPct < 100 && (
                              <span className="inline-flex items-center gap-1">
                                <span className="text-[9px] line-through text-ink-dim font-mono">{inr(eff.fullInc)}</span>
                                <span className="text-[9px] bg-warn/10 text-warn border border-warn/30 px-1 rounded">{eff.recoveryPct}%</span>
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <span className={`text-[10px] font-mono ${ov?.rateOverride !== undefined ? "text-info font-bold" : "text-ink-dim"}`}>
                                <InlineNum value={eff.rate} onSave={v => setOv(row.idx, { rateOverride: v })} width={44} readOnly={!!lockInfo} />{eff.perSale ? "/sale" : "/g"}
                              </span>
                              {ov?.rateOverride !== undefined && (
                                <span className="inline-flex items-center gap-0.5">
                                  <span className="text-[9px] text-ink-dim line-through font-mono">{eff.masterRate}{eff.perSale ? "/sale" : "/g"}</span>
                                  <button onClick={() => setOv(row.idx, { rateOverride: undefined })}
                                    className="text-[9px] text-ink-dim hover:text-err">↩</button>
                                </span>
                              )}
                            </span>
                          </span>
                        ) : eff.rate > 0 ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span className="font-mono text-ink-dim">—</span>
                            <span className="inline-flex items-center gap-1">
                              <span className={`text-[10px] font-mono ${ov?.rateOverride !== undefined ? "text-info font-bold" : "text-ink-dim"}`}>
                                <InlineNum value={eff.rate} onSave={v => setOv(row.idx, { rateOverride: v })} width={44} readOnly={!!lockInfo} />{eff.perSale ? "/sale" : "/g"}
                              </span>
                              {ov?.rateOverride !== undefined && (
                                <span className="inline-flex items-center gap-0.5">
                                  <span className="text-[9px] text-ink-dim line-through font-mono">{eff.masterRate}{eff.perSale ? "/sale" : "/g"}</span>
                                  <button onClick={() => setOv(row.idx, { rateOverride: undefined })}
                                    className="text-[9px] text-ink-dim hover:text-err">↩</button>
                                </span>
                              )}
                            </span>
                          </span>
                        ) : <span className="font-mono text-ink-dim">—</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] whitespace-nowrap">
                        {row.billNo ? (
                          <span className="inline-flex items-center gap-1">
                            {(() => {
                              const pfx = row.billNo.split("/").pop()?.[0]?.toUpperCase();
                              const cls = pfx === "G" ? "bg-gold/10 text-gold border-gold/30"
                                        : pfx === "S" ? "bg-info/10 text-info border-info/30"
                                        : pfx === "D" ? "bg-purple-100 text-purple-600 border-purple-200"
                                        : "bg-canvas text-ink-dim border-line";
                              return pfx ? <span className={`text-[9px] border px-1 py-0.5 rounded font-bold ${cls}`}>{pfx}</span> : null;
                            })()}
                            <span className="text-ink-dim">{row.billNo}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-ink-dim truncate max-w-[120px]">{row.customer || "—"}</td>
                      <td className="px-3 py-1.5 text-ink-dim font-mono text-[11px]">{row.mobile || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filteredRows.length > 0 && (
                <tfoot>
                  {(() => {
                    const woRows = filteredRows.filter(({ row }) => overrides[row.idx]?.writeOffAmt);
                    const totalWO  = woRows.reduce((s, { row }) => s + (overrides[row.idx]?.writeOffAmt ?? 0), 0);
                    const totalGST = parseFloat((totalWO * 3 / 103).toFixed(2));
                    const totalNet = parseFloat((totalWO * 100 / 103).toFixed(2));
                    return woRows.length > 0 ? (
                      <tr className="bg-warn/5 border-t border-warn/30 text-[10px]">
                        <td colSpan={14} className="px-3 py-1.5 text-warn">
                          <span className="font-semibold">Write-off summary ({woRows.length} bills):</span>
                          {" "}Total written off: <span className="font-mono font-bold">{inr(totalWO)}</span>
                          {" · "}GST lost: <span className="font-mono text-err">{inr(totalGST)}</span>
                          {" · "}Net revenue lost: <span className="font-mono text-err">{inr(totalNet)}</span>
                        </td>
                      </tr>
                    ) : null;
                  })()}
                  <tr className="bg-canvas border-t-2 border-line font-semibold">
                    <td colSpan={13} className="px-3 py-2 text-right text-ink-dim text-xs">Visible total</td>
                    <td className="px-3 py-2 text-right text-ok font-mono">
                      {inr(filteredRows.reduce((s, { eff }) => s + eff.totalInc, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── BY STAFF TAB ── */}
      {tab === "staff" && (
        <div className="space-y-4">
          {staffTotals.size === 0 && (
            <div className="bg-canvas rounded-xl border border-line px-6 py-10 text-center text-ink-dim text-sm">
              Paste and calculate data first.
            </div>
          )}

          {/* Sales performance leaderboard */}
          {salesLeaderboard.length > 0 && (
            <SalesLeaderboard data={salesLeaderboard} />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[...staffTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => {
              const staffRowsAll = computed.filter(({ row }) => row.sp1 === name || row.sp2 === name);
              const lockedAmt = staffRowsAll.reduce((s, { row, eff }) => {
                if (!lockedRows[String(row.idx)]) return s;
                return s + (row.sp1 === name ? eff.sp1Inc : eff.sp2Inc);
              }, 0);
              const isFullyLocked = lockedAmt > 0 && total === 0;
              return (
              <button key={name} onClick={() => setExpandedStaff(prev => {
                const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n;
              })} className={clsx("rounded-xl border p-3 text-left shadow-soft transition-colors", {
                "border-ok/50 bg-ok/5": isFullyLocked,
                "border-gold/50 bg-gold/5": expandedStaff.has(name) && !isFullyLocked,
                "border-line bg-white hover:border-gold/30": !expandedStaff.has(name) && !isFullyLocked,
              })}>
                <p className="text-xs text-ink-dim truncate">{name}</p>
                <p className={clsx("text-base font-bold", isFullyLocked ? "text-ok" : "text-gold")}>{inr(total)}</p>
                {lockedAmt > 0 && (
                  <p className="text-[10px] text-ok mt-0.5">Paid: {inr(lockedAmt)}</p>
                )}
                <p className="text-[10px] text-ink-dim mt-0.5">
                  {staffRowsAll.length} sales · {expandedStaff.has(name) ? "▲" : "▼"}
                </p>
              </button>
              );
            })}
          </div>
          {[...staffTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => {
            if (!expandedStaff.has(name)) return null;
            const staffRows = computed.filter(({ row }) => row.sp1 === name || row.sp2 === name);
            return (
              <div key={name} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-canvas">
                  <span className="font-semibold text-sm">{name}</span>
                  <span className="text-sm font-bold text-gold">{inr(total)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 580 }}>
                    <thead>
                      <tr className="text-ink-dim border-b border-line">
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Product</th>
                        <th className="text-right px-2 py-2">Waste / Min%</th>
                        <th className="text-right px-2 py-2">NetWt</th>
                        <th className="text-center px-2 py-2">Balance</th>
                        <th className="text-left px-2 py-2">Partner</th>
                        <th className="text-center px-2 py-2">Split</th>
                        <th className="text-right px-3 py-2 text-ok">My Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRows.map(({ row, eff }) => {
                        const isSp1    = row.sp1 === name;
                        const myShare  = isSp1 ? eff.sp1Inc : eff.sp2Inc;
                        const lockInfo = lockedRows[String(row.idx)];
                        return (
                          <tr key={row.idx} className={clsx("border-b border-line last:border-0", {
                            "bg-ok/5 opacity-60": !!lockInfo,
                            "opacity-40": !lockInfo && !eff.eligible,
                            "hover:bg-canvas/50": !lockInfo && eff.eligible,
                          })}>
                            <td className="px-3 py-1.5 text-ink-dim whitespace-nowrap">{row.date}</td>
                            <td className="px-3 py-1.5 font-medium">
                              {row.product}
                              {eff.mapped && eff.incentiveCode !== row.product && <span className="text-info text-[10px] ml-1">→ {eff.incentiveCode}</span>}
                              {lockInfo && <span className="ml-1 text-[10px] text-ok border border-ok/30 px-1 py-0.5 rounded bg-ok/10">paid</span>}
                            </td>
                            <td className={clsx("px-2 py-1.5 text-right", eff.eligible ? "text-ok" : "text-err")}>
                              {eff.wastage > 0 ? `${eff.wastage}%` : "—"} / {eff.minWastage}%
                            </td>
                            <td className="px-2 py-1.5 text-right">{row.netWt.toFixed(3)}g</td>
                            <td className="px-2 py-1.5 text-center">
                              {eff.balance > 0 ? <span className="text-err">{inr(eff.balance)}</span> : <span className="text-ok text-[10px]">Paid</span>}
                            </td>
                            <td className="px-2 py-1.5 text-ink-dim">{(isSp1 ? row.sp2 : row.sp1) || "—"}</td>
                            <td className="px-2 py-1.5 text-center text-ink-dim">
                              {row.sp2 ? `${isSp1 ? eff.sp1Share : 100 - eff.sp1Share}%` : "—"}
                            </td>
                            <td className={clsx("px-3 py-1.5 text-right font-mono font-semibold", myShare > 0 ? "text-ok" : "text-ink-dim")}>
                              {myShare > 0 ? inr(myShare) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-canvas border-t-2 border-line">
                        <td colSpan={7} className="px-3 py-2 text-right text-ink-dim font-medium">Total</td>
                        <td className="px-3 py-2 text-right font-bold text-ok">{inr(total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {staffTotals.size > 1 && (
            <div className="bg-white rounded-xl border border-line shadow-soft px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-sm">Grand Total — All Staff</span>
              <span className="text-lg font-bold text-gold">{inr(grandTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {tab === "settings" && (
        <div className="space-y-4">
          {/* Sub-tabs */}
          <div className="flex gap-2">
            {([
              { key: "mapper", label: `Product Mapper (${mapperEntries.length})` },
              { key: "master", label: `Rate Master (${masterEntries.length})` },
            ] as { key: "master"|"mapper"; label: string }[]).map(t => (
              <button key={t.key} onClick={() => setSettingsSection(t.key)}
                className={clsx("px-4 py-1.5 text-sm rounded-lg2 border transition-colors", {
                  "bg-gold text-white border-gold": settingsSection === t.key,
                  "border-line text-ink-dim hover:border-gold": settingsSection !== t.key,
                })}>
                {t.label}
              </button>
            ))}
            <button onClick={() => { setMasterEntries(INITIAL_MASTER); setMapperEntries(INITIAL_MAPPER); }}
              className="ml-auto text-xs text-err border border-err/30 px-3 py-1.5 rounded-lg2 hover:bg-err/5">
              Reset to default
            </button>
          </div>

          {/* Product Mapper */}
          {settingsSection === "mapper" && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-canvas">
                <p className="text-sm font-semibold">ERP Product → Incentive Code Mapper</p>
                <p className="text-xs text-ink-dim mt-0.5">Maps ERP product names to incentive codes. Click any value to edit in place.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 560 }}>
                  <thead>
                    <tr className="text-ink-dim border-b border-line bg-canvas/50">
                      <th className="text-left px-3 py-2">ERP Product Name</th>
                      <th className="text-left px-3 py-2">→ Incentive Code</th>
                      <th className="text-left px-3 py-2">Notes</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {mapperEntries.map((m, i) => {
                      const codeExists = masterEntries.some(e => e.code.toUpperCase() === m.incentiveCode.toUpperCase());
                      return (
                        <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/30">
                          <td className="px-3 py-1.5 font-mono font-medium">
                            <InlineText value={m.erpName} onSave={v => updateMapper(i, { erpName: v })} width={160} />
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={codeExists ? "text-ok" : "text-err"}>
                              <InlineText value={m.incentiveCode} onSave={v => updateMapper(i, { incentiveCode: v })} width={160} />
                            </span>
                            {!codeExists && <span className="ml-1 text-[10px] text-err">not in master</span>}
                          </td>
                          <td className="px-3 py-1.5 text-ink-dim">
                            <InlineText value={m.notes} onSave={v => updateMapper(i, { notes: v })} width={140} />
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button onClick={() => deleteMapper(i)} className="text-err text-[10px] hover:underline">Del</button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Add row */}
                    <tr className="border-t-2 border-line bg-gold/5">
                      <td className="px-3 py-2">
                        <input value={newMapper.erpName} onChange={e => setNewMapper(p => ({ ...p, erpName: e.target.value.toUpperCase() }))}
                          placeholder="ERP PRODUCT NAME" className={`${inp} w-full font-mono`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={newMapper.incentiveCode} onChange={e => setNewMapper(p => ({ ...p, incentiveCode: e.target.value.toUpperCase() }))}
                          placeholder="INCENTIVE CODE" className={`${inp} w-full`} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={newMapper.notes} onChange={e => setNewMapper(p => ({ ...p, notes: e.target.value }))}
                          placeholder="Notes (optional)" className={`${inp} w-full`} />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={addMapper} disabled={!newMapper.erpName || !newMapper.incentiveCode}
                          className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40 whitespace-nowrap">
                          + Add
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rate Master */}
          {settingsSection === "master" && (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-canvas">
                <p className="text-sm font-semibold">Incentive Rate Master</p>
                <p className="text-xs text-ink-dim mt-0.5">Click Rate or Min% values to edit them. Changes apply immediately to the calculation.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: 420 }}>
                  <thead>
                    <tr className="text-ink-dim border-b border-line bg-canvas/50">
                      <th className="text-left px-3 py-2">Incentive Code</th>
                      <th className="text-right px-3 py-2">Rate</th>
                      <th className="text-center px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Min Wastage %</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {masterEntries.map((m, i) => (
                      <tr key={i} className="border-b border-line last:border-0 hover:bg-canvas/30">
                        <td className="px-3 py-1.5 font-mono font-medium">
                          <InlineText value={m.code} onSave={v => updateMaster(i, { code: v })} width={180} />
                        </td>
                        <td className="px-3 py-1.5 text-right text-ok font-semibold">
                          <InlineNum value={m.rate} onSave={v => updateMaster(i, { rate: v })} />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button
                            onClick={() => updateMaster(i, { perSale: !m.perSale })}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors ${
                              m.perSale
                                ? "bg-info/10 border-info/30 text-info"
                                : "bg-canvas border-line text-ink-dim"
                            }`}
                          >
                            {m.perSale ? "per sale" : "per gram"}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 text-right text-ink-dim">
                          <InlineNum value={m.minWastage} onSave={v => updateMaster(i, { minWastage: v })} />%
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button onClick={() => deleteMaster(i)} className="text-err text-[10px] hover:underline">Del</button>
                        </td>
                      </tr>
                    ))}
                    {/* Add row */}
                    <tr className="border-t-2 border-line bg-gold/5">
                      <td className="px-3 py-2">
                        <input value={newMaster.code} onChange={e => setNewMaster(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                          placeholder="INCENTIVE CODE" className={`${inp} w-full font-mono`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={newMaster.rate || ""} onChange={e => setNewMaster(p => ({ ...p, rate: parseFloat(e.target.value) || 0 }))}
                          placeholder="Rate" className={`${inp} w-full text-right`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" value={newMaster.minWastage || ""} onChange={e => setNewMaster(p => ({ ...p, minWastage: parseFloat(e.target.value) || 0 }))}
                          placeholder="Min%" className={`${inp} w-full text-right`} />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={addMaster} disabled={!newMaster.code}
                          className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40 whitespace-nowrap">
                          + Add
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
