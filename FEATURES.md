# MyBuddy ERP — Feature Document

> Sabarinathan Jewellery ERP System  
> Last updated: 2026-07-09

---

## Core Domain

### Customers
- Customer list with search, balance summary tabs (who owes / who has credit)
- Customer detail (360 view): sale history, payments, balance timeline
- Opening balance management
- Balance write-off (bad debt) — recorded as scrap_entries, shown as "Balance Write-off"
- Customer balance formula: `opening_balance − total_sales + payments_in − payments_out + writeoffs`

### Sales
- **Bill Return**: mark a sale as returned (status = 'returned') — automatically excluded from customer balance; returned bills shown with strikethrough + "Returned" badge; undo available; no ledger reversal (payments already made become advance credit on customer account)
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
- Suspense tab: set cash bill amount + record partial payment in one step; balance shown live; Metal VA% optional alongside; **Sold Touch** and **Cost Touch** columns — sold touch = purity_pct + va_pct (effective touch billed to customer including VA), cost touch = supplier_va_pct set at settlement (green when cost < sold = metal profit, orange when cost ≥ sold); migration 126 adds va_pct to supplier_suspense view
- Suspense tab: multi-select items with checkboxes → batch settle with total gross, total pure wt, average purity summary + one combined cash payment
- **Suspense → Purchase**: confirmed suspense items (VA% set) show "→ Purchase" button; clicking creates a `supplier_purchases` row (metal balance, pure wt = gross × VA%) and marks item as converted; converted items show "✓ In Purchases" badge and are excluded from metal owed calc; migration 123
- Suspense cash amounts flow into supplier Cash Balance (formula includes supplier_cash_amt; ledger shows suspense entries chronologically)
- **Dispatch Metal** button in Payments tab: creates a `metal_dispatches` row (date, metal, touch%, weight, pure wt preview) — flows into Metal Statement and reduces gold reserve exactly like the metal flow page; delete button per dispatch row
- **Cash → Metal** button in Payments tab: converts an outstanding cash balance to metal grams — enter ₹ amount + rate/g, system calculates grams = amount ÷ rate; saved as a `supplier_purchases` row (is_metal_balance=true) so the cash balance is credited and the equivalent grams are added to metal balance owed by supplier; description shows "Cash→Metal @ ₹X/g" in both ledgers; no migrations required
- **Stock Out tab**: record stock items given FROM shop TO supplier (outgoing consignment/suspense-out) — e.g. MJ takes 0.920g earring from shop stock and will pay later; each item has date, description, metal, touch % (purity, auto-set by metal), gross wt, pure wt (calculated), qty, rate (₹/g pure), amount; status: Pending → Returned / Settled; outstanding total shown; migrations 120, 122

---

## Financial Modules

### Loans
- Loan entry with principal, interest rate, duration
- Segment-based interest recalculation on partial repayment
- Loan repayment form with running balance

### Chit Savings
- Cash chit: monthly payment tracking
- Gold chit: weight-based with board_rate at payment time
- **Smart Gold Chit print**: "அச்சிடு" button per deposit row opens a Tamil receipt overlay — shop header (சபரிநாதன் நகைக்கடை), receipt number, date, customer name, metal, gross weight, purity, credited weight, notes, signature lines; "அச்சிடு / Print" triggers `window.print()` which hides all other content and prints only the receipt
- Chit payment edit (corrects wrong amount, recalculates grams); edit mode also lets you change the payment mode (Cash/UPI/Bank/Advance) — reverses the old mode's ledger entry (cash_ledger/bank_ledger delete, or an advance-credit reversal) and applies the new one at the (possibly also-updated) amount; disabled for "Split" entries since those span multiple modes
- Chit payment delete (reverses grams from customer balance + clears ledger entries)
- Chit bonus payments

### Expenses
- Expense entry by category (scalable — add any category: Staff Salary, Loan EMI, Bank Charges, Electricity, Courier, Hallmarking, etc.)
- Fields: date, category, description, amount, mode (cash/bank), notes/reference (for bill no, NACH ID, weight, bank ref, etc.)
- Notes shown as secondary line under description in the table
- Mode=bank posts to bank_ledger automatically
- Reports: Expenses by Category tab
- **Bulk Import tab**: paste tab-separated ERP/Excel ledger data → select category + mode → Parse & Check (auto-detects date col 0 DD-MM-YYYY, txnNo col 1, narration col 5/fallback col 3, debit col 6 / credit col 7) → preview table with New/Duplicate badges (duplicate key: date|amount|category) → per-row checkboxes + Select All → selected-total footer → Import N rows (inserts to expenses + bank_ledger/cash_ledger); **date carry-forward**: ERP exports only print the date on the first row of a group — blank-date PAYMENT rows now inherit the last seen date so multi-payment days are fully captured; **PURCHASE ENTRY rows ignored**: only PAYMENT type rows are imported; **approximate duplicate detection**: matches existing expenses within ₹1 tolerance on same date + category instead of exact amount
- **Categories tab**: manage expense categories in-app — add new categories (name input + Save), delete existing ones (with confirmation); list shows all categories from `expense_categories` table

