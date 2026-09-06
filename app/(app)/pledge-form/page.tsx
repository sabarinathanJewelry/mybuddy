"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { shortDate } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold bg-white";
const lbl = "block text-xs font-medium text-ink-dim mb-1";
const sec = "bg-white border border-line rounded-xl shadow-soft p-5 space-y-4";

interface CreditForm {
  id: string; created_at: string;
  bill_order_no: string | null; form_date: string; form_time: string | null; photo_date: string | null;
  photo1_data: string | null; photo2_data: string | null;
  customer_name: string; customer_phone: string | null;
  loan_amount: number | null; rate_fixed: boolean | null;
  agreed_rate: string | null; agreed_rate_date: string | null; due_date: string | null;
  kyc_full_name: string | null; kyc_aadhaar_name: string | null;
  kyc_aadhaar_no: string | null; kyc_pan_no: string | null;
  kyc_phone: string | null; kyc_alt_phone: string | null; kyc_address: string | null;
  authorizer_name: string | null;
  doc_aadhaar: boolean; doc_pan: boolean; doc_address: boolean; doc_others: string | null;
  surety_full_name: string | null; surety_aadhaar_name: string | null;
  surety_phone: string | null; surety_alt_phone: string | null;
  surety_aadhaar_no: string | null; surety_pan: string | null; surety_address: string | null;
  recorded_by_name: string | null;
}

