"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { inr } from "@/lib/format";

export type PartnerAccount = {
  id: string;
  name: string;
  account_type: "upi" | "bank";
  account_no: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type PartnerSettlement = {
  id: string;
  partner_account_id: string;
  amount: number;
  settled_date: string;
  notes: string | null;
  created_at: string;
};

export type PartnerBalance = PartnerAccount & {
  total_received: number;
  total_settled: number;
  outstanding: number;
};

export function usePartnerAccounts() {
  return useQuery<PartnerAccount[]>({
    queryKey: ["partner-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("partner_accounts")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PartnerAccount[];
    },
  });
}

export function usePartnerBalances() {
  return useQuery<PartnerBalance[]>({
    queryKey: ["partner-balances"],
    queryFn: async () => {
      const client = supabase();
      const [accountsRes, paymentsRes, orderPayRes, salePayRes, settleRes] = await Promise.all([
        client.from("partner_accounts").select("*").order("name"),
        client.from("payments")
          .select("partner_account_id, amount")
          .not("partner_account_id", "is", null)
          .gt("amount", 0),
        client.from("order_payments")
          .select("partner_account_id, amount")
          .not("partner_account_id", "is", null)
          .gt("amount", 0),
        client.from("sale_payments")
          .select("partner_account_id, amount")
          .not("partner_account_id", "is", null)
          .gt("amount", 0),
        client.from("partner_settlements")
          .select("partner_account_id, amount")
          .gt("amount", 0),
      ]);

      const received: Record<string, number> = {};
      const settled: Record<string, number> = {};

      for (const p of [...(paymentsRes.data ?? []), ...(orderPayRes.data ?? []), ...(salePayRes.data ?? [])]) {
        if (p.partner_account_id)
          received[p.partner_account_id] = (received[p.partner_account_id] ?? 0) + Number(p.amount);
      }
      for (const s of settleRes.data ?? []) {
        settled[s.partner_account_id] = (settled[s.partner_account_id] ?? 0) + Number(s.amount);
      }

      return ((accountsRes.data ?? []) as PartnerAccount[]).map((a) => ({
        ...a,
        total_received: received[a.id] ?? 0,
        total_settled: settled[a.id] ?? 0,
        outstanding: (received[a.id] ?? 0) - (settled[a.id] ?? 0),
      }));
    },
  });
}

export function usePartnerSettlements(partnerId: string | null) {
  return useQuery<PartnerSettlement[]>({
    queryKey: ["partner-settlements", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("partner_settlements")
        .select("*")
        .eq("partner_account_id", partnerId!)
        .order("settled_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnerSettlement[];
    },
  });
}

export function useSavePartnerAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Omit<PartnerAccount, "id" | "created_at"> & { id?: string }) => {
      const { id, ...rest } = a;
      if (id) {
        const { error } = await supabase().from("partner_accounts").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase().from("partner_accounts").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-accounts"] });
      qc.invalidateQueries({ queryKey: ["partner-balances"] });
    },
  });
}

export function useDeletePartnerAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("partner_accounts").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-accounts"] });
      qc.invalidateQueries({ queryKey: ["partner-balances"] });
    },
  });
}

export function useAddSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { partner_account_id: string; amount: number; settled_date: string; notes?: string }) => {
      const { error } = await supabase().from("partner_settlements").insert(s);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-balances"] });
      qc.invalidateQueries({ queryKey: ["partner-settlements"] });
    },
  });
}

export function useDeleteSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("partner_settlements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-balances"] });
      qc.invalidateQueries({ queryKey: ["partner-settlements"] });
    },
  });
}