- **Edit Loan**: expand a loan → "Edit this loan" link pre-fills all fields (date, lender, kind, principal, interest rate/period, tenure, affects_cash, notes); saving updates outstanding by the principal delta and syncs the cash_ledger entry (removes old, inserts updated); handles both new loans (matched by ref_id) and old loans with NULL ref_id (matched by date+amount); loan creation now stores ref_id on the cash_ledger row; "Edit this loan" and "Delete this loan" sit side-by-side at the bottom of each expanded loan

### Investments & AV Income
- Investment tracking
- Additional/variable income entry

### P&L V2 (Reports → P&L V2 tab)
- **Audit-corrected P&L** fixing 5 critical issues found in V1:
  1. COGS = WAC × pure grams sold (accrual method, not period acquisition cash flows)
  2. MPR revenue correctly strips embedded 3% GST before adding to revenue
  3. VA income = direct formula `Σ(gross_wt × va_pct% × rate)` — not a residual absorbing data errors
  4. Supplier purchases exclude returns (`is_return=true`) and adjustments (`is_adjustment=true`) — this fix also applies to V1
  5. WAC v2 includes settled supplier purchases (amount > 0) in addition to bullion buys + old metal + exchange
- **WAC V2** widget: shows V2 gold/silver WAC alongside V1 for comparison; warns when WAC is zero
- **Revenue section**: gold + silver + MPR all excl-GST correctly; shows MPR GST extracted (V1 missed this)
- **Service Income V2**: making charges + direct VA + stone/diamond; flags difference vs V1 residual VA
- **Inventory Movement section**: opening stock defaults — Gold from the Gold Stock section's latest entry on/before the period start date; Silver from Kolusu boxes reconstructed as of the period start (current box totals minus movements since that date); either can be overridden and saved as a dedicated `metal_inventory_snapshots` row per period. Then + in (purchases + old metal + exchange) − out (sold + dispatched + bullion sold) = closing stock estimate; closing value at WAC v2
  - **Missing-history handling**: if no Gold Stock entry exists on/before the period start (e.g. tracking only began partway through the year), falls back to the earliest entry that does exist and shows a warning naming that date instead of silently defaulting to 0. If the period start predates the earliest Kolusu box's creation date, the Silver opening figure is labeled as stock "as of {earliest box date}" with a warning rather than being presented as an exact figure for the requested date
- **P&L Waterfall**: clean revenue → COGS → gross profit → expenses → net profit statement
- **V1 vs V2 comparison table**: side-by-side for Revenue, GST, COGS, Gross Profit, Net Profit, Gold VA Income with difference column
- Requires migrations 127 (metal_inventory_snapshots table) and 128 (metal column on supplier_payments)

### Touch Analysis (Reports → Touch Profit tab)
- **FY Monthly Touch Table**: comprehensive sold touch% vs purchase touch% per month for gold and silver separately; FY year selector; gross weight column for each metal so volumes are transparent
  - Sold touch = weighted avg of effective touch for all confirmed gold/silver sale_items with gross_wt > 0; effective purity = purity_pct if > 0, else pure_wt/gross_wt × 100 (fallback so gross wt matches P&L); items with no purity info excluded from touch% only, still counted in gross wt
  - Purchase touch = weighted avg of supplier_purchases.purity_pct (direct) + sale_items.supplier_va_pct (confirmed suspense, not yet converted) — no double counting
  - **Avg Gold VA% column**: weighted avg VA% per month for gold items only (gold wt > 0, va_pct not null) using `Σ(gross_wt × va_pct) / Σ(gross_wt)`; also shown in FY average row and summary cards
  - Summary cards: Avg Gold Sold Touch, Avg Gold VA%, Avg Gold Purchase Touch, Avg Silver Sold Touch, Avg Silver Purchase Touch
- **Suspense Touch Profit Detail** (collapsible): all-time monthly breakdown of grams earned from touch spread on confirmed suspense items; optional ₹ rate input; expandable item list
- Requires migration 126 (adds va_pct to supplier_suspense view)
- **Sales Detail tab**: VA% column showing weighted avg gold VA% per bill

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

