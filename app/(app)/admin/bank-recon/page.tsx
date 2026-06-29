"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr, shortDate } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────────

type BankEntry = {
  id: string;
  tx_date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number | null;
  ignored: boolean;
  row_order: number;
};

type ReconPayment = {
  id: string;
  pay_date: string;
  amount: number;
  mode: string;
  direction: "in" | "out";
  entity: string;
  ptype: "customer" | "supplier";
};

type MatchResult = {
  type: "exact" | "group" | "partial" | "none";
  payments: ReconPayment[];
  mybTotal: number;
};

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function detectSep(lines: string[]): string {
  const sample = lines.slice(0, 5).join("\n");
  return (sample.match(/\t/g) ?? []).length > (sample.match(/,/g) ?? []).length ? "\t" : ",";
}

function splitLine(line: string, sep: string): string[] {
  if (sep === "\t") return line.split("\t").map((s) => s.trim().replace(/^"|"$/g, ""));
  const result: string[] = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/ /g, " ").replace(/\s+/g, " ");
  // DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD MMM YYYY  e.g. "01 Jun 2026"
  const mons: Record<string, string> = {
    jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",
    jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12",
  };
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[\s,]+(\d{4})$/);
  if (m) { const mo = mons[m[2].toLowerCase()]; if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, "0")}`; }
  return null;
}

function parseAmt(raw: string): number {
  return parseFloat((raw ?? "").replace(/[,\s₹]/g, "").replace(/[^0-9.]/g, "") || "0") || 0;
}

type ParsedRow = { tx_date: string; description: string; debit: number; credit: number; balance: number | null };

function parseCSV(content: string): ParsedRow[] {
  // Strip BOM
  const text = content.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sep = detectSep(lines);

  let headerIdx = -1, dateCol = -1, descCol = -1, drCol = -1, crCol = -1, balCol = -1;

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const cols = splitLine(lines[i], sep);
    const lo = cols.map((c) => c.toLowerCase().replace(/[^a-z\s]/g, "").trim());
    const dI   = lo.findIndex((c) => c === "date" || c.startsWith("txn date") || c.startsWith("tran date") || c.startsWith("value date") || c.startsWith("transaction date"));
    const descI = lo.findIndex((c) => c.includes("narr") || c.includes("description") || c.includes("particular") || c.includes("detail") || c.includes("remarks"));
    const drI  = lo.findIndex((c) => c === "debit" || c.includes("debit amt") || c.includes("debit amount") || c.includes("withdrawal") || c === "dr");
    const crI  = lo.findIndex((c) => c === "credit" || c.includes("credit amt") || c.includes("credit amount") || c.includes("deposit") || c === "cr");
    const balI = lo.findIndex((c) => c.includes("balance") || c === "bal");
    if (dI >= 0 && (drI >= 0 || crI >= 0)) {
      headerIdx = i; dateCol = dI; descCol = descI; drCol = drI; crCol = crI; balCol = balI;
      break;
    }
  }

  if (headerIdx < 0) throw new Error("Could not detect CSV format. Expected columns: Date, Debit/Credit. Check your bank's CSV export.");

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], sep);
    const dateRaw = cols[dateCol]?.trim();
    if (!dateRaw) continue;
    const tx_date = parseDate(dateRaw);
    if (!tx_date) continue;
    const debit  = drCol >= 0 ? parseAmt(cols[drCol]) : 0;
    const credit = crCol >= 0 ? parseAmt(cols[crCol]) : 0;
    if (debit === 0 && credit === 0) continue;
    rows.push({
      tx_date,
      description: descCol >= 0 ? (cols[descCol] ?? "").trim() : "",
      debit, credit,
      balance: balCol >= 0 ? parseAmt(cols[balCol]) : null,
    });
  }
  return rows;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function matchEntry(entry: BankEntry, payments: ReconPayment[]): MatchResult {
  const bankAmt = entry.credit > 0 ? entry.credit : entry.debit;
  const bankDir = entry.credit > 0 ? "in" : "out";
  const candidates = payments.filter((p) => p.pay_date === entry.tx_date && p.direction === bankDir);

  // Exact single match
  const exact = candidates.find((p) => Math.abs(p.amount - bankAmt) < 0.5);
  if (exact) return { type: "exact", payments: [exact], mybTotal: exact.amount };

  // Group match — multiple payments on same day sum to bank amount (common for UPI)
  const mybTotal = candidates.reduce((s, p) => s + p.amount, 0);
  if (candidates.length > 1 && Math.abs(mybTotal - bankAmt) < 1) {
    return { type: "group", payments: candidates, mybTotal };
  }

  // Partial — some entries exist but total differs
  if (candidates.length > 0) return { type: "partial", payments: candidates, mybTotal };

  return { type: "none", payments: [], mybTotal: 0 };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankReconPage() {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const startDate = `${monthKey}-01`;
  const endDate   = `${monthKey}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;

  const [filter, setFilter]   = useState<"all" | "unmatched" | "ignored">("all");
  const [parseErr, setParseErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Existing statement ──
  const { data: statement, isLoading: stmtLoading } = useQuery({
    queryKey: ["bank-statement", monthKey],
    queryFn: async () => {
      const { data } = await supabase().from("bank_statements")
        .select("id, bank_name, created_at").eq("month", monthKey).maybeSingle();
      return data as { id: string; bank_name: string | null; created_at: string } | null;
    },
  });

  // ── Entries for this statement ──
  const { data: entries = [] } = useQuery<BankEntry[]>({
    queryKey: ["bank-entries", statement?.id],
    enabled: !!statement?.id,
    queryFn: async () => {
      const { data } = await supabase().from("bank_statement_entries")
        .select("id, tx_date, description, debit, credit, balance, ignored, row_order")
        .eq("statement_id", statement!.id).order("row_order");
      return (data ?? []) as BankEntry[];
    },
  });

  // ── MyBuddy bank/UPI payments for this month ──
  const { data: mybPayments = [] } = useQuery<ReconPayment[]>({
    queryKey: ["recon-payments", monthKey],
    queryFn: async () => {
      const client = supabase();
      const [custRes, suppRes] = await Promise.all([
        client.from("payments")
          .select("id, pay_date, amount, mode, direction, customers(name)")
          .in("mode", ["bank", "upi"])
          .gte("pay_date", startDate).lte("pay_date", endDate),
        client.from("supplier_payments")
          .select("id, pay_date, amount, mode, suppliers(name)")
          .in("mode", ["bank", "upi"])
          .gte("pay_date", startDate).lte("pay_date", endDate),
      ]);
      const result: ReconPayment[] = [];
      for (const p of (custRes.data ?? [])) {
        result.push({
          id: p.id, pay_date: p.pay_date, amount: Number(p.amount),
          mode: p.mode, direction: p.direction as "in" | "out",
          entity: (p.customers as any)?.name ?? "Customer",
          ptype: "customer",
        });
      }
      for (const p of (suppRes.data ?? [])) {
        result.push({
          id: p.id, pay_date: p.pay_date, amount: Number(p.amount),
          mode: p.mode, direction: "out",
          entity: (p.suppliers as any)?.name ?? "Supplier",
          ptype: "supplier",
        });
      }
      return result;
    },
  });

  // ── Computed matches ──
  const matchMap = useMemo(() => {
    const map: Record<string, MatchResult> = {};
    for (const e of entries) map[e.id] = matchEntry(e, mybPayments);
    return map;
  }, [entries, mybPayments]);

  // ── Stats ──
  const stats = useMemo(() => {
    let matched = 0, unmatched = 0, ignored = 0;
    let bankCredit = 0, bankDebit = 0, mybCredit = 0, mybDebit = 0;
    for (const e of entries) {
      bankCredit += e.credit; bankDebit += e.debit;
      if (e.ignored) { ignored++; continue; }
      const m = matchMap[e.id];
      if (m?.type === "exact" || m?.type === "group") {
        matched++;
        if (e.credit > 0) mybCredit += m.mybTotal; else mybDebit += m.mybTotal;
      } else unmatched++;
    }
    return { matched, unmatched, ignored, total: entries.length, bankCredit, bankDebit, mybCredit, mybDebit };
  }, [entries, matchMap]);

  // ── Upload mutation ──
  const uploadStatement = useMutation({
    mutationFn: async (rows: ParsedRow[]) => {
      const client = supabase();
      const { data: stmt, error: se } = await client.from("bank_statements")
        .upsert({ month: monthKey }, { onConflict: "month" }).select("id").single();
      if (se) throw se;
      await client.from("bank_statement_entries").delete().eq("statement_id", stmt.id);
      if (rows.length > 0) {
        const { error: ie } = await client.from("bank_statement_entries").insert(
          rows.map((r, i) => ({ ...r, statement_id: stmt.id, ignored: false, row_order: i }))
        );
        if (ie) throw ie;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-statement", monthKey] });
      qc.invalidateQueries({ queryKey: ["bank-entries"] });
    },
  });

  // ── Toggle ignore ──
  const toggleIgnore = useMutation({
    mutationFn: async ({ id, ignored }: { id: string; ignored: boolean }) => {
      const { error } = await supabase().from("bank_statement_entries").update({ ignored }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-entries", statement?.id] }),
  });

  async function handleFile(file: File) {
    setParseErr("");
    try {
      const content = await file.text();
      const rows = parseCSV(content);
      if (rows.length === 0) throw new Error("No data rows found. Check that the CSV has Date, Debit, and Credit columns.");
      await uploadStatement.mutateAsync(rows);
    } catch (err) {
      setParseErr(err instanceof Error ? err.message : "Parse error");
    }
  }

  // ── Filtered entries ──
  const filtered = entries.filter((e) => {
    if (filter === "ignored") return e.ignored;
    if (filter === "unmatched") {
      if (e.ignored) return false;
      const m = matchMap[e.id];
      return !m || (m.type !== "exact" && m.type !== "group");
    }
    return true;
  });

  function prevMonth() { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-ink">Bank Reconciliation</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">‹</button>
          <span className="font-semibold text-ink min-w-[130px] text-center">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="border border-line rounded-lg2 px-3 py-1.5 text-sm hover:border-gold">›</button>
        </div>
      </div>

      {/* Upload bar */}
      <div className="bg-white rounded-xl border border-line shadow-soft p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          {stmtLoading
            ? <p className="text-sm text-ink-dim">Loading…</p>
            : statement
            ? <><p className="text-sm font-medium text-ink">{entries.length} entries — {MONTHS[month]} {year}</p>
                <p className="text-xs text-ink-dim mt-0.5">Uploaded {shortDate(statement.created_at)}</p></>
            : <p className="text-sm text-ink-dim">No statement for {MONTHS[month]} {year}</p>
          }
        </div>
        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploadStatement.isPending}
          className="bg-gold text-white text-sm font-semibold px-4 py-2 rounded-lg2 disabled:opacity-50">
          {uploadStatement.isPending ? "Uploading…" : statement ? "Replace CSV" : "Upload CSV"}
        </button>
      </div>
      {parseErr && <p className="text-err text-sm bg-err/5 border border-err/20 rounded-lg2 px-3 py-2">{parseErr}</p>}

      {!statement && !stmtLoading && (
        <div className="text-center py-12 text-sm text-ink-dim">
          <p className="font-medium text-ink mb-1">Upload your bank CSV to begin</p>
          <p>Download the statement from your bank&apos;s internet banking (CSV format).</p>
          <p className="mt-1">Works with HDFC, SBI, ICICI, Axis, Kotak and most Indian banks.</p>
        </div>
      )}

      {statement && entries.length > 0 && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total",     val: stats.total,     cls: "text-ink" },
              { label: "Matched",   val: stats.matched,   cls: "text-ok" },
              { label: "Unmatched", val: stats.unmatched, cls: "text-err" },
              { label: "Ignored",   val: stats.ignored,   cls: "text-ink-dim" },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-line shadow-soft p-3 text-center">
                <p className={`text-2xl font-bold ${s.cls}`}>{s.val}</p>
                <p className="text-xs text-ink-dim mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Bank vs MyBuddy totals */}
          <div className="bg-white rounded-xl border border-line shadow-soft p-4 grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-ink-dim font-medium uppercase tracking-wide">Bank Statement</p>
              <p className="flex justify-between"><span className="text-ok">Credits (in)</span><span className="font-semibold">{inr(stats.bankCredit)}</span></p>
              <p className="flex justify-between"><span className="text-err">Debits (out)</span><span className="font-semibold">{inr(stats.bankDebit)}</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-ink-dim font-medium uppercase tracking-wide">MyBuddy (matched)</p>
              <p className="flex justify-between"><span className="text-ok">Credits (in)</span><span className="font-semibold">{inr(stats.mybCredit)}</span></p>
              <p className="flex justify-between"><span className="text-err">Debits (out)</span><span className="font-semibold">{inr(stats.mybDebit)}</span></p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex rounded-lg overflow-hidden border border-line text-xs w-fit">
            {(["all", "unmatched", "ignored"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 font-medium capitalize transition-colors ${filter === f ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas"}`}>
                {f === "all" ? `All (${stats.total})` : f === "unmatched" ? `Unmatched (${stats.unmatched})` : `Ignored (${stats.ignored})`}
              </button>
            ))}
          </div>

          {/* Entries list */}
          <div className="space-y-2">
            {filtered.map((entry) => {
              const match   = matchMap[entry.id];
              const isCredit = entry.credit > 0;
              const bankAmt  = isCredit ? entry.credit : entry.debit;
              const ok = !entry.ignored && (match?.type === "exact" || match?.type === "group");
              const partial = !entry.ignored && match?.type === "partial";
              const none    = !entry.ignored && match?.type === "none";
              const diff    = match ? Math.abs(match.mybTotal - bankAmt) : bankAmt;

              return (
                <div key={entry.id}
                  className={`bg-white rounded-xl border shadow-soft p-3 ${
                    entry.ignored ? "border-line opacity-60"
                    : ok   ? "border-ok/20"
                    : partial ? "border-warn/30"
                    : none ? "border-err/20"
                    : "border-line"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Row 1: date · amount · badge */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-ink-dim font-mono">{entry.tx_date.slice(5).replace("-", " / ")}</span>
                        <span className={`text-sm font-bold ${isCredit ? "text-ok" : "text-err"}`}>
                          {isCredit ? "+" : "-"}{inr(bankAmt)}
                        </span>
                        {entry.ignored
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-ink-dim">Ignored</span>
                          : match?.type === "exact"
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ok/10 text-ok">Matched</span>
                          : match?.type === "group"
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-info/10 text-info">Group ({match.payments.length})</span>
                          : match?.type === "partial"
                          ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warn/10 text-warn">Partial</span>
                          : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-err/10 text-err">No match</span>
                        }
                      </div>

                      {/* Row 2: bank description */}
                      {entry.description && (
                        <p className="text-xs text-ink-dim truncate">{entry.description}</p>
                      )}

                      {/* Row 3: MyBuddy match details */}
                      {!entry.ignored && match && match.payments.length > 0 && (
                        <div className="pl-1 border-l-2 border-ok/30 space-y-0.5 mt-1">
                          {match.payments.map((p) => (
                            <p key={p.id} className="text-xs text-ink">
                              {p.entity}
                              <span className="text-ink-dim"> · {inr(p.amount)} · {p.mode.toUpperCase()}</span>
                            </p>
                          ))}
                          {match.type === "partial" && (
                            <p className="text-xs text-warn font-medium">
                              Difference: {inr(diff)} {match.mybTotal > bankAmt ? "extra in MyBuddy" : "missing in MyBuddy"}
                            </p>
                          )}
                          {match.type === "group" && (
                            <p className="text-xs text-ink-dim">
                              Total: {inr(match.mybTotal)} · {match.payments.length} entries
                            </p>
                          )}
                        </div>
                      )}

                      {/* No match hint */}
                      {!entry.ignored && match?.type === "none" && (
                        <p className="text-xs text-err">
                          No {isCredit ? "customer payment (bank/UPI)" : "supplier payment (bank/UPI)"} found in MyBuddy
                        </p>
                      )}
                    </div>

                    {/* Ignore / Unignore */}
                    <button
                      onClick={() => toggleIgnore.mutate({ id: entry.id, ignored: !entry.ignored })}
                      title={entry.ignored ? "Unignore this entry" : "Ignore this entry (e.g. UPI batch, personal transfer)"}
                      className={`text-xs px-2.5 py-1 rounded-lg2 border shrink-0 transition-colors ${
                        entry.ignored ? "border-gold text-gold" : "border-line text-ink-dim hover:border-ink-dim"}`}>
                      {entry.ignored ? "Unignore" : "Ignore"}
                    </button>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p className="text-center py-10 text-sm text-ink-dim">
                {filter === "unmatched" ? "All entries are matched or ignored." : filter === "ignored" ? "No ignored entries." : "No entries."}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
