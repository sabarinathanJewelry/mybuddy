"use client";

import { useState } from "react";
import {
  useGoldsmithJobs,
  useCreateGoldsmithJob,
  useUpdateGoldsmithJob,
  GoldsmithJob,
} from "@/modules/goldsmith/api";
import { inr, grams, shortDate } from "@/lib/format";

const PURITY_LABELS: Record<string, string> = {
  gold_24k: "Gold 24K (Pure)",
  gold_22k: "Gold 22K",
  gold_18k: "Gold 18K",
  silver_pure: "Silver Pure",
};

const PURITY_FACTOR: Record<string, number> = {
  gold_24k: 24 / 24,
  gold_22k: 22 / 24,
  gold_18k: 18 / 24,
  silver_pure: 1,
};

function pureGrams(g: number, purity: string): number {
  return g * (PURITY_FACTOR[purity] ?? 1);
}

const inp =
  "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

type FilterTab = "all" | "sent" | "received" | "sold";

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-warn/15 text-warn",
  received: "bg-info/15 text-info",
  sold: "bg-ok/15 text-ok",
};

export default function GoldsmithJobsPage() {
  const { data: jobs = [], isLoading } = useGoldsmithJobs();
  const createJob = useCreateGoldsmithJob();
  const updateJob = useUpdateGoldsmithJob();

  const [tab, setTab] = useState<FilterTab>("all");
  const [showNewForm, setShowNewForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // New job form state
  const [form, setForm] = useState({
    goldsmith_name: "",
    item_description: "",
    sent_date: new Date().toISOString().slice(0, 10),
    sent_purity: "gold_24k",
    sent_grams: "",
    notes: "",
  });
  const [formErr, setFormErr] = useState("");

  // Receive form state
  const [receiveForm, setReceiveForm] = useState<Record<string, {
    received_date: string;
    received_purity: string;
    received_grams: string;
    charges_amount: string;
    charges_notes: string;
  }>>({});

  // Sold form state
  const [soldForm, setSoldForm] = useState<Record<string, {
    sale_date: string;
    sale_amount: string;
  }>>({});

  function getReceiveForm(id: string) {
    return receiveForm[id] ?? {
      received_date: new Date().toISOString().slice(0, 10),
      received_purity: "gold_22k",
      received_grams: "",
      charges_amount: "",
      charges_notes: "",
    };
  }

  function getSoldForm(id: string) {
    return soldForm[id] ?? {
      sale_date: new Date().toISOString().slice(0, 10),
      sale_amount: "",
    };
  }

  async function handleCreate() {
    setFormErr("");
    if (!form.goldsmith_name.trim()) { setFormErr("Goldsmith name required"); return; }
    if (!form.item_description.trim()) { setFormErr("Item description required"); return; }
    if (!form.sent_grams || isNaN(parseFloat(form.sent_grams)) || parseFloat(form.sent_grams) <= 0) {
      setFormErr("Enter valid grams sent");
      return;
    }
    try {
      await createJob.mutateAsync({
        goldsmith_name: form.goldsmith_name.trim(),
        item_description: form.item_description.trim(),
        sent_date: form.sent_date,
        sent_purity: form.sent_purity,
        sent_grams: parseFloat(form.sent_grams),
        notes: form.notes.trim() || undefined,
      });
      setForm({
        goldsmith_name: "",
        item_description: "",
        sent_date: new Date().toISOString().slice(0, 10),
        sent_purity: "gold_24k",
        sent_grams: "",
        notes: "",
      });
      setShowNewForm(false);
    } catch (e: any) {
      setFormErr(e.message ?? "Failed to create job");
    }
  }

  async function handleReceive(job: GoldsmithJob) {
    const rf = getReceiveForm(job.id);
    if (!rf.received_grams || isNaN(parseFloat(rf.received_grams))) return;
    await updateJob.mutateAsync({
      id: job.id,
      status: "received",
      received_date: rf.received_date,
      received_purity: rf.received_purity,
      received_grams: parseFloat(rf.received_grams),
      charges_amount: parseFloat(rf.charges_amount) || 0,
      charges_notes: rf.charges_notes.trim() || undefined,
    });
    setExpanded(null);
  }

  async function handleSold(job: GoldsmithJob) {
    const sf = getSoldForm(job.id);
    if (!sf.sale_amount || isNaN(parseFloat(sf.sale_amount))) return;
    await updateJob.mutateAsync({
      id: job.id,
      status: "sold",
      sale_date: sf.sale_date,
      sale_amount: parseFloat(sf.sale_amount),
    });
    setExpanded(null);
  }

  const filtered = jobs.filter((j) => tab === "all" || j.status === tab);

  const activeCount = jobs.filter((j) => j.status !== "sold").length;
  const goldOut = jobs
    .filter((j) => j.status === "sent")
    .reduce((sum, j) => sum + pureGrams(j.sent_grams, j.sent_purity), 0);
  const readyCount = jobs.filter((j) => j.status === "received").length;
  const soldThisMonth = jobs.filter((j) => {
    if (j.status !== "sold" || !j.sale_date) return false;
    const now = new Date();
    const d = new Date(j.sale_date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const soldThisMonthAmt = soldThisMonth.reduce((s, j) => s + (j.sale_amount ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Goldsmith Jobs</h1>
        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="bg-gold text-white px-4 py-2 rounded-lg2 text-sm font-semibold hover:bg-gold/90"
        >
          {showNewForm ? "Cancel" : "+ New Job"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-line rounded-xl p-3 shadow-soft">
          <p className="text-xs text-ink-dim">Active Jobs</p>
          <p className="text-2xl font-bold text-ink">{activeCount}</p>
        </div>
        <div className="bg-white border border-line rounded-xl p-3 shadow-soft">
          <p className="text-xs text-ink-dim">Gold With Goldsmiths</p>
          <p className="text-2xl font-bold text-warn">{grams(goldOut)} pure</p>
        </div>
        <div className="bg-white border border-line rounded-xl p-3 shadow-soft">
          <p className="text-xs text-ink-dim">Ready to Sell</p>
          <p className="text-2xl font-bold text-info">{readyCount}</p>
        </div>
        <div className="bg-white border border-line rounded-xl p-3 shadow-soft">
          <p className="text-xs text-ink-dim">Sold This Month</p>
          <p className="text-lg font-bold text-ok">{inr(soldThisMonthAmt)}</p>
        </div>
      </div>

      {/* New Job form */}
      {showNewForm && (
        <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-3">
          <p className="font-semibold text-ink text-sm">New Job — Send to Goldsmith</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Goldsmith Name</label>
              <input
                className={inp}
                placeholder="e.g. Murugan, Selvan"
                value={form.goldsmith_name}
                onChange={(e) => setForm((f) => ({ ...f, goldsmith_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Item Description</label>
              <input
                className={inp}
                placeholder="e.g. 16g 22K coin"
                value={form.item_description}
                onChange={(e) => setForm((f) => ({ ...f, item_description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Sent Date</label>
              <input
                type="date"
                className={inp}
                value={form.sent_date}
                onChange={(e) => setForm((f) => ({ ...f, sent_date: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-ink-dim block mb-1">Metal Sent</label>
                <select
                  className={inp}
                  value={form.sent_purity}
                  onChange={(e) => setForm((f) => ({ ...f, sent_purity: e.target.value }))}
                >
                  {Object.entries(PURITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="text-xs text-ink-dim block mb-1">Grams</label>
                <input
                  className={inp}
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={form.sent_grams}
                  onChange={(e) => setForm((f) => ({ ...f, sent_grams: e.target.value }))}
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-ink-dim block mb-1">Notes (optional)</label>
              <input
                className={inp}
                placeholder="e.g. die charge pre-agreed, order ref"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          {form.sent_grams && parseFloat(form.sent_grams) > 0 && (
            <p className="text-xs text-ink-dim">
              Pure gold equivalent:{" "}
              <span className="font-semibold text-ink">
                {grams(pureGrams(parseFloat(form.sent_grams), form.sent_purity))}
              </span>
            </p>
          )}
          {formErr && <p className="text-xs text-err">{formErr}</p>}
          <button
            onClick={handleCreate}
            disabled={createJob.isPending}
            className="bg-gold text-white px-5 py-2 rounded-lg2 text-sm font-semibold hover:bg-gold/90 disabled:opacity-50"
          >
            {createJob.isPending ? "Creating…" : "Create Job"}
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 text-sm">
        {(["all", "sent", "received", "sold"] as FilterTab[]).map((t) => {
          const counts = { all: jobs.length, sent: jobs.filter(j => j.status === "sent").length, received: jobs.filter(j => j.status === "received").length, sold: jobs.filter(j => j.status === "sold").length };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg2 font-medium transition-colors capitalize ${
                tab === t
                  ? "bg-gold text-white"
                  : "bg-white border border-line text-ink-dim hover:text-ink"
              }`}
            >
              {t === "all" ? "All" : t === "sent" ? "With Goldsmith" : t === "received" ? "Ready to Sell" : "Sold"}
              <span className="ml-1.5 text-[11px] opacity-70">{counts[t]}</span>
            </button>
          );
        })}
      </div>

      {/* Jobs list */}
      {isLoading ? (
        <p className="text-ink-dim text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-ink-dim text-sm">No jobs found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              expanded={expanded === job.id}
              onToggle={() => setExpanded(expanded === job.id ? null : job.id)}
              receiveFormState={getReceiveForm(job.id)}
              onReceiveChange={(patch) =>
                setReceiveForm((prev) => ({
                  ...prev,
                  [job.id]: { ...getReceiveForm(job.id), ...patch },
                }))
              }
              onReceive={() => handleReceive(job)}
              soldFormState={getSoldForm(job.id)}
              onSoldChange={(patch) =>
                setSoldForm((prev) => ({
                  ...prev,
                  [job.id]: { ...getSoldForm(job.id), ...patch },
                }))
              }
              onSold={() => handleSold(job)}
              isPending={updateJob.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ReceiveFormState = {
  received_date: string;
  received_purity: string;
  received_grams: string;
  charges_amount: string;
  charges_notes: string;
};

type SoldFormState = {
  sale_date: string;
  sale_amount: string;
};

function JobRow({
  job,
  expanded,
  onToggle,
  receiveFormState,
  onReceiveChange,
  onReceive,
  soldFormState,
  onSoldChange,
  onSold,
  isPending,
}: {
  job: GoldsmithJob;
  expanded: boolean;
  onToggle: () => void;
  receiveFormState: ReceiveFormState;
  onReceiveChange: (p: Partial<ReceiveFormState>) => void;
  onReceive: () => void;
  soldFormState: SoldFormState;
  onSoldChange: (p: Partial<SoldFormState>) => void;
  onSold: () => void;
  isPending: boolean;
}) {
  const sentPure = pureGrams(job.sent_grams, job.sent_purity);
  const receivedPure = job.received_grams && job.received_purity
    ? pureGrams(job.received_grams, job.received_purity)
    : null;
  const loss = receivedPure != null ? sentPure - receivedPure : null;
  const lossWarn = loss != null && loss > 0.5;

  const profit = job.sale_amount != null
    ? job.sale_amount - (job.charges_amount ?? 0)
    : null;

  return (
    <div className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-ink-dim">{job.job_no}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[job.status]}`}>
              {job.status === "sent" ? "With Goldsmith" : job.status === "received" ? "Ready to Sell" : "Sold"}
            </span>
            {lossWarn && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-err/15 text-err">
                High Loss
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-ink mt-0.5">{job.item_description}</p>
          <p className="text-xs text-ink-dim">{job.goldsmith_name}</p>
        </div>

        <div className="text-right shrink-0 space-y-0.5">
          <div className="text-xs text-ink-dim">Sent {shortDate(job.sent_date)}</div>
          <div className="text-xs font-semibold text-ink">
            {grams(job.sent_grams)} {PURITY_LABELS[job.sent_purity] ?? job.sent_purity}
          </div>
          <div className="text-[11px] text-ink-dim">≈ {grams(sentPure)} pure</div>
        </div>

        {job.status === "received" || job.status === "sold" ? (
          <div className="text-right shrink-0 space-y-0.5 ml-2">
            <div className="text-xs text-ink-dim">
              Received {job.received_date ? shortDate(job.received_date) : "—"}
            </div>
            <div className="text-xs font-semibold text-ink">
              {job.received_grams ? grams(job.received_grams) : "—"}{" "}
              {job.received_purity ? (PURITY_LABELS[job.received_purity] ?? job.received_purity) : ""}
            </div>
            {loss != null && (
              <div className={`text-[11px] ${lossWarn ? "text-err font-semibold" : "text-ink-dim"}`}>
                Loss: {grams(loss)}
              </div>
            )}
          </div>
        ) : null}

        {job.status === "sold" && job.sale_amount != null ? (
          <div className="text-right shrink-0 space-y-0.5 ml-2">
            <div className="text-xs text-ink-dim">Sale {job.sale_date ? shortDate(job.sale_date) : ""}</div>
            <div className="text-sm font-bold text-ok">{inr(job.sale_amount)}</div>
            {profit != null && job.charges_amount > 0 && (
              <div className="text-[11px] text-ink-dim">Charges: {inr(job.charges_amount)}</div>
            )}
          </div>
        ) : null}

        {job.charges_amount > 0 && job.status === "received" && (
          <div className="text-right shrink-0 space-y-0.5 ml-2">
            <div className="text-xs text-ink-dim">Charges</div>
            <div className="text-sm font-semibold text-ink">{inr(job.charges_amount)}</div>
            {job.charges_notes && (
              <div className="text-[11px] text-ink-dim max-w-[120px] truncate">{job.charges_notes}</div>
            )}
          </div>
        )}

        {/* Action button */}
        {job.status !== "sold" && (
          <button
            onClick={onToggle}
            className="shrink-0 ml-2 text-xs font-semibold text-gold hover:underline"
          >
            {expanded ? "Close" : job.status === "sent" ? "Mark Received" : "Mark Sold"}
          </button>
        )}
      </div>

      {/* Expanded form — Receive */}
      {expanded && job.status === "sent" && (
        <div className="border-t border-line bg-canvas px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-ink">Mark Received</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Received Date</label>
              <input
                type="date"
                className={inp}
                value={receiveFormState.received_date}
                onChange={(e) => onReceiveChange({ received_date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Finished Item Metal</label>
              <select
                className={inp}
                value={receiveFormState.received_purity}
                onChange={(e) => onReceiveChange({ received_purity: e.target.value })}
              >
                {Object.entries(PURITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Received Weight (g)</label>
              <input
                className={inp}
                type="number"
                step="0.001"
                placeholder="0.000"
                value={receiveFormState.received_grams}
                onChange={(e) => onReceiveChange({ received_grams: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Goldsmith Charges (₹)</label>
              <input
                className={inp}
                type="number"
                step="0.01"
                placeholder="0"
                value={receiveFormState.charges_amount}
                onChange={(e) => onReceiveChange({ charges_amount: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-ink-dim block mb-1">Charges Notes</label>
              <input
                className={inp}
                placeholder="e.g. Die ₹92 + wastage 0.043g @ ₹15,070/g"
                value={receiveFormState.charges_notes}
                onChange={(e) => onReceiveChange({ charges_notes: e.target.value })}
              />
            </div>
          </div>
          {receiveFormState.received_grams && parseFloat(receiveFormState.received_grams) > 0 && (
            <p className="text-xs text-ink-dim">
              Pure equivalent received:{" "}
              <span className="font-semibold text-ink">
                {grams(pureGrams(parseFloat(receiveFormState.received_grams), receiveFormState.received_purity))}
              </span>
              {" · "}
              Loss from sent:{" "}
              <span className={`font-semibold ${
                sentPure - pureGrams(parseFloat(receiveFormState.received_grams), receiveFormState.received_purity) > 0.5
                  ? "text-err"
                  : "text-ink"
              }`}>
                {grams(sentPure - pureGrams(parseFloat(receiveFormState.received_grams), receiveFormState.received_purity))}
              </span>
            </p>
          )}
          <button
            onClick={onReceive}
            disabled={isPending || !receiveFormState.received_grams}
            className="bg-info text-white px-4 py-2 rounded-lg2 text-sm font-semibold hover:bg-info/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save — Mark Received"}
          </button>
        </div>
      )}

      {/* Expanded form — Sold */}
      {expanded && job.status === "received" && (
        <div className="border-t border-line bg-canvas px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-ink">Mark Sold</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-dim block mb-1">Sale Date</label>
              <input
                type="date"
                className={inp}
                value={soldFormState.sale_date}
                onChange={(e) => onSoldChange({ sale_date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-ink-dim block mb-1">Sale Amount (₹)</label>
              <input
                className={inp}
                type="number"
                step="0.01"
                placeholder="0"
                value={soldFormState.sale_amount}
                onChange={(e) => onSoldChange({ sale_amount: e.target.value })}
              />
            </div>
          </div>
          {soldFormState.sale_amount && parseFloat(soldFormState.sale_amount) > 0 && job.charges_amount > 0 && (
            <p className="text-xs text-ink-dim">
              Net after charges:{" "}
              <span className="font-semibold text-ok">
                {inr(parseFloat(soldFormState.sale_amount) - job.charges_amount)}
              </span>
            </p>
          )}
          <button
            onClick={onSold}
            disabled={isPending || !soldFormState.sale_amount}
            className="bg-ok text-white px-4 py-2 rounded-lg2 text-sm font-semibold hover:bg-ok/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save — Mark Sold"}
          </button>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div className="px-4 pb-2">
          <p className="text-[11px] text-ink-dim italic">{job.notes}</p>
        </div>
      )}
    </div>
  );
}
