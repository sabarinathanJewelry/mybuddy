# MyBuddy — Jewellery ERP · Claude Code Context

## Project Overview
A Next.js 15 jewellery shop ERP for Sabarinathan Jewellery. Tracks sales, customers, suppliers, inventory, loans, chit savings, orders, and expenses. Backend is Supabase (Postgres + Auth).

## Tech Stack
- **Framework**: Next.js 15 App Router, TypeScript strict mode
- **Database**: Supabase (`@supabase/ssr`) — singleton via `supabase()` from `@/lib/supabase/client`
- **State / Data fetching**: TanStack Query v5 (`useQuery`, `useMutation`, `useQueryClient`)
- **Styling**: Tailwind CSS with custom tokens (`text-gold`, `text-err`, `text-ok`, `text-info`, `text-warn`, `text-ink`, `text-ink-dim`, `bg-canvas`, `border-line`, `rounded-lg2`, `shadow-soft`)
- **i18n**: `useT()` from `@/i18n` for labels
- **Formatting**: `inr()`, `grams()`, `shortDate()` from `@/lib/format`

## Repository Structure
```
app/(app)/          — All authenticated pages (one folder per feature)
src/modules/        — Reusable hooks + API functions per domain
db/migrations/      — Numbered SQL migration files (run in Supabase SQL Editor)
lib/                — Supabase client, formatters, sales-calc helpers
```

## Key Domain Knowledge

### Customer Balance Formula
`balance = opening_balance - total_sales + payments_in - payments_out + writeoffs`
- **Negative balance** = customer owes the company
- **Positive balance** = customer has advance credit with the company
- Computed by the `customer_balances` Postgres view (migration 023)

### "Scrap" means Bad-Debt Write-off
"Scrap" in the customer context = **balance write-off** (bad debt), NOT physical metal scrap. The scrap_entries table records unrecoverable customer balances being written off. Always label it "Balance Write-off" in the UI, not "Scrap".

### Metal Types
- Gold: `gold_22k`, `gold_18k`, `gold_24k`
- Silver: `silver`, `silver_pure`
- Silver MPR (fixed-price MRP items): `silver_mpr` — value entry, no weight-based calc, GST always inclusive

### GST Logic
- GST is **inclusive** — when gst_enabled=true, the entered amount already includes GST
- Extraction: `gst = total * 3/103`, `base = total * 100/103`
- Silver MPR items auto-set gst_included=true
- GST rate: 3% for jewellery

### Advance Payments
When a customer pays in advance (cash/bank deposit), that records as `payments.direction='in'`.
When they use that advance in a sale (`mode='advance'`), NO new payments entry is created — the credit is already on the books. This was a bug that was fixed: `src/modules/sales/api.ts` checks `p.mode !== "advance"` (not `!p.is_advance`).

### Financial Year
FY runs April–March. `fyForDate()` from `@/lib/fy` returns the FY string. Bill numbers are FY-series-sequential.

## Pending Migrations (Run in Supabase SQL Editor)
1. **023** — `db/migrations/023_customer_balance_view.sql` — creates `customer_balances` view
2. **024** — `db/migrations/024_cleanup_advance_double_entries.sql` — deletes advance double-count entries from `payments` table (fixes inflated customer balances)

## Recent Features (last session)
- **Customer Balances tab** — Customers page, "Balance" tab showing who owes and who has credit
- **Supplier edit** — Edit opening balance (₹ + gold g + silver g) from list and detail page
- **Loan repayments** — Principal repayment form with segment-based interest recalculation
- **Orders fix** — Removed all Supabase foreign table joins from `useOrders`; lazy-load payments with `useOrderPayments(orderId)` only when a row is expanded
- **Chit payment edit** — Edit button per row to correct wrong amount; recalculates grams using stored board_rate
- **Reports** — New "Product Mix" tab (items by description per metal) and "Expenses by Category" tab
- **Sales advance bug fixed** — `src/modules/sales/api.ts` line ~51

## Common Patterns

### Supabase client
```typescript
import { supabase } from "@/lib/supabase/client";
const client = supabase(); // always call as function
```

### Avoid joins that can fail silently
Supabase foreign table joins fail the entire query if the FK row is missing. For main list queries use minimal selects. For detail views (360 pages) lazy-load related data separately.

### Mutation + cache invalidation
```typescript
const qc = useQueryClient();
useMutation({
  mutationFn: async (...) => { ... },
  onSuccess: () => qc.invalidateQueries({ queryKey: ["key"] }),
});
```

### Input class
```typescript
const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
```

## User Preferences
- Responses should be short and direct
- No unnecessary comments in code
- No emoji in code or UI unless already present
- Prefer editing existing files over creating new ones
- Don't add abstractions beyond what the task requires
