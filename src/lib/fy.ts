export function fyForDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

export function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export function billNoFor(series: string, fy: string, n: number): string {
  return `${series}/${fy}/${String(n).padStart(4, "0")}`;
}
