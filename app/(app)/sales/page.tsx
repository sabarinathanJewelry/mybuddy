"use client";

import Link from "next/link";
import { useSales } from "@/modules/sales/api";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

export default function SalesPage() {
  const t = useT();
  const { data: sales, isLoading } = useSales();

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("sales")}</h1>
        <Link href="/sales/new" className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + {t("new_sale")}
        </Link>
      </div>

      {isLoading ? (
        <p className="text-ink-dim text-sm">{t("loading")}</p>
      ) : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("bill_no")}</th>
                <th className="text-left px-3 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5 hidden sm:table-cell">{t("customers")}</th>
                <th className="text-right px-3 py-2.5">{t("total")}</th>
                <th className="text-left px-3 py-2.5">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {sales?.map((s: any) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-mono text-info font-medium">{s.bill_no}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-ink-mid">{s.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(s.total)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "confirmed" ? "bg-ok-bg text-ok" : "bg-canvas text-ink-dim"}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!sales?.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
