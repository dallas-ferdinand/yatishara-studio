/**
 * WhatsApp-style DM labels (lists): owner creates named/icon labels and puts
 * peers in one or many. Filtering lives on listMyConversations(labelId).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const LABEL_NAME_MAX = 40;
const LABELS_MAX = 40;
const MEMBERS_PER_LABEL_MAX = 500;

/** Keep in sync with src/studio/lib/dmLabelIcons.ts */
export const DM_LABEL_ICONS = [
  "tag",
  "briefcase",
  "heart",
  "star",
  "home",
  "users",
  "shopping-bag",
  "graduation-cap",
  "plane",
  "music",
  "camera",
  "coffee",
  "gamepad-2",
  "landmark",
  "stethoscope",
  "wrench",
  "sparkles",
  "bookmark",
  "flag",
  "building-2",
  "baby",
  "dog",
  "palette",
  "megaphone",
] as const;

const iconSet = new Set<string>(DM_LABEL_ICONS);

const labelReturn = v.object({
  labelId: v.id("dmLabels"),
  name: v.string(),
  icon: v.string(),
  sortOrder: v.number(),
  memberCount: v.number(),
});

async function requireOwnedLabel(
  ctx: QueryCtx | MutationCtx,
  labelId: Id<"dmLabels">,
  ownerUserId: Id<"users">,
): Promise<Doc<"dmLabels">> {
  const label = await ctx.db.get("dmLabels", labelId);
  if (!label || label.ownerUserId !== ownerUserId) {
    throw new Error("Label not found");
  }
  return label;
}

function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Label name required");
  if (name.length > LABEL_NAME_MAX) {
    throw new Error(`Label name must be at most ${LABEL_NAME_MAX} characters`);
  }
  return name;
}

function normalizeIcon(raw: string): string {
  const icon = raw.trim().toLowerCase();
  if (!iconSet.has(icon)) throw new Error("Invalid label icon");
  return icon;
}

export const listMine = authedQuery({
  args: {},
  returns: v.array(labelReturn),
  handler: async (ctx) => {
    const labels = await ctx.db
      .query("dmLabels")
      .withIndex("by_owner_and_order", (q) => q.eq("ownerUserId", ctx.user._id))
      .collect();
    return await Promise.all(
      labels.map(async (label) => {
        const members = await ctx.db
          .query("dmLabelMembers")
          .withIndex("by_label", (q) => q.eq("labelId", label._id))
          .take(MEMBERS_PER_LABEL_MAX + 1);
        return {
          labelId: label._id,
          name: label.name,
          icon: label.icon,
          sortOrder: label.sortOrder,
          memberCount: Math.min(members.length, MEMBERS_PER_LABEL_MAX),
        };
      }),
    );
  },
});

