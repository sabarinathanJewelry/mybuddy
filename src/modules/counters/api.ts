"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

// Three fixed spot-check slots per day
export const CHECK_SLOTS = ["Morning", "Afternoon", "Evening"] as const;
export type CheckSlot = typeof CHECK_SLOTS[number];

// Slot windows: Morning 9:00–13:00, Afternoon 13:00–17:00, Evening 17:00–close
const SLOT_START_HOUR: Record<CheckSlot, number> = { Morning: 9, Afternoon: 13, Evening: 17 };
const SLOT_END_HOUR:   Record<CheckSlot, number> = { Morning: 13, Afternoon: 17, Evening: 23 };

export interface Counter { id: number; name: string; display_order: number; }
export interface CounterAssignment { id: string; counter_id: number; bio_user_id: string; month: string; }
export interface CounterSupervisor { id: string; bio_user_id: string; month: string; }
export interface CleanlinessCheck {
  id: string; counter_id: number; check_date: string; check_slot: string;
  is_neat: boolean; notes: string | null; checked_by: string; created_at: string;
}

export function getCurrentSlot(): CheckSlot | null {
  const h = new Date().getHours();
  for (const slot of CHECK_SLOTS) {
    if (h >= SLOT_START_HOUR[slot] && h < SLOT_END_HOUR[slot]) return slot;
  }
  return null;
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

export function useAddCounterAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ counter_id, bio_user_id, month }: { counter_id: number; bio_user_id: string; month: string }) => {
      const { error } = await supabase()
        .from("counter_assignments")
        .upsert({ counter_id, bio_user_id, month }, { onConflict: "counter_id,bio_user_id,month" });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["counter_assignments", v.month] }),
  });
}

export function useRemoveCounterAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ counter_id, bio_user_id, month }: { counter_id: number; bio_user_id: string; month: string }) => {
      const { error } = await supabase()
        .from("counter_assignments")
        .delete()
        .eq("counter_id", counter_id)
        .eq("bio_user_id", bio_user_id)
        .eq("month", month);
      if (error) throw error;
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
