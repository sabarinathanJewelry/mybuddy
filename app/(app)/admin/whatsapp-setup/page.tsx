"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? "4689796147955589";
const CONFIG_ID = process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID ?? "1513891609861996";
const REDIRECT_URI = "https://mybuddy-inky.vercel.app/api/whatsapp/oauth-callback";

const OAUTH_URL =
  `https://www.facebook.com/dialog/oauth` +
  `?client_id=${APP_ID}` +
  `&config_id=${CONFIG_ID}` +
  `&response_type=code` +
  `&override_default_response_type=true` +
  `&extras=${encodeURIComponent(JSON.stringify({ featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }))}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm font-mono bg-canvas focus:outline-none";

function SetupContent() {
  const params = useSearchParams();
  const phoneNumberId = params.get("phone_number_id");
  const wabaId = params.get("waba_id");
  const displayPhone = params.get("display_phone");
  const error = params.get("error");
  const success = !!(phoneNumberId && wabaId);

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">WhatsApp Connection Setup</h1>
        <p className="text-sm text-ink-dim mt-1">
          Connect your WhatsApp Business App number (+91 73053 93916) to MyBuddy using Coexistence.
          Your number will continue to work on your phone simultaneously.
        </p>
      </div>

      {!success && (
        <div className="border border-line rounded-lg2 p-5 space-y-4">
          <h2 className="font-medium text-ink">Step 1 — Connect your WhatsApp account</h2>
          <p className="text-sm text-ink-dim">
            Click the button below. You will be taken to Facebook to sign in as the admin of
            sabarinathan_jewellers, then select your WhatsApp Business Account and phone number.
            You will be brought back here automatically.
          </p>

          {error && (
            <p className="text-sm text-err bg-red-50 rounded-lg2 px-3 py-2">
              Error: {decodeURIComponent(error)}. Please try again.
            </p>
          )}

          <a
            href={OAUTH_URL}
            className="block w-full py-2.5 px-4 rounded-lg2 bg-[#1877F2] text-white text-sm font-medium hover:bg-[#166FE5] transition-colors text-center"
          >
            Connect with Facebook
          </a>

          <p className="text-xs text-ink-dim">
            This uses WhatsApp Business App Onboarding (Coexistence). Your existing WhatsApp Business App
            will keep working.
          </p>
        </div>
      )}

      {success && (
        <div className="border border-green-200 bg-green-50 rounded-lg2 p-5 space-y-4">
          <h2 className="font-medium text-green-800">
            Connected!{displayPhone ? ` (${displayPhone})` : ""} Copy these values to Vercel
          </h2>
          <p className="text-sm text-green-700">
            Go to Vercel → mybuddy → Settings → Environment Variables and update these two values,
            then redeploy.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1">WHATSAPP_PHONE_NUMBER_ID</label>
              <input readOnly value={phoneNumberId!} className={inp} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1">WHATSAPP_WABA_ID</label>
              <input readOnly value={wabaId!} className={inp} />
            </div>
          </div>

          <div className="border border-green-300 rounded-lg2 p-3 text-xs text-green-800 space-y-1">
            <p className="font-medium">After updating Vercel env vars:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Redeploy the app (Vercel → Deployments → Redeploy)</li>
              <li>Subscribe webhook to: <code className="bg-green-100 px-1 rounded">messages</code>, <code className="bg-green-100 px-1 rounded">smb_message_echoes</code>, <code className="bg-green-100 px-1 rounded">smb_app_state_sync</code>, <code className="bg-green-100 px-1 rounded">history</code></li>
            </ol>
          </div>

          <a href="/admin/whatsapp-setup" className="text-sm text-ink-dim underline">
            Connect a different number
          </a>
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

export default function WhatsAppSetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}
