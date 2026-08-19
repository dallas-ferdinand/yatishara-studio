/**
 * One-shot catalog refresh: fix mangled HTTP pathTemplates, add help-post tools.
 * Run: node packages/studio-tools/scripts/patch-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const catalogPath = path.join(root, "catalog.generated.json");
const convexCopy = path.resolve(root, "../../../convex/lib/agentTools/catalog.generated.json");

function tool(def) {
  return {
    role: null,
    surfaces: ["agent", "mcp"],
    requiresApproval: false,
    inputSchema: { type: "object", additionalProperties: true },
    sourceFile: "social.ts",
    ...def,
  };
}

const extra = [
  tool({
    name: "studio_get_help_request",
    description:
      "Get one Help question (username, caption, whether you already posted Value).",
    category: "social",
    scope: "social",
    risk: "read",
    http: { method: "GET", pathTemplate: "/feed/help-requests/{postId}" },
  }),
  tool({
    name: "studio_list_help_requests",
    description:
      "List public Help questions you can post Value on (excludes your own). alreadyAnswered=true if you already posted Value on that question.",
    category: "social",
    scope: "social",
    risk: "read",
    http: { method: "GET", pathTemplate: "/feed/help-requests" },
  }),
  tool({
    name: "studio_undo_help_unlock",
    description:
      "Undo a help_answer unlock within ~60s (undoUntil from studio_unlock_help_answer). Refunds credits if still inside the window.",
    category: "social",
    scope: "social",
    risk: "paid",
    requiresApproval: true,
    http: { method: "POST", pathTemplate: "/feed/unlocks/{unlockId}/undo" },
  }),
  tool({
    name: "studio_unlock_help_answer",
    description:
      "Spend credits to unlock a paid help_answer (TT$5 under 1h recording, TT$10 at 1h+). Returns unlockId + undoUntil (~60s). Confirm with the user first — this is a paid spend.",
    category: "social",
    scope: "social",
    risk: "paid",
    requiresApproval: true,
    http: { method: "POST", pathTemplate: "/feed/posts/{postId}/unlock" },
  }),
];

function fixPath(template) {
  if (typeof template !== "string") return template;
  let next = template;
  next = next.replace(/\$\{qs \? ?"?$/, "");
  next = next.replace(/\{limit\}\)\}/g, "");
  next = next.replace(/\{seedPostId\}\)\}/g, "");
  next = next.replace(/\{username\}\)\}/g, "");
  next = next.replace("/assistance/briefs/{args}/approve", "/assistance/briefs/{briefId}/approve");
  return next;
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const byName = new Map(catalog.map((row) => [row.name, row]));

for (const row of catalog) {
  if (row.http?.pathTemplate) {
    row.http.pathTemplate = fixPath(row.http.pathTemplate);
  }
}

const share = byName.get("studio_share_asset_post");
if (share) {
  share.description =
    "Publish owned media to the public profile. postKind: post (default), help_request (question), or help_answer (paid Value — needs a screen-recording video ≥1 min, previewStartMs/previewEndMs 10s–5min inside the recording, optional parentRequestPostId). Confirm with the user before publishing.";
}
const unshare = byName.get("studio_unshare_post");
if (unshare) {
  unshare.description =
    "Unshare a previously shared asset from the public profile (by assetId). For a sold help_answer, pass keepPurchasers=true to close new sales while buyers keep their copy.";
}

for (const row of extra) {
  byName.set(row.name, row);
}

const next = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
const json = `${JSON.stringify(next, null, 2)}\n`;
fs.writeFileSync(catalogPath, json);
fs.writeFileSync(convexCopy, json);
console.log(`catalog tools: ${next.length}`);
const mangled = next.filter((row) => /\$\{|\)\}/.test(row.http?.pathTemplate || ""));
if (mangled.length) {
  console.error("still mangled:", mangled.map((row) => `${row.name} ${row.http.pathTemplate}`));
  process.exit(1);
}
