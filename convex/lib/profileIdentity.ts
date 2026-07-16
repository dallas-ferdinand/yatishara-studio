/** Username + contact-link validation for public Studio profiles. */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const BIO_MAX = 160;
export const DISPLAY_NAME_MAX = 48;
export const CONTACT_LINKS_MAX = 8;
export const CONTACT_LABEL_MAX = 32;
export const CONTACT_VALUE_MAX = 200;

const USERNAME_RE = /^[a-z][a-z0-9._]*$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "help",
  "login",
  "logout",
  "me",
  "null",
  "profile",
  "profiles",
  "root",
  "settings",
  "signin",
  "signout",
  "signup",
  "studio",
  "support",
  "system",
  "u",
  "undefined",
  "www",
  "yatishara",
]);

export type ContactLinkType = "website" | "phone" | "email" | "other";

export type ContactLinkInput = {
  type: ContactLinkType;
  label: string;
  value: string;
};

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string {
  const username = normalizeUsername(raw);
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    throw new Error(`Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`);
  }
  if (!USERNAME_RE.test(username)) {
    throw new Error(
      "Username must start with a letter and use only lowercase letters, numbers, periods, and underscores",
    );
  }
  if (username.includes("..") || username.endsWith(".") || username.endsWith("_")) {
    throw new Error("Username cannot end with a period or underscore, or contain ..");
  }
  if (RESERVED_USERNAMES.has(username)) {
    throw new Error("That username is reserved");
  }
  return username;
}

export function sanitizeDisplayName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  if (trimmed.length > DISPLAY_NAME_MAX) {
    throw new Error(`Display name must be at most ${DISPLAY_NAME_MAX} characters`);
  }
  return trimmed;
}

export function sanitizeBio(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > BIO_MAX) {
    throw new Error(`Bio must be at most ${BIO_MAX} characters`);
  }
  return trimmed;
}

function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Website link cannot be empty");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid website URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Website must use http or https");
  }
  return url.toString();
}

function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Phone cannot be empty");
  const compact = trimmed.replace(/[^\d+]/g, "");
  if (compact.length < 7 || compact.length > 20) {
    throw new Error("Enter a valid phone number");
  }
  return trimmed;
}

function normalizeEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid email address");
  }
  if (trimmed.length > CONTACT_VALUE_MAX) {
    throw new Error("Email is too long");
  }
  return trimmed;
}

function normalizeOtherLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Link cannot be empty");
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes(".")) {
    return normalizeWebsite(trimmed);
  }
  if (trimmed.length > CONTACT_VALUE_MAX) {
    throw new Error("Link is too long");
  }
  return trimmed;
}

export function sanitizeContactLinks(links: ContactLinkInput[] | undefined): ContactLinkInput[] {
  if (!links) return [];
  if (links.length > CONTACT_LINKS_MAX) {
    throw new Error(`You can add at most ${CONTACT_LINKS_MAX} links`);
  }
  return links.map((link, index) => {
    const label = link.label.trim().replace(/\s+/g, " ");
    if (!label) throw new Error(`Link ${index + 1} needs a label`);
    if (label.length > CONTACT_LABEL_MAX) {
      throw new Error(`Link labels must be at most ${CONTACT_LABEL_MAX} characters`);
    }
    const type = link.type;
    let value: string;
    if (type === "website") value = normalizeWebsite(link.value);
    else if (type === "phone") value = normalizePhone(link.value);
    else if (type === "email") value = normalizeEmail(link.value);
    else if (type === "other") value = normalizeOtherLink(link.value);
    else throw new Error("Unsupported link type");
    return { type, label, value };
  });
}

export function contactHref(link: ContactLinkInput): string {
  if (link.type === "phone") {
    const digits = link.value.replace(/[^\d+]/g, "");
    return `tel:${digits}`;
  }
  if (link.type === "email") return `mailto:${link.value}`;
  return link.value;
}
