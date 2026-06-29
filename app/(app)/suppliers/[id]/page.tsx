"use client";

import { Fragment, use, useState } from "react";
import Link from "next/link";
import { useSupplier360, useSaveSupplierPurchase, useUpdateSupplierPurchase, useDeleteSupplierPurchase, useSaveSupplierPayment, useUpdateSupplierPayment, useDeleteSupplierPayment, useConfirmSuspenseVa, useConfirmSuspenseBatch, useUpsertSupplier } from "@/modules/suppliers/api";
import { useGlobalDate } from "@/stores/global-date";
import { useT } from "@/i18n";
import { inr, grams, shortDate } from "@/lib/format";

const TABS = ["purchases", "payments", "suspense"] as const;
type Tab = (typeof TABS)[number];

const PAY_MODES = ["cash", "upi", "bank", "old_gold", "old_silver"];
const METALS = ["gold_22k", "gold_24k", "gold_18k", "silver", "silver_pure"];

const inp = "w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

export default function Supplier360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useT();
  const globalDate = useGlobalDate((s) => s.date);
  const [tab, setTab] = useState<Tab>("purchases");
  const { data: view, isLoading } = useSupplier360(id);
  const savePurchase    = useSaveSupplierPurchase();
  const updatePurchase  = useUpdateSupplierPurchase();
  const deletePurchase  = useDeleteSupplierPurchase();
  const saveReturn      = useSaveSupplierPurchase();
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<string | null>(null);

  const blankEditPurchase = () => ({ purchase_date: "", bill_no: "", description: "", metal: "gold_22k", is_metal_balance: false, gross_wt: 0, tag_wt: 0, stone_wt: 0, stone_rate: 0, stone_to_cash: false, purity_pct: 91.6, rate: 0, charges_g: 0, charges_per_piece: 0, piece_count: 0, charges_to_cash: false, mc_rs: 0, amount: 0, notes: "" });
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [editPurchaseForm, setEditPurchaseForm] = useState(blankEditPurchase());

  function openEditPurchase(p: any) {
    setEditingPurchaseId(p.id);
    setEditPurchaseForm({
      purchase_date: p.purchase_date ?? "",
      bill_no: p.bill_no ?? "",
      description: p.description ?? "",
      metal: p.metal ?? "gold_22k",
      gross_wt: Number(p.gross_wt) || 0,
      is_metal_balance: Boolean(p.is_metal_balance),
      tag_wt: Number(p.tag_wt) || 0,
      stone_wt: Number(p.stone_wt) || 0,
      stone_rate: Number(p.stone_rate) || 0,
      stone_to_cash: Boolean(p.stone_to_cash),
      purity_pct: Number(p.purity_pct) || 91.6,
      rate: Number(p.rate) || 0,
      charges_g: Number(p.charges_g) || 0,
      charges_per_piece: Number(p.charges_per_piece) || 0,
      piece_count: Number(p.piece_count) || 0,
      charges_to_cash: Boolean(p.charges_to_cash),
      mc_rs: (() => {
        if (!p.is_metal_balance) return 0;
        const stoneRs = p.stone_to_cash && p.stone_wt > 0 && p.stone_rate > 0 ? p.stone_wt * p.stone_rate : 0;
        const chgRs   = p.charges_to_cash && p.charges_per_piece > 0 && p.piece_count > 0 ? p.charges_per_piece * p.piece_count : 0;
        return Math.max(0, (Number(p.amount) || 0) - stoneRs - chgRs);
      })(),
      amount: Number(p.amount) || 0,
      notes: p.notes ?? "",
    });
  }

  function updateEditPurchaseForm(patch: Partial<typeof editPurchaseForm>) {
    setEditPurchaseForm(prev => {
      const next           = { ...prev, ...patch };
      const net_wt         = next.gross_wt - (next.tag_wt || 0) - (next.stone_wt || 0);
      const stone_val_rs   = next.stone_wt > 0 && next.stone_rate > 0 ? next.stone_wt * next.stone_rate : 0;
      const charges_val_rs = next.charges_per_piece > 0 && next.piece_count > 0 ? next.charges_per_piece * next.piece_count : 0;
      const stone_gold_g   = !next.stone_to_cash && next.rate > 0 ? stone_val_rs / next.rate : 0;
      const charges_rs_g   = !next.charges_to_cash && next.rate > 0 ? charges_val_rs / next.rate : 0;
      const base_pure      = net_wt * next.purity_pct / 100;
      const final_pure     = base_pure + stone_gold_g + charges_rs_g + next.charges_g;
      const cash_extras    = (next.stone_to_cash ? stone_val_rs : 0) + (next.charges_to_cash ? charges_val_rs : 0);
      const amount = next.is_metal_balance
        ? parseFloat((cash_extras + (next.mc_rs || 0)).toFixed(2))
        : (next.rate > 0 ? parseFloat((final_pure * next.rate + cash_extras).toFixed(2)) : next.amount);
      return { ...next, amount };
    });
  }

  async function handleEditPurchaseSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPurchaseId) return;
    const ep             = editPurchaseForm;
    const net_wt         = parseFloat((ep.gross_wt - (ep.tag_wt || 0) - (ep.stone_wt || 0)).toFixed(4));
    const stone_val_rs   = ep.stone_wt > 0 && ep.stone_rate > 0 ? ep.stone_wt * ep.stone_rate : 0;
    const charges_val_rs = ep.charges_per_piece > 0 && ep.piece_count > 0 ? ep.charges_per_piece * ep.piece_count : 0;
    const stone_gold_g   = !ep.stone_to_cash && ep.rate > 0 ? parseFloat((stone_val_rs / ep.rate).toFixed(4)) : 0;
    const charges_rs_g   = !ep.charges_to_cash && ep.rate > 0 ? parseFloat((charges_val_rs / ep.rate).toFixed(4)) : 0;
    const cash_extras    = (ep.stone_to_cash ? stone_val_rs : 0) + (ep.charges_to_cash ? charges_val_rs : 0);
    const base_pure      = parseFloat((net_wt * ep.purity_pct / 100).toFixed(4));
    const pure_wt        = roundPure(base_pure + stone_gold_g + charges_rs_g + ep.charges_g);
    const amount         = ep.is_metal_balance ? parseFloat((cash_extras + (ep.mc_rs || 0)).toFixed(2)) : ep.amount;
    await updatePurchase.mutateAsync({ id: editingPurchaseId, supplierId: id, data: { ...ep, pure_wt, amount } });
    setEditingPurchaseId(null);
  }
  const savePayment = useSaveSupplierPayment();
  const updatePayment = useUpdateSupplierPayment();
  const deletePayment = useDeleteSupplierPayment();
  const confirmVa = useConfirmSuspenseVa();
  const confirmBatch = useConfirmSuspenseBatch();
  const upsertSupplier = useUpsertSupplier();

  // Multi-select batch settlement
  const [selectedSuspense, setSelectedSuspense] = useState<Set<string>>(new Set());
  const [batchForm, setBatchForm] = useState({ total_cash_amt: 0, cash_paid_now: 0 });

  const [showEditOpening, setShowEditOpening] = useState(false);
  const [editOpening, setEditOpening] = useState({ opening_balance: 0, gold_opening_g: 0, silver_opening_g: 0, roundoff_digits: 3, roundoff_method: "round" });

  const blankPurchaseItem = () => ({ description: "", is_metal_balance: false, gross_wt: 0, tag_wt: 0, stone_wt: 0, stone_rate: 0, stone_to_cash: false, purity_pct: 91.6, rate: 0, charges_g: 0, charges_per_piece: 0, piece_count: 0, charges_to_cash: false, mc_rs: 0, amount: 0, notes: "" });
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ purchase_date: globalDate, bill_no: "", metal: "gold_22k" });
  const [purchaseItems, setPurchaseItems] = useState([blankPurchaseItem()]);

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnForm, setReturnForm] = useState({ return_date: globalDate, description: "", metal: "gold_22k", gross_wt: 0, purity_pct: 91.6, pure_wt: 0, notes: "" });
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [adjForm, setAdjForm] = useState({ adj_date: globalDate, description: "", metal: "gold_22k", pure_wt: 0, notes: "" });
  const saveAdjustment = useSaveSupplierPurchase();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, cut_rate: 0, notes: "" });

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, cut_rate: 0, notes: "" });
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  // Per-purchase payment panel
  const [expandedPayPurchaseId, setExpandedPayPurchaseId] = useState<string | null>(null);
  const blankPartPay = () => ({ pay_date: globalDate, mode: "cash" as string, amount: 0, notes: "" });
  const [partPayForm, setPartPayForm] = useState(blankPartPay());
  const [deletingPartPayId, setDeletingPartPayId] = useState<string | null>(null);

  function openEditPayment(p: any) {
    setEditingPaymentId(p.id);
    setEditPayForm({ pay_date: p.pay_date, mode: p.mode, amount: Number(p.amount), metal_wt: Number(p.metal_wt) || 0, metal_purity: Number(p.metal_purity) || 91.6, cut_rate: Number(p.cut_rate) || 0, notes: p.notes ?? "" });
    setDeletingPaymentId(null);
  }

  async function handleEditPaymentSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPaymentId) return;
    await updatePayment.mutateAsync({ id: editingPaymentId, supplierId: id, data: editPayForm });
    setEditingPaymentId(null);
  }

  // Suspense VA% + cash settlement editing
  const [editingVa, setEditingVa] = useState<{
    id: string; gross_wt: number; purity_pct: number; va_pct: number;
    cash_amt: number; cash_paid_now: number; bill_no: string;
  } | null>(null);

  // Cash balance — opening + cash-mode purchases + cut_rate conversions − actual cash/bank paid
  const openingCash = Number(view?.supplier?.opening_balance) || 0;
  const totalPurchased = view?.purchases.reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0;
  const totalCashPaid = view?.payments.filter((p: any) => ["cash", "bank", "upi"].includes(p.mode) && !(Number(p.metal_wt) > 0)).reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0;
  const totalCutRateValue = view?.payments.filter((p: any) => p.mode === "cut_rate").reduce((s: number, p: any) => s + (p.amount ?? 0), 0) ?? 0;
  const cashBalance = openingCash + totalPurchased + totalCutRateValue - totalCashPaid;

  // Metal balance — opening grams + confirmed suspense pure wt minus metal sent
  const goldOpeningG = Number(view?.supplier?.gold_opening_g) || 0;
  const silverOpeningG = Number(view?.supplier?.silver_opening_g) || 0;
  const metalPurchasesG = view?.purchases?.filter((p: any) => p.is_metal_balance).reduce((acc: number, p: any) => {
    if (p.is_return) return acc - (Number(p.pure_wt) || 0);
    return acc + (Number(p.pure_wt) || 0); // adjustments store signed pure_wt directly
  }, 0) ?? 0;
  const metalOwedG = goldOpeningG + silverOpeningG + metalPurchasesG + (view?.suspense
    .filter((s: any) => s.supplier_confirmed)
    .reduce((acc: number, s: any) => acc + (Number(s.supplier_pure_wt) || 0), 0) ?? 0);
  const metalPhysicalG = view?.dispatches?.reduce((acc: number, d: any) => acc + (Number(d.weight_g) || 0) * (Number(d.purity_pct) || 100) / 100, 0) ?? 0;
  const metalCashG = view?.payments?.filter((p: any) => (p.metal_wt ?? 0) > 0).reduce((acc: number, p: any) => acc + (Number(p.metal_wt) || 0), 0) ?? 0;
  const metalCutG = view?.payments?.filter((p: any) => p.mode === "cut_rate").reduce((acc: number, p: any) => acc + (Number(p.metal_wt) || 0), 0) ?? 0;
  const metalSentG = metalPhysicalG + metalCashG;
  const metalBalanceG = metalOwedG - metalSentG;

  const roundDigits = Number(view?.supplier?.roundoff_digits) || 3;
  const roundMethod = (view?.supplier?.roundoff_method as string) || "round";
  function roundPure(v: number): number {
    const f = Math.pow(10, roundDigits);
    if (roundMethod === "floor") return Math.floor(v * f) / f;
    if (roundMethod === "ceil") return Math.ceil(v * f) / f;
    return Math.round(v * f) / f;
  }

  // Per-purchase payment totals
  const paidByPurchaseId = new Map<string, number>();
  for (const pay of (view?.payments ?? [])) {
    if ((pay as any).purchase_id) {
      const prev = paidByPurchaseId.get((pay as any).purchase_id) ?? 0;
      paidByPurchaseId.set((pay as any).purchase_id, prev + Number((pay as any).amount));
    }
  }

  // Cash ledger — chronological statement with running balance
  const cashLedger = (() => {
    const rows: { id: string; date: string; type: string; description: string; delta: number }[] = [];
    (view?.purchases ?? []).filter((p: any) => (p.amount ?? 0) > 0).forEach((p: any) => {
      rows.push({ id: `p-${p.id}`, date: p.purchase_date ?? "", type: "Purchase", description: p.description || p.bill_no || "—", delta: Number(p.amount) });
    });
    (view?.payments ?? []).filter((p: any) => p.mode === "cut_rate").forEach((p: any) => {
      rows.push({ id: `cr-${p.id}`, date: p.pay_date ?? "", type: "Cut Rate", description: p.cut_rate ? `${grams(p.metal_wt)} @ ₹${Number(p.cut_rate).toLocaleString()}/g` : "—", delta: Number(p.amount) });
    });
    (view?.payments ?? []).filter((p: any) => ["cash", "bank", "upi"].includes(p.mode)).forEach((p: any) => {
      const modeLabel = p.mode === "upi" ? "UPI" : p.mode.charAt(0).toUpperCase() + p.mode.slice(1);
      rows.push({ id: `pay-${p.id}`, date: p.pay_date ?? "", type: modeLabel, description: p.notes || "—", delta: -(Number(p.amount) || 0) });
    });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let balance = openingCash;
    return rows.map(row => { balance += row.delta; return { ...row, balance }; });
  })();

  // Metal ledger — chronological statement with running balance
  const metalLedger = (() => {
    const rows: { id: string; date: string; type: string; description: string; delta: number }[] = [];
    (view?.purchases ?? []).filter((p: any) => p.is_metal_balance).forEach((p: any) => {
      const delta = p.is_return ? -(Number(p.pure_wt) || 0) : (Number(p.pure_wt) || 0);
      const type  = p.is_return ? "Return" : p.is_adjustment ? "Adjustment" : "Purchase";
      rows.push({ id: `p-${p.id}`, date: p.purchase_date ?? "", type, description: p.description || p.bill_no || "—", delta });
    });
    (view?.dispatches ?? []).forEach((d: any) => {
      const pureWt = (Number(d.weight_g) || 0) * (Number(d.purity_pct) || 100) / 100;
      rows.push({ id: `d-${d.id}`, date: d.dispatch_date ?? "", type: "Dispatch", description: d.notes || `${d.metal} ${Number(d.purity_pct) || 100}%`, delta: -pureWt });
    });
    (view?.payments ?? []).filter((p: any) => p.mode === "cut_rate" && (p.metal_wt ?? 0) > 0).forEach((p: any) => {
      rows.push({ id: `cr-${p.id}`, date: p.pay_date ?? "", type: "Cut Rate", description: p.cut_rate ? `@ ₹${Number(p.cut_rate).toLocaleString()}/g` : "—", delta: -(Number(p.metal_wt) || 0) });
    });
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let balance = goldOpeningG + silverOpeningG;
    return rows.map(row => { balance += row.delta; return { ...row, balance }; });
  })();

  async function handlePurchaseSave(e: React.FormEvent) {
    e.preventDefault();
    for (const item of purchaseItems) {
      if (!item.gross_wt) continue;
      const net_wt        = parseFloat((item.gross_wt - (item.tag_wt || 0) - item.stone_wt).toFixed(4));
      const stone_val_rs  = item.stone_wt > 0 && item.stone_rate > 0 ? item.stone_wt * item.stone_rate : 0;
      const chg_val_rs    = item.charges_per_piece > 0 && item.piece_count > 0 ? item.charges_per_piece * item.piece_count : 0;
      const stone_gold_g  = !item.stone_to_cash && item.rate > 0 ? parseFloat((stone_val_rs / item.rate).toFixed(4)) : 0;
      const charges_rs_g  = !item.charges_to_cash && item.rate > 0 ? parseFloat((chg_val_rs / item.rate).toFixed(4)) : 0;
      const cash_extras   = (item.stone_to_cash ? stone_val_rs : 0) + (item.charges_to_cash ? chg_val_rs : 0);
      const base_pure     = parseFloat((net_wt * item.purity_pct / 100).toFixed(4));
      const pure_wt       = roundPure(base_pure + stone_gold_g + charges_rs_g + item.charges_g);
      const amount        = item.is_metal_balance
        ? parseFloat((cash_extras + (item.mc_rs || 0)).toFixed(2))
        : item.amount;
      await savePurchase.mutateAsync({
        purchase_date: purchaseForm.purchase_date,
        bill_no: purchaseForm.bill_no,
        metal: purchaseForm.metal,
        supplier_id: id,
        description: item.description,
        is_metal_balance: item.is_metal_balance,
        gross_wt: item.gross_wt,
        tag_wt: item.tag_wt,
        stone_wt: item.stone_wt,
        stone_rate: item.stone_rate,
        stone_to_cash: item.stone_to_cash,
        purity_pct: item.purity_pct,
        rate: item.rate,
        charges_g: item.charges_g,
        charges_per_piece: item.charges_per_piece,
        piece_count: item.piece_count,
        charges_to_cash: item.charges_to_cash,
        amount,
        pure_wt,
        notes: item.notes,
      });
    }
    setPurchaseForm({ purchase_date: globalDate, bill_no: "", metal: "gold_22k" });
    setPurchaseItems([blankPurchaseItem()]);
    setShowPurchaseForm(false);
  }

  function updatePurchaseItem(idx: number, patch: Record<string, unknown>) {
    setPurchaseItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const next           = { ...item, ...patch };
      const net            = next.gross_wt - (next.tag_wt || 0) - next.stone_wt;
      const stone_val_rs   = next.stone_wt > 0 && next.stone_rate > 0 ? next.stone_wt * next.stone_rate : 0;
      const chg_val_rs     = next.charges_per_piece > 0 && next.piece_count > 0 ? next.charges_per_piece * next.piece_count : 0;
      const stone_gold_g   = !next.stone_to_cash && next.rate > 0 ? stone_val_rs / next.rate : 0;
      const charges_rs_g   = !next.charges_to_cash && next.rate > 0 ? chg_val_rs / next.rate : 0;
      const pure           = net * next.purity_pct / 100 + stone_gold_g + charges_rs_g + next.charges_g;
      const cash_extras    = (next.stone_to_cash ? stone_val_rs : 0) + (next.charges_to_cash ? chg_val_rs : 0);
      if (next.is_metal_balance) {
        next.amount = parseFloat((cash_extras + (next.mc_rs || 0)).toFixed(2));
      } else if (next.rate > 0) {
        next.amount = parseFloat((pure * next.rate + cash_extras).toFixed(2));
      }
      return next;
    }));
  }

  async function handlePaymentSave(e: React.FormEvent) {
    e.preventDefault();
    let data: Record<string, unknown> = { ...paymentForm, supplier_id: id };
    if (paymentForm.mode === "cut_rate" && paymentForm.cut_rate > 0 && paymentForm.amount > 0) {
      data = { ...data, metal_wt: parseFloat((paymentForm.amount / paymentForm.cut_rate).toFixed(3)) };
    }
    await savePayment.mutateAsync(data);
    setPaymentForm({ pay_date: globalDate, mode: "cash", amount: 0, metal_wt: 0, metal_purity: 91.6, cut_rate: 0, notes: "" });
    setShowPaymentForm(false);
  }

  async function handleConfirmVa(e: React.FormEvent) {
    e.preventDefault();
    if (!editingVa) return;
    await confirmVa.mutateAsync({
      itemId: editingVa.id, supplierId: id, va_pct: editingVa.va_pct,
      cash_amt: editingVa.cash_amt, cash_paid_now: editingVa.cash_paid_now,
      pay_date: globalDate, bill_no: editingVa.bill_no,
    });
    setEditingVa(null);
  }

  const vaPreview = editingVa
    ? editingVa.gross_wt * editingVa.va_pct / 100
    : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/suppliers" className="text-gold hover:underline text-sm">← {t("suppliers")}</Link>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-line p-5 shadow-soft space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-ink-dim">{t("cash_balance")}</p>
            <p className={`text-xl font-bold ${cashBalance > 0 ? "text-err" : "text-ok"}`}>{inr(cashBalance)}</p>
            <p className="text-xs text-ink-dim/60">
              Opening {inr(openingCash)} + Purchased {inr(totalPurchased)}{totalCutRateValue > 0 ? ` + Cut ${inr(totalCutRateValue)}` : ""} − Paid {inr(totalCashPaid)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-dim">Total Purchased</p>
            {metalPurchasesG > 0 ? (
              <>
                <p className="text-xl font-bold font-mono text-gold">{grams(metalSentG)}</p>
                <p className="text-xs text-ink-dim/60">settled · {grams(metalPurchasesG)} received</p>
              </>
            ) : (
              <p className="text-xl font-bold text-ink">{inr(totalPurchased)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-ink-dim">Metal Balance</p>
            <p className={`text-xl font-bold font-mono ${metalBalanceG > 0 ? "text-err" : metalBalanceG < 0 ? "text-ok" : "text-ink"}`}>
              {grams(Math.abs(metalBalanceG))}
              <span className="ml-1 text-xs font-normal">{metalBalanceG > 0 ? "owed" : metalBalanceG < 0 ? "over-sent" : ""}</span>
            </p>
            <p className="text-xs text-ink-dim/60 mt-0.5">
              Received {grams(metalOwedG)} − Settled {grams(metalSentG)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-dim">Suspense Items</p>
            <p className="text-xl font-bold text-warn">{view?.suspense.length ?? 0}</p>
          </div>
        </div>

        {/* Edit opening balance */}
        {!showEditOpening ? (
          <button
            onClick={() => {
              setEditOpening({ opening_balance: openingCash, gold_opening_g: goldOpeningG, silver_opening_g: silverOpeningG, roundoff_digits: roundDigits, roundoff_method: roundMethod });
              setShowEditOpening(true);
            }}
            className="text-xs text-gold hover:underline"
          >
            ✏ Edit Opening Balances
          </button>
        ) : (
          <div className="border border-gold/30 rounded-xl p-4 bg-gold/5 space-y-3">
            <h3 className="text-sm font-semibold">Edit Opening Balances</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-ink-dim mb-1">Opening Balance (₹)</label>
                <input type="number" step="0.01" value={editOpening.opening_balance || ""}
                  onFocus={(e) => e.target.select()} placeholder="0"
                  onChange={(e) => setEditOpening({ ...editOpening, opening_balance: parseFloat(e.target.value) || 0 })}
                  className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Gold Opening (g)</label>
                <input type="number" step="0.001" value={editOpening.gold_opening_g || ""}
                  onFocus={(e) => e.target.select()} placeholder="0.000"
                  onChange={(e) => setEditOpening({ ...editOpening, gold_opening_g: parseFloat(e.target.value) || 0 })}
                  className={inp} />
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Silver Opening (g)</label>
                <input type="number" step="0.001" value={editOpening.silver_opening_g || ""}
                  onFocus={(e) => e.target.select()} placeholder="0.000"
                  onChange={(e) => setEditOpening({ ...editOpening, silver_opening_g: parseFloat(e.target.value) || 0 })}
                  className={inp} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-ink-dim mb-1">Pure Wt Decimal Digits</label>
                <div className="flex gap-1">
                  {[1, 2, 3].map((d) => (
                    <button key={d} type="button"
                      onClick={() => setEditOpening({ ...editOpening, roundoff_digits: d })}
                      className={`text-xs px-3 py-1 rounded border transition-colors ${editOpening.roundoff_digits === d ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-ink-dim mb-1">Rounding Method</label>
                <div className="flex gap-1">
                  {[["round", "Round"], ["floor", "Floor ↓"], ["ceil", "Ceil ↑"]] .map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setEditOpening({ ...editOpening, roundoff_method: val })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${editOpening.roundoff_method === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={upsertSupplier.isPending}
                onClick={async () => {
                  await upsertSupplier.mutateAsync({ id, ...editOpening });
                  setShowEditOpening(false);
                }}
                className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50"
              >
                {upsertSupplier.isPending ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setShowEditOpening(false)}
                className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line gap-1">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${tab === tb ? "border-gold text-gold" : "border-transparent text-ink-dim hover:text-ink"}`}>
            {tb}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-ink-dim text-sm">{t("loading")}</p>}

      {/* Purchases */}
      {tab === "purchases" && !isLoading && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <button onClick={() => { setShowPurchaseForm(!showPurchaseForm); setShowReturnForm(false); setShowAdjForm(false); }} className="text-xs text-gold hover:underline">+ Add Purchase</button>
            <button onClick={() => { setShowReturnForm(!showReturnForm); setShowPurchaseForm(false); setShowAdjForm(false); }} className="text-xs text-ok hover:underline">↩ Return Item</button>
            <button onClick={() => { setShowAdjForm(!showAdjForm); setShowPurchaseForm(false); setShowReturnForm(false); }} className="text-xs text-info hover:underline">± Metal Adjustment</button>
          </div>

          {showReturnForm && (
            <div className="bg-ok/5 border border-ok/30 rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="text-sm font-semibold text-ok">Return Item to Supplier</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={returnForm.return_date}
                    onChange={(e) => setReturnForm({ ...returnForm, return_date: e.target.value })}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={returnForm.metal}
                    onChange={(e) => setReturnForm({ ...returnForm, metal: e.target.value })}
                    className={inp}>
                    <option value="gold_22k">Gold 22K</option>
                    <option value="gold_24k">Gold 24K</option>
                    <option value="gold_18k">Gold 18K</option>
                    <option value="silver">Silver</option>
                    <option value="silver_pure">Silver Pure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Description</label>
                  <input value={returnForm.description}
                    onChange={(e) => setReturnForm({ ...returnForm, description: e.target.value })}
                    className={inp} placeholder="Item description" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Gross Wt (g) *</label>
                  <input type="number" step="0.001" value={returnForm.gross_wt || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const gross = parseFloat(e.target.value) || 0;
                      setReturnForm({ ...returnForm, gross_wt: gross, pure_wt: parseFloat((gross * returnForm.purity_pct / 100).toFixed(3)) });
                    }}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Touch / Purity %</label>
                  <div className="flex gap-1 mb-1">
                    {[["22K", 91.6], ["18K", 75.0], ["24K", 99.9]].map(([label, val]) => (
                      <button key={label as string} type="button"
                        onClick={() => {
                          const pct = val as number;
                          setReturnForm({ ...returnForm, purity_pct: pct, pure_wt: parseFloat((returnForm.gross_wt * pct / 100).toFixed(3)) });
                        }}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${returnForm.purity_pct === val ? "bg-gold text-white border-gold" : "border-line text-ink-dim hover:border-gold"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <input type="number" step="0.01" value={returnForm.purity_pct || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value) || 0;
                      setReturnForm({ ...returnForm, purity_pct: pct, pure_wt: parseFloat((returnForm.gross_wt * pct / 100).toFixed(3)) });
                    }}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Pure Wt (g)</label>
                  <input type="number" step="0.001" value={returnForm.pure_wt || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setReturnForm({ ...returnForm, pure_wt: parseFloat(e.target.value) || 0 })}
                    className={`${inp} bg-canvas`} />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={returnForm.notes}
                    onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                    className={inp} placeholder="Optional" />
                </div>
              </div>
              {returnForm.pure_wt > 0 && (
                <p className="text-xs text-ok font-medium">
                  This will reduce metal balance by <span className="font-mono">{grams(returnForm.pure_wt)}</span> pure wt
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={!returnForm.gross_wt || saveReturn.isPending}
                  onClick={async () => {
                    await saveReturn.mutateAsync({
                      supplier_id: id,
                      purchase_date: returnForm.return_date,
                      description: returnForm.description || "Item return",
                      metal: returnForm.metal,
                      is_metal_balance: true,
                      is_return: true,
                      gross_wt: returnForm.gross_wt,
                      purity_pct: returnForm.purity_pct,
                      pure_wt: returnForm.pure_wt,
                      amount: 0,
                      notes: returnForm.notes || null,
                    });
                    setShowReturnForm(false);
                    setReturnForm({ return_date: globalDate, description: "", metal: "gold_22k", gross_wt: 0, purity_pct: 91.6, pure_wt: 0, notes: "" });
                  }}
                  className="bg-ok text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                  {saveReturn.isPending ? "Saving…" : "Save Return"}
                </button>
                <button onClick={() => setShowReturnForm(false)}
                  className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
              {saveReturn.isError && <p className="text-xs text-err">Save failed — run migration 065 in Supabase SQL Editor first.</p>}
            </div>
          )}

          {showAdjForm && (
            <div className="bg-info/5 border border-info/30 rounded-xl p-4 shadow-soft space-y-3">
              <h3 className="text-sm font-semibold text-info">Metal Balance Adjustment</h3>
              <p className="text-xs text-ink-dim">Use this to correct touch / weight errors. Positive = supplier adds grams to your balance. Negative = grams deducted.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Date</label>
                  <input type="date" value={adjForm.adj_date}
                    onChange={(e) => setAdjForm({ ...adjForm, adj_date: e.target.value })}
                    className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Metal</label>
                  <select value={adjForm.metal}
                    onChange={(e) => setAdjForm({ ...adjForm, metal: e.target.value })}
                    className={inp}>
                    <option value="gold_22k">Gold 22K</option>
                    <option value="gold_24k">Gold 24K</option>
                    <option value="gold_18k">Gold 18K</option>
                    <option value="silver">Silver</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Description</label>
                  <input value={adjForm.description}
                    onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })}
                    className={inp} placeholder="e.g. Touch correction" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Adjustment (g) — use − for deduction</label>
                  <div className="flex gap-1 mb-1">
                    <button type="button"
                      onClick={() => setAdjForm({ ...adjForm, pure_wt: Math.abs(adjForm.pure_wt) })}
                      className={`text-xs px-3 py-0.5 rounded border transition-colors ${adjForm.pure_wt >= 0 ? "bg-ok text-white border-ok" : "border-line text-ink-dim hover:border-ok"}`}>
                      + Add
                    </button>
                    <button type="button"
                      onClick={() => setAdjForm({ ...adjForm, pure_wt: -Math.abs(adjForm.pure_wt) })}
                      className={`text-xs px-3 py-0.5 rounded border transition-colors ${adjForm.pure_wt < 0 ? "bg-err text-white border-err" : "border-line text-ink-dim hover:border-err"}`}>
                      − Deduct
                    </button>
                  </div>
                  <input type="number" step="0.001" value={Math.abs(adjForm.pure_wt) || ""}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const abs = parseFloat(e.target.value) || 0;
                      setAdjForm({ ...adjForm, pure_wt: adjForm.pure_wt < 0 ? -abs : abs });
                    }}
                    className={inp} placeholder="0.000" />
                </div>
                <div>
                  <label className="block text-xs text-ink-dim mb-1">Notes</label>
                  <input value={adjForm.notes}
                    onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
                    className={inp} placeholder="Optional" />
                </div>
              </div>
              {adjForm.pure_wt !== 0 && (
                <p className={`text-xs font-medium ${adjForm.pure_wt > 0 ? "text-ok" : "text-err"}`}>
                  Metal balance will {adjForm.pure_wt > 0 ? "increase" : "decrease"} by <span className="font-mono">{grams(Math.abs(adjForm.pure_wt))}</span>
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={adjForm.pure_wt === 0 || saveAdjustment.isPending}
                  onClick={async () => {
                    await saveAdjustment.mutateAsync({
                      supplier_id: id,
                      purchase_date: adjForm.adj_date,
                      description: adjForm.description || "Metal adjustment",
                      metal: adjForm.metal,
                      is_metal_balance: true,
                      is_adjustment: true,
                      gross_wt: 0,
                      purity_pct: 100,
                      pure_wt: adjForm.pure_wt,
                      amount: 0,
                      notes: adjForm.notes || null,
                    });
                    setShowAdjForm(false);
                    setAdjForm({ adj_date: globalDate, description: "", metal: "gold_22k", pure_wt: 0, notes: "" });
                  }}
                  className="bg-info text-white text-sm px-5 py-2 rounded-lg2 disabled:opacity-50">
                  {saveAdjustment.isPending ? "Saving…" : "Save Adjustment"}
                </button>
                <button onClick={() => setShowAdjForm(false)}
                  className="border border-line text-sm px-5 py-2 rounded-lg2">{t("cancel")}</button>
              </div>
              {saveAdjustment.isError && <p className="text-xs text-err">Save failed — run migration 066 in Supabase SQL Editor first.</p>}
            </div>
          )}

          {showPurchaseForm && (
            <form onSubmit={handlePurchaseSave} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-4">
              {/* Bill header */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-ink-dim">Date</label>
                  <input type="date" value={purchaseForm.purchase_date}
                    onChange={(e) => setPurchaseForm(p => ({ ...p, purchase_date: e.target.value }))} className={inp} /></div>
                <div><label className="text-xs text-ink-dim">Bill No</label>
                  <input type="text" placeholder="optional"
                    value={purchaseForm.bill_no}
                    onChange={(e) => setPurchaseForm(p => ({ ...p, bill_no: e.target.value }))} className={inp} /></div>
                <div><label className="text-xs text-ink-dim">Metal</label>
                  <select value={purchaseForm.metal}
                    onChange={(e) => setPurchaseForm(p => ({ ...p, metal: e.target.value }))} className={inp}>
                    {METALS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></div>
              </div>

              {/* Item rows */}
              {purchaseItems.map((item, idx) => {
                const netWt         = item.gross_wt - (item.tag_wt || 0) - item.stone_wt;
                const stoneValRs    = item.stone_wt > 0 && item.stone_rate > 0 ? item.stone_wt * item.stone_rate : 0;
                const chgValRs      = item.charges_per_piece > 0 && item.piece_count > 0 ? item.charges_per_piece * item.piece_count : 0;
                const stoneGoldG    = !item.stone_to_cash && item.rate > 0 ? stoneValRs / item.rate : 0;
                const chargesRsG    = !item.charges_to_cash && item.rate > 0 ? chgValRs / item.rate : 0;
                const basePure      = netWt * item.purity_pct / 100;
                const finalPure     = basePure + stoneGoldG + chargesRsG + item.charges_g;
                const cashExtras    = (item.stone_to_cash ? stoneValRs : 0) + (item.charges_to_cash ? chgValRs : 0);
                return (
                  <div key={idx} className={`border rounded-lg2 p-3 space-y-2 relative ${item.is_metal_balance ? "border-info/40 bg-info/5" : "border-line"}`}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-ink-dim">Item {idx + 1}</span>
                        <div className="flex rounded overflow-hidden border border-line text-xs">
                          <button type="button" onClick={() => updatePurchaseItem(idx, { is_metal_balance: false })}
                            className={`px-2 py-0.5 ${!item.is_metal_balance ? "bg-gold text-white" : "text-ink-dim hover:bg-canvas"}`}>Cash ₹</button>
                          <button type="button" onClick={() => updatePurchaseItem(idx, { is_metal_balance: true })}
                            className={`px-2 py-0.5 border-l border-line ${item.is_metal_balance ? "bg-info text-white" : "text-ink-dim hover:bg-canvas"}`}>Metal g</button>
                        </div>
                        {item.is_metal_balance && <span className="text-xs text-info">tracks as gold weight owed</span>}
                      </div>
                      {purchaseItems.length > 1 && (
                        <button type="button" onClick={() => setPurchaseItems(p => p.filter((_, i) => i !== idx))}
                          className="text-xs text-err hover:underline">Remove</button>
                      )}
                    </div>

                    {/* Description */}
                    <input type="text" placeholder="Description (e.g. Bahubali Chain)"
                      value={item.description}
                      onChange={(e) => updatePurchaseItem(idx, { description: e.target.value })}
                      className={inp} />

                    {/* Gross + Touch + Rate */}
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="text-xs text-ink-dim">Gross Wt (g)</label>
                        <input type="number" step="0.001" placeholder="0.000" value={item.gross_wt || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { gross_wt: parseFloat(e.target.value) || 0 })}
                          className={inp} /></div>
                      <div><label className="text-xs text-ink-dim">Cost Touch %</label>
                        <input type="number" step="0.01" placeholder="91.6" value={item.purity_pct || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { purity_pct: parseFloat(e.target.value) || 0 })}
                          className={inp} /></div>
                      <div>
                        <label className="text-xs text-ink-dim">
                          Rate / g (₹){item.is_metal_balance && <span className="text-ink-dim/50"> for conversions</span>}
                        </label>
                        <input type="number" step="0.01" placeholder="0" value={item.rate || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                          className={inp} />
                      </div>
                    </div>

                    {/* Deductions + net weight */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-canvas/60 rounded-lg2 p-2">
                      <div><label className="text-xs text-ink-dim">Tag Wt (g)</label>
                        <input type="number" step="0.0001" placeholder="0.0000" value={item.tag_wt || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { tag_wt: parseFloat(e.target.value) || 0 })}
                          className={inp} /></div>
                      <div><label className="text-xs text-ink-dim">Stone Wt (g)</label>
                        <input type="number" step="0.0001" placeholder="0.0000" value={item.stone_wt || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { stone_wt: parseFloat(e.target.value) || 0 })}
                          className={inp} /></div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-ink-dim">Stone ₹/g</label>
                          {item.stone_wt > 0 && item.stone_rate > 0 && (
                            <div className="flex rounded overflow-hidden border border-line text-xs">
                              <button type="button" onClick={() => updatePurchaseItem(idx, { stone_to_cash: false })}
                                className={`px-2 py-0.5 ${!item.stone_to_cash ? "bg-gold text-white" : "text-ink-dim hover:bg-canvas"}`}>→ Pure</button>
                              <button type="button" onClick={() => updatePurchaseItem(idx, { stone_to_cash: true })}
                                className={`px-2 py-0.5 border-l border-line ${item.stone_to_cash ? "bg-info text-white" : "text-ink-dim hover:bg-canvas"}`}>→ Cash</button>
                            </div>
                          )}
                        </div>
                        <input type="number" step="0.01" placeholder="0" value={item.stone_rate || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { stone_rate: parseFloat(e.target.value) || 0 })}
                          className={inp} />
                      </div>
                      <div><label className="text-xs text-ink-dim">Net Wt (g)</label>
                        <p className="text-sm font-mono py-2 font-semibold text-ink">{netWt.toFixed(4)} g</p>
                      </div>
                    </div>

                    {/* HM / cert charges in ₹ */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-canvas/60 rounded-lg2 p-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-ink-dim">HM/Cert ₹/piece</label>
                          {item.charges_per_piece > 0 && item.piece_count > 0 && (
                            <div className="flex rounded overflow-hidden border border-line text-xs">
                              <button type="button" onClick={() => updatePurchaseItem(idx, { charges_to_cash: false })}
                                className={`px-2 py-0.5 ${!item.charges_to_cash ? "bg-gold text-white" : "text-ink-dim hover:bg-canvas"}`}>→ Pure</button>
                              <button type="button" onClick={() => updatePurchaseItem(idx, { charges_to_cash: true })}
                                className={`px-2 py-0.5 border-l border-line ${item.charges_to_cash ? "bg-info text-white" : "text-ink-dim hover:bg-canvas"}`}>→ Cash</button>
                            </div>
                          )}
                        </div>
                        <input type="number" step="0.01" placeholder="0" value={item.charges_per_piece || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { charges_per_piece: parseFloat(e.target.value) || 0 })}
                          className={inp} />
                      </div>
                      <div><label className="text-xs text-ink-dim">Pieces</label>
                        <input type="number" step="1" placeholder="0" value={item.piece_count || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { piece_count: parseFloat(e.target.value) || 0 })}
                          className={inp} /></div>
                      <div><label className="text-xs text-ink-dim">Other charges (g)</label>
                        <input type="number" step="0.0001" placeholder="0.0000" value={item.charges_g || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { charges_g: parseFloat(e.target.value) || 0 })}
                          className={inp} /></div>
                      {item.charges_per_piece > 0 && item.piece_count > 0 && (
                        <div className="flex flex-col justify-center">
                          <p className="text-xs text-ink-dim">{item.piece_count} × ₹{item.charges_per_piece} = ₹{(item.charges_per_piece * item.piece_count).toFixed(0)}</p>
                          {item.rate > 0 && !item.charges_to_cash && <p className="text-xs font-semibold text-gold">= {chargesRsG.toFixed(4)} g</p>}
                          {item.charges_to_cash && <p className="text-xs font-semibold text-info">→ cash ₹{(item.charges_per_piece * item.piece_count).toFixed(0)}</p>}
                        </div>
                      )}
                    </div>

                    {/* Pure wt preview */}
                    {item.gross_wt > 0 && (
                      <div className="bg-gold/5 border border-gold/20 rounded-lg2 px-3 py-2 text-xs space-y-0.5">
                        {(item.tag_wt > 0 || item.stone_wt > 0) && (
                          <div className="flex justify-between text-ink-dim">
                            <span>
                              Gross {item.gross_wt}g
                              {item.tag_wt > 0 && ` − Tag ${item.tag_wt}g`}
                              {item.stone_wt > 0 && ` − Stone ${item.stone_wt}g`}
                              {" = Net metal"}
                            </span>
                            <span className="font-mono">{netWt.toFixed(4)} g</span>
                          </div>
                        )}
                        <div className="flex justify-between text-ink-dim">
                          <span>Base Pure ({item.purity_pct}% of {netWt.toFixed(4)}g)</span>
                          <span className="font-mono">{basePure.toFixed(4)} g</span>
                        </div>
                        {stoneGoldG > 0 && (
                          <div className="flex justify-between text-info">
                            <span>+ Stone → Pure ({item.stone_wt}g × ₹{item.stone_rate} ÷ ₹{item.rate}/g)</span>
                            <span className="font-mono">+ {stoneGoldG.toFixed(4)} g</span>
                          </div>
                        )}
                        {item.stone_to_cash && stoneValRs > 0 && (
                          <div className="flex justify-between text-info">
                            <span>+ Stone → Cash ({item.stone_wt}g × ₹{item.stone_rate})</span>
                            <span className="font-mono text-info">₹{stoneValRs.toFixed(0)} cash</span>
                          </div>
                        )}
                        {chargesRsG > 0 && (
                          <div className="flex justify-between text-info">
                            <span>+ HM → Pure ({item.piece_count} × ₹{item.charges_per_piece} ÷ ₹{item.rate}/g)</span>
                            <span className="font-mono">+ {chargesRsG.toFixed(4)} g</span>
                          </div>
                        )}
                        {item.charges_to_cash && chgValRs > 0 && (
                          <div className="flex justify-between text-info">
                            <span>+ HM → Cash ({item.piece_count} × ₹{item.charges_per_piece})</span>
                            <span className="font-mono text-info">₹{chgValRs.toFixed(0)} cash</span>
                          </div>
                        )}
                        {item.charges_g > 0 && (
                          <div className="flex justify-between text-ink-dim">
                            <span>+ Other charges</span>
                            <span className="font-mono">+ {item.charges_g.toFixed(4)} g</span>
                          </div>
                        )}
                        <div className="flex justify-between font-semibold border-t border-gold/20 pt-1">
                          <span>Final Pure</span>
                          <span className="font-mono text-gold">{finalPure.toFixed(roundDigits)} g</span>
                        </div>
                        {item.is_metal_balance ? (
                          <div className="flex justify-between text-info text-xs pt-0.5">
                            <span>Metal owed to supplier</span>
                            <span className="font-mono font-semibold">{finalPure.toFixed(roundDigits)} g</span>
                          </div>
                        ) : item.rate > 0 ? (
                          <div className="flex justify-between text-ok">
                            <span>
                              Amount ({finalPure.toFixed(roundDigits)} × ₹{item.rate}
                              {cashExtras > 0 ? ` + ₹${cashExtras.toFixed(0)} cash` : ""})
                            </span>
                            <span className="font-mono font-semibold">{inr(finalPure * item.rate + cashExtras)}</span>
                          </div>
                        ) : null}
                        {item.is_metal_balance && (cashExtras > 0 || item.mc_rs > 0) && (
                          <div className="flex justify-between text-ok text-xs font-semibold border-t border-gold/20 pt-1">
                            <span>Cash owed to supplier</span>
                            <span className="font-mono">{inr(cashExtras + item.mc_rs)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MC / cash charges (metal balance mode) */}
                    {item.is_metal_balance && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-ink-dim whitespace-nowrap">MC / Cash Charges (₹)</label>
                        <input type="number" step="0.01" placeholder="0" value={item.mc_rs || ""}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updatePurchaseItem(idx, { mc_rs: parseFloat(e.target.value) || 0 })}
                          className={`${inp} max-w-40`} />
                        {item.mc_rs > 0 && <span className="text-xs text-ok font-mono">Total cash: {inr(item.amount)}</span>}
                      </div>
                    )}

                    {/* Amount override (cash mode only) */}
                    {!item.is_metal_balance && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-ink-dim whitespace-nowrap">Amount (₹) <span className="text-ink-dim/50">auto</span></label>
                      <input type="number" step="0.01" value={item.amount || ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updatePurchaseItem(idx, { amount: parseFloat(e.target.value) || 0 })}
                        className={`${inp} max-w-40`} />
                    </div>
                    )}
                  </div>
                );
              })}

              <button type="button"
                onClick={() => setPurchaseItems(p => [...p, blankPurchaseItem()])}
                className="text-xs text-gold hover:underline">+ Add Another Item</button>

              {purchaseItems.length > 1 && (
                <div className="flex justify-between text-sm text-ink-dim bg-canvas rounded-lg2 px-3 py-2">
                  <span>Total Pure: <strong className="text-gold">{purchaseItems.reduce((s, item) => {
                    const net      = item.gross_wt - (item.tag_wt || 0) - item.stone_wt;
                    const sv       = item.stone_wt > 0 && item.stone_rate > 0 ? item.stone_wt * item.stone_rate : 0;
                    const cv       = item.charges_per_piece > 0 && item.piece_count > 0 ? item.charges_per_piece * item.piece_count : 0;
                    const stoneG   = !item.stone_to_cash && item.rate > 0 ? sv / item.rate : 0;
                    const chgRsG   = !item.charges_to_cash && item.rate > 0 ? cv / item.rate : 0;
                    return s + net * item.purity_pct / 100 + stoneG + chgRsG + item.charges_g;
                  }, 0).toFixed(roundDigits)} g</strong></span>
                  <span>Total: <strong>{inr(purchaseItems.reduce((s, item) => s + item.amount, 0))}</strong></span>
                </div>
              )}

              <div className="flex gap-2">
                <button type="submit" disabled={savePurchase.isPending} className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                  {savePurchase.isPending ? "Saving…" : t("save")}
                </button>
                <button type="button" onClick={() => setShowPurchaseForm(false)} className="border border-line text-sm px-4 py-1.5 rounded-lg2">{t("cancel")}</button>
              </div>
            </form>
          )}
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5">Item</th>
                <th className="text-left px-3 py-2.5">Metal</th>
                <th className="text-right px-3 py-2.5">Gross</th>
                <th className="text-right px-3 py-2.5">Stone</th>
                <th className="text-right px-3 py-2.5 text-gold">Pure Wt</th>
                <th className="text-right px-3 py-2.5">{t("amount")}</th>
                <th className="px-3 py-2.5 w-12"></th>
              </tr></thead>
              <tbody>
                {view?.purchases.map((p: any) => {
                  const isEditing = editingPurchaseId === p.id;
                  if (isEditing) {
                    const ep           = editPurchaseForm;
                    const netWtEp      = parseFloat((ep.gross_wt - (ep.tag_wt || 0) - (ep.stone_wt || 0)).toFixed(4));
                    const stoneGoldGEp = ep.rate > 0 && ep.stone_wt > 0 && ep.stone_rate > 0
                      ? parseFloat(((ep.stone_wt * ep.stone_rate) / ep.rate).toFixed(4)) : 0;
                    const chgRsGEp     = ep.rate > 0 && ep.charges_per_piece > 0 && ep.piece_count > 0
                      ? parseFloat(((ep.charges_per_piece * ep.piece_count) / ep.rate).toFixed(4)) : 0;
                    const basePure     = parseFloat((netWtEp * ep.purity_pct / 100).toFixed(4));
                    const finalPure    = roundPure(basePure + stoneGoldGEp + chgRsGEp + ep.charges_g);
                    return (
                      <tr key={p.id} className="border-b border-line bg-gold/5">
                        <td colSpan={8} className="px-4 py-3">
                          <form onSubmit={handleEditPurchaseSave} className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div><label className="text-xs text-ink-dim">Date</label>
                                <input type="date" value={ep.purchase_date} onChange={(e) => updateEditPurchaseForm({ purchase_date: e.target.value })} className={inp} /></div>
                              <div><label className="text-xs text-ink-dim">Metal</label>
                                <select value={ep.metal} onChange={(e) => updateEditPurchaseForm({ metal: e.target.value })} className={inp}>
                                  {METALS.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select></div>
                              <div className="sm:col-span-2"><label className="text-xs text-ink-dim">Item Name</label>
                                <input type="text" value={ep.description} onChange={(e) => updateEditPurchaseForm({ description: e.target.value })} className={inp} /></div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              {[
                                { label: "Gross Wt (g)", key: "gross_wt", step: "0.001" },
                                { label: "Tag Wt (g)", key: "tag_wt", step: "0.0001" },
                                { label: "Stone Wt (g)", key: "stone_wt", step: "0.0001" },
                                { label: "Stone ₹/g", key: "stone_rate", step: "0.01" },
                                { label: "Cost Touch %", key: "purity_pct", step: "0.01" },
                                { label: "Rate / g (₹)", key: "rate", step: "0.01" },
                                { label: "HM/cert ₹/pc", key: "charges_per_piece", step: "0.01" },
                                { label: "Pieces", key: "piece_count", step: "1" },
                                { label: "Other chg (g)", key: "charges_g", step: "0.0001" },
                              ].map((f) => (
                                <div key={f.key}><label className="text-xs text-ink-dim">{f.label}</label>
                                  <input type="number" step={f.step} value={(ep as any)[f.key] || ""}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => updateEditPurchaseForm({ [f.key]: parseFloat(e.target.value) || 0 })}
                                    className={inp} />
                                </div>
                              ))}
                              {ep.is_metal_balance ? (
                                <div><label className="text-xs text-ink-dim">MC / Cash (₹)</label>
                                  <input type="number" step="0.01" placeholder="0" value={ep.mc_rs || ""}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => updateEditPurchaseForm({ mc_rs: parseFloat(e.target.value) || 0 })}
                                    className={inp} />
                                </div>
                              ) : (
                                <div><label className="text-xs text-ink-dim">Amount (₹)</label>
                                  <input type="number" step="0.01" value={ep.amount || ""}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setEditPurchaseForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                    className={inp} />
                                </div>
                              )}
                            </div>
                            {ep.gross_wt > 0 && (
                              <p className="text-xs text-ink-dim">
                                {(ep.tag_wt > 0 || ep.stone_wt > 0) && <>Net: {netWtEp.toFixed(4)}g · </>}
                                Pure: {basePure.toFixed(4)}g
                                {stoneGoldGEp > 0 && <span className="text-info"> + stone {stoneGoldGEp.toFixed(4)}g</span>}
                                {chgRsGEp > 0 && <span className="text-info"> + HM {chgRsGEp.toFixed(4)}g</span>}
                                {ep.charges_g > 0 && ` + ${ep.charges_g.toFixed(4)}g`}
                                = <strong className="text-gold">{finalPure.toFixed(roundDigits)}g</strong>
                                {ep.rate > 0 && <> · Amount: <strong className="text-ok">{inr(finalPure * ep.rate)}</strong></>}
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button type="submit" disabled={updatePurchase.isPending}
                                className="bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                {updatePurchase.isPending ? "Saving…" : "Save"}
                              </button>
                              <button type="button" onClick={() => setEditingPurchaseId(null)}
                                className="border border-line text-xs px-4 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <Fragment key={p.id}>
                    <tr className={`border-b border-line last:border-0 hover:bg-canvas/50 group ${p.is_return ? "bg-ok/5" : ""}`}>
                      <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.purchase_date)}</td>
                      <td className="px-3 py-2.5 font-medium">
                        {p.description || <span className="text-ink-dim">—</span>}
                        {p.is_return     && <span className="ml-1 text-xs text-ok   border border-ok/30   rounded px-1">return</span>}
                        {p.is_adjustment && <span className="ml-1 text-xs text-info border border-info/30 rounded px-1">adj</span>}
                        {p.is_metal_balance && !p.is_return && !p.is_adjustment && <span className="ml-1 text-xs text-info border border-info/30 rounded px-1">metal</span>}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-ink-dim">{p.metal?.replace("_", " ")}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{grams(p.gross_wt ?? 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-dim">{p.stone_wt > 0 ? grams(p.stone_wt) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-semibold ${p.is_return ? "text-ok" : p.is_adjustment ? (Number(p.pure_wt) < 0 ? "text-ok" : "text-info") : "text-gold"}`}>
                        {p.is_return ? "-" : p.is_adjustment && Number(p.pure_wt) > 0 ? "+" : ""}{grams(Math.abs(Number(p.pure_wt ?? 0)))}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{inr(p.amount)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(p.amount ?? 0) > 0 && (
                            <button
                              onClick={() => { setExpandedPayPurchaseId(expandedPayPurchaseId === p.id ? null : p.id); setPartPayForm(blankPartPay()); setDeletingPartPayId(null); }}
                              className="text-xs text-info hover:underline">
                              {expandedPayPurchaseId === p.id ? "Hide" : "Payments"}
                            </button>
                          )}
                          <button onClick={() => { openEditPurchase(p); setDeletingPurchaseId(null); }}
                            className="text-xs text-gold hover:underline">Edit</button>
                          <button onClick={() => setDeletingPurchaseId(deletingPurchaseId === p.id ? null : p.id)}
                            className="text-xs text-err hover:underline">Del</button>
                        </div>
                        {(p.amount ?? 0) > 0 && (() => {
                          const paid = paidByPurchaseId.get(p.id) ?? 0;
                          const outstanding = Number(p.amount) - paid;
                          if (paid <= 0) return null;
                          return (
                            <div className="text-[10px] mt-0.5 text-right">
                              <span className="text-ok">{inr(paid)} paid</span>
                              {outstanding > 0.01 && <span className="text-err ml-1">{inr(outstanding)} due</span>}
                              {outstanding <= 0.01 && <span className="text-ok ml-1">✓ settled</span>}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                    {/* Part-payment panel */}
                    {expandedPayPurchaseId === p.id && (
                      <tr className="border-b border-line bg-info/3">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">
                                Payment History — {p.description || shortDate(p.purchase_date)} · Total {inr(p.amount)}
                              </p>
                              {(() => {
                                const paid = paidByPurchaseId.get(p.id) ?? 0;
                                const outstanding = Number(p.amount) - paid;
                                return (
                                  <div className="text-xs flex gap-3">
                                    <span className="text-ok">Paid: {inr(paid)}</span>
                                    <span className={outstanding > 0.01 ? "text-err font-semibold" : "text-ok"}>
                                      {outstanding > 0.01 ? `Outstanding: ${inr(outstanding)}` : "Fully settled"}
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Payment rows for this purchase */}
                            {(() => {
                              const purchasePayments = (view?.payments ?? []).filter((pay: any) => pay.purchase_id === p.id);
                              if (purchasePayments.length === 0) {
                                return <p className="text-xs text-ink-dim">No payments recorded yet.</p>;
                              }
                              return (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-ink-dim border-b border-line">
                                      <th className="text-left py-1 pr-3">Date</th>
                                      <th className="text-left py-1 pr-3">Mode</th>
                                      <th className="text-right py-1 pr-3">Amount</th>
                                      <th className="text-left py-1 pr-3">Notes</th>
                                      <th className="py-1 w-12" />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchasePayments.map((pay: any) => (
                                      <Fragment key={pay.id}>
                                        <tr className="border-b border-line/50 last:border-0">
                                          <td className="py-1 pr-3 text-ink-dim">{shortDate(pay.pay_date)}</td>
                                          <td className="py-1 pr-3 capitalize">{pay.mode?.replace("_", " ")}</td>
                                          <td className="py-1 pr-3 text-right font-mono font-medium text-err">{inr(pay.amount)}</td>
                                          <td className="py-1 pr-3 text-ink-dim">{pay.notes || "—"}</td>
                                          <td className="py-1 text-right">
                                            {deletingPartPayId === pay.id ? (
                                              <div className="flex gap-1 justify-end">
                                                <button onClick={async () => {
                                                  await deletePayment.mutateAsync({ id: pay.id, supplierId: id });
                                                  setDeletingPartPayId(null);
                                                }} className="text-[10px] bg-err text-white px-1.5 py-0.5 rounded">Yes</button>
                                                <button onClick={() => setDeletingPartPayId(null)} className="text-[10px] border border-line px-1.5 py-0.5 rounded">No</button>
                                              </div>
                                            ) : (
                                              <button onClick={() => setDeletingPartPayId(pay.id)} className="text-[10px] text-err hover:underline">Del</button>
                                            )}
                                          </td>
                                        </tr>
                                      </Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              );
                            })()}

                            {/* Add part payment form */}
                            <div className="border-t border-line/50 pt-3">
                              <p className="text-xs text-ink-dim mb-2">+ Add Part Payment</p>
                              <div className="flex flex-wrap gap-2 items-end">
                                <div>
                                  <label className="text-[10px] text-ink-dim block mb-0.5">Date</label>
                                  <input type="date" value={partPayForm.pay_date}
                                    onChange={e => setPartPayForm(f => ({ ...f, pay_date: e.target.value }))}
                                    className="border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-ink-dim block mb-0.5">Mode</label>
                                  <select value={partPayForm.mode}
                                    onChange={e => setPartPayForm(f => ({ ...f, mode: e.target.value }))}
                                    className="border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold bg-white">
                                    {["cash", "upi", "bank"].map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-ink-dim block mb-0.5">Amount (₹)</label>
                                  <input type="number" step="0.01" value={partPayForm.amount || ""}
                                    onFocus={e => e.target.select()}
                                    onChange={e => setPartPayForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                                    className="border border-line rounded-lg2 px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-gold" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-ink-dim block mb-0.5">Notes</label>
                                  <input type="text" value={partPayForm.notes}
                                    onChange={e => setPartPayForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="optional"
                                    className="border border-line rounded-lg2 px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-gold" />
                                </div>
                                <button
                                  disabled={savePayment.isPending || partPayForm.amount <= 0}
                                  onClick={async () => {
                                    await savePayment.mutateAsync({
                                      supplier_id: id,
                                      purchase_id: p.id,
                                      pay_date: partPayForm.pay_date,
                                      mode: partPayForm.mode,
                                      amount: partPayForm.amount,
                                      notes: partPayForm.notes || null,
                                    });
                                    setPartPayForm(blankPartPay());
                                  }}
                                  className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                                  {savePayment.isPending ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {deletingPurchaseId === p.id && (
                      <tr className="border-b border-line bg-err/5">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-err">
                              Delete {p.is_return ? "return" : "purchase"} — {p.description || shortDate(p.purchase_date)}, {grams(p.pure_wt)} pure wt?
                            </span>
                            <button
                              disabled={deletePurchase.isPending}
                              onClick={() => deletePurchase.mutate({ id: p.id, supplierId: id }, { onSuccess: () => setDeletingPurchaseId(null) })}
                              className="text-xs bg-err text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50">
                              {deletePurchase.isPending ? "Deleting…" : "Yes, Delete"}
                            </button>
                            <button onClick={() => setDeletingPurchaseId(null)}
                              className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
                {!view?.purchases.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments */}
      {tab === "payments" && !isLoading && (
        <div className="space-y-3">
          <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="text-xs text-gold hover:underline">+ Add Payment</button>
          {showPaymentForm && (
            <form onSubmit={handlePaymentSave} className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div><label className="text-xs text-ink-dim">Date</label>
                  <input type="date" value={paymentForm.pay_date} onChange={(e) => setPaymentForm({ ...paymentForm, pay_date: e.target.value })} className={inp} /></div>
                <div><label className="text-xs text-ink-dim">Mode</label>
                  <select value={paymentForm.mode} onChange={(e) => setPaymentForm({ ...paymentForm, mode: e.target.value })} className={inp}>
                    {PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    <option value="cut_rate">Cut Rate</option>
                  </select></div>
                <div><label className="text-xs text-ink-dim">Amount</label>
                  <input type="number" step="0.01" value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                    className={inp} /></div>
                {(paymentForm.mode === "cash" || paymentForm.mode === "bank" || paymentForm.mode === "upi") && (
                  <>
                    <div><label className="text-xs text-ink-dim">Metal Wt g <span className="text-ink-dim/50">(opt)</span></label>
                      <input type="number" step="0.001" value={paymentForm.metal_wt || ""}
                        onChange={(e) => {
                          const wt = parseFloat(e.target.value) || 0;
                          setPaymentForm((f) => ({ ...f, metal_wt: wt, amount: f.cut_rate > 0 && wt > 0 ? Math.round(wt * f.cut_rate * 100) / 100 : f.amount }));
                        }}
                        className={inp} /></div>
                    <div><label className="text-xs text-ink-dim">Rate/g <span className="text-ink-dim/50">(opt)</span></label>
                      <input type="number" step="0.01" value={paymentForm.cut_rate || ""}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          setPaymentForm((f) => ({ ...f, cut_rate: rate, amount: f.metal_wt > 0 && rate > 0 ? Math.round(f.metal_wt * rate * 100) / 100 : f.amount }));
                        }}
                        className={inp} /></div>
                  </>
                )}
                {(paymentForm.mode === "old_gold" || paymentForm.mode === "old_silver") && (
                  <>
                    <div><label className="text-xs text-ink-dim">Metal Wt</label>
                      <input type="number" step="0.001" value={paymentForm.metal_wt}
                        onChange={(e) => setPaymentForm({ ...paymentForm, metal_wt: parseFloat(e.target.value) || 0 })}
                        className={inp} /></div>
                    <div><label className="text-xs text-ink-dim">Purity%</label>
                      <input type="number" step="0.01" value={paymentForm.metal_purity}
                        onChange={(e) => setPaymentForm({ ...paymentForm, metal_purity: parseFloat(e.target.value) || 0 })}
                        className={inp} /></div>
                  </>
                )}
                {paymentForm.mode === "cut_rate" && (
                  <div><label className="text-xs text-ink-dim">Cut Rate/g</label>
                    <input type="number" step="0.01" value={paymentForm.cut_rate || ""}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPaymentForm({ ...paymentForm, cut_rate: parseFloat(e.target.value) || 0 })}
                      className={inp} /></div>
                )}
                {paymentForm.mode === "cut_rate" && paymentForm.amount > 0 && paymentForm.cut_rate > 0 && (
                  <div className="sm:col-span-3 bg-gold/5 border border-gold/20 rounded-lg2 px-3 py-2 text-sm flex justify-between items-center">
                    <span className="text-ink-dim">{inr(paymentForm.amount)} ÷ ₹{paymentForm.cut_rate}/g = grams settled</span>
                    <span className="font-mono font-semibold text-gold">{(paymentForm.amount / paymentForm.cut_rate).toFixed(3)} g</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2">{t("save")}</button>
                <button type="button" onClick={() => setShowPaymentForm(false)} className="border border-line text-sm px-4 py-1.5 rounded-lg2">{t("cancel")}</button>
              </div>
            </form>
          )}

          {/* Cash payments */}
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Cash / Bank Payments</p>
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5">Mode</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Metal Wt</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Rate/g</th>
                <th className="text-right px-3 py-2.5">{t("amount")}</th>
                <th className="px-3 py-2.5" />
              </tr></thead>
              <tbody>
                {view?.payments.map((p: any) => (
                  <Fragment key={p.id}>
                    <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-4 py-2.5 text-ink-dim">{shortDate(p.pay_date)}</td>
                      <td className="px-3 py-2.5 capitalize">{p.mode}</td>
                      <td className="px-3 py-2.5 text-right hidden sm:table-cell text-ink-dim">
                        {p.metal_wt ? <span className={p.mode === "cut_rate" ? "text-gold font-semibold" : ""}>{grams(p.metal_wt)}</span> : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right hidden sm:table-cell text-ink-dim">{p.cut_rate ? inr(p.cut_rate) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-err">{inr(p.amount)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => openEditPayment(p)}
                          className="text-xs text-gold hover:underline mr-2">Edit</button>
                        <button onClick={() => { setDeletingPaymentId(p.id); setEditingPaymentId(null); }}
                          className="text-xs text-err hover:underline">Del</button>
                      </td>
                    </tr>

                    {/* Inline edit form */}
                    {editingPaymentId === p.id && (
                      <tr className="border-b border-line bg-gold/5">
                        <td colSpan={6} className="px-4 py-3">
                          <form onSubmit={handleEditPaymentSave} className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div><label className="text-xs text-ink-dim">Date</label>
                                <input type="date" value={editPayForm.pay_date}
                                  onChange={(e) => setEditPayForm({ ...editPayForm, pay_date: e.target.value })} className={inp} /></div>
                              <div><label className="text-xs text-ink-dim">Mode</label>
                                <select value={editPayForm.mode}
                                  onChange={(e) => setEditPayForm({ ...editPayForm, mode: e.target.value })} className={inp}>
                                  {PAY_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                                  <option value="cut_rate">Cut Rate</option>
                                </select></div>
                              <div><label className="text-xs text-ink-dim">Amount</label>
                                <input type="number" step="0.01" value={editPayForm.amount}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => setEditPayForm({ ...editPayForm, amount: parseFloat(e.target.value) || 0 })}
                                  className={inp} /></div>
                              {editPayForm.mode === "cut_rate" && (
                                <>
                                  <div><label className="text-xs text-ink-dim">Metal Wt (g) *</label>
                                    <input type="number" step="0.001" value={editPayForm.metal_wt || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const wt = parseFloat(e.target.value) || 0;
                                        setEditPayForm((f) => ({ ...f, metal_wt: wt, amount: f.cut_rate > 0 && wt > 0 ? Math.round(wt * f.cut_rate * 100) / 100 : f.amount }));
                                      }}
                                      className={inp} /></div>
                                  <div><label className="text-xs text-ink-dim">Rate/g *</label>
                                    <input type="number" step="0.01" value={editPayForm.cut_rate || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const rate = parseFloat(e.target.value) || 0;
                                        setEditPayForm((f) => ({ ...f, cut_rate: rate, amount: f.metal_wt > 0 && rate > 0 ? Math.round(f.metal_wt * rate * 100) / 100 : f.amount }));
                                      }}
                                      className={inp} /></div>
                                </>
                              )}
                              {(editPayForm.mode === "cash" || editPayForm.mode === "bank" || editPayForm.mode === "upi") && (
                                <>
                                  <div><label className="text-xs text-ink-dim">Metal Wt g <span className="text-ink-dim/50">(opt)</span></label>
                                    <input type="number" step="0.001" value={editPayForm.metal_wt || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const wt = parseFloat(e.target.value) || 0;
                                        setEditPayForm((f) => ({ ...f, metal_wt: wt, amount: f.cut_rate > 0 && wt > 0 ? Math.round(wt * f.cut_rate * 100) / 100 : f.amount }));
                                      }}
                                      className={inp} /></div>
                                  <div><label className="text-xs text-ink-dim">Rate/g <span className="text-ink-dim/50">(opt)</span></label>
                                    <input type="number" step="0.01" value={editPayForm.cut_rate || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const rate = parseFloat(e.target.value) || 0;
                                        setEditPayForm((f) => ({ ...f, cut_rate: rate, amount: f.metal_wt > 0 && rate > 0 ? Math.round(f.metal_wt * rate * 100) / 100 : f.amount }));
                                      }}
                                      className={inp} /></div>
                                </>
                              )}
                              {(editPayForm.mode === "old_gold" || editPayForm.mode === "old_silver") && (
                                <>
                                  <div><label className="text-xs text-ink-dim">Metal Wt</label>
                                    <input type="number" step="0.001" value={editPayForm.metal_wt}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => setEditPayForm({ ...editPayForm, metal_wt: parseFloat(e.target.value) || 0 })}
                                      className={inp} /></div>
                                  <div><label className="text-xs text-ink-dim">Purity%</label>
                                    <input type="number" step="0.01" value={editPayForm.metal_purity}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => setEditPayForm({ ...editPayForm, metal_purity: parseFloat(e.target.value) || 0 })}
                                      className={inp} /></div>
                                </>
                              )}
                              <div className="sm:col-span-3"><label className="text-xs text-ink-dim">Notes</label>
                                <input value={editPayForm.notes}
                                  onChange={(e) => setEditPayForm({ ...editPayForm, notes: e.target.value })}
                                  className={inp} placeholder="Optional" /></div>
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" disabled={updatePayment.isPending}
                                className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                                {updatePayment.isPending ? "Saving…" : "Save Changes"}
                              </button>
                              <button type="button" onClick={() => setEditingPaymentId(null)}
                                className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
                            </div>
                            {updatePayment.isError && <p className="text-xs text-err">Save failed.</p>}
                          </form>
                        </td>
                      </tr>
                    )}

                    {/* Inline delete confirmation */}
                    {deletingPaymentId === p.id && (
                      <tr className="border-b border-line bg-err/5">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-err">Delete payment of {inr(p.amount)} on {shortDate(p.pay_date)}?</span>
                            <button
                              disabled={deletePayment.isPending}
                              onClick={() => deletePayment.mutate({ id: p.id, supplierId: id }, { onSuccess: () => setDeletingPaymentId(null) })}
                              className="text-xs bg-err text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50">
                              {deletePayment.isPending ? "Deleting…" : "Yes, Delete"}
                            </button>
                            <button onClick={() => setDeletingPaymentId(null)}
                              className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!view?.payments.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Cash Statement — chronological ledger with running balance */}
          {cashLedger.length > 0 && (
            <>
              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mt-2">Cash Statement</p>
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <table className="w-full text-sm" style={{ minWidth: "480px" }}>
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Type</th>
                    <th className="text-left px-3 py-2.5">Description</th>
                    <th className="text-right px-3 py-2.5">Amount</th>
                    <th className="text-right px-4 py-2.5">Balance</th>
                  </tr></thead>
                  <tbody>
                    {openingCash !== 0 && (
                      <tr className="border-b border-line bg-canvas/60">
                        <td className="px-4 py-2 text-ink-dim text-xs">—</td>
                        <td className="px-3 py-2 text-xs font-medium text-ink-dim">Opening</td>
                        <td className="px-3 py-2 text-xs text-ink-dim">Opening balance</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-err">+{inr(openingCash)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-semibold text-err">{inr(openingCash)}</td>
                      </tr>
                    )}
                    {cashLedger.map((row) => (
                      <tr key={row.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim text-xs">{shortDate(row.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium ${
                            row.type === "Purchase" ? "text-gold" :
                            row.type === "Cut Rate" ? "text-warn" : "text-ok"
                          }`}>{row.type}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-dim">{row.description}</td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs ${row.delta > 0 ? "text-err" : "text-ok"}`}>
                          {row.delta > 0 ? "+" : ""}{inr(row.delta)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${row.balance > 0 ? "text-err" : row.balance < 0 ? "text-ok" : "text-ink-dim"}`}>
                          {inr(Math.abs(row.balance))}
                          <span className="ml-1 text-xs font-normal">{row.balance > 0 ? "owed" : row.balance < 0 ? "over" : ""}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-canvas border-t border-line flex justify-between text-xs font-semibold">
                  <span>Current cash balance</span>
                  <span className={`font-mono ${cashBalance > 0 ? "text-err" : cashBalance < 0 ? "text-ok" : "text-ink-dim"}`}>
                    {inr(Math.abs(cashBalance))} {cashBalance > 0 ? "owed to supplier" : cashBalance < 0 ? "over-paid" : "settled"}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Metal Statement — full chronological ledger with running balance */}
          {metalLedger.length > 0 && (
            <>
              <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mt-2">Metal Statement</p>
              <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
                <table className="w-full text-sm" style={{ minWidth: "560px" }}>
                  <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Type</th>
                    <th className="text-left px-3 py-2.5">Description</th>
                    <th className="text-right px-3 py-2.5">Grams</th>
                    <th className="text-right px-4 py-2.5">Balance</th>
                  </tr></thead>
                  <tbody>
                    {(goldOpeningG + silverOpeningG) > 0 && (
                      <tr className="border-b border-line bg-canvas/60">
                        <td className="px-4 py-2 text-ink-dim text-xs">—</td>
                        <td className="px-3 py-2 text-xs font-medium text-ink-dim">Opening</td>
                        <td className="px-3 py-2 text-xs text-ink-dim">Opening balance</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gold">+{grams(goldOpeningG + silverOpeningG)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-semibold text-err">{grams(goldOpeningG + silverOpeningG)}</td>
                      </tr>
                    )}
                    {metalLedger.map((row) => (
                      <tr key={row.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                        <td className="px-4 py-2.5 text-ink-dim text-xs">{shortDate(row.date)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-medium ${
                            row.type === "Purchase"   ? "text-gold" :
                            row.type === "Return"     ? "text-ok"   :
                            row.type === "Adjustment" ? "text-info" :
                            row.type === "Dispatch"   ? "text-info" : "text-warn"
                          }`}>{row.type}</span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-ink-dim">{row.description}</td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs ${row.delta > 0 ? "text-err" : "text-ok"}`}>
                          {row.delta > 0 ? "+" : ""}{grams(row.delta)}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${row.balance > 0 ? "text-err" : row.balance < 0 ? "text-ok" : "text-ink-dim"}`}>
                          {grams(Math.abs(row.balance))}
                          <span className="ml-1 text-xs font-normal">{row.balance > 0 ? "owed" : row.balance < 0 ? "over" : ""}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 bg-canvas border-t border-line flex justify-between text-xs font-semibold">
                  <span>Current metal balance</span>
                  <span className={`font-mono ${metalBalanceG > 0 ? "text-err" : metalBalanceG < 0 ? "text-ok" : "text-ink-dim"}`}>
                    {grams(Math.abs(metalBalanceG))} {metalBalanceG > 0 ? "owed to supplier" : metalBalanceG < 0 ? "over-sent" : "settled"}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Suspense */}
      {tab === "suspense" && !isLoading && (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox"
                    checked={(view?.suspense?.length ?? 0) > 0 && selectedSuspense.size === (view?.suspense?.length ?? 0)}
                    onChange={(e) => setSelectedSuspense(e.target.checked ? new Set(view?.suspense.map((s: any) => s.id)) : new Set())}
                    className="accent-gold" />
                </th>
                <th className="text-left px-4 py-2.5">Bill</th>
                <th className="text-left px-3 py-2.5">{t("date")}</th>
                <th className="text-left px-3 py-2.5">Description</th>
                <th className="text-right px-3 py-2.5">Gross</th>
                <th className="text-right px-3 py-2.5">Cash Total</th>
                <th className="text-right px-3 py-2.5">Pure Wt Owed</th>
                <th className="px-3 py-2.5"></th>
              </tr></thead>
              <tbody>
                {view?.suspense.map((s: any) => (
                  <Fragment key={s.id}>
                    <tr className="border-b border-line last:border-0 hover:bg-canvas/50">
                      <td className="px-3 py-2.5">
                        <input type="checkbox"
                          checked={selectedSuspense.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(selectedSuspense);
                            e.target.checked ? next.add(s.id) : next.delete(s.id);
                            setSelectedSuspense(next);
                            if (next.size > 0) setEditingVa(null);
                          }}
                          className="accent-gold" />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-info">{s.bill_no}</td>
                      <td className="px-3 py-2.5 text-ink-dim">{shortDate(s.bill_date)}</td>
                      <td className="px-3 py-2.5">{s.description}</td>
                      <td className="px-3 py-2.5 text-right">{grams(s.gross_wt ?? 0)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {s.supplier_cash_amt > 0
                          ? <span className="font-mono text-ink">{inr(s.supplier_cash_amt)}</span>
                          : <span className="text-ink-dim">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {s.supplier_confirmed
                          ? <span className="text-ok font-mono">{grams(s.supplier_pure_wt ?? 0)}</span>
                          : <span className="text-ink-dim">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!s.supplier_confirmed && (
                          <button
                            onClick={() => setEditingVa({ id: s.id, gross_wt: s.gross_wt ?? 0, purity_pct: s.purity_pct ?? 92, va_pct: 0, cash_amt: s.supplier_cash_amt ?? 0, cash_paid_now: 0, bill_no: s.bill_no ?? "" })}
                            className="text-xs text-gold hover:underline">
                            Settle
                          </button>
                        )}
                        {s.supplier_confirmed && (
                          <button
                            onClick={() => setEditingVa({ id: s.id, gross_wt: s.gross_wt ?? 0, purity_pct: s.purity_pct ?? 92, va_pct: s.supplier_va_pct ?? 0, cash_amt: s.supplier_cash_amt ?? 0, cash_paid_now: 0, bill_no: s.bill_no ?? "" })}
                            className="text-xs text-ok hover:underline">
                            ✓ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    {editingVa !== null && editingVa.id === s.id && (
                      <tr className="border-b border-line bg-canvas/50">
                        <td colSpan={8} className="px-4 py-3">
                          <form onSubmit={handleConfirmVa} className="space-y-3">
                            <div className="flex items-end gap-3 flex-wrap">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Gross Wt</label>
                                <p className="text-sm font-mono">{grams(editingVa.gross_wt)}</p>
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Cash Bill Amount (₹)</label>
                                <input type="number" step="0.01" value={editingVa.cash_amt || ""}
                                  onFocus={(e) => e.target.select()} placeholder="0"
                                  onChange={(e) => setEditingVa({ ...editingVa, cash_amt: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-gold"
                                  autoFocus />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Cash Paid Now (₹)</label>
                                <input type="number" step="0.01" value={editingVa.cash_paid_now || ""}
                                  onFocus={(e) => e.target.select()} placeholder="0"
                                  onChange={(e) => setEditingVa({ ...editingVa, cash_paid_now: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm w-32 focus:outline-none focus:ring-1 focus:ring-gold" />
                              </div>
                              {editingVa.cash_amt > 0 && (
                                <div>
                                  <label className="text-xs text-ink-dim block mb-1">Balance</label>
                                  <p className="text-sm font-mono text-err font-semibold">
                                    {inr(editingVa.cash_amt - (editingVa.cash_paid_now || 0))}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-end gap-3 flex-wrap border-t border-line pt-3">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Metal VA% (optional)</label>
                                <input type="number" step="0.01" value={editingVa.va_pct || ""}
                                  onFocus={(e) => e.target.select()} placeholder="0"
                                  onChange={(e) => setEditingVa({ ...editingVa, va_pct: parseFloat(e.target.value) || 0 })}
                                  className="border border-line rounded-lg2 px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-gold" />
                              </div>
                              {editingVa.va_pct > 0 && (
                                <div>
                                  <label className="text-xs text-ink-dim block mb-1">Pure Wt Owed</label>
                                  <p className="text-sm font-mono text-info">
                                    {editingVa.va_pct.toFixed(2)}% = {grams(vaPreview)}
                                  </p>
                                </div>
                              )}
                              <div className="flex gap-2 ml-auto">
                                <button type="submit" disabled={confirmVa.isPending}
                                  className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2 disabled:opacity-40">
                                  Confirm
                                </button>
                                <button type="button" onClick={() => setEditingVa(null)}
                                  className="border border-line text-xs px-3 py-1.5 rounded-lg2">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!view?.suspense.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-ink-dim">{t("no_data")}</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Batch settlement panel */}
          {selectedSuspense.size > 0 && (() => {
            const sel = (view?.suspense ?? []).filter((s: any) => selectedSuspense.has(s.id));
            const totalGross = sel.reduce((a: number, s: any) => a + (Number(s.gross_wt) || 0), 0);
            const totalPure  = sel.reduce((a: number, s: any) => a + (Number(s.supplier_pure_wt) || 0), 0);
            const avgPurity  = totalGross > 0 ? (totalPure / totalGross) * 100 : 0;
            const balance    = batchForm.total_cash_amt - batchForm.cash_paid_now;
            return (
              <div className="bg-white border border-gold/30 rounded-xl shadow-soft px-4 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{selectedSuspense.size} item{selectedSuspense.size > 1 ? "s" : ""} selected</p>
                  <button onClick={() => setSelectedSuspense(new Set())} className="text-xs text-ink-dim hover:underline">Clear</button>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center text-sm bg-canvas rounded-lg2 px-3 py-2">
                  <div>
                    <p className="text-xs text-ink-dim mb-0.5">Total Gross</p>
                    <p className="font-mono font-semibold">{grams(totalGross)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-dim mb-0.5">Total Pure Wt</p>
                    <p className="font-mono font-semibold text-info">{grams(totalPure)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-dim mb-0.5">Avg Purity</p>
                    <p className="font-mono font-semibold text-gold">{avgPurity.toFixed(2)}%</p>
                  </div>
                </div>
                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Total Cash Amount (₹)</label>
                    <input type="number" step="0.01" value={batchForm.total_cash_amt || ""}
                      onFocus={(e) => e.target.select()} placeholder="0"
                      onChange={(e) => setBatchForm(f => ({ ...f, total_cash_amt: parseFloat(e.target.value) || 0 }))}
                      className="border border-line rounded-lg2 px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                  <div>
                    <label className="text-xs text-ink-dim block mb-1">Cash Paid Now (₹)</label>
                    <input type="number" step="0.01" value={batchForm.cash_paid_now || ""}
                      onFocus={(e) => e.target.select()} placeholder="0"
                      onChange={(e) => setBatchForm(f => ({ ...f, cash_paid_now: parseFloat(e.target.value) || 0 }))}
                      className="border border-line rounded-lg2 px-2 py-1.5 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-gold" />
                  </div>
                  {batchForm.total_cash_amt > 0 && (
                    <div>
                      <label className="text-xs text-ink-dim block mb-1">Balance</label>
                      <p className={`text-sm font-mono font-semibold ${balance > 0 ? "text-err" : "text-ok"}`}>{inr(balance)}</p>
                    </div>
                  )}
                  <button
                    disabled={confirmBatch.isPending}
                    onClick={async () => {
                      await confirmBatch.mutateAsync({
                        items: sel.map((s: any) => ({ id: s.id, gross_wt: Number(s.gross_wt) || 0 })),
                        supplierId: id, total_cash_amt: batchForm.total_cash_amt,
                        cash_paid_now: batchForm.cash_paid_now, pay_date: globalDate,
                      });
                      setSelectedSuspense(new Set());
                      setBatchForm({ total_cash_amt: 0, cash_paid_now: 0 });
                    }}
                    className="ml-auto bg-gold text-white text-xs px-4 py-1.5 rounded-lg2 disabled:opacity-40">
                    Settle {selectedSuspense.size} Items
                  </button>
                </div>
              </div>
            );
          })()}

          {metalOwedG > 0 && (
            <div className="bg-canvas rounded-xl border border-line px-4 py-3 flex justify-between text-sm">
              <span className="text-ink-dim">Total metal owed to supplier</span>
              <span className="font-mono font-semibold text-err">{grams(metalOwedG)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
