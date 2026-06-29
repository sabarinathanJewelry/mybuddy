"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function VerifyOtpPage() {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  function handleChange(idx: number, val: string) {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = v;
    setDigits(next);
    if (v && idx < 5) inputs.current[idx + 1]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      inputs.current[5]?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = digits.join("");
    if (token.length < 6) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  }

  const token = digits.join("");

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar-bg p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🔐</div>
          <h1 className="text-2xl font-bold text-gold">MyBuddy</h1>
          <p className="text-white/40 text-sm mt-1">Two-Factor Verification</p>
        </div>

        <div className="bg-white rounded-xl2 shadow-card p-6 space-y-5">
          <div className="text-center">
            <p className="text-sm text-ink font-medium">Enter the 6-digit code</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-11 h-14 border-2 border-line rounded-lg text-center text-xl font-bold focus:outline-none focus:border-gold transition-colors"
                />
              ))}
            </div>

            {error && (
              <p className="text-err text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || token.length < 6}
              className="w-full bg-gold hover:bg-gold/90 disabled:opacity-50 text-white font-semibold py-3 rounded-lg2 transition-colors"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
