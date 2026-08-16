import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STUDIO_OPEN_TABS_BASE,
  studioAccountStorageKey,
  studioCurrentUserId,
  studioOpenTabsKey,
} from "./studio-account-storage.ts";

describe("studio-account-storage", () => {
  it("reads users.current userId, not missing _id", () => {
    assert.equal(studioCurrentUserId(null), null);
    assert.equal(studioCurrentUserId({}), null);
    assert.equal(studioCurrentUserId({ _id: "doc_1" }), "doc_1");
    assert.equal(studioCurrentUserId({ userId: "user_abc" }), "user_abc");
    assert.equal(
      studioCurrentUserId({ userId: "user_abc", _id: "doc_1" }),
      "user_abc",
    );
  });

  it("scopes open-tabs keys by user id", () => {
    assert.equal(studioOpenTabsKey(null), null);
    assert.equal(studioOpenTabsKey(""), null);
    assert.equal(
      studioOpenTabsKey("user_abc"),
      `${STUDIO_OPEN_TABS_BASE}:user_abc`,
    );
  });

  it("rejects blank ids for any base key", () => {
    assert.equal(studioAccountStorageKey("base", "  "), null);
    assert.equal(studioAccountStorageKey("base", "u1"), "base:u1");
  });
});
