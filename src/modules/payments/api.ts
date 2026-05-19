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
      // payments table has no metal_wt / metal_purity — strip before insert
      const { metal_wt, metal_purity, ...paymentData } = data as Record<string, unknown> & { metal_wt?: number; metal_purity?: number };
      const { data: row, error } = await client.from("payments").insert(paymentData).select().single();
      if (error) throw error;
      // Old gold/silver: record physical metal in intake table
      if ((data.mode === "old_gold" || data.mode === "old_silver") && (metal_wt ?? 0) > 0) {
        const metal = data.mode === "old_gold" ? "gold_22k" : "silver";
        const purity = (metal_purity as number) || (data.mode === "old_gold" ? 91.6 : 92.5);
        const { error: e } = await client.from("old_metal_intake").insert({
          intake_date: data.pay_date, metal,
          gross_wt: metal_wt, purity_pct: purity,
          pure_wt: (metal_wt as number) * (purity / 100),
          source_type: "payment", source_id: row.id, status: "pending",
        });
        if (e) console.warn("metal intake failed:", e);
      }
      // Best-effort ledger fan-out
      if (data.mode === "cash") {
        const { error: e } = await client.from("cash_ledger").insert({
          tx_date: data.pay_date, direction: data.direction,
          amount: data.amount, description: "Payment", ref_type: "payment", ref_id: row.id,
        });
        if (e) console.warn(e);
      } else if (data.mode === "upi" || data.mode === "bank") {
        const { error: e } = await client.from("bank_ledger").insert({
          tx_date: data.pay_date, direction: data.direction,
          amount: data.amount, description: "Payment", ref_type: "payment", ref_id: row.id,
        });
        if (e) console.warn(e);
      }
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

function paymentLedgerTable(mode: string): "cash_ledger" | "bank_ledger" | null {
  if (mode === "cash") return "cash_ledger";
  if (mode === "upi" || mode === "bank") return "bank_ledger";
  return null; // old_gold, old_silver, advance — no cash/bank ledger entry
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pay_date, mode, direction, amount, notes, customer_id }: {
      id: string; pay_date: string; mode: string; direction: string; amount: number; notes?: string; customer_id?: string | null;
    }) => {
      const client = supabase();

      // Fetch old mode so we know which ledger table to migrate from
      const { data: current } = await client.from("payments").select("mode").eq("id", id).single();
      const oldTable = paymentLedgerTable(current?.mode ?? "");
      const newTable = paymentLedgerTable(mode);

      const { error } = await client.from("payments").update({ pay_date, mode, direction, amount, notes: notes ?? null, ...(customer_id !== undefined && { customer_id }) }).eq("id", id);
      if (error) throw error;

      if (oldTable === newTable) {
        // Same ledger table — just update in place
        if (newTable) {
          await client.from(newTable).update({ tx_date: pay_date, direction, amount }).eq("ref_type", "payment").eq("ref_id", id);
        }
      } else {
        // Mode changed ledger type — delete from old, insert into new
        if (oldTable) {
          await client.from(oldTable).delete().eq("ref_type", "payment").eq("ref_id", id);
        }
        if (newTable) {
          await client.from(newTable).insert({
            tx_date: pay_date, direction, amount,
            description: "Payment", ref_type: "payment", ref_id: id,
          });
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "payment").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "payment").eq("ref_id", id),
      ]);
      const { error } = await client.from("payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}
