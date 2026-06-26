"use client";

import { useState } from "react";

function GoogleLogo({ size = "text-5xl" }: { size?: string }) {
  return (
    <span className={`font-bold tracking-tight ${size}`}>
      <span style={{ color: "#4285F4" }}>G</span>
      <span style={{ color: "#EA4335" }}>o</span>
      <span style={{ color: "#FBBC05" }}>o</span>
      <span style={{ color: "#4285F4" }}>g</span>
      <span style={{ color: "#34A853" }}>l</span>
      <span style={{ color: "#EA4335" }}>e</span>
    </span>
  );
}

function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="text-5xl" style={{ color: "#FBBC05" }}>★</span>
      ))}
    </div>
  );
}

export default function GoogleReviewPage() {
  const [presenting, setPresenting] = useState(false);

  return (
    <>
      {/* ── Staff preview card ── */}
      <div className="max-w-sm mx-auto mt-10">
        <div className="bg-white rounded-lg2 shadow-soft border border-line p-6 text-center space-y-4">
          <div>
            <GoogleLogo size="text-3xl" />
            <p className="text-xs text-ink-dim mt-1">Review</p>
          </div>
          <p className="text-sm text-ink-dim leading-relaxed">
            Show this to customers after a purchase so they can scan the QR code and leave a Google review.
          </p>
          <div className="border border-line rounded-lg2 p-3 inline-block">
            <img
              src="/google-review-qr.png"
              alt="Google Review QR Code"
              className="w-40 h-40 object-contain"
            />
          </div>
          <button
            onClick={() => setPresenting(true)}
            className="w-full py-3 rounded-lg2 text-white font-semibold text-base"
            style={{ backgroundColor: "#4285F4" }}
          >
            Show to Customer
          </button>
        </div>
      </div>

      {/* ── Full-screen customer-facing overlay ── */}
      {presenting && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white cursor-pointer"
          onClick={() => setPresenting(false)}
        >
          {/* Tap-to-dismiss hint */}
          <p className="absolute top-4 right-4 text-xs text-gray-400">Tap anywhere to close</p>

          <div className="flex flex-col items-center gap-6 px-8 text-center" onClick={(e) => e.stopPropagation()}>
            {/* Google branding */}
            <div>
              <GoogleLogo size="text-6xl" />
              <p className="text-gray-400 text-sm mt-1 font-medium tracking-widest uppercase">Review</p>
            </div>

            {/* Heading */}
            <div>
              <h1 className="text-3xl font-bold text-gray-800 leading-tight">
                Enjoyed shopping<br />with us?
              </h1>
              <p className="text-gray-500 mt-2 text-lg">Share your experience on Google</p>
            </div>

            {/* Stars */}
            <Stars />

            {/* QR Code */}
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-5 shadow-lg">
              <img
                src="/google-review-qr.png"
                alt="Google Review QR Code"
                className="w-64 h-64 object-contain"
              />
            </div>

            <div>
              <p className="text-gray-700 font-semibold text-lg">Scan to write a review</p>
              <p className="text-gray-400 text-sm mt-1">Sabarinathan Jewellery</p>
            </div>
          </div>

          {/* Close button at bottom */}
          <button
            className="absolute bottom-6 px-6 py-2 rounded-full border border-gray-300 text-gray-500 text-sm"
            onClick={() => setPresenting(false)}
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}
