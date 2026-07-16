package com.yatishara.studio;

import android.graphics.Bitmap;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Thin live-site shell. Retries the production URL once if the first WebView
 * load fails (common after install / cold start / flaky DNS).
 */
public class MainActivity extends BridgeActivity {
  private static final String LIVE_URL = "https://studio.yatishara.com/";
  private boolean retriedLoad = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (this.bridge == null) return;

    this.bridge.getWebView().setWebViewClient(new BridgeWebViewClient(this.bridge) {
      @Override
      public void onPageStarted(WebView view, String url, Bitmap favicon) {
        super.onPageStarted(view, url, favicon);
        if (url != null && url.startsWith("https://studio.yatishara.com")) {
          retriedLoad = false;
        }
      }

      @Override
      public void onReceivedError(
        WebView view,
        WebResourceRequest request,
        WebResourceError error
      ) {
        super.onReceivedError(view, request, error);
        if (request == null || !request.isForMainFrame() || view == null) return;
        if (retriedLoad) return;
        retriedLoad = true;
        view.postDelayed(() -> view.loadUrl(LIVE_URL), 600);
      }
    });
  }
}
