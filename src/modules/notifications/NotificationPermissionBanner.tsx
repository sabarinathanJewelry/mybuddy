"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function NotificationPermissionBanner({ userId }: { userId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "denied" | "unsupported">("idle");

  useEffect(() => {
    if (!("Notification" in window)) { setStatus("unsupported"); return; }
    if (Notification.permission === "granted") setStatus("done");
    if (Notification.permission === "denied") setStatus("denied");
  }, []);

  if (status === "done" || status === "unsupported" || !VAPID_PUBLIC_KEY) return null;

  async function enable() {
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); return; }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const s = sub.toJSON();
      await supabase().from("web_push_subscriptions").upsert(
        { user_id: userId, endpoint: s.endpoint, p256dh: s.keys?.p256dh, auth: s.keys?.auth, updated_at: new Date().toISOString() },
        { onConflict: "user_id,endpoint" }
      );
      setStatus("done");
    } catch {
      setStatus("denied");
    }
  }

  if (status === "denied") return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-gold text-white rounded-lg2 shadow-soft px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-sm font-medium">Enable notifications to receive alerts</p>
      <button
        onClick={enable}
        disabled={status === "loading"}
        className="text-xs font-semibold bg-white text-gold px-3 py-1.5 rounded-lg2 shrink-0"
      >
        {status === "loading" ? "Setting up…" : "Enable"}
      </button>
    </div>
  );
}
