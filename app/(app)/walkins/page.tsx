"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { shortDate } from "@/lib/format";

interface Summary {
  id?: string;
  summary_date: string;
  gold_walkin: number;
  silver_walkin: number;
  other_walkin: number;
  gold_walkout: number;
  silver_walkout: number;
  other_walkout: number;
  order_gold: number;
  service_customer: number;
  scheme_entry: number;
  new_scheme: number;
  notes: string;
}

const blank = (date: string): Summary => ({
  summary_date: date,
  gold_walkin: 0, silver_walkin: 0, other_walkin: 0,
  gold_walkout: 0, silver_walkout: 0, other_walkout: 0,
  order_gold: 0, service_customer: 0, scheme_entry: 0, new_scheme: 0,
  notes: "",
});

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-gold";

export default function WalkinsPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();
  const [form, setForm] = useState<Summary>(blank(globalDate));
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(globalDate);
  const [view, setView] = useState<"entry" | "report">("entry");

  // Fetch all summaries ordered by date
  const { data: summaries, isLoading } = useQuery({
    queryKey: ["walk_in_summaries"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("walk_in_summaries")
        .select("*")
        .order("summary_date", { ascending: false })
        .limit(90);
      if (error) throw error;
      return data ?? [];
    },
  });

  // When date changes, pre-fill form with existing record if any
  useEffect(() => {
    const existing = (summaries as any[])?.find((s) => s.summary_date === formDate);
    setForm(existing ? { ...existing, notes: existing.notes ?? "" } : blank(formDate));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formDate, summaries]);

  const save = useMutation({
    mutationFn: async (data: Summary) => {
      const payload = {
        summary_date: data.summary_date,
        gold_walkin: data.gold_walkin,
        silver_walkin: data.silver_walkin,
        other_walkin: data.other_walkin,
        gold_walkout: data.gold_walkout,
        silver_walkout: data.silver_walkout,
        other_walkout: data.other_walkout,
        order_gold: data.order_gold,
        service_customer: data.service_customer,
        scheme_entry: data.scheme_entry,
        new_scheme: data.new_scheme,
        notes: data.notes || null,
      };
      // Upsert: if a record for this date exists, update it
      const { error } = await supabase()
        .from("walk_in_summaries")
        .upsert(payload, { onConflict: "summary_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["walk_in_summaries"] });
      setShowForm(false);
    },
  });

  function num(key: keyof Summary) {
    return (
      <input
        type="number" min={0} step={1}
        value={(form[key] as number) || ""}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })}
        className={inp}
      />
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (summaries as any[]) ?? [];
  const today = rows.find((r) => r.summary_date === globalDate);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Walk-in Counter</h1>
          <p className="text-sm text-ink-dim mt-0.5">{globalDate}</p>
        </div>
        {view === "entry" && <div className="flex gap-2">
          <button
            onClick={() => { setFormDate(globalDate); setShowForm(true); }}
            className="bg-gold text-white text-sm px-4 py-2 rounded-lg2"
          >
            {today ? "Edit Today" : "+ Add Today"}
          </button>
          <button
            onClick={() => {
              const yesterday = new Date(globalDate);
              yesterday.setDate(yesterday.getDate() - 1);
              setFormDate(yesterday.toISOString().slice(0, 10));
              setShowForm(true);
            }}
            className="border border-gold text-gold text-sm px-4 py-2 rounded-lg2 hover:bg-gold/10"
          >
            + Past Date
          </button>
        </div>}
      </div>

      <div className="flex gap-1 border-b border-line">
        {(["entry", "report"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 ${view === v ? "border-gold text-gold font-medium" : "border-transparent text-ink-dim hover:text-ink"}`}>
            {v === "entry" ? "Daily Entry" : "Report"}
          </button>
        ))}
      </div>

      {view === "report" ? <WalkinReport today={globalDate} /> : <>

      {/* Today quick stats */}
      {today && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Gold Walk-in", val: today.gold_walkin, color: "text-gold" },
              { label: "Silver Walk-in", val: today.silver_walkin, color: "text-ink-mid" },
              { label: "Other Walk-in", val: today.other_walkin, color: "text-ink-dim" },
              { label: "Gold Walk-out", val: today.gold_walkout, color: "text-err" },
              { label: "Silver Walk-out", val: today.silver_walkout, color: "text-err" },
              { label: "Other Walk-out", val: today.other_walkout, color: "text-err" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className="text-xs text-ink-dim mb-1 leading-tight">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val ?? 0}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Order Gold", val: today.order_gold, color: "text-gold" },
              { label: "Service Customer", val: today.service_customer, color: "text-info" },
              { label: "Scheme Entry", val: today.scheme_entry, color: "text-ok" },
              { label: "New Scheme", val: today.new_scheme, color: "text-warn" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-line p-3 shadow-soft text-center">
                <p className="text-xs text-ink-dim mb-1 leading-tight">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.val ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entry form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
          className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Daily Walk-in Tally</h3>
            <input type="date" value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs text-center text-ink-dim mb-1">
            <div />
            <div className="font-medium text-gold">Gold</div>
            <div className="font-medium text-ink-mid">Silver</div>
            <div className="font-medium text-ink-dim">Other</div>
          </div>

          <div className="grid grid-cols-4 gap-2 items-center">
            <div className="text-sm font-medium text-ok">Walk-ins</div>
            {num("gold_walkin")}
            {num("silver_walkin")}
            {num("other_walkin")}
          </div>

          <div className="grid grid-cols-4 gap-2 items-center">
            <div className="text-sm font-medium text-err">Walk-outs</div>
            {num("gold_walkout")}
            {num("silver_walkout")}
            {num("other_walkout")}
          </div>

          <div className="border-t border-line pt-3 space-y-2">
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Customer Types</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "order_gold",       label: "Order Gold" },
                { key: "service_customer", label: "Service Customer" },
                { key: "scheme_entry",     label: "Scheme Entry Customer" },
                { key: "new_scheme",       label: "New Scheme Customer" },
              ] as { key: keyof Summary; label: string }[]).map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-ink-dim block mb-1">{label}</label>
                  {num(key)}
                </div>
              ))}
            </div>
          </div>

          {/* Totals preview */}
          <div className="grid grid-cols-2 gap-3 bg-canvas rounded-lg2 p-3 text-sm">
            <div className="text-ok">
              Total in: <strong>{form.gold_walkin + form.silver_walkin + form.other_walkin}</strong>
            </div>
            <div className="text-err">
              Total out: <strong>{form.gold_walkout + form.silver_walkout + form.other_walkout}</strong>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Notes</label>
            <input value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
              placeholder="Optional notes for the day…" />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {t("save")}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {save.isError && (
            <p className="text-xs text-err">Save failed — make sure migration 003 has been run in Supabase (walk_in_summaries table).</p>
          )}
        </form>
      )}

      {/* History table */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-center px-2 py-2.5">Gold In</th>
                <th className="text-center px-2 py-2.5">Silver In</th>
                <th className="text-center px-2 py-2.5">Other In</th>
                <th className="text-center px-2 py-2.5">Gold Out</th>
                <th className="text-center px-2 py-2.5">Silver Out</th>
                <th className="text-center px-2 py-2.5">Other Out</th>
                <th className="text-center px-2 py-2.5">Total In</th>
                <th className="text-center px-2 py-2.5">Total Out</th>
                <th className="text-center px-2 py-2.5">Order Gold</th>
                <th className="text-center px-2 py-2.5">Service</th>
                <th className="text-center px-2 py-2.5">Scheme Entry</th>
                <th className="text-center px-2 py-2.5">New Scheme</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(r.summary_date)}</td>
                  <td className="px-2 py-2.5 text-center text-gold font-medium">{r.gold_walkin ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-ink-mid">{r.silver_walkin ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-ink-dim">{r.other_walkin ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-err">{r.gold_walkout ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-err">{r.silver_walkout ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-err">{r.other_walkout ?? 0}</td>
                  <td className="px-2 py-2.5 text-center font-bold text-ok">{(r.gold_walkin ?? 0) + (r.silver_walkin ?? 0) + (r.other_walkin ?? 0)}</td>
                  <td className="px-2 py-2.5 text-center font-bold text-err">{(r.gold_walkout ?? 0) + (r.silver_walkout ?? 0) + (r.other_walkout ?? 0)}</td>
                  <td className="px-2 py-2.5 text-center text-gold">{r.order_gold ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-info">{r.service_customer ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-ok">{r.scheme_entry ?? 0}</td>
                  <td className="px-2 py-2.5 text-center text-warn">{r.new_scheme ?? 0}</td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => { setFormDate(r.summary_date); setShowForm(true); }}
                      className="text-xs text-gold hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </div>
  );
}

type Row = Summary & { id: string };
const METALS = [
  { key: "gold",   label: "Gold",   color: "text-gold" },
  { key: "silver", label: "Silver", color: "text-ink-mid" },
  { key: "other",  label: "Other",  color: "text-ink-dim" },
] as const;
const EXTRAS = [
  { key: "order_gold",       label: "Order Gold" },
  { key: "service_customer", label: "Service" },
  { key: "scheme_entry",     label: "Scheme Entry" },
  { key: "new_scheme",       label: "New Scheme" },
] as const;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const n = (v: unknown) => Number(v) || 0;
const totIn  = (r: Row) => n(r.gold_walkin) + n(r.silver_walkin) + n(r.other_walkin);
const totOut = (r: Row) => n(r.gold_walkout) + n(r.silver_walkout) + n(r.other_walkout);
// Walk-out = left without buying, so conversion is the share of walk-ins who did not walk out
const conv = (inn: number, out: number) => (inn > 0 ? Math.max(0, ((inn - out) / inn) * 100) : null);
const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(0)}%`);
const metalIn  = (m: string) => `${m}_walkin` as keyof Summary;
const metalOut = (m: string) => `${m}_walkout` as keyof Summary;

function addDays(iso: string, d: number) {
  const x = new Date(iso + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}
function weekStart(iso: string) {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return addDays(iso, -((dow + 6) % 7));
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function presetRange(p: string, today: string): [string, string] {
  const [y, m] = today.split("-").map(Number);
  const ym = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}`;
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const fyStart = m >= 4 ? y : y - 1;
  if (p === "last_month") { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; return [`${ym(py, pm)}-01`, lastDay(py, pm)]; }
  if (p === "last_30") return [addDays(today, -29), today];
  if (p === "last_90") return [addDays(today, -89), today];
  if (p === "this_fy") return [`${fyStart}-04-01`, today];
  if (p === "last_fy") return [`${fyStart - 1}-04-01`, `${fyStart}-03-31`];
  return [`${ym(y, m)}-01`, today];
}

function WalkinReport({ today }: { today: string }) {
  const [preset, setPreset] = useState("this_month");
  const [range, setRange] = useState<[string, string]>(() => presetRange("this_month", today));
  const [group, setGroup] = useState<"day" | "week" | "month">("day");
  const [from, to] = range;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["walk_in_report", from, to],
    queryFn: async () => {
      const { data, error } = await supabase().from("walk_in_summaries").select("*")
        .gte("summary_date", from).lte("summary_date", to).order("summary_date");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  function pickPreset(p: string) {
    setPreset(p);
    if (p === "custom") return;
    const r = presetRange(p, today);
    setRange(r);
    const span = (new Date(r[1]).getTime() - new Date(r[0]).getTime()) / 86400000;
    setGroup(span > 120 ? "month" : span > 45 ? "week" : "day");
  }

  const sum = (k: keyof Summary) => rows.reduce((s, r) => s + n(r[k]), 0);
  const allIn = rows.reduce((s, r) => s + totIn(r), 0);
  const allOut = rows.reduce((s, r) => s + totOut(r), 0);
  const days = rows.length;

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = group === "day" ? r.summary_date : group === "week" ? weekStart(r.summary_date) : r.summary_date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const groupLabel = (k: string) =>
    group === "day" ? `${shortDate(k)} ${DOW[new Date(k + "T00:00:00Z").getUTCDay()]}`
    : group === "week" ? `${shortDate(k)} – ${shortDate(addDays(k, 6))}`
    : monthLabel(k);

  const byDow = DOW.map((d, i) => {
    const rs = rows.filter((r) => new Date(r.summary_date + "T00:00:00Z").getUTCDay() === i);
    const inn = rs.reduce((s, r) => s + totIn(r), 0), out = rs.reduce((s, r) => s + totOut(r), 0);
    return { d, days: rs.length, avgIn: rs.length ? inn / rs.length : 0, avgOut: rs.length ? out / rs.length : 0, conv: conv(inn, out) };
  });
  const maxAvgIn = Math.max(1, ...byDow.map((x) => x.avgIn));

  const sel = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
  const card = "bg-white rounded-xl border border-line p-3 shadow-soft";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={preset} onChange={(e) => pickPreset(e.target.value)} className={sel}>
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="last_30">Last 30 days</option>
          <option value="last_90">Last 90 days</option>
          <option value="this_fy">This FY</option>
          <option value="last_fy">Last FY</option>
          <option value="custom">Custom</option>
        </select>
        <input type="date" value={from} onChange={(e) => { setPreset("custom"); setRange([e.target.value, to]); }} className={sel} />
        <span className="text-ink-dim text-sm">to</span>
        <input type="date" value={to} onChange={(e) => { setPreset("custom"); setRange([from, e.target.value]); }} className={sel} />
        <div className="flex border border-line rounded-lg2 overflow-hidden ml-auto">
          {(["day", "week", "month"] as const).map((g) => (
            <button key={g} onClick={() => setGroup(g)}
              className={`px-3 py-1.5 text-xs ${group === g ? "bg-gold text-white" : "text-ink-dim hover:bg-canvas"}`}>
              {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">Loading…</p> : !days ? (
        <p className="text-ink-dim text-sm py-8 text-center">No walk-in entries in this period.</p>
      ) : <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className={card}><p className="text-xs text-ink-dim">Total walk-ins</p><p className="text-2xl font-bold text-ok">{allIn}</p><p className="text-[11px] text-ink-dim">{(allIn / days).toFixed(1)} / day · {days} days entered</p></div>
          <div className={card}><p className="text-xs text-ink-dim">Total walk-outs</p><p className="text-2xl font-bold text-err">{allOut}</p><p className="text-[11px] text-ink-dim">{(allOut / days).toFixed(1)} / day</p></div>
          <div className={card}><p className="text-xs text-ink-dim">Converted</p><p className="text-2xl font-bold text-ink">{Math.max(0, allIn - allOut)}</p><p className="text-[11px] text-ink-dim">walk-ins minus walk-outs</p></div>
          <div className={card}><p className="text-xs text-ink-dim">Conversion</p><p className="text-2xl font-bold text-gold">{pct(conv(allIn, allOut))}</p><p className="text-[11px] text-ink-dim">walk-out rate {allIn ? ((allOut / allIn) * 100).toFixed(0) : 0}%</p></div>
        </div>

        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2">By metal</th><th className="text-right px-3 py-2">Walk-in</th><th className="text-right px-3 py-2">Walk-out</th><th className="text-right px-3 py-2">Converted</th><th className="text-right px-4 py-2">Conversion</th>
            </tr></thead>
            <tbody>
              {METALS.map((m) => {
                const inn = sum(metalIn(m.key)), out = sum(metalOut(m.key));
                return (
                  <tr key={m.key} className="border-b border-line last:border-0">
                    <td className={`px-4 py-2 font-medium ${m.color}`}>{m.label}</td>
                    <td className="px-3 py-2 text-right">{inn}</td>
                    <td className="px-3 py-2 text-right text-err">{out}</td>
                    <td className="px-3 py-2 text-right">{Math.max(0, inn - out)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{pct(conv(inn, out))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {EXTRAS.map((x) => (
            <div key={x.key} className={card}>
              <p className="text-xs text-ink-dim">{x.label}</p>
              <p className="text-xl font-bold">{sum(x.key)}</p>
              <p className="text-[11px] text-ink-dim">{(sum(x.key) / days).toFixed(1)} / day</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "720px" }}>
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2">{group === "day" ? "Date" : group === "week" ? "Week" : "Month"}</th>
              {METALS.map((m) => <th key={m.key} className="text-center px-2 py-2">{m.label} in / out</th>)}
              <th className="text-right px-2 py-2">Total in</th><th className="text-right px-2 py-2">Total out</th><th className="text-right px-2 py-2">Conv.</th>
              {EXTRAS.map((x) => <th key={x.key} className="text-right px-2 py-2">{x.label}</th>)}
            </tr></thead>
            <tbody>
              {[...groups.entries()].map(([k, rs]) => {
                const g = (key: keyof Summary) => rs.reduce((s, r) => s + n(r[key]), 0);
                const inn = rs.reduce((s, r) => s + totIn(r), 0), out = rs.reduce((s, r) => s + totOut(r), 0);
                return (
                  <tr key={k} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2 text-ink-dim whitespace-nowrap">{groupLabel(k)}{group !== "day" && <span className="text-[10px] ml-1">({rs.length}d)</span>}</td>
                    {METALS.map((m) => <td key={m.key} className="px-2 py-2 text-center">{g(metalIn(m.key))} / <span className="text-err">{g(metalOut(m.key))}</span></td>)}
                    <td className="px-2 py-2 text-right font-semibold text-ok">{inn}</td>
                    <td className="px-2 py-2 text-right font-semibold text-err">{out}</td>
                    <td className="px-2 py-2 text-right">{pct(conv(inn, out))}</td>
                    {EXTRAS.map((x) => <td key={x.key} className="px-2 py-2 text-right">{g(x.key)}</td>)}
                  </tr>
                );
              })}
              <tr className="bg-canvas font-semibold">
                <td className="px-4 py-2">Total</td>
                {METALS.map((m) => <td key={m.key} className="px-2 py-2 text-center">{sum(metalIn(m.key))} / <span className="text-err">{sum(metalOut(m.key))}</span></td>)}
                <td className="px-2 py-2 text-right text-ok">{allIn}</td>
                <td className="px-2 py-2 text-right text-err">{allOut}</td>
                <td className="px-2 py-2 text-right">{pct(conv(allIn, allOut))}</td>
                {EXTRAS.map((x) => <td key={x.key} className="px-2 py-2 text-right">{sum(x.key)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-line shadow-soft p-4">
          <p className="text-sm font-semibold mb-3">Average by day of week</p>
          <div className="space-y-1.5">
            {byDow.map((x) => (
              <div key={x.d} className="flex items-center gap-3 text-xs">
                <span className="w-8 text-ink-dim">{x.d}</span>
                <div className="flex-1 bg-canvas rounded h-4 overflow-hidden">
                  <div className="h-full bg-ok/60" style={{ width: `${(x.avgIn / maxAvgIn) * 100}%` }} />
                </div>
                <span className="w-44 text-right text-ink-dim">
                  {x.days ? <>in {x.avgIn.toFixed(1)} · out {x.avgOut.toFixed(1)} · {pct(x.conv)}</> : "no entries"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {rows.some((r) => r.notes) && (
          <div className="bg-white rounded-xl border border-line shadow-soft p-4">
            <p className="text-sm font-semibold mb-2">Notes</p>
            <ul className="space-y-1 text-xs">
              {rows.filter((r) => r.notes).map((r) => (
                <li key={r.id}><span className="text-ink-dim">{shortDate(r.summary_date)}:</span> {r.notes}</li>
              ))}
            </ul>
          </div>
        )}
      </>}
    </div>
  );
}
