"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useGlobalDate } from "@/stores/global-date";
import { grams } from "@/lib/format";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

const EXAMPLES = [
  "34.220  10 inch bomby  cover 1.100",
  "18.500  9.5 M  cover 1.300",
  "27.600  9 B  cover 1.100",
];

function parseChatFormat(text: string): { raw_wt_g: number; cover_wt_g: number; description: string; qty: number; bill_no: string } | null {
  const lower = text.trim().toLowerCase();
  if (!lower.startsWith("kolusu")) return null;
  const body = text.trim().slice(6).trim();

  const coverMatch = body.match(/cover\s+([\d.]+)/i);
  if (!coverMatch) return null;
  const cover_wt_g = parseFloat(coverMatch[1]);

  const rawMatch = body.match(/^([\d.]+)/);
  if (!rawMatch) return null;
  const raw_wt_g = parseFloat(rawMatch[1]);

  const qtyMatch = body.match(/(?:qty|x)\s*(\d+)/i);
  const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  const billMatch = body.match(/bill(?:\s*no)?\s+([^\s]+)/i);
  const bill_no = billMatch ? billMatch[1] : "";

  const afterFirst = body.slice(rawMatch[0].length).trim();
  const coverIdx = afterFirst.toLowerCase().indexOf("cover");
  const rawDesc = afterFirst.slice(0, coverIdx).replace(/qty\s*\d+|x\s*\d+|bill(?:\s*no)?\s+\S+/gi, "").trim();

  return { raw_wt_g, cover_wt_g, description: rawDesc, qty, bill_no };
}

