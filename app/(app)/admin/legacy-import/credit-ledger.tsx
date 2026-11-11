"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr, shortDate } from "@/lib/format";
import { parseCreditFile, type ParsedCredit } from "@/modules/legacy/credit";

type Row = {
  id: string; fy: string; tab_name: string; entry_date: string | null; type: string | null; name: string | null; phone: string | null;
  amount: number | null; paid_date: string | null; paid: number | null; writeoff: number | null; balance: number | null;
};

const TYPE_LABEL: Record<string, string> = { LN: "Loan", OR: "Order", EXP: "Interest exp." };
const inp = "border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export function CreditLedger() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ParsedCredit | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fy, setFy] = useState("");
  const [type, setType] = useState("");
  const [openOnly, setOpenOnly] = useState(true);

  const summary = useQuery({
    queryKey: ["legacy-credit-summary"],
    queryFn: async () => {
      const out: { fy: string; type: string | null; amount: number | null; balance: number | null }[] = [];
      for (let s = 0; ; s += 1000) {
        const { data, error } = await supabase().from("legacy_credit_entries").select("fy, type, amount, balance").range(s, s + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const by = new Map<string, { n: number; amount: number; open: number; openN: number }>();
      for (const r of out) {
        if (r.type === "EXP") continue;
        const k = `${r.fy}|${r.type ?? "?"}`;
        const v = by.get(k) ?? { n: 0, amount: 0, open: 0, openN: 0 };
        v.n++; v.amount += Number(r.amount || 0);
        if (Number(r.balance || 0) > 1) { v.open += Number(r.balance); v.openN++; }
        by.set(k, v);
      }
      return [...by.entries()].sort().map(([k, v]) => ({ fy: k.split("|")[0], type: k.split("|")[1], ...v }));
    },
  });

  const rows = useQuery({
    queryKey: ["legacy-credit", q, fy, type, openOnly],
    queryFn: async () => {
      let r = supabase().from("legacy_credit_entries")
        .select("id, fy, tab_name, entry_date, type, name, phone, amount, paid_date, paid, writeoff, balance")
        .order("entry_date", { ascending: false }).limit(500);
      if (q.trim()) r = r.ilike("name", `%${q.trim()}%`);
      if (fy) r = r.eq("fy", fy);
      if (type) r = r.eq("type", type);
      if (openOnly) r = r.gt("balance", 1);
      const { data, error } = await r;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const save = useMutation({
    mutationFn: async (p: ParsedCredit) => {
      const db = supabase();
      const { error: d } = await db.from("legacy_credit_entries").delete().eq("fy", p.fy);
      if (d) throw d;
      for (let i = 0; i < p.entries.length; i += 500) {
        const { error } = await db.from("legacy_credit_entries").insert(p.entries.slice(i, i + 500));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setPending(null);
      qc.invalidateQueries({ queryKey: ["legacy-credit"] });
      qc.invalidateQueries({ queryKey: ["legacy-credit-summary"] });
    },
  });

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr("");
    try { setPending(parseCreditFile(await f.arrayBuffer(), f.name)); } catch (e: any) { setErr(`${f.name}: ${e.message}`); }
  }

  const list = rows.data ?? [];
  const fys = [...new Set((summary.data ?? []).map((s) => s.fy))];

  return (
    <div className="bg-white border border-line rounded-lg2 shadow-soft">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3 flex-wrap">
        <div className="mr-auto">
          <p className="font-semibold text-ink">Old Credit Ledger (Loan / Order balance)</p>
          <p className="text-xs text-ink-dim">From the "Balance Sheet" Google Sheets. Reference only — does not change customer balances.</p>
        </div>
        <label className="text-xs px-3 py-1.5 border border-line rounded-lg2 cursor-pointer hover:border-gold">
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          Upload Balance Sheet file
        </label>
      </div>
      {err && <p className="px-4 py-2 text-sm text-err">{err}</p>}

      {pending && (
        <div className="px-4 py-3 border-b border-line bg-canvas text-xs space-y-1">
          <p className="text-sm font-medium text-ink">
            FY {pending.fy}: {pending.entries.filter((e) => e.type !== "EXP").length} entries, {pending.entries.filter((e) => e.type === "EXP").length} interest expense rows
            {fys.includes(pending.fy) ? " · will replace the saved copy of this year" : ""}
          </p>
          {pending.issues.map((i, k) => <p key={k} className="text-ink-dim">{i}</p>)}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setPending(null)} className="px-3 py-1.5 border border-line rounded-lg2 text-ink-dim">Discard</button>
            <button onClick={() => save.mutate(pending)} disabled={save.isPending} className="px-3 py-1.5 rounded-lg2 bg-gold text-white disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save to DB"}
            </button>
          </div>
          {save.error && <p className="text-err">Save failed: {(save.error as Error).message}</p>}
        </div>
      )}

      {(summary.data ?? []).length > 0 && (
        <div className="px-4 py-3 border-b border-line overflow-x-auto">
          <table className="text-xs w-full">
            <thead><tr className="text-ink-dim text-left"><th className="py-1">FY</th><th>Type</th><th className="text-right">Entries</th><th className="text-right">Amount</th><th className="text-right">Unpaid entries</th><th className="text-right">Unpaid as per sheet</th></tr></thead>
            <tbody>
              {(summary.data ?? []).map((s) => (
                <tr key={s.fy + s.type} className="border-t border-line">
                  <td className="py-1">{s.fy}</td><td>{TYPE_LABEL[s.type] ?? s.type}</td>
                  <td className="text-right font-mono">{s.n}</td><td className="text-right font-mono">{inr(s.amount)}</td>
                  <td className="text-right font-mono">{s.openN}</td><td className="text-right font-mono text-err">{inr(s.open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-ink-dim mt-1">Many old entries were not updated in the sheet after payment, so "unpaid as per sheet" is higher than what is really due.</p>
        </div>
      )}

      <div className="px-4 py-3 flex gap-2 flex-wrap items-center border-b border-line">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" className={`${inp} flex-1 min-w-[160px]`} />
        <select value={fy} onChange={(e) => setFy(e.target.value)} className={inp}>
          <option value="">All years</option>
          {fys.map((f) => <option key={f}>{f}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={inp}>
          <option value="">All types</option><option value="LN">Loan</option><option value="OR">Order</option><option value="EXP">Interest exp.</option>
        </select>
        <label className="text-xs text-ink-dim flex items-center gap-1"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Unpaid only</label>
      </div>

      <div className="overflow-x-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-canvas">
            <tr className="text-xs text-ink-dim text-left">
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Write-off</th>
              <th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Paid date</th><th className="px-3 py-2">Sheet</th>
            </tr>
          </thead>
          <tbody>
            {rows.isLoading && <tr><td colSpan={9} className="px-3 py-4 text-center text-ink-dim">Loading…</td></tr>}
            {!rows.isLoading && list.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-ink-dim">No entries</td></tr>}
            {list.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-1.5 whitespace-nowrap">{r.entry_date ? shortDate(r.entry_date) : "—"}</td>
                <td className="px-3 py-1.5">{r.name ?? <span className="text-ink-dim">(no name)</span>}{r.phone && <span className="text-xs text-ink-dim ml-1">{r.phone}</span>}</td>
                <td className="px-3 py-1.5 text-xs">{TYPE_LABEL[r.type ?? ""] ?? r.type}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.amount != null ? inr(r.amount) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.paid ? inr(r.paid) : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.writeoff ? inr(r.writeoff) : ""}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${Number(r.balance) > 1 ? "text-err" : "text-ok"}`}>{r.balance != null ? inr(r.balance) : ""}</td>
                <td className="px-3 py-1.5 text-xs">{r.paid_date ? (/^\d{4}-\d{2}-\d{2}$/.test(r.paid_date) ? shortDate(r.paid_date) : r.paid_date) : ""}</td>
                <td className="px-3 py-1.5 text-xs text-ink-dim whitespace-nowrap">{r.fy} · {r.tab_name}</td>
              </tr>
            ))}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-semibold text-sm">
                <td className="px-3 py-2" colSpan={3}>{list.length}{list.length === 500 ? "+ (first 500 shown)" : ""} entries</td>
                <td className="px-3 py-2 text-right font-mono">{inr(list.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>
                <td className="px-3 py-2 text-right font-mono">{inr(list.reduce((s, r) => s + Number(r.paid || 0), 0))}</td>
                <td className="px-3 py-2 text-right font-mono">{inr(list.reduce((s, r) => s + Number(r.writeoff || 0), 0))}</td>
                <td className="px-3 py-2 text-right font-mono text-err">{inr(list.reduce((s, r) => s + Number(r.balance || 0), 0))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
