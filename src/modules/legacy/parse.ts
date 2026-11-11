import * as XLSX from "xlsx";
import { cleanItem } from "./items";

export type LegacyKind = "gold_sale" | "silver_sale" | "non_rsj" | "old_in" | "order" | "expense";

export type LegacyEntry = {
  kind: LegacyKind;
  entry_date: string | null;
  shop: string | null;
  item: string | null;
  item_raw: string | null;
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
// SheetJS dates can land a few seconds before local midnight; shift to midday before taking the day
const ymd = (raw: Date) => {
  const d = new Date(raw.getTime() + 12 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isDate = (v: unknown): v is Date => v instanceof Date && !isNaN(v.getTime());
const sum = (xs: (number | null)[]) => Math.round(xs.reduce<number>((s, x) => s + (x ?? 0), 0) * 1000) / 1000;

function rows(wb: XLSX.WorkBook, name: string): Row[] | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const want = norm(name);
  const key = wb.SheetNames.find((n) => norm(n) === want) ?? (want === "nonrsj" ? wb.SheetNames.find((n) => norm(n) === "gnonrsj") : undefined);
  if (!key) return null;
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[key], { header: 1, raw: true, defval: null });
}

function countNA(r: Row[]) {
  return r.reduce<number>((n, x) => n + x.filter((c) => typeof c === "string" && c.trim() === "#N/A").length, 0);
}

function monthFrom(fileName: string, dates: Date[]): string {
  const m = fileName.toLowerCase().match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_-]*(\d{4})?/);
  if (m) {
    let year = m[2];
    if (!year) {
      const yc = new Map<string, number>();
      dates.forEach((d) => { const y = ymd(d).slice(0, 4); yc.set(y, (yc.get(y) ?? 0) + 1); });
      year = [...yc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    }
    if (year) return `${year}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-01`;
  }
  const counts = new Map<string, number>();
  dates.forEach((d) => { const k = ymd(d).slice(0, 7); counts.set(k, (counts.get(k) ?? 0) + 1); });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) throw new Error("Could not find the month from file name or dates");
  return `${top[0]}-01`;
}

const HEADER_WORDS = new Set(["date", "item", "shop", "type", "weight", "quantity", "quanity", "old gold", "old silver", "customer", "name", "amount"]);

type Cols = { col: (...names: string[]) => number; nth: (n: number, ...names: string[]) => number; total: (c: number) => number | null };

