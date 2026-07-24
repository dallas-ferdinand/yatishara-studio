import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";
import {
  getCurrentUser,
  requireAdmin,
  requireApprovedSeller,
  type ApprovedSeller,
} from "./auth";

export type StudioCtx = {
  user: Doc<"users"> & { _id: Id<"users"> };
};

export type SellerCtx = StudioCtx & {
  seller: ApprovedSeller;
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

export const sellerQuery = customQuery(
  query,
  customCtx(async (ctx): Promise<SellerCtx> => {
    return await requireApprovedSeller(ctx);
  }),
);

export const sellerMutation = customMutation(
  mutation,
  customCtx(async (ctx): Promise<SellerCtx> => {
    return await requireApprovedSeller(ctx);
  }),
);
