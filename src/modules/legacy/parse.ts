import * as XLSX from "xlsx";

export type LegacyKind = "gold_sale" | "silver_sale" | "non_rsj" | "old_in" | "order" | "expense";

export type LegacyEntry = {
  kind: LegacyKind;
  entry_date: string | null;
  shop: string | null;
  item: string | null;
  type: string | null;
  qty: number | null;
  weight: number | null;
  weight2: number | null;
  amount: number | null;
};

export type Check = { tab: string; label: string; sheet: number | null; computed: number; unit: "g" | "₹" | "pcs" };
export type Issue = { tab: string; message: string };

export type ParsedFile = {
  month: string;
  entries: LegacyEntry[];
  checks: Check[];
  issues: Issue[];
  totals: Record<string, number>;
};

type Row = unknown[];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const num = (v: unknown): number | null => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
  return null;
};
const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const ymd = (raw: Date) => { const d = new Date(raw.getTime() + 12 * 3600 * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const isDate = (v: unknown): v is Date => v instanceof Date && !isNaN(v.getTime());
const sum = (xs: (number | null)[]) => Math.round(xs.reduce<number>((s, x) => s + (x ?? 0), 0) * 1000) / 1000;

function rows(wb: XLSX.WorkBook, name: string): Row[] | null {
  const key = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
  if (!key) return null;
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[key], { header: 1, raw: true, defval: null });
}

function dataRows(r: Row[]) {
  return r.slice(1).filter((x) => isDate(x[0]));
}

function countNA(r: Row[]) {
  return r.reduce<number>((n, x) => n + x.filter((c) => typeof c === "string" && c.trim() === "#N/A").length, 0);
}

function monthFrom(fileName: string, dates: Date[]): string {
  const m = fileName.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_-]*(\d{4})/);
  if (m) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-01`;
  const counts = new Map<string, number>();
  dates.forEach((d) => { const k = ymd(d).slice(0, 7); counts.set(k, (counts.get(k) ?? 0) + 1); });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) throw new Error("Could not find the month from file name or dates");
  return `${top[0]}-01`;
}

export function parseLegacyFile(buf: ArrayBuffer, fileName: string): ParsedFile {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const entries: LegacyEntry[] = [];
  const checks: Check[] = [];
  const issues: Issue[] = [];
  const allDates: Date[] = [];
  const e = (p: Partial<LegacyEntry> & { kind: LegacyKind }): LegacyEntry =>
    ({ entry_date: null, shop: null, item: null, type: null, qty: null, weight: null, weight2: null, amount: null, ...p });

  const tab = (name: string, fn: (r: Row[], data: Row[]) => void) => {
    const r = rows(wb, name);
    if (!r) { issues.push({ tab: name, message: "Tab not found in file" }); return; }
    const data = dataRows(r);
    data.forEach((x) => allDates.push(x[0] as Date));
    const na = countNA(r);
    if (na) issues.push({ tab: name, message: `${na} cell(s) show #N/A (broken formula)` });
    fn(r, data);
  };

  tab("RSJ", (r, data) => {
    data.forEach((x) => entries.push(e({ kind: "gold_sale", entry_date: ymd(x[0] as Date), item: str(x[1]), type: str(x[2]), qty: num(x[3]), weight: num(x[4]) })));
    const miss = data.filter((x) => num(x[4]) == null).length;
    if (miss) issues.push({ tab: "RSJ", message: `${miss} gold sale row(s) have no weight` });
    checks.push({ tab: "RSJ", label: "Gold pieces", sheet: num(r[0]?.[3]), computed: sum(data.map((x) => num(x[3]))), unit: "pcs" });
    checks.push({ tab: "RSJ", label: "Gold weight", sheet: num(r[0]?.[4]), computed: sum(data.map((x) => num(x[4]))), unit: "g" });
  });

  tab("Silver", (r, data) => {
    data.forEach((x) => entries.push(e({ kind: "silver_sale", entry_date: ymd(x[0] as Date), shop: str(x[1]), item: str(x[2]), qty: num(x[3]), weight: num(x[4]), amount: num(x[5]) })));
    const miss = data.filter((x) => num(x[4]) == null && num(x[5]) == null).length;
    if (miss) issues.push({ tab: "Silver", message: `${miss} silver row(s) have neither weight nor ₹ amount` });
    checks.push({ tab: "Silver", label: "Silver pieces", sheet: num(r[1]?.[3]), computed: sum(data.map((x) => num(x[3]))), unit: "pcs" });
    checks.push({ tab: "Silver", label: "Silver weight", sheet: num(r[1]?.[4]), computed: sum(data.map((x) => num(x[4]))), unit: "g" });
    checks.push({ tab: "Silver", label: "Silver MRP value", sheet: num(r[1]?.[5]), computed: sum(data.map((x) => num(x[5]))), unit: "₹" });
  });

  tab("Non-RSJ", (r, data) => {
    data.forEach((x) => entries.push(e({ kind: "non_rsj", entry_date: ymd(x[0] as Date), shop: str(x[1]), item: str(x[2]), type: str(x[3]), weight: num(x[4]) })));
    checks.push({ tab: "Non-RSJ", label: "Other-shop gold weight", sheet: num(r[0]?.[4]), computed: sum(data.map((x) => num(x[4]))), unit: "g" });
  });

  tab("Old IN", (r, data) => {
    data.forEach((x) => entries.push(e({ kind: "old_in", entry_date: ymd(x[0] as Date), weight: num(x[1]), weight2: num(x[2]) })));
    checks.push({ tab: "Old IN", label: "Old gold in", sheet: num(r[0]?.[1]), computed: sum(data.map((x) => num(x[1]))), unit: "g" });
    checks.push({ tab: "Old IN", label: "Old silver in", sheet: num(r[0]?.[2]), computed: sum(data.map((x) => num(x[2]))), unit: "g" });
  });

  tab("Order", (r, data) => {
    data.forEach((x) => entries.push(e({ kind: "order", entry_date: ymd(x[0] as Date), shop: str(x[1]), item: str(x[2]), type: str(x[3]), weight: num(x[4]), weight2: num(x[5]), amount: num(x[7]) })));
    const noName = data.filter((x) => !str(x[1])).length;
    if (noName) issues.push({ tab: "Order", message: `${noName} order(s) have no customer name` });
    checks.push({ tab: "Order", label: "Order weight", sheet: num(r[0]?.[4]), computed: sum(data.map((x) => num(x[4]))), unit: "g" });
  });

  tab("Selavu", (r, data) => {
    data.forEach((x) => entries.push(e({ kind: "expense", entry_date: ymd(x[0] as Date), item: str(x[1]), type: str(x[2]), amount: num(x[3]) })));
    const noName = data.filter((x) => !str(x[1])).length;
    if (noName) issues.push({ tab: "Selavu", message: `${noName} expense row(s) have no name` });
    checks.push({ tab: "Selavu", label: "Expenses", sheet: num(r[0]?.[3]), computed: sum(data.map((x) => num(x[3]))), unit: "₹" });
  });

  const month = monthFrom(fileName, allDates);
  const mKey = month.slice(0, 7);
  const outside = entries.filter((x) => x.entry_date && x.entry_date.slice(0, 7) !== mKey);
  if (outside.length) {
    const byTab = new Map<string, number>();
    outside.forEach((x) => byTab.set(x.kind, (byTab.get(x.kind) ?? 0) + 1));
    byTab.forEach((n, k) => issues.push({ tab: KIND_TAB[k as LegacyKind], message: `${n} row(s) dated outside ${mKey}` }));
  }

  const of = (k: LegacyKind, f: keyof LegacyEntry) => sum(entries.filter((x) => x.kind === k).map((x) => x[f] as number | null));
  const totals = {
    gold_rsj_g: of("gold_sale", "weight"),
    gold_non_rsj_g: of("non_rsj", "weight"),
    gold_order_g: of("order", "weight"),
    silver_g: of("silver_sale", "weight"),
    silver_mrp: of("silver_sale", "amount"),
    old_gold_g: of("old_in", "weight"),
    old_silver_g: of("old_in", "weight2"),
    expenses: of("expense", "amount"),
    orders: entries.filter((x) => x.kind === "order").length,
  };
  const goldAll = sum([totals.gold_rsj_g, totals.gold_non_rsj_g, totals.gold_order_g]);

  const rsj = rows(wb, "RSJ");
  if (rsj) {
    for (const x of rsj) {
      const i = x.findIndex((c) => typeof c === "string" && c.trim().toUpperCase() === "GOLD TOTAL");
      if (i >= 0) checks.push({ tab: "RSJ", label: "GOLD TOTAL (RSJ + Non-RSJ + Order)", sheet: num(x[i + 1]), computed: goldAll, unit: "g" });
    }
  }

  const last = rows(wb, "Last 12 months");
  const mName = MONTHS[Number(month.slice(5, 7)) - 1];
  const lr = last?.find((x) => typeof x[0] === "string" && x[0].trim().toLowerCase().startsWith(mName));
  if (lr) {
    checks.push({ tab: "Last 12 months", label: "Gold for this month", sheet: num(lr[1]), computed: goldAll, unit: "g" });
    checks.push({ tab: "Last 12 months", label: "Silver for this month", sheet: num(lr[2]), computed: totals.silver_g, unit: "g" });
    if (num(lr[3]) != null) checks.push({ tab: "Last 12 months", label: "Silver MRP for this month", sheet: num(lr[3]), computed: totals.silver_mrp, unit: "₹" });
  }

  return { month, entries, checks, issues, totals };
}

const KIND_TAB: Record<LegacyKind, string> = {
  gold_sale: "RSJ", silver_sale: "Silver", non_rsj: "Non-RSJ", old_in: "Old IN", order: "Order", expense: "Selavu",
};

export function isMismatch(c: Check) {
  if (c.sheet == null) return false;
  return Math.abs(c.sheet - c.computed) > (c.unit === "₹" ? 1 : 0.01);
}
