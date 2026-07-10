import { NextRequest, NextResponse } from "next/server";

// Exchanges the Embedded Signup auth code for a user access token,
// then retrieves the WABA and phone number IDs for Coexistence setup.
export async function POST(req: NextRequest) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const code = body.code;
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const appId = process.env.FACEBOOK_APP_ID ?? "468979614795589";
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appSecret) {
    return NextResponse.json({ error: "FACEBOOK_APP_SECRET not configured" }, { status: 500 });
  }

  // Exchange the short-lived code for a user access token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`,
    { method: "GET" }
  );
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("[WA connect] token exchange failed:", tokenData);
    return NextResponse.json(
      { error: tokenData.error?.message ?? "Token exchange failed" },
      { status: 400 }
    );
  }

  const userToken: string = tokenData.access_token;

  // Fetch the WhatsApp Business Accounts this user has access to
  const wabaRes = await fetch(
    `https://graph.facebook.com/v22.0/me/businesses?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number}}&access_token=${userToken}`
  );
  const wabaData = await wabaRes.json();

  if (!wabaRes.ok) {
    console.error("[WA connect] WABA fetch failed:", wabaData);
    return NextResponse.json(
      { error: wabaData.error?.message ?? "Failed to fetch WABA info" },
      { status: 400 }
    );
  }

  // Extract first available WABA and phone number
  const businesses: any[] = wabaData.data ?? [];
  for (const biz of businesses) {
    const wabas: any[] = biz.whatsapp_business_accounts?.data ?? [];
    for (const waba of wabas) {
      const phones: any[] = waba.phone_numbers?.data ?? [];
      if (phones.length > 0) {
        return NextResponse.json({
          waba_id: waba.id,
          phone_number_id: phones[0].id,
          display_phone_number: phones[0].display_phone_number ?? null,
        });
      }
    }
  }

  // Fallback: return raw data so user can inspect
  return NextResponse.json({
    error: "Could not find phone number in WABA. Raw data below — check phone_number_id manually.",
    raw: wabaData,
  }, { status: 422 });
}
