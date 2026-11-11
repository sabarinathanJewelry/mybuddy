"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { inr, grams } from "@/lib/format";
import { fyForDate } from "@/lib/fy";
import { parseLegacyFile, isMismatch, type ParsedFile } from "@/modules/legacy/parse";

type Pending = ParsedFile & { fileName: string };
type ImportRow = { id: string; month: string; file_name: string; sheet_totals: Record<string, number>; issues: { tab: string; message: string }[]; imported_at: string };

type Metrics = { gold: number; silver: number; silverMrp: number; oldGold: number; oldSilver: number; expenses: number; orders: number };
const ZERO: Metrics = { gold: 0, silver: 0, silverMrp: 0, oldGold: 0, oldSilver: 0, expenses: 0, orders: 0 };

const FY_MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

const fyRange = (fy: string) => {
  const y = Number(fy.slice(0, 4));
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};
const fyIndex = (iso: string) => (Number(iso.slice(5, 7)) + 8) % 12;
const monthLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });

async function fetchAll<T>(build: (s: number, e: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let s = 0; ; s += 1000) {
    const { data, error } = await build(s, s + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function useMyBuddyFy(fy: string) {
  return useQuery({
    queryKey: ["legacy-compare-mybuddy", fy],
    queryFn: async () => {
      const { from, to } = fyRange(fy);
      const db = supabase();
      const [items, intake, expenses, orders] = await Promise.all([
        fetchAll<any>((s, e) => db.from("sale_items").select("metal, net_wt, line_total, sales!inner(bill_date, status)")
          .gte("sales.bill_date", from).lte("sales.bill_date", to).eq("sales.status", "confirmed").range(s, e)),
        fetchAll<any>((s, e) => db.from("old_metal_intake").select("metal, gross_wt, intake_date").gte("intake_date", from).lte("intake_date", to).range(s, e)),
        fetchAll<any>((s, e) => db.from("expenses").select("amount, exp_date").gte("exp_date", from).lte("exp_date", to).range(s, e)),
        fetchAll<any>((s, e) => db.from("orders").select("order_date, status").gte("order_date", from).lte("order_date", to).range(s, e)),
      ]);
      const m: Metrics[] = FY_MONTHS.map(() => ({ ...ZERO }));
      for (const i of items) {
        const k = m[fyIndex(i.sales.bill_date)];
        const metal = String(i.metal ?? "");
        if (metal === "silver_mpr") k.silverMrp += Number(i.line_total || 0);
        else if (metal.startsWith("gold")) k.gold += Number(i.net_wt || 0);
        else if (metal.startsWith("silver")) k.silver += Number(i.net_wt || 0);
      }
      for (const i of intake) {
        const k = m[fyIndex(i.intake_date)];
        if (String(i.metal).startsWith("gold")) k.oldGold += Number(i.gross_wt || 0);
        else k.oldSilver += Number(i.gross_wt || 0);
      }
      for (const x of expenses) m[fyIndex(x.exp_date)].expenses += Number(x.amount || 0);
      for (const o of orders) if (o.status !== "cancelled") m[fyIndex(o.order_date)].orders += 1;
      return m;
    },
  });
}

const fromTotals = (t: Record<string, number>): Metrics => ({
  gold: (t.gold_rsj_g ?? 0) + (t.gold_non_rsj_g ?? 0),
  silver: t.silver_g ?? 0,
  silverMrp: t.silver_mrp ?? 0,
  oldGold: t.old_gold_g ?? 0,
  oldSilver: t.old_silver_g ?? 0,
  expenses: t.expenses ?? 0,
  orders: t.orders ?? 0,
});

const METRICS: { key: keyof Metrics; label: string; fmt: (n: number) => string }[] = [
  { key: "gold", label: "Gold sold (g)", fmt: (n) => grams(n) },
  { key: "silver", label: "Silver sold (g)", fmt: (n) => grams(n, 1) },
  { key: "silverMrp", label: "Silver MRP (₹)", fmt: inr },
  { key: "oldGold", label: "Old gold in (g)", fmt: (n) => grams(n) },
  { key: "oldSilver", label: "Old silver in (g)", fmt: (n) => grams(n, 1) },
  { key: "expenses", label: "Expenses (₹)", fmt: inr },
  { key: "orders", label: "Orders (count)", fmt: (n) => String(Math.round(n)) },
];

export default function LegacyImportPage() {
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending[]>([]);
  const [parseErr, setParseErr] = useState("");
  const [metric, setMetric] = useState<keyof Metrics>("gold");
  const [myFy, setMyFy] = useState(fyForDate(new Date()));

  const imports = useQuery({
    queryKey: ["legacy-imports"],
    queryFn: async () => {
      const { data, error } = await supabase().from("legacy_imports").select("id, month, file_name, sheet_totals, issues, imported_at").order("month");
      if (error) throw error;
      return (data ?? []) as ImportRow[];
    },
  });

  const legacyFys = useMemo(() => [...new Set((imports.data ?? []).map((i) => fyForDate(i.month)))].sort(), [imports.data]);
  const [pickedLegacyFy, setLegacyFy] = useState("");
  const legacyFy = pickedLegacyFy || legacyFys[legacyFys.length - 1] || "";
  const mine = useMyBuddyFy(myFy);

  const save = useMutation({
    mutationFn: async (p: Pending) => {
      const db = supabase();
      const { error: delErr } = await db.from("legacy_imports").delete().eq("month", p.month);
      if (delErr) throw delErr;
      const { data, error } = await db.from("legacy_imports")
        .insert({ month: p.month, file_name: p.fileName, sheet_totals: p.totals, issues: [...p.issues, ...p.checks.filter(isMismatch).map((c) => ({ tab: c.tab, message: `${c.label}: sheet ${c.sheet} vs rows ${c.computed}` }))] })
        .select("id").single();
      if (error) throw error;
      for (let i = 0; i < p.entries.length; i += 500) {
        const { error: e } = await db.from("legacy_entries").insert(p.entries.slice(i, i + 500).map((x) => ({ ...x, import_id: data.id })));
        if (e) throw e;
      }
      return p.month;
    },
    onSuccess: (month) => {
      setPending((ps) => ps.filter((p) => p.month !== month));
      qc.invalidateQueries({ queryKey: ["legacy-imports"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("legacy_imports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legacy-imports"] }),
  });

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setParseErr("");
    const out: Pending[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push({ ...parseLegacyFile(await f.arrayBuffer(), f.name), fileName: f.name });
      } catch (e: any) {
        setParseErr(`${f.name}: ${e.message}`);
      }
    }
    setPending((ps) => [...ps.filter((p) => !out.some((o) => o.month === p.month)), ...out].sort((a, b) => a.month.localeCompare(b.month)));
  }

  if (profile?.role !== "admin") return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;

  const legacyByIdx: (Metrics | null)[] = FY_MONTHS.map(() => null);
  (imports.data ?? []).filter((i) => fyForDate(i.month) === legacyFy).forEach((i) => { legacyByIdx[fyIndex(i.month)] = fromTotals(i.sheet_totals); });
  const meta = METRICS.find((m) => m.key === metric)!;
  const fyOptions = Array.from({ length: 4 }, (_, i) => { const y = Number(fyForDate(new Date()).slice(0, 4)) - i; return `${y}-${String(y + 1).slice(2)}`; });

  let lTot = 0, mTot = 0, lTotSame = 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Sheet History Import</h1>
        <p className="text-sm text-ink-dim mt-1">Upload the monthly Google Sheet files (.xlsx). Each file is checked against its own totals before saving. Outstanding and RSJ-Current Stock tabs are skipped.</p>
      </div>

      <label className="block border-2 border-dashed border-line rounded-lg2 p-6 text-center cursor-pointer hover:border-gold bg-white">
        <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        <span className="text-sm text-ink">Choose one or more monthly files</span>
      </label>
      {parseErr && <p className="text-sm text-err">{parseErr}</p>}

      {pending.map((p) => {
        const bad = p.checks.filter(isMismatch);
        const exists = imports.data?.some((i) => i.month === p.month);
        return (
          <div key={p.month} className="bg-white border border-line rounded-lg2 shadow-soft">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-ink">{monthLabel(p.month)} <span className="text-xs text-ink-dim font-normal">· {p.fileName} · {p.entries.length} rows</span></p>
                <p className={`text-xs mt-0.5 ${bad.length || p.issues.length ? "text-warn" : "text-ok"}`}>
                  {bad.length} total mismatch(es) · {p.issues.length} data issue(s){exists ? " · will replace the saved copy of this month" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPending((ps) => ps.filter((x) => x.month !== p.month))} className="text-xs px-3 py-1.5 border border-line rounded-lg2 text-ink-dim">Discard</button>
                <button onClick={() => save.mutate(p)} disabled={save.isPending} className="text-xs px-3 py-1.5 rounded-lg2 bg-gold text-white disabled:opacity-50">
                  {save.isPending && save.variables?.month === p.month ? "Saving…" : "Save to DB"}
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4 p-4">
              <table className="w-full text-xs">
                <thead><tr className="text-ink-dim text-left"><th className="py-1">Check</th><th className="text-right">Sheet total</th><th className="text-right">Sum of rows</th><th className="text-right">Diff</th></tr></thead>
                <tbody>
                  {p.checks.map((c, i) => {
                    const m = isMismatch(c);
                    const f = (n: number) => (c.unit === "₹" ? inr(n) : c.unit === "g" ? grams(n) : String(n));
                    return (
                      <tr key={i} className={`border-t border-line ${m ? "text-err font-medium" : ""}`}>
                        <td className="py-1">{c.tab} · {c.label}</td>
                        <td className="text-right font-mono">{c.sheet == null ? "—" : f(c.sheet)}</td>
                        <td className="text-right font-mono">{f(c.computed)}</td>
                        <td className="text-right font-mono">{c.sheet == null ? "" : m ? f(Math.round((c.computed - c.sheet) * 1000) / 1000) : "✓"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-xs space-y-1">
                <p className="text-ink-dim font-medium mb-1">Data issues</p>
                {p.issues.length === 0 ? <p className="text-ok">None</p> : p.issues.map((i, k) => <p key={k}><span className="text-ink-dim">{i.tab}:</span> {i.message}</p>)}
              </div>
            </div>
          </div>
        );
      })}
      {save.error && <p className="text-sm text-err">Save failed: {(save.error as Error).message}</p>}

      <div className="bg-white border border-line rounded-lg2 shadow-soft">
        <div className="px-4 py-3 border-b border-line flex items-center gap-3 flex-wrap">
          <p className="font-semibold text-ink mr-auto">Compare: Sheet vs MyBuddy</p>
          <label className="text-xs text-ink-dim">Sheet FY
            <select value={legacyFy} onChange={(e) => setLegacyFy(e.target.value)} className="ml-1 border border-line rounded-lg2 px-2 py-1 text-xs">
              {legacyFys.length === 0 && <option value="">—</option>}
              {legacyFys.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-dim">MyBuddy FY
            <select value={myFy} onChange={(e) => setMyFy(e.target.value)} className="ml-1 border border-line rounded-lg2 px-2 py-1 text-xs">
              {fyOptions.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as keyof Metrics)} className="border border-line rounded-lg2 px-2 py-1 text-xs">
            {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        {mine.error && <p className="p-4 text-sm text-err">{(mine.error as Error).message}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-dim text-left bg-canvas">
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2 text-right">Sheet {legacyFy}</th>
                <th className="px-4 py-2 text-right">MyBuddy {myFy}</th>
                <th className="px-4 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {FY_MONTHS.map((mName, i) => {
                const l = legacyByIdx[i]?.[metric] ?? null;
                const m = mine.data ? mine.data[i][metric] : null;
                const hasMine = m != null && m !== 0;
                if (l != null) lTot += l;
                if (m != null) mTot += m;
                if (l != null && hasMine) lTotSame += l;
                const ch = l && hasMine ? ((m! - l) / l) * 100 : null;
                return (
                  <tr key={mName} className="border-t border-line">
                    <td className="px-4 py-2">{mName}</td>
                    <td className="px-4 py-2 text-right font-mono">{l == null ? <span className="text-ink-dim">not imported</span> : meta.fmt(l)}</td>
                    <td className="px-4 py-2 text-right font-mono">{mine.isLoading ? "…" : hasMine ? meta.fmt(m!) : <span className="text-ink-dim">—</span>}</td>
                    <td className={`px-4 py-2 text-right font-mono ${ch == null ? "" : ch >= 0 ? "text-ok" : "text-err"}`}>{ch == null ? "" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-line font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right font-mono">{meta.fmt(lTot)}</td>
                <td className="px-4 py-2 text-right font-mono">{meta.fmt(mTot)}</td>
                <td className={`px-4 py-2 text-right font-mono ${lTotSame && mTot >= lTotSame ? "text-ok" : "text-err"}`}>
                  {lTotSame ? `${mTot >= lTotSame ? "+" : ""}${(((mTot - lTotSame) / lTotSame) * 100).toFixed(1)}%` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-ink-dim border-t border-line">
          Total change compares only months that have data on both sides. Sheet gold = RSJ + Non-RSJ (order weight excluded). MyBuddy gold/silver = net weight on confirmed bills; old metal = gross weight in Old Metal intake.
        </p>
      </div>

      <div className="bg-white border border-line rounded-lg2 shadow-soft">
        <p className="px-4 py-3 border-b border-line font-semibold text-ink">Saved months</p>
        {(imports.data ?? []).length === 0 && <p className="p-4 text-sm text-ink-dim">Nothing imported yet.</p>}
        {(imports.data ?? []).map((i) => (
          <details key={i.id} className="border-t border-line first:border-t-0">
            <summary className="px-4 py-2 text-sm cursor-pointer flex items-center gap-3">
              <span className="font-medium">{monthLabel(i.month)}</span>
              <span className="text-xs text-ink-dim">{i.file_name}</span>
              <span className={`text-xs ${i.issues.length ? "text-warn" : "text-ok"}`}>{i.issues.length} issue(s)</span>
              <button onClick={(e) => { e.preventDefault(); if (confirm(`Delete ${monthLabel(i.month)} import?`)) remove.mutate(i.id); }} className="ml-auto text-xs text-err hover:underline">Delete</button>
            </summary>
            <div className="px-6 pb-3 text-xs space-y-0.5">
              {i.issues.length === 0 ? <p className="text-ok">No issues</p> : i.issues.map((x, k) => <p key={k}><span className="text-ink-dim">{x.tab}:</span> {x.message}</p>)}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
