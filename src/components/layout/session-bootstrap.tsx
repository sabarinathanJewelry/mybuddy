"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useBoardRate } from "@/stores/board-rate";
import { useLangStore } from "@/stores/lang";
import { useGlobalDate } from "@/stores/global-date";

async function fetchRateForDate(date: string) {
  const { data } = await supabase()
    .from("board_rates")
    .select("*")
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

export default function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const setProfile = useAuth((s) => s.setProfile);
  const setRate = useBoardRate((s) => s.setRate);
  const setLang = useLangStore((s) => s.setLang);
  const globalDate = useGlobalDate((s) => s.date);

  // Initial session + board rate load
  useEffect(() => {
    const client = supabase();

    async function loadProfile() {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return null;
      const { data: profile } = await client
        .from("profiles")
        .select("id, display_name, role, language, repair_access, incentive_access")
        .eq("id", session.user.id)
        .single();
      return profile;
    }

    async function init() {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const profile = await loadProfile();
      if (profile) {
        setProfile(profile);
        if (profile.language) setLang(profile.language as "en" | "ta");
      }

      const rate = await fetchRateForDate(globalDate);
      if (rate) setRate(rate);

      setReady(true);
    }

    init();

    // Re-fetch profile on window focus so permission changes take effect without re-login
    function onFocus() { loadProfile().then(p => { if (p) setProfile(p); }); }
    window.addEventListener("focus", onFocus);

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
        router.replace("/login");
      }
    });

    return () => {
      window.removeEventListener("focus", onFocus);
      listener.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload board rate whenever global date changes
  useEffect(() => {
    if (!ready) return;
    fetchRateForDate(globalDate).then((rate) => {
      if (rate) setRate(rate);
    });
  }, [globalDate, ready, setRate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-ink-dim text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
