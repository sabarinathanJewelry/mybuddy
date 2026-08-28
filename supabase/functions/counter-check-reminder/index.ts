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

async function sendPushToUser(
  supabase: any,
  userId: string,
  title: string,
  body: string,
  url: string,
  accessToken: string | null,
  fcmProject: string | undefined,
) {
  const payload = JSON.stringify({ title, body, url });

  const { data: webSubs } = await supabase
    .from("web_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  const webResults = await Promise.allSettled(
    (webSubs ?? []).map((sub: any) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  let fcmSent = 0;
  if (accessToken && fcmProject) {
    const { data: fcmTokens } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId)
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

  return {
    webSent: webResults.filter(r => r.status === "fulfilled").length,
    fcmSent,
  };
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

  const accessToken = await getFcmAccessToken();
  const fcmProject = Deno.env.get("FCM_PROJECT_ID");

  // Current IST time
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const monthKey = ist.toISOString().slice(0, 7);
  const todayDate = ist.toISOString().slice(0, 10);

  const istHour = ist.getUTCHours();
  const istMin  = ist.getUTCMinutes();
  const totalMins = istHour * 60 + istMin;

  // Find current slot index
  const currentSlotIdx = CHECK_SLOTS.findIndex(s => {
    const [h, m] = s.split(":").map(Number);
    return Math.abs(h * 60 + m - totalMins) <= 5;
  });
  const currentSlot = currentSlotIdx >= 0
    ? CHECK_SLOTS[currentSlotIdx]
    : `${String(istHour).padStart(2,"0")}:${String(istMin).padStart(2,"0")}`;

  // Previous slot (null if this is the first slot)
  const prevSlot = currentSlotIdx > 0 ? CHECK_SLOTS[currentSlotIdx - 1] : null;

  // ── 1. Remind supervisor to mark current slot ────────────────────────────────

  const { data: supRow } = await supabase
    .from("counter_supervisors")
    .select("bio_user_id")
    .eq("month", monthKey)
    .maybeSingle();

  let supervisorResult: any = { status: "no supervisor set for " + monthKey };

  if (supRow?.bio_user_id) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("user_id, name")
      .eq("bio_user_id", supRow.bio_user_id)
      .maybeSingle();

    if (staffRow?.user_id) {
      const r = await sendPushToUser(
        supabase,
        staffRow.user_id,
        "Counter Cleanliness Check",
        `Time for the ${currentSlot} check — please mark all 4 counters neat or not neat.`,
        "/counters",
        accessToken,
        fcmProject,
      );
      supervisorResult = { supervisor: staffRow.name, slot: currentSlot, ...r };
    } else {
      supervisorResult = { status: "supervisor has no app account" };
    }
  }

  // ── 2. Check for 2 consecutive missed slots → notify admin ──────────────────

  let adminAlertResult: any = null;

  if (prevSlot && currentSlotIdx >= 1) {
    // Count entries for BOTH the previous slot and the one before it (2 hours ago)
    // More robust: check if prevSlot AND currentSlot are both completely missing
    const { data: prevChecks } = await supabase
      .from("cleanliness_checks")
      .select("id")
      .eq("check_date", todayDate)
      .eq("check_slot", prevSlot);

    const { data: currChecks } = await supabase
      .from("cleanliness_checks")
      .select("id")
      .eq("check_date", todayDate)
      .eq("check_slot", currentSlot);

    const prevMissed = (prevChecks ?? []).length === 0;
    const currMissed = (currChecks ?? []).length === 0;

    if (prevMissed && currMissed) {
      // Find all admin users and notify them
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .in("role", ["admin", "subadmin"]);

      const adminIds: string[] = (admins ?? []).map((a: any) => a.id);
      const supervisorName = supervisorResult.supervisor ?? "The supervisor";

      const results = await Promise.all(
        adminIds.map(adminId =>
          sendPushToUser(
            supabase,
            adminId,
            "Counter Check Missed",
            `${supervisorName} has not marked cleanliness for ${prevSlot} and ${currentSlot}. Please follow up.`,
            "/counters",
            accessToken,
            fcmProject,
          )
        )
      );

      adminAlertResult = {
        triggered: true,
        missedSlots: [prevSlot, currentSlot],
        adminCount: adminIds.length,
        totalWebSent: results.reduce((s, r) => s + r.webSent, 0),
        totalFcmSent: results.reduce((s, r) => s + r.fcmSent, 0),
      };
    } else {
      adminAlertResult = { triggered: false, prevMissed, currMissed };
    }
  }

  return new Response(
    JSON.stringify({ supervisorReminder: supervisorResult, adminAlert: adminAlertResult }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
