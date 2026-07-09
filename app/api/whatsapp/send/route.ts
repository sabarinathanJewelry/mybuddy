import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    ?? "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const WA_API_BASE     = "https://graph.facebook.com/v21.0";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { leadId, text, sentBy } = await req.json() as {
    leadId: string;
    text: string;
    sentBy?: string;
  };

  if (!leadId || !text?.trim()) {
    return NextResponse.json({ error: "Missing leadId or text" }, { status: 400 });
  }
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    return NextResponse.json({ error: "WhatsApp not configured" }, { status: 503 });
  }

  const db = adminSupabase();

  const { data: lead } = await db
    .from("whatsapp_leads")
    .select("wa_id, channel")
    .eq("id", leadId)
    .single();

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (lead.channel !== "whatsapp") {
    return NextResponse.json({ error: "Can only send WhatsApp messages from this route" }, { status: 400 });
  }

  const res = await fetch(`${WA_API_BASE}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: lead.wa_id,
      type: "text",
      text: { preview_url: false, body: text.trim() },
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("[WA send] failed:", result);
    return NextResponse.json({ error: result }, { status: 500 });
  }

  await db.from("whatsapp_messages").insert({
    lead_id: leadId,
    wa_message_id: result.messages?.[0]?.id ?? null,
    direction: "outbound",
    body: text.trim(),
    status: "sent",
    sent_by: sentBy ?? null,
  });

  return NextResponse.json({ ok: true });
}
