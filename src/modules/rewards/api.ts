"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface RewardScore {
  bio_user_id: string;
  month: string;
  punctuality_pts: number;
  leave_pts: number;
  break_pts: number;
  cleanliness_pts: number;
  behavior_pts: number;
  dressing_pts: number;
  total_pts: number;
  on_time_days: number;
  leave_count: number;
  disciplined_break_days: number;
  neat_pct: number | null;
  updated_at: string;
  staff_name?: string;
}

export interface ConductMark {
  id: string;
  bio_user_id: string;
  month: string;
  category: "behavior" | "dressing";
  points: number;
  note: string;
  marked_by: string;
  created_at: string;
}

export interface RewardCriteria {
  id: number;
  category: string;
  label: string;
  max_pts: number;
  config: Record<string, any>;
}

export const REWARD_CATEGORIES = [
  { key: "punctuality_pts", label: "Punctuality",        max: 40, color: "text-blue-500",   icon: "⏰" },
  { key: "leave_pts",       label: "Leave Discipline",   max: 10, color: "text-green-500",  icon: "📅" },
  { key: "break_pts",       label: "Break Discipline",   max: 10, color: "text-orange-500", icon: "☕" },
  { key: "behavior_pts",    label: "Behavior",           max: 15, color: "text-red-500",    icon: "🤝" },
  { key: "dressing_pts",    label: "Dressing & Neatness",max: 15, color: "text-pink-500",   icon: "👔" },
  { key: "cleanliness_pts", label: "Cleanliness",        max: 10, color: "text-purple-500", icon: "🧹" },
] as const;

export const TOTAL_MAX = 100;

export function useRewardScores(month: string) {
  return useQuery<(RewardScore & { staff_name: string })[]>({
    queryKey: ["reward_scores", month],
    queryFn: async () => {
      const { data: scores, error } = await supabase()
        .from("monthly_reward_scores")
        .select("*")
        .eq("month", month)
        .order("total_pts", { ascending: false });
      if (error) throw error;
      if (!scores || scores.length === 0) return [];

      const { data: staffRows } = await supabase()
        .from("staff")
        .select("bio_user_id, name")
        .in("bio_user_id", scores.map(s => s.bio_user_id));

      const nameMap: Record<string, string> = {};
      (staffRows ?? []).forEach((s: any) => { nameMap[s.bio_user_id] = s.name; });

      return scores.map(s => ({
        ...s,
        behavior_pts: s.behavior_pts ?? 0,
        dressing_pts: s.dressing_pts ?? 0,
        staff_name: nameMap[s.bio_user_id] ?? s.bio_user_id,
      }));
    },
    enabled: !!month,
  });
}

export function useMyRewardScore(month: string, myBioUserId: string | null) {
  return useQuery<RewardScore | null>({
    queryKey: ["my_reward_score", month, myBioUserId],
    queryFn: async () => {
      if (!myBioUserId) return null;
      const { data, error } = await supabase()
        .from("monthly_reward_scores")
        .select("*")
        .eq("month", month)
        .eq("bio_user_id", myBioUserId)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...data, behavior_pts: data.behavior_pts ?? 0, dressing_pts: data.dressing_pts ?? 0 } : null;
    },
    enabled: !!myBioUserId && !!month,
  });
}

export function useConductMarks(month: string) {
  return useQuery<ConductMark[]>({
    queryKey: ["conduct_marks", month],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("staff_conduct_marks")
        .select("*")
        .eq("month", month)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!month,
  });
}

export function useAddConductMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mark: {
      bio_user_id: string;
      month: string;
      category: "behavior" | "dressing";
      points: number;
      note: string;
      marked_by: string;
    }) => {
      const { error } = await supabase().from("staff_conduct_marks").insert(mark);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["conduct_marks", v.month] });
    },
  });
}

export function useDeleteConductMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, month }: { id: string; month: string }) => {
      const { error } = await supabase().from("staff_conduct_marks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["conduct_marks", v.month] });
    },
  });
}

export function useUpdateConductMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, month, points, note }: { id: string; month: string; points: number; note: string }) => {
      const { error } = await supabase()
        .from("staff_conduct_marks")
        .update({ points, note })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["conduct_marks", v.month] });
    },
  });
}

export function useRefreshRewards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (month: string) => {
      const { error } = await supabase().rpc("refresh_monthly_rewards", { p_month: month });
      if (error) throw error;
    },
    onSuccess: (_, month) => {
      qc.invalidateQueries({ queryKey: ["reward_scores", month] });
      qc.invalidateQueries({ queryKey: ["my_reward_score"] });
    },
  });
}

export function useAllStaff() {
  return useQuery<{ bio_user_id: string; name: string }[]>({
    queryKey: ["all_staff_list"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("staff")
        .select("bio_user_id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
