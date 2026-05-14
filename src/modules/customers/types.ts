export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  gold_balance_g: number;
  silver_balance_g: number;
  notes: string | null;
  created_at: string;
}

export interface CustomerFormData {
  name: string;
  phone: string;
  address: string;
  opening_balance: number;
  gold_balance_g: number;
  silver_balance_g: number;
  notes: string;
}
