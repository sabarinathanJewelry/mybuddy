"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { todayIso } from "@/lib/fy";

interface GlobalDateStore {
  date: string;
  setDate: (d: string) => void;
  resetToday: () => void;
}

export const useGlobalDate = create<GlobalDateStore>()(
  persist(
    (set) => ({
      date: todayIso(),
      setDate: (date) => set({ date }),
      resetToday: () => set({ date: todayIso() }),
    }),
    { name: "mybuddy.globalDate" }
  )
);
