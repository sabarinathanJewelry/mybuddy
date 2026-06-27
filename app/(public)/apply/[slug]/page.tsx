"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const SECTIONS_LIST = [
  { key: "gold",      label: "Gold" },
  { key: "silver",    label: "Silver" },
  { key: "diamond",   label: "Diamond" },
  { key: "billing",   label: "Billing" },
  { key: "inventory", label: "Inventory" },
  { key: "old_gold",  label: "Old Gold Exchange" },
];

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white";
const ta = `${inp} resize-none`;
const lbl = "block text-sm font-medium text-gray-700 mb-1";
const sec = "bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5";
const secTitle = "text-base font-bold text-gray-800 pb-2 border-b border-gray-100";

type Form = {
  full_name: string; age: string; mobile: string; address: string;
  current_company: string; jewellery_experience: string; current_designation: string;
  current_salary: string; incentive: string; notice_period: string; reason_leaving: string;
  sections_worked: string[];
  daily_responsibilities: string; biggest_achievement: string; skills_to_improve: string;
  handle_making_charges: string; handle_angry_customer: string; old_gold_experience: string;
  expected_salary: string; salary_justification: string;
  stay_if_raised: string; stay_explanation: string; career_vision: string;
  disciplinary_action: string; willing_extended_hours: string;
  additional_info: string;
};

const empty: Form = {
  full_name: "", age: "", mobile: "", address: "",
  current_company: "", jewellery_experience: "", current_designation: "",
  current_salary: "", incentive: "", notice_period: "", reason_leaving: "",
  sections_worked: [],
  daily_responsibilities: "", biggest_achievement: "", skills_to_improve: "",
  handle_making_charges: "", handle_angry_customer: "", old_gold_experience: "",
  expected_salary: "", salary_justification: "",
  stay_if_raised: "", stay_explanation: "", career_vision: "",
  disciplinary_action: "", willing_extended_hours: "",
  additional_info: "",
};

