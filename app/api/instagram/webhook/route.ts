import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN ?? "";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const IG_API_BASE = "https://graph.instagram.com/v21.0";

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

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[IG webhook] Verified");
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST: Incoming comment events ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Meta sends batched entries
  const entries: any[] = body?.entry ?? [];

  for (const entry of entries) {
    // Instagram comment webhooks arrive under messaging or changes
    const changes: any[] = entry?.changes ?? [];
    for (const change of changes) {
      if (change.field !== "comments") continue;
      const commentText: string = change.value?.text ?? "";
      const commenterId: string = change.value?.from?.id ?? "";
      if (!commentText || !commenterId) continue;

      await handleComment(commentText, commenterId);
    }

    // Also handle via messaging field (some webhook configs use this)
    const messaging: any[] = entry?.messaging ?? [];
    for (const msg of messaging) {
      if (!msg.message?.text) continue;
      // Incoming DM — ignore for now (handled separately if needed)
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleComment(commentText: string, commenterId: string) {
  if (!ACCESS_TOKEN) return;

  const db = adminSupabase();
  const { data: rules } = await db
    .from("ig_keyword_rules")
    .select("*")
    .eq("active", true);

  if (!rules?.length) return;

  const lower = commentText.toLowerCase().trim();

  for (const rule of rules) {
    const kw = rule.keyword.toLowerCase().trim();
    const matched =
      rule.match_type === "exact" ? lower === kw : lower.includes(kw);

    if (matched) {
      await sendDM(commenterId, rule.reply_text);
      // Increment trigger count
      await db
        .from("ig_keyword_rules")
        .update({ trigger_count: rule.trigger_count + 1 })
        .eq("id", rule.id);
      break; // first matching rule wins
    }
  }
}

async function sendDM(recipientId: string, text: string) {
  try {
    const res = await fetch(`${IG_API_BASE}/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: ACCESS_TOKEN,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[IG webhook] DM failed:", data);
    } else {
      console.log("[IG webhook] DM sent to", recipientId);
    }
  } catch (err) {
    console.error("[IG webhook] sendDM error:", err);
  }
}
