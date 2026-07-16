import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Thin Android shell around the live Studio site.
 * UI ships from https://studio.yatishara.com — no separate mobile redesign.
 */
const config: CapacitorConfig = {
  appId: "com.yatishara.studio",
  appName: "Yatishara Studio",
  webDir: "www",
  server: {
    url: "https://studio.yatishara.com",
    cleartext: false,
    androidScheme: "https",
    // Keep Studio + Convex/CDN hosts inside the WebView (not Chrome).
    allowNavigation: [
      "studio.yatishara.com",
      "*.yatishara.com",
      "convex-studio-api.yatishara.com",
      "*.b-cdn.net",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#000000",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#000000",
    },
  },
};

export default config;
