"use client";

import { useEffect, useState } from "react";
import {
  useAppNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/modules/attendance/api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function subscribePush(bioUserId: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio_user_id: bioUserId, subscription: sub.toJSON() }),
    });
  } catch {
    // push not supported or denied
  }
}

export default function NotificationBell({ bioUserId }: { bioUserId: string | null }) {
  const { data: notifications = [] } = useAppNotifications(bioUserId);
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if ("setAppBadge" in navigator) {
      if (notifications.length > 0) {
        navigator.setAppBadge(notifications.length);
      } else {
        navigator.clearAppBadge();
      }
    }
  }, [notifications.length]);

  useEffect(() => {
    if (!bioUserId || !VAPID_PUBLIC_KEY) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      subscribePush(bioUserId);
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then(perm => {
        if (perm === "granted") subscribePush(bioUserId);
      });
    }
  }, [bioUserId]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg2 border border-line hover:bg-canvas/80 transition-colors text-ink-dim"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-err text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
            {notifications.length > 9 ? "9+" : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-line rounded-xl shadow-soft z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
              <span className="text-sm font-semibold">Notifications</span>
              {notifications.length > 0 && (
                <button
                  onClick={() => {
                    markAll.mutate({ notificationIds: notifications.map(n => n.id), bioUserId });
                    setOpen(false);
                  }}
                  className="text-xs text-gold hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-dim">No new notifications</p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-line">
                {notifications.map(n => (
                  <div key={n.id} className="px-4 py-3 hover:bg-canvas/50 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{n.title}</p>
                      <p className="text-xs text-ink-dim mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-[10px] text-ink-dim/60 mt-1">
                        {new Date(n.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <button
                      onClick={() => markOne.mutate({ notificationId: n.id, bioUserId })}
                      className="text-[10px] text-ink-dim hover:text-gold shrink-0 mt-0.5 leading-none"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
