import type { NextConfig } from "next";
import path from "path";
import { execSync } from "child_process";

const mosApp = path.join(__dirname, "src/mos-app");
const mosMarkdownDesk = path.join(__dirname, "src/desk/lib/markdown-desk.js");

function deskBuildStamp() {
  try {
    return execSync("git rev-parse --short=16 HEAD", { cwd: __dirname, encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 16);
  }
}

const DESK_BUILD_ID = process.env.NEXT_PUBLIC_DESK_BUILD ?? deskBuildStamp();

const nextConfig: NextConfig = {
  output: "standalone",
  trailingSlash: true,
  allowedDevOrigins: ["preview.studio.yatishara.com"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_DESK_BUILD: DESK_BUILD_ID,
  },
  // Static export has no /_next/image optimizer — serve public assets directly.
  images: {
    unoptimized: true,
  },
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.DefinePlugin({
        __DESK_BUILD__: JSON.stringify(DESK_BUILD_ID),
      })
    );
    config.resolve.alias = {
      ...config.resolve.alias,
      "@mos-app": mosApp,
      [path.join(mosApp, "markdown.js")]: mosMarkdownDesk,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      "@mos-app": "./src/mos-app",
      "@mos-app/markdown.js": "./src/desk/lib/markdown-desk.js",
    },
  },
};

export default nextConfig;
