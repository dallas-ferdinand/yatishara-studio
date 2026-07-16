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
    // Native APIs are exposed only to the Studio origin.
    allowNavigation: ["studio.yatishara.com"],
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
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_studio",
      iconColor: "#FFFFFF",
    },
  },
};

export default config;
