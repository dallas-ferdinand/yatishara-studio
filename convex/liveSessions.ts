import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";

const SESSION_TTL_MS = 45 * 60 * 1000;
const DEVICE_TTL_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const liveStatus = v.union(
  v.literal("waiting"),
  v.literal("linking"),
  v.literal("live"),
  v.literal("ended"),
);

const deviceStatus = v.union(
  v.literal("online"),
  v.literal("requested"),
  v.literal("live"),
  v.literal("ended"),
);

const sessionReturn = v.object({
  _id: v.id("liveSessions"),
  code: v.string(),
  status: liveStatus,
  phoneJoinedAt: v.optional(v.number()),
  deviceId: v.optional(v.id("liveDevices")),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
});

const deviceReturn = v.object({
  _id: v.id("liveDevices"),
  deviceKey: v.string(),
  kind: v.literal("phone_camera"),
  label: v.string(),
  status: deviceStatus,
  sessionId: v.optional(v.id("liveSessions")),
  facing: v.optional(v.union(v.literal("user"), v.literal("environment"))),
  torch: v.optional(v.boolean()),
  torchSupported: v.optional(v.boolean()),
  cameraLabel: v.optional(v.string()),
  mirror: v.optional(v.boolean()),
  zoom: v.optional(v.number()),
  zoomMin: v.optional(v.number()),
  zoomMax: v.optional(v.number()),
  zoomSupported: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
});

const signalReturn = v.object({
  _id: v.id("liveSignals"),
  from: v.union(v.literal("host"), v.literal("phone")),
  kind: v.union(
    v.literal("offer"),
    v.literal("answer"),
    v.literal("ice"),
    v.literal("bye"),
  ),
  payload: v.string(),
  createdAt: v.number(),
});

function newCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!;
  }
  return code;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isExpired(expiresAt: number, now: number) {
  return expiresAt <= now;
}

async function getLiveSession(
  ctx: MutationCtx,
  sessionId: Id<"liveSessions"> | undefined,
  now: number,
) {
  if (!sessionId) return null;
  const row = await ctx.db.get(sessionId);
  if (!row || row.status === "ended" || isExpired(row.expiresAt, now)) return null;
  return row;
}

