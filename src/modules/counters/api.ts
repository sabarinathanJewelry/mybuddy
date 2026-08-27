"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export const CHECK_SLOTS = [
  "09:30","10:30","11:30","12:30","13:30",
  "14:30","15:30","16:30","17:30","18:30",
  "19:30","20:30","21:30",
];

export interface Counter { id: number; name: string; display_order: number; }
export interface CounterAssignment { id: string; counter_id: number; bio_user_id: string; month: string; }
export interface CounterSupervisor { id: string; bio_user_id: string; month: string; }
export interface CleanlinessCheck {
  id: string; counter_id: number; check_date: string; check_slot: string;
  is_neat: boolean; notes: string | null; checked_by: string; created_at: string;
}

export function getCurrentSlot(): string | null {
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const firstSlotMins = 9 * 60 + 30;
  const lastSlotMins  = 21 * 60 + 30;
  if (currentMins < firstSlotMins || currentMins > lastSlotMins + 59) return null;
  let last: string | null = null;
  for (const slot of CHECK_SLOTS) {
    const [h, m] = slot.split(":").map(Number);
    if (h * 60 + m <= currentMins) last = slot;
  }
  return last;
}

export function useCounters() {
  return useQuery<Counter[]>({
    queryKey: ["counters"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("counters").select("*").order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCounterAssignments(month: string) {
  return useQuery<CounterAssignment[]>({
    queryKey: ["counter_assignments", month],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("counter_assignments").select("*").eq("month", month);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCounterSupervisor(month: string) {
  return useQuery<CounterSupervisor | null>({
    queryKey: ["counter_supervisor", month],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("counter_supervisors").select("*").eq("month", month).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCleanlinessChecks(month: string) {
  return useQuery<CleanlinessCheck[]>({
    queryKey: ["cleanliness_checks", month],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("cleanliness_checks")
        .select("*")
        .gte("check_date", `${month}-01`)
        .lte("check_date", `${month}-31`)
        .order("check_date").order("check_slot");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTodayChecks(date: string) {
  return useQuery<CleanlinessCheck[]>({
    queryKey: ["cleanliness_checks_today", date],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("cleanliness_checks").select("*").eq("check_date", date);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function useSaveCounterAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ counter_id, bio_user_id, month }: { counter_id: number; bio_user_id: string; month: string }) => {
      if (!bio_user_id) {
        const { error } = await supabase()
          .from("counter_assignments").delete().eq("counter_id", counter_id).eq("month", month);
        if (error) throw error;
      } else {
        const { error } = await supabase()
          .from("counter_assignments")
          .upsert({ counter_id, bio_user_id, month }, { onConflict: "counter_id,month" });
        if (error) throw error;
      }
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["counter_assignments", v.month] }),
  });
}

export function useUpdateCounterName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { error } = await supabase().from("counters").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counters"] }),
  });
}

export function useSaveCounterSupervisor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bio_user_id, month }: { bio_user_id: string; month: string }) => {
      const { error } = await supabase()
        .from("counter_supervisors")
        .upsert({ bio_user_id, month }, { onConflict: "month" });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["counter_supervisor", v.month] }),
  });
}

export function useSubmitChecks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (checks: { counter_id: number; check_date: string; check_slot: string; is_neat: boolean; notes?: string; checked_by: string }[]) => {
      const { error } = await supabase()
        .from("cleanliness_checks")
        .upsert(checks, { onConflict: "counter_id,check_date,check_slot" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cleanliness_checks"] });
      qc.invalidateQueries({ queryKey: ["cleanliness_checks_today"] });
    },
  });
}
