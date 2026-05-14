"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import CustomerPicker from "@/modules/customers/customer-picker";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, shortDate } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import { clsx } from "clsx";
import { fyForDate, billNoFor } from "@/lib/fy";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warn/10 text-warn",
  ready: "bg-info/10 text-info",
  delivered: "bg-ok-bg text-ok",
  cancelled: "bg-err-bg text-err",
};

function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("orders")
        .select("*, customers(name)")
        .order("order_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSaveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const client = supabase();
      const fy = fyForDate(data.order_date as string);
      const { data: n } = await client.rpc("next_fy_serial", { _fy: fy, _series: "O" });
      const orderNo = billNoFor("O", fy, n as number);
      const { data: row, error } = await client.from("orders").insert({ ...data, order_no: orderNo }).select().single();
      if (error) throw error;
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export default function OrdersPage() {
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const { data: orders, isLoading } = useOrders();
  const save = useSaveOrder();
  const [showForm, setShowForm] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ order_date: globalDate, delivery_date: "", description: "", estimated_wt: 0, advance_paid: 0, total: 0, notes: "" });

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await save.mutateAsync({ ...form, customer_id: customer?.id ?? null, status: "pending" });
    setShowForm(false);
    setCustomer(null);
    setForm({ order_date: globalDate, delivery_date: "", description: "", estimated_wt: 0, advance_paid: 0, total: 0, notes: "" });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">{t("orders")}</h1>
        <button onClick={() => setShowForm(true)} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2">
          + {t("new_order")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">{t("customers")}</label>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </div>
            {[
              { label: "Order Date", key: "order_date", type: "date" },
              { label: "Delivery Date", key: "delivery_date", type: "date" },
              { label: "Est. Weight (g)", key: "estimated_wt", type: "number", step: "0.001" },
              { label: "Advance Paid", key: "advance_paid", type: "number", step: "0.01" },
              { label: "Total", key: "total", type: "number", step: "0.01" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-ink-dim mb-1">{f.label}</label>
                <input type={f.type} step={f.step} value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-dim mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={save.isPending} className="bg-gold text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
          </div>
        </form>
      )}

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Order No</th>
              <th className="text-left px-3 py-2.5">{t("date")}</th>
              <th className="text-left px-3 py-2.5 hidden sm:table-cell">Customer</th>
              <th className="text-right px-3 py-2.5">{t("total")}</th>
              <th className="text-left px-3 py-2.5">{t("status")}</th>
            </tr></thead>
            <tbody>
              {(orders as any[])?.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-mono text-info">{o.order_no}</td>
                  <td className="px-3 py-2.5 text-ink-dim">{shortDate(o.order_date)}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-ink-mid">{o.customers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(o.total)}</td>
                  <td className="px-3 py-2.5">
                    <span className={clsx("text-xs px-2 py-0.5 rounded-full", STATUS_COLORS[o.status] ?? "bg-canvas text-ink-dim")}>{o.status}</span>
                  </td>
                </tr>
              ))}
              {!orders?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-dim">{t("no_data")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
