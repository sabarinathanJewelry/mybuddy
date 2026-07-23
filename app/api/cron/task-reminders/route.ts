import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const dynamic = "force-dynamic";

type Sub = { endpoint: string; p256dh: string; auth: string };

async function pushToSubs(subs: Sub[], title: string, body: string) {
  if (!subs.length) return;
  const payload = JSON.stringify({ title, body, badge: 1 });
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );
  return results;
}

export async function GET(req: NextRequest) {
  // Vercel sets CRON_SECRET automatically; skip check only in local dev
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const today    = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

  // Fetch pending tasks due today, tomorrow, or overdue
  const { data: tasks } = await db
    .from("staff_tasks")
    .select("title, assigned_to, due_date, due_time")
    .eq("status", "pending")
    .lte("due_date", tomorrow);

  if (!tasks?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  function fmtTime(t: string | null): string {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  }

  function taskLabel(t: { title: string; due_time?: string | null }): string {
    return t.due_time ? `${t.title} at ${fmtTime(t.due_time)}` : t.title;
  }

  // Bucket tasks
  const overdueByStaff:  Record<string, string[]> = {};
  const todayByStaff:    Record<string, string[]> = {};
  const tomorrowByStaff: Record<string, string[]> = {};

  for (const t of tasks) {
    if (t.due_date < today)       (overdueByStaff[t.assigned_to]  ??= []).push(taskLabel(t));
    else if (t.due_date === today) (todayByStaff[t.assigned_to]   ??= []).push(taskLabel(t));
    else                           (tomorrowByStaff[t.assigned_to] ??= []).push(taskLabel(t));
  }

  const allBioIds = [...new Set(tasks.map((t) => t.assigned_to))];

  // Resolve bio_user_id → auth user_id for staff
  const { data: staffRows } = await db
    .from("staff")
    .select("bio_user_id, user_id")
    .in("bio_user_id", allBioIds);

  const bioToUserId: Record<string, string> = {};
  for (const row of staffRows ?? []) {
    if (row.user_id) bioToUserId[String(row.bio_user_id)] = row.user_id;
  }

  const staffUserIds = Object.values(bioToUserId).filter(Boolean);

  // Fetch web push subscriptions for all relevant staff at once
  const { data: staffSubs } = staffUserIds.length
    ? await db
        .from("web_push_subscriptions")
        .select("user_id, endpoint, p256dh, auth")
        .in("user_id", staffUserIds)
    : { data: [] };

  const subsByUserId: Record<string, Sub[]> = {};
  for (const s of staffSubs ?? []) {
    (subsByUserId[s.user_id] ??= []).push(s);
  }

  // ── Notify each staff member ───────────────────────────────────────────────
  let staffSent = 0;

  for (const bioId of allBioIds) {
    const userId = bioToUserId[String(bioId)];
    if (!userId) continue;
    const subs = subsByUserId[userId] ?? [];
    if (!subs.length) continue;

    const overdue  = overdueByStaff[bioId]  ?? [];
    const today_   = todayByStaff[bioId]    ?? [];
    const tomorrow_= tomorrowByStaff[bioId] ?? [];

    if (overdue.length + today_.length > 0) {
      const parts: string[] = [];
      if (overdue.length)  parts.push(`${overdue.length} overdue`);
      if (today_.length)   parts.push(today_.length === 1 ? today_[0] : `${today_.length} due today`);
      await pushToSubs(subs, "Tasks Need Attention", parts.join(" · "));
      staffSent++;
    }

    if (tomorrow_.length > 0) {
      const body = tomorrow_.length === 1 ? tomorrow_[0] : `${tomorrow_.length} tasks due tomorrow`;
      await pushToSubs(subs, "Task Due Tomorrow", body);
      staffSent++;
    }
  }

  // ── Notify admins/subadmins with a summary ─────────────────────────────────
  const { data: adminProfiles } = await db
    .from("profiles")
    .select("id")
    .in("role", ["admin", "subadmin"]);

  const adminIds = (adminProfiles ?? []).map((p: any) => p.id);
  let adminSent = 0;

  if (adminIds.length) {
    const { data: adminSubRows } = await db
      .from("web_push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", adminIds);

    const adminSubList: Sub[] = adminSubRows ?? [];

    if (adminSubList.length) {
      const overdueTotal  = Object.values(overdueByStaff).flat().length;
      const todayTotal    = Object.values(todayByStaff).flat().length;
      const tomorrowTotal = Object.values(tomorrowByStaff).flat().length;

      const parts: string[] = [];
      if (overdueTotal  > 0) parts.push(`${overdueTotal} overdue`);
      if (todayTotal    > 0) parts.push(`${todayTotal} due today`);
      if (tomorrowTotal > 0) parts.push(`${tomorrowTotal} due tomorrow`);

      if (parts.length) {
        await pushToSubs(adminSubList, "Staff Task Summary", parts.join(" · "));
        adminSent = adminSubList.length;
      }
    }
  }

  return NextResponse.json({ ok: true, staffSent, adminSent });
}
