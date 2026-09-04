"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { shortDate } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white";
const label = "block text-xs font-medium text-ink-dim mb-1";

interface PledgeForm {
  id: string;
  form_date: string;
  customer_name: string;
  father_husband: string | null;
  address: string | null;
  phone: string | null;
  aadhaar: string | null;
  pan: string | null;
  occupation: string | null;
  item_description: string | null;
  gross_weight_g: number | null;
  purity: string | null;
  loan_amount: number | null;
  interest_rate: number | null;
  srety_name: string | null;
  srety_address: string | null;
  srety_phone: string | null;
  srety_aadhaar: string | null;
  srety_relation: string | null;
  photo1_data: string | null;
  photo2_data: string | null;
  recorded_by_name: string | null;
  notes: string | null;
  created_at: string;
}

function CameraCapture({ label: lbl, photo, onCapture }: { label: string; photo: string | null; onCapture: (data: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const capture = lbl.toLowerCase().includes("customer") ? "user" : "environment";

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCapture(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        onClick={() => inputRef.current?.click()}
        className="w-32 h-40 rounded-xl border-2 border-dashed border-line bg-canvas flex flex-col items-center justify-center cursor-pointer hover:border-gold transition-colors overflow-hidden"
      >
        {photo ? (
          <img src={photo} alt={lbl} className="w-full h-full object-cover" />
        ) : (
          <>
            <svg className="w-8 h-8 text-ink-dim mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] text-ink-dim text-center px-1">{lbl}</span>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture={capture as any} onChange={handleFile} className="hidden" />
      {photo && (
        <button onClick={() => { onCapture(""); if (inputRef.current) inputRef.current.value = ""; }}
          className="text-[10px] text-err hover:underline">Retake</button>
      )}
      <p className="text-[10px] text-ink-dim">{lbl}</p>
    </div>
  );
}

const EMPTY_FORM = {
  form_date: new Date().toLocaleDateString("en-CA"),
  customer_name: "",
  father_husband: "",
  address: "",
  phone: "",
  aadhaar: "",
  pan: "",
  occupation: "",
  item_description: "",
  gross_weight_g: "",
  purity: "",
  loan_amount: "",
  interest_rate: "",
  srety_name: "",
  srety_address: "",
  srety_phone: "",
  srety_aadhaar: "",
  srety_relation: "",
  notes: "",
};

export default function PledgeFormPage() {
  const qc = useQueryClient();
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin";

  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selected, setSelected] = useState<PledgeForm | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [photo1, setPhoto1] = useState<string>("");
  const [photo2, setPhoto2] = useState<string>("");
  const [err, setErr] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const { data: records = [], isLoading } = useQuery<PledgeForm[]>({
    queryKey: ["pledge_forms"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("pledge_forms")
        .select("id, form_date, customer_name, phone, loan_amount, purity, gross_weight_g, recorded_by_name, notes, created_at, photo1_data, photo2_data, father_husband, address, aadhaar, pan, occupation, item_description, interest_rate, srety_name, srety_address, srety_phone, srety_aadhaar, srety_relation")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PledgeForm[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.customer_name.trim()) throw new Error("Customer name is required.");
      const { data: { user } } = await supabase().auth.getUser();
      const { error } = await supabase().from("pledge_forms").insert({
        form_date:        form.form_date,
        customer_name:    form.customer_name.trim(),
        father_husband:   form.father_husband.trim() || null,
        address:          form.address.trim() || null,
        phone:            form.phone.trim() || null,
        aadhaar:          form.aadhaar.trim() || null,
        pan:              form.pan.trim() || null,
        occupation:       form.occupation.trim() || null,
        item_description: form.item_description.trim() || null,
        gross_weight_g:   form.gross_weight_g ? parseFloat(form.gross_weight_g) : null,
        purity:           form.purity.trim() || null,
        loan_amount:      form.loan_amount ? parseFloat(form.loan_amount) : null,
        interest_rate:    form.interest_rate ? parseFloat(form.interest_rate) : null,
        srety_name:       form.srety_name.trim() || null,
        srety_address:    form.srety_address.trim() || null,
        srety_phone:      form.srety_phone.trim() || null,
        srety_aadhaar:    form.srety_aadhaar.trim() || null,
        srety_relation:   form.srety_relation.trim() || null,
        photo1_data:      photo1 || null,
        photo2_data:      photo2 || null,
        recorded_by:      user?.id ?? null,
        recorded_by_name: profile?.display_name ?? null,
        notes:            form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pledge_forms"] });
      setForm({ ...EMPTY_FORM });
      setPhoto1("");
      setPhoto2("");
      setErr("");
      setView("list");
    },
    onError: (e: any) => setErr(e?.message ?? "Failed to save."),
  });

  if (view === "new") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Pledge Form</h1>
            <p className="text-xs text-ink-dim mt-0.5">கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்</p>
          </div>
          <button onClick={() => setView("list")} className="text-sm text-ink-dim hover:text-ink">← Back</button>
        </div>

        {/* Shop header */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-4 text-center">
          <p className="text-base font-bold tracking-wide">சபரிநாதன் ஜுவல்லர்ஸ்</p>
          <p className="text-xs text-ink-dim">Sabarinathan Jewellers</p>
        </div>

        {/* Photo capture */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-5">
          <p className="text-sm font-semibold mb-1">புகைப்படம் / Photo Record</p>
          <p className="text-xs text-ink-dim mb-4">Take 2 photos — customer face and ID/item</p>
          <div className="flex gap-6 justify-center flex-wrap">
            <CameraCapture label="Customer Photo" photo={photo1} onCapture={setPhoto1} />
            <CameraCapture label="ID / Item Photo" photo={photo2} onCapture={setPhoto2} />
          </div>
        </div>

        {/* Form date */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-5 space-y-4">
          <p className="text-sm font-semibold">Form Date</p>
          <div>
            <label className={label}>Date</label>
            <input type="date" value={form.form_date} onChange={e => setForm(f => ({ ...f, form_date: e.target.value }))} className={inp} />
          </div>
        </div>

        {/* Customer details */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-5 space-y-4">
          <p className="text-sm font-semibold">Customer Details · வாடிக்கையாளர் விவரம்</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={label}>Customer Name · பெயர் *</label>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className={inp} placeholder="Full name" />
            </div>
            <div>
              <label className={label}>Father / Husband Name · தந்தை / கணவர்</label>
              <input value={form.father_husband} onChange={e => setForm(f => ({ ...f, father_husband: e.target.value }))} className={inp} placeholder="Name" />
            </div>
            <div>
              <label className={label}>Occupation · தொழில்</label>
              <input value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} className={inp} placeholder="Occupation" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Address · முகவரி</label>
              <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2}
                className={`${inp} resize-none`} placeholder="Full address" />
            </div>
            <div>
              <label className={label}>Phone / Mobile · தொலைபேசி</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} placeholder="10-digit number" />
            </div>
            <div>
              <label className={label}>Aadhaar No. · ஆதார்</label>
              <input value={form.aadhaar} onChange={e => setForm(f => ({ ...f, aadhaar: e.target.value }))} className={inp} placeholder="XXXX XXXX XXXX" />
            </div>
            <div>
              <label className={label}>PAN No.</label>
              <input value={form.pan} onChange={e => setForm(f => ({ ...f, pan: e.target.value }))} className={inp} placeholder="ABCDE1234F" />
            </div>
          </div>
        </div>

        {/* Pledge item */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-5 space-y-4">
          <p className="text-sm font-semibold">Pledged Item · அடகு பொருள் விவரம்</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={label}>Item Description · பொருள் விவரம்</label>
              <textarea value={form.item_description} onChange={e => setForm(f => ({ ...f, item_description: e.target.value }))} rows={2}
                className={`${inp} resize-none`} placeholder="e.g. Gold chain 22K, bangles…" />
            </div>
            <div>
              <label className={label}>Gross Weight (g) · மொத்த எடை</label>
              <input type="number" step="0.001" value={form.gross_weight_g} onChange={e => setForm(f => ({ ...f, gross_weight_g: e.target.value }))} className={inp} placeholder="0.000" />
            </div>
            <div>
              <label className={label}>Purity · தூய்மை</label>
              <input value={form.purity} onChange={e => setForm(f => ({ ...f, purity: e.target.value }))} className={inp} placeholder="e.g. 22K, 916" />
            </div>
            <div>
              <label className={label}>Loan Amount (₹) · கடன் தொகை</label>
              <input type="number" value={form.loan_amount} onChange={e => setForm(f => ({ ...f, loan_amount: e.target.value }))} className={inp} placeholder="0" />
            </div>
            <div>
              <label className={label}>Interest Rate (% / month) · வட்டி</label>
              <input type="number" step="0.01" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} className={inp} placeholder="1.5" />
            </div>
          </div>
        </div>

        {/* Guarantor */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-5 space-y-4">
          <p className="text-sm font-semibold">Guarantor / SRETY · உத்தரவாதி விவரம்</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Guarantor Name · பெயர்</label>
              <input value={form.srety_name} onChange={e => setForm(f => ({ ...f, srety_name: e.target.value }))} className={inp} placeholder="Full name" />
            </div>
            <div>
              <label className={label}>Relation · உறவு முறை</label>
              <input value={form.srety_relation} onChange={e => setForm(f => ({ ...f, srety_relation: e.target.value }))} className={inp} placeholder="e.g. Brother, Friend" />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>Address · முகவரி</label>
              <textarea value={form.srety_address} onChange={e => setForm(f => ({ ...f, srety_address: e.target.value }))} rows={2}
                className={`${inp} resize-none`} placeholder="Full address" />
            </div>
            <div>
              <label className={label}>Phone · தொலைபேசி</label>
              <input value={form.srety_phone} onChange={e => setForm(f => ({ ...f, srety_phone: e.target.value }))} className={inp} placeholder="10-digit number" />
            </div>
            <div>
              <label className={label}>Aadhaar · ஆதார்</label>
              <input value={form.srety_aadhaar} onChange={e => setForm(f => ({ ...f, srety_aadhaar: e.target.value }))} className={inp} placeholder="XXXX XXXX XXXX" />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-5">
          <label className={label}>Notes · குறிப்புகள்</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
            className={`${inp} resize-none`} placeholder="Any additional notes…" />
        </div>

        {/* Declaration */}
        <div className="bg-canvas border border-line rounded-xl p-4 text-xs text-ink-dim space-y-1">
          <p className="font-semibold text-ink text-sm">Declaration · உறுதிமொழி</p>
          <p>I hereby pledge the above item(s) as security for the loan amount stated. I confirm that the pledged items are my own property and free from any encumbrance. I agree to pay interest at the stated rate and redeem the pledged items within the agreed period.</p>
          <p className="mt-1">மேற்கண்ட பொருட்களை நான் அடகு வைக்கிறேன். இவை என்னுடைய சொந்த சொத்து என்பதை உறுதி செய்கிறேன். நிர்ணயிக்கப்பட்ட வட்டி மற்றும் விதிமுறைகளுக்கு இணங்க செயல்படுவேன்.</p>
        </div>

        {err && <p className="text-sm text-err bg-err/5 rounded-lg2 px-3 py-2">{err}</p>}

        <div className="flex gap-3 pb-6">
          <button onClick={() => setView("list")} className="flex-1 border border-line rounded-lg2 py-2.5 text-sm text-ink-dim hover:text-ink transition-colors">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !form.customer_name.trim()}
            className="flex-1 bg-gold text-white rounded-lg2 py-2.5 text-sm font-semibold disabled:opacity-40">
            {save.isPending ? "Saving…" : "Save Pledge Form"}
          </button>
        </div>
      </div>
    );
  }

  if (view === "detail" && selected) {
    function buildWhatsAppText(r: PledgeForm) {
      const lines = [
        `*Pledge Form — Sabarinathan Jewellers*`,
        `Date: ${shortDate(r.form_date)}`,
        ``,
        `*Customer*`,
        `Name: ${r.customer_name}`,
        r.father_husband ? `Father/Husband: ${r.father_husband}` : null,
        r.phone ? `Phone: ${r.phone}` : null,
        r.aadhaar ? `Aadhaar: ${r.aadhaar}` : null,
        r.pan ? `PAN: ${r.pan}` : null,
        r.occupation ? `Occupation: ${r.occupation}` : null,
        r.address ? `Address: ${r.address}` : null,
        ``,
        `*Pledged Item*`,
        r.item_description ? `Item: ${r.item_description}` : null,
        r.gross_weight_g ? `Weight: ${r.gross_weight_g}g` : null,
        r.purity ? `Purity: ${r.purity}` : null,
        r.loan_amount ? `Loan: ₹${Number(r.loan_amount).toLocaleString("en-IN")}` : null,
        r.interest_rate ? `Interest: ${r.interest_rate}% / month` : null,
        (r.srety_name || r.srety_phone) ? `` : null,
        r.srety_name ? `*Guarantor*` : null,
        r.srety_name ? `Name: ${r.srety_name}${r.srety_relation ? ` (${r.srety_relation})` : ""}` : null,
        r.srety_phone ? `Phone: ${r.srety_phone}` : null,
        r.notes ? `\nNotes: ${r.notes}` : null,
      ].filter(Boolean).join("\n");
      return lines;
    }

    function shareWhatsApp() {
      const text = buildWhatsAppText(selected!);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }

    function printForm() {
      const r = selected!;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pledge Form — ${r.customer_name}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 24px; }
  h1 { font-size: 18px; text-align: center; margin: 0; }
  .sub { text-align: center; color: #555; font-size: 12px; margin-bottom: 16px; }
  .photos { display: flex; gap: 16px; margin-bottom: 16px; }
  .photo-box { border: 1px solid #ccc; width: 120px; height: 150px; object-fit: cover; }
  .photo-placeholder { border: 1px dashed #ccc; width: 120px; height: 150px; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  td { padding: 4px 8px; border: 1px solid #ddd; vertical-align: top; }
  td:first-child { width: 36%; font-weight: bold; background: #f9f9f9; color: #444; }
  h2 { font-size: 13px; margin: 14px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  .declaration { font-size: 11px; color: #444; border: 1px solid #ccc; padding: 10px; margin-top: 12px; }
  .sig { display: flex; justify-content: space-between; margin-top: 40px; font-size: 12px; }
</style></head><body>
<h1>சபரிநாதன் ஜுவல்லர்ஸ் — Sabarinathan Jewellers</h1>
<p class="sub">Pledge Form · கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம் · Date: ${shortDate(r.form_date)}</p>

<div class="photos">
  ${r.photo1_data ? `<div><img src="${r.photo1_data}" class="photo-box"><p style="text-align:center;font-size:11px;margin:3px 0">Customer</p></div>` : `<div><div class="photo-placeholder">No photo</div><p style="text-align:center;font-size:11px;margin:3px 0">Customer</p></div>`}
  ${r.photo2_data ? `<div><img src="${r.photo2_data}" class="photo-box"><p style="text-align:center;font-size:11px;margin:3px 0">ID / Item</p></div>` : `<div><div class="photo-placeholder">No photo</div><p style="text-align:center;font-size:11px;margin:3px 0">ID / Item</p></div>`}
</div>

<h2>Customer · வாடிக்கையாளர் விவரம்</h2>
<table>
  <tr><td>Name · பெயர்</td><td>${r.customer_name}</td></tr>
  ${r.father_husband ? `<tr><td>Father / Husband</td><td>${r.father_husband}</td></tr>` : ""}
  ${r.occupation ? `<tr><td>Occupation · தொழில்</td><td>${r.occupation}</td></tr>` : ""}
  ${r.address ? `<tr><td>Address · முகவரி</td><td>${r.address}</td></tr>` : ""}
  ${r.phone ? `<tr><td>Phone · தொலைபேசி</td><td>${r.phone}</td></tr>` : ""}
  ${r.aadhaar ? `<tr><td>Aadhaar</td><td>${r.aadhaar}</td></tr>` : ""}
  ${r.pan ? `<tr><td>PAN</td><td>${r.pan}</td></tr>` : ""}
</table>

<h2>Pledged Item · அடகு பொருள் விவரம்</h2>
<table>
  ${r.item_description ? `<tr><td>Description · பொருள்</td><td>${r.item_description}</td></tr>` : ""}
  ${r.gross_weight_g ? `<tr><td>Gross Weight · எடை</td><td>${r.gross_weight_g} g</td></tr>` : ""}
  ${r.purity ? `<tr><td>Purity · தூய்மை</td><td>${r.purity}</td></tr>` : ""}
  ${r.loan_amount ? `<tr><td>Loan Amount · கடன் தொகை</td><td>₹${Number(r.loan_amount).toLocaleString("en-IN")}</td></tr>` : ""}
  ${r.interest_rate ? `<tr><td>Interest Rate · வட்டி</td><td>${r.interest_rate}% / month</td></tr>` : ""}
</table>

${r.srety_name || r.srety_phone ? `
<h2>Guarantor / SRETY · உத்தரவாதி</h2>
<table>
  ${r.srety_name ? `<tr><td>Name</td><td>${r.srety_name}${r.srety_relation ? ` (${r.srety_relation})` : ""}</td></tr>` : ""}
  ${r.srety_address ? `<tr><td>Address</td><td>${r.srety_address}</td></tr>` : ""}
  ${r.srety_phone ? `<tr><td>Phone</td><td>${r.srety_phone}</td></tr>` : ""}
  ${r.srety_aadhaar ? `<tr><td>Aadhaar</td><td>${r.srety_aadhaar}</td></tr>` : ""}
</table>` : ""}

${r.notes ? `<h2>Notes</h2><p>${r.notes}</p>` : ""}

<div class="declaration">
  <strong>Declaration · உறுதிமொழி</strong><br>
  I hereby pledge the above item(s) as security for the loan amount stated. I confirm that the pledged items are my own property and free from any encumbrance. I agree to pay interest at the stated rate and redeem the pledged items within the agreed period.<br><br>
  மேற்கண்ட பொருட்களை நான் அடகு வைக்கிறேன். இவை என்னுடைய சொந்த சொத்து என்பதை உறுதி செய்கிறேன்.
</div>

<div class="sig">
  <div>Customer Signature<br>___________________</div>
  <div>Guarantor Signature<br>___________________</div>
  <div>Staff: ${r.recorded_by_name ?? "___________________"}</div>
</div>
</body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 500);
    }

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {previewPhoto && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setPreviewPhoto(null)}>
            <img src={previewPhoto} alt="photo" className="max-w-sm max-h-[80vh] rounded-xl border-4 border-white object-contain" />
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold">{selected.customer_name}</h1>
            <p className="text-xs text-ink-dim">{shortDate(selected.form_date)} · Recorded by {selected.recorded_by_name ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={shareWhatsApp}
              className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-lg2 text-sm font-medium hover:bg-[#1ebe5e] transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </button>
            <button onClick={printForm}
              className="flex items-center gap-1.5 border border-line px-3 py-1.5 rounded-lg2 text-sm text-ink-dim hover:text-ink hover:border-gold transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" />
              </svg>
              Print
            </button>
            <button onClick={() => setView("list")} className="text-sm text-ink-dim hover:text-ink">← Back</button>
          </div>
        </div>

        {/* Photos */}
        {(selected.photo1_data || selected.photo2_data) && (
          <div className="bg-white border border-line rounded-xl shadow-soft p-4">
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-3">Photos</p>
            <div className="flex gap-4 flex-wrap">
              {selected.photo1_data && (
                <div className="text-center">
                  <img src={selected.photo1_data} alt="Customer" onClick={() => setPreviewPhoto(selected.photo1_data!)}
                    className="w-32 h-40 object-cover rounded-lg border border-line cursor-pointer hover:opacity-80" />
                  <p className="text-[10px] text-ink-dim mt-1">Customer</p>
                </div>
              )}
              {selected.photo2_data && (
                <div className="text-center">
                  <img src={selected.photo2_data} alt="ID/Item" onClick={() => setPreviewPhoto(selected.photo2_data!)}
                    className="w-32 h-40 object-cover rounded-lg border border-line cursor-pointer hover:opacity-80" />
                  <p className="text-[10px] text-ink-dim mt-1">ID / Item</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Details */}
        <div className="bg-white border border-line rounded-xl shadow-soft p-4 space-y-3 text-sm">
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Customer</p>
          {selected.father_husband && <Row label="Father / Husband" value={selected.father_husband} />}
          {selected.address && <Row label="Address" value={selected.address} />}
          {selected.phone && <Row label="Phone" value={selected.phone} />}
          {selected.aadhaar && <Row label="Aadhaar" value={selected.aadhaar} />}
          {selected.pan && <Row label="PAN" value={selected.pan} />}
          {selected.occupation && <Row label="Occupation" value={selected.occupation} />}
        </div>

        <div className="bg-white border border-line rounded-xl shadow-soft p-4 space-y-3 text-sm">
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Pledged Item</p>
          {selected.item_description && <Row label="Description" value={selected.item_description} />}
          {selected.gross_weight_g && <Row label="Gross Weight" value={`${selected.gross_weight_g} g`} />}
          {selected.purity && <Row label="Purity" value={selected.purity} />}
          {selected.loan_amount && <Row label="Loan Amount" value={`₹${Number(selected.loan_amount).toLocaleString("en-IN")}`} />}
          {selected.interest_rate && <Row label="Interest Rate" value={`${selected.interest_rate}% / month`} />}
        </div>

        {(selected.srety_name || selected.srety_phone) && (
          <div className="bg-white border border-line rounded-xl shadow-soft p-4 space-y-3 text-sm">
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Guarantor / SRETY</p>
            {selected.srety_name && <Row label="Name" value={selected.srety_name} />}
            {selected.srety_relation && <Row label="Relation" value={selected.srety_relation} />}
            {selected.srety_address && <Row label="Address" value={selected.srety_address} />}
            {selected.srety_phone && <Row label="Phone" value={selected.srety_phone} />}
            {selected.srety_aadhaar && <Row label="Aadhaar" value={selected.srety_aadhaar} />}
          </div>
        )}

        {selected.notes && (
          <div className="bg-white border border-line rounded-xl shadow-soft p-4 text-sm">
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide mb-1">Notes</p>
            <p>{selected.notes}</p>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Pledge Forms</h1>
          <p className="text-xs text-ink-dim mt-0.5">கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்</p>
        </div>
        <button onClick={() => setView("new")}
          className="bg-gold text-white px-4 py-2 rounded-lg2 text-sm font-semibold hover:bg-gold/90 transition-colors">
          + New Form
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-dim">Loading…</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-line shadow-soft p-10 text-center">
          <p className="text-ink-dim text-sm">No pledge forms yet.</p>
          <button onClick={() => setView("new")} className="mt-3 text-sm text-gold hover:underline">Create the first one →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <button key={r.id} onClick={() => { setSelected(r); setView("detail"); }}
              className="w-full bg-white border border-line rounded-xl shadow-soft px-4 py-3 flex items-center gap-4 hover:border-gold/40 transition-colors text-left">
              {/* Photos thumbnail */}
              <div className="flex gap-1 shrink-0">
                {r.photo1_data ? (
                  <img src={r.photo1_data} alt="" className="w-10 h-12 object-cover rounded border border-line" />
                ) : (
                  <div className="w-10 h-12 bg-canvas border border-line rounded flex items-center justify-center">
                    <span className="text-[10px] text-ink-dim">—</span>
                  </div>
                )}
                {r.photo2_data ? (
                  <img src={r.photo2_data} alt="" className="w-10 h-12 object-cover rounded border border-line" />
                ) : (
                  <div className="w-10 h-12 bg-canvas border border-line rounded flex items-center justify-center">
                    <span className="text-[10px] text-ink-dim">—</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{r.customer_name}</p>
                <p className="text-xs text-ink-dim truncate">
                  {shortDate(r.form_date)}
                  {r.phone ? ` · ${r.phone}` : ""}
                  {r.gross_weight_g ? ` · ${r.gross_weight_g}g` : ""}
                  {r.purity ? ` ${r.purity}` : ""}
                </p>
              </div>
              {r.loan_amount && (
                <p className="text-sm font-bold text-gold shrink-0">₹{Number(r.loan_amount).toLocaleString("en-IN")}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label: lbl, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-ink-dim w-32 shrink-0 text-xs mt-0.5">{lbl}</span>
      <span className="flex-1 whitespace-pre-wrap">{value}</span>
    </div>
  );
}
