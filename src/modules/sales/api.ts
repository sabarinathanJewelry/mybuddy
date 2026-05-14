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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promises: Promise<any>[] = [];

  for (const p of payments) {
    if (p.amount <= 0) continue;
    if (p.mode === "cash") {
      promises.push(Promise.resolve(client.from("cash_ledger").insert({
        tx_date: billDate, direction: "in", amount: p.amount,
        description: "Sale payment", ref_type: "sale", ref_id: saleId,
      })));
    } else if (p.mode === "upi" || p.mode === "bank") {
      promises.push(Promise.resolve(client.from("bank_ledger").insert({
        tx_date: billDate, direction: "in", amount: p.amount,
        description: "Sale payment", ref_type: "sale", ref_id: saleId,
      })));
    } else if (p.mode === "old_gold" || p.mode === "old_silver") {
      const metal = p.mode === "old_gold" ? "gold_22k" : "silver";
      promises.push(Promise.resolve(client.from("old_metal_intake").insert({
        intake_date: billDate, metal,
        gross_wt: p.metal_wt, purity_pct: p.metal_purity || 91.6,
        pure_wt: p.metal_wt * ((p.metal_purity || 91.6) / 100),
        source_type: "sale", source_id: saleId, status: "pending",
      })));
    }
  }

  await Promise.allSettled(promises).then((results) => {
    results.forEach((r) => {
      if (r.status === "rejected") console.warn("Ledger fan-out failed:", r.reason);
    });
  });
}

function itemsInsertPayload(saleId: string, items: SaleDraft["items"]) {
  return items.map((item, i) => ({
    sale_id: saleId,
    description: item.description,
    metal: item.metal,
    gross_wt: item.gross_wt,
    stone_wt: item.show_stone ? item.stone_wt : 0,
    net_wt: item.net_wt,
    purity_pct: item.purity_pct,
    pure_wt: item.pure_wt,
    rate: item.rate,
    va_pct: item.va_pct,
    making_amt: item.making_amt,
    stone_amt: item.show_stone ? item.stone_amt : 0,
    diamond_amt: item.show_diamond ? item.diamond_amt : 0,
    gst_pct: item.gst_enabled ? (item.gst_pct || 3) : 0,
    line_total: item.line_total,
    is_suspense: item.is_suspense,
    supplier_id: item.supplier_id || null,
    sort_order: i,
  }));
}

export function useSales(limit = 50) {
  return useQuery({
    queryKey: ["sales", limit],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("sales")
        .select("id, bill_no, bill_date, total, status, series, customers(name)")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSale(id: string | null) {
  return useQuery({
    queryKey: ["sale", id],
    enabled: !!id,
    queryFn: async () => {
      const client = supabase();
      const [saleRes, itemsRes, paymentsRes] = await Promise.all([
        client.from("sales").select("*, customers(id,name,phone)").eq("id", id!).single(),
        client.from("sale_items").select("*").eq("sale_id", id!).order("sort_order"),
        client.from("sale_payments").select("*").eq("sale_id", id!),
      ]);
      if (saleRes.error) throw saleRes.error;
      return {
        sale: saleRes.data,
        items: itemsRes.data ?? [],
        payments: paymentsRes.data ?? [],
      };
    },
  });
}

export function useSaveSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SaleDraft) => {
      const client = supabase();
      const fy = fyForDate(draft.bill_date);

      const { data: serialData, error: serialErr } = await client
        .rpc("next_fy_serial", { _fy: fy, _series: draft.series });
      if (serialErr) throw serialErr;

      const billNo = billNoFor(draft.series, fy, serialData as number);
      const subtotal = draft.items.reduce((s, i) => s + i.line_total, 0);
      const gstAmount = draft.items.reduce((s, i) => {
        if (i.is_value_entry) return s;
        const gst_pct = i.gst_enabled ? 0.03 : 0;
        const before = i.line_total / (1 + gst_pct);
        return s + (i.line_total - before);
      }, 0);

      const { data: sale, error: saleErr } = await client
        .from("sales")
        .insert({
          bill_no: billNo, bill_date: draft.bill_date,
          customer_id: draft.customer_id, series: draft.series,
          subtotal, gst_amount: gstAmount, total: subtotal,
          notes: draft.notes, status: "confirmed",
        })
        .select().single();
      if (saleErr) throw saleErr;

      if (draft.items.length) {
        const { error: itemsErr } = await client.from("sale_items").insert(
          itemsInsertPayload(sale.id, draft.items)
        );
        if (itemsErr) throw itemsErr;
      }

      if (draft.payments.length) {
        const { error: payErr } = await client.from("sale_payments").insert(
          draft.payments.map((p) => ({
            sale_id: sale.id, mode: p.mode, amount: p.amount,
            metal_wt: p.metal_wt || null, metal_purity: p.metal_purity || null,
            is_advance: p.is_advance,
          }))
        );
        if (payErr) throw payErr;
      }

      await fanoutLedger(sale.id, draft.bill_date, draft.items, draft.payments);
      return sale;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }),
  });
}

export function useUpdateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: SaleDraft }) => {
      const client = supabase();
      const subtotal = draft.items.reduce((s, i) => s + i.line_total, 0);
      const gstAmount = draft.items.reduce((s, i) => {
        if (i.is_value_entry) return s;
        const gst_pct = i.gst_enabled ? 0.03 : 0;
        const before = i.line_total / (1 + gst_pct);
        return s + (i.line_total - before);
      }, 0);

      const { error: saleErr } = await client.from("sales").update({
        bill_date: draft.bill_date, customer_id: draft.customer_id,
        notes: draft.notes, subtotal, gst_amount: gstAmount, total: subtotal,
      }).eq("id", id);
      if (saleErr) throw saleErr;

      const { error: delItemsErr } = await client.from("sale_items").delete().eq("sale_id", id);
      if (delItemsErr) throw delItemsErr;

      if (draft.items.length) {
        const { error: itemsErr } = await client.from("sale_items").insert(
          itemsInsertPayload(id, draft.items)
        );
        if (itemsErr) throw itemsErr;
      }

      const { error: delPayErr } = await client.from("sale_payments").delete().eq("sale_id", id);
      if (delPayErr) throw delPayErr;

      const validPay = draft.payments.filter((p) => p.amount > 0);
      if (validPay.length) {
        const { error: payErr } = await client.from("sale_payments").insert(
          validPay.map((p) => ({
            sale_id: id, mode: p.mode, amount: p.amount,
            metal_wt: p.metal_wt || null, metal_purity: p.metal_purity || null,
            is_advance: p.is_advance,
          }))
        );
        if (payErr) throw payErr;
      }

      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sale", id] });
    },
  });
}
