"use client";

import { useState } from "react";
import GroupCombobox from "@/components/ui/group-combobox";
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
import { useProducts, useProductGroups } from "@/modules/sales/products-api";
import { usePartnerAccounts } from "@/modules/partner-accounts/api";

// ─── Types ──────────────────────────────────────────────────────────────────

type PayMode = "cash" | "upi" | "bank" | "old_gold" | "old_silver" | "advance";

interface PaymentDraft {
  id: string;
  mode: PayMode;
  amount: number;
  metal_wt: number;
  metal_purity: number;
  notes: string;
  partner_account_id?: string;
}

interface OrderItemDraft {
  id: string;
  description: string;
  metal: string;
  estimated_wt: number;
  amount: number;
  notes: string;
}

const PAY_MODES: { value: PayMode; label: string }[] = [
  { value: "cash",       label: "Cash" },
  { value: "upi",        label: "UPI / GPay" },
  { value: "bank",       label: "Bank Transfer" },
  { value: "old_gold",   label: "Old Gold" },
  { value: "old_silver", label: "Old Silver" },
  { value: "advance",    label: "From Advance Balance" },
];

const METALS = [
  { value: "gold_22k",    label: "Gold 22K" },
  { value: "gold_18k",    label: "Gold 18K" },
  { value: "gold_24k",    label: "Gold 24K" },
  { value: "silver",      label: "Silver" },
  { value: "silver_mpr",  label: "Silver MPR" },
  { value: "other",       label: "Other / Diamond" },
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

function newOrderItem(): OrderItemDraft {
  return { id: crypto.randomUUID(), description: "", metal: "gold_22k", estimated_wt: 0, amount: 0, notes: "" };
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

    if (p.mode === "advance") {
      // Debit customer's existing advance balance
      if (customerId) {
        promises.push(Promise.resolve(client.from("payments").insert({
          pay_date: payDate, direction: "out", mode: "advance",
          amount: p.amount, customer_id: customerId, is_advance: true,
          notes: p.notes || `Order advance used — ${orderNo}`,
        })));
      }
      continue;
    }

    // Cash/bank/UPI/old_gold payments for an order are tracked in order_payments only.
    // They do NOT go into the customer payments table — that table is for direct credit/debit
    // to the customer's account, not order-specific transactions.
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
        .select("*, customers(name, phone)")
        .order("order_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// Lazy-load payments only for the currently-expanded order
function useOrderPayments(orderId: string | null) {
  return useQuery({
    queryKey: ["order_payments_expanded", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("order_payments").select("*").eq("order_id", orderId!).order("pay_date");
      if (error) return [];
      return (data ?? []) as any[];
    },
  });
}

function useOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ["order_items", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("order_items").select("*").eq("order_id", orderId!).order("sort_order");
      if (error) return [];
      return (data ?? []) as any[];
    },
  });
}

// Checks cash_ledger (cash payback) or payments (advance credit) for this order
function useOrderPayback(orderId: string | null, orderNo: string | null) {
  return useQuery({
    queryKey: ["order_payback", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const client = supabase();
      // Use limit(1) — .maybeSingle() throws when duplicates exist
      const { data: cashRows } = await client
        .from("cash_ledger")
        .select("id, amount")
        .eq("ref_type", "order")
        .eq("ref_id", orderId!)
        .eq("direction", "out")
        .order("created_at", { ascending: false })
        .limit(1);
      const cashEntry = cashRows?.[0] ?? null;
      if (cashEntry) return { type: "cash" as const, amount: Number(cashEntry.amount) };
      if (orderNo) {
        const { data: advRows } = await client
          .from("payments")
          .select("id, amount")
          .eq("direction", "in")
          .eq("mode", "advance")
          .eq("notes", `Excess — ${orderNo}`)
          .limit(1);
        const advEntry = advRows?.[0] ?? null;
        if (advEntry) return { type: "advance" as const, amount: Number(advEntry.amount) };
      }
      return null;
    },
  });
}

// ─── Order items table (lazy — only loads when order is expanded) ────────────

