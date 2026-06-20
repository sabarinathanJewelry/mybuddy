import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Today in IST (UTC+5:30)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const today = ist.toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);
  const isFirstOfMonth = ist.getDate() === 1;

  // Get all active staff profiles
  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("id, display_name, role");

  const staffIds = (allProfiles ?? []).map((p: any) => p.id);
  const adminIds = (allProfiles ?? []).filter((p: any) => p.role === "admin").map((p: any) => p.id);

  // Get approved week-offs for this month
  const { data: weekoffs } = await supabase
    .from("monthly_weekoffs")
    .select("user_id, dates, profiles(display_name)")
    .eq("month", monthKey)
    .eq("status", "approved");

  // Staff on leave today
  const onLeaveToday = (weekoffs ?? []).filter((w: any) =>
    w.dates.includes(today)
  );

  // Staff who haven't submitted any weekoff this month
  const submittedUserIds = new Set((weekoffs ?? []).map((w: any) => w.user_id));

  // Also check pending/draft submissions
  const { data: allSubmissions } = await supabase
    .from("monthly_weekoffs")
    .select("user_id")
    .eq("month", monthKey);

  const anySubmissionIds = new Set((allSubmissions ?? []).map((w: any) => w.user_id));
  const neverApplied = (allProfiles ?? []).filter((p: any) => !anySubmissionIds.has(p.id));

  async function sendWebPush(userIds: string[], title: string, body: string) {
    const { data: subs } = await supabase
      .from("web_push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", userIds);

    const payload = JSON.stringify({ title, body, url: "/weekoffs" });
    await Promise.allSettled(
      (subs ?? []).map((sub: any) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      )
    );
  }

  const results: string[] = [];

  // 1. Daily notification to all: who is on leave today
  if (onLeaveToday.length > 0) {
    const names = onLeaveToday.map((w: any) => (w.profiles as any)?.display_name ?? "Staff").join(", ");
    await sendWebPush(
      staffIds,
      "Team Week-off Today",
      `${names} ${onLeaveToday.length === 1 ? "is" : "are"} on week-off today.`
    );
    results.push(`Sent today-off alert for: ${names}`);
  } else {
    results.push("No one on leave today — no alert sent");
  }

  // 2. On 1st of month: alert admin about staff who haven't applied
  if (isFirstOfMonth && neverApplied.length > 0) {
    const names = neverApplied.map((p: any) => p.display_name).join(", ");
    await sendWebPush(
      adminIds,
      "Week-off Plans Missing",
      `${names} ${neverApplied.length === 1 ? "has" : "have"} not planned their week-offs for this month.`
    );
    results.push(`Sent missing-plan alert to admin for: ${names}`);
  }

  // 3. Also notify admin daily if anyone still hasn't applied after 5th of month
  const dayOfMonth = ist.getDate();
  if (dayOfMonth >= 5 && neverApplied.length > 0) {
    const names = neverApplied.map((p: any) => p.display_name).join(", ");
    await sendWebPush(
      adminIds,
      "Reminder: Week-off Plans Missing",
      `${names} still haven't planned their week-offs for ${monthKey}.`
    );
    results.push(`Sent overdue-plan reminder to admin for: ${names}`);
  }

  return new Response(
    JSON.stringify({ date: today, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
