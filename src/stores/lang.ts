"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "@/i18n/dictionaries";

interface LangStore {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
}

export const useLangStore = create<LangStore>()(
  persist(
    (set, get) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
      toggle: () => set({ lang: get().lang === "en" ? "ta" : "en" }),
    }),
    { name: "mybuddy.lang" }
  )
);
