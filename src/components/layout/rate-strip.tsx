"use client";

import Link from "next/link";
import { useBoardRate } from "@/stores/board-rate";
import { inr } from "@/lib/format";

export default function RateStrip() {
  const rate = useBoardRate((s) => s.rate);
  if (!rate) return null;

  const chips = [
    { label: "22K", value: rate.gold_22k },
    { label: "24K", value: rate.gold_24k },
    { label: "18K", value: rate.gold_18k },
    { label: "Ag",  value: rate.silver },
  ];

  return (
    <Link href="/board-rate" className="flex items-center gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center gap-1 text-xs bg-gold/10 text-gold-dark border border-gold/20 rounded-full px-2 py-0.5 ${
            c.label === "24K" || c.label === "18K" ? "hidden md:inline-flex" : ""
          }`}
        >
          <span className="font-semibold">{c.label}</span>
          <span>{inr(c.value)}</span>
        </span>
      ))}
    </Link>
  );
}
