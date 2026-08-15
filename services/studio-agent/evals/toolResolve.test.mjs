/**
 * Catalog discovery + invented-name repair — golden unit tests (no LLM).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { listToolsForSurface } from "../../../packages/studio-tools/src/catalog.js";
import { resolveStudioToolAlias } from "../../../packages/studio-tools/src/http.js";
import {
  searchTools,
  resolveInvokeName,
  similarity,
  INVENTED_NAME_FIXES,
} from "../agentToolResolve.mjs";
import { validateHotToolArgs } from "../agentSchemas.mjs";
import { createPlanStore } from "../agentPlan.mjs";

const AGENT_TOOLS = listToolsForSurface("agent", { role: "user" }).map((t) => ({
  name: t.name,
  description: t.description,
  category: t.category,
}));

function isKnown(name) {
  return AGENT_TOOLS.some((t) => t.name === name);
}

const KNOWN_NAMES = AGENT_TOOLS.map((t) => t.name);

test("catalog q= delete element finds trash (not empty)", () => {
  const found = searchTools(AGENT_TOOLS, "delete element", 12);
  assert.ok(found.tools.length > 0, "must not return zero tools");
  assert.ok(
    found.tools.some((t) => t.name === "studio_trash"),
    found.tools.map((t) => t.name).join(","),
  );
});

test("catalog q= list documents finds folder_contents", () => {
  const found = searchTools(AGENT_TOOLS, "list documents", 12);
  assert.ok(found.tools.some((t) => t.name === "studio_folder_contents"));
});

test("catalog q= describe asset finds get_asset or view_media", () => {
  const found = searchTools(AGENT_TOOLS, "describe asset", 12);
  assert.ok(
    found.tools.some((t) =>
      ["studio_get_asset", "studio_view_media"].includes(t.name),
    ),
  );
});

test("catalog q= unknown still returns closest names", () => {
  const found = searchTools(AGENT_TOOLS, "zzzxqnotatool", 8);
  assert.equal(found.mode, "fuzzy");
  assert.ok(found.tools.length > 0);
});

test("resolveInvokeName repairs invented production names", () => {
  for (const [from, to] of Object.entries(INVENTED_NAME_FIXES)) {
    const resolved = resolveInvokeName(from, isKnown, KNOWN_NAMES);
    assert.equal(resolved.kind, "repaired", from);
    assert.equal(resolved.name, to, from);
  }
});

test("resolveInvokeName routes describe/update_step to Pi tools", () => {
  assert.deepEqual(resolveInvokeName("describe", isKnown, KNOWN_NAMES), {
    kind: "local",
    name: "describe",
  });
  const step = resolveInvokeName("update_step", isKnown, KNOWN_NAMES);
  assert.equal(step.kind, "local");
  assert.equal(step.name, "plan");
  assert.equal(step.planAction, "update_step");
});

test("resolveInvokeName plural-fixes list_folder", () => {
  const resolved = resolveInvokeName(
    "studio_list_folder",
    isKnown,
    KNOWN_NAMES,
  );
  assert.equal(resolved.kind, "repaired");
  assert.equal(resolved.name, "studio_list_folders");
});

test("http aliases map invented names before invoke", () => {
  assert.equal(
    resolveStudioToolAlias("studio_list_documents", {}).toolName,
    "studio_folder_contents",
  );
  assert.equal(
    resolveStudioToolAlias("studio_describe_asset", { assetId: "a1" }).toolName,
    "studio_get_asset",
  );
  assert.equal(
    resolveStudioToolAlias("studio_delete_element", { id: "e1" }).toolName,
    "studio_trash",
  );
});

test("hot args coerce search query + estimate mode + patch aliases", () => {
  assert.equal(validateHotToolArgs("studio_search", { q: "flyer" }).ok, true);
  assert.equal(
    validateHotToolArgs("studio_search", { q: "flyer" }).args.query,
    "flyer",
  );
  assert.equal(
    validateHotToolArgs("studio_estimate_generation", { prompt: "a still" }).ok,
    true,
  );
  assert.equal(
    validateHotToolArgs("studio_estimate_generation", { prompt: "a still" })
      .args.mode,
    "image",
  );
  assert.equal(
    validateHotToolArgs("studio_estimate_generation", {
      prompt: "15s video clip",
    }).args.mode,
    "video",
  );
  const patch = validateHotToolArgs("studio_patch_document", {
    id: "doc1",
    old: "hello",
    new: "hi",
  });
  assert.equal(patch.ok, true);
  assert.equal(patch.args.documentId, "doc1");
  assert.equal(patch.args.oldString, "hello");
  assert.equal(patch.args.newString, "hi");
});

test("plan accepts status synonyms and numeric step ids", () => {
  const store = createPlanStore();
  store.set("Ship", ["share", "verify"]);
  assert.equal(store.update("s1", "in_progress").ok, true);
  assert.equal(store.get().steps[0].status, "doing");
  assert.equal(store.updateStep(null, "1", "complete").ok, true);
  assert.equal(store.get().steps[0].status, "done");
  const listId = store.snapshot().activeId;
  assert.equal(store.setListStatus(listId, "done").ok, true);
  assert.equal(store.snapshot().lists[0].status, "completed");
});

test("similarity ranks close tool names", () => {
  assert.ok(similarity("studio_list_folder", "studio_list_folders") > 0.8);
  assert.ok(similarity("studio_list_folder", "studio_send_message") < 0.6);
});
