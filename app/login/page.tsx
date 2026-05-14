"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import ShootingRange, { type Shot } from "@/components/login/shooting-range";
import { clsx } from "clsx";

type Mode = "game" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("game");
  const [secret, setSecret] = useState("");
  const [pattern, setPattern] = useState<Shot[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGameLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, pattern }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      const { error: verifyErr } = await supabase().auth.verifyOtp({
        token_hash: data.token,
        type: "magiclink",
      });
      if (verifyErr) throw verifyErr;
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: authErr } = await supabase().auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar-bg p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🔫</div>
          <h1 className="text-2xl font-bold text-gold">MyBuddy</h1>
          <p className="text-white/40 text-sm mt-1">Jewellers ERP</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl2 shadow-card p-6 space-y-5">
          {/* Mode tabs */}
          <div className="flex rounded-lg overflow-hidden border border-line">
            {(["game", "password"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(""); }}
                className={clsx(
                  "flex-1 py-2 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-gold text-white"
                    : "bg-white text-ink-dim hover:bg-canvas"
                )}
              >
                {m === "game" ? "🎮 Game Login" : "🔑 Password"}
              </button>
            ))}
          </div>

          {mode === "game" ? (
            <form onSubmit={handleGameLogin} className="space-y-5">
              <ShootingRange onPatternChange={setPattern} />
              <div>
                <label className="block text-xs font-medium text-ink-dim mb-1">
                  Secret Number
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="••••"
                  className="w-full border border-line rounded-lg2 px-3 py-2.5 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-gold"
                />
              </div>
              {error && <p className="text-err text-sm text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || pattern.length === 0 || !secret}
                className="w-full bg-gold hover:bg-gold-dark disabled:opacity-50 text-white font-semibold py-3 rounded-lg2 transition-colors"
              >
                {loading ? "…" : "Login"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-dim mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-line rounded-lg2 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gold"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-dim mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-line rounded-lg2 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-gold"
                  required
                />
              </div>
              {error && <p className="text-err text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold hover:bg-gold-dark disabled:opacity-50 text-white font-semibold py-3 rounded-lg2 transition-colors"
              >
                {loading ? "…" : "Login"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
