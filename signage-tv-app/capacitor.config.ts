import type { CapacitorConfig } from "@capacitor/cli";

// Distinct appId from the phone app (com.sabarinathanjewellery.mybuddy) so both
// can be installed side by side without colliding. This is a thin WebView shell —
// all signage player logic lives at /tv-player in the main Next.js app.
const config: CapacitorConfig = {
  appId: "com.sabarinathanjewellery.mybuddysignage",
  appName: "MyBuddy Signage",
  webDir: "www", // unused placeholder dir — server.url below overrides it
  server: {
    url: "https://mybuddy-inky.vercel.app/tv-player",
    cleartext: false,
  },
};

export default config;