function toSession(row: Doc<"liveSessions">) {
  return {
    _id: row._id,
    code: row.code,
    status: row.status,
    phoneJoinedAt: row.phoneJoinedAt,
    deviceId: row.deviceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}

function toDevice(row: Doc<"liveDevices">) {
  return {
    _id: row._id,
    deviceKey: row.deviceKey,
    kind: row.kind,
    label: row.label,
    status: row.status,
    sessionId: row.sessionId,
    facing: row.facing,
    torch: row.torch,
    torchSupported: row.torchSupported,
    cameraLabel: row.cameraLabel,
    mirror: row.mirror,
    zoom: row.zoom,
    zoomMin: row.zoomMin,
    zoomMax: row.zoomMax,
    zoomSupported: row.zoomSupported,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}

async function endSession(
  ctx: MutationCtx,
  sessionId: Id<"liveSessions">,
  now: number,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.status === "ended") return;
  await ctx.db.patch(sessionId, { status: "ended", updatedAt: now });
}

async function makeSession(
  ctx: MutationCtx,
  hostId: Id<"users">,
  now: number,
  deviceId?: Id<"liveDevices">,
) {
  let code = newCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const clash = await ctx.db
      .query("liveSessions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!clash || clash.status === "ended" || isExpired(clash.expiresAt, now)) break;
    code = newCode();
  }
  const id = await ctx.db.insert("liveSessions", {
    hostId,
    code,
    status: "waiting",
    ...(deviceId ? { deviceId } : {}),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  const row = await ctx.db.get(id);
  if (!row) throw new Error("Could not start the link");
  return row;
}

export const heartbeat = authedMutation({
  args: { sessionId: v.id("liveSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row || row.hostId !== ctx.user._id || row.status === "ended") return null;
    const now = Date.now();
    if (isExpired(row.expiresAt, now)) {
      await endSession(ctx, row._id, now);
      return null;
    }
    await ctx.db.patch(row._id, {
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    return null;
  },
});

export const joinAsPhone = authedMutation({
  args: { sessionId: v.id("liveSessions") },
  returns: sessionReturn,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row || row.hostId !== ctx.user._id) {
      throw new Error("That link is not for this account");
    }
    const now = Date.now();
    if (row.status === "ended" || isExpired(row.expiresAt, now)) {
      throw new Error("That computer is reconnecting");
    }
    await ctx.db.patch(row._id, {
      status: row.status === "waiting" ? "linking" : row.status,
      phoneJoinedAt: row.phoneJoinedAt ?? now,
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    if (row.deviceId) {
      const device = await ctx.db.get(row.deviceId);
      if (device && device.ownerId === ctx.user._id && device.status !== "ended") {
        await ctx.db.patch(device._id, {
          status: "live",
          updatedAt: now,
          expiresAt: now + DEVICE_TTL_MS,
        });
      }
    }
    const next = await ctx.db.get(row._id);
    if (!next) throw new Error("Could not join");
    return toSession(next);
  },
});

export const markLive = authedMutation({
  args: { sessionId: v.id("liveSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row || row.hostId !== ctx.user._id || row.status === "ended") return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "live",
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    if (row.deviceId) {
      const device = await ctx.db.get(row.deviceId);
      if (device && device.status !== "ended") {
        await ctx.db.patch(device._id, {
          status: "live",
          updatedAt: now,
          expiresAt: now + DEVICE_TTL_MS,
        });
      }
    }
    return null;
  },
});

export const endMine = authedMutation({
  args: { sessionId: v.id("liveSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row || row.hostId !== ctx.user._id) return null;
    const now = Date.now();
    await endSession(ctx, row._id, now);
    if (row.deviceId) {
      const device = await ctx.db.get(row.deviceId);
      if (device && device.status !== "ended") {
        await ctx.db.patch(device._id, {
          sessionId: undefined,
          status: "online",
          updatedAt: now,
          expiresAt: now + DEVICE_TTL_MS,
        });
      }
    }
    return null;
  },
});

export const postSignal = authedMutation({
  args: {
    sessionId: v.id("liveSessions"),
    from: v.union(v.literal("host"), v.literal("phone")),
    kind: v.union(
      v.literal("offer"),
      v.literal("answer"),
      v.literal("ice"),
      v.literal("bye"),
    ),
    payload: v.string(),
  },
  returns: v.id("liveSignals"),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row || row.hostId !== ctx.user._id) {
      throw new Error("Link not found");
    }
    const now = Date.now();
    if (row.status === "ended" || isExpired(row.expiresAt, now)) {
      throw new Error("That link expired");
    }
    if (args.payload.length > 24_000) {
      throw new Error("Signal too large");
    }
    await ctx.db.patch(row._id, {
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    return await ctx.db.insert("liveSignals", {
      sessionId: row._id,
      from: args.from,
      kind: args.kind,
      payload: args.payload,
      createdAt: now,
    });
  },
});

export const listSignals = authedQuery({
  args: {
    sessionId: v.id("liveSessions"),
    after: v.optional(v.number()),
  },
  returns: v.array(signalReturn),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    if (!row || row.hostId !== ctx.user._id) return [];
    const after = args.after ?? 0;
    const rows = await ctx.db
      .query("liveSignals")
      .withIndex("by_session_and_created", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .take(240);
    return rows
      .filter((item) => item.createdAt > after)
      .map((item) => ({
        _id: item._id,
        from: item.from,
        kind: item.kind,
        payload: item.payload,
        createdAt: item.createdAt,
      }));
  },
});

export const announceDevice = authedMutation({
  args: {
    deviceKey: v.string(),
    label: v.optional(v.string()),
    facing: v.optional(v.union(v.literal("user"), v.literal("environment"))),
    torch: v.optional(v.boolean()),
    torchSupported: v.optional(v.boolean()),
    cameraLabel: v.optional(v.string()),
    mirror: v.optional(v.boolean()),
    zoom: v.optional(v.number()),
    zoomMin: v.optional(v.number()),
    zoomMax: v.optional(v.number()),
    zoomSupported: v.optional(v.boolean()),
  },
  returns: deviceReturn,
  handler: async (ctx, args) => {
    const key = args.deviceKey.trim().slice(0, 80);
    if (!key) throw new Error("Missing device");
    const now = Date.now();
    const label = (args.label ?? "Phone").trim().slice(0, 48) || "Phone";
    const cameraPatch = {
      ...(args.facing ? { facing: args.facing } : {}),
      ...(args.torch != null ? { torch: args.torch } : {}),
      ...(args.torchSupported != null ? { torchSupported: args.torchSupported } : {}),
      ...(args.mirror != null ? { mirror: args.mirror } : {}),
      ...(args.cameraLabel ? { cameraLabel: args.cameraLabel.trim().slice(0, 80) } : {}),
      ...(finiteNumber(args.zoom) != null ? { zoom: finiteNumber(args.zoom) } : {}),
      ...(finiteNumber(args.zoomMin) != null ? { zoomMin: finiteNumber(args.zoomMin) } : {}),
      ...(finiteNumber(args.zoomMax) != null ? { zoomMax: finiteNumber(args.zoomMax) } : {}),
      ...(args.zoomSupported != null ? { zoomSupported: args.zoomSupported } : {}),
    };
    const existing = await ctx.db
      .query("liveDevices")
      .withIndex("by_owner_and_key", (q) =>
        q.eq("ownerId", ctx.user._id).eq("deviceKey", key),
      )
      .first();
    if (existing) {
      const live = await getLiveSession(ctx, existing.sessionId, now);
      await ctx.db.patch(existing._id, {
        label,
        status: live
          ? existing.status === "ended"
            ? "online"
            : existing.status
          : "online",
        sessionId: live?._id,
        updatedAt: now,
        expiresAt: now + DEVICE_TTL_MS,
        ...cameraPatch,
      });
      const next = await ctx.db.get(existing._id);
      if (!next) throw new Error("Could not share");
      return toDevice(next);
    }
    const id = await ctx.db.insert("liveDevices", {
      ownerId: ctx.user._id,
      deviceKey: key,
      kind: "phone_camera",
      label,
      status: "online",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + DEVICE_TTL_MS,
      ...cameraPatch,
    });
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Could not share");
    return toDevice(row);
  },
});

export const setDeviceCamera = authedMutation({
  args: {
    deviceId: v.id("liveDevices"),
    facing: v.optional(v.union(v.literal("user"), v.literal("environment"))),
    torch: v.optional(v.boolean()),
    torchSupported: v.optional(v.boolean()),
    cameraLabel: v.optional(v.string()),
    label: v.optional(v.string()),
    mirror: v.optional(v.boolean()),
    zoom: v.optional(v.number()),
    zoomMin: v.optional(v.number()),
    zoomMax: v.optional(v.number()),
    zoomSupported: v.optional(v.boolean()),
  },
  returns: deviceReturn,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deviceId);
    if (!row || row.ownerId !== ctx.user._id || row.status === "ended") {
      throw new Error("That phone is not on this account");
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      updatedAt: now,
      expiresAt: now + DEVICE_TTL_MS,
      ...(args.facing ? { facing: args.facing } : {}),
      ...(args.torch != null ? { torch: args.torch } : {}),
      ...(args.torchSupported != null ? { torchSupported: args.torchSupported } : {}),
      ...(args.mirror != null ? { mirror: args.mirror } : {}),
      ...(args.cameraLabel
        ? { cameraLabel: args.cameraLabel.trim().slice(0, 80) }
        : {}),
      ...(args.label ? { label: args.label.trim().slice(0, 48) } : {}),
      ...(finiteNumber(args.zoom) != null ? { zoom: finiteNumber(args.zoom) } : {}),
      ...(finiteNumber(args.zoomMin) != null ? { zoomMin: finiteNumber(args.zoomMin) } : {}),
      ...(finiteNumber(args.zoomMax) != null ? { zoomMax: finiteNumber(args.zoomMax) } : {}),
      ...(args.zoomSupported != null ? { zoomSupported: args.zoomSupported } : {}),
    });
    const next = await ctx.db.get(row._id);
    if (!next) throw new Error("Could not update camera");
    return toDevice(next);
  },
});

export const heartbeatDevice = authedMutation({
  args: { deviceId: v.id("liveDevices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deviceId);
    if (!row || row.ownerId !== ctx.user._id || row.status === "ended") return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      updatedAt: now,
      expiresAt: now + DEVICE_TTL_MS,
    });
    if (row.sessionId) {
      const session = await ctx.db.get(row.sessionId);
      if (session && session.status !== "ended") {
        await ctx.db.patch(session._id, {
          updatedAt: now,
          expiresAt: now + SESSION_TTL_MS,
        });
      }
    }
    return null;
  },
});

export const endDevice = authedMutation({
  args: { deviceId: v.id("liveDevices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deviceId);
    if (!row || row.ownerId !== ctx.user._id) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      status: "ended",
      sessionId: undefined,
      updatedAt: now,
    });
    if (row.sessionId) await endSession(ctx, row.sessionId, now);
    return null;
  },
});

export const claimDevice = authedMutation({
  args: {
    deviceId: v.id("liveDevices"),
    restart: v.optional(v.boolean()),
  },
  returns: v.union(sessionReturn, v.null()),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.ownerId !== ctx.user._id) {
      throw new Error("That phone is not on this account");
    }
    const now = Date.now();
    if (device.status === "ended") return null;
    if (isExpired(device.expiresAt, now)) {
      await ctx.db.patch(device._id, {
        status: "online",
        updatedAt: now,
        expiresAt: now + DEVICE_TTL_MS,
      });
    }
    const live = await getLiveSession(ctx, device.sessionId, now);
    if (live && !args.restart) {
      return toSession(live);
    }
    if (device.sessionId) await endSession(ctx, device.sessionId, now);
    const session = await makeSession(ctx, ctx.user._id, now, device._id);
    await ctx.db.patch(device._id, {
      sessionId: session._id,
      status: "requested",
      updatedAt: now,
      expiresAt: now + DEVICE_TTL_MS,
    });
    return toSession(session);
  },
});

export const myDevice = authedQuery({
  args: { deviceKey: v.string() },
  returns: v.union(deviceReturn, v.null()),
  handler: async (ctx, args) => {
    const key = args.deviceKey.trim();
    if (!key) return null;
    const now = Date.now();
    const row = await ctx.db
      .query("liveDevices")
      .withIndex("by_owner_and_key", (q) =>
        q.eq("ownerId", ctx.user._id).eq("deviceKey", key),
      )
      .first();
    if (!row || row.status === "ended" || isExpired(row.expiresAt, now)) return null;
    return toDevice(row);
  },
});

export const listDevices = authedQuery({
  args: {},
  returns: v.array(deviceReturn),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("liveDevices")
      .withIndex("by_owner_and_updated", (q) => q.eq("ownerId", ctx.user._id))
      .order("desc")
      .take(20);
    return rows
      .filter(
        (row) =>
          row.status !== "ended" && !isExpired(row.expiresAt, now),
      )
      .map(toDevice);
  },
});