export const create = authedMutation({
  args: {
    name: v.string(),
    icon: v.string(),
  },
  returns: v.id("dmLabels"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dmLabels")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", ctx.user._id))
      .take(LABELS_MAX + 1);
    if (existing.length >= LABELS_MAX) {
      throw new Error(`You can create at most ${LABELS_MAX} labels`);
    }
    const name = normalizeName(args.name);
    const icon = normalizeIcon(args.icon);
    const maxOrder = existing.reduce(
      (max, row) => Math.max(max, row.sortOrder),
      -1,
    );
    const now = Date.now();
    return await ctx.db.insert("dmLabels", {
      ownerUserId: ctx.user._id,
      name,
      icon,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authedMutation({
  args: {
    labelId: v.id("dmLabels"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const label = await requireOwnedLabel(ctx, args.labelId, ctx.user._id);
    const patch: Partial<Doc<"dmLabels">> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = normalizeName(args.name);
    if (args.icon !== undefined) patch.icon = normalizeIcon(args.icon);
    await ctx.db.patch(label._id, patch);
    return null;
  },
});

export const remove = authedMutation({
  args: { labelId: v.id("dmLabels") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const label = await requireOwnedLabel(ctx, args.labelId, ctx.user._id);
    const members = await ctx.db
      .query("dmLabelMembers")
      .withIndex("by_label", (q) => q.eq("labelId", label._id))
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }
    await ctx.db.delete(label._id);
    return null;
  },
});

/** Labels currently assigned to a peer (from the viewer's perspective). */
export const listForPeer = authedQuery({
  args: { peerUserId: v.id("users") },
  returns: v.array(
    v.object({
      labelId: v.id("dmLabels"),
      name: v.string(),
      icon: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.peerUserId === ctx.user._id) return [];
    const memberships = await ctx.db
      .query("dmLabelMembers")
      .withIndex("by_owner_and_peer", (q) =>
        q.eq("ownerUserId", ctx.user._id).eq("peerUserId", args.peerUserId),
      )
      .collect();
    const labels = await Promise.all(
      memberships.map((row) => ctx.db.get("dmLabels", row.labelId)),
    );
    return labels
      .filter((label): label is Doc<"dmLabels"> => Boolean(label))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((label) => ({
        labelId: label._id,
        name: label.name,
        icon: label.icon,
      }));
  },
});

/**
 * Replace which of the owner's labels a peer belongs to.
 * People can sit in zero, one, or many labels.
 */
export const setPeerLabels = authedMutation({
  args: {
    peerUserId: v.id("users"),
    labelIds: v.array(v.id("dmLabels")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.peerUserId === ctx.user._id) {
      throw new Error("You cannot label yourself");
    }
    const peer = await ctx.db.get("users", args.peerUserId);
    if (!peer) throw new Error("Person not found");

    const uniqueIds = [...new Set(args.labelIds)];
    const wanted = new Set<Id<"dmLabels">>();
    for (const labelId of uniqueIds) {
      await requireOwnedLabel(ctx, labelId, ctx.user._id);
      const count = (
        await ctx.db
          .query("dmLabelMembers")
          .withIndex("by_label", (q) => q.eq("labelId", labelId))
          .take(MEMBERS_PER_LABEL_MAX + 1)
      ).length;
      const already = await ctx.db
        .query("dmLabelMembers")
        .withIndex("by_label_and_peer", (q) =>
          q.eq("labelId", labelId).eq("peerUserId", args.peerUserId),
        )
        .unique();
      if (!already && count >= MEMBERS_PER_LABEL_MAX) {
        throw new Error("That label is full");
      }
      wanted.add(labelId);
    }

    const existing = await ctx.db
      .query("dmLabelMembers")
      .withIndex("by_owner_and_peer", (q) =>
        q.eq("ownerUserId", ctx.user._id).eq("peerUserId", args.peerUserId),
      )
      .collect();

    for (const row of existing) {
      if (!wanted.has(row.labelId)) {
        await ctx.db.delete(row._id);
      }
    }
    const have = new Set(existing.map((row) => row.labelId));
    const now = Date.now();
    for (const labelId of wanted) {
      if (have.has(labelId)) continue;
      await ctx.db.insert("dmLabelMembers", {
        labelId,
        ownerUserId: ctx.user._id,
        peerUserId: args.peerUserId,
        createdAt: now,
      });
    }
    return null;
  },
});

/** Peer user ids in a label — used to filter the chat list. */
export async function peerIdsInLabel(
  ctx: QueryCtx,
  ownerUserId: Id<"users">,
  labelId: Id<"dmLabels">,
): Promise<Set<Id<"users">> | null> {
  const label = await ctx.db.get("dmLabels", labelId);
  if (!label || label.ownerUserId !== ownerUserId) return null;
  const members = await ctx.db
    .query("dmLabelMembers")
    .withIndex("by_label", (q) => q.eq("labelId", labelId))
    .take(MEMBERS_PER_LABEL_MAX);
  return new Set(members.map((row) => row.peerUserId));
}
