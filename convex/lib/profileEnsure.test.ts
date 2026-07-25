import { describe, expect, it } from "vitest";
import { deriveBaseHandle, slugifyHandle } from "./profileEnsure";
import { isReservedUsername, validateUsername } from "./profileIdentity";

describe("slugifyHandle", () => {
  it("produces clean letter-leading handles", () => {
    expect(slugifyHandle("Dallas Ferdinand")).toBe("dallasferdinand");
    expect(slugifyHandle("  Hello...World__ ")).toBe("hello.world");
    expect(slugifyHandle("Studio_01")).toBe("studio_01");
  });

  it("rejects unusable scraps", () => {
    expect(slugifyHandle("ab")).toBeNull();
    expect(slugifyHandle("123")).toBeNull();
    expect(slugifyHandle("...")).toBeNull();
  });

  it("output always validates when non-null", () => {
    for (const raw of ["Dallas", "a.b_c", "creator", "joesmith99"]) {
      const slug = slugifyHandle(raw);
      expect(slug).not.toBeNull();
      expect(validateUsername(slug!)).toBe(slug);
    }
  });
});

describe("deriveBaseHandle", () => {
  it("prefers first+last name", () => {
    expect(
      deriveBaseHandle({
        firstName: "Dallas",
        lastName: "Ferdinand",
        name: "Other",
        email: "x@y.com",
      }),
    ).toBe("dallasferdinand");
  });

  it("falls through to email local then phone then creator", () => {
    expect(deriveBaseHandle({ email: "Cool.Guy+tag@Example.com" })).toBe(
      "cool.guy",
    );
    expect(deriveBaseHandle({ phone: "+1 868 555 1212" })).toBe("user1212");
    expect(deriveBaseHandle({})).toBe("creator");
  });
});

describe("isReservedUsername", () => {
  it("flags reserved handles", () => {
    expect(isReservedUsername("Admin")).toBe(true);
    expect(isReservedUsername("dallas")).toBe(false);
  });
});