function OrderItemsView({ orderId }: { orderId: string }) {
  const { data: items = [] } = useOrderItems(orderId);
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-ink-dim mb-2">Items</p>
      <div className="rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-left px-2 py-2">Metal</th>
              <th className="text-right px-2 py-2">Est. Wt</th>
              <th className="text-right px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{item.description || "—"}</td>
                <td className="px-2 py-2 text-ink-dim capitalize text-xs">{item.metal?.replace(/_/g, " ") || "—"}</td>
                <td className="px-2 py-2 text-right text-ink-dim">{item.estimated_wt > 0 ? `${Number(item.estimated_wt).toFixed(3)}g` : "—"}</td>
                <td className="px-3 py-2 text-right font-medium text-gold">{item.amount > 0 ? `₹${Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
              </tr>
            ))}
            {items.some((i: any) => i.amount > 0) && (
              <tr className="bg-canvas border-t border-line">
                <td colSpan={3} className="px-3 py-1.5 text-xs text-ink-dim text-right font-medium">Items Total</td>
                <td className="px-3 py-1.5 text-right text-sm font-bold text-gold">
                  ₹{items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Payment entry row component ─────────────────────────────────────────────

function PaymentRow({
  p, idx, payments, setPayments, boardRate, canRemove, advanceBalance, partnerAccounts,
}: {
  p: PaymentDraft;
  idx: number;
  payments: PaymentDraft[];
  setPayments: (v: PaymentDraft[]) => void;
  boardRate: any;
  canRemove: boolean;
  advanceBalance?: number;
  partnerAccounts?: { id: string; name: string; account_type: string; account_no: string | null }[];
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
      {(p.mode === "old_gold" || p.mode === "old_silver") ? (
        <>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Weight (g)</label>
            <input type="number" step="0.001" value={p.metal_wt || ""}
              onFocus={(e) => e.target.select()} placeholder="0.000"
              onChange={(e) => {
                const wt = parseFloat(e.target.value) || 0;
                const pureRate = boardRate ? (p.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                const amt = pureRate ? Math.round(wt * (p.metal_purity / 100) * pureRate) : p.amount;
                update({ metal_wt: wt, amount: amt });
              }}
              className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Total (₹)</label>
            <input type="number" step="0.01" value={p.amount || ""}
              onFocus={(e) => e.target.select()} placeholder="0"
              onChange={(e) => {
                const amt = parseFloat(e.target.value) || 0;
                const pureRate = boardRate ? (p.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                const purity = (pureRate && p.metal_wt) ? Math.round((amt / (p.metal_wt * pureRate)) * 1000) / 10 : p.metal_purity;
                update({ amount: amt, metal_purity: purity });
              }}
              className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
          <div>
            <label className="block text-xs text-ink-dim mb-1">Purity %</label>
            <input type="number" step="0.01" value={p.metal_purity || ""}
              onFocus={(e) => e.target.select()} placeholder="91.6"
              onChange={(e) => {
                const purity = parseFloat(e.target.value) || 91.6;
                const pureRate = boardRate ? (p.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                const amt = pureRate ? Math.round(p.metal_wt * (purity / 100) * pureRate) : p.amount;
                update({ metal_purity: purity, amount: amt });
              }}
              className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
          </div>
        </>
      ) : (
        <div>
          <label className="block text-xs text-ink-dim mb-1">Amount (₹)</label>
          <input type="number" step="0.01" value={p.amount || ""}
            onFocus={(e) => e.target.select()} placeholder="0"
            onChange={(e) => update({ amount: parseFloat(e.target.value) || 0 })}
            className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
        </div>
      )}
      <div className="flex-1 min-w-[100px]">
        <label className="block text-xs text-ink-dim mb-1">Notes</label>
        <input value={p.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="Optional"
          className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
      </div>
      {(p.mode === "upi" || p.mode === "bank") && partnerAccounts && partnerAccounts.length > 0 && (
        <div className="w-44">
          <label className="block text-xs text-ink-dim mb-1">Received in</label>
          <select value={p.partner_account_id ?? ""}
            onChange={e => update({ partner_account_id: e.target.value || undefined })}
            className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
            <option value="">Shop account</option>
            {partnerAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      {p.mode === "advance" && (
        <div className="self-end pb-2">
          {advanceBalance === undefined
            ? <span className="text-xs text-ink-dim">Select customer to check balance</span>
            : advanceBalance > 0
              ? <span className="text-xs text-ok font-medium">Available: {inr(advanceBalance)}</span>
              : <span className="text-xs text-err font-medium">No advance balance</span>
          }
        </div>
      )}
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
  const { data: products = [] } = useProducts(true);
  const { data: productGroups = [] } = useProductGroups(true);
  const { data: partnerAccounts = [] } = usePartnerAccounts();

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
  const [orderItems, setOrderItems] = useState<OrderItemDraft[]>([]);

  // Customer advance balance (for advance payment mode)
  const { data: advanceBalance } = useQuery({
    queryKey: ["customer_advance", customer?.id ?? null],
    enabled: !!customer?.id,
    queryFn: async () => {
      const { data } = await supabase()
        .from("payments")
        .select("amount, direction")
        .eq("customer_id", customer!.id)
        .eq("is_advance", true);
      return (data ?? []).reduce((s, p) =>
        s + (p.direction === "in" ? Number(p.amount) : -Number(p.amount)), 0);
    },
  });

  // ── Per-order UI state
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: expandedPayments = [] } = useOrderPayments(expanded);
  const expandedOrderNo = (orders as any[]).find((o: any) => o.id === expanded)?.order_no ?? null;
  const { data: paybackEntry } = useOrderPayback(expanded, expandedOrderNo);
  const [editingPayment, setEditingPayment] = useState<{
    id: string; orderId: string; orderNo: string;
    pay_date: string; mode: PayMode; amount: number;
    metal_wt: number; metal_purity: number; notes: string;
  } | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<{
    customer: Customer | null; order_date: string; delivery_date: string;
    description: string; estimated_wt: number; estimated_total: number; gst_included: boolean;
  }>({ customer: null, order_date: "", delivery_date: "", description: "", estimated_wt: 0, estimated_total: 0, gst_included: false });
  const [addPayOrderId, setAddPayOrderId] = useState<string | null>(null);
  const [addPayments, setAddPayments] = useState<PaymentDraft[]>([newPayment()]);
  const [addPayDate, setAddPayDate] = useState(globalDate);
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
  const [finalWt, setFinalWt] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [finalPayments, setFinalPayments] = useState<PaymentDraft[]>([]);

  // ── Filters
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "ready" | "delivered" | "cancelled">("all");
  const [filterMonth, setFilterMonth] = useState("");

  const filteredOrders = (orders as any[]).filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterMonth && !o.order_date?.startsWith(filterMonth)) return false;
    return true;
  });

  const statusCounts = (orders as any[]).reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  function resetCreate() {
    setShowForm(false); setCustomer(null); setOrderDate(globalDate);
    setDeliveryDate(""); setDescription(""); setEstimatedWt(0); setEstimatedTotal(0); setGstIncluded(false); setAdvPayments([]); setOrderItems([]);
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

      // If line items exist, use their sum as the estimated total
      const itemsTotal = orderItems.reduce((s, i) => s + (i.amount || 0), 0);
      const baseTotal = itemsTotal > 0 ? itemsTotal : (estimatedTotal || 0);
      const totalGrossWt = orderItems.reduce((s, i) => s + (i.estimated_wt || 0), 0) || estimatedWt || null;
      // GST is INCLUSIVE: the value entered already contains GST — no addition needed
      const hasSilverMpr = orderItems.some((i) => i.metal === "silver_mpr");
      const effectiveGst = gstIncluded || hasSilverMpr;
      const { data: order, error } = await client.from("orders").insert({
        order_no: orderNo, order_date: orderDate,
        delivery_date: deliveryDate || null,
        customer_id: customer?.id ?? null,
        description: description || null,
        estimated_wt: totalGrossWt,
        total: parseFloat(baseTotal.toFixed(2)),
        gst_included: effectiveGst,
        advance_paid: totalAdv,
        status: "pending",
      }).select().single();
      if (error) throw error;

      if (orderItems.length > 0) {
        await client.from("order_items").insert(
          orderItems.map((item, idx) => ({
            order_id: order.id, description: item.description || null,
            metal: item.metal || null, estimated_wt: item.estimated_wt || 0,
            amount: item.amount || 0, notes: item.notes || null, sort_order: idx,
          }))
        );
      }

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
          partner_account_id: p.partner_account_id || null,
        }))
      );
      await client.from("orders").update({
        advance_paid: (Number(order.advance_paid) || 0) + extra,
      }).eq("id", order.id);
      await fanoutOrderPayments(order.id, order.order_no, addPayDate, validPay, order.customer_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order_payments_expanded", expanded] });
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

  // ── Update order details
  const updateOrder = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const f = editOrderForm;
      // GST is inclusive — the entered value already contains GST
      const total = parseFloat((f.estimated_total || 0).toFixed(2));
      const { error } = await supabase().from("orders").update({
        customer_id: f.customer?.id ?? null,
        order_date: f.order_date,
        delivery_date: f.delivery_date || null,
        description: f.description || null,
        estimated_wt: f.estimated_wt || null,
        total,
        gst_included: f.gst_included,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orders"] }); setEditOrderId(null); },
  });

  // ── Edit order payment (with ledger rebuild)
  const editOrderPayment = useMutation({
    mutationFn: async ({ id: paymentId, orderId, orderNo, pay_date, mode, amount, metal_wt, metal_purity, notes }: {
      id: string; orderId: string; orderNo: string;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order_payments_expanded", expanded] });
      setEditingPayment(null);
    },
  });

  // ── Pay back excess cash — delete-then-insert so re-clicks clean up duplicates
  const payBackCash = useMutation({
    mutationFn: async ({ orderId, orderNo, amount }: { orderId: string; orderNo: string; amount: number }) => {
      const client = supabase();
      // Wipe any existing payback entries first (prevents duplicates)
      await client.from("cash_ledger")
        .delete()
        .eq("ref_type", "order").eq("ref_id", orderId).eq("direction", "out");
      const { error } = await client.from("cash_ledger").insert({
        tx_date: globalDate,
        direction: "out",
        amount,
        description: `Cash returned to customer — ${orderNo}`,
        ref_type: "order",
        ref_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["order_payback", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["day-sales-ledger"] });
    },
  });

  // ── Clear wrong/duplicate payback so user can re-record correctly
  const clearPayback = useMutation({
    mutationFn: async ({ orderId, orderNo }: { orderId: string; orderNo: string }) => {
      const client = supabase();
      await Promise.allSettled([
        client.from("cash_ledger")
          .delete()
          .eq("ref_type", "order").eq("ref_id", orderId).eq("direction", "out"),
        client.from("payments")
          .delete()
          .eq("direction", "in").eq("mode", "advance").eq("notes", `Excess — ${orderNo}`),
      ]);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["order_payback", vars.orderId] });
      qc.invalidateQueries({ queryKey: ["day-sales-ledger"] });
    },
  });

  // ── Keep excess as customer advance instead of cash payback
  const keepAsAdvance = useMutation({
    mutationFn: async ({ orderNo, amount, customerId }: { orderNo: string; amount: number; customerId: string }) => {
      const { error } = await supabase().from("payments").insert({
        pay_date: globalDate,
        direction: "in",
        mode: "advance",
        amount,
        customer_id: customerId,
        is_advance: true,
        notes: `Excess — ${orderNo}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order_payback", expanded] });
      qc.invalidateQueries({ queryKey: ["customer_advance"] });
    },
  });

  // ── Delete entire order with cascading cleanup
  const deleteOrder = useMutation({
    mutationFn: async ({ orderId, orderNo }: { orderId: string; orderNo: string }) => {
      const client = supabase();
      const { data: intakes } = await client
        .from("old_metal_intake")
        .select("id, status")
        .eq("source_type", "order")
        .eq("source_id", orderId);
      const usedIntakes = (intakes ?? []).filter((i: any) => i.status === "used" || i.status === "sold");
      if (usedIntakes.length > 0) {
        const go = window.confirm(
          `Old gold for ${orderNo} has already been sent to the refinery and will NOT be deleted.\n\nAll other data (payments, ledger entries) will be permanently deleted.\n\nContinue?`
        );
        if (!go) return;
      }
      await Promise.allSettled([
        client.from("cash_ledger").delete().eq("ref_type", "order").eq("ref_id", orderId),
        client.from("bank_ledger").delete().eq("ref_type", "order").eq("ref_id", orderId),
        client.from("old_metal_intake").delete().eq("source_type", "order").eq("source_id", orderId).eq("status", "pending"),
      ]);
      await client.from("order_payments").delete().eq("order_id", orderId);
      await client.from("order_items").delete().eq("order_id", orderId);
      await client.from("orders").delete().eq("id", orderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      setExpanded(null);
    },
  });

  // ── Reactivate a cancelled order back to pending
  const reactivateOrder = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase().from("orders").update({ status: "pending" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order_payments_expanded", expanded] });
    },
  });

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
              <label className="block text-xs text-ink-dim mb-1">Est. Total (₹) <span className="text-ink-dim/60 font-normal">{gstIncluded ? "incl. GST" : "excl. GST"}</span></label>
              <input type="number" step="0.01" value={estimatedTotal || ""}
                onFocus={(e) => e.target.select()} placeholder="0"
                onChange={(e) => setEstimatedTotal(parseFloat(e.target.value) || 0)} className={inp} />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                <input type="checkbox" checked={gstIncluded} onChange={(e) => setGstIncluded(e.target.checked)} className="accent-gold w-4 h-4" />
                <span>GST 3% included</span>
              </label>
              {gstIncluded && estimatedTotal > 0 && (
                <p className="text-xs text-ink-dim">
                  GST: <strong className="text-ok">{inr(estimatedTotal * 3 / 103)}</strong> · base: {inr(estimatedTotal * 100 / 103)}
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

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Items / Work Details</h3>
              <button type="button" onClick={() => setOrderItems((p) => [...p, newOrderItem()])}
                className="text-xs text-gold hover:underline">+ Add Item</button>
            </div>
            {orderItems.length === 0 && (
              <p className="text-xs text-ink-dim italic">No items — or describe everything in the notes above.</p>
            )}
            {orderItems.map((item, idx) => (
              <div key={item.id} className="bg-canvas border border-line rounded-lg2 p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                <div className="col-span-2 space-y-1">
                  <label className="block text-xs text-ink-dim">Description</label>
                  {productGroups.length > 0 && (
                    <GroupCombobox
                      groups={productGroups as any}
                      metal={item.metal || "gold_22k"}
                      onSelect={(grp) => setOrderItems((prev) => prev.map((x, i) => i === idx ? { ...x, description: grp.name, metal: grp.metal } : x))}
                      placeholder="Search group…"
                    />
                  )}
                  {products.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const matched = products.find((p) => p.id === e.target.value);
                        if (matched) {
                          setOrderItems((prev) => prev.map((x, i) => i === idx ? { ...x, description: matched.name, metal: matched.metal } : x));
                        }
                      }}
                      className="w-full border border-line rounded-lg2 px-2 py-1.5 text-xs text-ink-dim focus:outline-none focus:ring-1 focus:ring-gold"
                    >
                      <option value="">Pick product…</option>
                      {(() => {
                        const topGroups = productGroups.filter((g: { parent_id: string | null }) => !g.parent_id);
                        const childGroups = (pid: string) => productGroups.filter((g: { parent_id: string | null }) => g.parent_id === pid);
                        const ungrouped = products.filter((p: { group_id: string | null }) => !p.group_id);
                        const rendered: React.ReactNode[] = [];
                        topGroups.forEach((parent: { id: string; name: string }) => {
                          const parentProds = products.filter((p: { group_id: string | null }) => p.group_id === parent.id);
                          const children = childGroups(parent.id);
                          if (children.length === 0 && parentProds.length > 0) {
                            rendered.push(
                              <optgroup key={parent.id} label={parent.name}>
                                {parentProds.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </optgroup>
                            );
                          } else {
                            if (parentProds.length > 0) {
                              rendered.push(
                                <optgroup key={parent.id} label={parent.name}>
                                  {parentProds.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </optgroup>
                              );
                            }
                            children.forEach((child: { id: string; name: string }) => {
                              const childProds = products.filter((p: { group_id: string | null }) => p.group_id === child.id);
                              if (childProds.length > 0) {
                                rendered.push(
                                  <optgroup key={child.id} label={`${parent.name} › ${child.name}`}>
                                    {childProds.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </optgroup>
                                );
                              }
                            });
                          }
                        });
                        if (ungrouped.length > 0) {
                          rendered.push(
                            <optgroup key="__ungrouped" label="Other">
                              {ungrouped.map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                          );
                        }
                        return rendered;
                      })()}
                    </select>
                  )}
                  <input value={item.description}
                    onChange={(e) => setOrderItems((prev) => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                    placeholder="Ring, chain, kolusu…"
                    className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={item.metal}
                    onChange={(e) => {
                      const metal = e.target.value;
                      setOrderItems((prev) => prev.map((x, i) => i === idx ? { ...x, metal } : x));
                      if (metal === "silver_mpr") setGstIncluded(true);
                    }}
                    className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                    {METALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Est. Wt (g)</label>
                  <input type="number" step="0.001" value={item.estimated_wt || ""}
                    onFocus={(e) => e.target.select()} placeholder="0.000"
                    onChange={(e) => setOrderItems((prev) => prev.map((x, i) => i === idx ? { ...x, estimated_wt: parseFloat(e.target.value) || 0 } : x))}
                    className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1 flex items-center gap-1">
                    Est. Amount (₹)
                    {item.metal === "silver_mpr" && (
                      <span className="bg-ok/10 text-ok text-[10px] px-1.5 py-0.5 rounded font-medium">GST incl.</span>
                    )}
                  </label>
                  <div className="flex gap-1">
                    <input type="number" step="0.01" value={item.amount || ""}
                      onFocus={(e) => e.target.select()} placeholder="0"
                      onChange={(e) => setOrderItems((prev) => prev.map((x, i) => i === idx ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))}
                      className="flex-1 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                    <button type="button" onClick={() => setOrderItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-err text-xs px-2 hover:underline">×</button>
                  </div>
                  {item.metal === "silver_mpr" && item.amount > 0 && (
                    <p className="text-[10px] text-ink-dim mt-0.5">GST: {inr(item.amount * 3 / 103)} · base: {inr(item.amount * 100 / 103)}</p>
                  )}
                </div>
              </div>
            ))}
            {orderItems.length > 0 && (
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-ink-dim">
                  {orderItems.reduce((s, i) => s + (i.estimated_wt || 0), 0) > 0
                    ? `Total est. wt: ${grams(orderItems.reduce((s, i) => s + (i.estimated_wt || 0), 0))}`
                    : ""}
                </span>
                <span>
                  Items total: <strong className="text-gold">{inr(orderItems.reduce((s, i) => s + (i.amount || 0), 0))}</strong>
                  {(gstIncluded || orderItems.some(i => i.metal === "silver_mpr")) && (
                    <span className="ml-1 text-ok">(GST incl.)</span>
                  )}
                </span>
              </div>
            )}
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
                setPayments={setAdvPayments} boardRate={boardRate} canRemove={true}
                advanceBalance={customer ? (advanceBalance ?? undefined) : undefined}
                partnerAccounts={partnerAccounts} />
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

      {/* Filters */}
      {!isLoading && (orders as any[]).length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/* Status tabs */}
          <div className="flex rounded-lg overflow-hidden border border-line text-xs">
            {(["all", "pending", "ready", "delivered", "cancelled"] as const).map((s) => (
              <button key={s} type="button"
                onClick={() => setFilterStatus(s)}
                className={clsx("px-3 py-1.5 font-medium capitalize transition-colors",
                  filterStatus === s ? "bg-gold text-white" : "bg-white text-ink-dim hover:bg-canvas")}>
                {s === "all" ? `All (${(orders as any[]).length})` : `${s} (${statusCounts[s] || 0})`}
              </button>
            ))}
          </div>
          {/* Month picker */}
          <div className="flex items-center gap-1.5">
            <input type="month" value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
            {filterMonth && (
              <button onClick={() => setFilterMonth("")} className="text-xs text-ink-dim hover:text-err">×</button>
            )}
          </div>
        </div>
      )}

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="space-y-2">
          {!filteredOrders.length && (
            <div className="bg-white rounded-xl border border-line p-10 text-center text-ink-dim shadow-soft">
              {(orders as any[]).length === 0 ? "No orders yet." : "No orders match the selected filters."}
            </div>
          )}
          {filteredOrders.map((o: any) => {
            const isExpanded = expanded === o.id;
            const paidSoFar = isExpanded
              ? expandedPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
              : (Number(o.advance_paid) || 0);
            const effectiveTotal = Number(o.final_total) || Number(o.total) || 0;
            const balance = effectiveTotal - paidSoFar;
            const isAddingPay = addPayOrderId === o.id;
            const isDelivering = deliverOrderId === o.id;

            return (
              <div key={o.id} className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
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
                        <p className="text-xs text-ink-dim">
                          {balance < -0.01 ? (isExpanded && paybackEntry ? "Paid Back" : "Overpaid") : "Balance Due"}
                        </p>
                        <p className={clsx("font-medium",
                          balance > 0.01 ? "text-err" :
                          balance < -0.01 ? (isExpanded && paybackEntry ? "text-ok" : "text-warn") :
                          "text-ok")}>
                          {balance > 0.01 ? inr(balance) :
                           balance < -0.01 ? `${isExpanded && paybackEntry ? "Done" : "Excess"} ${inr(-balance)}` :
                           "Fully paid"}
                        </p>
                      </div>
                    </div>
                    {o.description && (
                      <p className="text-sm text-ink-dim bg-canvas rounded-lg2 px-3 py-2">{o.description}</p>
                    )}

                    {/* Line items — lazy loaded, safe if table not yet migrated */}
                    <OrderItemsView orderId={o.id} />

                    {/* Payment history */}
                    {expandedPayments.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-ink-dim mb-2">Payment History</p>
                        <div className="space-y-1">
                          {expandedPayments.map((p: any) => (
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
                                    {(editingPayment.mode === "old_gold" || editingPayment.mode === "old_silver") ? (
                                      <>
                                        <div>
                                          <label className="text-xs text-ink-dim block mb-1">Weight (g)</label>
                                          <input type="number" step="0.001" value={editingPayment.metal_wt || ""}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => {
                                              const wt = parseFloat(e.target.value) || 0;
                                              const pureRate = boardRate ? (editingPayment.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                                              const amt = pureRate ? Math.round(wt * (editingPayment.metal_purity / 100) * pureRate) : editingPayment.amount;
                                              setEditingPayment({ ...editingPayment, metal_wt: wt, amount: amt });
                                            }}
                                            className="w-24 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" autoFocus />
                                        </div>
                                        <div>
                                          <label className="text-xs text-ink-dim block mb-1">Total (₹)</label>
                                          <input type="number" step="0.01" value={editingPayment.amount || ""}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => {
                                              const amt = parseFloat(e.target.value) || 0;
                                              const pureRate = boardRate ? (editingPayment.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                                              const purity = (pureRate && editingPayment.metal_wt) ? Math.round((amt / (editingPayment.metal_wt * pureRate)) * 1000) / 10 : editingPayment.metal_purity;
                                              setEditingPayment({ ...editingPayment, amount: amt, metal_purity: purity });
                                            }}
                                            className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                                        </div>
                                        <div>
                                          <label className="text-xs text-ink-dim block mb-1">Purity %</label>
                                          <input type="number" step="0.01" value={editingPayment.metal_purity || ""}
                                            onFocus={(e) => e.target.select()}
                                            onChange={(e) => {
                                              const purity = parseFloat(e.target.value) || 91.6;
                                              const pureRate = boardRate ? (editingPayment.mode === "old_gold" ? boardRate.gold_22k / 0.916 : boardRate.silver / 0.925) : 0;
                                              const amt = pureRate ? Math.round(editingPayment.metal_wt * (purity / 100) * pureRate) : editingPayment.amount;
                                              setEditingPayment({ ...editingPayment, metal_purity: purity, amount: amt });
                                            }}
                                            className="w-20 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold" />
                                        </div>
                                      </>
                                    ) : (
                                      <div>
                                        <label className="text-xs text-ink-dim block mb-1">Amount (₹)</label>
                                        <input type="number" step="0.01" value={editingPayment.amount || ""}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => setEditingPayment({ ...editingPayment, amount: parseFloat(e.target.value) || 0 })}
                                          className="w-32 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
                                          autoFocus />
                                      </div>
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

                    {/* Excess payback — when old gold > order total */}
                    {balance < -0.01 && (
                      <div className={`rounded-lg2 px-4 py-3 space-y-2 border ${paybackEntry ? "bg-ok/5 border-ok/30" : "bg-warn/5 border-warn/30"}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            {paybackEntry ? (
                              <>
                                <p className="text-xs font-semibold text-ok">
                                  ✓ {paybackEntry.type === "cash" ? "Cash paid back" : "Kept as customer advance"} — {inr(paybackEntry.amount)}
                                </p>
                                <p className="text-xs text-ink-dim mt-0.5">
                                  Old gold {inr(paidSoFar)} · Order {inr(effectiveTotal)} · Excess {inr(-balance)}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-xs font-semibold text-warn">Old gold value exceeds order total</p>
                                <p className="text-xs text-ink-dim mt-0.5">
                                  Paid {inr(paidSoFar)} · Order {inr(effectiveTotal)} · Excess {inr(-balance)}
                                </p>
                              </>
                            )}
                          </div>
                          {paybackEntry && (
                            <button
                              disabled={clearPayback.isPending}
                              onClick={() => clearPayback.mutate({ orderId: o.id, orderNo: o.order_no })}
                              className="text-xs text-ink-dim underline hover:text-err">
                              {clearPayback.isPending ? "…" : "Fix"}
                            </button>
                          )}
                        </div>
                        {!paybackEntry && (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              disabled={payBackCash.isPending || keepAsAdvance.isPending}
                              onClick={() => payBackCash.mutate({ orderId: o.id, orderNo: o.order_no, amount: -balance })}
                              className="text-xs bg-warn text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50 whitespace-nowrap">
                              {payBackCash.isPending ? "Recording…" : `Pay Back ${inr(-balance)} Cash`}
                            </button>
                            {o.customer_id && (
                              <button
                                disabled={payBackCash.isPending || keepAsAdvance.isPending}
                                onClick={() => keepAsAdvance.mutate({ orderNo: o.order_no, amount: -balance, customerId: o.customer_id })}
                                className="text-xs bg-info/10 text-info border border-info/30 px-3 py-1.5 rounded-lg2 disabled:opacity-50 whitespace-nowrap">
                                {keepAsAdvance.isPending ? "Recording…" : `Keep ${inr(-balance)} as Customer Advance`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-line">
                      {o.status !== "delivered" && o.status !== "cancelled" && (
                        <>
                          {o.status === "pending" && (
                            <button onClick={() => updateStatus.mutate({ id: o.id, status: "ready" })}
                              className="text-sm bg-info/10 text-info border border-info/30 px-4 py-1.5 rounded-lg2 hover:bg-info/20">
                              ✓ Mark Ready
                            </button>
                          )}
                          {!isAddingPay && !isDelivering && editOrderId !== o.id && (
                            <button onClick={() => { setAddPayOrderId(o.id); setAddPayDate(globalDate); setAddPayments([newPayment()]); }}
                              className="text-sm bg-canvas border border-line px-4 py-1.5 rounded-lg2 hover:border-gold">
                              + Add Payment
                            </button>
                          )}
                          {!isDelivering && !isAddingPay && editOrderId !== o.id && (
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
                        </>
                      )}
                      {/* Reactivate cancelled order */}
                      {o.status === "cancelled" && (
                        <button
                          onClick={() => reactivateOrder.mutate({ id: o.id })}
                          disabled={reactivateOrder.isPending}
                          className="text-sm bg-ok/10 text-ok border border-ok/30 px-4 py-1.5 rounded-lg2 hover:bg-ok/20 disabled:opacity-50">
                          ↺ Reactivate
                        </button>
                      )}
                      {/* Edit order always available */}
                      {editOrderId !== o.id && (
                        <button
                          onClick={() => {
                            setEditOrderId(o.id);
                            setAddPayOrderId(null);
                            setDeliverOrderId(null);
                            setEditOrderForm({
                              customer: o.customers ? { id: o.customer_id, name: o.customers.name, phone: o.customers.phone ?? null, address: null, opening_balance: 0, gold_balance_g: 0, silver_balance_g: 0, notes: null, created_at: "" } as Customer : null,
                              order_date: o.order_date,
                              delivery_date: o.delivery_date ?? "",
                              description: o.description ?? "",
                              estimated_wt: Number(o.estimated_wt) || 0,
                              estimated_total: Number(o.total) || 0,
                              gst_included: o.gst_included ?? false,
                            });
                          }}
                          className={clsx("text-sm border px-4 py-1.5 rounded-lg2", o.status === "delivered" || o.status === "cancelled" ? "ml-auto" : "", "border-gold/40 text-gold hover:bg-gold/5")}>
                          ✏ Edit Order
                        </button>
                      )}
                      {/* Delete order — always available, cascading cleanup */}
                      {editOrderId !== o.id && (
                        <button
                          disabled={deleteOrder.isPending}
                          onClick={() => {
                            if (window.confirm(`Permanently delete ${o.order_no}?\n\nThis will remove all payments, ledger entries, and pending old gold intakes. This cannot be undone.`)) {
                              deleteOrder.mutate({ orderId: o.id, orderNo: o.order_no });
                            }
                          }}
                          className="text-sm text-err border border-err/20 px-4 py-1.5 rounded-lg2 hover:bg-err/5 disabled:opacity-50 ml-auto">
                          {deleteOrder.isPending ? "Deleting…" : "Delete Order"}
                        </button>
                      )}
                    </div>

                    {/* Edit Order inline form */}
                    {editOrderId === o.id && (
                      <div className="border border-gold/30 rounded-xl p-4 bg-gold/5 space-y-4">
                        <h3 className="text-sm font-semibold">Edit Order</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="col-span-2 sm:col-span-4">
                            <label className="block text-xs text-ink-dim mb-1">{t("customers")}</label>
                            <CustomerPicker value={editOrderForm.customer} onChange={(c) => setEditOrderForm({ ...editOrderForm, customer: c })} />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Order Date</label>
                            <input type="date" value={editOrderForm.order_date}
                              onChange={(e) => setEditOrderForm({ ...editOrderForm, order_date: e.target.value })}
                              className={inp} />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Delivery Date</label>
                            <input type="date" value={editOrderForm.delivery_date}
                              onChange={(e) => setEditOrderForm({ ...editOrderForm, delivery_date: e.target.value })}
                              className={inp} />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Est. Weight (g)</label>
                            <input type="number" step="0.001" value={editOrderForm.estimated_wt || ""}
                              onFocus={(e) => e.target.select()} placeholder="0.000"
                              onChange={(e) => setEditOrderForm({ ...editOrderForm, estimated_wt: parseFloat(e.target.value) || 0 })}
                              className={inp} />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-dim mb-1">Est. Total (₹) <span className="text-ink-dim/60 font-normal">{editOrderForm.gst_included ? "incl. GST" : "excl. GST"}</span></label>
                            <input type="number" step="0.01" value={editOrderForm.estimated_total || ""}
                              onFocus={(e) => e.target.select()} placeholder="0"
                              onChange={(e) => setEditOrderForm({ ...editOrderForm, estimated_total: parseFloat(e.target.value) || 0 })}
                              className={inp} />
                          </div>
                          <div className="flex flex-col justify-end">
                            <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                              <input type="checkbox" checked={editOrderForm.gst_included}
                                onChange={(e) => setEditOrderForm({ ...editOrderForm, gst_included: e.target.checked })}
                                className="accent-gold w-4 h-4" />
                              <span>GST 3% included</span>
                            </label>
                            {editOrderForm.gst_included && editOrderForm.estimated_total > 0 && (
                              <p className="text-xs text-ink-dim">
                                GST: <strong className="text-ok">{inr(editOrderForm.estimated_total * 3 / 103)}</strong> · base: {inr(editOrderForm.estimated_total * 100 / 103)}
                              </p>
                            )}
                          </div>
                          <div className="col-span-2 sm:col-span-4">
                            <label className="block text-xs text-ink-dim mb-1">Description / Design</label>
                            <textarea value={editOrderForm.description}
                              onChange={(e) => setEditOrderForm({ ...editOrderForm, description: e.target.value })}
                              rows={2} className={inp + " resize-none"} placeholder="What the customer wants made…" />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button disabled={updateOrder.isPending}
                            onClick={() => updateOrder.mutate({ id: o.id })}
                            className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                            {updateOrder.isPending ? "Saving…" : "Save Changes"}
                          </button>
                          <button onClick={() => setEditOrderId(null)}
                            className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
                        </div>
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
                              canRemove={addPayments.length > 1}
                              advanceBalance={o.customer_id ? (advanceBalance ?? undefined) : undefined}
                              partnerAccounts={partnerAccounts} />
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
                              canRemove={finalPayments.length > 0}
                              partnerAccounts={partnerAccounts} />
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
