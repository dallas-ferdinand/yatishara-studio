import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, JetBrains_Mono, Onest } from "next/font/google";
import { MERCURY_LOGO_PRELOAD } from "@/lib/brand-assets";
import { getThemeBootInlineScript } from "@/mos-app/theme.js";
import { getDeskBuildGuardInlineScript } from "@/mos-app/desk-build-guard.js";
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
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1b1c23",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
    >
      <head>
        <meta name="x-desk-build" content={process.env.NEXT_PUBLIC_DESK_BUILD ?? ""} />
        {MERCURY_LOGO_PRELOAD.map((asset) => (
          <link
            key={asset.href}
            rel="preload"
            href={asset.href}
            as="image"
            type={asset.type}
          />
        ))}
        <Script id="mos-desk-build-guard" strategy="beforeInteractive">
          {getDeskBuildGuardInlineScript()}
        </Script>
        <Script id="mos-theme-boot" strategy="beforeInteractive">
          {getThemeBootInlineScript()}
        </Script>
      </head>
      <body className="h-full overflow-hidden">
        <MosTooltipLayer />
        {children}
      </body>
    </html>
  );
}
