import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from "next/font/google";
import { MERCURY_LOGO_PRELOAD } from "@/lib/brand-assets";
import { getThemeBootInlineScript } from "@/mos-app/theme.js";
import { MosTooltipLayer } from "@/components/mos-tooltip-layer";
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
      { url: "/branding/yatishara-logo-light-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/branding/yatishara-logo-light-180.png", sizes: "180x180" }],
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
        <link rel="icon" href="/branding/yatishara-logo-dark-32.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/branding/yatishara-logo-light-32.png" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" href="/branding/yatishara-logo-light-180.png" />
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
        <Script id="mos-theme-boot" strategy="beforeInteractive">
          {getThemeBootInlineScript()}
        </Script>
      </head>
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        <MosTooltipLayer />
        {children}
      </body>
    </html>
  );
}
