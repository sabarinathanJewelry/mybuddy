"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { isNative } from "@/lib/capacitor";

async function saveToken(userId: string, token: string, platform: "android" | "ios") {
  await supabase()
    .from("device_tokens")
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" }
    );
}

export function usePushNotifications(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId || !isNative()) return;

    let cleanup: (() => void) | undefined;

    async function register() {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const { Capacitor } = await import("@capacitor/core");

        const result = await PushNotifications.requestPermissions();
        if (result.receive !== "granted") return;

        await PushNotifications.register();

        const platform = Capacitor.getPlatform() as "android" | "ios";

        const regListener = await PushNotifications.addListener("registration", (token) => {
          saveToken(userId, token.value, platform);
        });

        const foregroundListener = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            // Notification received while app is open — browser handles display
            console.log("Notification received:", notification.title);
          }
        );

        cleanup = () => {
          regListener.remove();
          foregroundListener.remove();
        };
      } catch {
        // Not in native environment or package not available
      }
    }

    register();
    return () => cleanup?.();
  }, [userId]);
}
