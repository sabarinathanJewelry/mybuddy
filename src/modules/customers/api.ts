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
      if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
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

export function useCustomerBalance(id: string | null | undefined) {
  return useQuery<number | null>({
    queryKey: ["customer_balance", id ?? null],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("customer_balances")
        .select("balance")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data?.balance ?? null;
    },
  });
}

export function useUpsertCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<CustomerFormData> & { id?: string }) => {
      const { id, ...rest } = payload;
      const client = supabase();

      if (rest.phone) {
        let q = client.from("customers").select("id").eq("phone", rest.phone);
        if (id) q = q.neq("id", id);
        const { data: dups } = await q.limit(1);
        if (dups && dups.length > 0) throw new Error("A customer with this phone number already exists.");
      }

      if (id) {
        const { data, error } = await client
          .from("customers")
          .update({ ...rest, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await client
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

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();
      const [sales, orders, payments, writeoffs] = await Promise.all([
        client.from("sales").select("id").eq("customer_id", id).limit(1),
        client.from("orders").select("id").eq("customer_id", id).limit(1),
        client.from("payments").select("id").eq("customer_id", id).limit(1),
        client.from("scrap_entries").select("id").eq("customer_id", id).limit(1),
      ]);
      if (
        (sales.data?.length ?? 0) > 0 ||
        (orders.data?.length ?? 0) > 0 ||
        (payments.data?.length ?? 0) > 0 ||
        (writeoffs.data?.length ?? 0) > 0
      ) {
        throw new Error("Cannot delete — customer has existing transactions.");
      }
      const { error } = await client.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

function paymentLedgerTable(mode: string): "cash_ledger" | "bank_ledger" | null {
  if (mode === "cash") return "cash_ledger";
  if (mode === "upi" || mode === "bank") return "bank_ledger";
  return null;
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customerId, pay_date, mode, amount, direction, notes }: {
      id: string; customerId: string; pay_date: string; mode: string; amount: number; direction: string; notes?: string;
    }) => {
      const client = supabase();

      const { data: current } = await client.from("payments").select("mode").eq("id", id).single();
      const oldTable = paymentLedgerTable(current?.mode ?? "");
      const newTable = paymentLedgerTable(mode);

      const { error } = await client.from("payments").update({ pay_date, mode, amount, direction, notes: notes ?? null }).eq("id", id);
      if (error) throw error;

      if (oldTable === newTable) {
        if (newTable) {
          await client.from(newTable).update({ tx_date: pay_date, direction, amount }).eq("ref_type", "payment").eq("ref_id", id);
        }
      } else {
        if (oldTable) await client.from(oldTable).delete().eq("ref_type", "payment").eq("ref_id", id);
        if (newTable) {
          await client.from(newTable).insert({
            tx_date: pay_date, direction, amount,
            description: "Payment", ref_type: "payment", ref_id: id,
          });
        }
      }

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

export function useApplyAdvanceToOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customer_id, order_no, amount }: {
      customer_id: string;
      order_no: string;
      amount: number;
    }) => {
      const { error } = await supabase().from("payments").insert({
        customer_id,
        direction: "out",
        mode: "advance",
        amount,
        pay_date: new Date().toISOString().slice(0, 10),
        is_advance: true,
        notes: `Advance applied — Order ${order_no}`,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { customer_id }) => {
      qc.invalidateQueries({ queryKey: ["customer-360", customer_id] });
      qc.invalidateQueries({ queryKey: ["customer", customer_id] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
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
        client.from("payments").select("id, pay_date, direction, mode, amount, notes").eq("customer_id", id).order("pay_date", { ascending: false }).limit(20),
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
