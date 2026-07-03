import { existsSync, readFileSync } from "node:fs";

const required = [
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CONVEX_SITE_URL",
  "CONVEX_SITE_URL",
  "SITE_URL",
  "AUTH_SECRET",
  "AUTH_RESEND_KEY",
  "AUTH_RESEND_FROM",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
  "STUDIO_SUPER_ADMIN_EMAIL",
  "STUDIO_SUPER_ADMIN_PHONE",
  "STUDIO_WHATSAPP_NUMBER",
  "AI_GATEWAY_API_KEY",
  "GATEWAY_TEXT_MODEL_ID",
  "GATEWAY_IMAGE_MODEL_ID",
  "GATEWAY_VIDEO_MODEL_ID",
  "BUNNY_STORAGE_ACCESS_KEY",
  "BUNNY_PULL_ZONE_HOSTNAME",
  "BUNNY_CDN_SIGNING_KEY",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_ACCESS_KEY",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY",
];

const env = {
  ...process.env,
  ...readDotEnv(".env.local"),
};

const missing = required.filter((name) => !env[name]);

console.log(`Launch env present: ${required.length - missing.length}/${required.length}`);
if (missing.length) {
  console.log(`Missing: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Launch env complete.");
}

function readDotEnv(path) {
  if (!existsSync(path)) {
    return {};
  }
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key.trim(), rest.join("=").trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}
