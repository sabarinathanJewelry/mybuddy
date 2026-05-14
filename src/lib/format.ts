export function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function grams(n: number, frac = 3): string {
  return `${n.toFixed(frac)}g`;
}

export function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function purityToFraction(p: number): number {
  return p / 100;
}

export function pureWeight(weight: number, purityPct: number): number {
  return weight * (purityPct / 100);
}

export function shortDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
