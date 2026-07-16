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

/** Real performance comes from smaller work, not sticky shells. */
const NO_STORE = "no-store, no-cache, must-revalidate, max-age=0";

const nextConfig: NextConfig = {
  output: "standalone",
  trailingSlash: true,
  allowedDevOrigins: ["preview.studio.yatishara.com"],
  async headers() {
    // Order matters: first matching source wins in Next.js.
    return [
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              source: "/_next/static/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  // Hashed filenames — revalidate every load so deploys never stick.
                  value: "public, max-age=0, must-revalidate",
                },
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
          ]
        : []),
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: NO_STORE,
          },
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
        source: "/branding/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: NO_STORE,
          },
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
        source: "/version.json",
        headers: [
          {
            key: "Cache-Control",
            value: NO_STORE,
          },
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
          {
            key: "Cache-Control",
            value: NO_STORE,
          },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_DESK_BUILD: DESK_BUILD_ID,
  },
  // Standalone Docker deploy: CDN (Bunny) handles image transforms for media.
  // Keep unoptimized so we do not ship duplicate sharp/libvips in the runtime image.
  images: {
    unoptimized: true,
  },
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.DefinePlugin({
        __DESK_BUILD__: JSON.stringify(DESK_BUILD_ID),
      }),
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
