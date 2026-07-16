import { describe, expect, it } from "vitest";
import {
  contactHref,
  normalizeUsername,
  sanitizeBio,
  sanitizeContactLinks,
  sanitizeDisplayName,
  validateUsername,
} from "./profileIdentity";

describe("validateUsername", () => {
  it("normalizes and accepts valid handles", () => {
    expect(validateUsername("Dallas.Creations")).toBe("dallas.creations");
    expect(validateUsername("studio_01")).toBe("studio_01");
  });

  it("rejects short, reserved, and invalid handles", () => {
    expect(() => validateUsername("ab")).toThrow(/3–30/);
    expect(() => validateUsername("admin")).toThrow(/reserved/);
    expect(() => validateUsername("1cool")).toThrow(/start with a letter/);
    expect(() => validateUsername("bad..name")).toThrow(/\.\./);
    expect(() => validateUsername("trailing.")).toThrow(/end with/);
  });
});

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  MixEd_Case ")).toBe("mixed_case");
  });
});

describe("sanitizeBio and display name", () => {
  it("trims empty to undefined", () => {
    expect(sanitizeBio("   ")).toBeUndefined();
    expect(sanitizeDisplayName("  ")).toBeUndefined();
  });

  it("enforces length", () => {
    expect(() => sanitizeBio("x".repeat(161))).toThrow(/Bio/);
    expect(() => sanitizeDisplayName("x".repeat(49))).toThrow(/Display name/);
  });
});

describe("sanitizeContactLinks", () => {
  it("normalizes website and phone links", () => {
    const links = sanitizeContactLinks([
      { type: "website", label: "Site", value: "yatishara.com" },
      { type: "phone", label: "WhatsApp", value: "+1 868 555 1212" },
      { type: "email", label: "Email", value: "Hello@Example.com" },
    ]);
    expect(links[0]?.value).toBe("https://yatishara.com/");
    expect(links[1]?.value).toBe("+1 868 555 1212");
    expect(links[2]?.value).toBe("hello@example.com");
    expect(contactHref(links[1]!)).toBe("tel:+18685551212");
    expect(contactHref(links[2]!)).toBe("mailto:hello@example.com");
  });
});
