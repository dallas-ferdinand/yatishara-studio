/**
 * Golden harness evals — no LLM required.
 * Run: node --test services/studio-agent/evals/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { detectActionLane, agentDescription, STARTER_TOOL_NAMES } from "../agentLanes.mjs";
import { compactObservation, maskOlderObservations, observationByteBudget } from "../agentCompact.mjs";
import { validateHotToolArgs, HOT_SCHEMAS } from "../agentSchemas.mjs";
import { listSkills, getSkill, matchSkills } from "../agentSkills.mjs";
import { verifyHintFor, autoVerifyTool, autoVerifyArgs } from "../agentVerify.mjs";
import { createPlanStore } from "../agentPlan.mjs";
import { createTrajectory } from "../agentTrajectory.mjs";

/** @type {Array<{ id: string, message: string, workingSet?: object[], expectLaneIncludes?: string, expectSkill?: string }>} */
export const GOLDEN_TASKS = [
  {
    id: "post-attached",
    message: "post this to my profile",
    workingSet: [{ studioKind: "asset", studioId: "a1" }],
    expectLaneIncludes: "studio_share_asset_post",
    expectSkill: "post-feed",
  },
  {
    id: "generate-image",
    message: "generate an image of a red bicycle",
    workingSet: [],
    expectLaneIncludes: "studio_generate_image",
    expectSkill: "generate-image",
  },
  {
    id: "generate-video",
    message: "create a video clip of dancers",
    workingSet: [],
    expectLaneIncludes: "studio_estimate_generation",
    expectSkill: "generate-video",
  },
  {
    id: "animate-still",
    message: "animate this into a video",
    workingSet: [{ studioKind: "asset", studioId: "a1" }],
    expectLaneIncludes: "studio_estimate_generation",
    expectSkill: "generate-video",
  },
  {
    id: "prompt-hypermotion",
    message: "write a hypermotion video prompt for a dance chaos ad",
    workingSet: [],
    expectLaneIncludes: "prompt-hypermotion",
    expectSkill: "prompt-hypermotion",
  },
  {
    id: "prompt-image",
    message: "help me craft a better image prompt for a product hero",
    workingSet: [],
    expectLaneIncludes: "prompt-image",
    expectSkill: "prompt-image",
  },
  {
    id: "move-items",
    message: "move this into that folder",
    workingSet: [
      { studioKind: "asset", studioId: "a1" },
      { studioKind: "folder", studioId: "f1" },
    ],
    expectLaneIncludes: "studio_bulk_move",
    expectSkill: "move-items",
  },
  {
    id: "trash",
    message: "delete this please",
    workingSet: [{ studioKind: "asset", studioId: "a1" }],
    expectLaneIncludes: "studio_trash",
    expectSkill: "trash-cleanup",
  },
  {
    id: "send-media",
    message: "send this in the dm",
    workingSet: [{ studioKind: "asset", studioId: "a1" }],
    expectLaneIncludes: "studio_send_media_message",
    expectSkill: "send-dm",
  },
  {
    id: "orient-no-lane",
    message: "what folders do I have?",
    workingSet: [],
    expectLaneIncludes: "",
  },
];

test("golden lanes + skills", () => {
  for (const task of GOLDEN_TASKS) {
    const lane = detectActionLane(task.message, task.workingSet || []);
    if (task.expectLaneIncludes) {
      assert.match(lane, new RegExp(task.expectLaneIncludes), task.id);
    } else {
      assert.equal(lane, "", task.id);
    }
    if (task.expectSkill) {
      const skill = getSkill(task.expectSkill);
      assert.ok(skill, task.expectSkill);
      assert.ok(
        skill.tools.some((t) => lane.includes(t) || task.expectSkill),
        `${task.id} skill tools`,
      );
    }
  }
});

