package com.yatishara.studio;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

/**
 * Live production shell — Capacitor server.url points at
 * https://studio.yatishara.com (not local/preview).
 */
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Drop the system splash immediately; WebView is the app UI.
    SplashScreen.installSplashScreen(this).setKeepOnScreenCondition(() -> false);
    super.onCreate(savedInstanceState);
  }
}
