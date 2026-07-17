"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import type { ConductCategory, ConductNote, StaffOption } from "./types";

export function useActiveStaff() {
  return useQuery<StaffOption[]>({
    queryKey: ["staff-active"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("staff")
        .select("id, name, designation")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConductCategories() {
  return useQuery<ConductCategory[]>({
    queryKey: ["conduct-categories"],
    queryFn: async () => {
      const { data, error } = await supabase().from("conduct_categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddConductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase().from("conduct_categories").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conduct-categories"] }),
  });
}

export function useDeleteConductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase().from("conduct_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conduct-categories"] }),
  });
}

export function useConductNotes(month: string) {
  // month = "YYYY-MM"
  return useQuery<ConductNote[]>({
    queryKey: ["conduct-notes", month],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("conduct_notes")
        .select("*")
        .gte("note_date", `${month}-01`)
        .lt("note_date", nextMonth(month))
        .order("note_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${next}-01`;
}

export function useAddConductNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      staff_id: string;
      staff_name: string;
      category_id: number | null;
      note: string;
      note_date: string;
    }) => {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();
      const profile = useAuth.getState().profile;
      const { error } = await client.from("conduct_notes").insert({
        ...payload,
        noted_by: user?.id ?? null,
        noted_by_name: profile?.display_name ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conduct-notes"] }),
  });
}

export function useResolveConductNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; status: "fined" | "dismissed"; fine_amount?: number | null }) => {
      const client = supabase();
      const { data: { user } } = await client.auth.getUser();
      const profile = useAuth.getState().profile;
      const { error } = await client
        .from("conduct_notes")
        .update({
          status: payload.status,
          fine_amount: payload.fine_amount ?? null,
          resolved_by: user?.id ?? null,
          resolved_by_name: profile?.display_name ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conduct-notes"] }),
  });
}
