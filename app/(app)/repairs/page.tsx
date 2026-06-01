"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { inr, shortDate } from "@/lib/format";
import { fyForDate, billNoFor } from "@/lib/fy";
import { compressImage, storagePath } from "@/lib/compress-image";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const STATUS_LABELS: Record<string, string> = {
  received:       "Received",
  sent_to_aasari: "With Goldsmith",
  got_back:       "Ready",
  delivered:      "Delivered",
};
const STATUS_COLORS: Record<string, string> = {
  received:       "bg-info/10 text-info border-info/20",
  sent_to_aasari: "bg-warn/10 text-warn border-warn/20",
  got_back:       "bg-ok/10 text-ok border-ok/20",
  delivered:      "bg-canvas text-ink-dim border-line",
};
const STATUS_FLOW: Record<string, string | null> = {
  received:       "sent_to_aasari",
  sent_to_aasari: "got_back",
  got_back:       "delivered",
  delivered:      null,
};

type Repair = {
  id: string;
  repair_no: string;
  customer_name: string;
  customer_phone: string | null;
  item_description: string;
  item_weight_in: number | null;
  in_date: string;
  estimated_out_date: string | null;
  repair_details: string | null;
  estimated_charge: number | null;
  status: string;
  photo_url: string | null;
  assigned_to: string | null;
  received_by: string | null;
  delivery_weight: number | null;
  final_amount: number | null;
  payment_mode: string | null;
  delivered_at: string | null;
  notes: string | null;
  signature_url: string | null;
  goldsmith_type: string | null;
  goldsmith_name: string | null;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  paid_mode: string | null;
  paid_at: string | null;
  created_at: string;
};

// Stage history for a single repair (lazy-loaded on expand)
function useRepairHistory(repairId: string | null) {
  return useQuery({
    queryKey: ["repair_history", repairId],
    enabled: !!repairId,
    queryFn: async () => {
      const { data } = await supabase()
        .from("repair_stage_history")
        .select("*")
        .eq("repair_id", repairId!)
        .order("created_at");
      return (data ?? []) as any[];
    },
  });
}

// Repairs needing attention: ready-for-pickup + overdue stages (>24h)
function useRepairAlerts() {
  return useQuery({
    queryKey: ["repair_alerts"],
    refetchInterval: 2 * 60 * 1000,
    queryFn: async () => {
      const client = supabase();
      const { data: repairs } = await client
        .from("repairs")
        .select("id, repair_no, customer_name, customer_phone, status, created_at")
        .not("status", "eq", "delivered")
        .order("created_at");
      if (!repairs?.length) return { ready: [] as any[], overdue: [] as any[] };
      const ids = (repairs as any[]).map((r: any) => r.id);
      const { data: hist } = await client
        .from("repair_stage_history")
        .select("repair_id, created_at")
        .in("repair_id", ids)
        .order("created_at", { ascending: false });
      const latestMap = new Map<string, string>();
      for (const h of (hist ?? []) as any[]) {
        if (!latestMap.has(h.repair_id)) latestMap.set(h.repair_id, h.created_at);
      }
      const now = Date.now();
      const ready: any[] = [], overdue: any[] = [];
      for (const r of repairs as any[]) {
        if (r.status === "got_back") { ready.push(r); continue; }
        const last = latestMap.get(r.id) ?? r.created_at;
        const hrs = (now - new Date(last).getTime()) / 3_600_000;
        if (hrs >= 24) overdue.push({ ...r, hours: Math.floor(hrs) });
      }
      return { ready, overdue };
    },
  });
}

