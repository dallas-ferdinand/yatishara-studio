import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from "next/font/google";
import Script from "next/script";
import { MERCURY_LOGO_PRELOAD } from "@/lib/brand-assets";
import { getThemeBootInlineScript } from "@/mos-app/theme.js";
import { getDeskBuildGuardInlineScript } from "@/mos-app/desk-build-guard.js";
import { MosTooltipLayer } from "@/components/mos-tooltip-layer";
import { PaintBoot } from "@/components/paint-boot";
import { PerformanceReporter } from "@/components/performance-reporter";
import { StudioToaster } from "@/components/studio-toaster";
import "./globals.css";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin"],
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yatishara Studio",
  description: "AI creative studio for image and video generation",
  applicationName: "Yatishara Studio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Yatishara Studio",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/branding/favicon.ico", sizes: "any" },
      { url: "/branding/yatishara-logo-light-32.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/yatishara-appicon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/branding/yatishara-appicon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/branding/yatishara-appicon-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${onest.variable} ${bricolage.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <meta name="x-studio-build" content={process.env.NEXT_PUBLIC_DESK_BUILD ?? ""} />
        {MERCURY_LOGO_PRELOAD.map((asset) => (
          <link
            key={asset.href}
            rel="preload"
            href={asset.href}
            as="image"
            type={asset.type}
          />
        ))}
        <style
          dangerouslySetInnerHTML={{
            __html: `.ys-boot-overlay{position:fixed;inset:0;z-index:2147483000;background:#fff}.ys-boot{box-sizing:border-box;display:flex;width:100%;min-height:100svh;min-height:100dvh;margin:0;padding:0;overflow:hidden;align-items:center;justify-content:center;background:#fff;color:#0f172a}.ys-boot-overlay .ys-boot{position:absolute;inset:0;min-height:0;height:auto}.ys-boot-stack{display:flex;flex-direction:column;align-items:center;justify-content:center;width:max-content;max-width:calc(100vw - 48px);padding:0 24px;box-sizing:border-box}.logo-loader{--logo-loader-ring:56px;--logo-loader-mark:34px;position:relative;display:grid;place-items:center;width:var(--logo-loader-ring);height:var(--logo-loader-ring);flex-shrink:0}.logo-loader-spin{position:relative;display:grid;place-items:center;width:100%;height:100%;animation:logo-loader-spin 5.5s linear infinite}.logo-loader-breathe{position:relative;display:grid;place-items:center;width:100%;height:100%;animation:logo-loader-breathe 2.6s ease-in-out infinite}.logo-loader-glass{position:absolute;inset:0;border-radius:999px;border:1px solid rgba(27,31,36,.12);background:rgba(255,255,255,.42);box-shadow:0 0 22px rgba(0,0,0,.1),0 0 10px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.42);pointer-events:none}.logo-loader-mark{position:relative;z-index:1;width:var(--logo-loader-mark);height:var(--logo-loader-mark);object-fit:contain;opacity:.76}@keyframes logo-loader-spin{to{transform:rotate(360deg)}}@keyframes logo-loader-breathe{0%,100%{opacity:.38;transform:scale(.84)}50%{opacity:1;transform:scale(1)}}@media (prefers-reduced-motion:reduce){.logo-loader-spin,.logo-loader-breathe{animation:none}.logo-loader-breathe{opacity:.82;transform:none}}`,
          }}
        />
        <link rel="icon" href="/branding/yatishara-logo-dark-32.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/branding/yatishara-logo-light-32.png" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/branding/yatishara-appicon-180.png" />
        <link
          rel="apple-touch-startup-image"
          href="/branding/yatishara-splash-light-iphone-1170x2532.png"
          media="(prefers-color-scheme: dark) and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/branding/yatishara-splash-dark-iphone-1170x2532.png"
          media="(prefers-color-scheme: light) and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/branding/yatishara-splash-light-iphone-1290x2796.png"
          media="(prefers-color-scheme: dark) and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/branding/yatishara-splash-dark-iphone-1290x2796.png"
          media="(prefers-color-scheme: light) and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/branding/yatishara-splash-light-ipad-2048x2732.png"
          media="(prefers-color-scheme: dark) and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/branding/yatishara-splash-dark-ipad-2048x2732.png"
          media="(prefers-color-scheme: light) and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"
        />
        <Script
          id="ys-url-clean"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: getDeskBuildGuardInlineScript() }}
        />
        <Script
          id="mos-theme-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: getThemeBootInlineScript() }}
        />
      </head>
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <PaintBoot />
        <MosTooltipLayer />
        <PerformanceReporter surface="root" />
        <StudioToaster />
        {children}
      </body>
    </html>
  );
}
