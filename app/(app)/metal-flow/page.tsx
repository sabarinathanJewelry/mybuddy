"use client";

import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { useAuth } from "@/stores/auth";
import { useT } from "@/i18n";
import { grams, shortDate } from "@/lib/format";

const TABS = ["intake", "batches", "reserve"] as const;
type Tab = (typeof TABS)[number];

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

// ─── Data hooks ────────────────────────────────────────────────────────────────

function fyStart() {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-04-01`;
}

function useIntake(fromDate: string) {
  return useQuery({
    queryKey: ["metal_intake", fromDate],
    queryFn: async () => {
      let q = supabase()
        .from("old_metal_intake")
        .select("*, customers(name)")
        .order("intake_date", { ascending: false });
      if (fromDate) q = q.gte("intake_date", fromDate);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useCustomers() {
  return useQuery({
    queryKey: ["customers_list"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("customers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

function useBatches() {
  return useQuery({
    queryKey: ["melt_batches"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("melt_batches")
        .select("*, melt_batch_items(id, gross_wt, purity_pct, pure_wt, intake_id), debris_wt")
        .order("batch_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useDispatches() {
  return useQuery({
    queryKey: ["metal_dispatches"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("metal_dispatches")
        .select("*, suppliers(name)")
        .order("dispatch_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useReserve() {
  return useQuery({
    queryKey: ["metal_reserve"],
    queryFn: async () => {
      const client = supabase();
      const [batchRes, dispatchRes, bullionRes, openingRes] = await Promise.all([
        client.from("melt_batches").select("metal, output_wt").eq("status", "refined"),
        client.from("metal_dispatches").select("metal, weight_g, purity_pct"),
        client.from("bullion_trades").select("trade_type, metal, pure_wt"),
        client.from("opening_balances").select("balance_type, amount")
          .in("balance_type", ["gold_g", "silver_g"])
          .order("effective_date", { ascending: false }),
      ]);
      const sum = (arr: any[], fn: (r: any) => boolean, key: string) =>
        (arr ?? []).filter(fn).reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0);

      const batches    = batchRes.data   ?? [];
      const dispatches = dispatchRes.data ?? [];
      const bullion    = bullionRes.data  ?? [];
      const openings   = openingRes.data  ?? [];

      const openingGoldG   = Number(openings.find((o: any) => o.balance_type === "gold_g")?.amount)   || 0;
      const openingSilverG = Number(openings.find((o: any) => o.balance_type === "silver_g")?.amount) || 0;

      const goldRefined    = sum(batches,    (r) => r.metal?.startsWith("gold"),    "output_wt");
      const goldBullionIn  = sum(bullion,    (r) => r.trade_type === "buy"  && r.metal === "gold",  "pure_wt");
      const goldDispatched = (dispatches ?? []).filter((r: any) => r.metal === "gold").reduce((s: number, r: any) => s + (Number(r.weight_g) || 0) * (Number(r.purity_pct) || 100) / 100, 0);
      const goldBullionOut = sum(bullion,    (r) => r.trade_type === "sell" && r.metal === "gold",  "pure_wt");

      const silverRefined    = sum(batches,    (r) => r.metal?.startsWith("silver"),  "output_wt");
      const silverBullionIn  = sum(bullion,    (r) => r.trade_type === "buy"  && r.metal === "silver", "pure_wt");
      const silverDispatched = (dispatches ?? []).filter((r: any) => r.metal === "silver").reduce((s: number, r: any) => s + (Number(r.weight_g) || 0) * (Number(r.purity_pct) || 100) / 100, 0);
      const silverBullionOut = sum(bullion,    (r) => r.trade_type === "sell" && r.metal === "silver", "pure_wt");

      return {
        goldReserve:   openingGoldG   + goldRefined   + goldBullionIn   - goldDispatched   - goldBullionOut,
        silverReserve: openingSilverG + silverRefined + silverBullionIn - silverDispatched - silverBullionOut,
        openingGoldG, goldRefined, goldBullionIn, goldDispatched, goldBullionOut,
        openingSilverG, silverRefined, silverBullionIn, silverDispatched, silverBullionOut,
      };
    },
  });
}

function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers_list"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("suppliers")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

// ─── Reserve breakdown helper (extracted to avoid JSX context loss) ──────────

function ReserveBreakdown({ refined, bullionIn, dispatched, cls }: {
  refined: number; bullionIn: number; dispatched: number; cls: string;
}) {
  const rows = [
    { label: "Refined:", value: grams(refined),              vc: cls },
    { label: "Bullion bought:", value: grams(bullionIn),     vc: cls },
    { label: "Dispatched:", value: "-" + grams(dispatched),  vc: "text-err" },
  ];
  return (
    <div className="mt-3 space-y-0.5 text-xs text-ink-dim">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between">
          <span>{row.label}</span>
          <span className={row.vc}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function MetalFlowPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("intake");

  // Intake
  const [intakeFromDate, setIntakeFromDate] = useState(fyStart);
  const { data: intakeData, isLoading: intakeLoading } = useIntake(intakeFromDate);
  const { data: customers = [] } = useCustomers();
  const [selectedIntake, setSelectedIntake] = useState<Set<string>>(new Set());
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [payoutRowId, setPayoutRowId] = useState<string | null>(null);
  const [payoutForm, setPayoutForm] = useState({ amount: 0, mode: "cash" as "cash" | "bank" });
  const [editIntakeId, setEditIntakeId] = useState<string | null>(null);
  const [editIntakeForm, setEditIntakeForm] = useState<{ intake_date: string; customer_id: string; metal: string; gross_wt: number; purity_pct: number; pure_wt: number; notes: string; payout_amount: number; payout_mode: "cash" | "bank" } | null>(null);
  const [metalFilter, setMetalFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "used" | "sold">("all");
  const defaultIntakeForm = () => ({
    intake_date: globalDate,
    customer_id: "",
    metal: "gold_22k" as string,
    gross_wt: 0,
    purity_pct: 91.6,
    pure_wt: 0,
    notes: "",
    payout_amount: 0,
    payout_mode: "cash" as "cash" | "bank",
  });
  const [intakeForm, setIntakeForm] = useState(defaultIntakeForm);

  // Batches
  const { data: batchData, isLoading: batchLoading } = useBatches();
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [newBatch, setNewBatch] = useState({ batch_no: "", batch_date: globalDate, metal: "gold_22k", notes: "" });
  const [showDirectReserve, setShowDirectReserve] = useState(false);
  const [directReserveForm, setDirectReserveForm] = useState({ batch_no: "", batch_date: globalDate, metal: "gold_22k", output_wt: 0, notes: "" });
  const [refineryForm, setRefineryForm] = useState<{ batchId: string; total_output_wt: number; debris_wt: number; output_wt: number; loss_wt: number; output_purity_pct: number } | null>(null);

  // Reserve & dispatches
  const { data: reserveData } = useReserve();
  const { data: suppliersData = [] } = useSuppliers();
  const { data: dispatchData, isLoading: dispatchLoading } = useDispatches();
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({ dispatch_date: globalDate, metal: "gold", weight_g: 0, purity_pct: 99.9, purpose: "supplier", supplier_id: "", party_name: "", notes: "" });
  const [editDispatchId, setEditDispatchId] = useState<string | null>(null);
  const [editDispatchForm, setEditDispatchForm] = useState({ dispatch_date: "", metal: "gold", weight_g: 0, purity_pct: 99.9, purpose: "supplier", supplier_id: "", party_name: "", notes: "" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const intake = (intakeData as any[]) ?? [];
  const filteredIntake = intake.filter((r: any) => {
    const metalOk = metalFilter === "all" || r.metal === metalFilter ||
      (metalFilter === "gold" && r.metal?.startsWith("gold")) ||
      (metalFilter === "silver" && r.metal?.startsWith("silver"));
    const statusOk = statusFilter === "all" || r.status === statusFilter;
    return metalOk && statusOk;
  });
  const filterTotalGross = filteredIntake.reduce((s: number, r: any) => s + (r.gross_wt ?? 0), 0);
  const filterTotalPure  = filteredIntake.reduce((s: number, r: any) => s + (r.pure_wt ?? 0), 0);
  const selectedItems    = intake.filter((i: any) => selectedIntake.has(i.id));
  const selectedGross    = selectedItems.reduce((s: number, i: any) => s + (i.gross_wt ?? 0), 0);
  const selectedPure     = selectedItems.reduce((s: number, i: any) => s + (i.pure_wt ?? 0), 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batches = (batchData as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatches = (dispatchData as any[]) ?? [];

  // ── Reserve breakdown (all pre-computed outside JSX) ──
  const goldReserve      = reserveData?.goldReserve      ?? 0;
  const silverReserve    = reserveData?.silverReserve    ?? 0;
  const goldRefined      = reserveData?.goldRefined      ?? 0;
  const goldBullionIn    = reserveData?.goldBullionIn    ?? 0;
  const goldDispatched   = reserveData?.goldDispatched   ?? 0;
  const silverRefined    = reserveData?.silverRefined    ?? 0;
  const silverBullionIn  = reserveData?.silverBullionIn  ?? 0;
  const silverDispatched = reserveData?.silverDispatched ?? 0;
  // Debris accumulated in debris box (from all refined batches)
  const totalDebrisGold   = batches.filter((b: any) => b.status === "refined" && b.metal?.startsWith("gold")).reduce((s: number, b: any) => s + (Number(b.debris_wt) || 0), 0);
  const totalDebrisSilver = batches.filter((b: any) => b.status === "refined" && b.metal?.startsWith("silver")).reduce((s: number, b: any) => s + (Number(b.debris_wt) || 0), 0);
  const suppliers = suppliersData as { id: string; name: string }[];

  // Debris → intake form
  const [debrisIntakeForm, setDebrisIntakeForm] = useState<{ metal: "gold" | "silver"; gross_wt: number; purity_pct: number; pure_wt: number; notes: string } | null>(null);

  // Link old-metal intake items to a refined batch
  const [linkBatchId, setLinkBatchId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSelected, setLinkSelected] = useState<Set<string>>(new Set());

  // ── Mutations ──

  const markSold = useMutation({
    mutationFn: async ({ id, undo }: { id: string; undo?: boolean }) => {
      const { error } = await supabase()
        .from("old_metal_intake")
        .update({ status: undo ? "pending" : "sold" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metal_intake"] }),
  });

  const sendDebrisToIntake = useMutation({
    mutationFn: async (d: NonNullable<typeof debrisIntakeForm>) => {
      const client = supabase();
      // 1. Create intake record for the debris
      const metal_code = d.metal === "gold" ? "gold_22k" : "silver";
      const { error } = await client.from("old_metal_intake").insert({
        intake_date: globalDate,
        metal: metal_code,
        gross_wt: parseFloat(d.gross_wt.toFixed(3)),
        purity_pct: d.purity_pct,
        pure_wt: parseFloat(d.pure_wt.toFixed(3)),
        source_type: "batch_debris",
        status: "pending",
        notes: d.notes || `Debris from melt batches — ${d.gross_wt.toFixed(3)}g`,
      });
      if (error) throw error;

      // 2. Zero out debris_wt on all contributing batches for this metal
      const contributingBatchIds = batches
        .filter((b: any) => b.status === "refined" && b.metal?.startsWith(d.metal) && Number(b.debris_wt) > 0)
        .map((b: any) => b.id as string);
      if (contributingBatchIds.length > 0) {
        await client.from("melt_batches").update({ debris_wt: 0 }).in("id", contributingBatchIds);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      setDebrisIntakeForm(null);
    },
  });

  const createBatch = useMutation({
    mutationFn: async (d: typeof newBatch) => {
      const { error } = await supabase().from("melt_batches").insert({
        batch_no: d.batch_no, batch_date: d.batch_date, metal: d.metal,
        input_wt: 0, status: "open", notes: d.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["melt_batches"] }); setShowNewBatch(false); setNewBatch({ batch_no: "", batch_date: globalDate, metal: "gold_22k", notes: "" }); },
  });

  const createDirectReserve = useMutation({
    mutationFn: async (d: typeof directReserveForm) => {
      if (!d.batch_no || d.output_wt <= 0) throw new Error("Batch number and output weight are required");
      const { error } = await supabase().from("melt_batches").insert({
        batch_no: d.batch_no, batch_date: d.batch_date, metal: d.metal,
        input_wt: 0, output_wt: d.output_wt, melt_wt: d.output_wt,
        output_purity_pct: 99.9, status: "refined",
        notes: d.notes || "Placeholder — intake items to be mapped later",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      setShowDirectReserve(false);
      setDirectReserveForm({ batch_no: "", batch_date: globalDate, metal: "gold_22k", output_wt: 0, notes: "" });
    },
  });

  const saveIntake = useMutation({
    mutationFn: async (d: ReturnType<typeof defaultIntakeForm>) => {
      const client = supabase();
      const { data: intakeRec, error } = await client.from("old_metal_intake").insert({
        intake_date: d.intake_date,
        metal: d.metal,
        gross_wt: d.gross_wt,
        purity_pct: d.purity_pct,
        pure_wt: d.pure_wt,
        customer_id: d.customer_id || null,
        notes: d.notes || null,
        source_type: "standalone",
        status: "pending",
        payout_amount: d.payout_amount > 0 ? d.payout_amount : null,
        payout_mode: d.payout_amount > 0 ? d.payout_mode : null,
      }).select("id").single();
      if (error) throw error;

      if (d.payout_amount > 0) {
        // Debit shop's cash or bank ledger (money going out to customer)
        const table = d.payout_mode === "bank" ? "bank_ledger" : "cash_ledger";
        const { error: ledgerErr } = await client.from(table).insert({
          tx_date: d.intake_date,
          direction: "out",
          amount: d.payout_amount,
          description: "Old gold purchase payout",
          ref_type: "old_metal_intake",
          ref_id: intakeRec?.id ?? null,
        });
        if (ledgerErr) throw ledgerErr;

        // Credit customer balance so their account reflects the advance they're owed
        if (d.customer_id) {
          const { error: payErr } = await client.from("payments").insert({
            pay_date: d.intake_date,
            direction: "in",
            mode: d.payout_mode === "bank" ? "bank" : "cash",
            amount: d.payout_amount,
            customer_id: d.customer_id,
            notes: "Old gold purchase — cash payout to customer",
          });
          if (payErr) console.warn("Customer payment record failed:", payErr);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
      setShowIntakeForm(false);
      setIntakeForm(defaultIntakeForm());
    },
  });

  const updateIntake = useMutation({
    mutationFn: async (d: NonNullable<typeof editIntakeForm> & { id: string }) => {
      const client = supabase();

      // Fetch current record so we know the old payout mode (for ledger table switch)
      const { data: cur } = await client
        .from("old_metal_intake")
        .select("payout_amount, payout_mode, customer_id")
        .eq("id", d.id)
        .maybeSingle();

      // Update the intake record
      const { error } = await client.from("old_metal_intake").update({
        intake_date: d.intake_date,
        metal: d.metal,
        gross_wt: d.gross_wt,
        purity_pct: d.purity_pct,
        pure_wt: d.pure_wt,
        customer_id: d.customer_id || null,
        notes: d.notes || null,
        payout_amount: d.payout_amount > 0 ? d.payout_amount : null,
        payout_mode:   d.payout_amount > 0 ? d.payout_mode   : null,
      }).eq("id", d.id);
      if (error) throw error;

      // Sync the cash/bank ledger entry
      if (d.payout_amount > 0) {
        const oldMode  = (cur?.payout_mode ?? "cash") as "cash" | "bank";
        const oldTable = oldMode === "bank" ? "bank_ledger" : "cash_ledger";
        const newTable = d.payout_mode === "bank" ? "bank_ledger" : "cash_ledger";

        if (oldMode === d.payout_mode) {
          // Same table — just update amount
          await client.from(newTable).update({ amount: d.payout_amount, tx_date: d.intake_date })
            .eq("ref_type", "old_metal_intake").eq("ref_id", d.id);
        } else {
          // Mode changed — move entry to the new table
          await client.from(oldTable).delete()
            .eq("ref_type", "old_metal_intake").eq("ref_id", d.id);
          await client.from(newTable).insert({
            tx_date: d.intake_date, direction: "out", amount: d.payout_amount,
            description: "Old gold purchase payout",
            ref_type: "old_metal_intake", ref_id: d.id,
          });
        }

        // Sync customer payment if linked
        if (d.customer_id) {
          await client.from("payments")
            .update({ amount: d.payout_amount, mode: d.payout_mode === "bank" ? "bank" : "cash", pay_date: d.intake_date })
            .eq("customer_id", d.customer_id)
            .eq("notes", "Old gold purchase — cash payout to customer");
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
      setEditIntakeId(null);
      setEditIntakeForm(null);
    },
  });

  const recordPayout = useMutation({
    mutationFn: async ({ intakeId, customerId }: { intakeId: string; customerId: string | null }) => {
      const client = supabase();
      const { amount, mode } = payoutForm;
      if (amount <= 0) throw new Error("Amount required");

      // Mark the intake record as paid out
      const { error: updErr } = await client.from("old_metal_intake")
        .update({ payout_amount: amount, payout_mode: mode })
        .eq("id", intakeId);
      if (updErr) throw updErr;

      // Debit shop cash/bank ledger
      const table = mode === "bank" ? "bank_ledger" : "cash_ledger";
      const { error: ledgerErr } = await client.from(table).insert({
        tx_date: new Date().toISOString().slice(0, 10),
        direction: "out",
        amount,
        description: "Old gold purchase payout",
        ref_type: "old_metal_intake",
        ref_id: intakeId,
      });
      if (ledgerErr) throw ledgerErr;

      // Credit customer balance if linked
      if (customerId) {
        const { error: payErr } = await client.from("payments").insert({
          pay_date: new Date().toISOString().slice(0, 10),
          direction: "in",
          mode: mode === "bank" ? "bank" : "cash",
          amount,
          customer_id: customerId,
          notes: "Old gold purchase — cash payout to customer",
        });
        if (payErr) console.warn("Customer payment record failed:", payErr);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      qc.invalidateQueries({ queryKey: ["ledger_detail"] });
      setPayoutRowId(null);
      setPayoutForm({ amount: 0, mode: "cash" });
    },
  });

  const addToBatch = useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => {
      const client = supabase();
      const items = intake.filter((i: any) => selectedIntake.has(i.id));
      if (!items.length) throw new Error("No items selected");
      // Get batch
      const { data: batch } = await client.from("melt_batches").select("input_wt").eq("id", batchId).single();
      const addedPureWt = items.reduce((s: number, i: any) => s + (i.pure_wt ?? 0), 0);
      // Insert batch items
      await client.from("melt_batch_items").insert(
        items.map((i: any) => ({ batch_id: batchId, intake_id: i.id, gross_wt: i.gross_wt, purity_pct: i.purity_pct, pure_wt: i.pure_wt }))
      );
      // Update batch input_wt and intake statuses
      await client.from("melt_batches").update({ input_wt: ((batch as any)?.input_wt ?? 0) + addedPureWt }).eq("id", batchId);
      await client.from("old_metal_intake").update({ status: "used" }).in("id", items.map((i: any) => i.id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      setSelectedIntake(new Set());
    },
  });

  const updateBatchStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase().from("melt_batches").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["melt_batches"] }),
  });

  const removeBatchItem = useMutation({
    mutationFn: async ({ batchId, itemId, intakeId, pureWt }: { batchId: string; itemId: string; intakeId: string; pureWt: number }) => {
      const client = supabase();
      const { data: batch } = await client.from("melt_batches").select("input_wt").eq("id", batchId).single();
      await client.from("melt_batch_items").delete().eq("id", itemId);
      await client.from("old_metal_intake").update({ status: "pending" }).eq("id", intakeId);
      await client.from("melt_batches").update({ input_wt: Math.max(0, ((batch as any)?.input_wt ?? 0) - pureWt) }).eq("id", batchId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
    },
  });

  const linkIntakeItems = useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => {
      const client = supabase();
      const items = intake.filter((i: any) => linkSelected.has(i.id));
      if (!items.length) throw new Error("No items selected");
      const { data: batch } = await client.from("melt_batches").select("input_wt").eq("id", batchId).single();
      const addedPureWt = items.reduce((s: number, i: any) => s + (Number(i.pure_wt) || 0), 0);
      await client.from("melt_batch_items").insert(
        items.map((i: any) => ({ batch_id: batchId, intake_id: i.id, gross_wt: i.gross_wt, purity_pct: i.purity_pct, pure_wt: i.pure_wt }))
      );
      await client.from("melt_batches").update({ input_wt: ((batch as any)?.input_wt ?? 0) + addedPureWt }).eq("id", batchId);
      await client.from("old_metal_intake").update({ status: "used" }).in("id", items.map((i: any) => i.id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      qc.invalidateQueries({ queryKey: ["metal_intake"] });
      qc.invalidateQueries({ queryKey: ["refinery_entries"] });
      setLinkBatchId(null);
      setLinkSearch("");
      setLinkSelected(new Set());
    },
  });

  const recordRefinery = useMutation({
    mutationFn: async (d: NonNullable<typeof refineryForm>) => {
      const purity = d.output_purity_pct || 91.6;
      // net usable = total from refinery − debris; reserve uses only usable portion
      const netUsable  = parseFloat(d.output_wt.toFixed(3));
      const pure_wt_999 = parseFloat((netUsable * (purity / 100)).toFixed(3));
      const { error } = await supabase().from("melt_batches").update({
        melt_wt:   netUsable,                // usable melted weight (after removing debris)
        output_wt: pure_wt_999,              // 999-pure equivalent of usable — goes to reserve
        loss_wt:   parseFloat(d.loss_wt.toFixed(3)),
        debris_wt: parseFloat((d.debris_wt || 0).toFixed(3)),
        output_purity_pct: purity,
        status: "refined",
      }).eq("id", d.batchId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["melt_batches"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      setRefineryForm(null);
    },
  });

  const saveDispatch = useMutation({
    mutationFn: async (d: typeof dispatchForm) => {
      const { error } = await supabase().from("metal_dispatches").insert({
        dispatch_date: d.dispatch_date, metal: d.metal, weight_g: d.weight_g,
        purity_pct: d.purity_pct,
        purpose: d.purpose,
        supplier_id: d.supplier_id || null,
        party_name: d.party_name || null,
        notes: d.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["metal_dispatches"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      if (vars.supplier_id) qc.invalidateQueries({ queryKey: ["supplier-360", vars.supplier_id] });
      setShowDispatch(false);
      setDispatchForm({ dispatch_date: globalDate, metal: "gold", weight_g: 0, purity_pct: 99.9, purpose: "supplier", supplier_id: "", party_name: "", notes: "" });
    },
  });

  const updateDispatch = useMutation({
    mutationFn: async ({ id, d }: { id: string; d: typeof editDispatchForm }) => {
      const { error } = await supabase().from("metal_dispatches").update({
        dispatch_date: d.dispatch_date, metal: d.metal, weight_g: d.weight_g,
        purity_pct: d.purity_pct, purpose: d.purpose,
        supplier_id: d.supplier_id || null,
        party_name: d.party_name || null,
        notes: d.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["metal_dispatches"] });
      qc.invalidateQueries({ queryKey: ["metal_reserve"] });
      qc.invalidateQueries({ queryKey: ["supplier-360", vars.d.supplier_id] });
      setEditDispatchId(null);
    },
  });

  const tabLabel: Record<Tab, string> = { intake: "Old Metal Intake", batches: "Melt Batches", reserve: "Reserve & Dispatch" };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("metal_flow")}</h1>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === tb ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"
            }`}>
            {tabLabel[tb]}
          </button>
        ))}
      </div>

      {/* ── INTAKE TAB ─────────────────────────────────────────── */}
      {tab === "intake" && (
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-line p-3 shadow-soft space-y-2">
            {/* Date range */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-dim font-medium w-12">From</span>
              {(() => {
                const now = new Date();
                const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
                const last3m = new Date(now); last3m.setMonth(last3m.getMonth() - 3);
                const last3mStr = `${last3m.getFullYear()}-${String(last3m.getMonth() + 1).padStart(2, "0")}-01`;
                const thisFY = fyStart();
                const presets = [
                  { label: "This Month", value: thisMonth },
                  { label: "Last 3M",    value: last3mStr },
                  { label: "This FY",    value: thisFY },
                  { label: "All time",   value: "" },
                ];
                return presets.map(p => (
                  <button key={p.label} onClick={() => setIntakeFromDate(p.value)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${intakeFromDate === p.value ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                    {p.label}
                  </button>
                ));
              })()}
              <input type="date" value={intakeFromDate}
                onChange={e => setIntakeFromDate(e.target.value)}
                className="border border-line rounded-lg2 px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-dim font-medium w-12">Metal</span>
              {[
                { label: "All", value: "all" },
                { label: "Gold", value: "gold" },
                { label: "Gold 22K", value: "gold_22k" },
                { label: "Gold 24K", value: "gold_24k" },
                { label: "Gold 18K", value: "gold_18k" },
                { label: "Silver", value: "silver" },
              ].map((f) => (
                <button key={f.value} onClick={() => setMetalFilter(f.value)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${metalFilter === f.value ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-dim font-medium w-12">Status</span>
              {([["all", "All"], ["pending", "Ready to Melt"], ["used", "Used"], ["sold", "Sold to Supplier"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${statusFilter === v
                    ? v === "pending" ? "bg-warn text-white border-warn"
                    : v === "used"    ? "bg-ok text-white border-ok"
                    : v === "sold"    ? "bg-info text-white border-info"
                    : "bg-ink text-white border-ink"
                    : "border-line text-ink-dim hover:border-gold"}`}>
                  {l}
                </button>
              ))}
              {(metalFilter !== "all" || statusFilter !== "all") && (
                <button onClick={() => { setMetalFilter("all"); setStatusFilter("all"); }}
                  className="text-xs text-err hover:underline ml-2">Clear filters</button>
              )}
            </div>
            {/* Summary */}
            <div className="flex items-center gap-4 pt-1 border-t border-line text-xs text-ink-dim">
              <span><strong className="text-ink">{filteredIntake.length}</strong> items</span>
              <span>Gross: <strong className="text-ink">{grams(filterTotalGross)}</strong></span>
              <span>Pure: <strong className="text-gold">{grams(filterTotalPure)}</strong></span>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowIntakeForm(true)}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
              + Add Old Metal
            </button>
          </div>

          {showIntakeForm && (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-4">
              <h3 className="text-sm font-semibold">Record Old Metal Intake</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={intakeForm.intake_date}
                    onChange={(e) => setIntakeForm({ ...intakeForm, intake_date: e.target.value })}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Customer</label>
                  <select value={intakeForm.customer_id}
                    onChange={(e) => setIntakeForm({ ...intakeForm, customer_id: e.target.value })}
                    className={inp}>
                    <option value="">— walk-in / no customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={intakeForm.metal}
                    onChange={(e) => setIntakeForm({ ...intakeForm, metal: e.target.value })}
                    className={inp}>
                    <option value="gold_22k">Gold 22K</option>
                    <option value="gold_24k">Gold 24K</option>
                    <option value="gold_18k">Gold 18K</option>
                    <option value="silver">Silver</option>
                    <option value="silver_pure">Silver Pure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Gross Wt (g) *</label>
                  <input type="number" step="0.001" value={intakeForm.gross_wt || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const gross = parseFloat(e.target.value) || 0;
                      setIntakeForm({ ...intakeForm, gross_wt: gross, pure_wt: parseFloat((gross * intakeForm.purity_pct / 100).toFixed(3)) });
                    }}
                    className={inp} placeholder="0.000" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Purity %</label>
                  <div className="flex gap-1 mb-1">
                    {[["22K", 91.6], ["18K", 75.0], ["24K", 99.9]].map(([label, val]) => (
                      <button key={label as string} type="button"
                        onClick={() => {
                          const pct = val as number;
                          setIntakeForm({ ...intakeForm, purity_pct: pct, pure_wt: parseFloat((intakeForm.gross_wt * pct / 100).toFixed(3)) });
                        }}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${intakeForm.purity_pct === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <input type="number" step="0.01" value={intakeForm.purity_pct || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value) || 0;
                      setIntakeForm({ ...intakeForm, purity_pct: pct, pure_wt: parseFloat((intakeForm.gross_wt * pct / 100).toFixed(3)) });
                    }}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Pure Wt (g)</label>
                  <input type="number" step="0.001" value={intakeForm.pure_wt || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setIntakeForm({ ...intakeForm, pure_wt: parseFloat(e.target.value) || 0 })}
                    className={`${inp} bg-canvas`} />
                </div>
              </div>

              <div className="border-t border-line pt-3 space-y-2">
                <p className="text-xs font-medium text-ink-dim">Cash Payout to Customer (optional)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Amount Paid (₹)</label>
                    <input type="number" step="1" value={intakeForm.payout_amount || ""}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setIntakeForm({ ...intakeForm, payout_amount: parseFloat(e.target.value) || 0 })}
                      className={inp} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Paid via</label>
                    <select value={intakeForm.payout_mode}
                      onChange={(e) => setIntakeForm({ ...intakeForm, payout_mode: e.target.value as "cash" | "bank" })}
                      className={inp}>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank / UPI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-ink-dim mb-1">Notes</label>
                    <input value={intakeForm.notes}
                      onChange={(e) => setIntakeForm({ ...intakeForm, notes: e.target.value })}
                      className={inp} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!intakeForm.gross_wt || saveIntake.isPending}
                  onClick={() => saveIntake.mutate(intakeForm)}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                  {saveIntake.isPending ? "Saving…" : t("save")}
                </button>
                <button onClick={() => { setShowIntakeForm(false); setIntakeForm(defaultIntakeForm()); }}
                  className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
              {saveIntake.isError && (
                <p className="text-xs text-err">Save failed — please try again.</p>
              )}
            </div>
          )}

          {selectedIntake.size > 0 && (
            <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold"><strong>{selectedIntake.size}</strong> item(s) selected</span>
                <span className="text-xs text-ink-dim">Gross: <strong className="text-ink">{grams(selectedGross)}</strong></span>
                <span className="text-xs text-ink-dim">Pure: <strong className="text-gold">{grams(selectedPure)}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-dim">Add to batch:</span>
                <select
                  onChange={(e) => e.target.value && addToBatch.mutate({ batchId: e.target.value })}
                  className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none">
                  <option value="">— select batch —</option>
                  {batches.filter((b: any) => b.status === "open" || (b.status === "refined" && Number(b.input_wt) === 0)).map((b: any) => (
                    <option key={b.id} value={b.id}>{b.batch_no} ({b.metal?.replace("_", " ")}){b.status === "refined" ? " — map items" : ""}</option>
                  ))}
                </select>
                <button onClick={() => setSelectedIntake(new Set())} className="text-xs text-err hover:underline">Clear</button>
              </div>
            </div>
          )}

          {intakeLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: "700px" }}>
                <thead>
                  <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="px-4 py-2.5 w-8">
                      <input type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIntake(new Set(filteredIntake.filter((i: any) => i.status === "pending").map((i: any) => i.id)));
                          else setSelectedIntake(new Set());
                        }} className="accent-gold" />
                    </th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Customer</th>
                    <th className="text-left px-3 py-2.5">Metal</th>
                    <th className="text-right px-3 py-2.5">Gross</th>
                    <th className="text-right px-3 py-2.5">Purity%</th>
                    <th className="text-right px-3 py-2.5">Pure Wt</th>
                    <th className="text-left px-3 py-2.5">Status</th>
                    <th className="text-left px-3 py-2.5">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIntake.map((r: any) => (
                    <>
                      <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5">
                          {r.status === "pending" && (
                            <input type="checkbox" className="accent-gold"
                              checked={selectedIntake.has(r.id)}
                              onChange={(e) => {
                                const s = new Set(selectedIntake);
                                if (e.target.checked) s.add(r.id); else s.delete(r.id);
                                setSelectedIntake(s);
                              }} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink-dim">{shortDate(r.intake_date)}</td>
                        <td className="px-3 py-2.5">{r.customers?.name ?? "—"}</td>
                        <td className="px-3 py-2.5 capitalize text-ink-dim">{r.metal?.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2.5 text-right">{grams(r.gross_wt)}</td>
                        <td className="px-3 py-2.5 text-right text-ink-dim">{r.purity_pct}%</td>
                        <td className="px-3 py-2.5 text-right text-gold font-mono">{grams(r.pure_wt)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            r.status === "pending" ? "bg-warn/10 text-warn" :
                            r.status === "used"    ? "bg-ok/10 text-ok"    :
                            r.status === "sold"    ? "bg-info/10 text-info" :
                            "bg-line text-ink-dim"
                          }`}>
                            {r.status === "sold" ? "Sold to supplier" : r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.source_type === "batch_debris" ? (
                              <span className="text-xs text-warn font-medium">Debris box</span>
                            ) : r.source_type === "sale" || r.source_type === "order" ? (
                              <span className="text-xs text-ink-dim">
                                Via {r.source_type} — paid
                              </span>
                            ) : r.payout_amount > 0 ? (
                              <span className="text-xs text-ok font-medium">
                                ✓ {r.payout_mode === "bank" ? "Bank" : "Cash"} paid
                              </span>
                            ) : (
                              <button
                                onClick={() => { setPayoutRowId(r.id); setPayoutForm({ amount: 0, mode: "cash" }); }}
                                className="text-xs text-gold hover:underline">
                                + Pay Out
                              </button>
                            )}
                            {r.status === "pending" && (
                              <button
                                disabled={markSold.isPending}
                                onClick={() => {
                                  if (confirm(`Mark ${grams(r.gross_wt)} (${r.metal?.replace(/_/g, " ")}) as sold to supplier?\n\nThis removes it from the pending list. Make sure you've recorded the corresponding bullion sell trade.`)) {
                                    markSold.mutate({ id: r.id });
                                  }
                                }}
                                className="text-xs text-info border border-info/30 px-2 py-0.5 rounded hover:bg-info/10 whitespace-nowrap disabled:opacity-50">
                                Sold to Supplier
                              </button>
                            )}
                            {r.status === "sold" && (
                              <button
                                onClick={() => markSold.mutate({ id: r.id, undo: true })}
                                className="text-xs text-ink-dim hover:text-warn hover:underline">
                                Undo
                              </button>
                            )}
                            {r.status === "pending" && (
                              <button
                                onClick={() => {
                                  setEditIntakeId(r.id);
                                  setEditIntakeForm({
                                    intake_date: r.intake_date,
                                    customer_id: r.customer_id ?? "",
                                    metal: r.metal,
                                    gross_wt: r.gross_wt,
                                    purity_pct: r.purity_pct,
                                    pure_wt: r.pure_wt,
                                    notes: r.notes ?? "",
                                    payout_amount: r.payout_amount ?? 0,
                                    payout_mode: (r.payout_mode ?? "cash") as "cash" | "bank",
                                  });
                                  setPayoutRowId(null);
                                }}
                                className="text-xs text-ink-dim hover:text-gold hover:underline">
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {editIntakeId === r.id && editIntakeForm && (
                        <tr className="bg-canvas/60">
                          <td colSpan={9} className="px-4 py-4">
                            <div className="space-y-3">
                              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Edit Intake</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                                  <input type="date" value={editIntakeForm.intake_date}
                                    onChange={e => setEditIntakeForm({ ...editIntakeForm, intake_date: e.target.value })}
                                    className={inp} />
                                </div>
                                <div>
                                  <label className="block text-xs text-ink-dim mb-1">Customer</label>
                                  <select value={editIntakeForm.customer_id}
                                    onChange={e => setEditIntakeForm({ ...editIntakeForm, customer_id: e.target.value })}
                                    className={inp}>
                                    <option value="">— walk-in / no customer —</option>
                                    {customers.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                                  <select value={editIntakeForm.metal}
                                    onChange={e => setEditIntakeForm({ ...editIntakeForm, metal: e.target.value })}
                                    className={inp}>
                                    <option value="gold_22k">Gold 22K</option>
                                    <option value="gold_24k">Gold 24K</option>
                                    <option value="gold_18k">Gold 18K</option>
                                    <option value="silver">Silver</option>
                                    <option value="silver_pure">Silver Pure</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-ink-dim mb-1">Gross Wt (g)</label>
                                  <input type="number" step="0.001" value={editIntakeForm.gross_wt || ""}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                      const gross = parseFloat(e.target.value) || 0;
                                      setEditIntakeForm({ ...editIntakeForm, gross_wt: gross, pure_wt: parseFloat((gross * editIntakeForm.purity_pct / 100).toFixed(3)) });
                                    }}
                                    className={inp} />
                                </div>
                                <div>
                                  <label className="block text-xs text-ink-dim mb-1">Purity %</label>
                                  <div className="flex gap-1 mb-1">
                                    {[["22K", 91.6], ["18K", 75.0], ["24K", 99.9]].map(([label, val]) => (
                                      <button key={label as string} type="button"
                                        onClick={() => {
                                          const pct = val as number;
                                          setEditIntakeForm({ ...editIntakeForm, purity_pct: pct, pure_wt: parseFloat((editIntakeForm.gross_wt * pct / 100).toFixed(3)) });
                                        }}
                                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${editIntakeForm.purity_pct === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  <input type="number" step="0.01" value={editIntakeForm.purity_pct || ""}
                                    onFocus={e => e.target.select()}
                                    onChange={e => {
                                      const pct = parseFloat(e.target.value) || 0;
                                      setEditIntakeForm({ ...editIntakeForm, purity_pct: pct, pure_wt: parseFloat((editIntakeForm.gross_wt * pct / 100).toFixed(3)) });
                                    }}
                                    className={inp} />
                                </div>
                                <div>
                                  <label className="block text-xs text-ink-dim mb-1">Pure Wt (g)</label>
                                  <input type="number" step="0.001" value={editIntakeForm.pure_wt || ""}
                                    onFocus={e => e.target.select()}
                                    onChange={e => setEditIntakeForm({ ...editIntakeForm, pure_wt: parseFloat(e.target.value) || 0 })}
                                    className={`${inp} bg-canvas`} />
                                </div>
                                <div className="sm:col-span-3">
                                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                                  <input value={editIntakeForm.notes}
                                    onChange={e => setEditIntakeForm({ ...editIntakeForm, notes: e.target.value })}
                                    className={inp} placeholder="Optional" />
                                </div>
                              </div>

                              {(r.source_type !== "sale" && r.source_type !== "order") && (
                                <div className="border-t border-line pt-3 space-y-2">
                                  <p className="text-xs font-medium text-ink-dim">Cash Payout to Customer</p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Amount Paid (₹)</label>
                                      <input type="number" step="1" value={editIntakeForm.payout_amount || ""}
                                        onFocus={e => e.target.select()}
                                        onChange={e => setEditIntakeForm({ ...editIntakeForm, payout_amount: parseFloat(e.target.value) || 0 })}
                                        className={inp} placeholder="0" />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-ink-dim mb-1">Paid via</label>
                                      <select value={editIntakeForm.payout_mode}
                                        onChange={e => setEditIntakeForm({ ...editIntakeForm, payout_mode: e.target.value as "cash" | "bank" })}
                                        className={inp}>
                                        <option value="cash">Cash</option>
                                        <option value="bank">Bank / UPI</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="flex gap-2">
                                <button
                                  disabled={updateIntake.isPending}
                                  onClick={() => updateIntake.mutate({ id: r.id, ...editIntakeForm })}
                                  className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                  {updateIntake.isPending ? "Saving…" : "Save Changes"}
                                </button>
                                <button onClick={() => { setEditIntakeId(null); setEditIntakeForm(null); }}
                                  className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                              </div>
                              {updateIntake.isError && (
                                <p className="text-xs text-err">Save failed — please try again.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      {payoutRowId === r.id && (
                        <tr className="bg-gold/5">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-medium text-ink">Record payout for this intake:</span>
                              <input type="number" step="1" placeholder="Amount (₹)"
                                value={payoutForm.amount || ""}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setPayoutForm({ ...payoutForm, amount: parseFloat(e.target.value) || 0 })}
                                className="border border-line rounded-lg2 px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-gold" />
                              <select value={payoutForm.mode}
                                onChange={(e) => setPayoutForm({ ...payoutForm, mode: e.target.value as "cash" | "bank" })}
                                className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                                <option value="cash">Cash</option>
                                <option value="bank">Bank / UPI</option>
                              </select>
                              <button
                                disabled={!payoutForm.amount || recordPayout.isPending}
                                onClick={() => recordPayout.mutate({ intakeId: r.id, customerId: r.customer_id ?? null })}
                                className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                {recordPayout.isPending ? "Saving…" : "Save Payout"}
                              </button>
                              <button onClick={() => setPayoutRowId(null)}
                                className="text-xs text-ink-dim hover:underline">Cancel</button>
                              {r.customers?.name && (
                                <span className="text-xs text-ink-dim ml-auto">Will credit {r.customers.name}&apos;s balance</span>
                              )}
                            </div>
                            {recordPayout.isError && (
                              <p className="text-xs text-err mt-2">Save failed — try again.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {!filteredIntake.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-ink-dim">{metalFilter !== "all" || statusFilter !== "all" ? "No items match the current filter." : t("no_data")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BATCHES TAB ────────────────────────────────────────── */}
      {tab === "batches" && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowDirectReserve(true); setShowNewBatch(false); }}
              className="bg-info/10 text-info border border-info/30 text-sm px-4 py-2 rounded-lg2 hover:bg-info/20">
              + Direct Reserve Entry
            </button>
            <button onClick={() => { setShowNewBatch(true); setShowDirectReserve(false); }}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
              + New Batch
            </button>
          </div>

          {showDirectReserve && (
            <div className="bg-white border border-info/30 rounded-xl p-4 shadow-soft space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-info">Direct Reserve Entry</h3>
                <p className="text-xs text-ink-dim mt-0.5">Use when you know the pure weight already in reserve but don't have full batch details yet. You can map intake items to this batch later.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Batch No *</label>
                  <input value={directReserveForm.batch_no} onChange={(e) => setDirectReserveForm({ ...directReserveForm, batch_no: e.target.value })} className={inp} placeholder="DR-001" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={directReserveForm.batch_date} onChange={(e) => setDirectReserveForm({ ...directReserveForm, batch_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={directReserveForm.metal} onChange={(e) => setDirectReserveForm({ ...directReserveForm, metal: e.target.value })} className={inp}>
                    <option value="gold_22k">Gold 22K</option>
                    <option value="gold_24k">Gold 24K</option>
                    <option value="gold_18k">Gold 18K</option>
                    <option value="silver">Silver</option>
                    <option value="silver_pure">Silver Pure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Pure Weight (g) *</label>
                  <input type="number" step="0.001" value={directReserveForm.output_wt || ""} placeholder="143.550"
                    onFocus={e => e.target.select()}
                    onChange={(e) => setDirectReserveForm({ ...directReserveForm, output_wt: parseFloat(e.target.value) || 0 })}
                    className={`${inp} font-mono`} />
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={directReserveForm.notes} onChange={(e) => setDirectReserveForm({ ...directReserveForm, notes: e.target.value })} className={inp} placeholder="Placeholder — details to be filled later" />
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={!directReserveForm.batch_no || directReserveForm.output_wt <= 0 || createDirectReserve.isPending}
                  onClick={() => createDirectReserve.mutate(directReserveForm)}
                  className="bg-info text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                  {createDirectReserve.isPending ? "Saving…" : "Add to Reserve"}
                </button>
                <button onClick={() => setShowDirectReserve(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
            </div>
          )}

          {showNewBatch && (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="text-sm font-semibold">Create Melt Batch</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Batch No *</label>
                  <input value={newBatch.batch_no} onChange={(e) => setNewBatch({ ...newBatch, batch_no: e.target.value })} className={inp} placeholder="B-001" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={newBatch.batch_date} onChange={(e) => setNewBatch({ ...newBatch, batch_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={newBatch.metal} onChange={(e) => setNewBatch({ ...newBatch, metal: e.target.value })} className={inp}>
                    <option value="gold_22k">Gold 22K</option>
                    <option value="gold_24k">Gold 24K</option>
                    <option value="gold_18k">Gold 18K</option>
                    <option value="silver">Silver</option>
                    <option value="silver_pure">Silver Pure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={newBatch.notes} onChange={(e) => setNewBatch({ ...newBatch, notes: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={!newBatch.batch_no || createBatch.isPending}
                  onClick={() => createBatch.mutate(newBatch)}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
                <button onClick={() => setShowNewBatch(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
            </div>
          )}

          {batchLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="space-y-3">
              {batches.map((b: any) => (
                <div key={b.id} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
                  {/* Batch header */}
                  <div className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-canvas/50"
                    onClick={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-info font-medium">{b.batch_no}</span>
                      <span className="text-xs text-ink-dim">{shortDate(b.batch_date)} · {b.metal?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-ink-dim">{(b.melt_batch_items ?? []).length} item(s) · {grams(b.input_wt)} in</span>
                      {b.output_wt && <span className="text-ok font-medium">{grams(b.output_wt)} out</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.status === "open" ? "bg-info/10 text-info" :
                        b.status === "melted" ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"
                      }`}>{b.status}</span>
                      {b.status === "refined" && Number(b.input_wt) === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-warn/10 text-warn">Items Pending</span>
                      )}
                      <span className="text-ink-dim text-sm">{expandedBatch === b.id ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expandedBatch === b.id && (
                    <div className="border-t border-line px-5 py-4 space-y-4">
                      {/* Placeholder hint + admin link */}
                      {b.status === "refined" && Number(b.input_wt) === 0 && (
                        <div className="bg-warn/5 border border-warn/20 rounded-lg2 px-3 py-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-warn">
                              {grams(b.output_wt)} added to reserve — old-metal items not linked yet.
                            </span>
                            {isAdmin && linkBatchId !== b.id && (
                              <button
                                onClick={() => { setLinkBatchId(b.id); setLinkSearch(""); setLinkSelected(new Set()); }}
                                className="text-xs bg-warn/10 text-warn border border-warn/30 px-3 py-1 rounded-lg2 hover:bg-warn/20 shrink-0">
                                Link Old Metal
                              </button>
                            )}
                          </div>

                          {/* Link panel — admin only */}
                          {isAdmin && linkBatchId === b.id && (() => {
                            const batchMetal = b.metal as string;
                            const metalGroup = batchMetal.startsWith("silver") ? "silver" : "gold";
                            const linkable = intake.filter((i: any) =>
                              i.status === "pending" &&
                              (metalGroup === "gold" ? i.metal?.startsWith("gold") : i.metal?.startsWith("silver")) &&
                              (linkSearch === "" || (i.customers?.name ?? "").toLowerCase().includes(linkSearch.toLowerCase()) || (i.notes ?? "").toLowerCase().includes(linkSearch.toLowerCase()))
                            );
                            const selItems = linkable.filter((i: any) => linkSelected.has(i.id));
                            const selPure  = selItems.reduce((s: number, i: any) => s + (Number(i.pure_wt) || 0), 0);
                            return (
                              <div className="space-y-2 pt-1">
                                <div className="text-xs font-medium text-ink">Link pending intake items to this batch</div>
                                <input
                                  value={linkSearch}
                                  onChange={e => setLinkSearch(e.target.value)}
                                  placeholder="Search by customer or notes…"
                                  className={`${inp} text-xs py-1.5`} />
                                {linkable.length === 0 ? (
                                  <p className="text-xs text-ink-dim">No pending {metalGroup} intake items.</p>
                                ) : (
                                  <div className="max-h-48 overflow-y-auto divide-y divide-line border border-line rounded-lg2 bg-white">
                                    {linkable.map((i: any) => (
                                      <label key={i.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-canvas/50">
                                        <input type="checkbox" checked={linkSelected.has(i.id)}
                                          onChange={e => {
                                            const s = new Set(linkSelected);
                                            e.target.checked ? s.add(i.id) : s.delete(i.id);
                                            setLinkSelected(s);
                                          }} />
                                        <span className="text-xs flex-1">
                                          <span className="text-ink">{i.customers?.name ?? "Walk-in"}</span>
                                          <span className="text-ink-dim ml-2">{shortDate(i.intake_date)}</span>
                                          <span className="text-ink-dim ml-2">{i.metal?.replace(/_/g, " ")}</span>
                                        </span>
                                        <span className="text-xs font-mono text-ink-dim">{grams(i.gross_wt)} / {grams(i.pure_wt)} pure</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                {linkSelected.size > 0 && (
                                  <div className="text-xs text-ink-dim">
                                    {linkSelected.size} item(s) · Pure wt: <span className="text-gold font-medium">{grams(selPure)}</span>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    disabled={linkSelected.size === 0 || linkIntakeItems.isPending}
                                    onClick={() => linkIntakeItems.mutate({ batchId: b.id })}
                                    className="text-xs bg-ok text-white px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                    {linkIntakeItems.isPending ? "Linking…" : `Link ${linkSelected.size} item(s)`}
                                  </button>
                                  <button onClick={() => { setLinkBatchId(null); setLinkSelected(new Set()); }}
                                    className="text-xs border border-line px-4 py-1.5 rounded-lg2 text-ink-dim">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      {/* Items */}
                      {(b.melt_batch_items ?? []).length > 0 && (
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-ink-dim border-b border-line">
                            <th className="text-right pb-2">Gross</th>
                            <th className="text-right pb-2">Purity%</th>
                            <th className="text-right pb-2">Pure Wt</th>
                            <th className="pb-2 w-16"></th>
                          </tr></thead>
                          <tbody>
                            {(b.melt_batch_items ?? []).map((item: any) => (
                              <tr key={item.id} className="border-b border-line last:border-0">
                                <td className="py-1.5 text-right">{grams(item.gross_wt)}</td>
                                <td className="py-1.5 text-right text-ink-dim">{item.purity_pct}%</td>
                                <td className="py-1.5 text-right text-gold">{grams(item.pure_wt)}</td>
                                <td className="py-1.5 text-right">
                                  <button
                                    onClick={() => {
                                      if (window.confirm("Remove this item from the batch? It will return to pending intake."))
                                        removeBatchItem.mutate({ batchId: b.id, itemId: item.id, intakeId: item.intake_id, pureWt: item.pure_wt });
                                    }}
                                    className="text-xs text-err hover:underline">Remove</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2">
                        {b.status === "open" && (
                          <button
                            onClick={() => updateBatchStatus.mutate({ id: b.id, status: "melted" })}
                            className="text-sm bg-warn/10 text-warn border border-warn/30 px-4 py-1.5 rounded-lg2 hover:bg-warn/20">
                            → Send to Refinery
                          </button>
                        )}
                        {b.status === "melted" && !refineryForm && (
                          <>
                            <button
                              onClick={() => {
                                const grossTotal = (b.melt_batch_items ?? []).reduce((s: number, i: any) => s + (Number(i.gross_wt) || 0), 0);
                                setRefineryForm({ batchId: b.id, total_output_wt: grossTotal, debris_wt: 0, output_wt: grossTotal, loss_wt: 0, output_purity_pct: 91.6 });
                              }}
                              className="text-sm bg-ok/10 text-ok border border-ok/30 px-4 py-1.5 rounded-lg2 hover:bg-ok/20">
                              ✓ Record Refinery Return
                            </button>
                            <button
                              onClick={() => { if (window.confirm("Revert this batch to Open so you can add/remove items?")) updateBatchStatus.mutate({ id: b.id, status: "open" }); }}
                              className="text-sm bg-canvas text-ink-dim border border-line px-4 py-1.5 rounded-lg2 hover:border-gold hover:text-gold">
                              ← Revert to Open
                            </button>
                          </>
                        )}
                        {b.status === "refined" && (
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-ok font-medium">
                              ✓ Usable: {grams(b.melt_wt ?? b.output_wt)} @ {b.output_purity_pct ?? 91.6}%
                              → 999 pure: {grams(b.output_wt)}
                              {Number(b.debris_wt) > 0 && <span className="text-warn ml-2">| Debris: {grams(b.debris_wt)}</span>}
                              {b.loss_wt > 0 && <span className="text-ink-dim ml-2">(loss: {grams(b.loss_wt)})</span>}
                            </span>
                            {!refineryForm && (
                              <button
                                onClick={() => {
                                  const usable = Number(b.melt_wt ?? b.output_wt) || 0;
                                  const debris = Number(b.debris_wt) || 0;
                                  setRefineryForm({ batchId: b.id, total_output_wt: usable + debris, debris_wt: debris, output_wt: usable, loss_wt: Number(b.loss_wt) || 0, output_purity_pct: Number(b.output_purity_pct) || 91.6 });
                                }}
                                className="text-xs text-gold hover:underline">
                                Edit
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Refinery return form */}
                      {refineryForm !== null && refineryForm.batchId === b.id && (() => {
                        const grossTotal = (b.melt_batch_items ?? []).reduce((s: number, i: any) => s + (Number(i.gross_wt) || 0), 0);
                        const netUsable = refineryForm.output_wt;
                        const pure999   = parseFloat((netUsable * (refineryForm.output_purity_pct / 100)).toFixed(3));
                        return (
                          <div className="bg-ok/5 border border-ok/20 rounded-lg2 p-4 space-y-3">
                            <h4 className="text-sm font-semibold text-ok">Refinery Return — {b.batch_no}</h4>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {/* Read-only: input gross */}
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Sent to Refinery (gross)</label>
                                <p className="text-sm font-mono font-semibold text-ink border border-line rounded-lg2 px-3 py-2 bg-canvas">{grams(grossTotal)}</p>
                              </div>

                              {/* Total returned from refinery */}
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Total Returned from Refinery (g) *</label>
                                <input type="number" step="0.001" value={refineryForm.total_output_wt || ""}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="e.g. 158.040"
                                  onChange={(e) => {
                                    const total = parseFloat(e.target.value) || 0;
                                    const debris = refineryForm.debris_wt || 0;
                                    const usable = parseFloat(Math.max(0, total - debris).toFixed(3));
                                    const loss   = parseFloat(Math.max(0, grossTotal - total).toFixed(3));
                                    setRefineryForm({ ...refineryForm, total_output_wt: total, output_wt: usable, loss_wt: loss });
                                  }}
                                  className={inp} />
                              </div>

                              {/* Loss */}
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Dust / Loss (g) <span className="text-gold">(auto)</span></label>
                                <input type="number" step="0.001" value={refineryForm.loss_wt || ""}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => setRefineryForm({ ...refineryForm, loss_wt: parseFloat(e.target.value) || 0 })}
                                  className={inp} />
                              </div>

                              {/* Debris */}
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Debris / Fragments (g)</label>
                                <input type="number" step="0.001" value={refineryForm.debris_wt || ""}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="Small pieces for debris box"
                                  onChange={(e) => {
                                    const debris = parseFloat(e.target.value) || 0;
                                    const usable = parseFloat(Math.max(0, refineryForm.total_output_wt - debris).toFixed(3));
                                    setRefineryForm({ ...refineryForm, debris_wt: debris, output_wt: usable });
                                  }}
                                  className={inp} />
                                <p className="text-xs text-ink-dim mt-0.5">Goes to debris box — excluded from reserve</p>
                              </div>

                              {/* Net usable (auto) */}
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Net Usable (g) <span className="text-gold">(auto)</span></label>
                                <input type="number" step="0.001" value={netUsable || ""}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const usable = parseFloat(e.target.value) || 0;
                                    setRefineryForm({ ...refineryForm, output_wt: usable });
                                  }}
                                  className={`${inp} bg-ok/5 font-semibold`} />
                                {refineryForm.debris_wt > 0 && (
                                  <p className="text-xs text-ink-dim mt-0.5">{grams(refineryForm.total_output_wt)} − {grams(refineryForm.debris_wt)} debris</p>
                                )}
                              </div>

                              {/* Purity */}
                              <div>
                                <label className="block text-xs text-ink-dim mb-1">Purity %</label>
                                <input type="number" step="0.01" value={refineryForm.output_purity_pct || ""}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => setRefineryForm({ ...refineryForm, output_purity_pct: parseFloat(e.target.value) || 91.6 })}
                                  className={inp} />
                              </div>
                            </div>

                            {/* Summary line */}
                            <div className="bg-ok/5 rounded-lg2 px-3 py-2 text-xs space-y-1">
                              <div className="flex items-center gap-4 flex-wrap">
                                <span className="text-ink-dim">Net usable: <strong className="text-ink font-mono">{grams(netUsable)}</strong></span>
                                <span className="text-ink-dim">× {refineryForm.output_purity_pct}% =</span>
                                <span className="text-ok font-bold font-mono">→ {grams(pure999)} (999 pure → reserve)</span>
                              </div>
                              {refineryForm.debris_wt > 0 && (
                                <div className="text-warn font-medium">
                                  + {grams(refineryForm.debris_wt)} debris in box (excluded from reserve — add to next batch when ready)
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button disabled={!refineryForm.output_wt || recordRefinery.isPending}
                                onClick={() => recordRefinery.mutate(refineryForm)}
                                className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">Save Refinery Result</button>
                              <button onClick={() => setRefineryForm(null)}
                                className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
              {!batches.length && <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">No batches yet. Add old metal intake from the Intake tab, then create a batch.</div>}
            </div>
          )}
        </div>
      )}

      {/* ── RESERVE & DISPATCH TAB ─────────────────────────────── */}
      {tab === "reserve" && (
        <div className="space-y-4">
          {/* Debris box summary */}
          {(totalDebrisGold > 0 || totalDebrisSilver > 0) && (
            <div className="bg-warn/5 border border-warn/30 rounded-xl p-4 shadow-soft space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-semibold text-warn uppercase tracking-wide mb-1">Debris Box Accumulated</p>
                  <p className="text-xs text-ink-dim">Fragments from refinery — send to intake to add to the next melt batch.</p>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {totalDebrisGold > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-ink-dim">Gold</p>
                      <p className="text-lg font-bold text-warn">{grams(totalDebrisGold)}</p>
                    </div>
                  )}
                  {totalDebrisSilver > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-ink-dim">Silver</p>
                      <p className="text-lg font-bold text-warn">{grams(totalDebrisSilver)}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {totalDebrisGold > 0 && !debrisIntakeForm && (
                      <button
                        onClick={() => setDebrisIntakeForm({
                          metal: "gold", gross_wt: totalDebrisGold, purity_pct: 91.6,
                          pure_wt: parseFloat((totalDebrisGold * 0.916).toFixed(3)), notes: "",
                        })}
                        className="text-xs bg-warn text-white px-3 py-1.5 rounded-lg2 hover:bg-warn/80 whitespace-nowrap">
                        → Send Gold to Intake
                      </button>
                    )}
                    {totalDebrisSilver > 0 && !debrisIntakeForm && (
                      <button
                        onClick={() => setDebrisIntakeForm({
                          metal: "silver", gross_wt: totalDebrisSilver, purity_pct: 92.5,
                          pure_wt: parseFloat((totalDebrisSilver * 0.925).toFixed(3)), notes: "",
                        })}
                        className="text-xs bg-warn text-white px-3 py-1.5 rounded-lg2 hover:bg-warn/80 whitespace-nowrap">
                        → Send Silver to Intake
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline form to confirm and create the intake record */}
              {debrisIntakeForm && (
                <div className="border-t border-warn/20 pt-3 space-y-3">
                  <p className="text-xs font-semibold text-warn">
                    Create Old Metal Intake from Debris Box — {debrisIntakeForm.metal === "gold" ? "Gold" : "Silver"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Gross Weight (g)</label>
                      <input type="number" step="0.001" value={debrisIntakeForm.gross_wt || ""}
                        onFocus={e => e.target.select()}
                        onChange={e => {
                          const g = parseFloat(e.target.value) || 0;
                          setDebrisIntakeForm({ ...debrisIntakeForm, gross_wt: g, pure_wt: parseFloat((g * debrisIntakeForm.purity_pct / 100).toFixed(3)) });
                        }}
                        className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Purity %</label>
                      <div className="flex gap-1 mb-1">
                        {(debrisIntakeForm.metal === "gold"
                          ? [["22K", 91.6], ["18K", 75.0], ["24K", 99.9]]
                          : [["92.5", 92.5], ["99.9", 99.9]]
                        ).map(([label, val]) => (
                          <button key={label as string} type="button"
                            onClick={() => {
                              const pct = val as number;
                              setDebrisIntakeForm({ ...debrisIntakeForm, purity_pct: pct, pure_wt: parseFloat((debrisIntakeForm.gross_wt * pct / 100).toFixed(3)) });
                            }}
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${debrisIntakeForm.purity_pct === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <input type="number" step="0.01" value={debrisIntakeForm.purity_pct || ""}
                        onFocus={e => e.target.select()}
                        onChange={e => {
                          const pct = parseFloat(e.target.value) || 0;
                          setDebrisIntakeForm({ ...debrisIntakeForm, purity_pct: pct, pure_wt: parseFloat((debrisIntakeForm.gross_wt * pct / 100).toFixed(3)) });
                        }}
                        className={inp} />
                    </div>
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Pure Wt (g)</label>
                      <div className={`${inp} bg-canvas font-mono text-gold font-semibold text-right`}>
                        {grams(debrisIntakeForm.pure_wt)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-ink-dim mb-1">Notes (optional)</label>
                      <input value={debrisIntakeForm.notes}
                        onChange={e => setDebrisIntakeForm({ ...debrisIntakeForm, notes: e.target.value })}
                        className={inp} placeholder="Debris from batches…" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={sendDebrisToIntake.isPending || debrisIntakeForm.gross_wt <= 0}
                      onClick={() => sendDebrisToIntake.mutate(debrisIntakeForm)}
                      className="bg-warn text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                      {sendDebrisToIntake.isPending ? "Saving…" : "Add to Old Metal Intake"}
                    </button>
                    <button onClick={() => setDebrisIntakeForm(null)}
                      className="border border-line text-sm px-4 py-2 rounded-lg2 text-ink-dim">Cancel</button>
                  </div>
                  <p className="text-xs text-ink-dim">This creates a pending intake record and clears the debris box. Then go to the Intake tab → select it → add to your next batch.</p>
                </div>
              )}
            </div>
          )}

          {/* Reserve balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gold/5 border border-gold/20 rounded-xl p-5 shadow-soft">
              <p className="text-xs text-ink-dim mb-1">Gold Reserve (999 pure)</p>
              <p className="text-3xl font-bold text-gold">{grams(goldReserve)}</p>
              <ReserveBreakdown refined={goldRefined} bullionIn={goldBullionIn} dispatched={goldDispatched} cls="text-gold" />
            </div>
            <div className="bg-ink-mid/5 border border-line rounded-xl p-5 shadow-soft">
              <p className="text-xs text-ink-dim mb-1">Silver Reserve (999 pure)</p>
              <p className="text-3xl font-bold text-ink-mid">{grams(silverReserve)}</p>
              <ReserveBreakdown refined={silverRefined} bullionIn={silverBullionIn} dispatched={silverDispatched} cls="text-ink-mid" />
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowDispatch(true)}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2">
              + Dispatch Metal
            </button>
          </div>

          {showDispatch && (
            <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="text-sm font-semibold">Dispatch from Reserve</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={dispatchForm.dispatch_date}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, dispatch_date: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={dispatchForm.metal}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, metal: e.target.value })} className={inp}>
                    <option value="gold">Gold 999</option>
                    <option value="silver">Silver 999</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Weight (g) *</label>
                  <input type="number" step="0.001" value={dispatchForm.weight_g || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, weight_g: parseFloat(e.target.value) || 0 })}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Touch / Purity %</label>
                  <div className="flex gap-1 mb-1">
                    {[["999", 99.9], ["916", 91.6], ["750", 75.0]].map(([label, val]) => (
                      <button key={label as string} type="button"
                        onClick={() => setDispatchForm({ ...dispatchForm, purity_pct: val as number })}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${dispatchForm.purity_pct === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <input type="number" step="0.001" value={dispatchForm.purity_pct || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, purity_pct: parseFloat(e.target.value) || 0 })}
                    className={inp} />
                  {dispatchForm.weight_g > 0 && (
                    <p className="text-xs text-ink-dim mt-0.5">
                      Pure wt: <span className="text-gold font-mono font-semibold">{grams(dispatchForm.weight_g * dispatchForm.purity_pct / 100)}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Purpose</label>
                  <select value={dispatchForm.purpose}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, purpose: e.target.value })} className={inp}>
                    <option value="supplier">Supplier</option>
                    <option value="goldsmith">Goldsmith</option>
                    <option value="sale">Sale</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">
                    {dispatchForm.purpose === "supplier" ? "Supplier" : "Party / Name"}
                  </label>
                  {dispatchForm.purpose === "supplier" && (
                    <select value={dispatchForm.supplier_id}
                      onChange={(e) => {
                        const name = suppliers.find((s) => s.id === e.target.value)?.name ?? "";
                        setDispatchForm({ ...dispatchForm, supplier_id: e.target.value, party_name: name });
                      }}
                      className={inp}>
                      <option value="">-- select supplier --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  {dispatchForm.purpose !== "supplier" && (
                    <input value={dispatchForm.party_name}
                      onChange={(e) => setDispatchForm({ ...dispatchForm, party_name: e.target.value })}
                      className={inp} placeholder="Goldsmith / party name" />
                  )}
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={dispatchForm.notes}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })} className={inp} />
                </div>
              </div>
              <div className="flex gap-2">
                <button disabled={!dispatchForm.weight_g || saveDispatch.isPending}
                  onClick={() => saveDispatch.mutate(dispatchForm)}
                  className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
                <button onClick={() => setShowDispatch(false)}
                  className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
              {saveDispatch.isError && (
                <p className="text-xs text-err">Save failed — run migration 003 in Supabase SQL Editor first (metal_dispatches table).</p>
              )}
            </div>
          )}

          {/* Dispatch history */}
          {dispatchLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
            <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-line bg-canvas">
                <h3 className="text-xs font-semibold text-ink-dim">Dispatch History</h3>
              </div>
              <table className="w-full text-sm" style={{ minWidth: "620px" }}>
                <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-3 py-2.5">Metal</th>
                  <th className="text-right px-3 py-2.5">Weight</th>
                  <th className="text-right px-3 py-2.5">Touch%</th>
                  <th className="text-right px-3 py-2.5">Pure Wt</th>
                  <th className="text-left px-3 py-2.5">Purpose</th>
                  <th className="text-left px-3 py-2.5">Party</th>
                  <th className="px-3 py-2.5 w-12"></th>
                </tr></thead>
                <tbody>
                  {dispatches.map((d: any) => {
                    const purity = Number(d.purity_pct) || 100;
                    const pureWt = Number(d.weight_g) * purity / 100;
                    const isEditing = editDispatchId === d.id;
                    const editPureWt = editDispatchForm.weight_g * editDispatchForm.purity_pct / 100;
                    return (
                      <Fragment key={d.id}>
                        <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                          <td className="px-4 py-2.5 text-ink-dim">{shortDate(d.dispatch_date)}</td>
                          <td className="px-3 py-2.5 capitalize font-medium" style={{ color: d.metal === "gold" ? "var(--color-gold)" : "var(--color-ink-mid)" }}>{d.metal}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{grams(d.weight_g)}</td>
                          <td className="px-3 py-2.5 text-right text-ink-dim">{purity.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gold">{grams(pureWt)}</td>
                          <td className="px-3 py-2.5 capitalize text-ink-dim">{d.purpose}</td>
                          <td className="px-3 py-2.5">{d.party_name ?? d.suppliers?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => {
                                setEditDispatchId(d.id);
                                setEditDispatchForm({
                                  dispatch_date: d.dispatch_date,
                                  metal: d.metal,
                                  weight_g: Number(d.weight_g),
                                  purity_pct: Number(d.purity_pct) || 100,
                                  purpose: d.purpose,
                                  supplier_id: d.supplier_id ?? "",
                                  party_name: d.party_name ?? "",
                                  notes: d.notes ?? "",
                                });
                              }}
                              className="text-xs text-gold hover:underline">Edit</button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr className="border-b border-line bg-gold/5">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="space-y-3">
                                <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Edit Dispatch</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-xs text-ink-dim mb-1">Date</label>
                                    <input type="date" value={editDispatchForm.dispatch_date}
                                      onChange={(e) => setEditDispatchForm({ ...editDispatchForm, dispatch_date: e.target.value })}
                                      className={inp} />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-ink-dim mb-1">Metal</label>
                                    <select value={editDispatchForm.metal}
                                      onChange={(e) => setEditDispatchForm({ ...editDispatchForm, metal: e.target.value })}
                                      className={inp}>
                                      <option value="gold">Gold 999</option>
                                      <option value="silver">Silver 999</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-ink-dim mb-1">Weight (g)</label>
                                    <input type="number" step="0.001" value={editDispatchForm.weight_g || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => setEditDispatchForm({ ...editDispatchForm, weight_g: parseFloat(e.target.value) || 0 })}
                                      className={inp} />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-ink-dim mb-1">Touch / Purity %</label>
                                    <div className="flex gap-1 mb-1">
                                      {[["999", 99.9], ["916", 91.6], ["750", 75.0]].map(([label, val]) => (
                                        <button key={label as string} type="button"
                                          onClick={() => setEditDispatchForm({ ...editDispatchForm, purity_pct: val as number })}
                                          className={`text-xs px-2 py-0.5 rounded border transition-colors ${editDispatchForm.purity_pct === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                    <input type="number" step="0.001" value={editDispatchForm.purity_pct || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => setEditDispatchForm({ ...editDispatchForm, purity_pct: parseFloat(e.target.value) || 0 })}
                                      className={inp} />
                                    {editDispatchForm.weight_g > 0 && (
                                      <p className="text-xs text-ink-dim mt-0.5">Pure wt: <span className="text-gold font-mono font-semibold">{grams(editPureWt)}</span></p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="block text-xs text-ink-dim mb-1">Purpose</label>
                                    <select value={editDispatchForm.purpose}
                                      onChange={(e) => setEditDispatchForm({ ...editDispatchForm, purpose: e.target.value })}
                                      className={inp}>
                                      <option value="supplier">Supplier</option>
                                      <option value="goldsmith">Goldsmith</option>
                                      <option value="sale">Sale</option>
                                      <option value="other">Other</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-ink-dim mb-1">
                                      {editDispatchForm.purpose === "supplier" ? "Supplier" : "Party / Name"}
                                    </label>
                                    {editDispatchForm.purpose === "supplier" ? (
                                      <select value={editDispatchForm.supplier_id}
                                        onChange={(e) => {
                                          const name = suppliers.find((s) => s.id === e.target.value)?.name ?? "";
                                          setEditDispatchForm({ ...editDispatchForm, supplier_id: e.target.value, party_name: name });
                                        }}
                                        className={inp}>
                                        <option value="">-- select supplier --</option>
                                        {suppliers.map((s) => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input value={editDispatchForm.party_name}
                                        onChange={(e) => setEditDispatchForm({ ...editDispatchForm, party_name: e.target.value })}
                                        className={inp} placeholder="Goldsmith / party name" />
                                    )}
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="block text-xs text-ink-dim mb-1">Notes</label>
                                    <input value={editDispatchForm.notes}
                                      onChange={(e) => setEditDispatchForm({ ...editDispatchForm, notes: e.target.value })}
                                      className={inp} />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    disabled={!editDispatchForm.weight_g || updateDispatch.isPending}
                                    onClick={() => updateDispatch.mutate({ id: d.id, d: editDispatchForm })}
                                    className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                    {updateDispatch.isPending ? "Saving…" : "Save Changes"}
                                  </button>
                                  <button onClick={() => setEditDispatchId(null)}
                                    className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                                </div>
                                {updateDispatch.isError && <p className="text-xs text-err">Save failed — please try again.</p>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!dispatches.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
