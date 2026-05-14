"use client";

import { useState } from "react";
import { clsx } from "clsx";

export interface Shot { gun: number; target: number }

const GUNS = [
  { id: 1, label: "🔫", name: "Revolver" },
  { id: 2, label: "🎯", name: "Sniper" },
];

const TARGETS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Props {
  onPatternChange: (shots: Shot[]) => void;
}

export default function ShootingRange({ onPatternChange }: Props) {
  const [selectedGun, setSelectedGun] = useState<number | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);

  function handleTarget(target: number) {
    if (!selectedGun) return;
    const newShots = [...shots, { gun: selectedGun, target }];
    setShots(newShots);
    onPatternChange(newShots);
  }

  function handleClear() {
    setShots([]);
    setSelectedGun(null);
    onPatternChange([]);
  }

  return (
    <div className="space-y-4">
      {/* Gun selector */}
      <div className="flex gap-3 justify-center">
        {GUNS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setSelectedGun(g.id)}
            className={clsx(
              "flex flex-col items-center gap-1 px-5 py-3 rounded-xl border-2 transition-all text-2xl",
              selectedGun === g.id
                ? "border-gold bg-gold/10 scale-105"
                : "border-line bg-white hover:border-gold/50"
            )}
          >
            {g.label}
            <span className="text-xs text-ink-dim">{g.name}</span>
          </button>
        ))}
      </div>

      {/* Target grid */}
      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {TARGETS.map((t) => {
          const hitCount = shots.filter((s) => s.target === t).length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => handleTarget(t)}
              disabled={!selectedGun}
              className={clsx(
                "aspect-square rounded-full border-2 font-bold text-sm transition-all",
                hitCount > 0
                  ? "border-gold bg-gold text-white scale-95"
                  : "border-line bg-white text-ink-dim hover:border-gold hover:text-gold",
                !selectedGun && "opacity-40 cursor-not-allowed"
              )}
            >
              {hitCount > 0 ? "●" : t}
            </button>
          );
        })}
      </div>

      {/* Pattern summary */}
      {shots.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {shots.map((s, i) => (
            <span key={i} className="text-xs bg-gold/10 text-gold-dark rounded-full px-2 py-0.5 font-mono">
              {GUNS[s.gun - 1]?.label}→{s.target}
            </span>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-err hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
