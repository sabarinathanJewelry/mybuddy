"use client";

import { useState } from "react";
import { useBoardRate } from "@/stores/board-rate";
import { useBoardRateHistory, useSaveBoardRate } from "@/modules/board-rate/api";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

const FIELDS = [
  { key: "gold_22k" as const, labelKey: "gold_22k" as const },
  { key: "gold_24k" as const, labelKey: "gold_24k" as const },
  { key: "gold_18k" as const, labelKey: "gold_18k" as const },
  { key: "silver" as const, labelKey: "silver" as const },
  { key: "silver_pure" as const, labelKey: "silver_pure" as const },
];

export default function BoardRatePage() {
  const t = useT();
  const current = useBoardRate((s) => s.rate);
  const globalDate = useGlobalDate((s) => s.date);
  const { data: history, isLoading } = useBoardRateHistory();
  const save = useSaveBoardRate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    gold_22k: current?.gold_22k ?? 0,
    gold_24k: current?.gold_24k ?? 0,
    gold_18k: current?.gold_18k ?? 0,
    silver: current?.silver ?? 0,
    silver_pure: current?.silver_pure ?? 0,
    effective_date: globalDate,
  });

  function startEdit() {
    setForm({
      gold_22k: current?.gold_22k ?? 0,
      gold_24k: current?.gold_24k ?? 0,
      gold_18k: current?.gold_18k ?? 0,
      silver: current?.silver ?? 0,
      silver_pure: current?.silver_pure ?? 0,
      effective_date: globalDate,
    });
    setEditing(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync(form);
    setEditing(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("board_rate")}</h1>
        {!editing && (
          <button
            onClick={startEdit}
            className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2"
          >
            {t("edit")}
          </button>
        )}
      </div>

      {/* Current rates */}
      {!editing && current && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="bg-white rounded-xl border border-line p-4 shadow-soft">
              <p className="text-xs text-ink-dim mb-1">{t(f.labelKey)}</p>
              <p className="text-xl font-bold text-gold">{inr(current[f.key])}</p>
              <p className="text-xs text-ink-dim mt-1">{t("per_gram")}</p>
            </div>
          ))}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-ink-dim mb-1">{t(f.labelKey)}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-line rounded-lg2 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold text-sm"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("effective_date")}</label>
              <input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-5 py-2 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "…" : t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="border border-line text-ink-mid text-sm px-5 py-2 rounded-lg2 hover:bg-canvas">
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-ink-dim mb-3">{t("rate_history")}</h2>
        {isLoading ? (
          <p className="text-ink-dim text-sm">{t("loading")}</p>
        ) : (
          <div className="bg-white rounded-xl border border-line overflow-hidden shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-xs text-ink-dim">
                  <th className="text-left px-4 py-2.5">{t("effective_date")}</th>
                  <th className="text-right px-3 py-2.5">{t("gold_22k")}</th>
                  <th className="text-right px-3 py-2.5">{t("gold_24k")}</th>
                  <th className="text-right px-3 py-2.5">{t("silver")}</th>
                </tr>
              </thead>
              <tbody>
                {history?.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink-mid">{shortDate(row.effective_date)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(row.gold_22k)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(row.gold_24k)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{inr(row.silver)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
