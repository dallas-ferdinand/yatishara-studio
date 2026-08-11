import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeTool,
  buildStudioRequest,
  listToolsForSurface,
  requiresApproval,
} from "../src/index.js";

test("two-user isolation: tool auth is role/surface scoped, not global", () => {
  const userA = authorizeTool("studio_list_folders", {
    surface: "agent",
    role: "user",
    scopes: ["read"],
  });
  const userBAdmin = authorizeTool("studio_admin_refund_job", {
    surface: "agent",
    role: "admin",
    scopes: ["marketplace"],
  });
  const userAAdminDenied = authorizeTool("studio_admin_refund_job", {
    surface: "agent",
    role: "user",
    scopes: ["marketplace"],
  });
  assert.equal(userA.ok, true);
  assert.equal(userBAdmin.ok, true);
  assert.equal(userAAdminDenied.ok, false);
});

test("approval policy lanes", () => {
  assert.equal(requiresApproval("studio_workspace_tree"), false);
  assert.equal(requiresApproval("studio_create_folder"), false);
  assert.equal(requiresApproval("studio_generate_image"), true);
  assert.equal(requiresApproval("studio_send_message"), true);
  assert.equal(requiresApproval("studio_share_asset_post"), true);
  assert.equal(requiresApproval("studio_trash"), true);
  assert.equal(requiresApproval("studio_purchase_network_listing"), true);
  assert.equal(requiresApproval("studio_admin_mark_payout_paid"), true);
});

test("agent surface count is substantial (full access for role)", () => {
  const agent = listToolsForSurface("agent", { role: "user" });
  assert.ok(agent.length >= 170, `expected >=170 agent tools, got ${agent.length}`);
  const names = new Set(agent.map((t) => t.name));
  for (const required of [
    "studio_bootstrap",
    "studio_search",
    "studio_generate_image",
    "studio_generate_video",
    "studio_generate_audio",
    "studio_create_edit",
    "studio_export_edit",
    "studio_send_message",
    "studio_list_feed",
    "studio_browse_network_listings",
  ]) {
    assert.ok(names.has(required), required);
  }
});

test("http mapping for generation + trash", async () => {
  const gen = buildStudioRequest("studio_generate_image", {
    folderId: "f1",
    prompt: "test",
  });
  assert.equal(gen.local, false);
  assert.equal(gen.method, "POST");
  assert.match(String(gen.path), /generations/);
  const tool = (await import("../src/catalog.js")).getTool("studio_trash");
  assert.ok(tool?.http?.pathTemplate);
  const trash = buildStudioRequest("studio_trash", {
    collection: "assets",
    id: "a1",
  });
  assert.equal(trash.local, false);
});
