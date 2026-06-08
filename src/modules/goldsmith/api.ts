"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type GoldsmithJob = {
  id: string;
  job_no: string;
  goldsmith_name: string;
  item_description: string;
  status: "sent" | "received" | "sold";
  sent_date: string;
  sent_purity: string;
  sent_grams: number;
  received_date: string | null;
  received_purity: string | null;
  received_grams: number | null;
  charges_amount: number;
  charges_notes: string | null;
  sale_amount: number | null;
  sale_date: string | null;
  notes: string | null;
  created_at: string;
};

export function useGoldsmithJobs() {
  return useQuery<GoldsmithJob[]>({
    queryKey: ["goldsmith-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("goldsmith_jobs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoldsmithJob[];
    },
  });
}

export function useCreateGoldsmithJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      goldsmith_name: string;
      item_description: string;
      sent_date: string;
      sent_purity: string;
      sent_grams: number;
      notes?: string;
    }) => {
      const client = supabase();
      const { count } = await client
        .from("goldsmith_jobs")
        .select("id", { count: "exact", head: true });
      const job_no = `GS-${String((count ?? 0) + 1).padStart(3, "0")}`;
      const { error } = await client.from("goldsmith_jobs").insert({
        ...payload,
        job_no,
        status: "sent",
        notes: payload.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goldsmith-jobs"] }),
  });
}

export function useUpdateGoldsmithJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      status?: string;
      received_date?: string;
      received_purity?: string;
      received_grams?: number;
      charges_amount?: number;
      charges_notes?: string;
      sale_amount?: number;
      sale_date?: string;
    }) => {
      const { error } = await supabase()
        .from("goldsmith_jobs")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goldsmith-jobs"] }),
  });
}