export function parseLegacyFile(buf: ArrayBuffer, fileName: string): ParsedFile {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const entries: LegacyEntry[] = [];
  const checks: Check[] = [];
  const issues: Issue[] = [];
  const e = (p: Partial<LegacyEntry> & { kind: LegacyKind }): LegacyEntry =>
    ({ entry_date: null, shop: null, item: null, item_raw: null, type: null, qty: null, weight: null, weight2: null, amount: null, ...p });
  const at = (x: Row, c: number) => (c < 0 ? null : x[c]);
  const sumCol = (data: Row[], c: number) => sum(data.map((x) => num(at(x, c))));

  // Columns are found by header name, because the sheet layout changed over time (Shop column in RSJ, ₹ columns in Old IN, etc.)
  const realDates: Date[] = [];
  for (const n of wb.SheetNames) {
    for (const x of XLSX.utils.sheet_to_json<Row>(wb.Sheets[n], { header: 1, raw: true, defval: null })) if (isDate(x[0])) realDates.push(x[0]);
  }
  const month = monthFrom(fileName, realDates);
  const fileYear = Number(month.slice(0, 4));
  // Text dates like "13/4" or "13/4/2024" are day/month
  const toDate = (v: unknown): Date | null => {
    if (isDate(v)) return v;
    const m = typeof v === "string" ? v.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/) : null;
    if (!m) return null;
    const d = Number(m[1]), mo = Number(m[2]), y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : fileYear;
    return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 ? new Date(y, mo - 1, d) : null;
  };

  const tab = (name: string, fn: (data: Row[], c: Cols) => void, optional = false) => {
    const r = rows(wb, name);
    if (!r) { if (!optional) issues.push({ tab: name, message: "Tab not found in file" }); return; }
    const h = r.slice(0, 3).findIndex((x) => x.filter((c) => HEADER_WORDS.has(str(c)?.toLowerCase() ?? "")).length >= 2);
    const hi = h < 0 ? 1 : h;
    const head = (r[hi] ?? []).map((x) => str(x)?.toLowerCase() ?? "");
    const totalRow = r[hi === 1 ? 0 : 1] ?? [];
    const nth = (n: number, ...names: string[]) => head.map((x, i) => (names.includes(x) ? i : -1)).filter((i) => i >= 0)[n] ?? -1;
    const cols: Cols = { col: (...names) => nth(0, ...names), nth, total: (c) => (c < 0 ? null : num(totalRow[c])) };
    const data = r.slice(hi + 1).map((x) => { const d = toDate(x[0]); return d ? [d, ...x.slice(1)] : null; }).filter((x): x is Row => x != null);
    const na = countNA(r);
    if (na) issues.push({ tab: name, message: `${na} cell(s) show #N/A (broken formula)` });
    fn(data, cols);
  };

  let rsjHasShop = false;
  tab("RSJ", (data, c) => {
    const shop = c.col("shop"), item = c.col("item"), type = c.col("type"), qty = c.col("quantity"), wt = c.col("weight");
    rsjHasShop = shop >= 0;
    data.forEach((x) => {
      const s = str(at(x, shop));
      entries.push(e({
        kind: s && s.toUpperCase() !== "RSJ" ? "non_rsj" : "gold_sale",
        entry_date: ymd(x[0] as Date), shop: s, item: cleanItem(str(at(x, item))), item_raw: str(at(x, item)), type: str(at(x, type)), qty: num(at(x, qty)), weight: num(at(x, wt)),
      }));
    });
    const miss = data.filter((x) => num(at(x, wt)) == null).length;
    if (miss) issues.push({ tab: "RSJ", message: `${miss} gold sale row(s) have no weight` });
    checks.push({ tab: "RSJ", label: "Gold pieces", sheet: c.total(qty), computed: sumCol(data, qty), unit: "pcs" });
    checks.push({ tab: "RSJ", label: rsjHasShop ? "Gold weight (all shops)" : "Gold weight", sheet: c.total(wt), computed: sumCol(data, wt), unit: "g" });
  });

  tab("Silver", (data, c) => {
    const shop = c.col("shop"), item = c.col("item"), qty = c.col("quantity", "quanity"), wt = c.col("weight"), rs = c.col("rs");
    data.forEach((x) => entries.push(e({
      kind: "silver_sale", entry_date: ymd(x[0] as Date), shop: str(at(x, shop)), item: cleanItem(str(at(x, item))), item_raw: str(at(x, item)), qty: num(at(x, qty)), weight: num(at(x, wt)), amount: num(at(x, rs)),
    })));
    const miss = data.filter((x) => num(at(x, wt)) == null && num(at(x, rs)) == null).length;
    if (miss) issues.push({ tab: "Silver", message: `${miss} silver row(s) have neither weight nor ₹ amount` });
    checks.push({ tab: "Silver", label: "Silver pieces", sheet: c.total(qty), computed: sumCol(data, qty), unit: "pcs" });
    checks.push({ tab: "Silver", label: "Silver weight", sheet: c.total(wt), computed: sumCol(data, wt), unit: "g" });
    checks.push({ tab: "Silver", label: "Silver MRP value", sheet: c.total(rs), computed: sumCol(data, rs), unit: "₹" });
  });

  tab("Non-RSJ", (data, c) => {
    const shop = c.col("shop"), item = c.col("item"), type = c.col("type"), wt = c.col("weight");
    data.forEach((x) => entries.push(e({
      kind: "non_rsj", entry_date: ymd(x[0] as Date), shop: str(at(x, shop)), item: cleanItem(str(at(x, item))), item_raw: str(at(x, item)), type: str(at(x, type)), weight: num(at(x, wt)),
    })));
    if (data.length || !rsjHasShop) checks.push({ tab: "Non-RSJ", label: "Other-shop gold weight", sheet: c.total(wt), computed: sumCol(data, wt), unit: "g" });
  }, rsjHasShop);

  tab("Old IN", (data, c) => {
    const g = c.col("old gold"), s = c.col("old silver"), gRs = c.nth(0, "rs");
    data.forEach((x) => entries.push(e({ kind: "old_in", entry_date: ymd(x[0] as Date), weight: num(at(x, g)), weight2: num(at(x, s)), amount: num(at(x, gRs)) })));
    checks.push({ tab: "Old IN", label: "Old gold in", sheet: c.total(g), computed: sumCol(data, g), unit: "g" });
    checks.push({ tab: "Old IN", label: "Old silver in", sheet: c.total(s), computed: sumCol(data, s), unit: "g" });
    if (gRs >= 0) checks.push({ tab: "Old IN", label: "Old gold paid", sheet: c.total(gRs), computed: sumCol(data, gRs), unit: "₹" });
  });

  tab("Order", (data, c) => {
    const cust = c.col("customer"), item = c.col("item"), metal = c.col("metal"), ow = c.col("order weight"), dw = c.col("delivery weight"), amt = c.col("amount");
    data.forEach((x) => entries.push(e({
      kind: "order", entry_date: ymd(x[0] as Date), shop: str(at(x, cust)), item: str(at(x, item)), type: str(at(x, metal)),
      weight: num(at(x, ow)), weight2: num(at(x, dw)), amount: num(at(x, amt)),
    })));
    const noName = data.filter((x) => !str(at(x, cust))).length;
    if (noName) issues.push({ tab: "Order", message: `${noName} order(s) have no customer name` });
    checks.push({ tab: "Order", label: "Order weight", sheet: c.total(ow), computed: sumCol(data, ow), unit: "g" });
  });

  tab("Selavu", (data, c) => {
    const name = c.col("name"), type = c.col("type"), amt = c.col("amount");
    data.forEach((x) => entries.push(e({ kind: "expense", entry_date: ymd(x[0] as Date), item: str(at(x, name)), type: str(at(x, type)), amount: num(at(x, amt)) })));
    const noName = data.filter((x) => !str(at(x, name))).length;
    if (noName) issues.push({ tab: "Selavu", message: `${noName} expense row(s) have no name` });
    checks.push({ tab: "Selavu", label: "Expenses", sheet: c.total(amt), computed: sumCol(data, amt), unit: "₹" });
  });

  const mKey = month.slice(0, 7);
  const [fy, fm] = mKey.split("-");
  const fixed = new Map<string, number>(), outside = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const x of entries) {
    if (!x.entry_date || x.entry_date.slice(0, 7) === mKey) continue;
    const [y, m, d] = x.entry_date.split("-");
    const t = KIND_TAB[x.kind];
    if (d === fm && Number(m) <= 28 && y === fy) { x.entry_date = `${fy}-${fm}-${m}`; bump(fixed, `${t}: day/month swapped`); }
    else if (m === fm && y !== fy) { x.entry_date = `${fy}-${fm}-${d}`; bump(fixed, `${t}: wrong year`); }
    else bump(outside, t);
  }
  fixed.forEach((n, k) => { const [t, why] = k.split(": "); issues.push({ tab: t, message: `${n} date(s) auto-corrected (${why})` }); });
  outside.forEach((n, t) => issues.push({ tab: t, message: `${n} row(s) dated outside ${mKey}` }));

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
  for (const x of rsj ?? []) {
    const i = x.findIndex((c) => typeof c === "string" && c.trim().toUpperCase() === "GOLD TOTAL");
    if (i >= 0) checks.push({ tab: "RSJ", label: "GOLD TOTAL (RSJ + Non-RSJ + Order)", sheet: num(x[i + 1]), computed: goldAll, unit: "g" });
  }

  const fyStart = Number(month.slice(5, 7)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1;
  const lastName = wb.SheetNames.find((n) => /last 12 months|^\s*\d{4}\s*-\s*\d{4}\s*$/i.test(n));
  const last = lastName ? rows(wb, lastName) : null;
  const hi = last ? last.findIndex((x) => str(x[0])?.toLowerCase() === "month") : -1;
  const head = last && hi >= 0 ? last[hi].map((x) => str(x)?.toLowerCase() ?? "") : [];
  const tabYear = lastName?.match(/(\d{4})\s*-\s*\d{4}/)?.[1];
  const sameFy = head.some((x) => x.includes(String(fyStart))) || !tabYear || Number(tabYear) === fyStart;
  if (last && lastName && hi >= 0 && sameFy) {
    const pick = (re: RegExp, not: RegExp) => {
      const idx = head.map((h, i) => (re.test(h) && !not.test(h) ? i : -1)).filter((i) => i >= 0);
      return idx.find((i) => head[i].includes(String(fyStart))) ?? (idx.length === 1 ? idx[0] : -1);
    };
    const gc = pick(/gold/, /old gold|amount/), sc = pick(/silver/, /old silver|mrp|amount/), mc = pick(/mrp/, /amount/);
    const mName = MONTHS[Number(month.slice(5, 7)) - 1];
    const lr = last.slice(hi + 1).find((x) => typeof x[0] === "string" && x[0].trim().toLowerCase().startsWith(mName));
    if (lr) {
      if (gc >= 0 && num(lr[gc]) != null) checks.push({ tab: lastName, label: "Gold for this month", sheet: num(lr[gc]), computed: goldAll, unit: "g" });
      if (sc >= 0 && num(lr[sc]) != null) checks.push({ tab: lastName, label: "Silver for this month", sheet: num(lr[sc]), computed: totals.silver_g, unit: "g" });
      if (mc >= 0 && num(lr[mc]) != null) checks.push({ tab: lastName, label: "Silver MRP for this month", sheet: num(lr[mc]), computed: totals.silver_mrp, unit: "₹" });
    }
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