export default function KolusuSalePage() {
  const globalDate = useGlobalDate((s) => s.date);

  const [staffName, setStaffName] = useState<string | null>(null);
  const [staffId, setStaffId]     = useState<string | null>(null);

  useEffect(() => {
    const client = supabase();
    client.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setStaffId(user.id);
      const { data } = await client.from("profiles").select("display_name").eq("id", user.id).single();
      if (data?.display_name) setStaffName(data.display_name);
    });
  }, []);

  const [mode, setMode]           = useState<"form" | "chat">("form");
  const [chatInput, setChatInput] = useState("");
  const [chatParsed, setChatParsed] = useState<ReturnType<typeof parseChatFormat>>(null);

  const [form, setForm] = useState({
    tx_date: globalDate,
    qty: 1,
    raw_wt_g: 0,
    cover_per_piece: 1.1,
    description: "",
    bill_no: "",
    notes: "",
  });

  const [lastSaved, setLastSaved] = useState<{ raw_wt_g: number; cover_wt_g: number; description: string } | null>(null);

  const coverTotal = parseFloat((form.qty * form.cover_per_piece).toFixed(3));

  const save = useMutation({
    mutationFn: async (d: { tx_date: string; raw_wt_g: number; cover_wt_g: number; qty: number; description: string; bill_no: string; notes: string }) => {
      const { error } = await supabase().from("kolusu_pending_sales").insert({
        tx_date:     d.tx_date,
        raw_wt_g:    d.raw_wt_g,
        cover_wt_g:  d.cover_wt_g,
        qty:         d.qty,
        description: d.description || null,
        bill_no:     d.bill_no || null,
        notes:       d.notes || null,
        staff_name:  staffName,
        staff_id:    staffId,
        source:      "form",
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      setLastSaved({ raw_wt_g: vars.raw_wt_g, cover_wt_g: vars.cover_wt_g, description: vars.description });
      setForm({ tx_date: globalDate, qty: 1, raw_wt_g: 0, cover_per_piece: 1.1, description: "", bill_no: "", notes: "" });
    },
  });

  const saveChatEntry = useMutation({
    mutationFn: async (d: NonNullable<ReturnType<typeof parseChatFormat>> & { tx_date: string }) => {
      const { error } = await supabase().from("kolusu_pending_sales").insert({
        tx_date:     d.tx_date,
        raw_wt_g:    d.raw_wt_g,
        cover_wt_g:  d.cover_wt_g,
        qty:         d.qty,
        description: d.description || null,
        bill_no:     d.bill_no || null,
        staff_name:  staffName,
        staff_id:    staffId,
        source:      "form",
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      setLastSaved({ raw_wt_g: vars.raw_wt_g, cover_wt_g: vars.cover_wt_g, description: vars.description });
      setChatInput("");
      setChatParsed(null);
    },
  });

  function handleChatChange(val: string) {
    setChatInput(val);
    const full = val.trim().toLowerCase().startsWith("kolusu") ? val : `kolusu ${val}`;
    setChatParsed(parseChatFormat(full));
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-ink">Kolusu Sale Entry</h1>
          {staffName && <p className="text-xs text-ink-dim mt-0.5">{staffName}</p>}
        </div>
        <a href="/my-attendance"
          className="text-xs text-ink-dim border border-line rounded-lg2 px-3 py-1.5 hover:text-gold hover:border-gold transition-colors">
          ← Back
        </a>
      </div>

      {lastSaved && (
        <div className="bg-ok/10 border border-ok/30 rounded-xl px-4 py-3 text-sm text-ok font-medium">
          Logged ✓ — {grams(lastSaved.raw_wt_g)} + {grams(lastSaved.cover_wt_g)} cover
          {lastSaved.description && <span className="text-ink-dim font-normal ml-1">· {lastSaved.description}</span>}
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex border border-line rounded-lg2 overflow-hidden text-sm font-medium">
        <button onClick={() => setMode("form")}
          className={`flex-1 py-2 transition-colors ${mode === "form" ? "bg-gold text-white" : "text-ink-dim hover:text-ink"}`}>
          Form Entry
        </button>
        <button onClick={() => setMode("chat")}
          className={`flex-1 py-2 transition-colors ${mode === "chat" ? "bg-gold text-white" : "text-ink-dim hover:text-ink"}`}>
          Quick Text
        </button>
      </div>

      {/* ── FORM MODE ── */}
      {mode === "form" && (
        <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Date</label>
              <input type="date" value={form.tx_date}
                onChange={e => setForm(f => ({ ...f, tx_date: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Qty</label>
              <input type="number" step="1" min="1" value={form.qty || ""}
                onFocus={e => e.target.select()}
                onChange={e => setForm(f => ({ ...f, qty: parseInt(e.target.value) || 1 }))}
                className={inp} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-dim mb-1">Description (size / type)</label>
            <input value={form.description} placeholder="e.g. 10 inch bomby, 9.5 M, 9 B"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className={inp} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Kolusu Weight (g) *</label>
              <input type="number" step="0.001" min="0" value={form.raw_wt_g || ""}
                placeholder="34.220"
                onFocus={e => e.target.select()}
                onChange={e => setForm(f => ({ ...f, raw_wt_g: parseFloat(e.target.value) || 0 }))}
                className={`${inp} font-mono`} autoFocus />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Cover / piece (g)</label>
              <input type="number" step="0.001" min="0" value={form.cover_per_piece || ""}
                onFocus={e => e.target.select()}
                onChange={e => setForm(f => ({ ...f, cover_per_piece: parseFloat(e.target.value) || 0 }))}
                className={`${inp} font-mono`} />
            </div>
          </div>

          {form.raw_wt_g > 0 && (
            <div className="bg-canvas rounded-lg2 px-3 py-2 text-xs text-ink-dim space-y-0.5">
              <div className="flex justify-between">
                <span>Kolusu weight</span>
                <span className="font-mono">{grams(form.raw_wt_g)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cover ({form.qty} × {form.cover_per_piece}g)</span>
                <span className="font-mono">{grams(coverTotal)}</span>
              </div>
              <div className="flex justify-between font-semibold text-ink border-t border-line pt-1">
                <span>Total</span>
                <span className="font-mono">{grams(form.raw_wt_g + coverTotal)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-dim mb-1">Bill No</label>
              <input value={form.bill_no} placeholder="Optional"
                onChange={e => setForm(f => ({ ...f, bill_no: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-ink-dim mb-1">Notes</label>
              <input value={form.notes} placeholder="Optional"
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className={inp} />
            </div>
          </div>

          {save.isError && <p className="text-xs text-err">{(save.error as Error).message}</p>}

          <button
            disabled={save.isPending || form.raw_wt_g <= 0}
            onClick={() => save.mutate({ tx_date: form.tx_date, raw_wt_g: form.raw_wt_g, cover_wt_g: coverTotal, qty: form.qty, description: form.description, bill_no: form.bill_no, notes: form.notes })}
            className="w-full bg-gold text-white text-sm font-medium py-2.5 rounded-lg2 disabled:opacity-50 hover:opacity-90">
            {save.isPending ? "Saving…" : "Submit Sale"}
          </button>
        </div>
      )}

      {/* ── QUICK TEXT MODE ── */}
      {mode === "chat" && (
        <div className="bg-white border border-line rounded-xl p-4 shadow-soft space-y-4">
          <div>
            <label className="block text-xs text-ink-dim mb-1">Type your sale (like in WhatsApp)</label>
            <textarea
              value={chatInput}
              onChange={e => handleChatChange(e.target.value)}
              placeholder={"kolusu 34.220 10 inch bomby cover 1.100"}
              rows={3}
              className={`${inp} font-mono resize-none`}
              autoFocus />
          </div>

          <div className="text-xs text-ink-dim space-y-1">
            <p className="font-medium text-ink">Format: <span className="font-mono text-info">kolusu [weight] [description] cover [cover_wt]</span></p>
            <p className="font-medium text-ink mb-0.5">Examples:</p>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => handleChatChange(`kolusu ${ex}`)}
                className="block font-mono text-left hover:text-gold underline decoration-dotted">
                kolusu {ex}
              </button>
            ))}
            <p className="text-ink-dim pt-1">Optional: add <span className="font-mono">qty 2</span> for multiple pieces, <span className="font-mono">bill 1234</span> for bill number.</p>
          </div>

          {chatInput && !chatParsed && (
            <div className="bg-err/5 border border-err/20 rounded-lg2 px-3 py-2 text-xs text-err">
              Could not parse. Make sure format starts with <span className="font-mono">kolusu</span> and includes <span className="font-mono">cover [weight]</span>.
            </div>
          )}
          {chatParsed && (
            <div className="bg-ok/5 border border-ok/20 rounded-lg2 px-3 py-2 text-xs space-y-1">
              <p className="text-ok font-semibold">Parsed ✓</p>
              <div className="text-ink-dim space-y-0.5">
                <div className="flex justify-between"><span>Kolusu weight</span><span className="font-mono">{grams(chatParsed.raw_wt_g)}</span></div>
                <div className="flex justify-between"><span>Cover weight</span><span className="font-mono">{grams(chatParsed.cover_wt_g)}</span></div>
                {chatParsed.qty > 1 && <div className="flex justify-between"><span>Qty</span><span>{chatParsed.qty}</span></div>}
                {chatParsed.description && <div className="flex justify-between"><span>Description</span><span>{chatParsed.description}</span></div>}
                {chatParsed.bill_no && <div className="flex justify-between"><span>Bill No</span><span>{chatParsed.bill_no}</span></div>}
              </div>
            </div>
          )}

          {saveChatEntry.isError && <p className="text-xs text-err">{(saveChatEntry.error as Error).message}</p>}

          <button
            disabled={!chatParsed || saveChatEntry.isPending}
            onClick={() => chatParsed && saveChatEntry.mutate({ ...chatParsed, tx_date: globalDate })}
            className="w-full bg-gold text-white text-sm font-medium py-2.5 rounded-lg2 disabled:opacity-50 hover:opacity-90">
            {saveChatEntry.isPending ? "Saving…" : "Submit Sale"}
          </button>
        </div>
      )}
    </div>
  );
}
