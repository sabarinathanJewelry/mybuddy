"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { grams, shortDate } from "@/lib/format";
import CustomerPicker from "@/modules/customers/customer-picker";
import type { Customer } from "@/modules/customers/types";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const PURITY_PRESETS = [
  { label: "22K (91.6%)", value: 91.6 },
  { label: "18K (75.0%)", value: 75.0 },
  { label: "24K/999 (99.9%)", value: 99.9 },
];

export default function GoldChitPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [printRow, setPrintRow] = useState<Record<string, unknown> | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [metalType, setMetalType] = useState<"gold" | "silver">("gold");
  const [depositDate, setDepositDate] = useState(globalDate);
  const [grossWt, setGrossWt] = useState(0);
  const [purityPct, setPurityPct] = useState(91.6);
  const [notes, setNotes] = useState("");

  const pureWt = parseFloat(((grossWt * purityPct) / 100).toFixed(4));

  const { data: deposits, isLoading } = useQuery({
    queryKey: ["gold_savings_deposits"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("gold_savings_deposits")
        .select("*, customers(name)")
        .order("deposit_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  function resetForm() {
    setCustomer(null); setMetalType("gold"); setGrossWt(0); setPurityPct(91.6);
    setDepositDate(globalDate); setNotes(""); setShowForm(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!customer || grossWt <= 0) throw new Error("Invalid input");
      const client = supabase();

      const { error } = await client.from("gold_savings_deposits").insert({
        customer_id: customer.id,
        deposit_date: depositDate,
        metal_type: metalType,
        gross_wt: grossWt,
        purity_pct: purityPct,
        pure_wt: grossWt,
        notes: notes || null,
      });
      if (error) throw error;

      // Credit gross grams to customer balance (no purity conversion)
      const balanceField = metalType === "gold" ? "gold_balance_g" : "silver_balance_g";
      const { data: cust } = await client.from("customers")
        .select("gold_balance_g, silver_balance_g").eq("id", customer.id).single();
      const current = (cust as Record<string, number>)?.[balanceField] ?? 0;
      await client.from("customers")
        .update({ [balanceField]: parseFloat((current + grossWt).toFixed(4)) })
        .eq("id", customer.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gold_savings_deposits"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      resetForm();
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (deposits as any[]) ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Smart Gold Chit</h1>
          <p className="text-sm text-ink-dim mt-0.5">Customer brings physical gold — credited to their metal account (no cash)</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
          + Add Deposit
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-line rounded-xl p-5 shadow-soft space-y-4">
          <h3 className="font-semibold text-sm text-ink">Record Gold Deposit</h3>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Customer *</label>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>

          {customer && (
            <div className="bg-canvas rounded-lg2 px-4 py-2.5 flex gap-6 text-sm">
              <div>
                <span className="text-ink-dim text-xs">Gold balance: </span>
                <strong className="text-gold">{grams(customer.gold_balance_g)}</strong>
              </div>
              <div>
                <span className="text-ink-dim text-xs">Silver balance: </span>
                <strong className="text-ink-mid">{grams(customer.silver_balance_g)}</strong>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Metal toggle */}
            <div>
              <label className="block text-xs text-ink-dim mb-1">Metal</label>
              <div className="flex gap-2">
                {(["gold", "silver"] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => { setMetalType(m); setPurityPct(m === "gold" ? 91.6 : 99.9); }}
                    className={`flex-1 py-2 rounded-lg2 text-sm font-medium border transition-colors ${
                      metalType === m
                        ? m === "gold" ? "bg-gold/10 border-gold text-gold" : "bg-ink-mid/10 border-ink-mid text-ink-mid"
                        : "border-line text-ink-dim hover:border-gold"
                    }`}>
                    {m === "gold" ? "Gold" : "Silver"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)} className={inp} />
            </div>

            <div>
              <label className="block text-xs text-ink-dim mb-1">Gross Weight (g) *</label>
              <input type="number" step="0.001" value={grossWt || ""}
                placeholder="0" onFocus={(e) => e.target.select()}
                onChange={(e) => setGrossWt(parseFloat(e.target.value) || 0)}
                className={inp} />
            </div>

            <div>
              <label className="block text-xs text-ink-dim mb-1">Purity %</label>
              <input type="number" step="0.01" value={purityPct}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setPurityPct(parseFloat(e.target.value) || 0)}
                className={inp} />
              <div className="flex gap-1 mt-1 flex-wrap">
                {PURITY_PRESETS.map((p) => (
                  <button key={p.value} type="button"
                    onClick={() => setPurityPct(p.value)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      purityPct === p.value ? "border-gold bg-gold/10 text-gold" : "border-line text-ink-dim hover:border-gold"
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="bg-gold/5 border border-gold/20 rounded-lg2 px-4 py-3 flex items-center justify-between text-sm">
            <div>
              <span className="text-ink-dim">Weight credited to customer (as-is)</span>
              <p className="text-xs text-ink-dim mt-0.5">Gross weight — no purity conversion</p>
            </div>
            <span className="text-2xl font-bold text-gold">{grossWt.toFixed(3)} g</span>
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className={inp} placeholder="Item type, hallmark, etc." />
          </div>

          <div className="flex gap-2">
            <button
              disabled={save.isPending || !customer || grossWt <= 0}
              onClick={() => save.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save Deposit"}
            </button>
            <button type="button" onClick={resetForm}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {save.isError && (
            <p className="text-xs text-err">Save failed — run migration 004 in Supabase SQL Editor first.</p>
          )}
        </div>
      )}

      {/* History */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Customer</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Gross Wt</th>
                <th className="text-right px-3 py-2.5">Purity %</th>
                <th className="text-right px-3 py-2.5">Pure Wt Credited</th>
                <th className="text-left px-3 py-2.5">Notes</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d: any) => (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 text-ink-dim">{shortDate(d.deposit_date)}</td>
                  <td className="px-3 py-2.5 font-medium">{d.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 capitalize">
                    <span className={d.metal_type === "gold" ? "text-gold" : "text-ink-mid"}>{d.metal_type}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">{Number(d.gross_wt).toFixed(3)}g</td>
                  <td className="px-3 py-2.5 text-right text-ink-dim">{d.purity_pct}%</td>
                  <td className="px-3 py-2.5 text-right font-mono text-gold font-semibold">{Number(d.pure_wt).toFixed(4)}g</td>
                  <td className="px-3 py-2.5 text-ink-dim text-xs">{d.notes ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setPrintRow(d)} className="text-xs text-info hover:underline whitespace-nowrap">அச்சிடு</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tamil Print Receipt ── */}
      {printRow && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #chit-print-area, #chit-print-area * { visibility: visible; }
              #chit-print-area { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; box-sizing: border-box; }
            }
          `}</style>

          {/* Screen overlay */}
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
              {/* Action buttons */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                <span className="text-sm font-semibold text-ink">வரவு சீட்டு / Deposit Receipt</span>
                <div className="flex gap-2">
                  <button onClick={() => window.print()}
                    className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 font-medium">அச்சிடு / Print</button>
                  <button onClick={() => setPrintRow(null)}
                    className="border border-line text-xs px-3 py-1.5 rounded-lg2 text-ink-dim">மூடு</button>
                </div>
              </div>

              {/* Receipt */}
              <div id="chit-print-area" className="p-5 font-['Arial',sans-serif] text-[13px] leading-relaxed">
                {/* Shop header */}
                <div className="text-center border-b-2 border-gray-800 pb-3 mb-3">
                  <p className="text-base font-bold text-gray-900">சபரிநாதன் நகைக்கடை</p>
                  <p className="text-xs text-gray-600">Sabarinathan Jewellery</p>
                  <p className="text-sm font-semibold mt-1 text-gray-800">
                    {printRow.metal_type === "gold" ? "தங்க வரவு சீட்டு" : "வெள்ளி வரவு சீட்டு"}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {printRow.metal_type === "gold" ? "Gold Deposit Receipt" : "Silver Deposit Receipt"}
                  </p>
                </div>

                {/* Meta row */}
                <div className="flex justify-between text-[11px] text-gray-600 mb-3">
                  <span>சீட்டு எண்: <strong className="text-gray-900">{String(printRow.id).slice(0, 8).toUpperCase()}</strong></span>
                  <span>தேதி: <strong className="text-gray-900">{shortDate(String(printRow.deposit_date))}</strong></span>
                </div>

                {/* Customer */}
                <div className="border border-gray-300 rounded px-3 py-2 mb-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">வாடிக்கையாளர் / Customer</p>
                  <p className="font-bold text-gray-900 text-sm">{(printRow as Record<string,unknown> & {customers?: {name?: string}}).customers?.name ?? "—"}</p>
                </div>

                {/* Details table */}
                <table className="w-full text-[12px] border-collapse mb-3">
                  <tbody>
                    {[
                      ["உலோகம்", "Metal", printRow.metal_type === "gold" ? "தங்கம் (Gold)" : "வெள்ளி (Silver)"],
                      ["மொத்த எடை", "Gross Weight", `${Number(printRow.gross_wt).toFixed(3)} கிராம்`],
                      ["தூய்மை", "Purity", `${printRow.purity_pct}%`],
                      ["வரவு எடை", "Credited Weight", `${Number(printRow.pure_wt).toFixed(3)} கிராம்`],
                      ...(printRow.notes ? [["குறிப்பு", "Notes", String(printRow.notes)]] : []),
                    ].map(([ta, en, val]) => (
                      <tr key={ta} className="border-b border-gray-200 last:border-0">
                        <td className="py-1.5 pr-2 text-gray-600 w-[38%]">
                          <span className="block">{ta}</span>
                          <span className="text-[10px] text-gray-400">{en}</span>
                        </td>
                        <td className="py-1.5 font-semibold text-gray-900">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Credit note */}
                <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 text-center mb-4">
                  <p className="text-[11px] text-gray-700 font-medium">உங்கள் உலோக கணக்கில் வரவு வைக்கப்பட்டது</p>
                  <p className="text-[10px] text-gray-500">Credited to your metal account</p>
                </div>

                {/* Signature row */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="text-center">
                    <div className="border-b border-gray-400 h-8 mb-1"></div>
                    <p className="text-[10px] text-gray-600">வாடிக்கையாளர் கையொப்பம்</p>
                    <p className="text-[9px] text-gray-400">Customer Signature</p>
                  </div>
                  <div className="text-center">
                    <div className="border-b border-gray-400 h-8 mb-1"></div>
                    <p className="text-[10px] text-gray-600">கடை கையொப்பம்</p>
                    <p className="text-[9px] text-gray-400">Shop Signature</p>
                  </div>
                </div>

                <p className="text-center text-[10px] text-gray-400 mt-4 border-t border-gray-200 pt-2">நன்றி — Thank You</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
