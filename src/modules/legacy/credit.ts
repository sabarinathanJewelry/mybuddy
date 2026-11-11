import * as XLSX from "xlsx";

export type CreditEntry = {
  fy: string;
  tab_name: string;
  tab_month: string;
  row_no: number;
  entry_date: string | null;
  type: string | null;
  name: string | null;
  phone: string | null;
  amount: number | null;
  paid_date: string | null;
  paid: number | null;
  writeoff: number | null;
  balance: number | null;
  sheet_balance: number | null;
  advance: number | null;
  raw: (string | number | boolean | null)[];
};

export type ParsedCredit = { fy: string; entries: CreditEntry[]; issues: string[] };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const isDate = (v: unknown): v is Date => v instanceof Date && !isNaN(v.getTime());
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (raw: Date) => { const d = new Date(raw.getTime() + 12 * 3600 * 1000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Dates were typed day/month: Excel stored "3/4" as 4 March, and left "13/4" as text. Fix both relative to the tab's month.
function fixDate(v: unknown, year: number, month: number, startYear: number): { date: string | null; fixed: boolean } {
  if (isDate(v)) {
    const s = ymd(v);
    const [y, m, d] = s.split("-").map(Number);
    if (m === month && y === year) return { date: s, fixed: false };
    if (d === month && m <= 31) return { date: `${year}-${pad(month)}-${pad(m)}`, fixed: true };
    if (m === month && y !== year) return { date: `${year}-${pad(month)}-${pad(d)}`, fixed: true };
    return { date: s, fixed: false };
  }
  const t = typeof v === "string" ? v.trim().replace(/^\./, "").match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/) : null;
  if (!t) return { date: null, fixed: false };
  let a = Number(t[1]), b = Number(t[2]);
  if (b !== month && a === month) [a, b] = [b, a];
  const y = t[3] ? (t[3].length === 2 ? 2000 + Number(t[3]) : Number(t[3])) : b >= 4 ? startYear : startYear + 1;
  return a >= 1 && a <= 31 && b >= 1 && b <= 12 ? { date: `${y}-${pad(b)}-${pad(a)}`, fixed: true } : { date: null, fixed: false };
}

export function parseCreditFile(buf: ArrayBuffer, fileName: string): ParsedCredit {
  const m = fileName.match(/(\d{2,4})\s*-\s*(\d{2,4})/);
  if (!m) throw new Error("File name must contain the year, e.g. 'Balance Sheet 24-25'");
  const startYear = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const fy = `${startYear}-${String(startYear + 1).slice(2)}`;
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const entries: CreditEntry[] = [];
  const issues: string[] = [];

  for (const tab of wb.SheetNames) {
    const lower = tab.toLowerCase();
    const mi = MONTHS.findIndex((x) => lower.includes(x));
    if (mi < 0) { issues.push(`Tab "${tab}" skipped (no month in name)`); continue; }
    const month = mi + 1;
    const year = month >= 4 ? startYear : startYear + 1;
    const isExpense = lower.includes("expense");
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[tab], { header: 1, raw: true, defval: null });
    const hi = rows.slice(0, 3).findIndex((r) => str(r[0])?.toLowerCase() === "date");
    let fixedCount = 0, noBal = 0;
    rows.slice(hi + 1).forEach((r, k) => {
      const raw = r.map((c) => (isDate(c) ? ymd(c) : typeof c === "number" || typeof c === "string" || typeof c === "boolean" ? c : null));
      if (isExpense) {
        if (num(r[3]) == null) return;
        const d = fixDate(r[0], year, month, startYear);
        if (d.fixed) fixedCount++;
        entries.push({ fy, tab_name: tab, tab_month: `${year}-${pad(month)}-01`, row_no: hi + k + 2, entry_date: d.date, type: "EXP", name: str(r[1]), phone: str(r[2]),
          amount: num(r[3]), paid_date: null, paid: null, writeoff: null, balance: null, sheet_balance: null, advance: null, raw });
        return;
      }
      const amount = num(r[4]);
      if (amount == null) return;
      const d = fixDate(r[0], year, month, startYear);
      if (d.fixed) fixedCount++;
      const pd = isDate(r[5]) ? ymd(r[5]) : str(r[5]);
      const paid = num(r[6]), writeoff = num(r[7]), sheetBal = num(r[8]);
      if (sheetBal == null) noBal++;
      entries.push({
        fy, tab_name: tab, tab_month: `${year}-${pad(month)}-01`, row_no: hi + k + 2, entry_date: d.date,
        type: str(r[1])?.toUpperCase() ?? null, name: str(r[2]), phone: r[3] == null ? null : String(r[3]).replace(/\.0$/, ""),
        amount, paid_date: pd, paid, writeoff, balance: Math.round((amount - (paid ?? 0) - (writeoff ?? 0)) * 100) / 100,
        sheet_balance: sheetBal, advance: num(r[9]), raw,
      });
    });
    if (fixedCount) issues.push(`${tab}: ${fixedCount} date(s) corrected (typed day/month)`);
    if (noBal) issues.push(`${tab}: ${noBal} row(s) had no Balance in the sheet; worked out as Amount − Paid − Scrap`);
  }
  return { fy, entries, issues };
}
