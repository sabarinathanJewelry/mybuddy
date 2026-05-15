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
  notes: string;
}

const blank = (date: string): Summary => ({
  summary_date: date,
  gold_walkin: 0, silver_walkin: 0, other_walkin: 0,
  gold_walkout: 0, silver_walkout: 0, other_walkout: 0,
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
        <button
          onClick={() => { setFormDate(globalDate); setShowForm(true); }}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2"
        >
          {today ? "Edit Today" : "+ Add Today"}
        </button>
      </div>

      {/* Today quick stats */}
      {today && (
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
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
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
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => { setFormDate(r.summary_date); setShowForm(true); }}
                      className="text-xs text-gold hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
