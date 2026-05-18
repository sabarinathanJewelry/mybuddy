"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import CustomerPicker from "@/modules/customers/customer-picker";
import { useGlobalDate } from "@/stores/global-date";
import { useBoardRate } from "@/stores/board-rate";
import { useT } from "@/i18n";
import { inr, grams, shortDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import { clsx } from "clsx";
import { fyForDate, billNoFor } from "@/lib/fy";

// ─── Types ──────────────────────────────────────────────────────────────────

type PayMode = "cash" | "upi" | "bank" | "old_gold" | "old_silver";

interface PaymentDraft {
  id: string;
  mode: PayMode;
  amount: number;
  metal_wt: number;
  metal_purity: number;
  notes: string;
}

const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: "cash",       label: "Cash" },
  { value: "upi",        label: "UPI / GPay" },
  { value: "bank",       label: "Bank Transfer" },
  { value: "old_gold",   label: "Old Gold" },
  { value: "old_silver", label: "Old Silver" },
];

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-warn/10 text-warn",
  ready:     "bg-info/10 text-info",
  delivered: "bg-ok/10 text-ok",
  cancelled: "bg-err/10 text-err",
};

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function newPayment(): PaymentDraft {
  return { id: crypto.randomUUID(), mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, notes: "" };
}

// ─── Fan-out helper ─────────────────────────────────────────────────────────

async function fanoutOrderPayments(
  orderId: string,
  orderNo: string,
  payDate: string,
  payments: PaymentDraft[],
  customerId: string | null
) {
  const client = supabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promises: Promise<any>[] = [];

  for (const p of payments) {
    if (p.amount <= 0) continue;
    const desc = `Order advance — ${orderNo}`;

    if (p.mode === "cash") {
      promises.push(Promise.resolve(client.from("cash_ledger").insert({
        tx_date: payDate, direction: "in", amount: p.amount,
        description: desc, ref_type: "order", ref_id: orderId,
      })));
    } else if (p.mode === "upi" || p.mode === "bank") {
      promises.push(Promise.resolve(client.from("bank_ledger").insert({
        tx_date: payDate, direction: "in", amount: p.amount,
        description: desc, ref_type: "order", ref_id: orderId,
      })));
    } else if (p.mode === "old_gold" || p.mode === "old_silver") {
      const metal = p.mode === "old_gold" ? "gold_22k" : "silver";
      promises.push(Promise.resolve(client.from("old_metal_intake").insert({
        intake_date: payDate, metal,
        gross_wt: p.metal_wt, purity_pct: p.metal_purity || 91.6,
        pure_wt: parseFloat((p.metal_wt * ((p.metal_purity || 91.6) / 100)).toFixed(3)),
        source_type: "order", source_id: orderId, status: "pending",
        notes: p.notes || null,
      })));
    }

    if (customerId) {
      promises.push(Promise.resolve(client.from("payments").insert({
        pay_date: payDate,
        direction: "in",
        mode: p.mode === "old_gold" || p.mode === "old_silver" ? "cash" : p.mode,
        amount: p.amount,
        customer_id: customerId,
        notes: p.notes || `Order advance — ${orderNo}`,
      })));
    }
  }

  await Promise.allSettled(promises);
}

// ─── Data hooks ─────────────────────────────────────────────────────────────

