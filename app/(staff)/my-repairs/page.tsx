"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { inr, shortDate } from "@/lib/format";
import { fyForDate, billNoFor } from "@/lib/fy";

const STATUS_LABELS: Record<string, string> = {
  received:       "Received",
  sent_to_aasari: "With Goldsmith",
  got_back:       "Ready",
  delivered:      "Delivered",
};

const STATUS_COLORS: Record<string, string> = {
  received:       "bg-info/10 text-info",
  sent_to_aasari: "bg-warn/10 text-warn",
  got_back:       "bg-ok/10 text-ok",
  delivered:      "bg-canvas text-ink-dim",
};

const STATUS_FLOW: Record<string, string | null> = {
  received:       "sent_to_aasari",
  sent_to_aasari: "got_back",
  got_back:       "delivered",
  delivered:      null,
};

const STATUS_ACTION: Record<string, string> = {
  received:       "Send to Goldsmith",
  sent_to_aasari: "Mark Ready",
  got_back:       "Deliver to Customer",
  delivered:      "",
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
  goldsmith_type: string | null;
  goldsmith_name: string | null;
  created_at: string;
};

type StaffInfo = { bio_user_id: string; name: string };

async function nextRepairNo(fy: string): Promise<string> {
  const prefix = `RPR/${fy}/`;
  const { data } = await supabase()
    .from("repairs")
    .select("repair_no")
    .like("repair_no", `${prefix}%`);
  const n = (data?.length ?? 0) + 1;
  return billNoFor("RPR", fy, n);
}