function useRepairs() {
  return useQuery<Repair[]>({
    queryKey: ["repairs"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("repairs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Repair[];
    },
  });
}

function useStaffList() {
  return useQuery<{ bio_user_id: string; name: string }[]>({
    queryKey: ["staff-simple"],
    queryFn: async () => {
      const { data } = await supabase().from("staff").select("bio_user_id, name").eq("active", true).order("name");
      return (data ?? []) as any[];
    },
  });
}

async function nextRepairNo(fy: string): Promise<string> {
  const prefix = `RPR/${fy}/`;
  const { data } = await supabase()
    .from("repairs")
    .select("repair_no")
    .like("repair_no", `${prefix}%`);
  const n = (data?.length ?? 0) + 1;
  return billNoFor("RPR", fy, n);
}

export default function RepairsPage() {
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin";
  const canAccess = isAdmin || profile?.repair_access === true;

  const { data: repairs = [], isLoading } = useRepairs();
  const { data: staff = [] } = useStaffList();
  const qc = useQueryClient();

  const staffName = (bioId: string | null) =>
    staff.find((s) => s.bio_user_id === bioId)?.name ?? bioId ?? "—";

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // New/edit form
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "",
    item_description: "", item_weight_in: "",
    in_date: today, estimated_out_date: "",
    repair_details: "", estimated_charge: "",
    assigned_to: "", received_by: "",
    notes: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Delivery form
  const [deliverRepairId, setDeliverRepairId] = useState<string | null>(null);
  const [deliveryForm, setDeliveryForm] = useState({
    delivery_weight: "", final_amount: "",
    payment_mode: "cash", delivered_at: today,
  });

  // Print
  const [printRepair, setPrintRepair] = useState<Repair | null>(null);

  // Signature pad
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawing = useRef(false);
  const sigLastPos = useRef<{ x: number; y: number } | null>(null);

  function sigGetPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = sigCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }
  function sigStart(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    sigDrawing.current = true;
    sigLastPos.current = sigGetPos(e);
  }
  function sigMove(e: React.TouchEvent | React.MouseEvent) {
    e.preventDefault();
    if (!sigDrawing.current || !sigCanvasRef.current) return;
    const ctx = sigCanvasRef.current.getContext("2d")!;
    const pos = sigGetPos(e);
    ctx.beginPath();
    ctx.moveTo(sigLastPos.current!.x, sigLastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    sigLastPos.current = pos;
  }
  function sigEnd() { sigDrawing.current = false; sigLastPos.current = null; }
  function sigClear() {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }
  function sigHasContent() {
    const canvas = sigCanvasRef.current;
    if (!canvas) return false;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) { if (data[i] > 10) return true; }
    return false;
  }

  // Detail expand + stage history
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: stageHistory = [] } = useRepairHistory(expandedId);
  const { data: alerts } = useRepairAlerts();

  // Goldsmith form shown when advancing to "sent_to_aasari"
  const [goldsmithPending, setGoldsmithPending] = useState<{ repairId: string; fromStatus: string } | null>(null);
  const [goldsmithForm, setGoldsmithForm] = useState({ type: "external" as "internal" | "external", name: "", notes: "" });

  // Payment collection
  const [paymentRepairId, setPaymentRepairId] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", mode: "cash" as "cash" | "upi" | "bank", date: today });
  const [payError, setPayError] = useState<string | null>(null);

  const recordPayment = useMutation({
    mutationFn: async ({ repair }: { repair: Repair }) => {
      const amt = parseFloat(payForm.amount) || 0;
      if (amt <= 0) throw new Error("Enter a valid amount");
      const client = supabase();
      const newPaid = (repair.paid_amount ?? 0) + amt;
      const effectiveTotal = repair.final_amount ?? repair.estimated_charge ?? 0;
      const newStatus: "partial" | "paid" = effectiveTotal > 0 && newPaid >= effectiveTotal ? "paid" : "partial";
      await client.from("repairs").update({
        paid_amount: newPaid,
        paid_mode: payForm.mode,
        paid_at: new Date(payForm.date).toISOString(),
        payment_status: newStatus,
      }).eq("id", repair.id);
      // Record in cash/bank ledger so it appears in the daily cash book
      const desc = `Repair payment — ${repair.repair_no}`;
      if (payForm.mode === "cash") {
        await client.from("cash_ledger").insert({
          tx_date: payForm.date, direction: "in", amount: amt,
          description: desc, ref_type: "repair", ref_id: repair.id,
        });
      } else {
        await client.from("bank_ledger").insert({
          tx_date: payForm.date, direction: "in", amount: amt,
          description: desc, ref_type: "repair", ref_id: repair.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      setPaymentRepairId(null);
      setPayForm({ amount: "", mode: "cash", date: today });
      setPayError(null);
    },
    onError: (e: any) => setPayError(e.message),
  });

  function openNew() {
    setEditId(null);
    setForm({ customer_name: "", customer_phone: "", item_description: "", item_weight_in: "",
      in_date: today, estimated_out_date: "", repair_details: "", estimated_charge: "",
      assigned_to: "", received_by: "", notes: "" });
    setPhotoFile(null); setPhotoPreview(null);
    setShowForm(true);
  }

  function openEdit(r: Repair) {
    setEditId(r.id);
    setForm({
      customer_name: r.customer_name, customer_phone: r.customer_phone ?? "",
      item_description: r.item_description, item_weight_in: r.item_weight_in?.toString() ?? "",
      in_date: r.in_date, estimated_out_date: r.estimated_out_date ?? "",
      repair_details: r.repair_details ?? "", estimated_charge: r.estimated_charge?.toString() ?? "",
      assigned_to: r.assigned_to ?? "", received_by: r.received_by ?? "",
      notes: r.notes ?? "",
    });
    setPhotoFile(null); setPhotoPreview(r.photo_url);
    setShowForm(true);
  }

  const saveRepair = useMutation({
    mutationFn: async () => {
      if (!form.customer_name.trim() || !form.item_description.trim()) throw new Error("Name and item required");
      const client = supabase();
      let photo_url: string | null = null;

      if (photoFile) {
        // Delete existing photo first (1 photo per repair; free up storage)
        if (editId) {
          const existing = repairs.find((r) => r.id === editId);
          if (existing?.photo_url) {
            const oldPath = storagePath(existing.photo_url, "repair-photos");
            if (oldPath) await client.storage.from("repair-photos").remove([oldPath]);
          }
        }
        // Compress before upload (reduces ~3 MB → ~150 KB)
        const compressed = await compressImage(photoFile);
        const path = `repair-${editId ?? "new"}-${Date.now()}.jpg`;
        const { data: uploaded, error: upErr } = await client.storage
          .from("repair-photos").upload(path, compressed, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}. Ensure the "repair-photos" bucket exists in Supabase Storage and is set to Public.`);
        if (uploaded) {
          const { data: { publicUrl } } = client.storage.from("repair-photos").getPublicUrl(uploaded.path);
          photo_url = publicUrl;
        }
      }

      const payload: any = {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        item_description: form.item_description.trim(),
        item_weight_in: form.item_weight_in ? Number(form.item_weight_in) : null,
        in_date: form.in_date,
        estimated_out_date: form.estimated_out_date || null,
        repair_details: form.repair_details.trim() || null,
        estimated_charge: form.estimated_charge ? Number(form.estimated_charge) : null,
        assigned_to: form.assigned_to || null,
        received_by: form.received_by || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (photo_url) payload.photo_url = photo_url;

      if (editId) {
        const { error } = await client.from("repairs").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const fy = fyForDate(form.in_date);
        payload.repair_no = await nextRepairNo(fy);
        payload.status = "received";
        const { data: newRepair, error } = await client.from("repairs").insert(payload).select("id").single();
        if (error) throw error;
        // Record initial stage
        await client.from("repair_stage_history").insert({
          repair_id: newRepair.id, from_status: null, to_status: "received",
          changed_by: profile?.display_name ?? "Admin",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      setShowForm(false); setEditId(null);
    },
  });

  const advanceStatus = useMutation({
    mutationFn: async ({ id, fromStatus, newStatus, gsType, gsName, notes }: {
      id: string; fromStatus: string; newStatus: string;
      gsType?: string; gsName?: string; notes?: string;
    }) => {
      const client = supabase();
      const patch: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (gsType) { patch.goldsmith_type = gsType; patch.goldsmith_name = gsName || null; }
      const { error } = await client.from("repairs").update(patch).eq("id", id);
      if (error) throw error;
      await client.from("repair_stage_history").insert({
        repair_id: id, from_status: fromStatus, to_status: newStatus,
        changed_by: profile?.display_name ?? "Admin",
        goldsmith_type: gsType || null, goldsmith_name: gsName || null,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["repair_alerts"] });
      qc.invalidateQueries({ queryKey: ["repair_alert_count"] });
      qc.invalidateQueries({ queryKey: ["repair_history", expandedId] });
    },
  });

  const saveDelivery = useMutation({
    mutationFn: async () => {
      if (!deliverRepairId) return;
      const client = supabase();
      let signature_url: string | null = null;

      if (sigHasContent() && sigCanvasRef.current) {
        const dataUrl = sigCanvasRef.current.toDataURL("image/png");
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const path = `${deliverRepairId}-sig.png`;
        const { data: uploaded, error: upErr } = await client.storage
          .from("repair-photos").upload(path, blob, { upsert: true, contentType: "image/png" });
        if (!upErr && uploaded) {
          const { data: { publicUrl } } = client.storage.from("repair-photos").getPublicUrl(uploaded.path);
          signature_url = publicUrl;
        }
      }

      const update: any = {
        status: "delivered",
        delivery_weight: deliveryForm.delivery_weight ? Number(deliveryForm.delivery_weight) : null,
        final_amount: deliveryForm.final_amount ? Number(deliveryForm.final_amount) : null,
        payment_mode: deliveryForm.payment_mode || null,
        delivered_at: deliveryForm.delivered_at || today,
        updated_at: new Date().toISOString(),
      };
      if (signature_url) update.signature_url = signature_url;

      const { error } = await client.from("repairs").update(update).eq("id", deliverRepairId);
      if (error) throw error;
      const fromR = repairs.find(r => r.id === deliverRepairId);
      await client.from("repair_stage_history").insert({
        repair_id: deliverRepairId, from_status: fromR?.status ?? "got_back", to_status: "delivered",
        changed_by: profile?.display_name ?? "Admin",
      });
      // Signature captured → delete the item photo to free storage
      if (sigHasContent() && fromR?.photo_url) {
        const oldPath = storagePath(fromR.photo_url, "repair-photos");
        if (oldPath) {
          await client.storage.from("repair-photos").remove([oldPath]);
          await client.from("repairs").update({ photo_url: null }).eq("id", deliverRepairId);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["repair_alerts"] });
      qc.invalidateQueries({ queryKey: ["repair_alert_count"] });
      setDeliverRepairId(null);
      sigClear();
    },
  });

  const deleteRepair = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("repairs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }),
  });

  if (!canAccess) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <p className="text-2xl mb-2">🔒</p>
        <p className="text-ink font-semibold">Access Restricted</p>
        <p className="text-ink-dim text-sm mt-1">Ask an admin to enable Repair access for your account.</p>
      </div>
    );
  }

  const filtered = repairs.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.customer_name.toLowerCase().includes(q) ||
        (r.customer_phone ?? "").includes(q) ||
        r.repair_no.toLowerCase().includes(q) ||
        r.item_description.toLowerCase().includes(q);
    }
    return true;
  });

  const statusCounts: Record<string, number> = { all: repairs.length };
  for (const r of repairs) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  const deliverRepair = repairs.find((r) => r.id === deliverRepairId);

  return (
    <>
      {/* ── Print layout (only visible during window.print()) ── */}
      {printRepair && (
        <div id="repair-print" className="hidden print:block">
          <style>{`
            @media print {
              body > * { display: none !important; }
              #repair-print { display: block !important; }
              @page { margin: 8mm; size: 80mm auto; }
            }
          `}</style>
          <div style={{ fontFamily: "monospace", fontSize: 11, width: "100%", maxWidth: 300 }}>
            <div style={{ textAlign: "center", borderBottom: "1px dashed #000", paddingBottom: 6, marginBottom: 6 }}>
              <div style={{ fontWeight: "bold", fontSize: 13 }}>SABARINATHAN JEWELLERY</div>
              <div style={{ fontSize: 10 }}>Repair Receipt</div>
            </div>
            <div style={{ marginBottom: 4 }}>
              <b>Repair No:</b> {printRepair.repair_no}
            </div>
            <div><b>Date In:</b> {shortDate(printRepair.in_date)}</div>
            {printRepair.estimated_out_date && (
              <div><b>Est. Out:</b> {shortDate(printRepair.estimated_out_date)}</div>
            )}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div><b>Customer:</b> {printRepair.customer_name}</div>
            {printRepair.customer_phone && <div><b>Phone:</b> {printRepair.customer_phone}</div>}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div><b>Item:</b> {printRepair.item_description}</div>
            {printRepair.item_weight_in != null && (
              <div><b>Weight In:</b> {printRepair.item_weight_in.toFixed(3)}g</div>
            )}
            {printRepair.repair_details && (
              <div style={{ marginTop: 4 }}><b>Repair:</b><br />{printRepair.repair_details}</div>
            )}
            {printRepair.estimated_charge != null && (
              <div style={{ marginTop: 4 }}><b>Est. Charge:</b> {inr(printRepair.estimated_charge)}</div>
            )}
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            <div><b>Status:</b> {STATUS_LABELS[printRepair.status]}</div>
            {printRepair.status === "delivered" && (
              <>
                {printRepair.delivery_weight != null && (
                  <div><b>Weight Out:</b> {printRepair.delivery_weight.toFixed(3)}g
                    {printRepair.item_weight_in != null && ` (in: ${printRepair.item_weight_in.toFixed(3)}g)`}
                  </div>
                )}
                {printRepair.final_amount != null && <div><b>Final Amount:</b> {inr(printRepair.final_amount)}</div>}
                {printRepair.payment_mode && <div><b>Paid via:</b> {printRepair.payment_mode.toUpperCase()}</div>}
                {printRepair.signature_url && (
                  <div style={{ marginTop: 6 }}>
                    <div><b>Customer Signature:</b></div>
                    <img src={printRepair.signature_url} alt="Signature"
                      style={{ maxHeight: 60, marginTop: 4, border: "1px solid #ccc" }} />
                  </div>
                )}
              </>
            )}
            {printRepair.received_by && (
              <div style={{ marginTop: 4 }}><b>Received by:</b> {staffName(printRepair.received_by)}</div>
            )}
            {printRepair.assigned_to && (
              <div><b>Assigned to:</b> {staffName(printRepair.assigned_to)}</div>
            )}
            <div style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
            <div style={{ textAlign: "center", fontSize: 10 }}>
              Thank you — Please keep this receipt
            </div>
          </div>
        </div>
      )}

      {/* Goldsmith form modal */}
      {goldsmithPending && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-soft p-5 w-full max-w-sm space-y-4">
            <h3 className="text-sm font-semibold text-ink">Send to Goldsmith</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-ink-dim block mb-1">Work type</label>
                <div className="flex gap-3">
                  {(["internal", "external"] as const).map(t => (
                    <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" checked={goldsmithForm.type === t} onChange={() => setGoldsmithForm(f => ({ ...f, type: t }))} />
                      {t === "internal" ? "Internal (shop staff)" : "External goldsmith"}
                    </label>
                  ))}
                </div>
              </div>
              {goldsmithForm.type === "external" && (
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Goldsmith name</label>
                  <input value={goldsmithForm.name} onChange={e => setGoldsmithForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Name of goldsmith (aasari)"
                    className={inp} autoFocus />
                </div>
              )}
              <div>
                <label className="text-xs text-ink-dim block mb-1">Notes (optional)</label>
                <input value={goldsmithForm.notes} onChange={e => setGoldsmithForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any special instructions"
                  className={inp} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                disabled={advanceStatus.isPending}
                onClick={() => {
                  advanceStatus.mutate({
                    id: goldsmithPending.repairId,
                    fromStatus: goldsmithPending.fromStatus,
                    newStatus: "sent_to_aasari",
                    gsType: goldsmithForm.type,
                    gsName: goldsmithForm.name,
                    notes: goldsmithForm.notes,
                  });
                  setGoldsmithPending(null);
                  setGoldsmithForm({ type: "external", name: "", notes: "" });
                }}
                className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2 disabled:opacity-50">
                {advanceStatus.isPending ? "Sending…" : "Confirm"}
              </button>
              <button onClick={() => setGoldsmithPending(null)}
                className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main page ── */}
      <div className="max-w-5xl mx-auto space-y-5 print:hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink">Repairs</h1>
            <p className="text-xs text-ink-dim mt-0.5">{repairs.filter(r => r.status !== "delivered").length} active</p>
          </div>
          {isAdmin && (
            <button onClick={openNew}
              className="bg-gold text-white text-sm px-4 py-2 rounded-lg2 font-medium">
              + New Repair
            </button>
          )}
        </div>

        {/* Alert panel */}
        {((alerts?.ready?.length ?? 0) > 0 || (alerts?.overdue?.length ?? 0) > 0) && (
          <div className="space-y-2">
            {(alerts?.ready ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 bg-ok/5 border border-ok/30 rounded-lg2 px-4 py-2.5">
                <span className="text-base">🔔</span>
                <div className="flex-1 text-sm">
                  <span className="font-semibold text-ok">Ready for pickup — </span>
                  <span className="text-ink">{r.customer_name}</span>
                  <span className="text-ink-dim ml-1.5 text-xs">{r.repair_no}</span>
                  {r.customer_phone && (
                    <a href={`tel:${r.customer_phone}`} className="ml-2 text-xs text-gold hover:underline">{r.customer_phone}</a>
                  )}
                </div>
                <span className="text-xs text-ok font-medium whitespace-nowrap">Call customer</span>
              </div>
            ))}
            {(alerts?.overdue ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 bg-warn/5 border border-warn/30 rounded-lg2 px-4 py-2.5">
                <span className="text-base">⏰</span>
                <div className="flex-1 text-sm">
                  <span className="font-semibold text-warn">Overdue {r.hours}h — </span>
                  <span className="text-ink">{r.customer_name}</span>
                  <span className="text-ink-dim ml-1.5 text-xs">{r.repair_no} · {STATUS_LABELS[r.status]}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {(["all", "received", "sent_to_aasari", "got_back", "delivered"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                statusFilter === s
                  ? "bg-gold text-white border-gold"
                  : "border-line text-ink-dim hover:text-ink"
              }`}>
              {s === "all" ? "All" : STATUS_LABELS[s]} {statusCounts[s] ? `(${statusCounts[s]})` : ""}
            </button>
          ))}
          <input
            type="search"
            placeholder="Search name, phone, repair no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto border border-line rounded-lg2 px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold"
            style={{ minWidth: 200 }}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-ink-dim text-sm">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-line p-12 text-center text-ink-dim">
            No repairs found
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 700 }}>
              <thead>
                <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                  <th className="text-left px-4 py-2.5">Repair No</th>
                  <th className="text-left px-3 py-2.5">Customer</th>
                  <th className="text-left px-3 py-2.5">Item</th>
                  <th className="text-left px-3 py-2.5">In Date</th>
                  <th className="text-left px-3 py-2.5">Est. Out</th>
                  <th className="text-left px-3 py-2.5">Status</th>
                  <th className="text-left px-3 py-2.5">Assigned</th>
                  <th className="text-right px-3 py-2.5">Est. ₹</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <>
                    <tr
                      key={r.id}
                      className="border-b border-line hover:bg-canvas/50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-gold">
                        {r.repair_no}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.customer_name}</div>
                        {r.customer_phone && <div className="text-xs text-ink-dim">{r.customer_phone}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-sm max-w-[180px]">
                        <div className="truncate">{r.item_description}</div>
                        {r.item_weight_in != null && (
                          <div className="text-xs text-ink-dim">{r.item_weight_in.toFixed(3)}g in</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-dim">{shortDate(r.in_date)}</td>
                      <td className="px-3 py-2.5 text-xs text-ink-dim">
                        {r.estimated_out_date ? shortDate(r.estimated_out_date) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border w-fit ${STATUS_COLORS[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </span>
                          {r.payment_status === "paid" ? (
                            <span className="text-[10px] font-semibold text-ok">✓ Paid</span>
                          ) : r.payment_status === "partial" ? (
                            <span className="text-[10px] font-semibold text-warn">Partial {inr(r.paid_amount)}</span>
                          ) : r.estimated_charge ? (
                            <span className="text-[10px] text-ink-dim">Unpaid</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-dim">
                        {r.assigned_to ? staffName(r.assigned_to) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">
                        {r.estimated_charge != null ? inr(r.estimated_charge) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setPrintRepair(r); setTimeout(() => window.print(), 100); }}
                            className="text-xs text-ink-dim hover:text-ink"
                            title="Print">🖨️</button>
                          {isAdmin && (
                            <>
                              <button onClick={() => openEdit(r)}
                                className="text-xs text-gold hover:underline">Edit</button>
                              <button onClick={() => {
                                if (confirm(`Delete ${r.repair_no}?`)) deleteRepair.mutate(r.id);
                              }} className="text-xs text-err hover:underline">Del</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {expandedId === r.id && (
                      <tr key={`${r.id}-exp`} className="border-b border-line bg-canvas/30">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left: details */}
                            <div className="space-y-3 text-sm">
                              {r.repair_details && (
                                <div>
                                  <p className="text-xs text-ink-dim font-medium mb-0.5">Repair Details</p>
                                  <p className="text-ink">{r.repair_details}</p>
                                </div>
                              )}
                              {r.notes && (
                                <div>
                                  <p className="text-xs text-ink-dim font-medium mb-0.5">Notes</p>
                                  <p className="text-ink">{r.notes}</p>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-4 text-xs">
                                <div>
                                  <span className="text-ink-dim">Received by: </span>
                                  <span>{r.received_by ? staffName(r.received_by) : "—"}</span>
                                </div>
                                <div>
                                  <span className="text-ink-dim">Assigned to: </span>
                                  <span>{r.assigned_to ? staffName(r.assigned_to) : "—"}</span>
                                </div>
                              </div>
                              {r.status === "delivered" && (
                                <div className="bg-ok/5 border border-ok/20 rounded-lg p-3 space-y-2 text-xs">
                                  <p className="font-medium text-ok">Delivered</p>
                                  {r.delivered_at && <p>Date: {shortDate(r.delivered_at)}</p>}
                                  {r.delivery_weight != null && (
                                    <p>Weight out: <span className="font-semibold">{r.delivery_weight.toFixed(3)}g</span>
                                      {r.item_weight_in != null && (
                                        <span className="text-ink-dim ml-1">(in: {r.item_weight_in.toFixed(3)}g)</span>
                                      )}
                                    </p>
                                  )}
                                  {r.final_amount != null && <p>Final amount: {inr(r.final_amount)}</p>}
                                  {r.payment_mode && <p>Paid via: {r.payment_mode.toUpperCase()}</p>}
                                  {r.signature_url && (
                                    <div>
                                      <p className="text-ink-dim mb-1">Customer signature:</p>
                                      <img src={r.signature_url} alt="Signature"
                                        className="max-h-20 border border-line rounded bg-white p-1" />
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Goldsmith info */}
                              {(r.goldsmith_type || r.goldsmith_name) && (
                                <div className="text-xs text-ink-dim">
                                  <span className="font-medium text-ink">Goldsmith: </span>
                                  {r.goldsmith_type === "internal" ? "Internal work" : r.goldsmith_name || "External"}
                                </div>
                              )}
                              {/* Stage history */}
                              {stageHistory.length > 0 && expandedId === r.id && (
                                <div>
                                  <p className="text-xs font-medium text-ink-dim mb-1">Stage History</p>
                                  <div className="space-y-0.5">
                                    {stageHistory.map((h: any) => (
                                      <div key={h.id} className="flex items-start gap-2 text-xs text-ink-dim">
                                        <span className="text-[10px] text-ink-dim/60 w-28 shrink-0">
                                          {new Date(h.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                        <span>
                                          {h.from_status ? `${STATUS_LABELS[h.from_status] ?? h.from_status} → ` : ""}
                                          <span className="text-ink font-medium">{STATUS_LABELS[h.to_status] ?? h.to_status}</span>
                                          {h.changed_by && <span className="text-ink-dim/70"> by {h.changed_by}</span>}
                                          {h.goldsmith_name && <span className="text-ink-dim"> · {h.goldsmith_name}</span>}
                                          {h.notes && <span className="text-ink-dim"> · {h.notes}</span>}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Payment collection */}
                              <div className="border border-line rounded-lg2 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs">
                                    <span className="font-medium text-ink">Payment — </span>
                                    {r.payment_status === "paid" ? (
                                      <span className="text-ok font-semibold">✓ Paid {inr(r.paid_amount)} via {r.paid_mode}</span>
                                    ) : r.payment_status === "partial" ? (
                                      <span className="text-warn font-semibold">Partial: {inr(r.paid_amount)} of {inr(r.estimated_charge ?? 0)}</span>
                                    ) : (
                                      <span className="text-err font-medium">Unpaid</span>
                                    )}
                                    {r.estimated_charge != null && r.payment_status !== "paid" && (
                                      <span className="text-ink-dim ml-1.5">Charge: {inr(r.estimated_charge)}</span>
                                    )}
                                  </div>
                                  {r.payment_status !== "paid" && paymentRepairId !== r.id && (
                                    <button
                                      onClick={() => {
                                        setPaymentRepairId(r.id);
                                        const remaining = Math.max(0, (r.estimated_charge ?? 0) - (r.paid_amount ?? 0));
                                        setPayForm({ amount: remaining > 0 ? String(remaining) : "", mode: "cash", date: today });
                                        setPayError(null);
                                      }}
                                      className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2">
                                      + Collect Payment
                                    </button>
                                  )}
                                </div>
                                {paymentRepairId === r.id && (
                                  <div className="bg-canvas rounded-lg2 p-2 space-y-2 border border-line">
                                    <div className="flex flex-wrap gap-2 items-end">
                                      <div>
                                        <label className="text-xs text-ink-dim block mb-1">Amount (₹) *</label>
                                        <input type="number" step="0.01" min="0"
                                          value={payForm.amount}
                                          onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                                          onFocus={e => e.target.select()}
                                          className="w-28 border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
                                          autoFocus placeholder="0" />
                                      </div>
                                      <div>
                                        <label className="text-xs text-ink-dim block mb-1">Mode</label>
                                        <select value={payForm.mode}
                                          onChange={e => setPayForm(f => ({ ...f, mode: e.target.value as any }))}
                                          className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold">
                                          <option value="cash">Cash</option>
                                          <option value="upi">UPI / GPay</option>
                                          <option value="bank">Bank Transfer</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-xs text-ink-dim block mb-1">Date</label>
                                        <input type="date" value={payForm.date}
                                          onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))}
                                          className="border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-36" />
                                      </div>
                                    </div>
                                    {payError && <p className="text-xs text-err">{payError}</p>}
                                    <div className="flex gap-2">
                                      <button
                                        disabled={recordPayment.isPending}
                                        onClick={() => recordPayment.mutate({ repair: r })}
                                        className="text-xs bg-ok text-white px-3 py-1.5 rounded-lg2 disabled:opacity-50">
                                        {recordPayment.isPending ? "Saving…" : "Save Payment"}
                                      </button>
                                      <button onClick={() => { setPaymentRepairId(null); setPayError(null); }}
                                        className="text-xs border border-line px-3 py-1.5 rounded-lg2">Cancel</button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Status advance buttons */}
                              {r.status !== "delivered" && (
                                <div className="flex items-center gap-2 pt-1">
                                  {STATUS_FLOW[r.status] === "delivered" ? (
                                    <button
                                      onClick={() => {
                                        setDeliverRepairId(r.id);
                                        setDeliveryForm({ delivery_weight: "", final_amount: "",
                                          payment_mode: "cash", delivered_at: today });
                                      }}
                                      className="bg-ok text-white text-xs px-3 py-1.5 rounded-lg2">
                                      Mark as Delivered
                                    </button>
                                  ) : STATUS_FLOW[r.status] === "sent_to_aasari" ? (
                                    <button
                                      onClick={() => {
                                        setGoldsmithPending({ repairId: r.id, fromStatus: r.status });
                                        setGoldsmithForm({ type: "external", name: "", notes: "" });
                                      }}
                                      className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2">
                                      → {STATUS_LABELS["sent_to_aasari"]}
                                    </button>
                                  ) : STATUS_FLOW[r.status] ? (
                                    <button
                                      onClick={() => advanceStatus.mutate({
                                        id: r.id, fromStatus: r.status, newStatus: STATUS_FLOW[r.status]!,
                                      })}
                                      className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg2">
                                      → {STATUS_LABELS[STATUS_FLOW[r.status]!]}
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                            {/* Right: photo */}
                            <div>
                              {r.photo_url ? (
                                <a href={r.photo_url} target="_blank" rel="noreferrer">
                                  <img src={r.photo_url} alt="Item"
                                    className="max-h-48 w-full rounded-lg border border-line object-contain bg-canvas" />
                                </a>
                              ) : (
                                <div className="h-32 rounded-lg border border-line border-dashed flex items-center justify-center text-ink-dim text-xs">
                                  No photo
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New / Edit modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-soft w-full max-w-xl mx-4 p-6 space-y-4">
            <h2 className="text-base font-bold text-ink">{editId ? "Edit Repair" : "New Repair"}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Customer Name *</label>
                <input className={inp} value={form.customer_name}
                  onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Phone</label>
                <input className={inp} value={form.customer_phone}
                  onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">In Date</label>
                <input type="date" className={inp} value={form.in_date}
                  onChange={(e) => setForm((f) => ({ ...f, in_date: e.target.value }))} />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Item Description *</label>
                <input className={inp} placeholder="e.g. Gold chain 22k" value={form.item_description}
                  onChange={(e) => setForm((f) => ({ ...f, item_description: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Item Weight (g)</label>
                <input type="number" step="0.001" className={inp} value={form.item_weight_in}
                  onChange={(e) => setForm((f) => ({ ...f, item_weight_in: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Est. Charge (₹)</label>
                <input type="number" className={inp} value={form.estimated_charge}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_charge: e.target.value }))} />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Repair Details</label>
                <textarea rows={2} className={inp} value={form.repair_details}
                  onChange={(e) => setForm((f) => ({ ...f, repair_details: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Est. Out Date</label>
                <input type="date" className={inp} value={form.estimated_out_date}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_out_date: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Received By</label>
                <select className={inp} value={form.received_by}
                  onChange={(e) => setForm((f) => ({ ...f, received_by: e.target.value }))}>
                  <option value="">— Select —</option>
                  {staff.map((s) => <option key={s.bio_user_id} value={s.bio_user_id}>{s.name}</option>)}
                </select>
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-ink-dim">Assign To</label>
                  <select className={inp} value={form.assigned_to}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">— Unassigned —</option>
                    {staff.map((s) => <option key={s.bio_user_id} value={s.bio_user_id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div className={`flex flex-col gap-1 ${isAdmin ? "" : "col-span-2"}`}>
                <label className="text-xs text-ink-dim">Notes</label>
                <input className={inp} value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              {/* Photo — 1 per repair, compressed on upload */}
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-xs text-ink-dim">
                  Item Photo <span className="text-ink-dim/60">(1 per repair · auto-compressed)</span>
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {!photoPreview ? (
                    <>
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="border border-line rounded-lg2 px-3 py-2 text-xs text-ink-dim hover:text-ink">
                        📁 Gallery
                      </button>
                      <button type="button" onClick={() => cameraInputRef.current?.click()}
                        className="border border-line rounded-lg2 px-3 py-2 text-xs text-ink-dim hover:text-ink">
                        📷 Camera
                      </button>
                    </>
                  ) : (
                    <>
                      <img src={photoPreview} alt="Preview"
                        className="h-14 w-14 object-cover rounded-lg border border-line" />
                      <button type="button" onClick={() => cameraInputRef.current?.click()}
                        className="border border-line rounded-lg2 px-2 py-1 text-xs text-gold hover:underline">
                        Replace
                      </button>
                      <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                        className="text-xs text-err hover:underline">Remove</button>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
                    }} />
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); }
                    }} />
                </div>
              </div>
            </div>

            {saveRepair.isError && (
              <p className="text-xs text-err">{String((saveRepair.error as any)?.message ?? "Error saving")}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => saveRepair.mutate()}
                disabled={saveRepair.isPending}
                className="flex-1 bg-gold text-white py-2 rounded-lg2 text-sm font-medium disabled:opacity-50">
                {saveRepair.isPending ? "Saving…" : editId ? "Save Changes" : "Create Repair"}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); }}
                className="flex-1 border border-line py-2 rounded-lg2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delivery modal ── */}
      {deliverRepairId && deliverRepair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-soft w-full max-w-md mx-4 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-ink">Deliver — {deliverRepair.repair_no}</h2>
              <p className="text-xs text-ink-dim mt-0.5">{deliverRepair.customer_name} · {deliverRepair.item_description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Delivery Date</label>
                <input type="date" className={inp} value={deliveryForm.delivered_at}
                  onChange={(e) => setDeliveryForm((f) => ({ ...f, delivered_at: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-ink">Return Weight (g) *</label>
                <input type="number" step="0.001" className={inp + " border-gold/60 focus:ring-gold"}
                  placeholder="0.000"
                  value={deliveryForm.delivery_weight}
                  onChange={(e) => setDeliveryForm((f) => ({ ...f, delivery_weight: e.target.value }))} />
                {deliverRepair.item_weight_in != null && (
                  <span className="text-[10px] text-ink-dim">Received: {deliverRepair.item_weight_in.toFixed(3)}g</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Final Amount (₹)</label>
                <input type="number" className={inp} value={deliveryForm.final_amount}
                  onChange={(e) => setDeliveryForm((f) => ({ ...f, final_amount: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink-dim">Payment Mode</label>
                <select className={inp} value={deliveryForm.payment_mode}
                  onChange={(e) => setDeliveryForm((f) => ({ ...f, payment_mode: e.target.value }))}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / GPay</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
            </div>

            {/* Signature pad */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink">Customer Signature</label>
                <button type="button" onClick={sigClear}
                  className="text-[10px] text-ink-dim hover:text-err">Clear</button>
              </div>
              <div className="border-2 border-line rounded-lg overflow-hidden bg-white touch-none"
                style={{ cursor: "crosshair" }}>
                <canvas
                  ref={sigCanvasRef}
                  width={400}
                  height={150}
                  className="w-full"
                  style={{ display: "block" }}
                  onMouseDown={sigStart}
                  onMouseMove={sigMove}
                  onMouseUp={sigEnd}
                  onMouseLeave={sigEnd}
                  onTouchStart={sigStart}
                  onTouchMove={sigMove}
                  onTouchEnd={sigEnd}
                />
              </div>
              <p className="text-[10px] text-ink-dim">Sign above with finger or stylus</p>
            </div>

            {saveDelivery.isError && (
              <p className="text-xs text-err">{String((saveDelivery.error as any)?.message ?? "Error")}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => saveDelivery.mutate()}
                disabled={saveDelivery.isPending}
                className="flex-1 bg-ok text-white py-2 rounded-lg2 text-sm font-medium disabled:opacity-50">
                {saveDelivery.isPending ? "Saving…" : "Confirm Delivery"}
              </button>
              <button onClick={() => { setDeliverRepairId(null); sigClear(); }}
                className="flex-1 border border-line py-2 rounded-lg2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
