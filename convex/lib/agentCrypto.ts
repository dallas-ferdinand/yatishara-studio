"use node";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

function secretBytes(): Buffer {
  const raw =
    process.env.STUDIO_AGENT_KEY_SECRET?.trim() ||
    process.env.CONVEX_DEPLOY_KEY?.trim() ||
    "yatishara-studio-agent-dev-secret";
  return scryptSync(raw, "studio-agent-byok", 32);
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
