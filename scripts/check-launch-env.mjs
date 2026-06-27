import { existsSync, readFileSync } from "node:fs";

const required = [
  "NEXT_PUBLIC_CONVEX_URL",
  "CONVEX_SITE_URL",
  "AUTH_SECRET",
  "AUTH_RESEND_KEY",
  "AUTH_RESEND_FROM",
  "STUDIO_SUPER_ADMIN_EMAIL",
  "BYTEPLUS_ARK_API_KEY",
  "BYTEPLUS_ENHANCEMENT_MODEL_ID",
  "BYTEPLUS_IMAGE_LOW_MODEL_ID",
  "BYTEPLUS_IMAGE_MEDIUM_MODEL_ID",
  "BYTEPLUS_IMAGE_HIGH_MODEL_ID",
  "BYTEPLUS_VIDEO_MODEL_ID",
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