### Gold Stock (`/gold-stock`)
- Date-based stock entry for gold items across 12 preset categories (75KDM, Bangle, Bracelet, Chain, Diamond, Dollar, Gold Kolusu, Malaim, Necklace, Ring, Stud, Thali) plus unlimited custom categories (Coin, Bar, etc.) via "+ Custom" tile
- Two stock types: **Vault** and **Outer** (both support weight + optional qty)
- **Tagged vs Untagged + Bulk**: items with qty = blue "Tagged" badge (individually scanned pieces); items without qty = green "Untagged"; a separate **Bulk / Untagged weight** field in the entry panel lets you store bulk/loose weight alongside tagged pieces in the same category row — stored in `untagged_weight_g` column (migration 119); tiles show "+Xg bulk" in green when bulk weight exists; summary table shows both portions separately
- Multi-weight accumulator: enter individual piece weights, press Enter or + Add; pending input auto-included on Save without needing Enter first; qty auto-counts from entries only when 2+ weights are scanned (single weight = untagged by default unless qty is explicitly set)
- Saves per date/type/category (upsert) — re-clicking a category loads existing values
- Summary table: shows Tagged/Untagged badge, weight, qty, notes per category
- **Period Report**: click "Period Report" button, set Opening date + Closing date; comparison table shows Opening weight → Closing weight → Sold (= Opening − Closing) per category; tagged items also show qty sold; footer totals; vault/outer tab selector inside report
- **Record Sold / Reduce**: click any entered category tile → "Record Sold" button appears in panel header; enter sold weight (and sold qty for tagged items); shows live preview of stock after reduction; "Apply Reduction" saves the reduced entry directly
- **Transfer Vault ↔ Outer**: "→ Outer" on vault entries / "→ Vault" on outer entries; required Reason field (Repair, Suspense, Customer return, etc.); reason stored in entry notes; live before/after preview for both source and destination; validates transfer doesn't exceed source stock
- **Rename Category**: pencil icon (✎) next to category name in entry panel; renames across ALL dates and stock types globally; shows confirm dialog before applying
- **Delete Category**: "Delete category" link appears in the entry panel only when the category has NO stock entries for today (both vault and outer); clicking deletes all DB entries for that category globally AND hides it from the grid via localStorage (so preset categories like "Gold Kolusu" also disappear); hidden when any stock exists (safety guard); a "Restore all" link appears when categories are hidden
- **Custom Order Reserved (Vault)**: "Custom Order Reserved" section in vault entry form; supports multiple reservations per category — each with weight, optional qty, and customer/order reference; list shows all reservations with × to remove; total reserved and available-for-sale shown live; tile shows total reserved in orange; summary table has Reserved column; data stored as JSON in reserved_notes
- **Language toggle**: page fully respects the global Tamil/English toggle (தமிழ்/EN button in nav bar, via `useLangStore`); all labels — title, tabs, legend, summary headers, empty state, button text, custom tile — switch between Tamil and English dynamically; no hardcoded bilingual text
- **Print All Stock**: "அச்சிடு / Print" (Tamil) or "Print" (English) button opens a self-contained stock report in a new browser tab via `window.open()` — bypasses modal viewport limits so content flows across multiple A4 pages without clipping; report contains shop header, grand-total summary block, Vault table (category, tagged weight, qty, bulk, reserved) and Outer table, signature lines; `@page { margin: 15mm }` + `thead { display: table-header-group }` for proper pagination
- Migration 117: `gold_stock_entries` table; Migration 118: reserved columns; Migration 119: `untagged_weight_g` column

### Kolusu (Anklet Stock)
- Kolusu stock management
- Kolusu sale module (staff-accessible)
- Exchange return routing to kolusu stock when condition = good
- Return to box: "Return" button per box records kolusu weight + cover weight back into the specific box; shown in history in blue with "Return" label
- Delete sale entry: "Delete" button per sale transaction row (ledger) removes a duplicate/mistaken entry and adds its weight + qty back to the originating box

### Goldsmith
- Goldsmith job tracking

---

## Attendance & HR

