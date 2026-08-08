"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

async function requireAdmin(ctx: { runQuery: Function }) {
  const userId = await getAuthUserId(ctx as never);
  if (!userId) throw new Error("Not authenticated");
  const me = await ctx.runQuery(api.users.current, {});
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) {
    throw new Error("Admin access required");
  }
  return userId;
}

function opsBase(): string {
  return (
    process.env.STUDIO_CS_OPS_URL ||
    process.env.MERCURYOS_STUDIO_CS_URL ||
    "http://127.0.0.1:8795"
  ).replace(/\/+$/, "");
}

function opsToken(): string {
  return (
    process.env.STUDIO_CS_OPS_TOKEN ||
    process.env.MERCURYOS_STUDIO_CS_OPS_TOKEN ||
    ""
  ).trim();
}

async function studioCsFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = opsToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["x-studio-cs-ops-token"] = token;
    headers.Authorization = `Bearer ${token}`;
  }
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${opsBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : `Studio CS HTTP ${res.status}`;
    throw new Error(err);
  }
  return data;
}

export const adminDeviceStatus = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return studioCsFetch("/api/studio-cs/device");
  },
});

export const adminDeviceEnsure = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return studioCsFetch("/api/studio-cs/device/ensure", { method: "POST", body: "{}" });
  },
});

export const adminDeviceConnect = action({
  args: { logoutFirst: v.optional(v.boolean()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return studioCsFetch("/api/studio-cs/device/connect", {
      method: "POST",
      body: JSON.stringify({ logoutFirst: args.logoutFirst === true }),
    });
  },
});

export const adminDeviceUnlink = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return studioCsFetch("/api/studio-cs/device/unlink", {
      method: "POST",
      body: "{}",
    });
  },
});

export const adminSetWebhook = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return studioCsFetch("/api/studio-cs/device/webhook", {
      method: "POST",
      body: "{}",
    });
  },
});

export const adminListSessions = action({
  args: { status: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const q = args.status ? `?status=${encodeURIComponent(args.status)}` : "";
    return studioCsFetch(`/api/studio-cs/sessions${q}`);
  },
});

export const adminGetSession = action({
  args: { phone: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const phone = args.phone.replace(/\D/g, "");
    return studioCsFetch(`/api/studio-cs/sessions/${phone}`);
  },
});

export const adminSetAgent = action({
  args: { phone: v.string(), enabled: v.boolean() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const phone = args.phone.replace(/\D/g, "");
    return studioCsFetch(`/api/studio-cs/sessions/${phone}/agent`, {
      method: "POST",
      body: JSON.stringify({ enabled: args.enabled }),
    });
  },
});

export const adminSetTakeover = action({
  args: { phone: v.string(), on: v.boolean() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const phone = args.phone.replace(/\D/g, "");
    return studioCsFetch(`/api/studio-cs/sessions/${phone}/takeover`, {
      method: "POST",
      body: JSON.stringify({ on: args.on }),
    });
  },
});

export const adminSetFollowup = action({
  args: {
    phone: v.string(),
    atIso: v.optional(v.string()),
    note: v.optional(v.string()),
    clear: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const phone = args.phone.replace(/\D/g, "");
    return studioCsFetch(`/api/studio-cs/sessions/${phone}/followup`, {
      method: "POST",
      body: JSON.stringify({
        at_iso: args.atIso,
        note: args.note,
        clear: args.clear === true,
      }),
    });
  },
});

export const adminSetStatus = action({
  args: {
    phone: v.string(),
    status: v.string(),
    action: v.optional(
      v.union(v.literal("add"), v.literal("remove"), v.literal("set")),
    ),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const phone = args.phone.replace(/\D/g, "");
    return studioCsFetch(`/api/studio-cs/sessions/${phone}/status`, {
      method: "POST",
      body: JSON.stringify({
        status: args.status,
        action: args.action || "add",
      }),
    });
  },
});

export const adminSetNotes = action({
  args: { phone: v.string(), notes: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const phone = args.phone.replace(/\D/g, "");
    return studioCsFetch(`/api/studio-cs/sessions/${phone}/notes`, {
      method: "POST",
      body: JSON.stringify({ notes: args.notes }),
    });
  },
});

export const adminListPayments = action({
  args: { pending: v.optional(v.boolean()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const q = args.pending ? "?pending=1" : "";
    return studioCsFetch(`/api/studio-cs/payments${q}`);
  },
});

export const adminDecidePayment = action({
  args: {
    paymentId: v.number(),
    decision: v.union(v.literal("approve"), v.literal("reject")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return studioCsFetch(`/api/studio-cs/payments/${args.paymentId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision: args.decision }),
    });
  },
});

export const adminServiceStatus = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return studioCsFetch("/api/studio-cs/status");
  },
});
