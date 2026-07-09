import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET: Meta webhook verification handshake
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("[WA webhook] GET verify — mode:", mode, "token match:", token === VERIFY_TOKEN, "env set:", !!VERIFY_TOKEN);

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden", hint: !VERIFY_TOKEN ? "WHATSAPP_VERIFY_TOKEN not set" : "token mismatch" }, { status: 403 });
}

// POST: Inbound messages → upsert lead + store message
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const entries: any[] = body?.entry ?? [];

  for (const entry of entries) {
    const changes: any[] = entry?.changes ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;
      const value    = change.value ?? {};
      const messages: any[] = value.messages ?? [];
      const contacts: any[] = value.contacts ?? [];

      for (const msg of messages) {
        const waId        = msg.from as string;
        const waMessageId = msg.id  as string;
        const ts          = new Date(Number(msg.timestamp) * 1000).toISOString();
        const name        = (contacts.find((c: any) => c.wa_id === waId)?.profile?.name as string) ?? null;

        let text = "";
        if      (msg.type === "text")     text = msg.text?.body    ?? "";
        else if (msg.type === "image")    text = "[Image]";
        else if (msg.type === "audio")    text = "[Voice message]";
        else if (msg.type === "video")    text = "[Video]";
        else if (msg.type === "document") text = `[Document: ${msg.document?.filename ?? "file"}]`;
        else if (msg.type === "sticker")  text = "[Sticker]";
        else                              text = `[${msg.type}]`;

        await upsertLead(waId, "whatsapp", name, text, waMessageId, ts);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function upsertLead(
  waId: string,
  channel: string,
  name: string | null,
  text: string,
  messageId: string,
  ts: string
) {
  const db = adminSupabase();

  const { data: existing } = await db
    .from("whatsapp_leads")
    .select("id")
    .eq("wa_id", waId)
    .eq("channel", channel)
    .maybeSingle();

  let leadId: string;

  if (existing) {
    await db
      .from("whatsapp_leads")
      .update({
        last_message_at: ts,
        updated_at: new Date().toISOString(),
        ...(name ? { display_name: name } : {}),
      })
      .eq("id", existing.id);
    leadId = existing.id;
  } else {
    const { data: newLead, error } = await db
      .from("whatsapp_leads")
      .insert({ wa_id: waId, channel, display_name: name, status: "new", last_message_at: ts })
      .select("id")
      .single();
    if (error || !newLead) {
      console.error("[WA webhook] insert lead failed:", error);
      return;
    }
    leadId = newLead.id;
  }

  await db.from("whatsapp_messages").upsert(
    {
      lead_id: leadId,
      wa_message_id: messageId,
      direction: "inbound",
      body: text,
      status: "received",
      created_at: ts,
    },
    { onConflict: "wa_message_id", ignoreDuplicates: true }
  );
}
