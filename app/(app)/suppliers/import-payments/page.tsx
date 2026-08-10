"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSuppliers } from "@/modules/suppliers/api";
import { supabase } from "@/lib/supabase/client";
import { inr, shortDate } from "@/lib/format";

interface ParsedRow {
  id: number;
  payNo: string;
  date: string;
  ledgerName: string;
  amount: number;
  reference: string;
  supplierId: string | null;
  skip: boolean;
  mode: "bank" | "upi" | "cash";
}

function parseDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}

function detectMode(ref: string): "bank" | "upi" | "cash" {
  const r = (ref || "").toUpperCase();
  if (r.includes("UPI")) return "upi";
  return "bank";
}

function parsePaste(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let idx = 0;
  for (const line of lines) {
    const cols = line.split("\t");
    const payNo = cols[0]?.trim();
    if (!payNo || !payNo.match(/^[A-Z]\/\d{2}-\d{2}\/\d+$/)) continue;
    const date = parseDate(cols[1]?.trim() || "");
    const ledgerName = (cols[2]?.trim() || "").toUpperCase();
    const amount = parseAmount(cols[3]?.trim() || "0");
    const reference = cols[4]?.trim() || "";
    if (!date || !ledgerName || amount <= 0) continue;
    rows.push({ id: idx++, payNo, date, ledgerName, amount, reference, supplierId: null, skip: false, mode: detectMode(reference) });
  }
  return rows;
}

function autoMatch(rows: ParsedRow[], suppliers: { id: string; name: string }[]): ParsedRow[] {
  return rows.map(row => {
    const needle = row.ledgerName.toLowerCase();
    let match = suppliers.find(s => s.name.toLowerCase() === needle);
    if (!match) match = suppliers.find(s => needle.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(needle));
    if (!match) {
      const words = needle.split(/\s+/).filter(w => w.length > 3);
      match = suppliers.find(s => words.some(w => s.name.toLowerCase().includes(w)));
    }
    return { ...row, supplierId: match?.id ?? null };
  });
}

