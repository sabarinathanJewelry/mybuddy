"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { fyForDate } from "@/lib/fy";

type Plan = { id: string; fy: string; kind: "goal" | "action"; title: string; value: string | null; done: boolean; sort_order: number };

const inp = "border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
const shortFy = (fy: string) => `${fy.slice(0, 4)}-${fy.slice(-2)}`;

export function BusinessPlan() {
  const qc = useQueryClient();
  const current = shortFy(fyForDate(new Date()));
  const [fy, setFy] = useState("");
  const [form, setForm] = useState<{ kind: "goal" | "action"; title: string; value: string }>({ kind: "goal", title: "", value: "" });

  const plans = useQuery({
    queryKey: ["business-plans"],
    queryFn: async () => {
      const { data, error } = await supabase().from("business_plans").select("*").order("fy", { ascending: false }).order("kind").order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const fys = [...new Set([current, ...(plans.data ?? []).map((p) => p.fy)])].sort().reverse();
  const sel = fy || fys.find((f) => (plans.data ?? []).some((p) => p.fy === f)) || current;
  const list = (plans.data ?? []).filter((p) => p.fy === sel);
  const refresh = () => qc.invalidateQueries({ queryKey: ["business-plans"] });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase().from("business_plans").insert({
        fy: sel, kind: form.kind, title: form.title.trim(), value: form.kind === "goal" ? form.value.trim() || null : null, sort_order: list.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { setForm((f) => ({ ...f, title: "", value: "" })); refresh(); },
  });
  const toggle = useMutation({
    mutationFn: async (p: Plan) => { const { error } = await supabase().from("business_plans").update({ done: !p.done }).eq("id", p.id); if (error) throw error; },
    onSuccess: refresh,
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase().from("business_plans").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh,
  });

  const Section = ({ kind, label }: { kind: "goal" | "action"; label: string }) => (
    <div>
      <p className="text-xs font-medium text-ink-dim mb-1">{label}</p>
      {list.filter((p) => p.kind === kind).length === 0 && <p className="text-xs text-ink-dim">None yet</p>}
      {list.filter((p) => p.kind === kind).map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-1 border-t border-line first:border-t-0 text-sm">
          <input type="checkbox" checked={p.done} onChange={() => toggle.mutate(p)} />
          <span className={`flex-1 ${p.done ? "line-through text-ink-dim" : "text-ink"}`}>{p.title}</span>
          {p.value && <span className="font-mono text-gold">{p.value}</span>}
          <button onClick={() => { if (confirm(`Delete "${p.title}"?`)) del.mutate(p.id); }} className="text-xs text-err hover:underline">Delete</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-white border border-line rounded-lg2 shadow-soft">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <p className="font-semibold text-ink mr-auto">Goals &amp; Action Plan</p>
        <select value={sel} onChange={(e) => setFy(e.target.value)} className={inp}>
          {fys.map((f) => <option key={f} value={f}>FY {f}</option>)}
        </select>
      </div>
      {plans.error && <p className="px-4 py-2 text-sm text-err">{(plans.error as Error).message}</p>}
      <div className="grid md:grid-cols-2 gap-6 p-4">
        <Section kind="goal" label="Goals" />
        <Section kind="action" label="Action plan" />
      </div>
      <div className="px-4 py-3 border-t border-line flex gap-2 flex-wrap">
        <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "goal" | "action" }))} className={inp}>
          <option value="goal">Goal</option><option value="action">Action</option>
        </select>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={form.kind === "goal" ? "e.g. Gold sales" : "e.g. Start Instagram ads"} className={`${inp} flex-1 min-w-[160px]`} />
        {form.kind === "goal" && <input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} placeholder="Target, e.g. 65 kg" className={`${inp} w-36`} />}
        <button onClick={() => add.mutate()} disabled={!form.title.trim() || add.isPending} className="px-3 py-1.5 rounded-lg2 bg-gold text-white text-sm disabled:opacity-50">Add to FY {sel}</button>
      </div>
    </div>
  );
}
