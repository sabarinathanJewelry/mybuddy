"use client";

import { useState, useMemo } from "react";
import { useBoardRate } from "@/stores/board-rate";
import { useBoardRateHistory, useSaveBoardRate, type BoardRateRow } from "@/modules/board-rate/api";
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

interface MarketRate { date: string; gold_22k: number; gold_24k: number }

export default function BoardRatePage() {
  const t = useT();
  const current = useBoardRate((s) => s.rate);
  const globalDate = useGlobalDate((s) => s.date);
  const { data: history, isLoading } = useBoardRateHistory(60);
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

  // Market rates state
  const [marketRates, setMarketRates] = useState<MarketRate[] | null>(null);
  const [silverPerGram, setSilverPerGram] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const historyByDate = useMemo(() => {
    const m = new Map<string, BoardRateRow>();
    for (const row of history ?? []) {
      if (!m.has(row.effective_date)) m.set(row.effective_date, row);
    }
    return m;
  }, [history]);

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

  async function fetchMarketRates() {
    setMarketLoading(true);
    setMarketError(null);
    try {
      const res = await fetch("/api/market-rates");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMarketRates(data.rates ?? []);
      setSilverPerGram(data.silverPerGram ?? 0);
      setFetchedAt(data.fetchedAt ?? null);
    } catch (e) {
      setMarketError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setMarketLoading(false);
    }
  }

  function loadMarketRate(mr: MarketRate) {
    setForm({
      gold_22k: mr.gold_22k,
      gold_24k: mr.gold_24k,
      gold_18k: Math.round(mr.gold_24k * 0.75),
      silver: silverPerGram,
      silver_pure: silverPerGram,
      effective_date: mr.date,
    });
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

      {/* Market Rates — Madurai */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-dim">Market Rates — Madurai</h2>
            {fetchedAt && (
              <p className="text-[11px] text-ink-dim mt-0.5">
                Fetched {new Date(fetchedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · goodreturns.in
              </p>
            )}
          </div>
          <button
            onClick={fetchMarketRates}
            disabled={marketLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg2"
          >
            {marketLoading ? "Fetching…" : marketRates ? "Refresh" : "Fetch Rates"}
          </button>
        </div>

        {marketError && (
          <div className="bg-red-50 border border-red-200 rounded-lg2 px-4 py-3 text-sm text-red-700">
            {marketError}
          </div>
        )}

        {marketRates && (
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: "560px" }}>
              <thead>
                <tr className="border-b border-line bg-canvas text-xs text-ink-dim">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-3 py-2.5">Market 22K</th>
                  <th className="text-right px-3 py-2.5">Market 24K</th>
                  <th className="text-right px-3 py-2.5">Your 22K</th>
                  <th className="text-right px-3 py-2.5">Your 24K</th>
                  <th className="text-right px-3 py-2.5">Diff 22K</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {marketRates.map((mr) => {
                  const yours = historyByDate.get(mr.date);
                  const diff22 = yours ? mr.gold_22k - yours.gold_22k : null;
                  return (
                    <tr key={mr.date} className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2.5 text-ink-mid font-medium">{shortDate(mr.date)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink">{inr(mr.gold_22k)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink">{inr(mr.gold_24k)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink-dim">
                        {yours ? inr(yours.gold_22k) : <span className="text-red-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-ink-dim">
                        {yours ? inr(yours.gold_24k) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {diff22 === null ? (
                          <span className="text-red-400 font-medium">Missing</span>
                        ) : diff22 === 0 ? (
                          <span className="text-green-600">Match</span>
                        ) : (
                          <span className={diff22 > 0 ? "text-blue-600" : "text-orange-500"}>
                            {diff22 > 0 ? "+" : ""}{diff22.toLocaleString("en-IN")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => loadMarketRate(mr)}
                          className="text-xs font-semibold text-gold hover:underline"
                        >
                          {yours ? "Update" : "Use"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-line bg-canvas/50 text-[11px] text-ink-dim">
              Silver today: {silverPerGram > 0 ? `${inr(silverPerGram)}/g` : "—"} &nbsp;·&nbsp;
              Gold 18K auto-set to 75% of 24K — verify before saving &nbsp;·&nbsp; Source: goodreturns.in/madurai
            </div>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-ink-dim mb-3">{t("rate_history")}</h2>
        {isLoading ? (
          <p className="text-ink-dim text-sm">{t("loading")}</p>
        ) : (
          <div className="bg-white rounded-xl border border-line overflow-x-auto shadow-soft">
            <table className="w-full text-sm" style={{ minWidth: "360px" }}>
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
