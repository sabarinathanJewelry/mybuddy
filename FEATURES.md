# MyBuddy ERP — Feature Document

> Sabarinathan Jewellery ERP System  
> Last updated: 2026-06-27

---

## Core Domain

### Customers
- Customer list with search, balance summary tabs (who owes / who has credit)
- Customer detail (360 view): sale history, payments, balance timeline
- Opening balance management
- Balance write-off (bad debt) — recorded as scrap_entries, shown as "Balance Write-off"
- Customer balance formula: `opening_balance − total_sales + payments_in − payments_out + writeoffs`

### Sales
- Multi-item sale entry (Gold 22K / 18K / 24K / Silver / Diamond series)
- Per-item: gross weight, stone weight, net weight, purity, rate, VA%, making amount, stone value, diamond (carats or direct amount)
- GST: 3% inclusive — extraction: `gst = total × 3/103`
- Silver MPR mode: value entry, no weight-based calc, GST always inclusive
- Advance payment mode: uses existing credit — no duplicate payment entry
- Exchange sale type with old gold/silver return routing (good/damaged)
- Salesperson 1 + Salesperson 2 + Marketing staff attribution per bill (70/30 split)
- Bill numbers: series-FY-sequential (e.g. G22/2026-27/0042)
- Old gold/silver exchange handled as payment modes
- Chit metal / chit bonus payment modes
- Sale edit with full re-computation
- Product group search shows cross-metal matches when query has no same-metal results (with metal badge + auto-switches metal on select)
- Partner account routing for UPI/bank receipts

### Orders
- Order entry with advance payment tracking
- Delivery → auto-converts to sale (copies order_payments to payments table)
- Late payment to already-delivered orders: syncs to converted sale's payments
- Order cancellation auto-refunds advance payments back to customer balance (usable on other orders)
- Diamond order items (Other / Diamond metal): diamond weight (ct + cents helper), diamond value ₹, certificate amount ₹ — auto-sums to Est. Amount
- Status flow: pending → confirmed → ready → delivered / cancelled

### Payments
- Direction: `in` (customer pays) / `out` (refund/transfer)
- Linked to sales or standalone
- Payment modes: cash, UPI, bank, old gold, old silver, advance, chit_metal, chit_bonus

### Suppliers
- Supplier list with search
- Edit opening balance (₹ + gold g + silver g)
- Supplier detail: purchase history, payments
- Suspense tab: set cash bill amount + record partial payment in one step; balance shown live; Metal VA% optional alongside
- Suspense tab: multi-select items with checkboxes → batch settle with total gross, total pure wt, average purity summary + one combined cash payment
- Suspense cash amounts flow into supplier Cash Balance (formula includes supplier_cash_amt; ledger shows suspense entries chronologically)

---

## Financial Modules

### Loans
- Loan entry with principal, interest rate, duration
- Segment-based interest recalculation on partial repayment
- Loan repayment form with running balance

### Chit Savings
- Cash chit: monthly payment tracking
- Gold chit: weight-based with board_rate at payment time
- Chit payment edit (corrects wrong amount, recalculates grams)
- Chit payment delete (reverses grams from customer balance + clears ledger entries)
- Chit bonus payments

### Expenses
- Expense entry by category
- Reports: Expenses by Category tab

### Investments & AV Income
- Investment tracking
- Additional/variable income entry

### Refinery / Metal Flow
- Refinery entry for metal sent out and received
- Metal flow tracking

### Bullion
- Bullion purchase/sale tracking

### Ledger
- General ledger view

### Cash Bonus
- Cash bonus management

---

## Inventory

### Products
- Product master with categories and metal types
- Used in sale item autocomplete

### Kolusu (Anklet Stock)
- Kolusu stock management
- Kolusu sale module (staff-accessible)
- Exchange return routing to kolusu stock when condition = good

### Goldsmith
- Goldsmith job tracking

---

## Attendance & HR

### Attendance (Admin)
- Smart home card grid (12 cards) for admin on `/attendance`
- Daily attendance view: all staff with punch times, late flag, hours worked
- Monthly attendance summary: present days, late days, OT, leaves, deductions
- Kiosk mode with bio-user sequence lock
- Shop late-opening exceptions (shop_exceptions table)

### Attendance (Staff)
- Smart home view: card grid for staff on `/my-attendance`
- Today tab: clock-in/out times, hours worked, lunch duration
- Monthly tab: personal attendance history
- Back to home from any tab without switching to classic mode

### Requests (Staff)
- Late permission requests (bio-user linked)
- Leave requests (annual, sick, personal)
- Outside duty requests
- Week-off requests

### Leave Management (Admin)
- Approve/reject leave requests
- Approved leave count per month
- Week-off schedule management

