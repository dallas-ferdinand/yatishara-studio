import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

const paywiseRequired = [
  "PAYWISE_API_BASE",
  "PAYWISE_SUBSCRIPTION_KEY",
  "PAYWISE_API_KEY",
  "PAYWISE_PAYEE_MOBILE",
  "PAYWISE_ORIGIN_COUNTRY",
  "PAYWISE_IP_ADDRESS",
  "PAYWISE_ENVIRONMENT",
  "PAYWISE_PAID_STATUSES",
];

const env = {
  ...process.env,
  ...readDotEnv(".env.local"),
};

const missing = required.filter((name) => !env[name]);
const missingPaywise = paywiseRequired.filter((name) => !env[name]);

console.log(`Launch env present: ${required.length - missing.length}/${required.length}`);
if (missing.length) {
  console.log(`Missing: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Launch env complete.");
}

console.log(
  `PayWise env present: ${paywiseRequired.length - missingPaywise.length}/${paywiseRequired.length}`,
);
if (missingPaywise.length) {
  console.log(`Missing PayWise: ${missingPaywise.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("PayWise env complete.");
  const sandboxBase = String(env.PAYWISE_API_BASE).toLowerCase().includes("sandbox");
  const sandboxEnvironment = String(env.PAYWISE_ENVIRONMENT).toLowerCase() === "sandbox";
  if (sandboxBase !== sandboxEnvironment) {
    console.log("PayWise environment does not match PAYWISE_API_BASE.");
    process.exitCode = 1;
  }
  const paywiseIp = String(env.PAYWISE_IP_ADDRESS).toLowerCase();
  const invalidIp =
    ["0.0.0.0", "localhost"].includes(paywiseIp) ||
    (String(env.PAYWISE_ENVIRONMENT).toLowerCase() === "production" &&
      ["127.0.0.1", "::1"].includes(paywiseIp));
  if (invalidIp) {
    console.log("PAYWISE_IP_ADDRESS is invalid for the selected environment.");
    process.exitCode = 1;
  }
}

if (process.argv.includes("--convex")) {
  const result = spawnSync("npx", ["convex", "env", "list"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    console.log("Could not verify Convex deployment environment.");
    if (result.stderr?.trim()) console.log(result.stderr.trim());
    process.exitCode = 1;
  } else {
    const deployedNames = new Set(
      result.stdout
        .split(/\r?\n/)
        .map((line) => line.split("=")[0]?.trim())
        .filter(Boolean),
    );
    const missingDeployed = paywiseRequired.filter((name) => !deployedNames.has(name));
    if (missingDeployed.length) {
      console.log(`Missing PayWise Convex variables: ${missingDeployed.join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("PayWise Convex deployment environment verified.");
    }
  }
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
