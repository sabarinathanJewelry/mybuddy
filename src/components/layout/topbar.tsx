"use client";

import { useUI } from "@/stores/ui";
import { useGlobalDate } from "@/stores/global-date";
import { useLangStore } from "@/stores/lang";
import { useT } from "@/i18n";
import { env } from "@/lib/env";
import RateStrip from "./rate-strip";
import { clsx } from "clsx";

export default function Topbar() {
  const t = useT();
  const { setMobileSidebar } = useUI();
  const { date, setDate, resetToday } = useGlobalDate();
  const { lang, toggle } = useLangStore();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-line h-14 flex items-center px-3 gap-3">
      {/* Hamburger (mobile) */}
      <button
        className="md:hidden p-1.5 rounded-lg text-ink-dim hover:bg-canvas"
        onClick={() => setMobileSidebar(true)}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Rate strip */}
      <div className="flex-1 overflow-hidden">
        <RateStrip />
      </div>

      {/* Global Date */}
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-xs border border-line rounded-lg2 px-2 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-gold"
        />
        <button
          onClick={resetToday}
          className="text-xs text-gold hover:text-gold-dark px-1.5 py-1 rounded hover:bg-gold/10"
        >
          {t("today")}
        </button>
      </div>

      {/* Language toggle */}
      <button
        onClick={toggle}
        className="shrink-0 text-xs font-semibold border border-line rounded-full px-2.5 py-1 text-ink-mid hover:border-gold hover:text-gold transition-colors"
      >
        {lang === "en" ? "தமிழ்" : "EN"}
      </button>

      {/* Env badge */}
      <span
        className={clsx(
          "shrink-0 hidden md:inline-flex text-xs font-bold rounded-full px-2.5 py-1",
          env.deployEnv === "server"
            ? "bg-ok-bg text-ok"
            : "bg-warn/10 text-warn"
        )}
      >
        {env.envLabel}
      </span>
    </header>
  );
}
