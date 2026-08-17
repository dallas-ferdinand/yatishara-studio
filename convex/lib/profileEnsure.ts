/**
 * Auto-provision public profiles with clean unique usernames.
 * Used by signup hooks, account-complete safety net, and one-time backfill.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  USERNAME_MAX,
  USERNAME_MIN,
  isReservedUsername,
  toNameCase,
  validateUsername,
} from "./profileIdentity";

export type HandleSourceUser = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type PublicNameUser = {
  firstName?: string;
  lastName?: string;
};

export type PublicNameSeller = {
  status: string;
  businessName: string;
};

/** Account first + last only — never legacy users.name or freeform profile labels. */
export function accountNameFromUser(user: PublicNameUser | null | undefined): string | undefined {
  const first = user?.firstName?.trim();
  const last = user?.lastName?.trim();
  // Case-fix on read as well as on write so older rows never display lowercase.
  if (first && last) return toNameCase(`${first} ${last}`);
  if (first) return toNameCase(first);
  if (last) return toNameCase(last);
  return undefined;
}

/**
 * Public label for profiles / feed / People.
 * Verified seller trading name only when opted in; otherwise first+last.
 */
export function resolvePublicDisplayName(args: {
  username: string;
  useSellerDisplayName?: boolean;
  user?: PublicNameUser | null;
  seller?: PublicNameSeller | null;
}): string {
  if (
    args.useSellerDisplayName &&
    args.seller?.status === "approved"
  ) {
    const business = args.seller.businessName.trim();
    if (business) return business;
  }
  return accountNameFromUser(args.user) || args.username;
}

/** Turn arbitrary text into a username-shaped slug, or null if unusable. */
export function slugifyHandle(raw: string): string | null {
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "")
    .replace(/[._]{2,}/g, (match) => match[0] ?? ".")
    .replace(/^[^a-z]+/, "")
    .replace(/[._]+$/g, "");

  if (s.length < USERNAME_MIN) {
    // Pad short letter-leading scraps so "ab" → still fails; "jo" → null.
    return null;
  }
  if (s.length > USERNAME_MAX) {
    s = s.slice(0, USERNAME_MAX).replace(/[._]+$/g, "");
  }
  if (s.length < USERNAME_MIN) return null;
  try {
    return validateUsername(s);
  } catch {
    return null;
  }
}

/** Prefer real name → account name → email local → user+phone → creator. */
export function deriveBaseHandle(user: HandleSourceUser): string {
  const candidates: string[] = [];
  const fromNames = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fromNames) candidates.push(fromNames);
  if (user.name?.trim()) candidates.push(user.name.trim());
  if (user.email?.trim()) {
    const local = user.email.trim().split("@")[0]?.split("+")[0] ?? "";
    if (local) candidates.push(local);
  }
  if (user.phone) {
    const digits = user.phone.replace(/\D/g, "");
    const last4 = digits.slice(-4);
    if (last4.length === 4) candidates.push(`user${last4}`);
  }
  candidates.push("creator");

  for (const candidate of candidates) {
    const slug = slugifyHandle(candidate);
    if (slug) return slug;
  }
  return "creator";
}

function withNumericSuffix(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = String(n);
  const maxBase = USERNAME_MAX - suffix.length;
  let truncated = base.slice(0, Math.max(USERNAME_MIN, maxBase)).replace(/[._]+$/g, "");
  if (truncated.length < USERNAME_MIN) {
    truncated = "creator".slice(0, Math.max(USERNAME_MIN, maxBase));
  }
  return `${truncated}${suffix}`;
}

/** Phone/email fallbacks assigned before first+last exist — safe to rewrite. */
export function isPlaceholderHandle(username: string): boolean {
  const handle = username.trim().toLowerCase();
  return /^user\d{4}$/.test(handle) || /^creator\d*$/.test(handle);
}

/**
 * Allocate an unused username: base, base2…base50, then base + short id chars.
 * `exceptUserId` ignores the caller's existing profile so a rename is not treated as taken.
 */
export async function allocateUniqueUsername(
  ctx: MutationCtx,
  baseRaw: string,
  salt?: string,
  exceptUserId?: Id<"users">,
): Promise<string> {
  const base = slugifyHandle(baseRaw) ?? "creator";

  for (let i = 0; i < 50; i += 1) {
    const candidate = withNumericSuffix(base, i === 0 ? 1 : i + 1);
    if (isReservedUsername(candidate)) continue;
    let validated: string;
    try {
      validated = validateUsername(candidate);
    } catch {
      continue;
    }
    const taken = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", validated))
      .unique();
    if (!taken || taken.userId === exceptUserId) return validated;
  }

  const idPart = (salt ?? "x")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(-6);
  const fallbackBase = slugifyHandle(`${base}${idPart}`) ?? slugifyHandle(`user${idPart}`) ?? "creator";
  for (let i = 0; i < 20; i += 1) {
    const candidate = withNumericSuffix(fallbackBase, i === 0 ? 1 : i + 1);
    if (isReservedUsername(candidate)) continue;
    try {
      const validated = validateUsername(candidate);
      const taken = await ctx.db
        .query("profiles")
        .withIndex("by_username", (q) => q.eq("username", validated))
        .unique();
      if (!taken || taken.userId === exceptUserId) return validated;
    } catch {
      continue;
    }
  }
  // Extremely unlikely — timestamp keeps us unique under the letter-prefix rule.
  return validateUsername(`u${Date.now().toString(36)}`);
}

async function refreshAutoUsernameIfNeeded(
  ctx: MutationCtx,
  profile: Doc<"profiles">,
  user: Doc<"users">,
): Promise<Doc<"profiles">> {
  if (profile.usernameAutoAssigned === false) return profile;
  const hasName = Boolean(user.firstName?.trim() && user.lastName?.trim());
  if (!hasName) return profile;
  const shouldRefresh =
    profile.usernameAutoAssigned === true ||
    isPlaceholderHandle(profile.username);
  if (!shouldRefresh) return profile;

  const next = await allocateUniqueUsername(
    ctx,
    deriveBaseHandle(user),
    String(user._id),
    user._id,
  );
  const now = Date.now();
  if (next === profile.username && profile.usernameAutoAssigned === true) {
    return profile;
  }
  await ctx.db.patch(profile._id, {
    username: next,
    usernameAutoAssigned: true,
    updatedAt: now,
  });
  const updated = await ctx.db.get("profiles", profile._id);
  if (!updated) throw new Error("Failed to update profile");
  return updated;
}

/** Idempotent: return existing profile or create one with a unique auto username. */
export async function ensureProfileForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new Error("User not found");
  }

  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) {
    return await refreshAutoUsernameIfNeeded(ctx, existing, user);
  }

  const username = await allocateUniqueUsername(
    ctx,
    deriveBaseHandle(user),
    String(userId),
    userId,
  );
  const now = Date.now();
  const profileId = await ctx.db.insert("profiles", {
    userId,
    username,
    usernameAutoAssigned: true,
    // Public name is resolved live from users / seller — do not store freeform displayName.
    bio: undefined,
    avatarAssetId: undefined,
    contactLinks: [],
    isPublic: true,
    followerCount: 0,
    followingCount: 0,
    postCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const profile = await ctx.db.get("profiles", profileId);
  if (!profile) throw new Error("Failed to create profile");
  return profile;
}
