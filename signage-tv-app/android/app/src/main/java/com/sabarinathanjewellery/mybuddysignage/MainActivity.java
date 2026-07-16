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
    }
}
