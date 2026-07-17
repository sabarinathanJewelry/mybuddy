"use client";

import { create } from "zustand";

export interface Profile {
  id: string;
  display_name: string;
  role: "admin" | "staff" | "subadmin" | "signage";
  language: string;
  repair_access?: boolean;
  incentive_access?: boolean;
  kolusu_access?: boolean;
  conduct_note_access?: boolean;
  allowed_modules?: string[];
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
    return p?.role === "admin" || p?.role === "staff" || p?.role === "subadmin";
  },
}));
