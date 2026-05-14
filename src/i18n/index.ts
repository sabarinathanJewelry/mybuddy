"use client";

import { useLangStore } from "@/stores/lang";
import { translate, type TKey } from "./dictionaries";

export function useT(): (key: TKey) => string {
  const lang = useLangStore((s) => s.lang);
  return (key: TKey) => translate(lang, key);
}
