"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type SetupState = "idle" | "enabling" | "enabled" | "disabling";

export default function SecurityPage() {
  const router = useRouter();
  const [setupState, setSetupState] = useState<SetupState>("idle");
  const [currentCode, setCurrentCode] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [error, setError] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);

  // Check current MFA status from session
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/auth/get-totp-code");
        if (res.ok) {
          setMfaEnabled(true);
          const data = await res.json();
          setCurrentCode(data.code);
          setSecondsRemaining(data.seconds_remaining);
        } else if (res.status === 404) {
          setMfaEnabled(false);
        } else {
          // 403 = not verified on this device but might still be enabled
          setMfaEnabled(false);
        }
      } catch {
        setMfaEnabled(false);
      }
    }
    checkStatus();
  }, []);

  async function handleEnable() {
    setError("");
    setSetupState("enabling");
    try {
      const res = await fetch("/api/auth/setup-totp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setCurrentCode(data.code);
      setSecondsRemaining(data.seconds_remaining);
      setMfaEnabled(true);
      setSetupState("enabled");
      // After enabling, set the MFA cookie for this device immediately
      // by verifying the current code we just received
      const verifyRes = await fetch("/api/auth/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: data.code, trust: true }),
      });
      if (!verifyRes.ok) {
        // Verification failed (code might have just expired — very rare)
        // The user can still log out and back in to get the cookie
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setSetupState("idle");
    }
  }

  async function handleDisable() {
    if (!confirm("Disable two-factor authentication? Anyone with your password can log in from any device.")) return;
    setError("");
    setSetupState("disabling");
    try {
      const res = await fetch("/api/auth/disable-totp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to disable");
      setMfaEnabled(false);
      setCurrentCode("");
      setSetupState("idle");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disable");
      setSetupState("idle");
    }
  }

  if (mfaEnabled === null) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="h-40 flex items-center justify-center text-ink-dim text-sm">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">Login Security</h1>
        <p className="text-sm text-ink-dim mt-1">
          Two-factor authentication (2FA) requires a rotating 6-digit code when logging in from a new device.
        </p>
      </div>

      {/* Status card */}
      <div className="bg-white rounded-xl2 shadow-soft border border-line p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Two-Factor Authentication</p>
            <p className="text-xs text-ink-dim mt-0.5">
              {mfaEnabled ? "Active — new device logins require a code" : "Not enabled"}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            mfaEnabled ? "bg-ok/10 text-ok" : "bg-canvas text-ink-dim"
          }`}>
            {mfaEnabled ? "On" : "Off"}
          </span>
        </div>

        {error && <p className="text-err text-sm">{error}</p>}

        {!mfaEnabled && (
          <button
            onClick={handleEnable}
            disabled={setupState === "enabling"}
            className="w-full bg-gold hover:bg-gold/90 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg2 text-sm transition-colors"
          >
            {setupState === "enabling" ? "Setting up…" : "Enable 2FA"}
          </button>
        )}

        {mfaEnabled && (
          <button
            onClick={handleDisable}
            disabled={setupState === "disabling"}
            className="w-full border border-err text-err hover:bg-err/5 disabled:opacity-50 font-semibold py-2.5 rounded-lg2 text-sm transition-colors"
          >
            {setupState === "disabling" ? "Disabling…" : "Disable 2FA"}
          </button>
        )}
      </div>

      {/* Info card after enabling */}
      {(setupState === "enabled" || (mfaEnabled && currentCode)) && (
        <div className="bg-ok/5 border border-ok/30 rounded-xl2 p-5 space-y-3">
          <p className="text-sm font-semibold text-ok">2FA is active</p>
          <p className="text-xs text-ink-dim leading-relaxed">
            When you log in from a new device, open <strong>MyBuddy on your phone</strong> and
            go to <strong>Security Code</strong> in the menu to get the current 6-digit code.
          </p>
          {currentCode && (
            <div>
              <p className="text-xs text-ink-dim mb-1">Current code (for reference):</p>
              <div className="flex gap-1.5">
                {currentCode.split("").map((d, i) => (
                  <span
                    key={i}
                    className="w-8 h-10 flex items-center justify-center text-lg font-bold rounded border border-ok/40 text-ok bg-ok/5"
                  >
                    {d}
                  </span>
                ))}
              </div>
              <p className="text-xs text-ink-dim mt-1.5">
                Refreshes in {secondsRemaining}s — go to{" "}
                <button
                  onClick={() => router.push("/my-security-code")}
                  className="text-gold underline"
                >
                  Security Code page
                </button>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-ink-dim space-y-1">
        <p>How it works:</p>
        <ul className="list-disc list-inside space-y-0.5 ml-1">
          <li>After entering your password on a new device, you will be asked for a 6-digit code</li>
          <li>Open MyBuddy on your already-logged-in phone and tap Security Code in the menu</li>
          <li>Enter the code shown — it changes every 30 seconds</li>
          <li>Once verified, that session is trusted until the browser is closed — you will be asked again next login</li>
          <li>The device you used to enable 2FA (your phone) is permanently trusted and never asked for a code</li>
        </ul>
      </div>
    </div>
  );
}
