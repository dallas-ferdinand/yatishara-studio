import { describe, expect, it } from "vitest";
import {
  STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES,
  STUDIO_PACKAGE_MIME,
  isStudioPackageEnvelope,
  looksLikeZipBytes,
  unwrapStudioPackageBytes,
  wrapStudioPackageZip,
} from "./studioPackageEnvelope";

describe("studioPackageEnvelope", () => {
  it("wraps zip so magic is not PK", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xaa, 0xbb]);
    expect(looksLikeZipBytes(zip)).toBe(true);
    const wrapped = wrapStudioPackageZip(zip);
    expect(isStudioPackageEnvelope(wrapped)).toBe(true);
    expect(looksLikeZipBytes(wrapped)).toBe(false);
    expect(wrapped.byteLength).toBe(STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES + zip.byteLength);
    expect(unwrapStudioPackageBytes(wrapped)).toEqual(zip);
  });

  it("passes through legacy raw zip", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(unwrapStudioPackageBytes(zip)).toEqual(zip);
    expect(isStudioPackageEnvelope(zip)).toBe(false);
  });

  it("exports studio mime", () => {
    expect(STUDIO_PACKAGE_MIME).toBe("application/vnd.yatishara.studio");
  });
});
