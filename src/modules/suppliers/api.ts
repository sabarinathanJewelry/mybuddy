"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface Supplier {
  id: string; name: string; phone: string | null;
  address: string | null; opening_balance: number; notes: string | null;
}

export function useSuppliers(search = "", limit = 50) {
  return useQuery<Supplier[]>({
    queryKey: ["suppliers", search, limit],
    queryFn: async () => {
      let q = supabase().from("suppliers").select("*").order("name").limit(limit);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Supplier> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase().from("suppliers").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase().from("suppliers").insert(rest).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useSupplier360(id: string) {
  const client = supabase();
  return useQuery({
    queryKey: ["supplier-360", id],
    enabled: !!id,
    queryFn: async () => {
      const [purchasesRes, paymentsRes, suspenseRes] = await Promise.all([
        client.from("supplier_purchases").select("*").eq("supplier_id", id).order("purchase_date", { ascending: false }).limit(30),
        client.from("supplier_payments").select("*").eq("supplier_id", id).order("pay_date", { ascending: false }).limit(30),
        client.from("supplier_suspense").select("*").eq("supplier_id", id).order("bill_date", { ascending: false }).limit(30),
      ]);
      return {
        purchases: purchasesRes.data ?? [],
        payments: paymentsRes.data ?? [],
        suspense: suspenseRes.data ?? [],
      };
    },
  });
}

export function useSaveSupplierPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: row, error } = await supabase().from("supplier_purchases").insert(data).select().single();
      if (error) throw error;
      return row;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["supplier-360", vars.supplier_id] }),
  });
}

export function useSaveSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const client = supabase();
      const { data: row, error } = await client.from("supplier_payments").insert(data).select().single();
      if (error) throw error;
      // Best-effort ledger
      if (data.mode === "cash") {
        const { error: e } = await client.from("cash_ledger").insert({ tx_date: data.pay_date, direction: "out", amount: data.amount, description: "Supplier payment", ref_type: "supplier_payment", ref_id: row.id });
        if (e) console.warn(e);
      } else if (data.mode === "bank" || data.mode === "upi") {
        const { error: e } = await client.from("bank_ledger").insert({ tx_date: data.pay_date, direction: "out", amount: data.amount, description: "Supplier payment", ref_type: "supplier_payment", ref_id: row.id });
        if (e) console.warn(e);
      }
      return row;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["supplier-360", vars.supplier_id] }),
  });
}
