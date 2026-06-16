"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { parseKolusuChat } from "@/lib/kolusu-parse";

interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_deleted: boolean;
  edited_at: string | null;
  created_at: string;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export default function AdminChatPage() {
  const profile = useAuth((s) => s.profile);
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editText, setEditText]     = useState("");
  const [chatInput, setChatInput]   = useState("");
  const [sending, setSending]       = useState(false);
  const bottomRef                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const client = supabase();
    client.from("chat_messages")
      .select("*").order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => setMessages((data ?? []) as ChatMessage[]));

    const channel = client.channel("admin_chat_mod")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, async (payload) => {
        if (payload.eventType === "INSERT") {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, msg]);
          // Auto-process incoming KS messages from staff
          const parsed = parseKolusuChat(msg.message ?? "");
          if (parsed && msg.sender_name !== "MyBuddy") {
            const today = new Date().toISOString().slice(0, 10);
            await client.from("kolusu_pending_sales").insert({
              tx_date:     today,
              raw_wt_g:    parsed.raw_wt_g,
              cover_wt_g:  parsed.cover_wt_g,
              qty:         parsed.qty,
              description: parsed.description || null,
              bill_no:     parsed.bill_no || null,
              staff_name:  msg.sender_name,
              source:      "chat",
            });
            await client.from("chat_messages").insert({
              sender_name: "MyBuddy",
              message: `✓ Kolusu sale logged: ${parsed.raw_wt_g}g + ${parsed.cover_wt_g}g cover${parsed.description ? ` (${parsed.description})` : ""} — from ${msg.sender_name}. Admin will assign to box.`,
            });
          }
        } else if (payload.eventType === "UPDATE")
          setMessages((prev) => prev.map((m) => m.id === payload.new.id ? payload.new as ChatMessage : m));
        else if (payload.eventType === "DELETE")
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
      })
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function hardDelete(id: string) {
    if (!confirm("Permanently delete this message?")) return;
    await supabase().from("chat_messages").delete().eq("id", id);
  }

  async function toggleDelete(id: string, current: boolean) {
    await supabase().from("chat_messages").update({ is_deleted: !current }).eq("id", id);
  }

  async function saveEdit(id: string) {
    if (!editText.trim()) return;
    await supabase().from("chat_messages")
      .update({ message: editText.trim(), edited_at: new Date().toISOString() })
      .eq("id", id);
    setEditingId(null);
  }

  async function sendAsAdmin() {
    if (!chatInput.trim() || !profile) return;
    setSending(true);
    const client = supabase();
    const { data: { user } } = await client.auth.getUser();
    const msg = chatInput.trim();
    if (user) {
      await client.from("chat_messages").insert({ sender_id: user.id, sender_name: profile.display_name, message: msg });
      const parsed = parseKolusuChat(msg);
      if (parsed) {
        const today = new Date().toISOString().slice(0, 10);
        await client.from("kolusu_pending_sales").insert({
          tx_date:     today,
          raw_wt_g:    parsed.raw_wt_g,
          cover_wt_g:  parsed.cover_wt_g,
          qty:         parsed.qty,
          description: parsed.description || null,
          bill_no:     parsed.bill_no || null,
          staff_name:  profile.display_name,
          staff_id:    user.id,
          source:      "chat",
        });
        await client.from("chat_messages").insert({
          sender_id:   user.id,
          sender_name: "MyBuddy",
          message:     `✓ Kolusu sale logged: ${parsed.raw_wt_g}g + ${parsed.cover_wt_g}g cover${parsed.description ? ` (${parsed.description})` : ""}. Admin will assign to box.`,
        });
      }
    }
    setChatInput("");
    setSending(false);
  }

  if (profile?.role !== "admin") {
    return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;
  }

  const grouped = messages.reduce<{ date: string; msgs: ChatMessage[] }[]>((acc, m) => {
    const date = m.created_at.slice(0, 10);
    const last = acc[acc.length - 1];
    if (last?.date === date) last.msgs.push(m);
    else acc.push({ date, msgs: [m] });
    return acc;
  }, []);

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between pb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold">Staff Chat — Moderation</h1>
          <p className="text-xs text-ink-dim mt-0.5">As admin you can edit, soft-delete, or permanently remove any message.</p>
        </div>
        <span className="text-xs text-ink-dim">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl border border-line shadow-soft p-4 space-y-1 min-h-0">
        {grouped.map(({ date, msgs }) => (
          <div key={date}>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 border-t border-line" />
              <span className="text-[10px] text-ink-dim px-2">
                {new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <div className="flex-1 border-t border-line" />
            </div>
            {msgs.map((m) => {
              const isOwn = m.sender_id === profile?.id;
              return (
                <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}>
                  <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                    {!isOwn && (
                      <span className="text-[10px] text-ink-dim font-medium px-1 mb-0.5">{m.sender_name}</span>
                    )}
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      m.is_deleted
                        ? "bg-canvas border border-line text-ink-dim italic"
                        : isOwn
                        ? "bg-gold text-white"
                        : "bg-canvas border border-line text-ink"
                    }`}>
                      {editingId === m.id ? (
                        <div className="flex gap-2 items-center min-w-[200px]">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(m.id); if (e.key === "Escape") setEditingId(null); }}
                            className="flex-1 bg-white border border-line rounded px-2 py-0.5 text-xs text-ink focus:outline-none"
                            autoFocus
                          />
                          <button onClick={() => saveEdit(m.id)} className="text-xs text-ok font-semibold">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-ink-dim">Cancel</button>
                        </div>
                      ) : m.is_deleted ? (
                        "This message was deleted"
                      ) : (
                        <span className="whitespace-pre-wrap">{m.message}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-2 mt-0.5 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                      <span className="text-[10px] text-ink-dim">{formatTime(m.created_at)}</span>
                      {m.edited_at && !m.is_deleted && <span className="text-[10px] text-ink-dim">(edited)</span>}
                      {/* Admin controls */}
                      {!m.is_deleted && (
                        <button onClick={() => { setEditingId(m.id); setEditText(m.message); }}
                          className="text-[10px] text-info hover:underline">Edit</button>
                      )}
                      <button onClick={() => toggleDelete(m.id, m.is_deleted)}
                        className="text-[10px] text-warn hover:underline">
                        {m.is_deleted ? "Restore" : "Hide"}
                      </button>
                      <button onClick={() => hardDelete(m.id)}
                        className="text-[10px] text-err hover:underline">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Admin send */}
      <div className="shrink-0 pt-3">
        <div className="flex gap-2 bg-white border border-line rounded-xl p-3">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAsAdmin(); } }}
            placeholder="Send a message as admin…"
            className="flex-1 text-sm focus:outline-none"
          />
          <button onClick={sendAsAdmin} disabled={sending || !chatInput.trim()}
            className="bg-gold text-white px-4 py-1.5 rounded-lg2 text-sm font-medium disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
