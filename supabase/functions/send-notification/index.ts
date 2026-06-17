import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getFcmAccessToken(): Promise<string | null> {
  try {
    const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FCM_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!clientEmail || !privateKey || !projectId) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const payload = btoa(JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const signingInput = `${header}.${payload}`;
    const keyData = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
    const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const json = await res.json();
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { user_ids, title, body, url = "/" } = await req.json();

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const payload = JSON.stringify({ title, body, url });

  // Web Push (iPhone PWA + browser)
  const { data: webSubs } = await supabase
    .from("web_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", user_ids);

  const webResults = await Promise.allSettled(
    (webSubs ?? []).map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Native Android FCM
  let fcmSent = 0;
  let fcmFailed = 0;
  const accessToken = await getFcmAccessToken();
  const projectId = Deno.env.get("FCM_PROJECT_ID");

  if (accessToken && projectId) {
    const { data: fcmTokens } = await supabase
      .from("device_tokens")
      .select("token")
      .in("user_id", user_ids)
      .eq("platform", "android");

    const fcmResults = await Promise.allSettled(
      (fcmTokens ?? []).map((row) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: row.token,
              notification: { title, body },
              data: { url },
            },
          }),
        })
      )
    );
    fcmSent = fcmResults.filter((r) => r.status === "fulfilled").length;
    fcmFailed = fcmResults.filter((r) => r.status === "rejected").length;
  }

  const webSent = webResults.filter((r) => r.status === "fulfilled").length;
  const webFailed = webResults.filter((r) => r.status === "rejected").length;

  return new Response(
    JSON.stringify({ sent: webSent + fcmSent, failed: webFailed + fcmFailed, webSent, fcmSent }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
