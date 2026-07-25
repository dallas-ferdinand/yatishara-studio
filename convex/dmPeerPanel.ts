/**
 * DM peer right-sidebar: private notes, block state, and About/Labels payload.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getMarketplaceSellerForUser } from "./lib/auth";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import { contactHref } from "./lib/profileIdentity";
import { hydrateSocialPeople } from "./profiles";

const NOTE_BODY_MAX = 4000;
const NOTES_MAX = 200;
const PUBLIC_URL_TTL_SECONDS = 60 * 60;

const sellerTagValidator = v.union(
  v.literal("freelancer"),
  v.literal("business"),
);

const noteReturn = v.object({
  noteId: v.id("dmPeerNotes"),
  body: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export type SellerTag = "freelancer" | "business";

/** Approved seller → Freelancer/Business tag; otherwise null. */
export async function sellerTagForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<SellerTag | null> {
  const seller = await getMarketplaceSellerForUser(ctx, userId);
  if (!seller || seller.status !== "approved") return null;
  return seller.entityType === "business" ? "business" : "freelancer";
}

export async function isBlockedBy(
  ctx: QueryCtx | MutationCtx,
  blockerUserId: Id<"users">,
  blockedUserId: Id<"users">,
): Promise<boolean> {
  const row = await ctx.db
    .query("dmBlocks")
    .withIndex("by_blocker_and_blocked", (q) =>
      q.eq("blockerUserId", blockerUserId).eq("blockedUserId", blockedUserId),
    )
    .unique();
  return Boolean(row);
}

/** Throw if the recipient has blocked the sender. */
export async function assertCanMessagePeer(
  ctx: QueryCtx | MutationCtx,
  senderId: Id<"users">,
  recipientId: Id<"users">,
): Promise<void> {
  if (await isBlockedBy(ctx, recipientId, senderId)) {
    throw new Error("You can’t message this person");
  }
}

export const listNotes = authedQuery({
  args: { peerUserId: v.id("users") },
  returns: v.array(noteReturn),
  handler: async (ctx, args) => {
    if (args.peerUserId === ctx.user._id) return [];
    const notes = await ctx.db
      .query("dmPeerNotes")
      .withIndex("by_owner_and_peer", (q) =>
        q.eq("ownerUserId", ctx.user._id).eq("peerUserId", args.peerUserId),
      )
      .collect();
    return notes
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, NOTES_MAX)
      .map((note) => ({
        noteId: note._id,
        body: note.body,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      }));
  },
});

