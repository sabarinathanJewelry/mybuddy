"use client";

import { useState } from "react";
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
  // set when a matching payment already exists in supplier_payments
  existingPaymentId: string | null;
  existingSupplierId: string | null;
  existingSupplierName: string | null;
  // user explicitly wants to re-assign this duplicate
  reassign: boolean;
}

// ── Persistent name → supplier mapping (localStorage) ────────────────────
const MAP_KEY = "supplier-payment-mapping-v1";
function loadMappings(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}"); } catch { return {}; }
}
function saveMapping(ledgerName: string, supplierId: string) {
  const m = loadMappings();
  m[ledgerName.toUpperCase()] = supplierId;
  localStorage.setItem(MAP_KEY, JSON.stringify(m));
}

// ── Parsers ───────────────────────────────────────────────────────────────
function parseDate(s: string): string {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function parseAmount(s: string): number {
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}
function detectMode(ref: string): "bank" | "upi" | "cash" {
  return (ref || "").toUpperCase().includes("UPI") ? "upi" : "bank";
}
function parsePaste(text: string) {
  const rows: Omit<ParsedRow, "supplierId" | "existingPaymentId" | "existingSupplierId" | "existingSupplierName" | "reassign">[] = [];
  let idx = 0;
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split("\t");
    const payNo = cols[0]?.trim();
    if (!payNo?.match(/^[A-Z]\/\d{2}-\d{2}\/\d+$/)) continue;
    const date       = parseDate(cols[1]?.trim() || "");
    const ledgerName = (cols[2]?.trim() || "").toUpperCase();
    const amount     = parseAmount(cols[3]?.trim() || "0");
    const reference  = cols[4]?.trim() || "";
    if (!date || !ledgerName || amount <= 0) continue;
    rows.push({ id: idx++, payNo, date, ledgerName, amount, reference, skip: false, mode: detectMode(reference) });
  }
  return rows;
}

function matchSupplier(name: string, suppliers: { id: string; name: string }[], saved: Record<string, string>): string | null {
  const upper = name.toUpperCase();
  if (saved[upper]) return saved[upper]; // saved mapping wins
  const lower = name.toLowerCase();
  return (
    suppliers.find(s => s.name.toLowerCase() === lower)?.id ??
    suppliers.find(s => lower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(lower))?.id ??
    suppliers.find(s => lower.split(/\s+/).filter(w => w.length > 3).some(w => s.name.toLowerCase().includes(w)))?.id ??
    null
  );
}