function PhotoBox({ caption, photo, capture, onCapture }: { caption: string; photo: string; capture: "user" | "environment"; onCapture: (d: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => onCapture(r.result as string); r.readAsDataURL(f);
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div onClick={() => ref.current?.click()}
        className="w-32 h-40 rounded-xl border-2 border-dashed border-line bg-canvas flex flex-col items-center justify-center cursor-pointer hover:border-gold transition-colors overflow-hidden">
        {photo ? <img src={photo} className="w-full h-full object-cover" alt={caption} /> : (
          <>
            <svg className="w-7 h-7 text-ink-dim mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] text-ink-dim text-center px-1 leading-tight">{caption}</span>
          </>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture={capture} onChange={handleFile} className="hidden" />
      {photo && <button onClick={() => { onCapture(""); if (ref.current) ref.current.value = ""; }} className="text-[10px] text-err hover:underline">Retake</button>}
      <p className="text-[10px] text-ink-dim text-center leading-tight">{caption}</p>
    </div>
  );
}

const EMPTY: Record<string, any> = {
  bill_order_no: "", form_date: new Date().toLocaleDateString("en-CA"),
  form_time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
  photo_date: new Date().toLocaleDateString("en-CA"),
  customer_name: "", customer_phone: "", loan_amount: "",
  rate_fixed: null, agreed_rate: "", agreed_rate_date: "", due_date: "",
  kyc_full_name: "", kyc_aadhaar_name: "", kyc_aadhaar_no: "", kyc_pan_no: "",
  kyc_phone: "", kyc_alt_phone: "", kyc_address: "", authorizer_name: "",
  doc_aadhaar: false, doc_pan: false, doc_address: false, doc_others: "",
  surety_full_name: "", surety_aadhaar_name: "", surety_phone: "",
  surety_alt_phone: "", surety_aadhaar_no: "", surety_pan: "", surety_address: "",
};

export default function CreditSecurityPage() {
  const qc = useQueryClient();
  const profile = useAuth((s) => s.profile);
  const isAdmin = profile?.role === "admin" || profile?.role === "subadmin";

  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selected, setSelected] = useState<CreditForm | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [photo1, setPhoto1] = useState("");
  const [photo2, setPhoto2] = useState("");
  const [err, setErr] = useState("");
  const [bigPhoto, setBigPhoto] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const { data: records = [], isLoading } = useQuery<CreditForm[]>({
    queryKey: ["pledge_forms"],
    queryFn: async () => {
      const { data, error } = await supabase().from("pledge_forms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditForm[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.customer_name.trim()) throw new Error("Customer name is required.");
      const { data: { user } } = await supabase().auth.getUser();
      const { error } = await supabase().from("pledge_forms").insert({
        bill_order_no: form.bill_order_no.trim() || null,
        form_date: form.form_date, form_time: form.form_time.trim() || null,
        photo_date: form.photo_date || null,
        photo1_data: photo1 || null, photo2_data: photo2 || null,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        loan_amount: form.loan_amount ? parseFloat(form.loan_amount) : null,
        rate_fixed: form.rate_fixed,
        agreed_rate: form.agreed_rate.trim() || null,
        agreed_rate_date: form.agreed_rate_date || null,
        due_date: form.due_date || null,
        kyc_full_name: form.kyc_full_name.trim() || null,
        kyc_aadhaar_name: form.kyc_aadhaar_name.trim() || null,
        kyc_aadhaar_no: form.kyc_aadhaar_no.trim() || null,
        kyc_pan_no: form.kyc_pan_no.trim() || null,
        kyc_phone: form.kyc_phone.trim() || null,
        kyc_alt_phone: form.kyc_alt_phone.trim() || null,
        kyc_address: form.kyc_address.trim() || null,
        authorizer_name: form.authorizer_name.trim() || null,
        doc_aadhaar: form.doc_aadhaar, doc_pan: form.doc_pan,
        doc_address: form.doc_address,
        doc_others: form.doc_others.trim() || null,
        surety_full_name: form.surety_full_name.trim() || null,
        surety_aadhaar_name: form.surety_aadhaar_name.trim() || null,
        surety_phone: form.surety_phone.trim() || null,
        surety_alt_phone: form.surety_alt_phone.trim() || null,
        surety_aadhaar_no: form.surety_aadhaar_no.trim() || null,
        surety_pan: form.surety_pan.trim() || null,
        surety_address: form.surety_address.trim() || null,
        recorded_by: user?.id ?? null,
        recorded_by_name: profile?.display_name ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pledge_forms"] });
      setForm({ ...EMPTY }); setPhoto1(""); setPhoto2(""); setErr(""); setView("list");
    },
    onError: (e: any) => setErr(e?.message ?? "Failed to save."),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("pledge_forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pledge_forms"] });
      setSelected(null); setConfirmDelete(false); setView("list");
    },
  });

  // ── New form view ───────────────────────────────────────────────────────────
  if (view === "new") return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Credit Security Form</h1>
          <p className="text-xs text-ink-dim">கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்</p>
        </div>
        <button onClick={() => setView("list")} className="text-sm text-ink-dim hover:text-ink">← Back</button>
      </div>

      {/* Shop name */}
      <div className="text-center bg-white border border-line rounded-xl shadow-soft py-3">
        <p className="font-bold tracking-wide">சபரிநாதன் ஜுவல்லர்ஸ்</p>
        <p className="text-xs text-ink-dim">Sabarinathan Jewellers</p>
      </div>

      {/* Photos */}
      <div className={sec}>
        <p className="text-sm font-semibold">புகைப்படங்கள் / Photo Record</p>
        <div className="flex gap-6 justify-center flex-wrap">
          <PhotoBox caption={"வாடிக்கையாளர் புகைப்படம்\nCustomer Photo"} photo={photo1} capture="user" onCapture={setPhoto1} />
          <PhotoBox caption={"நகை / பொருள் புகைப்படம்\nJewellery Photo"} photo={photo2} capture="environment" onCapture={setPhoto2} />
        </div>
        <div>
          <label className={lbl}>புகைப்படம் ஒட்டிய தேதி / Photo Date</label>
          <input type="date" value={form.photo_date} onChange={e => f("photo_date", e.target.value)} className={inp} />
        </div>
      </div>

      {/* Bill + Date */}
      <div className={sec}>
        <p className="text-sm font-semibold">கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={lbl}>பில் எண் / ஆர்டர் எண் — Bill No / Order No</label>
            <input value={form.bill_order_no} onChange={e => f("bill_order_no", e.target.value)} className={inp} placeholder="Bill or order number" />
          </div>
          <div>
            <label className={lbl}>தேதி / Date</label>
            <input type="date" value={form.form_date} onChange={e => f("form_date", e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>நேரம் / Time</label>
            <input type="time" value={form.form_time} onChange={e => f("form_time", e.target.value)} className={inp} />
          </div>
        </div>
      </div>

      {/* Customer top block */}
      <div className={sec}>
        <p className="text-sm font-semibold">வாடிக்கையாளர் விவரம் — Customer</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={lbl}>வாடிக்கையாளர் பெயர் — Customer Name *</label>
            <input value={form.customer_name} onChange={e => f("customer_name", e.target.value)} className={inp} placeholder="Customer name" />
          </div>
          <div>
            <label className={lbl}>கைபேசி எண் — Phone</label>
            <input value={form.customer_phone} onChange={e => f("customer_phone", e.target.value)} className={inp} placeholder="Mobile number" />
          </div>
          <div>
            <label className={lbl}>கடன் தொகை / பொருள் மதிப்பு — Loan Amount ₹</label>
            <input type="number" value={form.loan_amount} onChange={e => f("loan_amount", e.target.value)} className={inp} placeholder="0" />
          </div>
        </div>

        {/* Rate condition */}
        <div>
          <label className={lbl}>ரேட் / விலை நிபந்தனை — Rate Condition</label>
          <div className="flex gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={form.rate_fixed === true} onChange={() => f("rate_fixed", true)} className="accent-gold" />
              ரேட் நிர்ணயம் செய்யப்பட்டது (Rate Fixed)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={form.rate_fixed === false} onChange={() => f("rate_fixed", false)} className="accent-gold" />
              ரேட் நிர்ணயம் செய்யப்படவில்லை (Not Fixed)
            </label>
          </div>
        </div>

        {form.rate_fixed === true && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>ஒப்புக்கொண்ட ரேட் — Agreed Rate ₹</label>
              <input value={form.agreed_rate} onChange={e => f("agreed_rate", e.target.value)} className={inp} placeholder="Rate / ___" />
            </div>
            <div>
              <label className={lbl}>ஒப்புக்கொண்ட தேதி — Agreed Date</label>
              <input type="date" value={form.agreed_rate_date} onChange={e => f("agreed_rate_date", e.target.value)} className={inp} />
            </div>
          </div>
        )}

        <div>
          <label className={lbl}>செலுத்த வேண்டிய தேதி — Due Date</label>
          <input type="date" value={form.due_date} onChange={e => f("due_date", e.target.value)} className={inp} />
        </div>
      </div>

      {/* KYC */}
      <div className={sec}>
        <p className="text-sm font-semibold">வாடிக்கையாளர் / KYC விவரங்கள்</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={lbl}>வாடிக்கையாளர் முழுப் பெயர் — Customer Full Name</label>
            <input value={form.kyc_full_name} onChange={e => f("kyc_full_name", e.target.value)} className={inp} placeholder="Full name" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>ஆதார் அட்டையில் உள்ள முழுப் பெயர் — Name as per Aadhaar</label>
            <input value={form.kyc_aadhaar_name} onChange={e => f("kyc_aadhaar_name", e.target.value)} className={inp} placeholder="Name on Aadhaar card" />
          </div>
          <div>
            <label className={lbl}>ஆதார் எண் — Aadhaar No</label>
            <input value={form.kyc_aadhaar_no} onChange={e => f("kyc_aadhaar_no", e.target.value)} className={inp} placeholder="XXXX XXXX XXXX" />
          </div>
          <div>
            <label className={lbl}>PAN எண் — PAN No</label>
            <input value={form.kyc_pan_no} onChange={e => f("kyc_pan_no", e.target.value)} className={inp} placeholder="ABCDE1234F" />
          </div>
          <div>
            <label className={lbl}>கைபேசி எண் — Phone</label>
            <input value={form.kyc_phone} onChange={e => f("kyc_phone", e.target.value)} className={inp} placeholder="Mobile" />
          </div>
          <div>
            <label className={lbl}>மாற்று கைபேசி எண் — Alt Phone</label>
            <input value={form.kyc_alt_phone} onChange={e => f("kyc_alt_phone", e.target.value)} className={inp} placeholder="Alternate mobile" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>முழு முகவரி — Full Address</label>
            <textarea value={form.kyc_address} onChange={e => f("kyc_address", e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Full address" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>அங்கீகரிக்கப்பட்ட நபர் — Authorizer Name</label>
            <input value={form.authorizer_name} onChange={e => f("authorizer_name", e.target.value)} className={inp} placeholder="Authorizer name" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>சரிபார்க்கப்பட்ட ஆவணங்கள் — Documents Verified</label>
            <div className="flex flex-wrap gap-4 mt-1">
              {[
                { key: "doc_aadhaar", label: "ஆதார் / Aadhaar" },
                { key: "doc_pan",     label: "PAN" },
                { key: "doc_address", label: "முகவரி சான்று / Address Proof" },
              ].map(d => (
                <label key={d.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!form[d.key]} onChange={e => f(d.key, e.target.checked)} className="accent-gold" />
                  {d.label}
                </label>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-sm">மற்றவை / Others:</span>
                <input value={form.doc_others} onChange={e => f("doc_others", e.target.value)} className="border border-line rounded-lg2 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-gold w-32" placeholder="Specify" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SURETY */}
      <div className={sec}>
        <p className="text-sm font-semibold">SURETY / உத்தரவாததாரர் விவரங்கள்</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={lbl}>உத்தரவாததாரர் முழுப் பெயர் — Surety Full Name</label>
            <input value={form.surety_full_name} onChange={e => f("surety_full_name", e.target.value)} className={inp} placeholder="Full name" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>ஆதார் அட்டையில் உள்ள முழுப் பெயர் — Name as per Aadhaar</label>
            <input value={form.surety_aadhaar_name} onChange={e => f("surety_aadhaar_name", e.target.value)} className={inp} placeholder="Name on Aadhaar card" />
          </div>
          <div>
            <label className={lbl}>கைபேசி எண் — Phone</label>
            <input value={form.surety_phone} onChange={e => f("surety_phone", e.target.value)} className={inp} placeholder="Mobile" />
          </div>
          <div>
            <label className={lbl}>மாற்று கைபேசி எண் — Alt Phone</label>
            <input value={form.surety_alt_phone} onChange={e => f("surety_alt_phone", e.target.value)} className={inp} placeholder="Alternate mobile" />
          </div>
          <div>
            <label className={lbl}>ஆதார் / அடையாள எண் — Aadhaar / ID No</label>
            <input value={form.surety_aadhaar_no} onChange={e => f("surety_aadhaar_no", e.target.value)} className={inp} placeholder="Aadhaar or ID number" />
          </div>
          <div>
            <label className={lbl}>PAN எண் — PAN No</label>
            <input value={form.surety_pan} onChange={e => f("surety_pan", e.target.value)} className={inp} placeholder="PAN number" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>முழு முகவரி — Full Address</label>
            <textarea value={form.surety_address} onChange={e => f("surety_address", e.target.value)} rows={2} className={`${inp} resize-none`} placeholder="Full address" />
          </div>
        </div>
      </div>

      {/* Declaration */}
      <div className="bg-canvas border border-line rounded-xl p-4 text-xs text-ink-dim space-y-2">
        <p className="font-semibold text-ink text-sm">உறுதிமொழி / Declaration</p>
        <p>மேலே குறிப்பிடப்பட்டுள்ள கடன் பரிவர்த்தனை தொடர்பாக, ஒப்புக்கொள்ளப்பட்ட காலக்கெடுவிற்குள் முழுத் தொகையையும் செலுத்துவேன் / செலுத்துவோம் அல்லது ஒப்புக்கொள்ளப்பட்ட பொருளை சபரிநாதன் ஜுவல்லர்ஸிடம் திருப்பி ஒப்படைப்பேன் / ஒப்படைப்போம்.</p>
        <p>"ரேட் நிர்ணயம் செய்யப்படவில்லை" என குறிப்பிடப்பட்டிருந்தால், இறுதி செட்டில்மென்ட் ரேட் இருதரப்பும் ஒப்புக்கொண்டபடி பதிவு செய்யப்படும். வாடிக்கையாளர் மற்றும் உத்தரவாததாரர், குறிப்பிட்ட காலக்கெடுவிற்குள் தொகை அல்லது பொருள் திருப்பிச் செலுத்தப்படுவதற்கு கூட்டுப் பொறுப்பு ஏற்கின்றனர். ஒப்புக்கொண்ட தேதிக்குள் செலுத்தத் தவறினால் அல்லது பொருளைத் திருப்பி ஒப்படைக்கத் தவறினால், நிலுவைத் தொகை மற்றும் / அல்லது பொருளை சட்டப்படி மீட்டெடுக்க சபரிநாதன் ஜுவல்லர்ஸ் தேவையான சட்ட நடவடிக்கைகளை மேற்கொள்ளலாம்.</p>
        <p>வழங்கப்பட்ட அனைத்து தகவல்களும் உண்மையானவை மற்றும் சரியானவை என உறுதி செய்கிறேன் / செய்கிறோம்.</p>
      </div>

      {err && <p className="text-sm text-err bg-err/5 rounded-lg2 px-3 py-2">{err}</p>}

      <div className="flex gap-3">
        <button onClick={() => setView("list")} className="flex-1 border border-line rounded-lg2 py-2.5 text-sm text-ink-dim hover:text-ink">Cancel</button>
        <button onClick={() => save.mutate()} disabled={save.isPending || !form.customer_name.trim()}
          className="flex-1 bg-gold text-white rounded-lg2 py-2.5 text-sm font-semibold disabled:opacity-40">
          {save.isPending ? "Saving…" : "Save Form"}
        </button>
      </div>
    </div>
  );

  // ── Detail view ─────────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    const r = selected!;

    function whatsAppText() {
      const lines = [
        `*Credit Security Form — சபரிநாதன் ஜுவல்லர்ஸ்*`,
        r.bill_order_no ? `Bill/Order No: ${r.bill_order_no}` : null,
        `Date: ${shortDate(r.form_date)}${r.form_time ? ` ${r.form_time}` : ""}`,
        ``,
        `*Customer*`,
        `Name: ${r.customer_name}`,
        r.customer_phone ? `Phone: ${r.customer_phone}` : null,
        r.loan_amount ? `Loan Amount: ₹${Number(r.loan_amount).toLocaleString("en-IN")}` : null,
        r.rate_fixed !== null ? `Rate: ${r.rate_fixed ? `Fixed — ₹${r.agreed_rate ?? ""}` : "Not Fixed"}` : null,
        r.due_date ? `Due Date: ${shortDate(r.due_date)}` : null,
        ``,
        r.kyc_full_name ? `*KYC*` : null,
        r.kyc_full_name ? `Full Name: ${r.kyc_full_name}` : null,
        r.kyc_aadhaar_no ? `Aadhaar: ${r.kyc_aadhaar_no}` : null,
        r.kyc_pan_no ? `PAN: ${r.kyc_pan_no}` : null,
        r.kyc_phone ? `Phone: ${r.kyc_phone}` : null,
        r.kyc_address ? `Address: ${r.kyc_address}` : null,
        r.surety_full_name ? `` : null,
        r.surety_full_name ? `*Surety*` : null,
        r.surety_full_name ? `Name: ${r.surety_full_name}` : null,
        r.surety_phone ? `Phone: ${r.surety_phone}` : null,
      ].filter(Boolean).join("\n");
      window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
    }

    function printForm() {
      const win = window.open("", "_blank");
      if (!win) return;
      const docLabel = [r.doc_aadhaar && "Aadhaar", r.doc_pan && "PAN", r.doc_address && "Address Proof", r.doc_others].filter(Boolean).join(", ");
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Credit Security — ${r.customer_name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil&display=swap');
  body{font-family:'Noto Sans Tamil',Arial,sans-serif;font-size:12px;color:#111;margin:20px;line-height:1.5}
  h1{font-size:16px;text-align:center;margin:0}
  .sub{text-align:center;color:#555;font-size:11px;margin-bottom:10px}
  .photos{display:flex;gap:20px;margin:10px 0}
  .photo-wrap{text-align:center}
  img.photo{width:110px;height:140px;object-fit:cover;border:1px solid #ccc}
  .photo-ph{width:110px;height:140px;border:1px dashed #ccc;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#aaa}
  h2{font-size:12px;font-weight:bold;background:#f0f0f0;padding:3px 6px;margin:10px 0 4px;border-left:3px solid #c9a84c}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  td{padding:3px 6px;border:1px solid #ddd;vertical-align:top}
  td.lbl{width:40%;font-weight:bold;background:#fafafa;color:#444;font-size:11px}
  .decl{font-size:10px;color:#333;border:1px solid #ccc;padding:8px;margin:10px 0;line-height:1.6}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px;font-size:11px}
  .sig-box{border-top:1px solid #333;padding-top:4px}
  .footer{text-align:center;font-size:10px;color:#888;margin-top:16px;border-top:1px solid #ddd;padding-top:6px}
  .rate-box{display:inline-flex;gap:16px;margin:4px 0}
  .cb{display:inline-block;width:10px;height:10px;border:1px solid #333;margin-right:3px;vertical-align:middle;background:${r.rate_fixed === true ? "#c9a84c" : "white"}}
  .cb2{display:inline-block;width:10px;height:10px;border:1px solid #333;margin-right:3px;vertical-align:middle;background:${r.rate_fixed === false ? "#c9a84c" : "white"}}
</style></head><body>
<h1>சபரிநாதன் ஜுவல்லர்ஸ் — Sabarinathan Jewellers</h1>
<p class="sub">கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம் — Credit Security Form</p>

<div class="photos">
  <div class="photo-wrap">
    ${r.photo1_data ? `<img src="${r.photo1_data}" class="photo">` : `<div class="photo-ph">Customer Photo</div>`}
    <div style="font-size:10px;margin-top:3px">வாடிக்கையாளர் புகைப்படம்<br>Customer Photo</div>
  </div>
  <div class="photo-wrap">
    ${r.photo2_data ? `<img src="${r.photo2_data}" class="photo">` : `<div class="photo-ph">Jewellery Photo</div>`}
    <div style="font-size:10px;margin-top:3px">நகை / பொருள் புகைப்படம்<br>Jewellery Photo</div>
  </div>
  <div style="font-size:11px;margin-left:auto;align-self:flex-end">
    <div>புகைப்படம் ஒட்டிய தேதி / Photo Date:</div>
    <div><strong>${r.photo_date ? shortDate(r.photo_date) : "___/___/______"}</strong></div>
  </div>
</div>

<h2>கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்</h2>
<table>
  <tr><td class="lbl">பில் எண் / ஆர்டர் எண்</td><td>${r.bill_order_no ?? ""}</td><td class="lbl">தேதி / நேரம்</td><td>${shortDate(r.form_date)} ${r.form_time ?? ""}</td></tr>
  <tr><td class="lbl">வாடிக்கையாளர் பெயர்</td><td colspan="3">${r.customer_name}</td></tr>
  <tr><td class="lbl">கைபேசி எண்</td><td>${r.customer_phone ?? ""}</td><td class="lbl">கடன் தொகை / மதிப்பு</td><td>${r.loan_amount ? `₹${Number(r.loan_amount).toLocaleString("en-IN")}` : ""}</td></tr>
  <tr>
    <td class="lbl">ரேட் நிபந்தனை</td>
    <td colspan="3">
      <span class="cb"></span> ரேட் நிர்ணயம் செய்யப்பட்டது &nbsp;&nbsp;
      <span class="cb2"></span> ரேட் நிர்ணயம் செய்யப்படவில்லை
    </td>
  </tr>
  ${r.rate_fixed ? `<tr><td class="lbl">ஒப்புக்கொண்ட ரேட் / தேதி</td><td colspan="3">₹${r.agreed_rate ?? ""} / ${r.agreed_rate_date ? shortDate(r.agreed_rate_date) : ""}</td></tr>` : ""}
  <tr><td class="lbl">செலுத்த வேண்டிய தேதி</td><td colspan="3">${r.due_date ? shortDate(r.due_date) : ""}</td></tr>
</table>

<h2>வாடிக்கையாளர் / KYC விவரங்கள்</h2>
<table>
  <tr><td class="lbl">வாடிக்கையாளர் முழுப் பெயர்</td><td colspan="3">${r.kyc_full_name ?? ""}</td></tr>
  <tr><td class="lbl">ஆதார் அட்டையில் உள்ள பெயர்</td><td colspan="3">${r.kyc_aadhaar_name ?? ""}</td></tr>
  <tr><td class="lbl">ஆதார் எண்</td><td>${r.kyc_aadhaar_no ?? ""}</td><td class="lbl">PAN எண்</td><td>${r.kyc_pan_no ?? ""}</td></tr>
  <tr><td class="lbl">கைபேசி எண்</td><td>${r.kyc_phone ?? ""}</td><td class="lbl">மாற்று கைபேசி</td><td>${r.kyc_alt_phone ?? ""}</td></tr>
  <tr><td class="lbl">முழு முகவரி</td><td colspan="3">${r.kyc_address ?? ""}</td></tr>
  <tr><td class="lbl">அங்கீகரிக்கப்பட்ட நபர்</td><td colspan="3">${r.authorizer_name ?? ""}</td></tr>
  <tr><td class="lbl">சரிபார்க்கப்பட்ட ஆவணங்கள்</td><td colspan="3">${docLabel || "—"}</td></tr>
</table>

${r.surety_full_name || r.surety_phone ? `
<h2>SURETY / உத்தரவாததாரர் விவரங்கள்</h2>
<table>
  <tr><td class="lbl">உத்தரவாததாரர் முழுப் பெயர்</td><td colspan="3">${r.surety_full_name ?? ""}</td></tr>
  <tr><td class="lbl">ஆதார் அட்டையில் உள்ள பெயர்</td><td colspan="3">${r.surety_aadhaar_name ?? ""}</td></tr>
  <tr><td class="lbl">கைபேசி எண்</td><td>${r.surety_phone ?? ""}</td><td class="lbl">மாற்று கைபேசி</td><td>${r.surety_alt_phone ?? ""}</td></tr>
  <tr><td class="lbl">ஆதார் / அடையாள எண்</td><td>${r.surety_aadhaar_no ?? ""}</td><td class="lbl">PAN எண்</td><td>${r.surety_pan ?? ""}</td></tr>
  <tr><td class="lbl">முழு முகவரி</td><td colspan="3">${r.surety_address ?? ""}</td></tr>
</table>` : ""}

<div class="decl">
  <strong>உறுதிமொழி / Declaration</strong><br>
  மேலே குறிப்பிடப்பட்டுள்ள கடன் பரிவர்த்தனை தொடர்பாக, ஒப்புக்கொள்ளப்பட்ட காலக்கெடுவிற்குள் முழுத் தொகையையும் செலுத்துவேன் / செலுத்துவோம் அல்லது ஒப்புக்கொள்ளப்பட்ட பொருளை சபரிநாதன் ஜுவல்லர்ஸிடம் திருப்பி ஒப்படைப்பேன் / ஒப்படைப்போம். "ரேட் நிர்ணயம் செய்யப்படவில்லை" என குறிப்பிடப்பட்டிருந்தால், இறுதி செட்டில்மென்ட் ரேட் இருதரப்பும் ஒப்புக்கொண்டபடி பதிவு செய்யப்படும். வாடிக்கையாளர் மற்றும் உத்தரவாததாரர், குறிப்பிட்ட காலக்கெடுவிற்குள் தொகை அல்லது பொருள் திருப்பிச் செலுத்தப்படுவதற்கு கூட்டுப் பொறுப்பு ஏற்கின்றனர். ஒப்புக்கொண்ட தேதிக்குள் செலுத்தத் தவறினால் அல்லது பொருளைத் திருப்பி ஒப்படைக்கத் தவறினால், சட்டப்படி மீட்டெடுக்க சபரிநாதன் ஜுவல்லர்ஸ் தேவையான சட்ட நடவடிக்கைகளை மேற்கொள்ளலாம். வழங்கப்பட்ட அனைத்து தகவல்களும் உண்மையானவை மற்றும் சரியானவை என உறுதி செய்கிறேன் / செய்கிறோம்.
</div>

<div class="sigs">
  <div><div class="sig-box">வாடிக்கையாளர் கையொப்பம் / Customer Signature</div><div style="margin-top:6px">பெயர்: ${r.customer_name}</div></div>
  <div><div class="sig-box">உத்தரவாததாரர் கையொப்பம் / Surety Signature</div><div style="margin-top:6px">பெயர்: ${r.surety_full_name ?? "___________"}</div></div>
  <div><div class="sig-box">பணியாளர் கையொப்பம் / Staff Signature</div><div style="margin-top:6px">பெயர்: ${r.recorded_by_name ?? "___________"}</div></div>
  <div><div class="sig-box">அங்கீகரிக்கப்பட்ட நபர் கையொப்பம் / Authorizer Signature</div><div style="margin-top:6px">பெயர்: ${r.authorizer_name ?? "___________"}</div></div>
</div>

<div style="display:flex;gap:40px;margin-top:20px;font-size:11px">
  <div>தேதி / Date: ____/____/______</div>
  <div>இடம் / Place: ____________</div>
</div>

<div class="footer">சபரிநாதன் ஜுவல்லர்ஸ் | வாடிக்கையாளர் நகல் / அலுவலக நகல்</div>
</body></html>`);
      win.document.close(); win.focus();
      setTimeout(() => win.print(), 600);
    }

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {bigPhoto && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={() => setBigPhoto(null)}>
            <img src={bigPhoto} alt="photo" className="max-w-sm max-h-[85vh] rounded-xl border-4 border-white object-contain" />
          </div>
        )}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold">{r.customer_name}</h1>
            <p className="text-xs text-ink-dim">{shortDate(r.form_date)}{r.bill_order_no ? ` · ${r.bill_order_no}` : ""} · {r.recorded_by_name ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={whatsAppText}
              className="flex items-center gap-1.5 bg-[#25D366] text-white px-3 py-1.5 rounded-lg2 text-sm font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </button>
            <button onClick={printForm}
              className="flex items-center gap-1.5 border border-line px-3 py-1.5 rounded-lg2 text-sm text-ink-dim hover:text-ink hover:border-gold transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
              Print
            </button>
            {isAdmin && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 border border-err/40 text-err px-3 py-1.5 rounded-lg2 text-sm hover:bg-err/5 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete
              </button>
            )}
            <button onClick={() => { setConfirmDelete(false); setView("list"); }} className="text-sm text-ink-dim hover:text-ink">← Back</button>
          </div>
        </div>

        {confirmDelete && (
          <div className="bg-err/5 border border-err/30 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-err font-medium">Delete this form permanently?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="text-sm px-3 py-1.5 border border-line rounded-lg2 text-ink-dim hover:text-ink">Cancel</button>
              <button onClick={() => del.mutate(r.id)} disabled={del.isPending}
                className="text-sm px-3 py-1.5 bg-err text-white rounded-lg2 font-medium disabled:opacity-50">
                {del.isPending ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        )}

        {/* Photos */}
        {(r.photo1_data || r.photo2_data) && (
          <div className={sec}>
            <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">புகைப்படங்கள் / Photos</p>
            <div className="flex gap-4 flex-wrap">
              {r.photo1_data && <div className="text-center"><img src={r.photo1_data} onClick={() => setBigPhoto(r.photo1_data!)} className="w-28 h-36 object-cover rounded-lg border border-line cursor-pointer hover:opacity-80" /><p className="text-[10px] text-ink-dim mt-1">Customer</p></div>}
              {r.photo2_data && <div className="text-center"><img src={r.photo2_data} onClick={() => setBigPhoto(r.photo2_data!)} className="w-28 h-36 object-cover rounded-lg border border-line cursor-pointer hover:opacity-80" /><p className="text-[10px] text-ink-dim mt-1">Jewellery</p></div>}
            </div>
            {r.photo_date && <p className="text-xs text-ink-dim">Photo date: {shortDate(r.photo_date)}</p>}
          </div>
        )}

        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {r.loan_amount && <Tile label="Loan Amount" value={`₹${Number(r.loan_amount).toLocaleString("en-IN")}`} />}
          {r.rate_fixed !== null && <Tile label="Rate" value={r.rate_fixed ? `Fixed ₹${r.agreed_rate ?? ""}` : "Not Fixed"} />}
          {r.due_date && <Tile label="Due Date" value={shortDate(r.due_date)} />}
        </div>

        <DetailSection title="வாடிக்கையாளர் / Customer">
          <R label="Name" v={r.customer_name} />
          <R label="Phone" v={r.customer_phone} />
          <R label="Bill/Order No" v={r.bill_order_no} />
        </DetailSection>

        <DetailSection title="KYC விவரங்கள்">
          <R label="Full Name" v={r.kyc_full_name} />
          <R label="Aadhaar Name" v={r.kyc_aadhaar_name} />
          <R label="Aadhaar No" v={r.kyc_aadhaar_no} />
          <R label="PAN" v={r.kyc_pan_no} />
          <R label="Phone" v={r.kyc_phone} />
          <R label="Alt Phone" v={r.kyc_alt_phone} />
          <R label="Address" v={r.kyc_address} />
          <R label="Authorizer" v={r.authorizer_name} />
          <R label="Documents" v={[r.doc_aadhaar && "Aadhaar", r.doc_pan && "PAN", r.doc_address && "Address Proof", r.doc_others].filter(Boolean).join(", ") || null} />
        </DetailSection>

        {(r.surety_full_name || r.surety_phone) && (
          <DetailSection title="SURETY / உத்தரவாததாரர்">
            <R label="Full Name" v={r.surety_full_name} />
            <R label="Aadhaar Name" v={r.surety_aadhaar_name} />
            <R label="Phone" v={r.surety_phone} />
            <R label="Alt Phone" v={r.surety_alt_phone} />
            <R label="Aadhaar/ID No" v={r.surety_aadhaar_no} />
            <R label="PAN" v={r.surety_pan} />
            <R label="Address" v={r.surety_address} />
          </DetailSection>
        )}
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Credit Security Forms</h1>
          <p className="text-xs text-ink-dim">கடன் / பாதுகாப்பு உறுதிமொழிப் படிவம்</p>
        </div>
        <button onClick={() => setView("new")} className="bg-gold text-white px-4 py-2 rounded-lg2 text-sm font-semibold">+ New Form</button>
      </div>

      {isLoading ? <p className="text-sm text-ink-dim">Loading…</p> : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-line shadow-soft p-10 text-center">
          <p className="text-ink-dim text-sm">No forms yet.</p>
          <button onClick={() => setView("new")} className="mt-3 text-sm text-gold hover:underline">Create the first one →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(rec => (
            <button key={rec.id} onClick={() => { setSelected(rec); setView("detail"); }}
              className="w-full bg-white border border-line rounded-xl shadow-soft px-4 py-3 flex items-center gap-4 hover:border-gold/40 transition-colors text-left">
              <div className="flex gap-1 shrink-0">
                {[rec.photo1_data, rec.photo2_data].map((p, i) => p
                  ? <img key={i} src={p} className="w-10 h-12 object-cover rounded border border-line" />
                  : <div key={i} className="w-10 h-12 bg-canvas border border-line rounded flex items-center justify-center"><span className="text-[9px] text-ink-dim">—</span></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{rec.customer_name}</p>
                <p className="text-xs text-ink-dim truncate">
                  {shortDate(rec.form_date)}{rec.bill_order_no ? ` · ${rec.bill_order_no}` : ""}{rec.customer_phone ? ` · ${rec.customer_phone}` : ""}
                </p>
              </div>
              {rec.loan_amount && <p className="text-sm font-bold text-gold shrink-0">₹{Number(rec.loan_amount).toLocaleString("en-IN")}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-soft p-3 text-center">
      <p className="text-sm font-bold text-gold">{value}</p>
      <p className="text-[10px] text-ink-dim mt-0.5">{label}</p>
    </div>
  );
}
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-xl shadow-soft p-4 space-y-2">
      <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}
function R({ label, v }: { label: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-ink-dim w-28 shrink-0 text-xs mt-0.5">{label}</span>
      <span className="flex-1 whitespace-pre-wrap">{v}</span>
    </div>
  );
}
