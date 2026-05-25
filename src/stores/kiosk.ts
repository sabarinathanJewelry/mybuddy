"use client";

import { create } from "zustand";

interface KioskStore {
  isLocked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useKiosk = create<KioskStore>()((set) => ({
  isLocked: true,
  lock: () => set({ isLocked: true }),
  unlock: () => set({ isLocked: false }),
}));
