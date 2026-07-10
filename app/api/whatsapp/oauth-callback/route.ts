import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://mybuddy-inky.vercel.app";
const REDIRECT_URI = `${BASE_URL}/api/whatsapp/oauth-callback`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/admin/whatsapp-setup?error=${encodeURIComponent(error ?? "cancelled")}`, BASE_URL)
    );
  }

  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "4689796147955589";
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appSecret) {
    return NextResponse.redirect(
      new URL("/admin/whatsapp-setup?error=FACEBOOK_APP_SECRET+not+configured+in+Vercel", BASE_URL)
    );
  }

  const tokenRes = await fetch(
    `https://graph.facebook.com/v22.0/oauth/access_token` +
      `?client_id=${appId}` +
      `&client_secret=${appSecret}` +
      `&code=${encodeURIComponent(code)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  );
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    const msg = tokenData.error?.message ?? "token exchange failed";
    return NextResponse.redirect(
      new URL(`/admin/whatsapp-setup?error=${encodeURIComponent(msg)}`, BASE_URL)
    );
  }

  const userToken: string = tokenData.access_token;

  const wabaRes = await fetch(
    `https://graph.facebook.com/v22.0/me/businesses` +
      `?fields=whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number}}` +
      `&access_token=${userToken}`
  );
  const wabaData = await wabaRes.json();

  const businesses: any[] = wabaData.data ?? [];
  for (const biz of businesses) {
    const wabas: any[] = biz.whatsapp_business_accounts?.data ?? [];
    for (const waba of wabas) {
      const phones: any[] = waba.phone_numbers?.data ?? [];
      if (phones.length > 0) {
        const params = new URLSearchParams({
          phone_number_id: phones[0].id,
          waba_id: waba.id,
          display_phone: phones[0].display_phone_number ?? "",
        });
        return NextResponse.redirect(
          new URL(`/admin/whatsapp-setup?${params.toString()}`, BASE_URL)
        );
      }
    }
  }

  return NextResponse.redirect(
    new URL("/admin/whatsapp-setup?error=No+phone+number+found+in+your+WhatsApp+Business+Account", BASE_URL)
  );
}
