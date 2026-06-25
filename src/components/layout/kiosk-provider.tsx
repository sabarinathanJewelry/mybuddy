"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useKiosk } from "@/stores/kiosk";
import { useAuth } from "@/stores/auth";
import { useKioskSequence, useAdminKioskSequences } from "@/modules/attendance/api";
import StaffAbsenceBanner from "@/components/layout/staff-absence-banner";

const IDLE_MS = 5 * 60 * 1000;

export default function KioskProvider({
  children,
  sidebar,
  topbar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
}) {
  const { isLocked, lock, unlock } = useKiosk();
  const { data: sequence, isLoading: seqLoading } = useKioskSequence();
  const { data: adminSeqs = [], isLoading: adminSeqLoading } = useAdminKioskSequences();
  const profile = useAuth((s) => s.profile);
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const loading = seqLoading || adminSeqLoading;
  const hasPerUserSeqs = adminSeqs.some((p) => p.kiosk_sequence?.length);
  const hasGlobalSeq = !!sequence?.length;
  const hasAnySeq = hasPerUserSeqs || hasGlobalSeq;

  // No sequences configured anywhere → stay unlocked
  useEffect(() => {
    if (!loading && !hasAnySeq) unlock();
  }, [loading, hasAnySeq, unlock]);

  // Staff on personal devices are never locked — kiosk is only for the shared shop screen
  useEffect(() => {
    if (profile?.role === "staff") unlock();
  }, [profile?.role, unlock]);

  // When locked (and sequence is set), redirect to /attendance
  useEffect(() => {
    if (isLocked && !loading && hasAnySeq && pathname !== "/attendance") {
      router.replace("/attendance");
    }
  }, [isLocked, loading, hasAnySeq, pathname, router]);

  // Inactivity auto-lock — only when unlocked and any sequence is configured
  useEffect(() => {
    if (isLocked || !hasAnySeq) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => lock(), IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "touchstart", "keydown", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLocked, hasAnySeq, lock]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Locked mode: full-screen attendance board, no nav
  if (isLocked && hasAnySeq) {
    return (
      <div className="h-screen overflow-y-auto bg-canvas">
        <main className="max-w-5xl mx-auto p-4 md:p-6">{children}</main>
      </div>
    );
  }

  // Normal mode: full layout with sidebar and topbar
  return (
    <div className="flex h-screen overflow-hidden">
      {sidebar}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {topbar}
        <StaffAbsenceBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
