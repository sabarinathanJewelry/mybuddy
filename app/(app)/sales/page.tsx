"use client";

import { useState } from "react";
import Link from "next/link";
import { useSales, useDeleteSale } from "@/modules/sales/api";
import { useT } from "@/i18n";
import { useGlobalDate } from "@/stores/global-date";
import { inr, shortDate, grams } from "@/lib/format";

export default function SalesPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const [filterDate, setFilterDate] = useState<string>(globalDate);

  const { data: sales, isLoading } = useSales(filterDate || null);
  const deleteSale = useDeleteSale();

  const totalAmt = sales?.reduce((s: number, x: any) => s + (x.total ?? 0), 0) ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("sales")}</h1>
        <Link href="/sales/new" className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + {t("new_sale")}
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
        />
        {filterDate && (
          <button
            onClick={() => setFilterDate("")}
            className="text-xs text-ink-dim border border-line px-3 py-1.5 rounded-lg2 hover:bg-canvas"
          >
            All dates
          </button>
        )}
        {!filterDate && (
          <button
            onClick={() => setFilterDate(globalDate)}
            className="text-xs text-gold border border-gold/40 px-3 py-1.5 rounded-lg2 hover:bg-gold/5"
          >
            Today
          </button>
        )}
        {sales && sales.length > 0 && (
          <span className="text-xs text-ink-dim ml-auto">
            {sales.length} bill{sales.length !== 1 ? "s" : ""} · {inr(totalAmt)}
          </span>
        )}
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
                return (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-info font-medium">{s.bill_no}</span>
                      {s.sale_type === "exchange" && (
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
                    {suspenseSuppliers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {suspenseSuppliers.map((sup) => (
                          <span key={sup} className="text-[10px] px-1.5 py-0.5 rounded bg-warn/15 text-warn font-semibold">
                            {sup}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-ink-dim tabular-nums">
                    {totalGrossWt > 0 ? grams(totalGrossWt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(s.total)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/sales/${s.id}/edit`} className="text-xs text-gold hover:underline">Edit</Link>
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
                    </div>
                  </td>
                </tr>
                );
              })}
              {!sales?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-dim">
                    {filterDate ? `No sales on ${shortDate(filterDate)}` : t("no_data")}
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
