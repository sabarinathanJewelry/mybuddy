const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// Salary for a month is generated on the 3rd of the next month: "October 2026" → "3 Nov 2026"
export function payslipDate(period: string): string {
  const parts = period.trim().toLowerCase().split(/\s+/);
  const mi = MONTHS.findIndex((m) => m.startsWith(parts[0]?.slice(0, 3) ?? "-"));
  const y = parseInt(parts[parts.length - 1]);
  const d = mi >= 0 && !isNaN(y) ? new Date(y, mi + 1, 3) : new Date();
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function payslipLogo(): string {
  return `<img src="${window.location.origin}/payslip-logo.png" alt="Sabarinathan Jewellers" style="display:block;width:260px;max-width:100%;margin:0 auto 14px">`;
}
