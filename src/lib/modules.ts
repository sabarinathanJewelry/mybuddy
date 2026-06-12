// Module slugs match the route: /sales → "sales"
export type ModuleSlug =
  | "dashboard"
  | "board-rate" | "customers" | "sales" | "orders" | "suppliers"
  | "payments" | "daily-sheet" | "ledger" | "metal-flow" | "bullion"
  | "loans" | "expenses" | "writeoff" | "chits" | "gold-chit"
  | "cash-bonus" | "kolusu" | "walkins" | "reports" | "attendance"
  | "goldsmith" | "repairs" | "staff-management" | "refinery-entry" | "kolusu-sale";

export const MODULE_GROUPS: { group: string; items: { slug: ModuleSlug; label: string }[] }[] = [
  {
    group: "Finance",
    items: [
      { slug: "customers",   label: "Customers" },
      { slug: "sales",       label: "Sales" },
      { slug: "orders",      label: "Orders" },
      { slug: "payments",    label: "Payments" },
      { slug: "daily-sheet", label: "Daily Sheet" },
      { slug: "ledger",      label: "Ledger" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { slug: "board-rate",      label: "Board Rate" },
      { slug: "metal-flow",      label: "Metal Flow" },
      { slug: "refinery-entry",  label: "Refinery Entry" },
      { slug: "bullion",         label: "Bullion" },
      { slug: "suppliers",       label: "Suppliers" },
      { slug: "goldsmith",       label: "Goldsmith Jobs" },
    ],
  },
  {
    group: "Schemes",
    items: [
      { slug: "loans",       label: "Loans" },
      { slug: "chits",       label: "Chits" },
      { slug: "gold-chit",   label: "Gold Chit" },
      { slug: "cash-bonus",  label: "Cash Bonus" },
      { slug: "kolusu",      label: "Kolusu" },
      { slug: "kolusu-sale", label: "Kolusu Sale Entry" },
    ],
  },
  {
    group: "Operations",
    items: [
      { slug: "walkins",     label: "Walk-ins" },
      { slug: "expenses",    label: "Expenses" },
      { slug: "writeoff",    label: "Balance Write-off" },
      { slug: "reports",     label: "Reports" },
      { slug: "attendance",  label: "Attendance" },
      { slug: "repairs",     label: "Repairs" },
    ],
  },
  {
    group: "Staff",
    items: [
      { slug: "staff-management", label: "Staff Management" },
    ],
  },
];
