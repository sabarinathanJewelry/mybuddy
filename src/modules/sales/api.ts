"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { fyForDate, billNoFor } from "@/lib/fy";
import type { SaleDraft } from "./types";

async function fanoutLedger(
  saleId: string,
  billDate: string,
  items: SaleDraft["items"],
  payments: SaleDraft["payments"],
  customerId?: string | null,
  changeDue?: number,
  changeMode?: SaleDraft["change_mode"],
  changePayoutMode?: SaleDraft["change_payout_mode"]
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
      // Skip old_metal_intake for kolusu returns — they go to kolusu stock instead (handled in save/update)
      if (!p.kolusu_box_id) {
        const metal = p.mode === "old_gold" ? "gold_22k" : "silver";
        promises.push(Promise.resolve(client.from("old_metal_intake").insert({
          intake_date: billDate, metal,
          gross_wt: p.metal_wt, purity_pct: p.metal_purity || 91.6,
          pure_wt: p.metal_wt * ((p.metal_purity || 91.6) / 100),
          source_type: "sale", source_id: saleId, status: "pending",
        })));
      }
    }
    // chit_metal: no cash/bank ledger entry — it's a stored metal credit, handled below

    // Credit the customer's balance for all non-advance payment modes.
    // Advance is skipped — the customer's credit is already reflected in their prior deposits.
    if (customerId && p.mode !== "advance") {
      promises.push(Promise.resolve(client.from("payments").insert({
        pay_date: billDate,
        direction: "in",
        mode: p.mode === "old_gold" || p.mode === "old_silver" || p.mode === "chit_metal" ? "cash" : p.mode,
        amount: p.amount,
        customer_id: customerId,
        sale_id: saleId,
        notes: p.mode === "old_gold" ? "Old gold exchange"
             : p.mode === "old_silver" ? "Old silver exchange"
             : p.mode === "chit_metal" ? `Chit metal (${p.metal_wt}g)`
             : "Sale payment",
      })));
    }
  }

  // Handle change due (payments exceeded sale total)
  if (changeDue && changeDue > 0.01 && changeMode === "cash_back") {
    const table = changePayoutMode === "bank" ? "bank_ledger" : "cash_ledger";
    promises.push(Promise.resolve(client.from(table).insert({
      tx_date: billDate, direction: "out", amount: changeDue,
      description: "Change/excess payout to customer", ref_type: "sale", ref_id: saleId,
    })));
    // If customer is tracked, record the payout to zero their surplus advance
    if (customerId) {
      promises.push(Promise.resolve(client.from("payments").insert({
        pay_date: billDate, direction: "out", mode: changePayoutMode === "bank" ? "bank" : "cash",
        amount: changeDue, customer_id: customerId, sale_id: saleId,
        notes: "Change paid back to customer",
      })));
    }
  }
  // For "advance" mode: no extra entry needed — customer's balance already reflects the surplus
  // from the old_gold/payment fan-out above.

  await Promise.allSettled(promises).then((results) => {
    results.forEach((r) => {
      if (r.status === "rejected") console.warn("Ledger fan-out failed:", r.reason);
    });
  });

  // Deduct chit metal grams from customer's gold_balance_g
  if (customerId) {
    const chitPayments = payments.filter((p) => p.mode === "chit_metal" && (p.metal_wt || 0) > 0);
    if (chitPayments.length > 0) {
      const totalGrams = chitPayments.reduce((s, p) => s + (p.metal_wt || 0), 0);
      const { data: custData } = await client.from("customers")
        .select("gold_balance_g").eq("id", customerId).single();
      const current = Number(custData?.gold_balance_g) || 0;
      await client.from("customers")
        .update({ gold_balance_g: Math.max(0, current - totalGrams) })
        .eq("id", customerId);
    }
  }
}

