"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface Supplier {
  id: string; name: string; phone: string | null;
  address: string | null; opening_balance: number;
  gold_opening_g: number; silver_opening_g: number;
  notes: string | null;
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      if (vars.id) qc.invalidateQueries({ queryKey: ["supplier-360", vars.id] });
    },
  });
}

export function useSupplier360(id: string) {
  const client = supabase();
  return useQuery({
    queryKey: ["supplier-360", id],
    enabled: !!id,
    queryFn: async () => {
      const [supplierRes, purchasesRes, paymentsRes, suspenseRes, dispatchesRes] = await Promise.all([
        client.from("suppliers").select("*").eq("id", id).single(),
        client.from("supplier_purchases").select("*").eq("supplier_id", id).order("purchase_date", { ascending: false }),
        client.from("supplier_payments").select("*").eq("supplier_id", id).order("pay_date", { ascending: false }),
        client.from("supplier_suspense").select("*").eq("supplier_id", id).order("bill_date", { ascending: false }).limit(50),
        client.from("metal_dispatches").select("id, dispatch_date, metal, weight_g, purity_pct, notes").eq("supplier_id", id).order("dispatch_date", { ascending: false }),
      ]);
      return {
        supplier: supplierRes.data,
        purchases: purchasesRes.data ?? [],
        payments: paymentsRes.data ?? [],
        suspense: suspenseRes.data ?? [],
        dispatches: dispatchesRes.data ?? [],
      };
    },
  });
}

export function useConfirmSuspenseVa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, supplierId, va_pct }: { itemId: string; supplierId: string; va_pct: number }) => {
      const { error } = await supabase()
        .from("sale_items")
        .update({ supplier_va_pct: va_pct, supplier_confirmed: true })
        .eq("id", itemId);
      if (error) throw error;
      return supplierId;
    },
    onSuccess: (supplierId) => qc.invalidateQueries({ queryKey: ["supplier-360", supplierId] }),
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

export function useUpdateSupplierPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplierId, data }: { id: string; supplierId: string; data: Record<string, unknown> }) => {
      const { error } = await supabase().from("supplier_purchases").update(data).eq("id", id);
      if (error) throw error;
      return supplierId;
    },
    onSuccess: (supplierId) => qc.invalidateQueries({ queryKey: ["supplier-360", supplierId] }),
  });
}

export function useDeleteSupplierPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplierId }: { id: string; supplierId: string }) => {
      const { error } = await supabase().from("supplier_purchases").delete().eq("id", id);
      if (error) throw error;
      return supplierId;
    },
    onSuccess: (supplierId) => qc.invalidateQueries({ queryKey: ["supplier-360", supplierId] }),
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

export function useUpdateSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplierId, data }: { id: string; supplierId: string; data: Record<string, unknown> }) => {
      const client = supabase();
      const { error } = await client.from("supplier_payments").update(data).eq("id", id);
      if (error) throw error;
      // Re-sync ledger: delete old entries, insert new
      await Promise.all([
        client.from("cash_ledger").delete().eq("ref_type", "supplier_payment").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "supplier_payment").eq("ref_id", id),
      ]);
      if (data.mode === "cash") {
        await client.from("cash_ledger").insert({ tx_date: data.pay_date, direction: "out", amount: data.amount, description: "Supplier payment", ref_type: "supplier_payment", ref_id: id });
      } else if (data.mode === "bank" || data.mode === "upi") {
        await client.from("bank_ledger").insert({ tx_date: data.pay_date, direction: "out", amount: data.amount, description: "Supplier payment", ref_type: "supplier_payment", ref_id: id });
      }
      return supplierId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["supplier-360", vars.supplierId] }),
  });
}

export function useDeleteSupplierPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, supplierId }: { id: string; supplierId: string }) => {
      const client = supabase();
      await Promise.all([
        client.from("cash_ledger").delete().eq("ref_type", "supplier_payment").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "supplier_payment").eq("ref_id", id),
      ]);
      const { error } = await client.from("supplier_payments").delete().eq("id", id);
      if (error) throw error;
      return supplierId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["supplier-360", vars.supplierId] }),
  });
}
