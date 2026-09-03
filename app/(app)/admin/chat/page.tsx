"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { parseKolusuChat } from "@/lib/kolusu-parse";
import { parseConductChat, type ConductChatCode } from "@/lib/conduct-parse";

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

const CATEGORY_OPTIONS = ["Other", "Customer Handling", "Dress Code", "Grooming", "Punctuality"];

export default function AdminChatPage() {
  const profile = useAuth((s) => s.profile);
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editText, setEditText]       = useState("");
  const [chatInput, setChatInput]     = useState("");
  const [sending, setSending]         = useState(false);
  const [staffList, setStaffList]     = useState<{ id: string; name: string }[]>([]);
  const [conductCodes, setConductCodes] = useState<ConductChatCode[]>([]);
  const [cdMode, setCdMode]           = useState<"none" | "code" | "staff">("none");
  const [showCodeMgmt, setShowCodeMgmt] = useState(false);
  const [newCode, setNewCode]         = useState({ code: "", label: "", categoryName: "Other", points: -2 });
  const [savingCode, setSavingCode]   = useState(false);
  const bottomRef                     = useRef<HTMLDivElement>(null);
  const adminUserIdRef                = useRef<string | null>(null);
  const processedConductIds           = useRef<Set<string>>(new Set());
  const conductCodesRef               = useRef<ConductChatCode[]>([]);

  function setCodesState(codes: ConductChatCode[]) {
    conductCodesRef.current = codes;
    setConductCodes(codes);
  }

  async function processKolusuMsg(client: ReturnType<typeof supabase>, msg: ChatMessage) {
    const parsed = parseKolusuChat(msg.message ?? "");
    if (!parsed || msg.sender_name === "MyBuddy") return;
    const today = msg.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const { error } = await client.from("kolusu_pending_sales").insert({
      tx_date:         today,
      raw_wt_g:        parsed.raw_wt_g,
      cover_wt_g:      parsed.cover_wt_g,
      qty:             parsed.qty,
      description:     parsed.description || null,
      bill_no:         parsed.bill_no || null,
      staff_name:      msg.sender_name,
      staff_id:        msg.sender_id || null,
      source:          "chat",
      chat_message_id: msg.id,
    });
    if (error) return;
    const adminId = adminUserIdRef.current;
    if (adminId) {
      await client.from("chat_messages").insert({
        sender_id:   adminId,
        sender_name: "MyBuddy",
        message: `✓ Kolusu logged: ${parsed.raw_wt_g}g + ${parsed.cover_wt_g}g cover${parsed.description ? ` (${parsed.description})` : ""} from ${msg.sender_name}`,
      });
    }
  }

  async function processConductMsg(client: ReturnType<typeof supabase>, msg: ChatMessage, senderId: string | null) {
    const parsed = parseConductChat(msg.message ?? "");
    if (!parsed || msg.sender_name === "MyBuddy") return;
    if (processedConductIds.current.has(msg.id)) return;
    processedConductIds.current.add(msg.id);

    const codes = conductCodesRef.current;
    const codeInfo = codes.find(c => c.code === parsed.code);
    if (!codeInfo) return;

    const { data: staffRows } = await client.from("staff")
      .select("id, name").ilike("name", `%${parsed.staffName}%`).limit(3);
    const staffRow = staffRows?.[0];
    const adminId = senderId ?? adminUserIdRef.current;
    if (!staffRow) {
      if (adminId) {
        await client.from("chat_messages").insert({
          sender_id: adminId, sender_name: "MyBuddy",
          message: `⚠ Conduct: staff "${parsed.staffName}" not found. Check name and retry.`,
        });
      }
      return;
    }
    const { data: cats } = await client.from("conduct_categories").select("id, name");
    const catMap = new Map((cats ?? []).map((c: any) => [c.name as string, c.id as number]));
    const noteText = `${codeInfo.label}${parsed.note ? ` — ${parsed.note}` : ""}`;
    const { error } = await client.from("conduct_notes").insert({
      staff_id:        staffRow.id,
      staff_name:      staffRow.name,
      category_id:     catMap.get(codeInfo.categoryName) ?? null,
      note:            noteText,
      noted_by:        msg.sender_id || null,
      noted_by_name:   msg.sender_name,
      note_date:       msg.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      chat_message_id: msg.id,
    });
    if (error) return;
    if (adminId) {
      await client.from("chat_messages").insert({
        sender_id: adminId, sender_name: "MyBuddy",
        message: `✓ Conduct noted: ${staffRow.name} — ${codeInfo.label} (${codeInfo.points} pts)${parsed.note ? ` · ${parsed.note}` : ""}`,
      });
    }
  }

  useEffect(() => {
    const client = supabase();

    async function init() {
      const { data: { user } } = await client.auth.getUser();
      adminUserIdRef.current = user?.id ?? null;

      const [{ data: chatData }, { data: processed }, { data: sData }, { data: cData }] = await Promise.all([
        client.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(200),
        client.from("kolusu_pending_sales").select("chat_message_id").not("chat_message_id", "is", null),
        client.from("staff").select("id, name").eq("active", true).order("name"),
        client.from("conduct_chat_codes").select("*").eq("active", true).order("display_order"),
      ]);
      setStaffList((sData ?? []) as { id: string; name: string }[]);
      setCodesState((cData ?? []).map((r: any) => ({
        code: r.code, label: r.label, categoryName: r.category_name, points: r.points,
      })));

      setMessages((chatData ?? []) as ChatMessage[]);

      const processedIds = new Set((processed ?? []).map((r: any) => r.chat_message_id as string));
      for (const msg of (chatData ?? []) as ChatMessage[]) {
        if (!processedIds.has(msg.id) && parseKolusuChat(msg.message ?? "") && msg.sender_name !== "MyBuddy") {
          await processKolusuMsg(client, msg);
          processedIds.add(msg.id);
        }
      }
    }

    init();

    const channel = client.channel("admin_chat_mod")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, async (payload) => {
        if (payload.eventType === "INSERT") {
          const msg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, msg]);
          await processKolusuMsg(client, msg);
          await processConductMsg(client, msg, null);
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

  function handleChatInput(val: string) {
    setChatInput(val);
    if (/^cd$/i.test(val.trim())) {
      setCdMode("code");
    } else {
      const codePattern = conductCodesRef.current.map(c => c.code).join("|");
      if (codePattern && new RegExp(`^cd\\s+(${codePattern})\\s`, "i").test(val)) {
        setCdMode("staff");
      } else {
        setCdMode("none");
      }
    }
  }

  function selectCdCode(code: string) {
    setChatInput(`CD ${code} `);
    setCdMode("staff");
  }

  function selectCdStaff(name: string) {
    const m = chatInput.match(/^(CD\s+\w+\s+)/i);
    setChatInput((m ? m[1] : chatInput) + name + " ");
    setCdMode("none");
  }

  async function addConductCode() {
    const code = newCode.code.trim().toUpperCase();
    if (!code || !newCode.label.trim()) return;
    setSavingCode(true);
    const client = supabase();
    const { data } = await client.from("conduct_chat_codes")
      .insert({ code, label: newCode.label.trim(), category_name: newCode.categoryName, points: newCode.points })
      .select().single();
    if (data) {
      setCodesState([...conductCodesRef.current, {
        code: data.code, label: data.label, categoryName: data.category_name, points: data.points,
      }]);
      setNewCode({ code: "", label: "", categoryName: "Other", points: -2 });
    }
    setSavingCode(false);
  }

  async function deleteConductCode(code: string) {
    if (!confirm(`Remove code "${code}"?`)) return;
    await supabase().from("conduct_chat_codes").update({ active: false }).eq("code", code);
    setCodesState(conductCodesRef.current.filter(c => c.code !== code));
  }

  async function sendAsAdmin() {
    if (!chatInput.trim() || !profile) return;
    setSending(true);
    const client = supabase();
    const { data: { user } } = await client.auth.getUser();
    const msg = chatInput.trim();
    if (user) {
      const { data: sentMsg } = await client.from("chat_messages").insert({ sender_id: user.id, sender_name: profile.display_name, message: msg }).select().single();
      const parsed = parseKolusuChat(msg);
      if (parsed) {
        const today = new Date().toISOString().slice(0, 10);
        await client.from("kolusu_pending_sales").insert({
          tx_date:         today,
          raw_wt_g:        parsed.raw_wt_g,
          cover_wt_g:      parsed.cover_wt_g,
          qty:             parsed.qty,
          description:     parsed.description || null,
          bill_no:         parsed.bill_no || null,
          staff_name:      profile.display_name,
          staff_id:        user.id,
          source:          "chat",
          chat_message_id: sentMsg?.id ?? null,
        });
        await client.from("chat_messages").insert({
          sender_id:   user.id,
          sender_name: "MyBuddy",
          message:     `✓ Kolusu logged: ${parsed.raw_wt_g}g + ${parsed.cover_wt_g}g cover${parsed.description ? ` (${parsed.description})` : ""}`,
        });
      }
      if (sentMsg) {
        await processConductMsg(client, { ...sentMsg, sender_id: user.id, sender_name: profile.display_name } as ChatMessage, user.id);
      }
    }
    setChatInput("");
    setCdMode("none");
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

  const cdStaffFilter = (() => {
    const m = chatInput.match(/^CD\s+\w+\s+(.*)/i);
    return (m?.[1] ?? "").toLowerCase();
  })();
  const filteredStaff = cdStaffFilter
    ? staffList.filter(s => s.name.toLowerCase().includes(cdStaffFilter))
    : staffList;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between pb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold">Staff Chat — Moderation</h1>
          <p className="text-xs text-ink-dim mt-0.5">As admin you can edit, soft-delete, or permanently remove any message.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCodeMgmt(v => !v)}
            className="text-xs text-info hover:underline">
            CD codes {showCodeMgmt ? "▲" : "▼"}
          </button>
          <span className="text-xs text-ink-dim">{messages.length} messages</span>
        </div>
      </div>

      {/* Conduct code manager */}
      {showCodeMgmt && (
        <div className="shrink-0 mb-3 border border-line rounded-xl bg-white p-3 space-y-2">
          <p className="text-xs font-semibold text-ink-dim uppercase tracking-wide">Conduct Chat Codes</p>
          <div className="space-y-1">
            {conductCodes.map(c => (
              <div key={c.code} className="flex items-center gap-2 text-sm">
                <span className="font-mono font-bold text-gold-dark w-10">{c.code}</span>
                <span className="flex-1">{c.label}</span>
                <span className="text-xs text-ink-dim w-20">{c.categoryName}</span>
                <span className={`text-xs font-semibold w-12 text-right ${c.points < 0 ? "text-err" : "text-ok"}`}>
                  {c.points > 0 ? "+" : ""}{c.points} pts
                </span>
                <button onClick={() => deleteConductCode(c.code)}
                  className="text-xs text-err hover:underline ml-1">Remove</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1 border-t border-line">
            <input value={newCode.code} onChange={e => setNewCode(v => ({ ...v, code: e.target.value.toUpperCase().slice(0, 5) }))}
              placeholder="CODE" maxLength={5}
              className="w-16 border border-line rounded-lg2 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-gold" />
            <input value={newCode.label} onChange={e => setNewCode(v => ({ ...v, label: e.target.value }))}
              placeholder="Label e.g. Not in uniform"
              className="flex-1 border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
            <select value={newCode.categoryName} onChange={e => setNewCode(v => ({ ...v, categoryName: e.target.value }))}
              className="border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold">
              {CATEGORY_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
            <input type="number" value={newCode.points} onChange={e => setNewCode(v => ({ ...v, points: parseInt(e.target.value) || -2 }))}
              placeholder="pts"
              className="w-14 border border-line rounded-lg2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-gold" />
            <button onClick={addConductCode} disabled={savingCode || !newCode.code.trim() || !newCode.label.trim()}
              className="bg-gold text-white px-3 py-1 rounded-lg2 text-xs font-medium disabled:opacity-40">
              Add
            </button>
          </div>
        </div>
      )}

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
        {cdMode === "code" && conductCodes.length > 0 && (
          <div className="border border-line rounded-xl bg-white shadow-soft py-1 mb-2">
            <p className="text-[10px] text-ink-dim px-3 pt-1 pb-0.5 font-semibold uppercase tracking-wide">Select conduct issue</p>
            {conductCodes.map(c => (
              <button key={c.code} onMouseDown={(e) => { e.preventDefault(); selectCdCode(c.code); }}
                className="flex items-center gap-3 w-full text-left px-3 py-1.5 hover:bg-canvas text-sm">
                <span className="font-mono font-bold text-gold-dark w-8">{c.code}</span>
                <span className="flex-1">{c.label}</span>
                <span className={`text-xs font-semibold ${c.points < 0 ? "text-err" : "text-ok"}`}>
                  {c.points > 0 ? "+" : ""}{c.points} pts
                </span>
              </button>
            ))}
          </div>
        )}
        {cdMode === "staff" && filteredStaff.length > 0 && (
          <div className="border border-line rounded-xl bg-white shadow-soft py-1 mb-2 max-h-40 overflow-y-auto">
            <p className="text-[10px] text-ink-dim px-3 pt-1 pb-0.5 font-semibold uppercase tracking-wide">Select staff</p>
            {filteredStaff.map((s) => (
              <button key={s.id} onMouseDown={(e) => { e.preventDefault(); selectCdStaff(s.name); }}
                className="block w-full text-left text-sm px-3 py-1.5 hover:bg-canvas">
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 bg-white border border-line rounded-xl p-3">
          <input
            value={chatInput}
            onChange={(e) => handleChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && cdMode !== "none") { setCdMode("none"); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAsAdmin(); }
            }}
            placeholder="Send a message as admin… (type CD for conduct shorthand)"
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
