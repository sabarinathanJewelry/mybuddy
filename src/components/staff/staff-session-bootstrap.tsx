"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";

export default function StaffSessionBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const setProfile = useAuth((s) => s.setProfile);

  useEffect(() => {
    const client = supabase();

    async function init() {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await client
        .from("profiles")
        .select("id, display_name, role, language, repair_access, incentive_access, kolusu_access, allowed_modules, is_active")
        .eq("id", session.user.id)
        .single();

      if (profile?.is_active === false) {
        await client.auth.signOut();
        router.replace("/login?reason=deactivated");
        return;
      }
      if (profile) setProfile(profile);

      setReady(true);
    }

    init();

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
        router.replace("/login");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [router, setProfile]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-10 h-10 border-4 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