// Add kolusu return transactions when returned item goes back to a kolusu box
async function applyKolusuReturns(
  client: ReturnType<typeof import("@/lib/supabase/client").supabase>,
  saleId: string,
  billNo: string,
  billDate: string,
  payments: SaleDraft["payments"],
  exchangeRefBill?: string,
) {
  const returns = payments.filter((p) =>
    (p.mode === "old_gold" || p.mode === "old_silver") && p.kolusu_box_id && (p.metal_wt || 0) > 0
  );
  for (const p of returns) {
    const rawWt = p.metal_wt || 0;
    await client.from("kolusu_transactions").insert({
      tx_date: billDate,
      box_id: p.kolusu_box_id,
      qty_change: 1,
      raw_wt_g: rawWt,
      cover_wt_g: 0,
      total_wt_g: rawWt,
      bill_no: billNo,
      source_type: "exchange_return",
      source_id: saleId,
      notes: `Exchange return${exchangeRefBill ? ` — ref ${exchangeRefBill}` : ""}`,
    });
    const { data: box } = await client.from("kolusu_boxes")
      .select("current_gross_wt_g, current_qty").eq("id", p.kolusu_box_id!).single();
    await client.from("kolusu_boxes").update({
      current_gross_wt_g: (Number(box?.current_gross_wt_g) || 0) + rawWt,
      current_qty: (Number(box?.current_qty) || 0) + 1,
    }).eq("id", p.kolusu_box_id!);
  }
}

