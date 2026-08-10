"use client";

import { useState } from "react";
import Link from "next/link";
import { useSales, useSalesSummary, useDeleteSale, useReturnSale } from "@/modules/sales/api";
import { useT } from "@/i18n";
import { useGlobalDate } from "@/stores/global-date";
import { inr, shortDate, grams } from "@/lib/format";

export default function SalesPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const [filterFrom, setFilterFrom] = useState<string>(globalDate);
  const [filterTo,   setFilterTo]   = useState<string>(globalDate);

  const { data: sales, isLoading } = useSales(filterFrom || null, filterTo || null);
  const { data: summaryItems = [] } = useSalesSummary(filterFrom || null, filterTo || null);
  const deleteSale = useDeleteSale();
  const returnSale = useReturnSale();
  const [returningId, setReturningId] = useState<string | null>(null);

  const totalAmt = sales?.reduce((s: number, x: any) => s + (x.total ?? 0), 0) ?? 0;

  const GOLD_METALS = new Set(["gold_22k", "gold_18k", "gold_24k"]);
  const SILVER_METALS = new Set(["silver", "silver_pure", "silver_mpr"]);

  // Totals from summary query (all confirmed items in period, not capped at 100 bills)
  let totalGoldGross = 0, totalGoldNet = 0;
  let totalSilverGross = 0, totalSilverNet = 0;
  let goldWtdVa = 0, goldWtdVaWt = 0;
  for (const item of summaryItems) {
    const gross = Number(item.gross_wt || 0);
    const net   = Number(item.net_wt   || 0);
    if (GOLD_METALS.has(item.metal)) {
      totalGoldGross += gross;
      totalGoldNet   += net;
      const rate     = Number(item.rate       || 0);
      const lineTotal = Number(item.line_total || 0);
      const gstPct   = Number(item.gst_pct    || 0);
      const making   = Number(item.making_amt || 0);
      const stone    = Number(item.stone_amt  || 0) + Number(item.diamond_amt || 0);
      const purity   = Number(item.purity_pct || 0);
      if (gross > 0 && rate > 0 && lineTotal > 0) {
        const excGst   = gstPct > 0 ? lineTotal * 100 / (100 + gstPct) : lineTotal;
        const metalRev = excGst - making - stone;
        if (metalRev > 0) {
          const va = (metalRev / (gross * rate) - 1) * 100;
          goldWtdVa   += (purity + va) * gross;
          goldWtdVaWt += gross;
        }
      }
    } else if (SILVER_METALS.has(item.metal)) {
      totalSilverGross += gross;
      totalSilverNet   += net;
    }
  }
  const goldAvgTouch = goldWtdVaWt > 0 ? goldWtdVa / goldWtdVaWt : 0;
  const goldAvgVa    = goldAvgTouch > 0 ? goldAvgTouch - 91.67 : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("sales")}</h1>
        <Link href="/sales/new" className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + {t("new_sale")}
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
        <span className="text-xs text-ink-dim">to</span>
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
        <button
          onClick={() => { setFilterFrom(globalDate); setFilterTo(globalDate); }}
          className="text-xs text-gold border border-gold/40 px-3 py-1.5 rounded-lg2 hover:bg-gold/5"
        >
          Today
        </button>
        {(() => {
          const now = new Date();
          const y = now.getFullYear(), m = now.getMonth();
          const thisFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
          const thisTo   = `${y}-${String(m + 1).padStart(2, "0")}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, "0")}`;
          const prevM = m === 0 ? 11 : m - 1;
          const prevY = m === 0 ? y - 1 : y;
          const prevFrom = `${prevY}-${String(prevM + 1).padStart(2, "0")}-01`;
          const prevTo   = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(new Date(prevY, prevM + 1, 0).getDate()).padStart(2, "0")}`;
          const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          return (
            <>
              <button
                onClick={() => { setFilterFrom(thisFrom); setFilterTo(thisTo); }}
                className="text-xs text-ink-dim border border-line px-3 py-1.5 rounded-lg2 hover:bg-canvas"
              >
                {months[m]}
              </button>
              <button
                onClick={() => { setFilterFrom(prevFrom); setFilterTo(prevTo); }}
                className="text-xs text-ink-dim border border-line px-3 py-1.5 rounded-lg2 hover:bg-canvas"
              >
                {months[prevM]}
              </button>
            </>
          );
        })()}
        {(filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterFrom(""); setFilterTo(""); }}
            className="text-xs text-ink-dim border border-line px-3 py-1.5 rounded-lg2 hover:bg-canvas"
          >
            All
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {sales && sales.length > 0 && (
            <span className="text-xs text-ink-dim">
              {sales.length}{sales.length === 100 ? "+" : ""} bill{sales.length !== 1 ? "s" : ""} · {inr(totalAmt)}
            </span>
          )}
          {totalGoldGross > 0 && (
            <span className="bg-gold/10 text-gold text-xs font-medium px-2 py-0.5 rounded-full">
              Gold {grams(totalGoldGross)}
              {goldAvgTouch > 0 && ` · ${goldAvgTouch.toFixed(2)}% touch (VA ${goldAvgVa >= 0 ? "+" : ""}${goldAvgVa.toFixed(2)}%)`}
            </span>
          )}
          {totalSilverGross > 0 && (
            <span className="bg-info/10 text-info text-xs font-medium px-2 py-0.5 rounded-full">
              Silver {grams(totalSilverGross)}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-ink-dim text-sm">{t("loading")}</p>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "580px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("bill_no")}</th>
                <th className="text-left px-3 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5 hidden sm:table-cell">{t("customers")}</th>
                <th className="text-left px-3 py-2.5">Items</th>
                <th className="text-right px-3 py-2.5">Wt</th>
                <th className="text-right px-3 py-2.5">{t("total")}</th>
                <th className="text-right px-3 py-2.5">Balance</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sales?.map((s: any) => {
                const items: any[] = s.sale_items ?? [];
                const totalGrossWt = items.reduce((sum: number, i: any) => sum + (i.gross_wt || 0), 0);
                const descriptions = items
                  .map((i: any) => i.description?.trim())
                  .filter(Boolean)
                  .filter((d: string, idx: number, arr: string[]) => arr.indexOf(d) === idx);
                const suspenseSuppliers = [...new Set(
                  items
                    .filter((i: any) => i.is_suspense && i.suppliers?.name)
                    .map((i: any) => i.suppliers.name as string)
                )];
                const hasVaultItems = items.some((i: any) => i.from_vault);
                const isReturned = s.status === "returned";
                return (
                <tr key={s.id} className={`border-b border-line last:border-0 hover:bg-canvas/50 ${isReturned ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-mono font-medium ${isReturned ? "text-ink-dim line-through" : "text-info"}`}>{s.bill_no}</span>
                      {isReturned && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-err/10 text-err font-medium">Returned</span>
                      )}
                      {s.sale_type === "exchange" && !isReturned && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warn/15 text-warn font-medium">Exch</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-ink-mid">{s.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-ink-dim text-xs max-w-[200px]">
                    <div>
                      {descriptions.length > 0
                        ? descriptions.slice(0, 3).join(", ") + (descriptions.length > 3 ? ` +${descriptions.length - 3}` : "")
                        : "—"}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {hasVaultItems && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info font-semibold">Vault</span>
                      )}
                      {suspenseSuppliers.map((sup) => (
                        <span key={sup} className="text-[10px] px-1.5 py-0.5 rounded bg-warn/15 text-warn font-semibold">
                          {sup}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-ink-dim tabular-nums">
                    {totalGrossWt > 0 ? grams(totalGrossWt) : "—"}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono ${isReturned ? "line-through text-ink-dim" : ""}`}>{inr(s.total)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {!isReturned && (() => {
                      const paid = ((s.sale_payments ?? []) as any[]).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                      const bal  = Math.round((s.total - paid) * 100) / 100;
                      if (bal > 0.01)  return <span className="text-err font-semibold">Due {inr(bal)}</span>;
                      if (bal < -0.01) return <span className="text-info font-semibold">Adv {inr(Math.abs(bal))}</span>;
                      return <span className="text-ok">✓</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {isReturned ? (
                      <button
                        disabled={returnSale.isPending}
                        onClick={() => {
                          if (window.confirm(`Undo return of ${s.bill_no}? The bill will be active again.`)) {
                            returnSale.mutate({ id: s.id, undo: true });
                          }
                        }}
                        className="text-xs text-ink-dim hover:underline disabled:opacity-40">
                        Undo Return
                      </button>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/sales/${s.id}/edit`} className="text-xs text-gold hover:underline">Edit</Link>
                        {returningId === s.id ? (
                          <span className="text-xs flex items-center gap-1.5">
                            Return bill?
                            <button
                              disabled={returnSale.isPending}
                              onClick={async () => { await returnSale.mutateAsync({ id: s.id, undo: false }); setReturningId(null); }}
                              className="text-err font-medium hover:underline disabled:opacity-40">Yes</button>
                            <button onClick={() => setReturningId(null)} className="text-ink-dim hover:underline">No</button>
                          </span>
                        ) : (
                          <>
                            <button onClick={() => setReturningId(s.id)} className="text-xs text-warn hover:underline">Return</button>
                            <button
                              disabled={deleteSale.isPending}
                              onClick={() => {
                                if (window.confirm(`Delete ${s.bill_no}? This will reverse all ledger entries.`)) {
                                  deleteSale.mutate(s.id);
                                }
                              }}
                              className="text-xs text-err hover:underline disabled:opacity-40">
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
              {!sales?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-dim">
                    {filterFrom ? `No sales ${filterFrom === filterTo ? `on ${shortDate(filterFrom)}` : `from ${shortDate(filterFrom)} to ${shortDate(filterTo)}`}` : t("no_data")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
