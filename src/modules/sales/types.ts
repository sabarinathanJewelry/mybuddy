export type Metal = "gold_22k" | "gold_24k" | "gold_18k" | "silver" | "silver_pure";
export type PaymentMode = "cash" | "upi" | "bank" | "old_gold" | "old_silver" | "advance";
export type SaleSeries = "G" | "S" | "D";

export interface SaleItemDraft {
  id: string;
  description: string;
  metal: Metal | null;
  gross_wt: number;
  stone_wt: number;
  purity_pct: number;
  rate: number;
  va_pct: number;
  making_amt: number;
  stone_amt: number;
  diamond_amt: number;
  gst_pct: number;
  is_suspense: boolean;
  supplier_id: string | null;
  // computed
  net_wt: number;
  pure_wt: number;
  line_total: number;
}

export interface SalePaymentDraft {
  id: string;
  mode: PaymentMode;
  amount: number;
  metal_wt: number;
  metal_purity: number;
  is_advance: boolean;
}

export interface SaleDraft {
  series: SaleSeries;
  customer_id: string | null;
  bill_date: string;
  notes: string;
  items: SaleItemDraft[];
  payments: SalePaymentDraft[];
}
