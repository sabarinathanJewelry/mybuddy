# MyBuddy Signage — Android TV app

Thin Capacitor WebView shell around `/tv-player` on the main web app (same pattern
as the root `android/` phone app, which wraps the whole ERP). All player logic —
pairing screen, poster/playlist rendering, realtime updates — lives in
`app/tv-player/page.tsx` in the main repo, not here. This folder only exists to
turn that page into an installable Android TV app.

I couldn't run the Android scaffolding commands in the sandbox this was built in
(no Java/Android SDK available there), so these steps need to run on your machine
where you already build the phone APK.

## First-time setup

```bash
cd signage-tv-app
npm install
npx cap add android
```

This generates `signage-tv-app/android/`, a normal Capacitor Android project
pointed at `https://mybuddy-inky.vercel.app/tv-player` (edit
`capacitor.config.ts` first if your deployed URL differs).

## Android TV manifest additions

`npx cap add android` generates a phone-oriented manifest. Open
`signage-tv-app/android/app/src/main/AndroidManifest.xml` and:

1. Add a banner image at `signage-tv-app/android/app/src/main/res/drawable/banner.png`
   (320×180 dp — this is what shows in the Android TV home screen row instead of an icon).
2. On the `<application>` tag, add `android:banner="@drawable/banner"`.
3. Add these two `<uses-feature>` entries (TV boxes have no touchscreen, and
   declaring leanback support is what makes Android TV treat this as a TV app):

```xml
<uses-feature android:name="android.software.leanback" android:required="true" />
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
```

4. On `MainActivity`'s existing `<intent-filter>`, add the leanback launcher category
   alongside the existing `LAUNCHER` one:

```xml
<intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
    <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
</intent-filter>
```

## Build & install

```bash
npx cap open android
```

Opens the project in Android Studio — build/run to a TV emulator or a real
Android TV device over ADB (`adb connect <tv-ip>:5555`), same signing/release
flow you already use for the phone app.

## Not yet handled: boot-persistence

A shop TV needs to auto-launch this app on power-on and stay in the foreground
indefinitely. Capacitor doesn't give this for free — it needs either:

- Setting this app as the device's default/home launcher (many Android TV boxes
  support picking a custom launcher in Settings), or
- A native `BOOT_COMPLETED` broadcast receiver that auto-starts `MainActivity`.

Neither is built yet — flag it if/when you're ready to wire up a real in-shop TV
and I'll add the native Android piece.
