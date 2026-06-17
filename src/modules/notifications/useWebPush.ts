"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function saveWebPushSubscription(userId: string, subscription: PushSubscription) {
  const sub = subscription.toJSON();
  await supabase()
    .from("web_push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys?.p256dh,
        auth: sub.keys?.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );
}

export function useWebPush(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId || !VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function register() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        const existing = await reg.pushManager.getSubscription();
        const subscription =
          existing ||
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }));

        await saveWebPushSubscription(userId!, subscription);
      } catch {
        // Browser doesn't support push or user denied
      }
    }

    register();
  }, [userId]);
}
