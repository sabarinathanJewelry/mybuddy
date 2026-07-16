"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface PlayoutItem {
  order_index: number;
  item_type: "image" | "video";
  duration_seconds: number;
  media_url: string | null;
}
interface PlayoutZone {
  zone_index: number;
  x_pct: number; y_pct: number; w_pct: number; h_pct: number;
  items: PlayoutItem[];
}
type PlayoutResponse =
  | { paired: false; pairing_code: string }
  | { paired: true; device_id: string; channel_id: string | null; zones: PlayoutZone[] };

const DEVICE_ID_KEY = "signage_device_id";
const DEVICE_SECRET_KEY = "signage_device_secret";
const FALLBACK_POLL_MS = 60_000;

function ZonePlayer({ zone }: { zone: PlayoutZone }) {
  const [index, setIndex] = useState(0);
  const items = zone.items;
  const item = items[index % Math.max(items.length, 1)];

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (!item || item.item_type === "video") return; // videos advance on onEnded instead
    const timer = setTimeout(() => setIndex((i) => (i + 1) % items.length), Math.max(item.duration_seconds, 1) * 1000);
    return () => clearTimeout(timer);
  }, [item, items.length]);

  const style = {
    position: "absolute" as const,
    left: `${zone.x_pct}%`, top: `${zone.y_pct}%`,
    width: `${zone.w_pct}%`, height: `${zone.h_pct}%`,
    overflow: "hidden" as const,
    background: "#1A1410",
  };

  if (!item || !item.media_url) return <div style={style} />;

  if (item.item_type === "video") {
    return (
      <div style={style}>
        <video
          key={item.media_url}
          src={item.media_url}
          autoPlay muted playsInline
          onEnded={() => setIndex((i) => (i + 1) % items.length)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  return (
    <div style={style}>
      <img key={item.media_url} src={item.media_url} style={{ width: "100%", height: "100%", objectFit: "contain" }} alt="" />
    </div>
  );
}

function PairingScreen({ code }: { code: string }) {
  return (
    <div className="h-screen w-screen bg-[#1A1410] flex flex-col items-center justify-center text-center gap-6">
      <p className="text-gold text-2xl font-semibold tracking-wide">MyBuddy Signage</p>
      <p className="text-white/70 text-lg">Enter this code in Admin → Signage → Devices</p>
      <p className="text-white text-8xl font-bold tracking-[0.3em]">{code}</p>
    </div>
  );
}

// Prevents the TV's screensaver/sleep from kicking in while this page is open.
// The OS only sees "no remote input," not that content is actively playing, so
// without this it would screensaver over the signage after a few idle minutes.
// Re-acquires on visibility change, since the Wake Lock API auto-releases when
// the page is backgrounded (e.g. briefly, during an app switch).
function useScreenWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;

    async function acquire() {
      try {
        lock = await (navigator as any).wakeLock.request("screen");
      } catch {
        // Some WebViews reject this outside a user gesture or when hidden — harmless, will retry.
      }
    }
    acquire();

    function handleVisibility() {
      if (document.visibilityState === "visible") acquire();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      lock?.release().catch(() => {});
    };
  }, []);
}

export default function TvPlayerPage() {
  useScreenWakeLock();
  const [playout, setPlayout] = useState<PlayoutResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const credsRef = useRef<{ device_id: string; device_secret: string } | null>(null);

  const fetchPlayout = useCallback(async () => {
    const creds = credsRef.current;
    if (!creds) return;
    try {
      const res = await fetch("/api/signage/playout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to load playout");
      setPlayout(body);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load playout");
    }
  }, []);

  useEffect(() => {
    async function init() {
      let deviceId = localStorage.getItem(DEVICE_ID_KEY);
      let deviceSecret = localStorage.getItem(DEVICE_SECRET_KEY);

      if (!deviceId || !deviceSecret) {
        try {
          const res = await fetch("/api/signage/request-code", { method: "POST" });
          const body = await res.json();
          if (!res.ok) throw new Error(body?.error ?? "Failed to request a pairing code");
          deviceId = body.device_id;
          deviceSecret = body.device_secret;
          localStorage.setItem(DEVICE_ID_KEY, deviceId!);
          localStorage.setItem(DEVICE_SECRET_KEY, deviceSecret!);
        } catch (e: any) {
          setError(e?.message ?? "Failed to request a pairing code");
          return;
        }
      }

      credsRef.current = { device_id: deviceId!, device_secret: deviceSecret! };
      fetchPlayout();
    }
    init();
  }, [fetchPlayout]);

  // Realtime: refetch the instant the CMS or the poster generator changes anything.
  useEffect(() => {
    const channel = supabase().channel("signage-updates");
    channel.on("broadcast", { event: "refresh" }, () => fetchPlayout()).subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [fetchPlayout]);

  // Fallback poll — covers a missed broadcast (reconnects, app backgrounded, etc.)
  // and, while still pending, catches the moment staff claims the device.
  useEffect(() => {
    const interval = setInterval(fetchPlayout, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchPlayout]);

  if (error) {
    return (
      <div className="h-screen w-screen bg-[#1A1410] flex items-center justify-center">
        <p className="text-white/70 text-xl">{error}</p>
      </div>
    );
  }

  if (!playout) return <div className="h-screen w-screen bg-[#1A1410]" />;

  if (!playout.paired) return <PairingScreen code={playout.pairing_code} />;

  if (playout.zones.length === 0) {
    return (
      <div className="h-screen w-screen bg-[#1A1410] flex items-center justify-center">
        <p className="text-white/70 text-xl">Paired — waiting for a channel to be assigned.</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#1A1410] relative overflow-hidden">
      {playout.zones.map((zone) => <ZonePlayer key={zone.zone_index} zone={zone} />)}
    </div>
  );
}
