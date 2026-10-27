import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN ?? "";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const APP_SECRET   = process.env.INSTAGRAM_APP_SECRET ?? "";
const IG_API_BASE  = "https://graph.instagram.com/v21.0";

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

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  parent_id?: string;
};

// ── POST: Incoming comment events ────────────────────────────────────────────
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
  }

  return NextResponse.json({ ok: true });
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

function personalise(text: string, username?: string) {
  const name = username ?? "there";
  return text.replace(/\{name\}|\{username\}/gi, name);
}

async function handleComment(accountId: string, c: CommentEvent) {
  if (!ACCESS_TOKEN) return;
  const db = adminSupabase();

  const { error: dupErr } = await db.from("ig_dm_log").insert({
    comment_id: c.id,
    media_id: c.media?.id ?? null,
    from_id: c.from?.id,
    username: c.from?.username ?? null,
    comment_text: c.text,
  });
  if (dupErr) return;

  const { data: rules } = await db.from("ig_keyword_rules").select("*").eq("active", true);
  const lower = c.text.toLowerCase().trim();
  const candidates = (rules ?? [])
    .filter((r) => !r.media_id || r.media_id === c.media?.id)
    .sort((a, b) => Number(!!b.media_id) - Number(!!a.media_id));
  const rule = candidates.find((r) => {
    const kw = r.keyword.toLowerCase().trim();
    return r.match_type === "exact" ? lower === kw : lower.includes(kw);
  });

  if (!rule) {
    await db.from("ig_dm_log").update({ dm_status: "no_match" }).eq("comment_id", c.id);
    return;
  }

  const update: Record<string, unknown> = { rule_id: rule.id };
  try {
    await igPost(`/${accountId}/messages`, {
      recipient: { comment_id: c.id },
      message: { text: personalise(rule.reply_text, c.from?.username) },
    });
    update.dm_status = "sent";
    await db.from("ig_keyword_rules").update({ trigger_count: rule.trigger_count + 1 }).eq("id", rule.id);
  } catch (e: any) {
    update.dm_status = "failed";
    update.error = e.message;
  }

  if (rule.public_reply && update.dm_status === "sent") {
    try {
      await igPost(`/${c.id}/replies`, { message: personalise(rule.public_reply, c.from?.username) });
      update.reply_status = "sent";
    } catch (e: any) {
      update.reply_status = "failed";
      update.error = [update.error, e.message].filter(Boolean).join(" | ");
    }
  }

  await db.from("ig_dm_log").update(update).eq("comment_id", c.id);
}
