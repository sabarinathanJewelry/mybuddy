"use client";

import { useState, useEffect, useRef } from "react";

const FB_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "468979614795589";
const FB_CONFIG_ID = process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID ?? "1513891609861996";

type ConnectResult = {
  phone_number_id: string;
  waba_id: string;
  display_phone_number?: string;
};

type StepState = "idle" | "connecting" | "exchanging" | "done" | "error";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export default function WhatsAppSetupPage() {
  const [step, setStep] = useState<StepState>("idle");
  const [result, setResult] = useState<ConnectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sdkLoaded = useRef(false);

  useEffect(() => {
    if (sdkLoaded.current) return;
    sdkLoaded.current = true;

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: FB_APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v22.0",
      });
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH") {
            const { phone_number_id, waba_id } = data.data ?? {};
            if (phone_number_id && waba_id) {
              setResult({ phone_number_id, waba_id });
              setStep("done");
            }
          } else if (data.event === "CANCEL") {
            setStep("idle");
            setError("Connection cancelled.");
          } else if (data.event === "ERROR") {
            setStep("error");
            setError(data.data?.error_message ?? "An error occurred during signup.");
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  function launchEmbeddedSignup() {
    if (!window.FB) {
      setError("Facebook SDK not loaded yet. Please wait a moment and try again.");
      return;
    }
    setError(null);
    setStep("connecting");

    window.FB.login(
      (response: any) => {
        if (response.authResponse?.code) {
          setStep("exchanging");
          exchangeCode(response.authResponse.code);
        } else {
          setStep("idle");
          setError("Login was closed or cancelled.");
        }
      },
      {
        config_id: FB_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
        },
      }
    );
  }

  async function exchangeCode(code: string) {
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Exchange failed");
      setResult(data);
      setStep("done");
    } catch (e: any) {
      setStep("error");
      setError(e.message ?? "Failed to exchange code");
    }
  }

  const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm font-mono bg-canvas focus:outline-none";

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">WhatsApp Connection Setup</h1>
        <p className="text-sm text-ink-dim mt-1">
          Connect your WhatsApp Business App number (+91 73053 93916) to MyBuddy using Coexistence.
          Your number will continue to work on your phone simultaneously.
        </p>
      </div>

      {step !== "done" && (
        <div className="border border-line rounded-lg2 p-5 space-y-4">
          <h2 className="font-medium text-ink">Step 1 — Connect your WhatsApp account</h2>
          <p className="text-sm text-ink-dim">
            Click the button below. A Facebook login window will open. Sign in as the admin of
            sabarinathan_jewellers, select your WhatsApp Business Account and phone number.
          </p>

          {error && (
            <p className="text-sm text-err bg-red-50 rounded-lg2 px-3 py-2">{error}</p>
          )}

          <button
            onClick={launchEmbeddedSignup}
            disabled={step === "connecting" || step === "exchanging"}
            className="w-full py-2.5 px-4 rounded-lg2 bg-[#1877F2] text-white text-sm font-medium hover:bg-[#166FE5] disabled:opacity-50 transition-colors"
          >
            {step === "connecting" && "Opening Facebook login…"}
            {step === "exchanging" && "Verifying with Meta…"}
            {(step === "idle" || step === "error") && "Connect with Facebook"}
          </button>

          <p className="text-xs text-ink-dim">
            This uses WhatsApp Business App Onboarding (Coexistence). Your existing WhatsApp Business App
            will keep working.
          </p>
        </div>
      )}

      {step === "done" && result && (
        <div className="border border-green-200 bg-green-50 rounded-lg2 p-5 space-y-4">
          <h2 className="font-medium text-green-800">Connected! Copy these values to Vercel</h2>
          <p className="text-sm text-green-700">
            Go to Vercel → mybuddy → Settings → Environment Variables and update these two values,
            then redeploy.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1">
                WHATSAPP_PHONE_NUMBER_ID
              </label>
              <input readOnly value={result.phone_number_id} className={inp} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1">
                WHATSAPP_WABA_ID
              </label>
              <input readOnly value={result.waba_id} className={inp} />
            </div>
          </div>

          <div className="border border-green-300 rounded-lg2 p-3 text-xs text-green-800 space-y-1">
            <p className="font-medium">After updating Vercel env vars:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Redeploy the app (Vercel → Deployments → Redeploy)</li>
              <li>In Meta Developer Portal, update the webhook subscription to use <code className="bg-green-100 px-1 rounded">WHATSAPP_WABA_ID</code></li>
              <li>Subscribe to: <code className="bg-green-100 px-1 rounded">messages</code>, <code className="bg-green-100 px-1 rounded">smb_message_echoes</code>, <code className="bg-green-100 px-1 rounded">smb_app_state_sync</code>, <code className="bg-green-100 px-1 rounded">history</code></li>
            </ol>
          </div>

          <button
            onClick={() => { setStep("idle"); setResult(null); setError(null); }}
            className="text-sm text-ink-dim underline"
          >
            Connect a different number
          </button>
        </div>
      )}

      <div className="border border-line rounded-lg2 p-5 space-y-2">
        <h2 className="font-medium text-ink">Current configuration</h2>
        <p className="text-sm text-ink-dim">
          Phone Number ID in use:{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
            {process.env.NEXT_PUBLIC_WA_PHONE_NUMBER_ID ?? "not set (server-side var)"}
          </code>
        </p>
        <p className="text-xs text-ink-dim">
          The active phone number ID is set via <code className="bg-slate-100 px-1 rounded">WHATSAPP_PHONE_NUMBER_ID</code> in Vercel environment variables.
        </p>
      </div>
    </div>
  );
}