test("hot schemas reject bad args", () => {
  assert.equal(validateHotToolArgs("studio_share_asset_post", {}).ok, false);
  assert.equal(
    validateHotToolArgs("studio_share_asset_post", { assetId: "x" }).ok,
    true,
  );
  assert.equal(validateHotToolArgs("studio_generate_image", { prompt: "" }).ok, false);
  assert.equal(
    validateHotToolArgs("studio_bulk_move", {
      targetFolderId: "f",
      items: [{ kind: "asset", id: "a" }],
    }).ok,
    true,
  );
  assert.equal(
    validateHotToolArgs("studio_send_media_message", { conversationId: "c" }).ok,
    false,
  );
  assert.equal(
    validateHotToolArgs("studio_send_media_message", {
      conversationId: "c",
      assetId: "a",
    }).ok,
    true,
  );
  assert.ok(Object.keys(HOT_SCHEMAS).length >= 10);
});

test("compact observations shrink fat payloads", () => {
  const fat = {
    ok: true,
    data: {
      assetId: "abc",
      name: "shot.png",
      base64: "x".repeat(5000),
      promptEnhanced: "y".repeat(2000),
      thumbnailData: "z".repeat(2000),
      extraNoise: { nested: { deep: true, blob: "w".repeat(1000) } },
    },
  };
  const compact = compactObservation("studio_generate_image", fat);
  const bytes = observationByteBudget(compact);
  assert.ok(bytes < 800, `compact bytes ${bytes}`);
  assert.equal(compact.data.assetId, "abc");
  assert.ok(!JSON.stringify(compact).includes("base64"));
  assert.ok(compact.verifyHint === undefined || typeof compact.verifyHint === "string");
});

test("verify hints + auto-verify wiring", () => {
  const hint = verifyHintFor("studio_share_asset_post", { assetId: "a1" }, { ok: true });
  assert.match(String(hint), /studio_is_asset_shared/);
  assert.equal(autoVerifyTool("studio_share_asset_post"), "studio_is_asset_shared");
  assert.deepEqual(autoVerifyArgs("studio_is_asset_shared", { assetId: "a1" }, {}), {
    assetId: "a1",
  });
});

test("skills pack surface", () => {
  assert.equal(listSkills().length, 11);
  assert.ok(getSkill("post-feed"));
  assert.ok(getSkill("prompt-cinematic"));
  assert.ok(getSkill("prompt-hypermotion")?.body?.includes("seedance"));
  assert.ok(!/higgs|cinedance|hell\s*grind/i.test(getSkill("prompt-cinematic")?.body || ""));
  assert.ok(matchSkills("image").some((s) => s.id === "generate-image"));
  assert.ok(matchSkills("hypermotion").some((s) => s.id === "prompt-hypermotion"));
});

test("plan store formats and updates", () => {
  const store = createPlanStore();
  store.set("Ship post", ["share", "verify"]);
  assert.equal(store.get().open, 2);
  assert.match(store.formatBlock(), /\[ \] s1: share/);
  store.update("s1", "doing");
  assert.match(store.formatBlock(), /\[~\] s1: share/);
  store.update("s1", "done");
  assert.equal(store.get().open, 1);
  store.clear();
  assert.equal(store.get().steps.length, 0);
  assert.equal(store.formatBlock(), "");
});

test("trajectory + observation mask", () => {
  const traj = createTrajectory({ lane: "LANE: x", message: "post this" });
  traj.recordTool({ toolName: "studio_share_asset_post", ok: true, bytes: 120 });
  traj.recordTool({ toolName: "studio_is_asset_shared", ok: true, bytes: 80 });
  const snap = traj.snapshot();
  assert.equal(snap.toolCount, 2);
  assert.ok(snap.lane);
  const masked = maskOlderObservations(
    Array.from({ length: 6 }, (_, i) => ({ toolName: `t${i}`, ok: true })),
    2,
  );
  assert.equal(masked.filter((r) => r.masked).length, 4);
});

test("starter set + intent blurbs present", () => {
  assert.ok(STARTER_TOOL_NAMES.includes("studio_share_asset_post"));
  assert.match(
    agentDescription({ name: "studio_share_asset_post", description: "old" }),
    /Post owned/,
  );
});
