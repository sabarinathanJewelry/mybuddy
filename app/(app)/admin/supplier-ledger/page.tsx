"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr, shortDate } from "@/lib/format";

// ── Parsing helpers ───────────────────────────────────────────────────────────

function detectSep(text: string): string {
  return (text.match(/\t/g) ?? []).length > (text.match(/,/g) ?? []).length ? "\t" : ",";
}

function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map(s => s.replace(/^"|"$/g, "").trim());
  const out: string[] = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDate(raw: string): string | null {
  raw = raw.trim();
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})[,\s]+(\d{4})$/);
  if (m) { const mo = months[m[2].toLowerCase()]; if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`; }
  return null;
}

function parseAmt(raw: string | undefined): number {
  return parseFloat((raw ?? "").replace(/[,\s₹]/g, "").replace(/[^0-9.]/g, "") || "0") || 0;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LedgerPayment = {
  id: string;
  tx_date: string;
  txn_no: string;
  narration: string;
  amount: number;
};

type LedgerPurchase = {
  id: string;
  tx_date: string;
  txn_no: string;
  txn_type: string;
  narration: string;
  amount: number;
  metal: string;
  rate: number | "";
  status: "pending" | "created";
};

type ExistingPayment = {
  id: string;
  pay_date: string;
  amount: number;
  mode: string;
  notes: string | null;
};

// ── Tally ledger parser ───────────────────────────────────────────────────────

function parseTallyLedger(text: string): {
  payments: LedgerPayment[];
  purchases: LedgerPurchase[];
  error?: string;
} {
  const lines = text
    .replace(/﻿/g, "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (!lines.length) return { payments: [], purchases: [], error: "Empty input" };

  const sep = detectSep(text);

  let headerIdx = -1;
  let dateCol = -1, txnTypeCol = -1, txnNoCol = -1, narrationCol = -1, amtDrCol = -1, amtCrCol = -1;

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = splitLine(lines[i], sep).map(c =>
      c.toLowerCase().replace(/[^a-z0-9\s.]/g, "").trim()
    );
    const dI = cols.findIndex(c => c === "date");
    const tI = cols.findIndex(c => c.includes("txn type") || c.includes("txntype") || c === "type");
    const drI = cols.findIndex(c => c.includes("amt dr") || c.includes("amount dr") || c === "debit");
    const crI = cols.findIndex(c => c.includes("amt cr") || c.includes("amount cr") || c === "credit");

    if (dI >= 0 && tI >= 0 && (drI >= 0 || crI >= 0)) {
      headerIdx = i;
      dateCol = dI;
      txnTypeCol = tI;
      txnNoCol = cols.findIndex(c => c.includes("txn no") || c.includes("txnno") || c === "vch no" || c === "voucher no");
      narrationCol = cols.findIndex(c => c.includes("narration") || c === "remarks");
      amtDrCol = drI;
      amtCrCol = crI;
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      payments: [], purchases: [],
      error: "Header row not found. Ensure the pasted text has columns: Date, Txn.Type, Amt Dr, Amt Cr",
    };
  }

  const payments: LedgerPayment[] = [];
  const purchases: LedgerPurchase[] = [];
  let idx = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], sep);
    const dateRaw = (cols[dateCol] ?? "").trim();
    const txnType = (cols[txnTypeCol] ?? "").trim().toUpperCase();

    if (!txnType || !dateRaw) continue;
    if (["OB", "CB", "TOTAL", "CLOSING BALANCE"].includes(txnType)) continue;
    if (["TOTAL", "CB"].includes(dateRaw.toUpperCase())) continue;

    const date = parseDate(dateRaw);
    if (!date) continue;

    const amtDr = amtDrCol >= 0 ? parseAmt(cols[amtDrCol]) : 0;
    const amtCr = amtCrCol >= 0 ? parseAmt(cols[amtCrCol]) : 0;
    if (amtDr === 0 && amtCr === 0) continue;

    const txnNo = txnNoCol >= 0 ? (cols[txnNoCol] ?? "").trim() : "";
    const narration = narrationCol >= 0 ? (cols[narrationCol] ?? "").trim() : "";

    if (txnType === "PAYMENT") {
      payments.push({ id: String(idx++), tx_date: date, txn_no: txnNo, narration, amount: amtDr || amtCr });
    } else if (txnType.includes("PURCHASE") || txnType.includes("SALE BILL") || txnType.includes("RECEIPT NOTE")) {
      purchases.push({ id: String(idx++), tx_date: date, txn_no: txnNo, txn_type: txnType, narration, amount: amtCr || amtDr, metal: "gold_22k", rate: "", status: "pending" });
    }
  }

  if (payments.length === 0 && purchases.length === 0) {
    return { payments: [], purchases: [], error: "No PAYMENT or RETAIL PURCHASE entries found. Check that your paste includes those rows." };
  }

  return { payments, purchases };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const METAL_OPTS = [
  { value: "gold_22k", label: "Gold 22K", purity: 91.6 },
  { value: "gold_18k", label: "Gold 18K", purity: 75 },
  { value: "gold_24k", label: "Gold 24K", purity: 99.9 },
  { value: "silver", label: "Silver", purity: 95 },
  { value: "silver_pure", label: "Silver Pure", purity: 99.9 },
];

const inp = "border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-canvas";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SupplierLedgerPage() {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  const [purchases, setPurchases] = useState<LedgerPurchase[]>([]);
  const [tab, setTab] = useState<"payments" | "purchases">("payments");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: async () => {
      const { data } = await supabase().from("suppliers").select("id, name").order("name");
      return data ?? [];
    },
  });

  const dateRange = useMemo(() => {
    const all = [...payments, ...purchases].map(l => l.tx_date).sort();
    return all.length ? { from: all[0], to: all[all.length - 1] } : null;
  }, [payments, purchases]);

  const { data: existingPayments = [] } = useQuery<ExistingPayment[]>({
    queryKey: ["supplier-payments-range", supplierId, dateRange?.from, dateRange?.to],
    enabled: !!supplierId && !!dateRange,
    queryFn: async () => {
      const { data } = await supabase()
        .from("supplier_payments")
        .select("id, pay_date, amount, mode, notes")
        .eq("supplier_id", supplierId)
        .gte("pay_date", dateRange!.from)
        .lte("pay_date", dateRange!.to);
      return data ?? [];
    },
  });

  // Match each ledger payment against MyBuddy supplier_payments by date + amount
  const matchMap = useMemo(() => {
    const map: Record<string, "matched" | "none"> = {};
    for (const line of payments) {
      const hit = existingPayments.find(
        p => p.pay_date === line.tx_date && Math.abs(p.amount - line.amount) <= 0.5
      );
      map[line.id] = hit ? "matched" : "none";
    }
    return map;
  }, [payments, existingPayments]);

  function handleParse() {
    const result = parseTallyLedger(text);
    if (result.error) {
      setParseError(result.error);
      setPayments([]);
      setPurchases([]);
    } else {
      setParseError(null);
      setPayments(result.payments);
      setPurchases(result.purchases);
    }
  }

  const addPayment = useMutation({
    mutationFn: async (line: LedgerPayment) => {
      const { error } = await supabase().from("supplier_payments").insert({
        supplier_id: supplierId,
        pay_date: line.tx_date,
        mode: "bank",
        amount: line.amount,
        notes: [line.txn_no, line.narration].filter(Boolean).join(" — ") || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-payments-range", supplierId] });
      qc.invalidateQueries({ queryKey: ["supplier-360", supplierId] });
    },
  });

  const addPurchase = useMutation({
    mutationFn: async (line: LedgerPurchase) => {
      const rate = Number(line.rate);
      if (!rate || rate <= 0) throw new Error("Enter a rate per gram first");
      const metalOpt = METAL_OPTS.find(m => m.value === line.metal) ?? METAL_OPTS[0];
      const grossWt = parseFloat((line.amount / rate).toFixed(4));
      const { error } = await supabase().from("supplier_purchases").insert({
        supplier_id: supplierId,
        purchase_date: line.tx_date,
        metal: line.metal,
        gross_wt: grossWt,
        purity_pct: metalOpt.purity,
        description: [line.txn_no, line.narration].filter(Boolean).join(" — ") || null,
      });
      if (error) throw error;
      return line.id;
    },
    onSuccess: (lineId) => {
      setPurchases(prev => prev.map(p => p.id === lineId ? { ...p, status: "created" } : p));
      qc.invalidateQueries({ queryKey: ["supplier-360", supplierId] });
    },
  });

  const unmatchedCount = payments.filter(p => matchMap[p.id] === "none").length;
  const createdCount = purchases.filter(p => p.status === "created").length;
  const hasParsed = payments.length > 0 || purchases.length > 0;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-ink">Supplier Ledger Import</h1>

      {/* Step 1 */}
      <section className="bg-canvas border border-line rounded-lg2 p-4 space-y-2">
        <p className="text-sm font-medium text-ink">1. Select supplier</p>
        <select
          className={inp + " w-full max-w-sm"}
          value={supplierId}
          onChange={e => setSupplierId(e.target.value)}
        >
          <option value="">— choose supplier —</option>
          {suppliers.map((s: { id: string; name: string }) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </section>

      {/* Step 2 */}
      <section className="bg-canvas border border-line rounded-lg2 p-4 space-y-3">
        <p className="text-sm font-medium text-ink">2. Paste Tally ledger export</p>
        <p className="text-xs text-ink-dim">
          In Tally: open the supplier ledger → Export / Print to Excel or CSV → copy all rows including the header row (Date, Txn.Type, Amt Dr, Amt Cr) → paste here.
        </p>
        <textarea
          className={inp + " w-full h-36 font-mono text-xs"}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"Date\tTxn.no\tTxn.Type\tLedger\tAddress\tMode\tNarration\tAmt Dr\tAmt Cr\n01/04/2026\tP/24-25/1425\tPAYMENT\t...\t...\tBANK\tKKBKRS...\t1000000\t"}
        />
        {parseError && (
          <p className="text-sm text-err bg-err/5 rounded-lg2 px-3 py-2">{parseError}</p>
        )}
        <button
          className="px-4 py-1.5 bg-gold text-white text-sm rounded-lg2 disabled:opacity-40"
          onClick={handleParse}
          disabled={!supplierId || !text.trim()}
        >
          Parse
        </button>
      </section>

      {/* Step 3: Results */}
      {hasParsed && (
        <section className="bg-canvas border border-line rounded-lg2">
          <div className="flex border-b border-line px-4 pt-3 gap-4">
            <button
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === "payments" ? "border-gold text-gold" : "border-transparent text-ink-dim"}`}
              onClick={() => setTab("payments")}
            >
              Payments ({payments.length})
              {unmatchedCount > 0 && (
                <span className="ml-1.5 text-xs bg-err/10 text-err px-1.5 py-0.5 rounded-full">
                  {unmatchedCount} missing
                </span>
              )}
            </button>
            <button
              className={`pb-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === "purchases" ? "border-gold text-gold" : "border-transparent text-ink-dim"}`}
              onClick={() => setTab("purchases")}
            >
              Purchases ({purchases.length})
              {createdCount > 0 && (
                <span className="ml-1.5 text-xs bg-ok/10 text-ok px-1.5 py-0.5 rounded-full">
                  {createdCount} added
                </span>
              )}
            </button>
          </div>

          {/* Payments */}
          {tab === "payments" && (
            <div className="p-4">
              <p className="text-xs text-ink-dim mb-3">
                Matching against MyBuddy bank payments for this supplier in the same date range.
                Matched = same date + same amount already exists.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-ink-dim border-b border-line">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Voucher</th>
                      <th className="text-left pb-2 pr-3 max-w-[180px]">Narration</th>
                      <th className="text-right pb-2 pr-3">Amount</th>
                      <th className="text-left pb-2 pr-3">Status</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(line => {
                      const matched = matchMap[line.id] === "matched";
                      return (
                        <tr key={line.id} className="border-b border-line/40 last:border-0">
                          <td className="py-1.5 pr-3 text-xs whitespace-nowrap">{shortDate(line.tx_date)}</td>
                          <td className="py-1.5 pr-3 text-xs text-ink-dim">{line.txn_no}</td>
                          <td className="py-1.5 pr-3 text-xs text-ink-dim max-w-[180px] truncate" title={line.narration}>
                            {line.narration}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs">{inr(line.amount)}</td>
                          <td className="py-1.5 pr-3">
                            {matched ? (
                              <span className="text-xs text-ok bg-ok/10 px-2 py-0.5 rounded-full">Matched</span>
                            ) : (
                              <span className="text-xs text-err bg-err/10 px-2 py-0.5 rounded-full">Not in MyBuddy</span>
                            )}
                          </td>
                          <td className="py-1.5">
                            {!matched && (
                              <button
                                className="text-xs text-gold underline hover:no-underline disabled:opacity-40"
                                onClick={async () => {
                                  setCreatingId(line.id);
                                  try { await addPayment.mutateAsync(line); } finally { setCreatingId(null); }
                                }}
                                disabled={creatingId === line.id}
                              >
                                {creatingId === line.id ? "Adding…" : "Add Entry"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="mt-4 pt-3 border-t border-line flex gap-6 text-xs text-ink-dim">
                <span>Total: <strong className="text-ink">{payments.length}</strong></span>
                <span className="text-ok">Matched: <strong>{payments.length - unmatchedCount}</strong></span>
                {unmatchedCount > 0 && (
                  <span className="text-err">Not in MyBuddy: <strong>{unmatchedCount}</strong></span>
                )}
                <span>
                  Total amount: <strong className="text-ink font-mono">
                    {inr(payments.reduce((s, p) => s + p.amount, 0))}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* Purchases */}
          {tab === "purchases" && (
            <div className="p-4">
              <p className="text-xs text-ink-dim mb-3">
                Enter rate per gram (₹/g) to convert amount to metal weight.
                Select metal type, then click Add to create a purchase record.
                You can leave rate blank and add it later from the supplier page.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-ink-dim border-b border-line">
                      <th className="text-left pb-2 pr-3">Date</th>
                      <th className="text-left pb-2 pr-3">Voucher / Type</th>
                      <th className="text-right pb-2 pr-3">Amount</th>
                      <th className="text-left pb-2 pr-3">Metal</th>
                      <th className="text-right pb-2 pr-3">Rate / g</th>
                      <th className="text-right pb-2 pr-3">Gross Wt</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((line, i) => {
                      const rate = Number(line.rate);
                      const grossWt = rate > 0 ? line.amount / rate : null;
                      const done = line.status === "created";
                      return (
                        <tr key={line.id} className={`border-b border-line/40 last:border-0 ${done ? "opacity-50" : ""}`}>
                          <td className="py-1.5 pr-3 text-xs whitespace-nowrap">{shortDate(line.tx_date)}</td>
                          <td className="py-1.5 pr-3 text-xs">
                            <span className="font-medium">{line.txn_no}</span>
                            {line.txn_type !== "RETAIL PURCHASE" && (
                              <span className="ml-1 text-ink-dim text-[10px]">{line.txn_type}</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs">{inr(line.amount)}</td>
                          <td className="py-1.5 pr-3">
                            <select
                              className={inp}
                              value={line.metal}
                              disabled={done}
                              onChange={e => setPurchases(prev => prev.map((p, j) => j === i ? { ...p, metal: e.target.value } : p))}
                            >
                              {METAL_OPTS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </td>
                          <td className="py-1.5 pr-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={inp + " w-24 text-right"}
                              placeholder="e.g. 4800"
                              value={line.rate}
                              disabled={done}
                              onChange={e => setPurchases(prev => prev.map((p, j) => j === i ? { ...p, rate: e.target.value as "" | number } : p))}
                            />
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono text-xs text-info">
                            {grossWt != null ? `${grossWt.toFixed(3)} g` : "—"}
                          </td>
                          <td className="py-1.5">
                            {done ? (
                              <span className="text-xs text-ok bg-ok/10 px-2 py-0.5 rounded-full">Added</span>
                            ) : (
                              <button
                                className="text-xs text-gold underline hover:no-underline disabled:opacity-40"
                                onClick={async () => {
                                  setCreatingId(line.id);
                                  try { await addPurchase.mutateAsync(line); } catch (e) { alert((e as Error).message); } finally { setCreatingId(null); }
                                }}
                                disabled={creatingId === line.id || !rate || rate <= 0}
                              >
                                {creatingId === line.id ? "Adding…" : "Add"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="mt-4 pt-3 border-t border-line flex gap-6 text-xs text-ink-dim">
                <span>Total: <strong className="text-ink">{purchases.length}</strong></span>
                {createdCount > 0 && (
                  <span className="text-ok">Added: <strong>{createdCount}</strong></span>
                )}
                <span>Pending: <strong className="text-ink">{purchases.length - createdCount}</strong></span>
                <span>
                  Total amount: <strong className="text-ink font-mono">
                    {inr(purchases.reduce((s, p) => s + p.amount, 0))}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
