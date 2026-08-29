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
  total_pts: number;
  on_time_days: number;
  leave_count: number;
  disciplined_break_days: number;
  neat_pct: number | null;
  updated_at: string;
  // joined from staff
  staff_name?: string;
}

export interface RewardCriteria {
  id: number;
  category: string;
  label: string;
  max_pts: number;
  config: Record<string, any>;
}

export const REWARD_CATEGORIES = [
  { key: "punctuality_pts", label: "Punctuality",      max: 25, color: "text-blue-500",  icon: "⏰" },
  { key: "leave_pts",       label: "Leave Discipline", max: 10, color: "text-green-500", icon: "📅" },
  { key: "break_pts",       label: "Break Discipline", max: 10, color: "text-orange-500",icon: "☕" },
  { key: "cleanliness_pts", label: "Cleanliness",      max: 15, color: "text-purple-500",icon: "🧹" },
] as const;

export const TOTAL_MAX = 60;

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
      return data;
    },
    enabled: !!myBioUserId && !!month,
  });
}

export function useRewardCriteria() {
  return useQuery<RewardCriteria[]>({
    queryKey: ["reward_criteria"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("reward_criteria")
        .select("*")
        .order("id");
      if (error) throw error;
      return data ?? [];
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
