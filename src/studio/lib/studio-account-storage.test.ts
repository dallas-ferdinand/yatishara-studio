import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STUDIO_OPEN_TABS_BASE,
  studioAccountStorageKey,
  studioOpenTabsKey,
} from "./studio-account-storage.ts";

describe("studio-account-storage", () => {
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
