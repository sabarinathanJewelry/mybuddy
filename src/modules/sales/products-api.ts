"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface Product {
  id: string;
  name: string;
  metal: string;
  default_purity_pct: number | null;
  default_va_pct: number;
  default_making_amt: number;
  active: boolean;
}

export function useProducts(activeOnly = true) {
  return useQuery<Product[]>({
    queryKey: ["products", activeOnly],
    queryFn: async () => {
      let q = supabase().from("products").select("*").order("name");
      if (activeOnly) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Product> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase().from("products").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase().from("products").insert(rest);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
