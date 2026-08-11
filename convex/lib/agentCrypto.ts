"use node";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * BYOK encryption requires STUDIO_AGENT_KEY_SECRET.
 * Never silently fall back to CONVEX_DEPLOY_KEY / hardcoded secrets.
 */
export function requireAgentKeySecret(): Buffer {
  const raw = process.env.STUDIO_AGENT_KEY_SECRET?.trim();
  if (!raw) {
    throw new Error(
      "STUDIO_AGENT_KEY_SECRET is required for Agent BYOK encryption/decryption",
    );
  }
  return scryptSync(raw, "studio-agent-byok", 32);
}

function secretBytes(): Buffer {
  return requireAgentKeySecret();
}

export function encryptAgentApiKey(plain: string): { encryptedKey: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedKey: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptAgentApiKey(encryptedKey: string, iv: string): string {
  const buf = Buffer.from(encryptedKey, "base64");
  const data = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secretBytes(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function keyHint(plain: string): string {
  const t = plain.trim();
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}
