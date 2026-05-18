"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Customer, CustomerFormData } from "./types";

export function useCustomers(search = "", limit = 50) {
  return useQuery<Customer[]>({
    queryKey: ["customers", search, limit],
    queryFn: async () => {
      let q = supabase()
        .from("customers")
        .select("*")
        .order("name")
        .limit(limit);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCustomer(id: string | null) {
  return useQuery<Customer>({
    queryKey: ["customer", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("customers")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CustomerFormData> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase()
          .from("customers")
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase()
          .from("customers")
          .insert(rest)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customerId, pay_date, mode, amount, direction, notes }: {
      id: string; customerId: string; pay_date: string; mode: string; amount: number; direction: string; notes?: string;
    }) => {
      const { error } = await supabase()
        .from("payments")
        .update({ pay_date, mode, amount, direction, notes: notes ?? null })
        .eq("id", id);
      if (error) throw error;
      return customerId;
    },
    onSuccess: (customerId) => qc.invalidateQueries({ queryKey: ["customer-360", customerId] }),
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string }) => {
      const { error } = await supabase().from("payments").delete().eq("id", id);
      if (error) throw error;
      return customerId;
    },
    onSuccess: (customerId) => qc.invalidateQueries({ queryKey: ["customer-360", customerId] }),
  });
}

export function useCustomer360(id: string) {
  const client = supabase();
  return useQuery({
    queryKey: ["customer-360", id],
    enabled: !!id,
    queryFn: async () => {
      const [salesRes, ordersRes, paymentsRes, writeoffsRes] = await Promise.all([
        client.from("sales").select("id, bill_no, bill_date, total, status").eq("customer_id", id).order("bill_date", { ascending: false }).limit(20),
        client.from("orders").select("id, order_no, order_date, status, total, order_payments(amount)").eq("customer_id", id).order("order_date", { ascending: false }).limit(20),
        client.from("payments").select("id, pay_date, direction, mode, amount").eq("customer_id", id).order("pay_date", { ascending: false }).limit(20),
        client.from("scrap_entries").select("id, scrap_date, amount, notes").eq("customer_id", id).order("scrap_date", { ascending: false }).limit(20),
      ]);
      return {
        sales: salesRes.data ?? [],
        orders: ordersRes.data ?? [],
        payments: paymentsRes.data ?? [],
        writeoffs: writeoffsRes.data ?? [],
      };
    },
  });
}
