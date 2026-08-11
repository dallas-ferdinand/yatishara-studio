/**
 * Stale-id recovery helpers — golden unit tests (no LLM).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  pickRecoveredDocumentId,
  pickRecoveredAssetId,
  rewriteStaleIdsWithCwdIndex,
} from "../piTools.mjs";

const DOCS = [
  {
    documentId: "doc_old",
    title: "Notes",
    updatedAt: 1,
  },
  {
    documentId: "doc_prompt",
    title: "Prompt – Degreaser Kitchen Product Advertisement",
    updatedAt: 100,
  },
];

test("pickRecoveredDocumentId prefers Prompt/Script title over older notes", () => {
  const id = pickRecoveredDocumentId(DOCS, {
    documentId: "invented_stale_id",
  });
  assert.equal(id, "doc_prompt");
});

test("pickRecoveredDocumentId matches title hint", () => {
  const id = pickRecoveredDocumentId(DOCS, {
    documentId: "gone",
    title: "Prompt – Degreaser",
  });
  assert.equal(id, "doc_prompt");
});

test("pickRecoveredDocumentId returns sole remaining doc", () => {
  const id = pickRecoveredDocumentId(
    [{ documentId: "only", title: "Untitled", updatedAt: 1 }],
    { documentId: "missing" },
  );
  assert.equal(id, "only");
});

test("pickRecoveredAssetId picks latest when no name hint", () => {
  const id = pickRecoveredAssetId(
    [
      { assetId: "a1", name: "old", updatedAt: 1 },
      { assetId: "a2", name: "flyer", updatedAt: 9 },
    ],
    { assetId: "stale" },
  );
  assert.equal(id, "a2");
});

test("rewriteStaleIdsWithCwdIndex rewrites document before invoke", () => {
  const { args, rewritten, recoveredId } = rewriteStaleIdsWithCwdIndex(
    "studio_get_document",
    { documentId: "hallucinated" },
    { documents: DOCS, assets: [] },
  );
  assert.equal(rewritten, true);
  assert.equal(recoveredId, "doc_prompt");
  assert.equal(args.documentId, "doc_prompt");
  assert.equal(args.id, "doc_prompt");
});

test("rewriteStaleIdsWithCwdIndex leaves known ids alone", () => {
  const { args, rewritten } = rewriteStaleIdsWithCwdIndex(
    "studio_get_document",
    { documentId: "doc_prompt" },
    { documents: DOCS, assets: [] },
  );
  assert.equal(rewritten, false);
  assert.equal(args.documentId, "doc_prompt");
});

test("rewriteStaleIdsWithCwdIndex rewrites stale asset ids", () => {
  const { args, rewritten, recoveredId } = rewriteStaleIdsWithCwdIndex(
    "studio_view_media",
    { assetId: "fake" },
    {
      documents: [],
      assets: [{ assetId: "real_asset", name: "Degreaser Flyer", updatedAt: 3 }],
    },
  );
  assert.equal(rewritten, true);
  assert.equal(recoveredId, "real_asset");
  assert.equal(args.assetId, "real_asset");
});