function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("orders")
        .select("*, customers(name, phone), order_payments(*)")
        .order("order_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ─── Payment entry row component ─────────────────────────────────────────────

function PaymentRow({
  p, idx, payments, setPayments, boardRate, canRemove,
}: {
  p: PaymentDraft;
  idx: number;
  payments: PaymentDraft[];
  setPayments: (v: PaymentDraft[]) => void;
  boardRate: any;
  canRemove: boolean;
}) {
  function update(patch: Partial<PaymentDraft>) {
    setPayments(payments.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  return (
    <div className="bg-canvas border border-line rounded-lg2 p-3 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-ink-dim mb-1">Mode</label>
        <select value={p.mode} onChange={(e) => update({ mode: e.target.value as PayMode })}
          className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
          {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
        <input type="number" step="0.01" value={p.amount || ""}
          onFocus={(e) => e.target.select()} placeholder="0"
          onChange={(e) => update({ amount: parseFloat(e.target.value) || 0 })}
          className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
      </div>
      {(p.mode === "old_gold" || p.mode === "old_silver") && (
        <>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Weight (g)</label>
            <input type="number" step="0.001" value={p.metal_wt || ""}
              onFocus={(e) => e.target.select()} placeholder="0.000"
              onChange={(e) => {
                const wt = parseFloat(e.target.value) || 0;
                const rate = boardRate
                  ? (p.mode === "old_gold" ? boardRate.gold_24k : boardRate.silver_pure)
                  : 0;
                const amt = rate ? Math.round(wt * (p.metal_purity / 100) * rate) : p.amount;
                update({ metal_wt: wt, amount: amt });
              }}
              className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Purity %</label>
            <input type="number" step="0.01" value={p.metal_purity || ""}
              onFocus={(e) => e.target.select()} placeholder="91.6"
              onChange={(e) => {
                const purity = parseFloat(e.target.value) || 91.6;
                const rate = boardRate
                  ? (p.mode === "old_gold" ? boardRate.gold_24k : boardRate.silver_pure)
                  : 0;
                const amt = rate ? Math.round(p.metal_wt * (purity / 100) * rate) : p.amount;
                update({ metal_purity: purity, amount: amt });
              }}
              className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
        </>
      )}
      <div className="flex-1 min-w-[100px]">
        <label className="block text-xs text-ink-dim mb-1">Notes</label>
        <input value={p.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Optional"
          className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
      </div>
      {canRemove && (
        <button type="button" onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
          className="text-xs text-err hover:underline pb-1.5">× Remove</button>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const boardRate = useBoardRate((s) => s.rate);
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useOrders();

  // ── Create order form
  const [showForm, setShowForm] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orderDate, setOrderDate] = useState(globalDate);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedWt, setEstimatedWt] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [gstIncluded, setGstIncluded] = useState(false);
  const [advPayments, setAdvPayments] = useState<PaymentDraft[]>([]);

  // ── Per-order UI state
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingPayment, setEditingPayment] = useState<{
    id: string; orderId: string; orderNo: string;
    pay_date: string; mode: PayMode; amount: number;
    metal_wt: number; metal_purity: number; notes: string;
  } | null>(null);
  const [addPayOrderId, setAddPayOrderId] = useState<string | null>(null);
  const [addPayments, setAddPayments] = useState<PaymentDraft[]>([newPayment()]);
  const [addPayDate, setAddPayDate] = useState(globalDate);
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
  const [finalWt, setFinalWt] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [finalPayments, setFinalPayments] = useState<PaymentDraft[]>([]);

  function resetCreate() {
    setShowForm(false); setCustomer(null); setOrderDate(globalDate);
    setDeliveryDate(""); setDescription(""); setEstimatedWt(0); setEstimatedTotal(0); setGstIncluded(false); setAdvPayments([]);
  }

  // ── Create order mutation
  const createOrder = useMutation({
    mutationFn: async () => {
      const client = supabase();
      const fy = fyForDate(orderDate);
      const { data: n } = await client.rpc("next_fy_serial", { _fy: fy, _series: "O" });
      const orderNo = billNoFor("O", fy, n as number);
      const validPay = advPayments.filter((p) => p.amount > 0);
      const totalAdv = validPay.reduce((s, p) => s + p.amount, 0);

      const gstAmt = gstIncluded ? parseFloat((estimatedTotal * 0.03).toFixed(2)) : 0;
      const { data: order, error } = await client.from("orders").insert({
        order_no: orderNo, order_date: orderDate,
        delivery_date: deliveryDate || null,
        customer_id: customer?.id ?? null,
        description: description || null,
        estimated_wt: estimatedWt || null,
        total: parseFloat(((estimatedTotal || 0) + gstAmt).toFixed(2)),
        gst_included: gstIncluded,
        advance_paid: totalAdv,
        status: "pending",
      }).select().single();
      if (error) throw error;

      if (validPay.length) {
        await client.from("order_payments").insert(
          validPay.map((p) => ({
            order_id: order.id, pay_date: orderDate,
            mode: p.mode, amount: p.amount,
            metal_wt: p.metal_wt || null, metal_purity: p.metal_purity || null,
            notes: p.notes || null,
          }))
        );
        await fanoutOrderPayments(order.id, orderNo, orderDate, validPay, customer?.id ?? null);
      }
      return order;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); resetCreate(); },
  });

  // ── Add payment to existing order
  const addOrderPayment = useMutation({
    mutationFn: async ({ order }: { order: any }) => {
      const client = supabase();
      const validPay = addPayments.filter((p) => p.amount > 0);
      if (!validPay.length) return;
      const extra = validPay.reduce((s, p) => s + p.amount, 0);

      await client.from("order_payments").insert(
        validPay.map((p) => ({
          order_id: order.id, pay_date: addPayDate,
          mode: p.mode, amount: p.amount,
          metal_wt: p.metal_wt || null, metal_purity: p.metal_purity || null,
          notes: p.notes || null,
        }))
      );
      await client.from("orders").update({
        advance_paid: (Number(order.advance_paid) || 0) + extra,
      }).eq("id", order.id);
      await fanoutOrderPayments(order.id, order.order_no, addPayDate, validPay, order.customer_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      setAddPayOrderId(null); setAddPayments([newPayment()]);
    },
  });

  // ── Deliver order
  const deliverOrder = useMutation({
    mutationFn: async ({ order }: { order: any }) => {
      const client = supabase();
      const validPay = finalPayments.filter((p) => p.amount > 0);
      const extraAdv = validPay.reduce((s, p) => s + p.amount, 0);

      await client.from("orders").update({
        status: "delivered",
        final_wt: finalWt || null,
        final_total: finalTotal || null,
        total: finalTotal || order.total,
        advance_paid: (Number(order.advance_paid) || 0) + extraAdv,
      }).eq("id", order.id);

      if (validPay.length) {
        await client.from("order_payments").insert(
          validPay.map((p) => ({
            order_id: order.id, pay_date: globalDate,
            mode: p.mode, amount: p.amount,
            metal_wt: p.metal_wt || null, metal_purity: p.metal_purity || null,
            notes: p.notes || "Final payment on delivery",
          }))
        );
        await fanoutOrderPayments(order.id, order.order_no, globalDate, validPay, order.customer_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      setDeliverOrderId(null); setFinalWt(0); setFinalTotal(0); setFinalPayments([]);
    },
  });

  // ── Status update
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase().from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  // ── Edit order payment (with ledger rebuild)
  const editOrderPayment = useMutation({
    mutationFn: async ({ paymentId, orderId, orderNo, pay_date, mode, amount, metal_wt, metal_purity, notes }: {
      paymentId: string; orderId: string; orderNo: string;
      pay_date: string; mode: PayMode; amount: number;
      metal_wt: number; metal_purity: number; notes: string;
    }) => {
      const client = supabase();
      // 1. Update the order_payment row
      await client.from("order_payments").update({
        pay_date, mode, amount,
        metal_wt: metal_wt || null, metal_purity: metal_purity || null,
        notes: notes || null,
      }).eq("id", paymentId);

      // 2. Delete all ledger entries for this order and rebuild from scratch
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "order").eq("ref_id", orderId),
        client.from("bank_ledger").delete().eq("ref_type", "order").eq("ref_id", orderId),
      ]);
      const { data: allPay } = await client.from("order_payments").select("*").eq("order_id", orderId);
      const desc = `Order advance — ${orderNo}`;
      await Promise.allSettled(
        (allPay ?? []).filter((p) => p.amount > 0).map((p) => {
          if (p.mode === "cash") return client.from("cash_ledger").insert({ tx_date: p.pay_date, direction: "in", amount: p.amount, description: desc, ref_type: "order", ref_id: orderId });
          if (p.mode === "upi" || p.mode === "bank") return client.from("bank_ledger").insert({ tx_date: p.pay_date, direction: "in", amount: p.amount, description: desc, ref_type: "order", ref_id: orderId });
          return Promise.resolve();
        })
      );

      // 3. Recompute advance_paid from actual sum
      const newTotal = (allPay ?? []).reduce((s, p) => s + Number(p.amount), 0);
      await client.from("orders").update({ advance_paid: newTotal }).eq("id", orderId);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setEditingPayment(null); },
  });

  // ── Delete order payment
  const deleteOrderPayment = useMutation({
    mutationFn: async ({ paymentId, orderId, orderNo }: { paymentId: string; orderId: string; orderNo: string }) => {
      const client = supabase();
      await client.from("order_payments").delete().eq("id", paymentId);

      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "order").eq("ref_id", orderId),
        client.from("bank_ledger").delete().eq("ref_type", "order").eq("ref_id", orderId),
      ]);
      const { data: allPay } = await client.from("order_payments").select("*").eq("order_id", orderId);
      const desc = `Order advance — ${orderNo}`;
      await Promise.allSettled(
        (allPay ?? []).filter((p) => p.amount > 0).map((p) => {
          if (p.mode === "cash") return client.from("cash_ledger").insert({ tx_date: p.pay_date, direction: "in", amount: p.amount, description: desc, ref_type: "order", ref_id: orderId });
          if (p.mode === "upi" || p.mode === "bank") return client.from("bank_ledger").insert({ tx_date: p.pay_date, direction: "in", amount: p.amount, description: desc, ref_type: "order", ref_id: orderId });
          return Promise.resolve();
        })
      );
      const newTotal = (allPay ?? []).reduce((s, p) => s + Number(p.amount), 0);
      await client.from("orders").update({ advance_paid: newTotal }).eq("id", orderId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });

  const totalAdvPaid = useCallback((order: any) =>
    (order.order_payments ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0),
  []);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("orders")}</h1>
        <button onClick={() => setShowForm(true)}
          className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + {t("new_order")}
        </button>
      </div>

      {/* ── CREATE ORDER FORM ─────────────────────────────────── */}
      {showForm && (
        <div className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
          <h2 className="font-semibold text-sm">New Order</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs text-ink-dim mb-1">{t("customers")}</label>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Order Date</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Delivery Date</label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Est. Weight (g)</label>
              <input type="number" step="0.001" value={estimatedWt || ""}
                onFocus={(e) => e.target.select()} placeholder="0.000"
                onChange={(e) => setEstimatedWt(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Est. Total (₹) <span className="text-ink-dim/60 font-normal">before GST</span></label>
              <input type="number" step="0.01" value={estimatedTotal || ""}
                onFocus={(e) => e.target.select()} placeholder="0"
                onChange={(e) => setEstimatedTotal(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                <input type="checkbox" checked={gstIncluded} onChange={(e) => setGstIncluded(e.target.checked)} className="accent-gold w-4 h-4" />
                <span>Include GST (3%)</span>
              </label>
              {gstIncluded && estimatedTotal > 0 && (
                <p className="text-xs text-ink-dim">
                  +{inr(estimatedTotal * 0.03)} GST = <strong className="text-gold">{inr(estimatedTotal * 1.03)}</strong>
                </p>
              )}
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-xs text-ink-dim mb-1">Description / Design</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                rows={2} placeholder="What the customer wants made…"
                className={inp + " resize-none"} />
            </div>
          </div>

          {/* Advance payments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Advance Payments</h3>
              <button type="button" onClick={() => setAdvPayments((p) => [...p, newPayment()])}
                className="text-xs text-gold hover:underline">+ Add Payment</button>
            </div>
            {advPayments.length === 0 && (
              <p className="text-xs text-ink-dim italic">No advance — customer will pay on delivery.</p>
            )}
            {advPayments.map((p, idx) => (
              <PaymentRow key={p.id} p={p} idx={idx} payments={advPayments}
                setPayments={setAdvPayments} boardRate={boardRate} canRemove={true} />
            ))}
            {advPayments.length > 0 && (
              <p className="text-xs text-ink-dim text-right">
                Total advance: <strong className="text-gold">{inr(advPayments.reduce((s, p) => s + p.amount, 0))}</strong>
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button disabled={createOrder.isPending} onClick={() => createOrder.mutate()}
              className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
              {createOrder.isPending ? "Saving…" : t("save")}
            </button>
            <button type="button" onClick={resetCreate}
              className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
          {createOrder.isError && (
            <p className="text-xs text-err">Save failed — run migration 008 first.</p>
          )}
        </div>
      )}

      {/* ── ORDERS LIST ──────────────────────────────────────────── */}
      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="space-y-2">
          {!orders.length && (
            <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
              No orders yet.
            </div>
          )}
          {orders.map((o: any) => {
            const paidSoFar = totalAdvPaid(o);
            const effectiveTotal = Number(o.final_total) || Number(o.total) || 0;
            const balance = effectiveTotal - paidSoFar;
            const isExpanded = expanded === o.id;
            const isAddingPay = addPayOrderId === o.id;
            const isDelivering = deliverOrderId === o.id;

            return (
              <div key={o.id} className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                {/* ── Row header (always visible) */}
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 cursor-pointer hover:bg-canvas/50"
                  onClick={() => setExpanded(isExpanded ? null : o.id)}>
                  <span className="font-mono text-info text-sm font-medium w-24">{o.order_no}</span>
                  <span className="text-xs text-ink-dim">{shortDate(o.order_date)}</span>
                  {o.delivery_date && (
                    <span className="text-xs text-ink-dim">→ {shortDate(o.delivery_date)}</span>
                  )}
                  <span className="text-sm font-medium flex-1">{o.customers?.name ?? "Walk-in"}</span>
                  {o.estimated_wt && (
                    <span className="text-xs text-ink-dim hidden sm:inline">{grams(o.estimated_wt)}</span>
                  )}
                  <span className="text-sm font-mono">
                    {inr(effectiveTotal)}
                    {o.gst_included && <span className="ml-1 text-xs bg-info/10 text-info px-1 py-0.5 rounded">GST</span>}
                  </span>
                  <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[o.status] ?? "bg-canvas text-ink-dim")}>
                    {o.status}
                  </span>
                  <span className="text-ink-dim text-xs">{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* ── Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-line px-4 py-4 space-y-4">
                    {/* Order info */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-ink-dim">Est. Weight</p>
                        <p className="font-medium">{o.estimated_wt ? grams(o.estimated_wt) : "—"}</p>
                      </div>
                      {o.final_wt && (
                        <div>
                          <p className="text-xs text-ink-dim">Final Weight</p>
                          <p className="font-medium text-ok">{grams(o.final_wt)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-ink-dim">Est. Total</p>
                        <p className="font-medium">
                          {inr(Number(o.total))}
                          {o.gst_included && <span className="ml-1 text-xs bg-info/10 text-info px-1.5 py-0.5 rounded">+GST</span>}
                        </p>
                      </div>
                      {o.final_total && (
                        <div>
                          <p className="text-xs text-ink-dim">Final Total</p>
                          <p className="font-medium text-ok">{inr(Number(o.final_total))}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-ink-dim">Advance Paid</p>
                        <p className="font-medium text-ok">{inr(paidSoFar)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink-dim">Balance Due</p>
                        <p className={clsx("font-medium", balance > 0.01 ? "text-err" : "text-ok")}>
                          {balance > 0.01 ? inr(balance) : "Fully paid"}
                        </p>
                      </div>
                    </div>
                    {o.description && (
                      <p className="text-sm text-ink-dim bg-canvas rounded-lg2 px-3 py-2">{o.description}</p>
                    )}

                    {/* Payment history */}
                    {(o.order_payments ?? []).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-ink-dim mb-2">Payment History</p>
                        <div className="space-y-1">
                          {(o.order_payments as any[]).map((p: any) => (
                            <div key={p.id}>
                              {editingPayment !== null && editingPayment.id === p.id ? (
                                /* ── Inline edit form */
                                <div className="bg-gold/5 border border-gold/30 rounded-lg2 px-3 py-3 space-y-2">
                                  <div className="flex flex-wrap items-end gap-2">
                                    <div>
                                      <label className="text-xs text-ink-dim block mb-1">Date</label>
                                      <input type="date" value={editingPayment.pay_date}
                                        onChange={(e) => setEditingPayment({ ...editingPayment, pay_date: e.target.value })}
                                        className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-ink-dim block mb-1">Mode</label>
                                      <select value={editingPayment.mode}
                                        onChange={(e) => setEditingPayment({ ...editingPayment, mode: e.target.value as PayMode })}
                                        className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                                        {PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-ink-dim block mb-1">Amount (₹)</label>
                                      <input type="number" step="0.01" value={editingPayment.amount || ""}
                                        onFocus={(e) => e.target.select()}
                                        onChange={(e) => setEditingPayment({ ...editingPayment, amount: parseFloat(e.target.value) || 0 })}
                                        className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
                                        autoFocus />
                                    </div>
                                    {(editingPayment.mode === "old_gold" || editingPayment.mode === "old_silver") && (
                                      <>
                                        <div>
                                          <label className="text-xs text-ink-dim block mb-1">Weight (g)</label>
                                          <input type="number" step="0.001" value={editingPayment.metal_wt || ""}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setEditingPayment({ ...editingPayment, metal_wt: parseFloat(e.target.value) || 0 })}
                                            className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                                        </div>
                                        <div>
                                          <label className="text-xs text-ink-dim block mb-1">Purity %</label>
                                          <input type="number" step="0.01" value={editingPayment.metal_purity || ""}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => setEditingPayment({ ...editingPayment, metal_purity: parseFloat(e.target.value) || 91.6 })}
                                            className="w-20 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                                        </div>
                                      </>
                                    )}
                                    <div className="flex-1 min-w-[100px]">
                                      <label className="text-xs text-ink-dim block mb-1">Notes</label>
                                      <input value={editingPayment.notes}
                                        onChange={(e) => setEditingPayment({ ...editingPayment, notes: e.target.value })}
                                        className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
                                        placeholder="Optional" />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      disabled={editOrderPayment.isPending || editingPayment.amount <= 0}
                                      onClick={() => editOrderPayment.mutate(editingPayment)}
                                      className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                      {editOrderPayment.isPending ? "Saving…" : "Save"}
                                    </button>
                                    <button onClick={() => setEditingPayment(null)}
                                      className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                /* ── Normal display row */
                                <div className="flex items-center gap-3 text-sm bg-canvas rounded-lg2 px-3 py-2">
                                  <span className="text-ink-dim text-xs">{shortDate(p.pay_date)}</span>
                                  <span className="capitalize text-xs border border-line rounded px-1.5 py-0.5 text-ink-dim">
                                    {p.mode.replace("_", " ")}
                                  </span>
                                  {p.metal_wt && (
                                    <span className="text-xs text-ink-dim">{grams(p.metal_wt)} @ {p.metal_purity}%</span>
                                  )}
                                  {p.notes && <span className="text-xs text-ink-dim truncate max-w-xs">{p.notes}</span>}
                                  <span className="font-mono font-medium text-ok ml-auto">{inr(Number(p.amount))}</span>
                                  <button
                                    onClick={() => setEditingPayment({
                                      id: p.id, orderId: o.id, orderNo: o.order_no,
                                      pay_date: p.pay_date, mode: p.mode,
                                      amount: Number(p.amount),
                                      metal_wt: Number(p.metal_wt) || 0,
                                      metal_purity: Number(p.metal_purity) || 91.6,
                                      notes: p.notes ?? "",
                                    })}
                                    className="text-xs text-gold hover:underline shrink-0">Edit</button>
                                  <button
                                    onClick={() => { if (window.confirm("Delete this payment? Ledger will be updated.")) deleteOrderPayment.mutate({ paymentId: p.id, orderId: o.id, orderNo: o.order_no }); }}
                                    className="text-xs text-err hover:underline shrink-0">Del</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    {o.status !== "delivered" && o.status !== "cancelled" && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
                        {o.status === "pending" && (
                          <button onClick={() => updateStatus.mutate({ id: o.id, status: "ready" })}
                            className="text-sm bg-info/10 text-info border border-info/30 px-4 py-1.5 rounded-lg2 hover:bg-info/20">
                            ✓ Mark Ready
                          </button>
                        )}
                        {!isAddingPay && !isDelivering && (
                          <button onClick={() => { setAddPayOrderId(o.id); setAddPayDate(globalDate); setAddPayments([newPayment()]); }}
                            className="text-sm bg-canvas border border-line px-4 py-1.5 rounded-lg2 hover:border-gold">
                            + Add Payment
                          </button>
                        )}
                        {!isDelivering && !isAddingPay && (
                          <button onClick={() => {
                            setDeliverOrderId(o.id);
                            setFinalWt(Number(o.estimated_wt) || 0);
                            setFinalTotal(Number(o.total) || 0);
                            setFinalPayments(balance > 0.01 ? [newPayment()] : []);
                          }}
                            className="text-sm bg-ok/10 text-ok border border-ok/30 px-4 py-1.5 rounded-lg2 hover:bg-ok/20">
                            🚚 Deliver
                          </button>
                        )}
                        <button onClick={() => updateStatus.mutate({ id: o.id, status: "cancelled" })}
                          className="text-sm text-err border border-err/30 px-4 py-1.5 rounded-lg2 hover:bg-err/5 ml-auto">
                          Cancel Order
                        </button>
                      </div>
                    )}

                    {/* Add Payment inline form */}
                    {isAddingPay && (
                      <div className="border border-gold/30 rounded-xl p-4 bg-gold/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">Add Payment</h3>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-ink-dim">Date</label>
                            <input type="date" value={addPayDate} onChange={(e) => setAddPayDate(e.target.value)}
                              className="border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          {addPayments.map((p, idx) => (
                            <PaymentRow key={p.id} p={p} idx={idx} payments={addPayments}
                              setPayments={setAddPayments} boardRate={boardRate}
                              canRemove={addPayments.length > 1} />
                          ))}
                        </div>
                        <button type="button" onClick={() => setAddPayments((p) => [...p, newPayment()])}
                          className="text-xs text-gold hover:underline">+ Add another</button>
                        <div className="flex gap-2 pt-1">
                          <button disabled={addOrderPayment.isPending}
                            onClick={() => addOrderPayment.mutate({ order: o })}
                            className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                            {addOrderPayment.isPending ? "Saving…" : "Save Payment"}
                          </button>
                          <button onClick={() => setAddPayOrderId(null)}
                            className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
                        </div>
                      </div>
                    )}

                    {/* Deliver inline form */}
                    {isDelivering && (
                      <div className="border border-ok/30 rounded-xl p-4 bg-ok/5 space-y-4">
                        <h3 className="text-sm font-semibold text-ok">Deliver Order — Set Final Details</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Final Weight (g)</label>
                            <input type="number" step="0.001" value={finalWt || ""}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setFinalWt(parseFloat(e.target.value) || 0)}
                              className={inp} placeholder="Actual weight" />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Final Total (₹)</label>
                            <input type="number" step="0.01" value={finalTotal || ""}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setFinalTotal(parseFloat(e.target.value) || 0)}
                              className={inp} placeholder="Actual bill amount" />
                          </div>
                          <div className="flex flex-col justify-end">
                            <p className="text-xs text-ink-dim mb-1">Remaining Balance</p>
                            <p className={clsx("text-sm font-bold px-3 py-2 rounded-lg2 border",
                              (finalTotal - paidSoFar) > 0.01
                                ? "border-err/30 bg-err/5 text-err"
                                : "border-ok/30 bg-ok/5 text-ok")}>
                              {(finalTotal - paidSoFar) > 0.01
                                ? inr(finalTotal - paidSoFar) + " to collect"
                                : "Fully paid ✓"}
                            </p>
                          </div>
                        </div>

                        {/* Final payment section — shown if balance exists */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-ink-dim">Payment on Delivery</p>
                            <button type="button" onClick={() => setFinalPayments((p) => [...p, newPayment()])}
                              className="text-xs text-gold hover:underline">+ Add</button>
                          </div>
                          {finalPayments.length === 0 && (
                            <p className="text-xs text-ink-dim italic">No additional payment on delivery.</p>
                          )}
                          {finalPayments.map((p, idx) => (
                            <PaymentRow key={p.id} p={p} idx={idx} payments={finalPayments}
                              setPayments={setFinalPayments} boardRate={boardRate}
                              canRemove={finalPayments.length > 0} />
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <button disabled={deliverOrder.isPending}
                            onClick={() => deliverOrder.mutate({ order: o })}
                            className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                            {deliverOrder.isPending ? "Saving…" : "Confirm Delivery"}
                          </button>
                          <button onClick={() => setDeliverOrderId(null)}
                            className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