export default function ImportPaymentsPage() {
  const { data: suppliers = [] } = useSuppliers("", 200);
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsed, setParsed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; failed: string[] } | null>(null);
  const [supplierSearch, setSupplierSearch] = useState<Record<number, string>>({});

  const inp = "w-full border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  function handleParse() {
    const parsed = parsePaste(pasteText);
    setRows(autoMatch(parsed, suppliers));
    setParsed(true);
    setResult(null);
  }

  function setSupplier(id: number, supplierId: string | null) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, supplierId } : r));
  }

  function setSkip(id: number, skip: boolean) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, skip } : r));
  }

  function setMode(id: number, mode: "bank" | "upi" | "cash") {
    setRows(prev => prev.map(r => r.id === id ? { ...r, mode } : r));
  }

  const toImport = rows.filter(r => !r.skip && r.supplierId);
  const unmatched = rows.filter(r => !r.skip && !r.supplierId);
  const skipped   = rows.filter(r => r.skip);

  async function handleImport() {
    if (toImport.length === 0) return;
    setImporting(true);
    const failed: string[] = [];
    const client = supabase();
    for (const row of toImport) {
      try {
        const { data: payRow, error } = await client
          .from("supplier_payments")
          .insert({
            supplier_id: row.supplierId,
            pay_date: row.date,
            mode: row.mode,
            amount: row.amount,
            notes: `${row.payNo} — ${row.reference}`.slice(0, 250),
          })
          .select()
          .single();
        if (error) throw error;
        const ledgerTable = row.mode === "cash" ? "cash_ledger" : "bank_ledger";
        await client.from(ledgerTable).insert({
          tx_date: row.date,
          direction: "out",
          amount: row.amount,
          description: `Supplier payment — ${row.ledgerName}`,
          ref_type: "supplier_payment",
          ref_id: payRow.id,
        });
      } catch (e: any) {
        failed.push(`${row.payNo}: ${e?.message ?? "error"}`);
      }
    }
    setImporting(false);
    setResult({ ok: toImport.length - failed.length, failed });
    if (failed.length === 0) {
      // Remove successfully imported rows
      const importedIds = new Set(toImport.map(r => r.id));
      setRows(prev => prev.filter(r => r.skip || !importedIds.has(r.id)));
    }
  }

  const filteredSuppliers = useMemo(() => suppliers, [suppliers]);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/suppliers" className="text-xs text-ink-dim hover:underline">Suppliers</Link>
        <span className="text-ink-dim text-xs">/</span>
        <h1 className="text-xl font-bold text-ink">Import Supplier Payments</h1>
      </div>

      {/* Step 1 — Paste */}
      {!parsed && (
        <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
          <p className="text-sm text-ink-dim">
            Copy the payment rows from Excel/Tally and paste below. Expected columns (tab-separated):<br />
            <span className="font-mono text-xs">Payment No &nbsp;|&nbsp; Payment Date (DD/MM/YYYY) &nbsp;|&nbsp; Ledger Name &nbsp;|&nbsp; Total Amount &nbsp;|&nbsp; Reference</span>
          </p>
          <textarea
            className="w-full border border-line rounded-lg2 px-3 py-2 text-xs font-mono h-52 focus:outline-none focus:ring-1 focus:ring-gold"
            placeholder={"P/24-25/1678\t31/07/2026\tAMN JEWELLERS\t1000000\tKVBLR...BANK\n..."}
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
          />
          <button
            onClick={handleParse}
            disabled={!pasteText.trim()}
            className="bg-gold text-white text-sm font-medium px-5 py-2 rounded-lg2 hover:bg-gold/90 disabled:opacity-40"
          >
            Parse Rows
          </button>
        </div>
      )}

      {/* Step 2 — Map & Review */}
      {parsed && rows.length > 0 && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-ok font-medium">{toImport.length} ready</span>
            {unmatched.length > 0 && <span className="text-err font-medium">{unmatched.length} unmatched — assign a supplier</span>}
            {skipped.length > 0 && <span className="text-ink-dim">{skipped.length} skipped</span>}
            <button onClick={() => { setParsed(false); setRows([]); setResult(null); }} className="ml-auto text-ink-dim hover:underline">
              Re-paste
            </button>
          </div>

          {result && (
            <div className={`rounded-lg2 px-4 py-3 text-sm ${result.failed.length === 0 ? "bg-ok/10 text-ok" : "bg-err/10 text-err"}`}>
              {result.ok} payment{result.ok !== 1 ? "s" : ""} imported.
              {result.failed.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {result.failed.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "780px" }}>
              <thead>
                <tr className="bg-canvas text-ink-dim border-b border-line">
                  <th className="px-3 py-2 text-left w-8">
                    <input type="checkbox" checked={rows.every(r => r.skip)} onChange={e => setRows(prev => prev.map(r => ({ ...r, skip: e.target.checked })))} title="Skip all" />
                  </th>
                  <th className="px-3 py-2 text-left">Pay No</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Ledger Name</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Mode</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const matchedSupplier = filteredSuppliers.find(s => s.id === row.supplierId);
                  return (
                    <tr key={row.id} className={`border-b border-line last:border-0 ${row.skip ? "opacity-40" : ""}`}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={row.skip} onChange={e => setSkip(row.id, e.target.checked)} title="Skip this row" />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-ink-dim">{row.payNo}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{shortDate(row.date)}</td>
                      <td className="px-3 py-1.5 text-ink-dim max-w-[180px] truncate" title={row.ledgerName}>{row.ledgerName}</td>
                      <td className="px-3 py-1.5 min-w-[200px]">
                        {row.skip ? (
                          <span className="text-ink-dim">—</span>
                        ) : (
                          <select
                            value={row.supplierId ?? ""}
                            onChange={e => setSupplier(row.id, e.target.value || null)}
                            className={`${inp} ${!row.supplierId ? "border-err text-err" : "border-ok/40"}`}
                          >
                            <option value="">— select supplier —</option>
                            {filteredSuppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-medium">{inr(row.amount)}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={row.mode}
                          onChange={e => setMode(row.id, e.target.value as any)}
                          className={inp}
                          disabled={row.skip}
                        >
                          <option value="bank">Bank</option>
                          <option value="upi">UPI</option>
                          <option value="cash">Cash</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={importing || toImport.length === 0}
              className="bg-gold text-white text-sm font-medium px-6 py-2 rounded-lg2 hover:bg-gold/90 disabled:opacity-40"
            >
              {importing ? "Importing…" : `Import ${toImport.length} Payment${toImport.length !== 1 ? "s" : ""}`}
            </button>
            {toImport.length > 0 && (
              <span className="text-xs text-ink-dim">
                Total: {inr(toImport.reduce((s, r) => s + r.amount, 0))}
              </span>
            )}
          </div>
        </div>
      )}

      {parsed && rows.length === 0 && (
        <div className="text-center py-10 text-ink-dim text-sm">
          No valid rows found. Make sure columns are tab-separated with payment number (P/YY-YY/XXXX format) in the first column.
          <div className="mt-3">
            <button onClick={() => setParsed(false)} className="text-gold hover:underline text-xs">Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