export const addNote = authedMutation({
  args: {
    peerUserId: v.id("users"),
    body: v.string(),
  },
  returns: v.id("dmPeerNotes"),
  handler: async (ctx, args) => {
    if (args.peerUserId === ctx.user._id) {
      throw new Error("You can’t add notes about yourself");
    }
    const peer = await ctx.db.get("users", args.peerUserId);
    if (!peer) throw new Error("Person not found");
    const body = args.body.trim();
    if (!body) throw new Error("Note cannot be empty");
    if (body.length > NOTE_BODY_MAX) {
      throw new Error(`Note must be at most ${NOTE_BODY_MAX} characters`);
    }
    const existing = await ctx.db
      .query("dmPeerNotes")
      .withIndex("by_owner_and_peer", (q) =>
        q.eq("ownerUserId", ctx.user._id).eq("peerUserId", args.peerUserId),
      )
      .take(NOTES_MAX + 1);
    if (existing.length >= NOTES_MAX) {
      throw new Error(`You can save at most ${NOTES_MAX} notes per person`);
    }
    const now = Date.now();
    return await ctx.db.insert("dmPeerNotes", {
      ownerUserId: ctx.user._id,
      peerUserId: args.peerUserId,
      body,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNote = authedMutation({
  args: {
    noteId: v.id("dmPeerNotes"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("dmPeerNotes", args.noteId);
    if (!note || note.ownerUserId !== ctx.user._id) {
      throw new Error("Note not found");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Note cannot be empty");
    if (body.length > NOTE_BODY_MAX) {
      throw new Error(`Note must be at most ${NOTE_BODY_MAX} characters`);
    }
    await ctx.db.patch(note._id, { body, updatedAt: Date.now() });
    return null;
  },
});

export const deleteNote = authedMutation({
  args: { noteId: v.id("dmPeerNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("dmPeerNotes", args.noteId);
    if (!note || note.ownerUserId !== ctx.user._id) {
      throw new Error("Note not found");
    }
    await ctx.db.delete(note._id);
    return null;
  },
});

export const block = authedMutation({
  args: { peerUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.peerUserId === ctx.user._id) {
      throw new Error("You can’t block yourself");
    }
    const peer = await ctx.db.get("users", args.peerUserId);
    if (!peer) throw new Error("Person not found");
    const existing = await ctx.db
      .query("dmBlocks")
      .withIndex("by_blocker_and_blocked", (q) =>
        q
          .eq("blockerUserId", ctx.user._id)
          .eq("blockedUserId", args.peerUserId),
      )
      .unique();
    if (existing) return null;
    await ctx.db.insert("dmBlocks", {
      blockerUserId: ctx.user._id,
      blockedUserId: args.peerUserId,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const unblock = authedMutation({
  args: { peerUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dmBlocks")
      .withIndex("by_blocker_and_blocked", (q) =>
        q
          .eq("blockerUserId", ctx.user._id)
          .eq("blockedUserId", args.peerUserId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

const contactLinkReturn = v.object({
  type: v.union(
    v.literal("website"),
    v.literal("phone"),
    v.literal("email"),
    v.literal("other"),
  ),
  label: v.string(),
  value: v.string(),
  href: v.string(),
});

/**
 * One payload for About + Labels tabs in the DM peer sidebar.
 */
export const peerPanel = authedQuery({
  args: {
    peerUserId: v.id("users"),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      peer: v.object({
        userId: v.id("users"),
        profileId: v.id("profiles"),
        username: v.string(),
        displayName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        bio: v.optional(v.string()),
      }),
      sellerTag: v.optional(sellerTagValidator),
      businessName: v.optional(v.string()),
      contactLinks: v.array(contactLinkReturn),
      social: v.object({
        followerCount: v.number(),
        followingCount: v.number(),
        postCount: v.number(),
        isFollowing: v.boolean(),
      }),
      sellerStats: v.optional(
        v.object({
          completedJobs: v.number(),
          ratingAverage: v.union(v.number(), v.null()),
          ratingCount: v.number(),
          publishedOfferCount: v.number(),
        }),
      ),
      labels: v.array(
        v.object({
          labelId: v.id("dmLabels"),
          name: v.string(),
          icon: v.string(),
          assigned: v.boolean(),
        }),
      ),
      blocked: v.boolean(),
      publishedOfferCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.peerUserId === ctx.user._id) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", args.peerUserId))
      .unique();
    if (!profile || !profile.isPublic) return null;

    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + PUBLIC_URL_TTL_SECONDS;
    const [hydrated] = await hydrateSocialPeople(ctx, [profile], expiresUnix);
    const seller = await getMarketplaceSellerForUser(ctx, args.peerUserId);
    const sellerTag =
      seller?.status === "approved"
        ? seller.entityType === "business"
          ? ("business" as const)
          : ("freelancer" as const)
        : undefined;

    const follow = await ctx.db
      .query("profileFollows")
      .withIndex("by_pair", (q) =>
        q
          .eq("followerUserId", ctx.user._id)
          .eq("followingProfileId", profile._id),
      )
      .unique();

    let sellerStats:
      | {
          completedJobs: number;
          ratingAverage: number | null;
          ratingCount: number;
          publishedOfferCount: number;
        }
      | undefined;
    let publishedOfferCount = 0;
    if (seller && seller.status === "approved") {
      const offers = await ctx.db
        .query("marketplaceOffers")
        .withIndex("by_seller", (q) => q.eq("sellerId", seller._id))
        .collect();
      const published = offers.filter((o) => o.status === "published");
      publishedOfferCount = published.length;
      let ratingSum = 0;
      let ratingCount = 0;
      for (const offer of offers) {
        ratingSum += offer.ratingSum ?? 0;
        ratingCount += offer.ratingCount ?? 0;
      }
      const completedJobs = (
        await ctx.db
          .query("marketplaceJobs")
          .withIndex("by_seller", (q) => q.eq("sellerUserId", args.peerUserId))
          .collect()
      ).filter((job) => job.status === "completed").length;
      sellerStats = {
        completedJobs,
        ratingAverage:
          ratingCount > 0
            ? Math.round((ratingSum / ratingCount) * 10) / 10
            : null,
        ratingCount,
        publishedOfferCount,
      };
    }

    const myLabels = await ctx.db
      .query("dmLabels")
      .withIndex("by_owner_and_order", (q) => q.eq("ownerUserId", ctx.user._id))
      .collect();
    const memberships = await ctx.db
      .query("dmLabelMembers")
      .withIndex("by_owner_and_peer", (q) =>
        q.eq("ownerUserId", ctx.user._id).eq("peerUserId", args.peerUserId),
      )
      .collect();
    const assigned = new Set(memberships.map((m) => String(m.labelId)));

    const blocked = await isBlockedBy(ctx, ctx.user._id, args.peerUserId);

    return {
      peer: {
        userId: profile.userId,
        profileId: profile._id,
        username: profile.username,
        displayName: hydrated?.displayName,
        avatarUrl: hydrated?.avatarUrl,
        bio: profile.bio,
      },
      sellerTag,
      businessName:
        seller?.status === "approved" ? seller.businessName : undefined,
      contactLinks: profile.contactLinks.map((link) => ({
        type: link.type,
        label: link.label,
        value: link.value,
        href: contactHref(link),
      })),
      social: {
        followerCount: profile.followerCount,
        followingCount: profile.followingCount,
        postCount: profile.postCount,
        isFollowing: Boolean(follow),
      },
      sellerStats,
      labels: myLabels.map((label) => ({
        labelId: label._id,
        name: label.name,
        icon: label.icon,
        assigned: assigned.has(String(label._id)),
      })),
      blocked,
      publishedOfferCount,
    };
  },
});