// Reverse kolusu returns when a sale is edited or deleted
async function cleanupKolusuReturns(
  client: ReturnType<typeof import("@/lib/supabase/client").supabase>,
  saleId: string,
) {
  const { data: ktxns } = await client.from("kolusu_transactions")
    .select("id, box_id, total_wt_g, qty_change")
    .eq("source_type", "exchange_return")
    .eq("source_id", saleId);
  if (!ktxns || ktxns.length === 0) return;

  // Group by box and reverse stock
  const byBox = new Map<string, { wt: number; qty: number }>();
  for (const t of ktxns) {
    const cur = byBox.get(t.box_id) || { wt: 0, qty: 0 };
    byBox.set(t.box_id, { wt: cur.wt + Number(t.total_wt_g || 0), qty: cur.qty + Number(t.qty_change || 0) });
  }
  for (const [boxId, delta] of byBox) {
    const { data: box } = await client.from("kolusu_boxes")
      .select("current_gross_wt_g, current_qty").eq("id", boxId).single();
    if (box) {
      await client.from("kolusu_boxes").update({
        current_gross_wt_g: Math.max(0, (Number(box.current_gross_wt_g) || 0) - delta.wt),
        current_qty: Math.max(0, (Number(box.current_qty) || 0) - delta.qty),
      }).eq("id", boxId);
    }
  }
  await client.from("kolusu_transactions")
    .delete().eq("source_type", "exchange_return").eq("source_id", saleId);
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

export function useSales(date: string | null = null, limit = 100) {
  return useQuery({
    queryKey: ["sales", date, limit],
    queryFn: async () => {
      let q = supabase()
        .from("sales")
        .select("id, bill_no, bill_date, total, status, series, sale_type, exchange_ref_bill, customers(name)")
        .order("bill_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (date) q = q.eq("bill_date", date);
      const { data, error } = await q;
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
          sale_type: draft.sale_type ?? "fresh",
          exchange_ref_bill: draft.exchange_ref_bill ?? null,
          change_due: draft.change_due ?? null,
          change_mode: draft.change_mode ?? null,
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
            rate: p.rate || null,
            is_advance: p.is_advance,
          }))
        );
        if (payErr) throw payErr;
      }

      await fanoutLedger(sale.id, draft.bill_date, draft.items, draft.payments, draft.customer_id, draft.change_due, draft.change_mode, draft.change_payout_mode);
      if (draft.sale_type === "exchange") {
        await applyKolusuReturns(client, sale.id, sale.bill_no, draft.bill_date, draft.payments, draft.exchange_ref_bill);
      }
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

      // Fetch old series to detect a series change
      const { data: oldSale } = await client.from("sales").select("series, bill_no").eq("id", id).single();
      let billNo = oldSale?.bill_no as string;
      if (oldSale?.series !== draft.series) {
        // Series changed → generate a new bill_no in the new series
        const fy = fyForDate(draft.bill_date);
        const { data: serialData, error: serialErr } = await client.rpc("next_fy_serial", { _fy: fy, _series: draft.series });
        if (serialErr) throw serialErr;
        billNo = billNoFor(draft.series, fy, serialData as number);
      }

      const { error: saleErr } = await client.from("sales").update({
        series: draft.series, bill_no: billNo,
        bill_date: draft.bill_date, customer_id: draft.customer_id,
        notes: draft.notes, subtotal, gst_amount: gstAmount, total: subtotal,
        sale_type: draft.sale_type ?? "fresh",
        exchange_ref_bill: draft.exchange_ref_bill ?? null,
        change_due: draft.change_due ?? null,
        change_mode: draft.change_mode ?? null,
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

      // Restore any chit_metal gold balance before wiping (so re-fan-out doesn't double-deduct)
      if (draft.customer_id) {
        const { data: oldChit } = await client.from("sale_payments")
          .select("metal_wt").eq("sale_id", id).eq("mode", "chit_metal");
        if (oldChit && oldChit.length > 0) {
          const restoreG = oldChit.reduce((s: number, p: { metal_wt: number | null }) => s + (Number(p.metal_wt) || 0), 0);
          if (restoreG > 0) {
            const { data: custData } = await client.from("customers")
              .select("gold_balance_g").eq("id", draft.customer_id).single();
            await client.from("customers")
              .update({ gold_balance_g: (Number(custData?.gold_balance_g) || 0) + restoreG })
              .eq("id", draft.customer_id);
          }
        }
      }

      const { error: delPayErr } = await client.from("sale_payments").delete().eq("sale_id", id);
      if (delPayErr) throw delPayErr;

      // Reverse any kolusu returns from the previous version of this sale
      await cleanupKolusuReturns(client, id);

      // Wipe stale ledger + metal intake + customer payment rows so they can be re-inserted fresh
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "sale").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "sale").eq("ref_id", id),
        client.from("old_metal_intake").delete().eq("source_type", "sale").eq("source_id", id),
        client.from("payments").delete().eq("sale_id", id),
      ]);

      const validPay = draft.payments.filter((p) => p.amount > 0);
      if (validPay.length) {
        const { error: payErr } = await client.from("sale_payments").insert(
          validPay.map((p) => ({
            sale_id: id, mode: p.mode, amount: p.amount,
            metal_wt: p.metal_wt || null, metal_purity: p.metal_purity || null,
            rate: p.rate || null,
            is_advance: p.is_advance,
          }))
        );
        if (payErr) throw payErr;
      }

      // Re-write fresh ledger + metal intake + customer payment entries
      await fanoutLedger(id, draft.bill_date, draft.items, validPay, draft.customer_id, draft.change_due, draft.change_mode, draft.change_payout_mode);

      // Re-apply kolusu returns with the updated bill_no
      if (draft.sale_type === "exchange") {
        const { data: updatedSale } = await client.from("sales").select("bill_no").eq("id", id).single();
        await applyKolusuReturns(client, id, updatedSale?.bill_no ?? "", draft.bill_date, validPay, draft.exchange_ref_bill);
      }

      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sale", id] });
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = supabase();

      // Restore chit_metal gold grams to customer before wiping payments
      const { data: chitPays } = await client.from("sale_payments")
        .select("metal_wt, sale_id")
        .eq("sale_id", id).eq("mode", "chit_metal");
      if (chitPays && chitPays.length > 0) {
        const { data: saleRow } = await client.from("sales")
          .select("customer_id").eq("id", id).single();
        if (saleRow?.customer_id) {
          const restoreG = chitPays.reduce((s: number, p: { metal_wt: number | null }) => s + (Number(p.metal_wt) || 0), 0);
          if (restoreG > 0) {
            const { data: custData } = await client.from("customers")
              .select("gold_balance_g").eq("id", saleRow.customer_id).single();
            await client.from("customers")
              .update({ gold_balance_g: (Number(custData?.gold_balance_g) || 0) + restoreG })
              .eq("id", saleRow.customer_id);
          }
        }
      }

      // Reverse kolusu returns (before wiping the sale)
      await cleanupKolusuReturns(client, id);

      // Wipe all related rows, then the sale (sale_items cascade from sale)
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "sale").eq("ref_id", id),
        client.from("bank_ledger").delete().eq("ref_type", "sale").eq("ref_id", id),
        client.from("old_metal_intake").delete().eq("source_type", "sale").eq("source_id", id),
        client.from("payments").delete().eq("sale_id", id),
        client.from("sale_payments").delete().eq("sale_id", id),
      ]);

      const { error } = await client.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales"] }),
  });
}
