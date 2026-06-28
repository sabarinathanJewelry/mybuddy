"use client";

import { useState, useEffect, useRef } from "react";

interface Group {
  id: string;
  name: string;
  metal: string;
  active: boolean;
}

interface GroupComboboxProps {
  groups: Group[];
  metal: string;           // current item metal — filters the group list
  onSelect: (group: Group) => void;
  placeholder?: string;
  className?: string;
}

// Searchable group picker that filters by the currently selected metal.
// Shows all matching groups when focused; narrows as you type.
export default function GroupCombobox({
  groups,
  metal,
  onSelect,
  placeholder = "Search group…",
  className = "",
}: GroupComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Reset search when metal changes
  useEffect(() => { setQuery(""); }, [metal]);

  const METAL_LABEL: Record<string, string> = {
    gold_22k: "G22", gold_18k: "G18", gold_24k: "G24",
    silver: "Ag", silver_pure: "Ag+", silver_mpr: "MPR",
  };

  const q = query.toLowerCase();
  const sameMetalMatches = groups.filter(
    (g) => g.active && g.metal === metal && (q === "" || g.name.toLowerCase().includes(q))
  );
  const crossMetalMatches = query
    ? groups.filter(
        (g) => g.active && g.metal !== metal && g.name.toLowerCase().includes(q)
      )
    : [];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full border border-line rounded-lg2 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold text-ink"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-30 top-full left-0 right-0 mt-0.5 bg-white border border-line rounded-lg2 shadow-soft max-h-52 overflow-y-auto">
          {sameMetalMatches.length === 0 && crossMetalMatches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-ink-dim">No match</p>
          ) : (
            <>
              {sameMetalMatches.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(g);
                    setQuery(g.name);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gold/10 text-ink transition-colors"
                >
                  {g.name}
                </button>
              ))}
              {crossMetalMatches.length > 0 && (
                <>
                  {sameMetalMatches.length > 0 && (
                    <div className="border-t border-line mx-2" />
                  )}
                  {crossMetalMatches.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(g);
                        setQuery(g.name);
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gold/10 text-ink transition-colors flex items-center justify-between"
                    >
                      <span>{g.name}</span>
                      <span className="text-xs text-info bg-info/10 rounded px-1.5 py-0.5 ml-2">
                        {METAL_LABEL[g.metal] ?? g.metal} ↺
                      </span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
