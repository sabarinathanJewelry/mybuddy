import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN ?? "";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const APP_SECRET   = process.env.INSTAGRAM_APP_SECRET ?? "";
const IG_API_BASE  = "https://graph.instagram.com/v21.0";

const DEFAULT_GATE   = "Hi {name}! 👋 Thanks for your comment. Tap \"Send details\" below and we'll share them right here.";
const DEFAULT_FOLLOW = "Hi {name}! To unlock the details, please follow @{shop} 🙏 Then tap \"I followed ✅\".";
const BTN_DETAILS  = "Send details";
const BTN_FOLLOWED = "I followed ✅";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── GET: Meta webhook verification handshake ─────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN.trim()) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden", verify_token_set: !!VERIFY_TOKEN, verify_token_length: VERIFY_TOKEN.length }, { status: 403 });
}

function validSignature(raw: string, header: string | null) {
  if (!APP_SECRET) return true;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", APP_SECRET).update(raw).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

type CommentEvent = {
  id: string;
  text: string;
  from?: { id: string; username?: string };
  media?: { id: string };
};

type MessageEvent = {
  sender?: { id: string };
  message?: { text?: string; is_echo?: boolean; quick_reply?: { payload?: string } };
  postback?: { payload?: string };
};

// ── POST: Incoming comment + message events ──────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  for (const entry of body?.entry ?? []) {
    const accountId: string = entry?.id ?? "";
    for (const change of entry?.changes ?? []) {
      if (change.field !== "comments") continue;
      const c = change.value as CommentEvent;
      if (!c?.id || !c.text || !c.from?.id) continue;
      if (c.from.id === accountId) continue;
      await handleComment(accountId, c);
    }
    for (const m of (entry?.messaging ?? []) as MessageEvent[]) {
      if (!m.sender?.id || m.sender.id === accountId || m.message?.is_echo) continue;
      await handleMessage(accountId, m);
    }
  }

  return NextResponse.json({ ok: true });
}

async function igGet(path: string) {
  const res = await fetch(`${IG_API_BASE}${path}`, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }, cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Instagram API ${res.status}`);
  return data;
}

async function igPost(path: string, payload: object) {
  const res = await fetch(`${IG_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Instagram API ${res.status}`);
  return data;
}

let shopHandle: string | null = null;
async function shop() {
  if (!shopHandle) shopHandle = (await igGet("/me?fields=username")).username ?? "us";
  return shopHandle;
}

async function personalise(text: string, username?: string | null) {
  let out = text.replace(/\{name\}|\{username\}/gi, username ?? "there");
  if (/\{shop\}/i.test(out)) out = out.replace(/\{shop\}/gi, (await shop()) ?? "us");
  return out;
}

function withButton(text: string, title: string, payload: string) {
  return { text, quick_replies: [{ content_type: "text", title, payload }] };
}

async function sendPrivateReply(accountId: string, commentId: string, message: object) {
  return igPost(`/${accountId}/messages`, { recipient: { comment_id: commentId }, message });
}

async function sendDirect(accountId: string, userId: string, message: object) {
  return igPost(`/${accountId}/messages`, { recipient: { id: userId }, message });
}

async function handleComment(accountId: string, c: CommentEvent) {
  if (!ACCESS_TOKEN) return;
  const db = adminSupabase();

  const { data: logRow, error: dupErr } = await db.from("ig_dm_log").insert({
    comment_id: c.id,
    media_id: c.media?.id ?? null,
    from_id: c.from?.id,
    username: c.from?.username ?? null,
    comment_text: c.text,
  }).select("id").single();
  if (dupErr || !logRow) return;

  const { data: rules } = await db.from("ig_keyword_rules").select("*").eq("active", true);
  const lower = c.text.toLowerCase().trim();
  const rule = (rules ?? [])
    .filter((r) => !r.media_id || r.media_id === c.media?.id)
    .sort((a, b) => Number(!!b.media_id) - Number(!!a.media_id))
    .find((r) => {
      const kw = r.keyword.toLowerCase().trim();
      return r.match_type === "exact" ? lower === kw : lower.includes(kw);
    });

  if (!rule) {
    await db.from("ig_dm_log").update({ dm_status: "no_match" }).eq("id", logRow.id);
    return;
  }

  const update: Record<string, unknown> = { rule_id: rule.id };
  try {
    if (rule.require_follow) {
      const text = await personalise(rule.gate_text || DEFAULT_GATE, c.from?.username);
      await sendPrivateReply(accountId, c.id, withButton(text, BTN_DETAILS, `DETAILS:${logRow.id}`));
      update.dm_status = "gate_sent";
    } else {
      await sendPrivateReply(accountId, c.id, { text: await personalise(rule.reply_text, c.from?.username) });
      update.dm_status = "sent";
      update.delivered_at = new Date().toISOString();
      await db.from("ig_keyword_rules").update({ trigger_count: rule.trigger_count + 1 }).eq("id", rule.id);
    }
  } catch (e: any) {
    update.dm_status = "failed";
    update.error = e.message;
  }

  if (rule.public_reply && update.dm_status !== "failed") {
    try {
      await igPost(`/${c.id}/replies`, { message: await personalise(rule.public_reply, c.from?.username) });
      update.reply_status = "sent";
    } catch (e: any) {
      update.reply_status = "failed";
      update.error = [update.error, e.message].filter(Boolean).join(" | ");
    }
  }

  await db.from("ig_dm_log").update(update).eq("id", logRow.id);
}

async function handleMessage(accountId: string, m: MessageEvent) {
  if (!ACCESS_TOKEN) return;
  const db = adminSupabase();
  const userId = m.sender!.id;
  const payload = m.message?.quick_reply?.payload ?? m.postback?.payload ?? "";
  const logId = payload.includes(":") ? payload.split(":")[1] : null;

  let q = db.from("ig_dm_log").select("id, rule_id, username, from_id")
    .in("dm_status", ["gate_sent", "awaiting_follow"]);
  q = logId ? q.eq("id", logId) : q.eq("from_id", userId);
  const { data: pending } = await q.order("created_at", { ascending: false }).limit(1);
  const row = pending?.[0];
  if (!row?.rule_id || row.from_id !== userId) return;

  const { data: rule } = await db.from("ig_keyword_rules").select("*").eq("id", row.rule_id).single();
  if (!rule) return;

  try {
    const profile = await igGet(`/${userId}?fields=username,is_user_follow_business`);
    const username = profile.username ?? row.username;
    if (profile.is_user_follow_business) {
      await sendDirect(accountId, userId, { text: await personalise(rule.reply_text, username) });
      await db.from("ig_dm_log").update({ dm_status: "sent", delivered_at: new Date().toISOString(), error: null }).eq("id", row.id);
      await db.from("ig_keyword_rules").update({ trigger_count: rule.trigger_count + 1 }).eq("id", rule.id);
    } else {
      const text = await personalise(rule.follow_text || DEFAULT_FOLLOW, username);
      await sendDirect(accountId, userId, withButton(text, BTN_FOLLOWED, `FOLLOWED:${row.id}`));
      await db.from("ig_dm_log").update({ dm_status: "awaiting_follow" }).eq("id", row.id);
    }
  } catch (e: any) {
    await db.from("ig_dm_log").update({ error: e.message }).eq("id", row.id);
  }
}
