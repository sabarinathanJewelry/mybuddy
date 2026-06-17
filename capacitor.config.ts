import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.sabarinathanjewellery.mybuddy",
  appName: "MyBuddy",
  webDir: "out",
  server: {
    url: "https://mybuddy-inky.vercel.app",
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