### KYC
- Staff KYC document upload and verification
- Admin verification with status update

### Payroll
- Monthly payroll sheet: salary, deductions, advances
- Staff advances management

### Staff Incentives (ERP-based)
- Paste ERP export text → parse → match to product master → calculate per-item incentive
- Product mapper: ERP product name → incentive code
- Master rate table: incentive code → ₹/gram rate + minimum VA%
- Split: SP1 gets configurable % (default 70%), SP2 gets rest
- Saved sheets (`incentive_sheets` table) with overrides per row
- Staff view (`/my-incentive`): read-only personal incentive breakdown

---

## KPI Dashboard *(New)*

### Admin KPI (`/admin/kpi`)
- Month navigation (any past/future month)
- Per-staff table:
  - SP1 bills | SP2 bills
  - Sales ₹ weighted (SP1=70%, SP2=30%)
  - Net weight sold (weighted)
  - Incentive earned (auto from product master, no ERP paste needed)
  - Attendance %
  - Late days (red if > 3)
  - Monthly weight target (admin sets inline, stored in `kpi_targets`)
  - Achievement % (net wt sold / weight target) with colour badge
- Expandable row: bill-by-bill breakdown with role, share, amount, incentive
- Summary bar: total bills, total weight, total incentive, targets set count

### Staff KPI (`/my-kpi`)
- Staff sees own monthly KPI
- Summary cards: bills (SP1+SP2), weighted ₹, net weight, incentive earned
- Attendance card: present %, present days / work days
- Target progress bar: actual grams vs target grams with % label
- Bill-by-bill breakdown: role (SP1/SP2), share %, amount, incentive
- Toggle: show all bills / show only incentive-eligible

---

## Recruitment

### Job Positions (`/admin/careers` → Positions tab)
- Admin creates multiple positions (name, description, slug auto-generated)
- Each position gets a unique shareable apply link: `/apply/[slug]`
- Toggle position open/closed

### Job Applications
- Public form at `/apply` → lists open positions
- Position-specific form at `/apply/[slug]` — 25 questions across 6 sections
- Applications tab: filter by position + status, full answer expansion
- Status workflow: new → reviewed → shortlisted → called → hired / rejected
- Admin notes per applicant

---

## Communication & Tools

### Chat
- Staff-to-admin messaging (in-app)
- Chat moderation for admin

### Notices / Announcements
- Admin posts notices visible to all staff

### Tasks
- Admin assigns tasks to staff
- "Myself (Admin)" option in Assign To dropdown when admin has a bio_user_id (self-assigned tasks)
- Staff marks complete, admin can reopen
- Time-based reminder banner: shows in Tasks tab at morning (7–11am), mid-day (12–3pm), and evening (5–9pm) when admin has pending self-assigned tasks; dismissed per time-window via localStorage; optionally prompts for browser desktop notification permission
- Same reminder banner shown to staff in their My Tasks tab (/my-attendance) when admin-assigned tasks are pending — same 3-window schedule, dismiss per window, optional desktop notification

### Google Review
- "Write a Review" prompt card in staff smart home and admin attendance view
- Overlay with Google review link

### SOP / Policies
- Admin uploads SOPs and policy documents
- Staff read-only access

### Social
- Social media links/contacts page

---

## Reports

- Daily Sheet: date-wise sales summary
- Product Mix: items by description per metal type
- Expenses by Category: monthly expense breakdown
- Metal Flow reports
- Sales Breakdown: grams and revenue split by source — Ready Stock (shelf inventory) / Order Delivery (converted from orders) / From Suspense (supplier suspense items); shown per metal (gold/silver) with gross wt, net wt, item count, and revenue per bucket

## Analytics Dashboard (`/admin/analytics`)

4-tab business intelligence dashboard with SVG charts (no external chart library):

- **Overview**: Today's bills + revenue, month revenue vs last month (donut), 8-month revenue trend (smooth bezier line chart), recent transactions table, payment method mix (donut)
- **Sales Analysis**: Month selector, per-metal revenue/weight/count cards, daily sales line chart, top customers bar chart
- **Inventory**: Gold and Silver source mix donuts separately (Ready Stock / Order Delivery / From Suspense per metal), KPI cards per source, top products table by revenue
- **Deep Analytics**: Month revenue / GST collected / expenses KPI cards, today's top 5 sales, expense breakdown by category, metal performance summary grid, 8-month supplier payments table (bank/UPI vs old-gold cut-rate with weight), 8-month weighted-average sale rate table (Gold 22K / 18K / Silver ₹/g), Purchase vs Sales Profit Analysis: metal weight bought vs sold (gold + silver gross/pure/net), waterfall P&L showing revenue excl GST → bank payments → cut-rate old gold → Gross Profit (GP%) → expenses → Net Profit (NP%)

