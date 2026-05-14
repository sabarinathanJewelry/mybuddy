"use client";

import { create } from "zustand";

export interface BoardRate {
  gold_22k: number;
  gold_24k: number;
  gold_18k: number;
  silver: number;
  silver_pure: number;
  effective_date: string;
}

interface BoardRateStore {
  rate: BoardRate | null;
  setRate: (r: BoardRate) => void;
}

export const useBoardRate = create<BoardRateStore>()((set) => ({
  rate: null,
  setRate: (rate) => set({ rate }),
}));
