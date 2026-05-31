"use client";

import { create } from "zustand";

export interface Profile {
  id: string;
  display_name: string;
  role: "admin" | "staff";
  language: string;
  repair_access?: boolean;
}

interface AuthStore {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  canEdit: () => boolean;
}

export const useAuth = create<AuthStore>()((set, get) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  canEdit: () => {
    const p = get().profile;
    return p?.role === "admin" || p?.role === "staff";
  },
}));
