"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useBoardRate } from "@/stores/board-rate";

export interface BoardRateRow {
  id: number;
  gold_22k: number;
  gold_24k: number;
  gold_18k: number;
  silver: number;
  silver_pure: number;
  effective_date: string;
  created_at: string;
}

export function useBoardRateHistory(limit = 30) {
  return useQuery<BoardRateRow[]>({
    queryKey: ["board-rate-history", limit],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("board_rates")
        .select("*")
        .order("effective_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveBoardRate() {
  const qc = useQueryClient();
  const setRate = useBoardRate((s) => s.setRate);

  return useMutation({
    mutationFn: async (values: Omit<BoardRateRow, "id" | "created_at">) => {
      const { data, error } = await supabase()
        .from("board_rates")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as BoardRateRow;
    },
    onSuccess: (row) => {
      setRate(row);
      qc.invalidateQueries({ queryKey: ["board-rate-history"] });
    },
  });
}
