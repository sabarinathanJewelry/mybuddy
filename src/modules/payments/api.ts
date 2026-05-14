"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export function usePayments(limit = 50) {
  return useQuery({
    queryKey: ["payments", limit],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("payments")
        .select("*, customers(name), suppliers(name)")
        .order("pay_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSavePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const client = supabase();
      const { data: row, error } = await client.from("payments").insert(data).select().single();
      if (error) throw error;
      // Best-effort ledger fan-out
      if (data.mode === "cash") {
        await client.from("cash_ledger").insert({
          tx_date: data.pay_date, direction: data.direction,
          amount: data.amount, description: "Payment", ref_type: "payment", ref_id: row.id,
        }).catch(console.warn);
      } else if (data.mode === "upi" || data.mode === "bank") {
        await client.from("bank_ledger").insert({
          tx_date: data.pay_date, direction: data.direction,
          amount: data.amount, description: "Payment", ref_type: "payment", ref_id: row.id,
        }).catch(console.warn);
      }
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}
