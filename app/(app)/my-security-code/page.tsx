"use client";

import { useEffect, useState, useCallback } from "react";

interface CodeState {
  code: string;
  secondsRemaining: number;
}

export default function MySecurityCodePage() {
  const [state, setState] = useState<CodeState | null>(null);
  const [error, setError] = useState("");

  const fetchCode = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/get-totp-code");
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to load code");
        return;
      }
      const data = await res.json();
      setState({ code: data.code, secondsRemaining: data.seconds_remaining });
      setError("");
    } catch {
      setError("Network error");
    }
  }, []);

  // Fetch code on mount, then refetch when each 30s window ends
  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  // Countdown timer — refetch when it hits 0
  useEffect(() => {
    if (!state) return;
    const interval = setInterval(() => {
      setState((prev) => {
        if (!prev) return prev;
        const next = prev.secondsRemaining - 1;
        if (next <= 0) {
          fetchCode();
          return prev; // fetchCode will update state
        }
        return { ...prev, secondsRemaining: next };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.code, fetchCode]); // re-create when code changes

  const progress = state ? (state.secondsRemaining / 30) * 100 : 100;
  const isUrgent = (state?.secondsRemaining ?? 30) <= 8;
  const digits = state?.code.split("") ?? [];

  return (
    <div className="max-w-sm mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink">Security Code</h1>
        <p className="text-sm text-ink-dim mt-1">
          Show this code to someone logging in from another device.
        </p>
      </div>

      {error ? (
        <div className="bg-err/10 border border-err/30 rounded-lg2 p-4 text-center">
          <p className="text-err text-sm">{error}</p>
          <button
            onClick={fetchCode}
            className="mt-2 text-xs text-gold underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl2 shadow-soft border border-line p-6 space-y-5 text-center">
          {/* 6-digit code */}
          <div className="flex justify-center gap-2">
            {digits.length > 0
              ? digits.map((d, i) => (
                  <span
                    key={i}
                    className={`w-10 h-14 flex items-center justify-center text-2xl font-bold rounded-lg border-2 ${
                      isUrgent
                        ? "border-err text-err bg-err/5"
                        : "border-gold text-gold bg-gold/5"
                    }`}
                  >
                    {d}
                  </span>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className="w-10 h-14 flex items-center justify-center rounded-lg border-2 border-line bg-canvas animate-pulse"
                  />
                ))}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="h-2 bg-canvas rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  isUrgent ? "bg-err" : "bg-gold"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className={`text-xs font-medium ${isUrgent ? "text-err" : "text-ink-dim"}`}>
              {state
                ? `Refreshes in ${state.secondsRemaining}s`
                : "Loading…"}
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-ink-dim text-center">
        The code changes every 30 seconds. Do not share this page with anyone else.
      </p>
    </div>
  );
}
