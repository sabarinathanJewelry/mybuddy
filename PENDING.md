# Pending Tasks & Session Status

## Supabase Migrations to Run
Run these in Supabase SQL Editor (Dashboard → SQL Editor):

1. **Migration 023** — `db/migrations/023_customer_balance_view.sql`
   - Creates the `customer_balances` view used by the Customers → Balance tab

2. **Migration 024** — `db/migrations/024_cleanup_advance_double_entries.sql`
   - Deletes wrongly-created advance payment double-entries from the `payments` table
   - Fixes customer balances that show inflated amounts (e.g. showing ₹4,35,400 instead of ₹95,400)

## Recent Features Added
- **Customers page**: "Customer Balances" tab — shows who owes the company and who has advance credit
- **Suppliers**: Edit opening balance (rupees + gold g + silver g) from both list and detail page
- **Loans**: Principal repayment form, segment-based interest recalculation
- **Orders**: Fixed loading issue, GST-inclusive mode, Silver MPR auto-GST
- **Chit payments**: Edit button per row to correct wrong amounts
- **Reports**: New "Product Mix" tab (items sold by description per metal) and "Expenses" tab (by category)
- **Sales advance bug**: Fixed double-counting when advance payment used in a sale

## Known Issues / Context
- "Scrap" in this app = bad-debt write-off of unrecoverable customer balance (NOT metal scrap)
- Customer balance formula: `opening_balance - total_sales + payments_in - payments_out + writeoffs`
  - Negative balance = customer owes company
  - Positive balance = customer has advance credit
