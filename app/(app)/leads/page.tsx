"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { shortDate } from "@/lib/format";
import { useAuth } from "@/stores/auth";

type Channel = "whatsapp" | "instagram" | "messenger";
type LeadStatus = "new" | "hot" | "warm" | "cold" | "converted" | "lost";

type Lead = {
  id: string;
  wa_id: string;
  channel: Channel;
  display_name: string | null;
  status: LeadStatus;
  assigned_to: string | null;
  last_message_at: string | null;
  notes: string | null;
  created_at: string;
};

type Message = {
  id: string;
  lead_id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  sent_by: string | null;
  created_at: string;
};

type Profile = { id: string; display_name: string };

const STATUS_COLORS: Record<LeadStatus, string> = {
  new:       "bg-blue-100 text-blue-700",
  hot:       "bg-red-100 text-red-700",
  warm:      "bg-amber-100 text-amber-700",
  cold:      "bg-slate-100 text-slate-600",
  converted: "bg-green-100 text-green-700",
  lost:      "bg-zinc-100 text-zinc-500",
};

const CHANNEL_ICON: Record<Channel, string> = {
  whatsapp:  "💬",
  instagram: "📸",
  messenger: "💙",
};

const STATUS_TABS: { key: LeadStatus | "all"; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "new",       label: "New" },
  { key: "hot",       label: "Hot" },
  { key: "warm",      label: "Warm" },
  { key: "cold",      label: "Cold" },
  { key: "converted", label: "Converted" },
  { key: "lost",      label: "Lost" },
];

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function useLeads(status: LeadStatus | "all") {
  return useQuery<Lead[]>({
    queryKey: ["whatsapp_leads", status],
    queryFn: async () => {
      let q = supabase()
        .from("whatsapp_leads")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

function useMessages(leadId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["whatsapp_messages", leadId],
    enabled: !!leadId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("whatsapp_messages")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

function useStaff() {
  return useQuery<Profile[]>({
    queryKey: ["staff_profiles"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("profiles")
        .select("id, display_name")
        .in("role", ["admin", "subadmin", "staff"])
        .order("display_name");
      return (data ?? []) as Profile[];
    },
  });
}

export default function LeadsPage() {
  const qc      = useQueryClient();
  const profile = useAuth((s) => s.profile);

  const [tab,          setTab]          = useState<LeadStatus | "all">("all");
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [replyText,    setReplyText]    = useState("");
  const [notesText,    setNotesText]    = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: leads = [],    isLoading: leadsLoading } = useLeads(tab);
  const { data: messages = [], isLoading: msgsLoading  } = useMessages(selectedId);
  const { data: staff   = [] }                            = useStaff();

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedLead) setNotesText(selectedLead.notes ?? "");
  }, [selectedLead?.id]);

  const updateLead = useMutation({
    mutationFn: async (patch: Partial<Lead>) => {
      const { error } = await supabase()
        .from("whatsapp_leads")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", selectedId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp_leads"] }),
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: selectedId, text: replyText, sentBy: profile?.id }),
      });
      if (!res.ok) throw new Error("Send failed");
    },
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["whatsapp_messages", selectedId] });
    },
  });

  function saveNotes() {
    updateLead.mutate({ notes: notesText });
    setEditingNotes(false);
  }

  function formatTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  function formatListTime(ts: string | null) {
    if (!ts) return "";
    const d   = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return formatTime(ts);
    if (diffDays === 1) return "Yesterday";
    return shortDate(ts);
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left: Lead list ─────────────────────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-line flex flex-col bg-canvas">

        <div className="px-4 pt-4 pb-2">
          <h1 className="text-base font-semibold text-ink">Lead Inbox</h1>
          <p className="text-xs text-ink-dim mt-0.5">WhatsApp · Instagram · Messenger</p>
        </div>

        {/* Status tabs */}
        <div className="overflow-x-auto px-2 pb-2">
          <div className="flex gap-1 min-w-max">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? "bg-gold text-white"
                    : "bg-zinc-100 text-ink-dim hover:bg-zinc-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {leadsLoading ? (
            <p className="text-xs text-ink-dim px-4 py-6 text-center">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="text-xs text-ink-dim px-4 py-8 text-center">No leads yet.</p>
          ) : (
            leads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                className={`w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors ${
                  selectedId === lead.id ? "bg-amber-50 border-l-2 border-gold" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-ink truncate max-w-[140px]">
                    {CHANNEL_ICON[lead.channel]}{" "}
                    {lead.display_name ?? `+${lead.wa_id}`}
                  </span>
                  <span className="text-[10px] text-ink-dim shrink-0">
                    {formatListTime(lead.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-dim truncate max-w-[160px]">
                    +{lead.wa_id}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[lead.status]}`}>
                    {lead.status}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: Chat + details ────────────────────────────────────── */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-canvas shrink-0">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink text-sm">
                {CHANNEL_ICON[selectedLead.channel]}{" "}
                {selectedLead.display_name ?? `+${selectedLead.wa_id}`}
              </p>
              <p className="text-xs text-ink-dim">+{selectedLead.wa_id}</p>
            </div>

            {/* Status */}
            <select
              value={selectedLead.status}
              onChange={(e) => updateLead.mutate({ status: e.target.value as LeadStatus })}
              className="text-xs border border-line rounded-lg2 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold"
            >
              {(["new","hot","warm","cold","converted","lost"] as LeadStatus[]).map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>

            {/* Assign staff */}
            <select
              value={selectedLead.assigned_to ?? ""}
              onChange={(e) => updateLead.mutate({ assigned_to: e.target.value || null })}
              className="text-xs border border-line rounded-lg2 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold max-w-[140px]"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.display_name}</option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-zinc-50">
            {msgsLoading ? (
              <p className="text-xs text-ink-dim text-center py-8">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="text-xs text-ink-dim text-center py-8">No messages yet.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm shadow-soft ${
                      msg.direction === "outbound"
                        ? "bg-gold text-white rounded-br-sm"
                        : "bg-white text-ink rounded-bl-sm border border-line"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={`text-[10px] mt-1 text-right ${
                      msg.direction === "outbound" ? "text-white/70" : "text-ink-dim"
                    }`}>
                      {formatTime(msg.created_at)}
                      {msg.direction === "outbound" && msg.status === "sent" && " ✓"}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Notes bar */}
          <div className="border-t border-line px-4 py-2 bg-canvas shrink-0">
            {editingNotes ? (
              <div className="flex gap-2">
                <input
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Add notes about this lead…"
                  className={inp}
                  autoFocus
                />
                <button
                  onClick={saveNotes}
                  className="px-3 py-1.5 bg-gold text-white text-xs rounded-lg2 shrink-0"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingNotes(false); setNotesText(selectedLead.notes ?? ""); }}
                  className="px-3 py-1.5 border border-line text-xs rounded-lg2 shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-xs text-ink-dim hover:text-ink w-full text-left"
              >
                {selectedLead.notes
                  ? <span><span className="font-medium text-ink-dim">Note:</span> {selectedLead.notes}</span>
                  : <span className="italic">+ Add note…</span>
                }
              </button>
            )}
          </div>

          {/* Reply input — only for WhatsApp */}
          <div className="border-t border-line px-4 py-3 bg-canvas shrink-0">
            {selectedLead.channel === "whatsapp" ? (
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (replyText.trim()) sendReply.mutate();
                    }
                  }}
                  placeholder="Type a reply… (Enter to send)"
                  rows={2}
                  className={`${inp} resize-none`}
                />
                <button
                  onClick={() => sendReply.mutate()}
                  disabled={!replyText.trim() || sendReply.isPending}
                  className="px-4 bg-gold text-white rounded-lg2 text-sm font-medium disabled:opacity-50 shrink-0"
                >
                  {sendReply.isPending ? "…" : "Send"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-ink-dim text-center py-1">
                Replies for {selectedLead.channel} coming soon.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-zinc-50">
          <div className="text-center text-ink-dim">
            <p className="text-4xl mb-3">💬</p>
            <p className="text-sm">Select a lead to view the conversation</p>
          </div>
        </div>
      )}
    </div>
  );
}
