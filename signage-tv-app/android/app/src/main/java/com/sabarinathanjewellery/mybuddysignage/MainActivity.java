package com.sabarinathanjewellery.mybuddysignage;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Android TV's screensaver watches for remote-control input, not whether a web
    // page inside the WebView says it's active (navigator.wakeLock isn't reliably
    // respected here) — this native flag is the OS-level signal that actually
    // prevents the screensaver/sleep while this app is in the foreground.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Chrome's WebView blocks unmuted <video autoPlay> unless the page had a
        // prior user gesture — there's no remote-control "click" on a signage TV,
        // so playlist videos would otherwise never get sound. This is our own
        // controlled kiosk shell, so it's safe to disable that requirement here.
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