export default function ApplyFormPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [position, setPosition] = useState<{ name: string; slug: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    supabase()
      .from("job_positions")
      .select("name, slug")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPosition(data as any);
        else setNotFound(true);
      });
  }, [slug]);

  function set(field: keyof Form, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleSection(key: string) {
    setForm(f => ({
      ...f,
      sections_worked: f.sections_worked.includes(key)
        ? f.sections_worked.filter(s => s !== key)
        : [...f.sections_worked, key],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.mobile.trim()) {
      setError("Full name and mobile number are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const { error: dbErr } = await supabase().from("job_applications").insert({
        position_name: position?.name ?? null,
        position_slug: slug,
        full_name: form.full_name.trim(),
        age: form.age ? parseInt(form.age) : null,
        mobile: form.mobile.trim(),
        address: form.address || null,
        current_company: form.current_company || null,
        jewellery_experience: form.jewellery_experience || null,
        current_designation: form.current_designation || null,
        current_salary: form.current_salary || null,
        incentive: form.incentive || null,
        notice_period: form.notice_period || null,
        reason_leaving: form.reason_leaving || null,
        sections_worked: form.sections_worked.length ? form.sections_worked : null,
        daily_responsibilities: form.daily_responsibilities || null,
        biggest_achievement: form.biggest_achievement || null,
        skills_to_improve: form.skills_to_improve || null,
        handle_making_charges: form.handle_making_charges || null,
        handle_angry_customer: form.handle_angry_customer || null,
        old_gold_experience: form.old_gold_experience || null,
        expected_salary: form.expected_salary || null,
        salary_justification: form.salary_justification || null,
        stay_if_raised: form.stay_if_raised || null,
        stay_explanation: form.stay_explanation || null,
        career_vision: form.career_vision || null,
        disciplinary_action: form.disciplinary_action === "yes" ? true : form.disciplinary_action === "no" ? false : null,
        willing_extended_hours: form.willing_extended_hours === "yes" ? true : form.willing_extended_hours === "no" ? false : null,
        additional_info: form.additional_info || null,
      });
      if (dbErr) throw dbErr;
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-4xl">🔍</p>
          <p className="text-gray-700 font-semibold">Position not found or no longer accepting applications.</p>
          <a href="/apply" className="text-sm text-yellow-600 underline">View open positions</a>
        </div>
      </div>
    );
  }

  if (!position) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-sm text-gray-400">Loading…</p></div>;
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-md w-full text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold text-gray-800">Application Submitted!</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Thank you for applying for <strong>{position.name}</strong> at Sabarinathan Jewellers.
            We will get back to you if your profile matches our requirements.
          </p>
          <p className="text-xs text-gray-400 pt-2">You may close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-1 pb-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-100 mb-2">
            <span className="text-2xl">💍</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Sabarinathan Jewellers</h1>
          <div className="inline-block bg-yellow-100 text-yellow-800 text-xs font-semibold px-3 py-1 rounded-full mt-1">
            Applying for: {position.name}
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-800 leading-relaxed">
          👋 Thank you for your interest in joining Sabarinathan Jewellers. Kindly answer the following questions honestly.
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Personal Details */}
          <div className={sec}>
            <p className={secTitle}>Personal Details</p>
            <div>
              <label className={lbl}>1. Full Name <span className="text-red-500">*</span></label>
              <input className={inp} value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Your full name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>2. Age</label>
                <input className={inp} type="number" min="18" max="60" value={form.age} onChange={e => set("age", e.target.value)} placeholder="e.g. 26" />
              </div>
              <div>
                <label className={lbl}>3. Mobile Number <span className="text-red-500">*</span></label>
                <input className={inp} type="tel" value={form.mobile} onChange={e => set("mobile", e.target.value)} placeholder="10-digit number" />
              </div>
            </div>
            <div>
              <label className={lbl}>4. Current Address</label>
              <textarea className={ta} rows={2} value={form.address} onChange={e => set("address", e.target.value)} placeholder="Your current residential address" />
            </div>
          </div>

          {/* Current Employment */}
          <div className={sec}>
            <p className={secTitle}>Current Employment</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>5. Current Company</label>
                <input className={inp} value={form.current_company} onChange={e => set("current_company", e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <label className={lbl}>6. Total Jewellery Experience</label>
                <input className={inp} value={form.jewellery_experience} onChange={e => set("jewellery_experience", e.target.value)} placeholder="e.g. 3 years" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>7. Current Designation</label>
                <input className={inp} value={form.current_designation} onChange={e => set("current_designation", e.target.value)} placeholder="e.g. Sales Executive" />
              </div>
              <div>
                <label className={lbl}>8. Current Salary (Take Home)</label>
                <input className={inp} value={form.current_salary} onChange={e => set("current_salary", e.target.value)} placeholder="e.g. ₹18,000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>9. Incentive (if any)</label>
                <input className={inp} value={form.incentive} onChange={e => set("incentive", e.target.value)} placeholder="e.g. ₹2,000/month" />
              </div>
              <div>
                <label className={lbl}>10. Notice Period</label>
                <input className={inp} value={form.notice_period} onChange={e => set("notice_period", e.target.value)} placeholder="e.g. 1 month" />
              </div>
            </div>
            <div>
              <label className={lbl}>11. Reason for Leaving Current Job</label>
              <textarea className={ta} rows={2} value={form.reason_leaving} onChange={e => set("reason_leaving", e.target.value)} placeholder="Be honest..." />
            </div>
          </div>

          {/* Jewellery Knowledge */}
          <div className={sec}>
            <p className={secTitle}>Jewellery Knowledge</p>
            <div>
              <label className={lbl}>12. Which section have you worked in?</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {SECTIONS_LIST.map(s => (
                  <label key={s.key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={form.sections_worked.includes(s.key)}
                      onChange={() => toggleSection(s.key)} className="w-4 h-4 accent-yellow-500 rounded" />
                    <span className="text-sm text-gray-700">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>13. What are your daily responsibilities?</label>
              <textarea className={ta} rows={3} value={form.daily_responsibilities} onChange={e => set("daily_responsibilities", e.target.value)} placeholder="Describe your day-to-day work..." />
            </div>
            <div>
              <label className={lbl}>14. What is your biggest achievement in your current job?</label>
              <textarea className={ta} rows={2} value={form.biggest_achievement} onChange={e => set("biggest_achievement", e.target.value)} placeholder="Share something you are proud of..." />
            </div>
            <div>
              <label className={lbl}>15. What skills would you like to improve?</label>
              <textarea className={ta} rows={2} value={form.skills_to_improve} onChange={e => set("skills_to_improve", e.target.value)} placeholder="Be honest about areas of growth..." />
            </div>
          </div>

          {/* Customer Handling */}
          <div className={sec}>
            <p className={secTitle}>Customer Handling</p>
            <div>
              <label className={lbl}>16. If a customer says our making charges are high, how would you convince them?</label>
              <textarea className={ta} rows={3} value={form.handle_making_charges} onChange={e => set("handle_making_charges", e.target.value)} placeholder="Your approach..." />
            </div>
            <div>
              <label className={lbl}>17. How would you handle an angry customer?</label>
              <textarea className={ta} rows={3} value={form.handle_angry_customer} onChange={e => set("handle_angry_customer", e.target.value)} placeholder="Your approach..." />
            </div>
            <div>
              <label className={lbl}>18. Have you ever handled old gold exchange? If yes, explain briefly.</label>
              <textarea className={ta} rows={2} value={form.old_gold_experience} onChange={e => set("old_gold_experience", e.target.value)} placeholder="Yes / No — and details if yes..." />
            </div>
          </div>

          {/* Salary & Career */}
          <div className={sec}>
            <p className={secTitle}>Salary & Career</p>
            <div>
              <label className={lbl}>19. Expected Salary</label>
              <input className={inp} value={form.expected_salary} onChange={e => set("expected_salary", e.target.value)} placeholder="e.g. ₹22,000" />
            </div>
            <div>
              <label className={lbl}>20. Why do you think you deserve this salary?</label>
              <textarea className={ta} rows={2} value={form.salary_justification} onChange={e => set("salary_justification", e.target.value)} placeholder="Your reasoning..." />
            </div>
            <div>
              <label className={lbl}>21. If your current employer increases your salary, will you stay there?</label>
              <div className="flex flex-col gap-2 mt-1">
                {["yes", "no", "maybe"].map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="radio" name="stay_if_raised" value={opt}
                      checked={form.stay_if_raised === opt}
                      onChange={() => set("stay_if_raised", opt)}
                      className="w-4 h-4 accent-yellow-500" />
                    <span className="text-sm text-gray-700 capitalize">{opt}</span>
                  </label>
                ))}
              </div>
              {form.stay_if_raised === "maybe" && (
                <div className="mt-2">
                  <label className={lbl}>Please explain:</label>
                  <textarea className={ta} rows={2} value={form.stay_explanation} onChange={e => set("stay_explanation", e.target.value)} placeholder="Explain your answer..." />
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>22. Where do you see yourself in the next 3 years?</label>
              <textarea className={ta} rows={2} value={form.career_vision} onChange={e => set("career_vision", e.target.value)} placeholder="Your career goals..." />
            </div>
          </div>

          {/* Integrity */}
          <div className={sec}>
            <p className={secTitle}>Integrity & Commitment</p>
            <div>
              <label className={lbl}>23. Have you ever received any warning or disciplinary action at work?</label>
              <div className="flex gap-6 mt-1">
                {["yes", "no"].map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="radio" name="disciplinary" value={opt}
                      checked={form.disciplinary_action === opt}
                      onChange={() => set("disciplinary_action", opt)}
                      className="w-4 h-4 accent-yellow-500" />
                    <span className="text-sm text-gray-700 capitalize">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>24. Are you willing to work during festivals, weekends and extended business hours?</label>
              <div className="flex gap-6 mt-1">
                {["yes", "no"].map(opt => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="radio" name="extended_hours" value={opt}
                      checked={form.willing_extended_hours === opt}
                      onChange={() => set("willing_extended_hours", opt)}
                      className="w-4 h-4 accent-yellow-500" />
                    <span className="text-sm text-gray-700 capitalize">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>25. Is there anything else you would like us to know about you?</label>
              <textarea className={ta} rows={3} value={form.additional_info} onChange={e => set("additional_info", e.target.value)} placeholder="Optional..." />
            </div>
          </div>

          {/* Declaration */}
          <div className={sec}>
            <p className={secTitle}>Declaration</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              I confirm that the above information is true to the best of my knowledge.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className={lbl}>Name</label>
                <p className="text-sm font-semibold text-gray-800 py-2">{form.full_name || "—"}</p>
              </div>
              <div>
                <label className={lbl}>Date</label>
                <p className="text-sm font-semibold text-gray-800 py-2">
                  {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-yellow-500 hover:bg-yellow-600 active:scale-[0.99] text-white font-bold text-base transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md">
            {submitting ? "Submitting…" : "Submit Application"}
          </button>

          <p className="text-center text-xs text-gray-400 pb-4">Sabarinathan Jewellers · Confidential</p>
        </form>
      </div>
    </div>
  );
}