export default function ImportPaymentsPage() {
  const { data: suppliers = [] } = useSuppliers("", 200);
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [parsed, setParsed]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<{ ok: number; failed: string[] } | null>(null);

  const inp = "w-full border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  async function handleParse() {
    setLoading(true);
    const saved = loadMappings();
    const base  = parsePaste(pasteText);

    // Fetch all existing pay-numbers and which supplier they're under
    const { data: existing } = await supabase()
      .from("supplier_payments")
      .select("id, notes, supplier_id, suppliers(name)")
      .ilike("notes", "P/%")
      .limit(10000);

    const existingMap = new Map<string, { id: string; supplierId: string; supplierName: string }>();
    for (const r of (existing ?? []) as any[]) {
      const payNo = (r.notes ?? "").split("—")[0].trim();
      if (payNo) existingMap.set(payNo, { id: r.id, supplierId: r.supplier_id, supplierName: r.suppliers?.name ?? "?" });
    }

    const full: ParsedRow[] = base.map(row => {
      const ex = existingMap.get(row.payNo) ?? null;
      const supplierId = matchSupplier(row.ledgerName, suppliers, saved);
      return {
        ...row,
        supplierId,
        existingPaymentId:   ex?.id ?? null,
        existingSupplierId:  ex?.supplierId ?? null,
        existingSupplierName: ex?.supplierName ?? null,
        skip:    !!ex,   // auto-skip duplicates; user can un-skip to reassign
        reassign: false,
      };
    });

    setRows(full);
    setParsed(true);
    setResult(null);
    setLoading(false);
  }

  function setSupplier(id: number, supplierId: string | null) {
    const row = rows.find(r => r.id === id);
    if (row && supplierId) saveMapping(row.ledgerName, supplierId);
    setRows(prev => prev.map(r => r.id === id ? { ...r, supplierId } : r));
  }
  function toggleSkip(id: number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, skip: !r.skip, reassign: false } : r));
  }
  function toggleReassign(id: number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, reassign: !r.reassign, skip: false } : r));
  }
  function setMode(id: number, mode: "bank" | "upi" | "cash") {
    setRows(prev => prev.map(r => r.id === id ? { ...r, mode } : r));
  }

  // Use current rows snapshot directly inside handleImport via closure
  const readyNew      = rows.filter(r => !r.skip && !r.reassign && !r.existingPaymentId && r.supplierId);
  const readyReassign = rows.filter(r => r.reassign && r.supplierId);
  const toImport      = [...readyNew, ...readyReassign];
  const unmatched     = rows.filter(r => !r.skip && !r.supplierId);
  const duplicates    = rows.filter(r => !!r.existingPaymentId && r.skip);
  const wrongSupplier = rows.filter(r => !!r.existingPaymentId && r.existingSupplierId && r.supplierId &&
    r.existingSupplierId !== r.supplierId && !r.reassign);

  async function handleImport() {
    // Snapshot latest rows at click time to avoid any stale closure
    const snapshot = rows;
    const readyNow      = snapshot.filter(r => !r.skip && !r.reassign && !r.existingPaymentId && r.supplierId);
    const reassignNow   = snapshot.filter(r => r.reassign && r.supplierId);
    const all           = [...readyNow, ...reassignNow];
    if (all.length === 0) return;

    setImporting(true);
    const failed: string[] = [];
    const client = supabase();

    for (const row of all) {
      try {
        // Delete old payment if re-assigning
        if (row.reassign && row.existingPaymentId) {
          await Promise.allSettled([
            client.from("cash_ledger").delete().eq("ref_type", "supplier_payment").eq("ref_id", row.existingPaymentId),
            client.from("bank_ledger").delete().eq("ref_type", "supplier_payment").eq("ref_id", row.existingPaymentId),
          ]);
          await client.from("supplier_payments").delete().eq("id", row.existingPaymentId);
        }

        const { data: payRow, error: pe } = await client
          .from("supplier_payments")
          .insert({
            supplier_id: row.supplierId,
            pay_date:    row.date,
            mode:        row.mode,
            amount:      row.amount,
            notes:       `${row.payNo} — ${row.reference}`.slice(0, 250),
          })
          .select()
          .single();
        if (pe) throw pe;

        // Ledger is best-effort
        const ledger = row.mode === "cash" ? "cash_ledger" : "bank_ledger";
        const { error: le } = await client.from(ledger).insert({
          tx_date:     row.date,
          direction:   "out",
          amount:      row.amount,
          description: `Supplier payment — ${row.ledgerName}`,
          ref_type:    "supplier_payment",
          ref_id:      payRow.id,
        });
        if (le) console.warn("Ledger (non-fatal):", le.message);

        // Update row in state: mark as existing with new supplier
        const newSupplierName = suppliers.find(s => s.id === row.supplierId)?.name ?? "";
        setRows(prev => prev.map(r => r.id === row.id ? {
          ...r, skip: true, reassign: false,
          existingPaymentId: payRow.id, existingSupplierId: row.supplierId, existingSupplierName: newSupplierName,
        } : r));
      } catch (e: any) {
        failed.push(`${row.payNo}: ${e?.message ?? "error"}`);
      }
    }

    setImporting(false);
    setResult({ ok: all.length - failed.length, failed });
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/suppliers" className="text-xs text-ink-dim hover:underline">Suppliers</Link>
        <span className="text-ink-dim text-xs">/</span>
        <h1 className="text-xl font-bold text-ink">Import Supplier Payments</h1>
      </div>

      {/* Paste area */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-5 space-y-3">
        <p className="text-sm text-ink-dim">
          Copy rows from Excel/Tally and paste below. Columns (tab-separated):<br />
          <span className="font-mono text-xs">Payment No &nbsp;|&nbsp; Date DD/MM/YYYY &nbsp;|&nbsp; Ledger Name &nbsp;|&nbsp; Amount &nbsp;|&nbsp; Reference</span>
        </p>
        <textarea
          className="w-full border border-line rounded-lg2 px-3 py-2 text-xs font-mono h-36 focus:outline-none focus:ring-1 focus:ring-gold"
          placeholder={"P/24-25/1678\t31/07/2026\tAMN JEWELLERS\t1000000\tKVBLR...BANK\n..."}
          value={pasteText}
          onChange={e => { setPasteText(e.target.value); setParsed(false); setRows([]); setResult(null); }}
        />
        <button
          onClick={handleParse}
          disabled={!pasteText.trim() || loading}
          className="bg-gold text-white text-sm font-medium px-5 py-2 rounded-lg2 hover:bg-gold/90 disabled:opacity-40"
        >
          {loading ? "Checking…" : "Parse & Check Duplicates"}
        </button>
      </div>

      {/* Mapping table */}
      {parsed && rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-ok font-medium">{toImport.length} ready</span>
            {unmatched.length > 0 && <span className="text-err font-medium">{unmatched.length} unmatched</span>}
            {wrongSupplier.length > 0 && (
              <span className="text-warn font-medium">
                {wrongSupplier.length} imported under wrong supplier — click Re-assign
              </span>
            )}
            {duplicates.length > 0 && <span className="text-ink-dim">{duplicates.length} already imported (skipped)</span>}
          </div>

          {result && (
            <div className={`rounded-lg2 px-4 py-3 text-sm ${result.failed.length === 0 ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
              {result.ok} payment{result.ok !== 1 ? "s" : ""} imported.
              {result.failed.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5 text-err">
                  {result.failed.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: "860px" }}>
              <thead>
                <tr className="bg-canvas text-ink-dim border-b border-line">
                  <th className="px-3 py-2 text-left w-6">Skip</th>
                  <th className="px-3 py-2 text-left">Pay No</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Ledger Name</th>
                  <th className="px-3 py-2 text-left">Supplier</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left w-20">Mode</th>
                  <th className="px-3 py-2 text-left w-40">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isDup     = !!row.existingPaymentId;
                  const isWrong   = isDup && row.existingSupplierId !== row.supplierId && !!row.supplierId;
                  const rowCls    = row.reassign ? "bg-warn/5"
                                  : row.skip     ? "opacity-50"
                                  : "";
                  return (
                    <tr key={row.id} className={`border-b border-line last:border-0 ${rowCls}`}>
                      <td className="px-3 py-1.5">
                        {!isDup ? (
                          <input type="checkbox" checked={row.skip} onChange={() => toggleSkip(row.id)} />
                        ) : (
                          <span className="text-ink-dim">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-ink-dim">{row.payNo}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{shortDate(row.date)}</td>
                      <td className="px-3 py-1.5 text-ink-dim max-w-[160px] truncate" title={row.ledgerName}>{row.ledgerName}</td>
                      <td className="px-3 py-1.5 min-w-[200px]">
                        {row.skip && !row.reassign ? (
                          <span className="text-ink-dim">{suppliers.find(s => s.id === row.supplierId)?.name ?? "—"}</span>
                        ) : (
                          <select
                            value={row.supplierId ?? ""}
                            onChange={e => setSupplier(row.id, e.target.value || null)}
                            className={`${inp} ${!row.supplierId ? "border-err/60 text-err" : isWrong || row.reassign ? "border-warn/60" : "border-ok/40"}`}
                          >
                            <option value="">— select supplier —</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono font-medium">{inr(row.amount)}</td>
                      <td className="px-3 py-1.5">
                        <select value={row.mode} onChange={e => setMode(row.id, e.target.value as any)} className={inp} disabled={row.skip && !row.reassign}>
                          <option value="bank">Bank</option>
                          <option value="upi">UPI</option>
                          <option value="cash">Cash</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        {!isDup ? (
                          !row.supplierId ? (
                            <span className="text-err">No supplier</span>
                          ) : row.skip ? (
                            <span className="text-ink-dim">Skipped</span>
                          ) : (
                            <span className="text-ok">Ready</span>
                          )
                        ) : row.reassign ? (
                          <span className="text-warn font-medium">
                            Re-assign &nbsp;
                            <button onClick={() => toggleReassign(row.id)} className="underline text-ink-dim">cancel</button>
                          </span>
                        ) : isWrong ? (
                          <span className="text-warn">
                            Under: {row.existingSupplierName}{" "}
                            <button onClick={() => toggleReassign(row.id)} className="underline text-gold font-medium">Re-assign</button>
                          </span>
                        ) : (
                          <span className="text-ink-dim text-[11px]">Imported ✓ {row.existingSupplierName}</span>
                        )}
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
              <span className="text-xs text-ink-dim">Total: {inr(toImport.reduce((s, r) => s + r.amount, 0))}</span>
            )}
          </div>
        </div>
      )}

      {parsed && rows.length === 0 && !loading && (
        <div className="text-center py-10 text-ink-dim text-sm">
          No valid rows parsed. Ensure columns are tab-separated with payment number (P/YY-YY/XXXX) in column 1.
        </div>
      )}
    </div>
  );
}
