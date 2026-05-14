"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { fyForDate, billNoFor } from "@/lib/fy";
import type { SaleDraft } from "./types";

async function fanoutLedger(
  saleId: string,
  billDate: string,
  items: SaleDraft["items"],
  payments: SaleDraft["payments"]
) {
  const client = supabase();
  const promises: Promise<unknown>[] = [];

  for (const p of payments) {
    if (p.amount <= 0) continue;
    if (p.mode === "cash") {
      promises.push(
        client.from("cash_ledger").insert({
          tx_date: billDate, direction: "in", amount: p.amount,
          description: `Sale payment`, ref_type: "sale", ref_id: saleId,
        })
      );
    } else if (p.mode === "upi" || p.mode === "bank") {
      promises.push(
        client.from("bank_ledger").insert({
          tx_date: billDate, direction: "in", amount: p.amount,
          description: `Sale payment`, ref_type: "sale", ref_id: saleId,
        })
      );
    } else if (p.mode === "old_gold" || p.mode === "old_silver") {
      const metal = p.mode === "old_gold" ? "gold_22k" : "silver";
      promises.push(
        client.from("old_metal_intake").insert({
          intake_date: billDate,
          metal,
          gross_wt: p.metal_wt,
          purity_pct: p.metal_purity || 91.6,
          pure_wt: p.metal_wt * ((p.metal_purity || 91.6) / 100),
          source_type: "sale",
          source_id: saleId,
          status: "pending",
        })
      );
    }
  }

  await Promise.allSettled(promises).then((results) => {
    results.forEach((r) => {
      if (r.status === "rejected") console.warn("Ledger fan-out failed:", r.reason);
    });
  });
}

export function useSales(limit = 50) {
  return useQuery({
    queryKey: ["sales", limit],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sales")
        .select("id, bill_no, bill_date, total, status, customers(name)")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SaleDraft) => {
      const client = supabase();
      const fy = fyForDate(draft.bill_date);

      // Allocate FY serial
      const { data: serialData, error: serialErr } = await client
        .rpc("next_fy_serial", { _fy: fy, _series: draft.series });
      if (serialErr) throw serialErr;

      const billNo = billNoFor(draft.series, fy, serialData as number);
      const subtotal = draft.items.reduce((s, i) => s + i.line_total, 0);
      const gstAmount = draft.items.reduce((s, i) => {
        const before = i.line_total / (1 + 0.03);
        return s + (i.line_total - before);
      }, 0);
      const total = subtotal;

      // Insert sale
      const { data: sale, error: saleErr } = await client
        .from("sales")
        .insert({
          bill_no: billNo,
          bill_date: draft.bill_date,
          customer_id: draft.customer_id,
          series: draft.series,
          subtotal,
          gst_amount: gstAmount,
          total,
          notes: draft.notes,
          status: "confirmed",
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      // Insert items
      if (draft.items.length) {
        const { error: itemsErr } = await client.from("sale_items").insert(
          draft.items.map((item, i) => ({
            sale_id: sale.id,
            description: item.description,
            metal: item.metal,
            gross_wt: item.gross_wt,
            stone_wt: item.stone_wt,
            net_wt: item.net_wt,
            purity_pct: item.purity_pct,
            pure_wt: item.pure_wt,
            rate: item.rate,
            va_pct: item.va_pct,
            making_amt: item.making_amt,
            stone_amt: item.stone_amt,
            diamond_amt: item.diamond_amt,
            gst_pct: item.gst_pct,
            line_total: item.line_total,
            is_suspense: item.is_suspense,
            supplier_id: item.supplier_id || null,
            sort_order: i,
          }))
        );
        if (itemsErr) throw itemsErr;
      }

      // Insert payments
      if (draft.payments.length) {
        const { error: payErr } = await client.from("sale_payments").insert(
          draft.payments.map((p) => ({
            sale_id: sale.id,
            mode: p.mode,
            amount: p.amount,
            metal_wt: p.metal_wt || null,
            metal_purity: p.metal_purity || null,
            is_advance: p.is_advance,
          }))
        );
        if (payErr) throw payErr;
      }

      // Best-effort ledger fan-out
      await fanoutLedger(sale.id, draft.bill_date, draft.items, draft.payments);

      return sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
  });
}
