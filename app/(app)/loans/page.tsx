"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";

function useLoans() {
  return useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data, error } = await supabase().from("loans").select("*").order("loan_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const KINDS = ["term", "cc", "car", "local"];

export default function LoansPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: loans, isLoading } = useLoans();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ loan_date: globalDate, kind: "term", lender: "", principal: 0, interest_rate: 0, tenure_months: 12, affects_cash: true, outstanding: 0, notes: "" });

  const save = useMutation({
    mutationFn: async (data: typeof form) => {
      const { data: row, error } = await supabase().from("loans").insert({ ...data, outstanding: data.principal }).select().single();
      if (error) throw error;
      if (data.affects_cash) {
        const { error: ledgerErr } = await supabase().from("cash_ledger").insert({ tx_date: data.loan_date, direction: "in", amount: data.principal, description: `Loan from ${data.lender}`, ref_type: "loan" });
        if (ledgerErr) console.warn(ledgerErr);
      }
      return row;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["loans"] }); setShowForm(false); },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("loans")}</h1>
        <button onClick={() => setShowForm(true)} className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">+ {t("add_loan")}</button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Date", key: "loan_date", type: "date" },
              { label: t("lender"), key: "lender", type: "text" },
              { label: t("principal"), key: "principal", type: "number", step: "0.01" },
              { label: t("interest_rate"), key: "interest_rate", type: "number", step: "0.01" },
              { label: t("tenure"), key: "tenure_months", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-ink-dim mb-1">{f.label}</label>
                <input type={f.type} step={f.step} value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-ink-dim mb-1">Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.affects_cash} onChange={(e) => setForm({ ...form, affects_cash: e.target.checked })} className="accent-gold" />
                Affects cash balance
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Lender</th>
              <th className="text-left px-3 py-2.5">Kind</th>
              <th className="text-right px-3 py-2.5">Principal</th>
              <th className="text-right px-3 py-2.5">Outstanding</th>
              <th className="text-right px-3 py-2.5">Rate%</th>
            </tr></thead>
            <tbody>
              {(loans as any[])?.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium">{l.lender}</td>
                  <td className="px-3 py-2.5 capitalize text-ink-dim">{l.kind}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(l.principal)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-err">{inr(l.outstanding)}</td>
                  <td className="px-3 py-2.5 text-right">{l.interest_rate}%</td>
                </tr>
              ))}
              {!loans?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