export default function MyRepairsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const inp = "border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

  const [staff, setStaff] = useState<StaffInfo | null>(null);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDelivered, setShowDelivered] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_name: "", customer_phone: "",
    item_description: "", item_weight_in: "",
    in_date: today, estimated_out_date: "",
    repair_details: "", estimated_charge: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [deliverForm, setDeliverForm] = useState({ final_amount: "", payment_mode: "cash", delivered_at: today });
  const [deliverError, setDeliverError] = useState<string | null>(null);

  // Stage history per expanded repair
  const [stageHistory, setStageHistory] = useState<any[]>([]);
  // Goldsmith form
  const [goldsmithPending, setGoldsmithPending] = useState<{ repairId: string; fromStatus: string } | null>(null);
  const [goldsmithForm, setGoldsmithForm] = useState({ type: "external" as "internal" | "external", name: "", notes: "" });

  async function handleLogout() {
    await supabase().auth.signOut();
  }

  useEffect(() => {
    const client = supabase();
    client.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setCanAccess(false); setLoading(false); return; }
      const [profileRes, staffRes] = await Promise.all([
        client.from("profiles").select("repair_access").eq("id", user.id).single(),
        client.from("staff").select("bio_user_id, name").single(),
      ]);
      if (profileRes.data) setCanAccess(profileRes.data.repair_access === true);
      else setCanAccess(false);
      if (staffRes.data) setStaff(staffRes.data as StaffInfo);
      setLoading(false);
    });
  }, []);

  async function loadRepairs() {
    const { data, error } = await supabase()
      .from("repairs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setRepairs((data ?? []) as Repair[]);
  }

  useEffect(() => {
    if (canAccess === true) loadRepairs();
    else if (canAccess === false) setLoading(false);
  }, [canAccess]);

  async function advanceStatus(repair: Repair, gsType?: string, gsName?: string, gsNotes?: string) {
    const next = STATUS_FLOW[repair.status];
    if (!next) return;
    if (next === "delivered") { setAdvancingId(repair.id); return; }
    if (next === "sent_to_aasari" && !gsType) {
      setGoldsmithPending({ repairId: repair.id, fromStatus: repair.status });
      setGoldsmithForm({ type: "external", name: "", notes: "" });
      return;
    }
    const client = supabase();
    const patch: any = { status: next, updated_at: new Date().toISOString() };
    if (gsType) { patch.goldsmith_type = gsType; patch.goldsmith_name = gsName || null; }
    const { error } = await client.from("repairs").update(patch).eq("id", repair.id);
    if (error) { setError(error.message); return; }
    await client.from("repair_stage_history").insert({
      repair_id: repair.id, from_status: repair.status, to_status: next,
      changed_by: staff?.name ?? "Staff",
      goldsmith_type: gsType || null, goldsmith_name: gsName || null,
      notes: gsNotes || null,
    });
    loadRepairs();
  }

  async function confirmDelivery(repair: Repair) {
    setDeliverError(null);
    if (!deliverForm.final_amount) { setDeliverError("Enter final amount"); return; }
    const { error } = await supabase()
      .from("repairs")
      .update({
        status: "delivered",
        final_amount: Number(deliverForm.final_amount),
        payment_mode: deliverForm.payment_mode,
        delivered_at: deliverForm.delivered_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", repair.id);
    if (error) { setDeliverError(error.message); return; }
    await supabase().from("repair_stage_history").insert({
      repair_id: repair.id, from_status: repair.status, to_status: "delivered",
      changed_by: staff?.name ?? "Staff",
    });
    setAdvancingId(null);
    setDeliverForm({ final_amount: "", payment_mode: "cash", delivered_at: today });
    loadRepairs();
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSaveRepair() {
    setFormError(null);
    if (!form.customer_name.trim() || !form.item_description.trim()) {
      setFormError("Customer name and item description are required.");
      return;
    }
    setSaving(true);
    const client = supabase();
    let photo_url: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop();
      const path = `repair-${Date.now()}.${ext}`;
      const { data: uploaded, error: upErr } = await client.storage
        .from("repair-photos").upload(path, photoFile, { upsert: true });
      if (upErr) {
        setSaving(false);
        setFormError(`Photo upload failed: ${upErr.message}. Check that the "repair-photos" bucket exists in Supabase Storage and is set to Public.`);
        return;
      }
      if (uploaded) {
        const { data: { publicUrl } } = client.storage.from("repair-photos").getPublicUrl(uploaded.path);
        photo_url = publicUrl;
      }
    }
    const fy = fyForDate(form.in_date);
    const repair_no = await nextRepairNo(fy);
    const { data: newRepair, error } = await client.from("repairs").insert({
      repair_no,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      item_description: form.item_description.trim(),
      item_weight_in: form.item_weight_in ? Number(form.item_weight_in) : null,
      in_date: form.in_date,
      estimated_out_date: form.estimated_out_date || null,
      repair_details: form.repair_details.trim() || null,
      estimated_charge: form.estimated_charge ? Number(form.estimated_charge) : null,
      received_by: staff?.bio_user_id ?? null,
      notes: form.notes.trim() || null,
      status: "received",
      photo_url,
    }).select("id").single();
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    if (newRepair) {
      await client.from("repair_stage_history").insert({
        repair_id: newRepair.id, from_status: null, to_status: "received",
        changed_by: staff?.name ?? "Staff",
      });
    }
    setShowForm(false);
    setForm({ customer_name: "", customer_phone: "", item_description: "", item_weight_in: "",
      in_date: today, estimated_out_date: "", repair_details: "", estimated_charge: "", notes: "" });
    setPhotoFile(null);
    setPhotoPreview(null);
    loadRepairs();
  }

  const filtered = repairs.filter(r => {
    if (!showDelivered && r.status === "delivered") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.customer_name.toLowerCase().includes(q) ||
        r.item_description.toLowerCase().includes(q) ||
        r.repair_no.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (canAccess === null || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1">
          <h1 className="text-lg font-bold text-ink">Repairs</h1>
          {staff && <p className="text-sm text-ink-dim">{staff.name}</p>}
        </div>
        <Link href="/my-attendance"
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-gold hover:border-gold transition-colors">
          Attendance
        </Link>
        <button onClick={handleLogout}
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-err hover:border-err transition-colors">
          Logout
        </button>
      </div>

      {!canAccess && (
        <div className="bg-err/10 text-err text-sm px-4 py-6 rounded-xl text-center">
          You do not have access to the Repairs module. Contact your admin.
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
                      <input type="radio" checked={goldsmithForm.type === t}
                        onChange={() => setGoldsmithForm(f => ({ ...f, type: t }))} />
                      {t === "internal" ? "Internal (shop staff)" : "External goldsmith"}
                    </label>
                  ))}
                </div>
              </div>
              {goldsmithForm.type === "external" && (
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Goldsmith name</label>
                  <input value={goldsmithForm.name}
                    onChange={e => setGoldsmithForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Name of goldsmith"
                    className={`${inp} w-full`} autoFocus />
                </div>
              )}
              <div>
                <label className="text-xs text-ink-dim block mb-1">Notes (optional)</label>
                <input value={goldsmithForm.notes}
                  onChange={e => setGoldsmithForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any special instructions"
                  className={`${inp} w-full`} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const r = repairs.find(x => x.id === goldsmithPending.repairId);
                  if (r) advanceStatus(r, goldsmithForm.type, goldsmithForm.name, goldsmithForm.notes);
                  setGoldsmithPending(null);
                }}
                className="bg-gold text-white text-sm px-4 py-1.5 rounded-lg2">
                Confirm
              </button>
              <button onClick={() => setGoldsmithPending(null)}
                className="border border-line text-sm px-4 py-1.5 rounded-lg2">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {canAccess && (
        <>
          {/* Call-customer alerts for ready repairs */}
          {repairs.filter(r => r.status === "got_back").map(r => (
            <div key={r.id} className="flex items-center gap-3 bg-ok/5 border border-ok/30 rounded-xl px-4 py-2.5">
              <span className="text-lg">🔔</span>
              <div className="flex-1 text-sm">
                <span className="font-semibold text-ok">Ready for pickup — </span>
                <span className="text-ink">{r.customer_name}</span>
                <span className="text-xs text-ink-dim ml-1.5">{r.repair_no}</span>
                {r.customer_phone && (
                  <a href={`tel:${r.customer_phone}`} className="ml-2 text-xs text-gold font-medium hover:underline">
                    Call {r.customer_phone}
                  </a>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="bg-err/10 text-err text-sm px-4 py-3 rounded-xl">{error}</div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search customer or item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inp} flex-1`}
            />
            <label className="flex items-center gap-1.5 text-xs text-ink-dim cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={showDelivered} onChange={e => setShowDelivered(e.target.checked)} />
              Delivered
            </label>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs bg-gold text-white px-3 py-1.5 rounded-lg2 hover:opacity-90 whitespace-nowrap"
            >
              + New
            </button>
          </div>

          {/* New Repair Form */}
          {showForm && (
            <div className="bg-white rounded-xl border border-line shadow-soft p-4 space-y-3">
              <p className="text-sm font-semibold text-ink">New Repair Entry</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim block mb-1">Customer Name *</label>
                  <input
                    value={form.customer_name}
                    onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                    className={`${inp} w-full`}
                    placeholder="Customer name"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.customer_phone}
                    onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))}
                    className={`${inp} w-full`}
                    placeholder="Phone"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">In Date</label>
                  <input
                    type="date"
                    value={form.in_date}
                    onChange={e => setForm(f => ({ ...f, in_date: e.target.value }))}
                    className={`${inp} w-full`}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim block mb-1">Item Description *</label>
                  <input
                    value={form.item_description}
                    onChange={e => setForm(f => ({ ...f, item_description: e.target.value }))}
                    className={`${inp} w-full`}
                    placeholder="e.g. Gold chain, bangles"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Item Weight (g)</label>
                  <input
                    type="number"
                    value={form.item_weight_in}
                    onChange={e => setForm(f => ({ ...f, item_weight_in: e.target.value }))}
                    className={`${inp} w-full`}
                    placeholder="0.000"
                    step="0.001"
                  />
                </div>
                <div>
                  <label className="text-xs text-ink-dim block mb-1">Est. Charge (₹)</label>
                  <input
                    type="number"
                    value={form.estimated_charge}
                    onChange={e => setForm(f => ({ ...f, estimated_charge: e.target.value }))}
                    className={`${inp} w-full`}
                    placeholder="0"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim block mb-1">Expected Ready Date</label>
                  <input
                    type="date"
                    value={form.estimated_out_date}
                    onChange={e => setForm(f => ({ ...f, estimated_out_date: e.target.value }))}
                    className={`${inp} w-48`}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim block mb-1">Repair Details</label>
                  <textarea
                    value={form.repair_details}
                    onChange={e => setForm(f => ({ ...f, repair_details: e.target.value }))}
                    className={`${inp} w-full`}
                    rows={2}
                    placeholder="What needs to be done"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-ink-dim block mb-1">Photo</label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="text-xs border border-line rounded-lg2 px-3 py-1.5 hover:border-gold"
                    >
                      Take / Choose Photo
                    </button>
                    {photoPreview && (
                      <img src={photoPreview} alt="preview" className="w-12 h-12 object-cover rounded-lg2 border border-line" />
                    )}
                  </div>
                </div>
              </div>
              {formError && <p className="text-xs text-err">{formError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSaveRepair}
                  disabled={saving}
                  className="text-xs bg-gold text-white px-4 py-1.5 rounded-lg2 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save Repair"}
                </button>
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormError(null);
                    setPhotoFile(null);
                    setPhotoPreview(null);
                  }}
                  className="text-xs border border-line px-3 py-1.5 rounded-lg2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Repairs list */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-ink-dim text-sm">
              {search ? "No repairs match your search." : "No active repairs."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-line shadow-soft">
                  <div
                    className="p-3 flex items-start gap-3 cursor-pointer"
                    onClick={() => {
                      const newId = expandedId === r.id ? null : r.id;
                      setExpandedId(newId);
                      if (newId) {
                        supabase().from("repair_stage_history").select("*")
                          .eq("repair_id", newId).order("created_at")
                          .then(({ data }) => setStageHistory(data ?? []));
                      } else setStageHistory([]);
                    }}
                  >
                    {r.photo_url && (
                      <img
                        src={r.photo_url}
                        alt=""
                        className="w-10 h-10 object-cover rounded-lg border border-line flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-ink-dim">{r.repair_no}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[r.status]}`}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-ink truncate mt-0.5">{r.customer_name}</p>
                      <p className="text-xs text-ink-dim truncate">{r.item_description}</p>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-0.5">
                      <p className="text-xs text-ink-dim">{shortDate(r.in_date)}</p>
                      {r.estimated_charge !== null && (
                        <p className="text-xs font-medium text-ink">{inr(r.estimated_charge)}</p>
                      )}
                      {r.estimated_out_date && r.status !== "delivered" && (
                        <p className={`text-[10px] ${r.estimated_out_date < today ? "text-err font-semibold" : "text-ink-dim"}`}>
                          Due {shortDate(r.estimated_out_date)}
                        </p>
                      )}
                    </div>
                  </div>

                  {expandedId === r.id && (
                    <div className="border-t border-line px-3 pb-3 pt-2 space-y-2">
                      {r.photo_url && (
                        <a href={r.photo_url} target="_blank" rel="noreferrer">
                          <img
                            src={r.photo_url}
                            alt="Repair item"
                            className="w-full max-h-64 object-contain rounded-lg border border-line bg-canvas"
                          />
                        </a>
                      )}
                      {r.customer_phone && (
                        <a href={`tel:${r.customer_phone}`} className="block text-xs text-gold">
                          {r.customer_phone}
                        </a>
                      )}
                      {r.repair_details && (
                        <p className="text-xs text-ink-dim">{r.repair_details}</p>
                      )}
                      <div className="flex flex-wrap gap-3 text-xs text-ink-dim">
                        {r.item_weight_in && <span>Weight in: {r.item_weight_in}g</span>}
                        {r.delivery_weight && <span>Weight out: {r.delivery_weight}g</span>}
                        {r.final_amount !== null && <span>Final: {inr(r.final_amount)}</span>}
                        {r.payment_mode && <span>Payment: {r.payment_mode}</span>}
                      </div>
                      {r.notes && (
                        <p className="text-xs text-ink-dim italic">{r.notes}</p>
                      )}
                      {/* Goldsmith info */}
                      {(r.goldsmith_type || r.goldsmith_name) && (
                        <p className="text-xs text-ink-dim">
                          <span className="font-medium text-ink">Goldsmith: </span>
                          {r.goldsmith_type === "internal" ? "Internal work" : (r.goldsmith_name || "External")}
                        </p>
                      )}
                      {/* Stage history */}
                      {expandedId === r.id && stageHistory.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-ink-dim mb-1">History</p>
                          <div className="space-y-0.5">
                            {stageHistory.map((h: any) => (
                              <div key={h.id} className="flex items-start gap-2 text-xs text-ink-dim">
                                <span className="text-[10px] w-28 shrink-0">
                                  {new Date(h.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span>
                                  {h.from_status ? `${STATUS_LABELS[h.from_status] ?? h.from_status} → ` : ""}
                                  <span className="text-ink font-medium">{STATUS_LABELS[h.to_status] ?? h.to_status}</span>
                                  {h.changed_by && <span> by {h.changed_by}</span>}
                                  {h.goldsmith_name && <span> · {h.goldsmith_name}</span>}
                                  {h.notes && <span> · {h.notes}</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {r.status !== "delivered" && (
                        advancingId === r.id ? (
                          <div className="bg-canvas rounded-lg2 p-3 space-y-2 border border-line">
                            <p className="text-xs font-semibold text-ink">Deliver to Customer</p>
                            <div className="flex flex-wrap gap-2 items-end">
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Final Amount *</label>
                                <input
                                  type="number"
                                  value={deliverForm.final_amount}
                                  onChange={e => setDeliverForm(f => ({ ...f, final_amount: e.target.value }))}
                                  className={`${inp} w-28`}
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Payment</label>
                                <select
                                  value={deliverForm.payment_mode}
                                  onChange={e => setDeliverForm(f => ({ ...f, payment_mode: e.target.value }))}
                                  className={inp}
                                >
                                  <option value="cash">Cash</option>
                                  <option value="upi">UPI</option>
                                  <option value="bank">Bank</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-ink-dim block mb-1">Delivery Date</label>
                                <input
                                  type="date"
                                  value={deliverForm.delivered_at}
                                  onChange={e => setDeliverForm(f => ({ ...f, delivered_at: e.target.value }))}
                                  className={`${inp} w-36`}
                                />
                              </div>
                            </div>
                            {deliverError && <p className="text-xs text-err">{deliverError}</p>}
                            <div className="flex gap-2">
                              <button
                                onClick={() => confirmDelivery(r)}
                                className="text-xs bg-ok text-white px-3 py-1.5 rounded-lg2"
                              >
                                Confirm Delivery
                              </button>
                              <button
                                onClick={() => { setAdvancingId(null); setDeliverError(null); }}
                                className="text-xs border border-line px-3 py-1.5 rounded-lg2"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => advanceStatus(r)}
                            className="text-xs bg-gold/10 text-gold border border-gold/30 px-3 py-1.5 rounded-lg2 hover:bg-gold hover:text-white transition-colors"
                          >
                            {STATUS_ACTION[r.status]}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
