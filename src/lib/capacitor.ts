// Returns true only when running inside the Capacitor native app (Android/iOS)
export function isNative(): boolean {
  return typeof (window as any)?.Capacitor?.isNativePlatform === "function" &&
    (window as any).Capacitor.isNativePlatform();
}