### Attendance (Admin)
- Smart home card grid (12 cards) for admin on `/attendance`; second section "Finance & Inventory" with 8 ERP quick-link cards (Sales, Daily Sheet, Board Rate, Gold Stock, Kolusu, Analytics, Orders, All ERP)
- Daily attendance view: all staff with punch times, late flag, hours worked
- Monthly attendance summary: present days, late days, OT, leaves, deductions
- **Salary increment history**: when admin saves a salary change from the monthly attendance edit panel, the old → new amount and effective month are recorded in `staff_salary_history`; history is shown inline below the edit form (date changed, old salary in red, new salary in green, effective month) — only future edits are tracked, past changes before this feature are not recorded
- **Per-staff fine settings**: admin can set per-staff fine mode (day/min), fine rate ₹, OT rate ₹, OT rate mode (hour/min), fine from/to date range — all via the pencil edit panel; blank = use global setting; saved in monthly `attendance_settings` JSON; salary split-up shows Fine ₹ formula, OT ₹ formula, net fine or OT bonus clearly; value-based equalization: if OT ₹ > Fine ₹ the excess becomes OT bonus pay; per-staff fine date range — late days outside that range are excluded from fine calculation; range is saved in the monthly `attendance_settings` JSON under `staff_fine_ranges`; if no range is set for a staff member the global fine-from-date applies; effective range shown inline in the salary split-up as `[from → to]`
- **Per-staff OT vs late fine**: each staff member has an "OT offsets late fine" flag (`equalize_ot` column on `staff` table, default false); when enabled, that staff's OT minutes cancel out their late minutes before fine is calculated — set via the pencil edit panel in the monthly attendance view; also respected in payroll's Load Attendance fine calculation
- **Late & OT day breakdown**: in the expanded staff detail (per-minute fine mode), a "Late & OT — Day Breakdown" section always appears when a staff member has both late days and OT within their fine range — shows total late minutes, total OT minutes, net late, fine formula (N min × ₹rate) before/after OT offset, and a per-day table in raw minutes with a totals row; OT minutes are also filtered by the per-staff fine date range (not whole-month) so both sides of the calculation are consistent
- Kiosk mode with bio-user sequence lock
- Shop late-opening exceptions (shop_exceptions table)
- **Join-date-aware absence counting**: `staff.join_date` (set via the Edit panel on the Staff tab) is now respected in the monthly attendance summary and the staff self-service leave count — days before a staff member's join date are excluded from total/absent day counts and per-day salary math, instead of counting every day since the 1st of the month. "Joined {date}" shown under the staff name once set. This also applies to the staff's own `/my-attendance` Monthly tab (previously computed its own day list independently of `join_date` and could still show pre-join days as absent). The admin Monthly tab's day-by-day breakdown table is now also built only from `join_date` onward, so pre-join dates no longer appear as misleading "Leave" rows even though the summary totals were already correct
- **Mark Present (Staff tab)**: per-staff "Mark Present" action inserts a synthetic check-in (09:30) + check-out (end of their shift) pair into `attendance_logs` for a chosen date — for days actually worked before kiosk/device punch access was set up (e.g. a new joiner's first day(s)); refuses to run if punches already exist for that date unless an explicit "Override" is confirmed, which deletes the existing (e.g. wrong-time test) punches for that date first and replaces them with the clean present pair
- **Per-day late fine + Waive**: the Monthly tab's expanded Daily Attendance table now shows a ₹ Fine column per late day (day-mode or minute-mode, per-staff rate) with a "Waive" action; confirming (with optional reason) records the waiver in `late_fine_waivers` (date, amount, late minutes, who waived it, reason) and excludes that day from the month's fine/late-day totals going forward. A "Waived Fines" list under the day table shows the waiver history for that staff member. Waiving also sends an `app_notifications` alert to the specific staff member, and their own `/my-attendance` Monthly tab shows a durable "Late Fine Waived" history list (independent of notification read-state) with the date, amount, reason, and who waived it — visible to both admin and the staff member

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
- **Raw paste support**: paste directly from ERP with Customer Name + Mobile + Bill No columns — no manual cleanup needed; "%" suffix stripped automatically; silver product groups (SILVER ORNAMENTS, 92.5 ORNAMENTS, SILVER KOLUSU, etc.) and SIDE STUD auto-get wastage=1 (always pass eligibility); for all other items where ERP shows VA in grams (e.g. "0.400 Gm"), converts to real % using `(va_grams / net_weight) × 100` — e.g. 0.400g VA on 4g item = 10%
- **92.5-S / 92.5-L split**: ≤ 20g → 92.5-S (rate ₹5/g); > 20g → 92.5-L (rate ₹3/g) — boundary fixed to ≤20 = S
- Product mapper: ERP product name → incentive code; **inline add from unmapped badge** — click "unmapped" next to any product in the data table, type the incentive code, press Enter to add it to the mapper instantly; auto-saves the sheet immediately so the mapping is persisted without a separate Save click
- Master rate table: incentive code → ₹/gram rate + minimum VA%
- Split: SP1 gets configurable % (default 70%), SP2 gets rest
- Saved sheets (`incentive_sheets` table) with overrides per row
- **Manual skip (force ineligible)**: "↓ skip" button in the Ok? column on eligible or balance rows — marks the row ineligible regardless of wastage/balance (e.g. negative VA silver items auto-normalised to 1% but should not earn incentive); shows "Skipped" with "↑ undo" to reverse; `forceIneligible` persisted in sheet save
- **Mark paid with date history**: clicking "Mark paid" on a balance row stamps today's date in the override; date shown below "Paid ✓" badge; persisted in sheet save; undo clears date
- **Recovery-adjusted incentive + effective VA%**: when a write-off exists, incentive scales to recovered fraction; Waste% column shows "eff. X%" below original (= original VA% × recovery%); write-off form auto-fills Board Rate from MyBuddy's live board_rates table (gold_22k for G-bills, silver for S-bills); user can override; if provided, also shows MC lost in ₹ = netWt × boardRate × VA%/100 × (1 − recovery%) — e.g. received ₹25,000 of ₹27,000 = 92.6% recovery → incentive × 0.926; Inc column shows reduced amount + strikethrough of full amount + recovery % badge; flows into By Staff totals
- **Partial payment + write-off**: "Partial" button opens inline form with two separate actions — "Save received ₹X" records partial payment without closing the balance (customer may still pay rest later; row stays red/ineligible); "Write off ₹Y" closes the balance and marks incentive eligible; after partial save shows "Rcvd ₹X · Rem ₹Y" with "Fully paid" and "Write off ₹Y" buttons; after write-off shows GST lost + net lost; undo reverts all; write-off summary footer shows totals
- Staff view (`/my-incentive`): read-only personal incentive breakdown
- **Locked rows truly read-only**: once a staff member's rows are locked via the "Lock" button (writes to `incentive_sheets.locked_rows`), all editable cells on those rows are frozen — wastage, min wastage, split `InlineNum` inputs become plain text; `BalanceCell` is hidden; skip/undo buttons replaced with a "Paid" badge; prevents any accidental change to already-paid incentive data

### Permission Requests
- Late permission rows exceeding 2 hours are highlighted in red (`bg-err/5`) with the time shown in bold red and a `>2h` badge

### My Payslip (`/my-payslip`)
- Every staff member can view all their own salary slips (periods where admin has saved payroll with their entry)
- Period chips to switch between months; most recent shown by default
- Payslip card shows: basic salary, leaves, deductions, fine, advance, incentive, arrear, net salary, paid status
- "Download / Print" opens a printable HTML payslip in a new tab (auto-triggers browser print dialog)
- Accessible to all authenticated staff; no special permission required
- Nav item "My Payslip" added to sidebar (💰)
- **Kiosk access**: "My Payslip" tab added to the attendance page for non-admin users — staff tap their PIN sequence on the kiosk and are immediately taken to their payslip (tab auto-switches to payslip on successful per-user unlock); the tab is position 2 in the non-admin tab bar (right after Attendance) so it's always visible without scrolling
- **Staff app (`/my-attendance`)**: "Payslip" card added to smart home "My Work" section and as the second tab in classic view — staff can view all their salary slips, switch between months via period chips, and download/print a formatted payslip PDF directly from their attendance app

### Payroll
- Monthly payroll sheet: basic salary, leave deductions, fine, advance recovery, incentive, arrear → net salary
- Load from staff master, load attendance (auto-fills deductions), load from incentive sheet
- **Per-day salary**: shown as a helper under each Basic Salary cell (`basicSalary / 30`), so leave deductions can be verified at a glance
- **Fine deduction**: separate Fine column (editable per staff); deducted from net salary; shown on payslip as a distinct deduction line
- **Attendance alerts in payroll**: each staff name cell shows inline badges — red `N× perm >2h` for approved permissions exceeding 2 hours (hover shows dates + minutes), orange `N× wknd leave · −₹X` for approved weekend leaves showing the 2× per-day deduction amount (hover shows dates); requires attendance loaded for the period
- **Fine auto-loads with attendance**: clicking "Load Attendance" also calculates and fills the Fine column using the saved attendance settings (late fine amount, per-day or per-minute mode, apply-from date, OT equalization); mirrors the MonthlyTab fine formula exactly
- **Paid rows locked**: once a row is marked Paid, all cells (name, salary, deduction, fine, advance, incentive, arrear) become read-only — values display as static text; the undo ↩ button still allows reverting payment status if needed
- **Deactivated staff picker**: "+ Add Deactivated Staff" button in the payroll toolbar opens a dropdown of all inactive staff — click any name to add them as a single row without disturbing the active staff workflow; if they are already in the sheet the button shows "(added)" and is disabled; their bio_user_id is included in the attendance pull so leave/fine/deduction auto-loads correctly when "Load Attendance" is clicked
- **Load as Arrear**: when loading an incentive sheet into payroll, check "Load as Arrear (not Incentive)" to defer incentive amounts into the Arrear column instead; in arrear mode only items manually marked paid (balanceZero override) are counted — items that were naturally balance=0 in the ERP export are excluded, so the arrear reflects only newly cleared balances

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
- Instagram Auto-DM: keyword-triggered DM replies to Instagram comments (`/social`)
- Rules: keyword, match type (contains/exact), reply text, trigger count tracking

### Lead Inbox (`/leads`) *(New — 2026-07-09)*
Multi-channel WhatsApp + Instagram + Messenger lead management CRM.

**Architecture:**
- `whatsapp_leads` table: one row per unique sender per channel (wa_id + channel unique)
- `whatsapp_messages` table: every inbound/outbound message with direction, status, sent_by
- `app/api/whatsapp/webhook` — GET: Meta webhook verification; POST: inbound message handler
- `app/api/whatsapp/send` — POST: sends WhatsApp reply via Cloud API, records outbound message

**UI features:**
- Split-panel: lead list (left) + chat view (right)
- Status tabs: All / New / Hot / Warm / Cold / Converted / Lost
- Status badge + category badge (Gold / Silver / Diamond / Repair / Reel / Walk-in / General / Other) in lead list
- Channel icon (💬 WhatsApp, 📸 Instagram, 💙 Messenger)
- Category dropdown + Status dropdown + Assign to staff dropdown (per lead header)
- Source field (inline edit) — free text e.g. "Reel - Gold Chain Jan 2026", "Instagram Bio", "Referral"
- Notes field (inline edit per lead)
- Chat bubble UI: inbound = white left-aligned, outbound = gold right-aligned (monitor-only view)
- Monitor-only mode — no reply box; reply from WhatsApp Business App
- Auto-links lead to existing customer by matching last 10 digits of phone; auto-creates new customer if no match
- Customer name shown as clickable link to customer page in lead detail header
- Customer 360 page (`/customers/[id]`) has a WhatsApp tab showing all conversations and messages for that customer
- Auto-scroll to latest message; 5-second polling for new messages

**Required env vars:**
- `WHATSAPP_VERIFY_TOKEN` — secret string entered in Meta webhook setup
- `WHATSAPP_ACCESS_TOKEN` — permanent token from Meta System User
- `WHATSAPP_PHONE_NUMBER_ID` — from WhatsApp Manager (694983870354081 for production)

**WhatsApp Coexistence Setup page (`/admin/whatsapp-setup`):**
- Loads Facebook JS SDK and launches Embedded Signup with `featureType: 'whatsapp_business_app_onboarding'`
- After login, displays `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_WABA_ID` to copy to Vercel
- `app/api/whatsapp/oauth-callback` — GET: receives OAuth redirect from Facebook, exchanges code for token, fetches WABA + phone number IDs, redirects back to setup page with results
- No Facebook JS SDK required — uses direct OAuth URL redirect flow
- Requires `FACEBOOK_APP_SECRET` env var in Vercel

**Required env vars:**
- `WHATSAPP_VERIFY_TOKEN` — secret string entered in Meta webhook setup
- `WHATSAPP_ACCESS_TOKEN` — permanent token from Meta System User
- `WHATSAPP_PHONE_NUMBER_ID` — from WhatsApp Manager or Coexistence setup page (694983870354081 for production)
- `WHATSAPP_WABA_ID` — WhatsApp Business Account ID (populated after Coexistence setup)
- `FACEBOOK_APP_SECRET` — from Meta App → Settings → Basic (needed for auth code exchange)
- `NEXT_PUBLIC_FACEBOOK_APP_ID` — Meta App ID (defaults to 468979614795589; set if different)
- `NEXT_PUBLIC_FACEBOOK_CONFIG_ID` — Embedded Signup Configuration ID (defaults to 1513891609861996)

**Required migrations:** `db/migrations/129_whatsapp_leads.sql`, `db/migrations/130_leads_category_source.sql`, `db/migrations/131_leads_customer_id.sql`

**Setup status:** Meta Business Verification complete (2026-07-09). Use `/admin/whatsapp-setup` to connect +91 73053 93916 via Embedded Signup Coexistence flow. After setup, subscribe webhook to: `messages`, `smb_message_echoes`, `smb_app_state_sync`, `history`.

---

## Reports

- Daily Sheet: date-wise sales summary; header Refresh button re-fetches all Daily Sheet queries (summary, cash book, cash flow, cash count) without a full page reload
- Product Mix: items by description per metal type
- Expenses by Category: monthly expense breakdown
- Metal Flow reports
- Sales Breakdown: grams and revenue split by source — Ready Stock (shelf inventory) / Order Delivery (converted from orders) / From Suspense (supplier suspense items); shown per metal (gold/silver) with gross wt, net wt, item count, and revenue per bucket
- **P&L Summary weight columns**: Gold (g) and Silver (g) columns alongside each rupee figure; WAC mode: "Gold Purchase (dispatch + rate cut)" and "Silver Purchase (dispatch + rate cut)" per-metal lines; non-WAC mode: "Gold Purchase (supplier + old metal)" and "Silver Purchase (supplier + old metal)" combined per-metal lines with sub-note showing the split — prevents double-counting when old/exchange metal sent to supplier appears in both tables
- **Exchange metal in WAC**: `sale_payments` old_gold/old_silver exchange receipts (at credited amount) are now included in the all-time WAC pool alongside bullion buys and standalone old metal intake — ensures dispatch cost for exchange metal correctly reflects its acquisition cost rather than an inflated WAC
- **Old/exchange cost visibility in WAC P&L**: Under each "Less: Gold/Silver Purchase" line, a secondary info row shows the period's old metal purchased (cash) + exchange credits given — weight and amount — labeled "embedded in WAC dispatch above" so costs are visible without double-counting the P&L deduction

## Analytics Dashboard (`/admin/analytics`)

4-tab business intelligence dashboard with SVG charts (no external chart library):

- **Overview**: Today's bills + revenue, month revenue vs last month (donut), 8-month revenue trend (smooth bezier line chart), recent transactions table, payment method mix (donut)
- **Global month filter**: Month picker (← label → arrows + click-to-open native picker + "Current" jump button) sits above all tabs at the page level; changing month re-fetches all tabs together — Overview KPIs, payment mix, Sales Analysis charts, Inventory source breakdown, Deep Analytics profit/expense all reflect the selected month; today's stats and 8-month trend charts are always anchored to real-time
- **Sales Analysis**: per-metal revenue/weight/count cards, daily sales line chart, top customers bar chart, expenses panel (category bars, total, expense-to-revenue %)
- **Bug fix**: `expense_categories` join was incorrectly written as `categories` — expenses were silently returning empty; fixed to use correct table name
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
- `/verify-otp` has a "Trust this device for 90 days" checkbox (checked by default) — when checked, sets a 90-day `mfa_verified` cookie so TOTP is not asked again on that browser; unchecked = session cookie cleared on browser close
- `/my-security-code` page shows the current rotating code (requires prior MFA verification)
- Admin opens MyBuddy on their phone → taps Security Code → reads the 6-digit code → types it on the new device
- `app_metadata.mfa_enabled` flag (service-role only) gated in middleware — no DB query per request
- Staff (game-login users) are exempt from 2FA
- **Kiosk login bypasses TOTP**: kiosk tap-sequence unlock sets a short-lived (5 min) `kiosk_mfa_bypass` cookie; middleware detects it on the next request, auto-grants `mfa_verified` for that user, and clears the bypass cookie — no TOTP prompt after kiosk login

### Supplier Ledger Import (`/admin/supplier-ledger`)
- Select supplier, paste Tally ledger export (tab or comma delimited, auto-detected)
- Parses PAYMENT and RETAIL PURCHASE / SALE BILL rows; skips OB, Total, CB rows; **date carry-forward**: blank-date PAYMENT rows inherit the last seen date (ERP only prints date on the first row of a same-day group)
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

### Notifications & PWA Badge
- Shared `NotificationBell` component (`src/components/ui/notification-bell.tsx`): red dot badge on bell icon showing unread count; dropdown with mark-one / mark-all-read; calls `navigator.setAppBadge()` so installed PWA shows count on home screen icon; on mount requests push permission and registers a Web Push subscription via `/api/push/subscribe`
- Admin page (`/attendance`): bell in both smart-home header and tab header
- Staff page (`/my-attendance`): bell in all three header variants (smart home, smart tab, classic)
- Service worker registered globally (`src/components/ui/sw-register.tsx` in root layout); `sw.js` handles `push` event (shows OS notification), `notificationclick` (focuses/opens app), `install`/`activate` for immediate activation
- PWA icons generated on demand via `/api/icons/[size]` (ImageResponse, edge runtime) — fixes missing `icon-192.png` / `icon-512.png`; manifest updated to reference these routes
- manifest.json enriched: `lang`, `dir`, `categories`, `prefer_related_applications`, `scope`, 3 shortcuts (Daily Sheet / New Sale / Board Rate) — improves PWABuilder score
- **Android APK**: install the PWA from Chrome → "Add to Home Screen" shows the badge automatically; for a standalone APK use pwabuilder.com against the live URL to generate a TWA (Trusted Web Activity) package
- **iPhone / iOS Web Push**: VAPID keys stored in env (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); `push_subscriptions` table (migration 116) stores per-device endpoint + keys; `/api/push/subscribe` (POST) upserts subscription; `/api/push/send` (POST) sends via `web-push` to all devices for a `bio_user_id`, auto-cleans expired (410) endpoints; push sent on leave approved/rejected and task assigned events (staff-targeted); iOS 16.4+ receives push when PWA is added to Home Screen

### Board Rate
- Daily gold/silver rate entry
- Used in all sale calculations
- Market Rate Comparison: "Fetch Rates" button pulls live Madurai gold rates (22K/24K) and silver ₹/g from goodreturns.in via a server-side API route (`/api/market-rates`); compares last 10 days against your stored rates; highlights Match / diff / Missing; "Use" / "Update" loads market rate into edit form (18K auto-set to 75% of 24K) — review and save to apply

### Walk-ins
- Walk-in customer log

---

## Digital Signage

Manual digital signage: staff upload images/videos (generated however they like — no AI integration in this app), build them into playlists, lay playlists out across TV screen zones, and pair Android TVs to play them. No OpenAI/AI generation — that was built and then deliberately removed (see migration 134) in favor of a simpler manual-upload workflow.

- **Schema** (`db/migrations/133_signage_system.sql`, narrowed by `134_remove_ai_poster_generation.sql`, storage RLS added by `135_signage_media_storage_policies.sql`): `playlists` / `playlist_items` (ordered, `item_type` is `image` or `video`, `media_url` points at an uploaded file — no AI/template concept), `channels` / `channel_zones` (percentage rectangles — covers full-screen, 50/50, 20/80, vertical/horizontal splits without an enum per shape), `devices` (pairing code + `device_secret`, no Supabase Auth session)
- **Storage**: a "Public" Supabase Storage bucket only grants public *read* — uploads (INSERT) need an explicit RLS policy on `storage.objects` too, same pattern as the pre-existing `repair-photos` bucket in migration 050. Missed for `signage-media` in 133, fixed by 135
- **`get_device_playout(device_id)`**: resolves a device's channel → zones → playlist → items (media URLs) in one call
- **TV device security**: devices never get a Supabase Auth session — this schema's RLS grants `authenticated` sessions broad access to sales/customer/payment data, and `handle_new_user()` would auto-create a staff `profiles` row for an anonymous sign-in too. Devices instead authenticate to dedicated API routes with a per-device secret, and get realtime updates via Supabase Realtime Broadcast (anon key only, ping-to-refetch, no business data on the channel)
- **CMS pages** (`app/(app)/admin/signage/{playlists,channels,devices}/page.tsx`, shared tab strip via `src/components/signage/signage-tabs.tsx`):
  - **Playlists**: create playlists, add items by uploading an image or video (into a public `signage-media` bucket) with a duration in seconds, drag-to-reorder via `@dnd-kit`
  - **Channels**: create a channel from a layout preset (Full screen, Horizontal 50/50, Horizontal 70/30, Vertical 50/50, Vertical 20/80, Vertical 80/20, Vertical 30/70, Vertical 70/30 — each just inserts the matching `channel_zones` percentage rectangles), assign a playlist per zone, visual zone preview
  - **Devices**: "Claim a device" by typing the 6-digit pairing code shown on the TV (created via `POST /api/signage/request-code`, a public route since the TV has no session), then name/locate/assign a channel; online/offline shown from `last_seen_at` recency (< 5 min = online)
- **`POST /api/signage/request-code`** (built, public route): TV calls this on first launch, gets back `{ pairing_code, device_secret }` — the pairing code is shown on screen, the secret is persisted locally by the TV app and never re-issued
- **`POST /api/signage/playout`** (built, public route, `device_secret`-authenticated): returns `{ paired: false, pairing_code }` while unclaimed, or `{ paired: true, zones: [...] }` (via `get_device_playout`) once assigned a channel; also stamps `last_seen_at` on every call (no separate heartbeat route needed)
- **Realtime**: no `postgres_changes` subscription (would need a Supabase session — see above). Instead every content-changing CMS mutation pings a shared, unauthenticated Realtime **Broadcast** channel (`"signage-updates"`, anon key only, empty payload) via `broadcastSignageRefresh()` in `src/modules/signage/api.ts`; every TV listens on it and refetches its own playout. A 60s fallback poll covers a missed broadcast (reconnects, app backgrounded, etc.)
- **`app/tv-player/page.tsx`** (built): the actual player — pairing-code screen while unclaimed, then renders each zone as an absolutely-positioned percentage rectangle looping its resolved items (images on a timer, videos advance on `onEnded`); uses `object-fit: contain` (not `cover`) so uploaded images/videos always show in full rather than being cropped to fill a zone whose aspect ratio doesn't match the source image. For zero letterboxing, source images should be exported at the zone's actual aspect ratio — for a vertical split, a zone that's X% of the screen width has ratio `(X/100 × 16) : 9` on a standard 16:9 TV
- **Screensaver prevention**: `useScreenWakeLock()` in `app/tv-player/page.tsx` requests the browser Screen Wake Lock API on mount (re-acquiring on visibility change, since the API auto-releases when backgrounded) so the TV OS doesn't treat an actively-playing signage page as idle and screensaver over it. Belt-and-suspenders: also disable/extend the TV's own screensaver timer in its Settings, since some OEM Android TV builds layer additional standby behavior (e.g. HDMI-CEC-driven, auto-power-off timers) that a page-level wake lock can't override
- **`middleware.ts`**: `/tv-player` and `/api/signage/*` are exempted from the global "redirect to /login if no session" rule — these are called by devices with no Supabase session and do their own auth internally
- **`signage-tv-app/`** (scaffolded, not yet buildable here): a separate, thin Capacitor Android project (distinct `appId` from the phone app) that just wraps `/tv-player` for Android TV — leanback manifest additions and build steps are in `signage-tv-app/README.md`. Couldn't run `npx cap add android` in this sandbox (no Java/Android SDK); needs to be run locally where the phone APK is already built. Boot-persistence (auto-launch on TV power-on) is native Android work not yet done
- **To update signage content**: there's no "replace image" button yet — swap content by deleting a playlist item and adding a new upload in its place

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
| 116 | `116_push_subscriptions.sql` | Push subscription storage for Web Push / iPhone notifications |
| 133 | `133_signage_system.sql` | Digital signage: playlists, channels/zones, devices (originally also poster templates/posters, see 134) |
| 134 | `134_remove_ai_poster_generation.sql` | Removes AI poster generation (poster_templates/posters tables, board_rates trigger) — signage is manual-upload only |
| 135 | `135_signage_media_storage_policies.sql` | RLS policies on storage.objects for the signage-media bucket (uploads need this even on a "Public" bucket) |
