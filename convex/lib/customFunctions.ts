import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import { getCurrentUser, requireAdmin } from "./auth";

export type StudioCtx = {
  user: Doc<"users"> & { _id: Id<"users"> };
};

export const authedQuery = customQuery(
  query,
  customCtx(async (ctx): Promise<StudioCtx> => {
    const user = await getCurrentUser(ctx);
    return { user };
  }),
);

export const authedMutation = customMutation(
  mutation,
  customCtx(async (ctx): Promise<StudioCtx> => {
    const user = await getCurrentUser(ctx);
    return { user };
  }),
);

export const adminQuery = customQuery(
  query,
  customCtx(async (ctx): Promise<StudioCtx> => {
    const user = await requireAdmin(ctx);
    return { user };
  }),
);

export const adminMutation = customMutation(
  mutation,
  customCtx(async (ctx): Promise<StudioCtx> => {
    const user = await requireAdmin(ctx);
    return { user };
  }),
);
