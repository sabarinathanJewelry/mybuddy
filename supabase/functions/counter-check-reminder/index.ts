import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHECK_SLOTS = [
  "09:30","10:30","11:30","12:30","13:30",
  "14:30","15:30","16:30","17:30","18:30",
  "19:30","20:30","21:30",
];

async function getFcmAccessToken(): Promise<string | null> {
  try {
    const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
    const privateKey = Deno.env.get("FCM_PRIVATE_KEY")?.replace(/\\n/g, "\n");
    const projectId = Deno.env.get("FCM_PROJECT_ID");
    if (!clientEmail || !privateKey || !projectId) return null;

    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
    const payload = btoa(JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");

    const signingInput = `${header}.${payload}`;
    const keyData = privateKey.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\s/g,"");
    const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}`;

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

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Current IST time
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const monthKey = ist.toISOString().slice(0, 7);

  // Determine current slot label (e.g. "09:30")
  const istHour = ist.getUTCHours();
  const istMin  = ist.getUTCMinutes();
  const totalMins = istHour * 60 + istMin;
  const currentSlot = CHECK_SLOTS.find(s => {
    const [h, m] = s.split(":").map(Number);
    return Math.abs(h * 60 + m - totalMins) <= 5; // within 5 min of slot time
  }) ?? `${String(istHour).padStart(2,"0")}:${String(istMin).padStart(2,"0")}`;

  // Get this month's supervisor bio_user_id
  const { data: supRow } = await supabase
    .from("counter_supervisors")
    .select("bio_user_id")
    .eq("month", monthKey)
    .maybeSingle();

  if (!supRow?.bio_user_id) {
    return new Response(
      JSON.stringify({ status: "no supervisor set for " + monthKey }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Look up profile UUID via staff.user_id
  const { data: staffRow } = await supabase
    .from("staff")
    .select("user_id, name")
    .eq("bio_user_id", supRow.bio_user_id)
    .maybeSingle();

  if (!staffRow?.user_id) {
    return new Response(
      JSON.stringify({ status: "supervisor has no app account (user_id is null)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supervisorProfileId = staffRow.user_id;
  const title = "Counter Cleanliness Check";
  const body  = `Time for the ${currentSlot} check — please mark all 4 counters neat or not neat.`;
  const url   = "/attendance?tab=counters";
  const payload = JSON.stringify({ title, body, url });

  // Web push
  const { data: webSubs } = await supabase
    .from("web_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", supervisorProfileId);

  const webResults = await Promise.allSettled(
    (webSubs ?? []).map((sub: any) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // FCM (Android)
  let fcmSent = 0;
  const accessToken = await getFcmAccessToken();
  const fcmProject = Deno.env.get("FCM_PROJECT_ID");

  if (accessToken && fcmProject) {
    const { data: fcmTokens } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("user_id", supervisorProfileId)
      .eq("platform", "android");

    const fcmResults = await Promise.allSettled(
      (fcmTokens ?? []).map((row: any) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${fcmProject}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token: row.token, notification: { title, body }, data: { url } } }),
        })
      )
    );
    fcmSent = fcmResults.filter(r => r.status === "fulfilled").length;
  }

  const webSent = webResults.filter(r => r.status === "fulfilled").length;

  return new Response(
    JSON.stringify({ slot: currentSlot, supervisor: staffRow.name, webSent, fcmSent }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
