/**
 * `.studio` on-disk envelope: custom magic + zip payload.
 * Keeps OS content-sniffers from classifying the file as application/zip.
 * Inner payload remains an open zip (no encryption). Legacy raw-zip `.studio` still imports.
 */

export const STUDIO_PACKAGE_MIME = "application/vnd.yatishara.studio";

/** ASCII "YSTUDIO" + NUL — must not collide with PK\x03\x04 zip magic. */
export const STUDIO_PACKAGE_MAGIC = new Uint8Array([
  0x59, 0x53, 0x54, 0x55, 0x44, 0x49, 0x4f, 0x00,
]);

export const STUDIO_PACKAGE_ENVELOPE_VERSION = 1;
export const STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES =
  STUDIO_PACKAGE_MAGIC.length + 2;

function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

export function isStudioPackageEnvelope(bytes: Uint8Array): boolean {
  if (bytes.byteLength < STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES) return false;
  for (let i = 0; i < STUDIO_PACKAGE_MAGIC.length; i += 1) {
    if (bytes[i] !== STUDIO_PACKAGE_MAGIC[i]) return false;
  }
  const version = readU16LE(bytes, STUDIO_PACKAGE_MAGIC.length);
  return version >= 1 && version <= 255;
}

export function looksLikeZipBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

/** Prefix zip bytes so downloads are not sniffed as ZIP. */
export function wrapStudioPackageZip(zipBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(
    STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES + zipBytes.byteLength,
  );
  out.set(STUDIO_PACKAGE_MAGIC, 0);
  out[STUDIO_PACKAGE_MAGIC.length] = STUDIO_PACKAGE_ENVELOPE_VERSION & 0xff;
  out[STUDIO_PACKAGE_MAGIC.length + 1] =
    (STUDIO_PACKAGE_ENVELOPE_VERSION >> 8) & 0xff;
  out.set(zipBytes, STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES);
  return out;
}

/**
 * Strip envelope when present; otherwise return bytes as-is (legacy raw zip).
 */
export function unwrapStudioPackageBytes(bytes: Uint8Array): Uint8Array {
  if (!isStudioPackageEnvelope(bytes)) return bytes;
  return bytes.subarray(STUDIO_PACKAGE_ENVELOPE_HEADER_BYTES);
}