---

## Administration

### Users & Access
- Profile management (display name, role, access flags)
- Access flags: `repair_access`, `incentive_access`, `kolusu_access`
- Role: `admin` / `staff`

### Two-Factor Authentication (2FA)
- TOTP-based (Google Authenticator-style rotating 6-digit codes, 30s window)
- Admin enables 2FA at `/admin/security` — secret stored in `user_totp` table
- After password login, users with 2FA enabled are redirected to `/verify-otp`
- `/my-security-code` page shows the current rotating code (requires prior MFA verification)
- Admin opens MyBuddy on their phone → taps Security Code → reads the 6-digit code → types it on the new device
- Setup device (phone) permanently trusted via 1-year `mfa_verified` cookie (`trust: true` sent during setup)
- PC logins get a session-only cookie (no `maxAge`) — cleared when browser closes, TOTP asked every login
- `app_metadata.mfa_enabled` flag (service-role only) gated in middleware — no DB query per request
- Staff (game-login users) are exempt from 2FA

### Supplier Ledger Import (`/admin/supplier-ledger`)
- Select supplier, paste Tally ledger export (tab or comma delimited, auto-detected)
- Parses PAYMENT and RETAIL PURCHASE / SALE BILL rows; skips OB, Total, CB rows
- Payments tab: matches each Tally payment against MyBuddy `supplier_payments` by date + amount (±0.5); shows Matched / Not in MyBuddy; "Add Entry" creates a bank-mode `supplier_payments` record in one click
- Purchases tab: enter rate per gram → auto-computes gross weight; select metal type (22K/18K/24K/silver); "Add" creates a `supplier_purchases` record with computed weight and purity
- Summary row per tab: total count, matched/added count, total amount

### Bank Reconciliation (`/admin/bank-recon`)
- Upload bank statement CSV for any month (auto-detects HDFC, SBI, ICICI, Axis, Kotak formats; handles BOM, tabs, date variants)
- Matches each bank entry against MyBuddy customer payments and supplier payments (bank/UPI mode only)
- Match types: Exact (single payment = bank amount), Group (multiple UPI payments sum to bank amount), Partial (entries exist but amount differs), No match
- Ignore button per entry — for UPI batches, personal transfers, or bank fees that don't need a MyBuddy entry
- Summary: Total / Matched / Unmatched / Ignored counts; Bank vs MyBuddy credit/debit comparison
- Filter: All | Unmatched | Ignored tabs
- Statement persists in DB (`bank_statements` + `bank_statement_entries` tables); upload replaces previous month's data

### Board Rate
- Daily gold/silver rate entry
- Used in all sale calculations
- Market Rate Comparison: "Fetch Rates" button pulls live Madurai gold rates (22K/24K) and silver ₹/g from goodreturns.in via a server-side API route (`/api/market-rates`); compares last 10 days against your stored rates; highlights Match / diff / Missing; "Use" / "Update" loads market rate into edit form (18K auto-set to 75% of 24K) — review and save to apply

### Walk-ins
- Walk-in customer log

---

## Infrastructure

### i18n
- English and Tamil (தமிழ்) dictionaries
- `useT()` hook for all labels

### Financial Year
- April–March FY cycle
- `fyForDate()` utility
- Bill numbers are FY-series-sequential

### Supabase
- Postgres + Auth via `@supabase/ssr`
- Row-Level Security on all tables
- Singleton client via `supabase()` from `@/lib/supabase/client`
- Migrations numbered sequentially in `db/migrations/`

### Tech Stack
- Next.js 15 App Router (TypeScript strict)
- TanStack Query v5 for data fetching/caching
- Tailwind CSS with custom design tokens
- Zustand for global state (board rate, auth, kiosk)
- Vitest for unit testing (`npm test`)

---

## Pending Migrations (run in Supabase SQL Editor)

| Migration | File | Description |
|-----------|------|-------------|
| 023 | `023_customer_balance_view.sql` | `customer_balances` view |
| 024 | `024_cleanup_advance_double_entries.sql` | Fix inflated balances |
| 107 | `107_weekoff_rls_allow_resubmit.sql` | Week-off resubmission |
| 108 | `108_job_applications.sql` | Job applications table |
| 109 | `109_job_positions.sql` | Job positions table + seed |
| 110 | `110_kpi_targets.sql` | KPI weight targets table |
| 111 | `111_kpi_weight_target.sql` | Rename sales_target → weight_target |
| 113 | `113_order_items_diamond_fields.sql` | Add diamond_wt, diamond_amt, certificate_amt to order_items |
| 114 | `114_suspense_cash_amount.sql` | Add supplier_cash_amt to sale_items + recreate supplier_suspense view |
