import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/customFunctions";

export const list = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("savedVoices"),
      voiceId: v.string(),
      publicOwnerId: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      language: v.optional(v.string()),
      accent: v.optional(v.string()),
      gender: v.optional(v.string()),
      age: v.optional(v.string()),
      useCase: v.optional(v.string()),
      category: v.optional(v.string()),
      addedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("savedVoices")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return rows
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((row) => ({
        _id: row._id,
        voiceId: row.voiceId,
        publicOwnerId: row.publicOwnerId,
        name: row.name,
        description: row.description,
        previewUrl: row.previewUrl,
        imageUrl: row.imageUrl,
        language: row.language,
        accent: row.accent,
        gender: row.gender,
        age: row.age,
        useCase: row.useCase,
        category: row.category,
        addedAt: row.addedAt,
      }));
  },
});

export const save = authedMutation({
  args: {
    voiceId: v.string(),
    publicOwnerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    language: v.optional(v.string()),
    accent: v.optional(v.string()),
    gender: v.optional(v.string()),
    age: v.optional(v.string()),
    useCase: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.id("savedVoices"),
  handler: async (ctx, args) => {
    const voiceId = args.voiceId.trim();
    const publicOwnerId = args.publicOwnerId.trim();
    if (!voiceId || !publicOwnerId) {
      throw new Error("Voice id is required.");
    }
    const existing = await ctx.db
      .query("savedVoices")
      .withIndex("by_owner_and_voice", (q) =>
        q.eq("ownerId", ctx.user._id).eq("voiceId", voiceId),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        publicOwnerId,
        name: args.name.trim() || existing.name,
        description: args.description,
        previewUrl: args.previewUrl,
        imageUrl: args.imageUrl,
        language: args.language,
        accent: args.accent,
        gender: args.gender,
        age: args.age,
        useCase: args.useCase,
        category: args.category,
      });
      return existing._id;
    }
    return await ctx.db.insert("savedVoices", {
      ownerId: ctx.user._id,
      voiceId,
      publicOwnerId,
      name: args.name.trim() || "Voice",
      description: args.description,
      previewUrl: args.previewUrl,
      imageUrl: args.imageUrl,
      language: args.language,
      accent: args.accent,
      gender: args.gender,
      age: args.age,
      useCase: args.useCase,
      category: args.category,
      addedAt: now,
    });
  },
});

export const remove = authedMutation({
  args: { voiceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const voiceId = args.voiceId.trim();
    const existing = await ctx.db
      .query("savedVoices")
      .withIndex("by_owner_and_voice", (q) =>
        q.eq("ownerId", ctx.user._id).eq("voiceId", voiceId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});
