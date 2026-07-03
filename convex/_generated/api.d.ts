/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as aiGatewayActions from "../aiGatewayActions.js";
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as documents from "../documents.js";
import type * as elements from "../elements.js";
import type * as folders from "../folders.js";
import type * as generation from "../generation.js";
import type * as generationActions from "../generationActions.js";
import type * as http from "../http.js";
import type * as lib_aiGateway from "../lib/aiGateway.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bunny from "../lib/bunny.js";
import type * as lib_creativeDirection from "../lib/creativeDirection.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_generationPricing from "../lib/generationPricing.js";
import type * as lib_presetThumbnails from "../lib/presetThumbnails.js";
import type * as lib_storytellingFoundation from "../lib/storytellingFoundation.js";
import type * as notifications from "../notifications.js";
import type * as notificationsActions from "../notificationsActions.js";
import type * as stylePresetActions from "../stylePresetActions.js";
import type * as stylePresets from "../stylePresets.js";
import type * as users from "../users.js";
import type * as whatsappAuth from "../whatsappAuth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  aiGatewayActions: typeof aiGatewayActions;
  assets: typeof assets;
  auth: typeof auth;
  billing: typeof billing;
  documents: typeof documents;
  elements: typeof elements;
  folders: typeof folders;
  generation: typeof generation;
  generationActions: typeof generationActions;
  http: typeof http;
  "lib/aiGateway": typeof lib_aiGateway;
  "lib/auth": typeof lib_auth;
  "lib/bunny": typeof lib_bunny;
  "lib/creativeDirection": typeof lib_creativeDirection;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/generationPricing": typeof lib_generationPricing;
  "lib/presetThumbnails": typeof lib_presetThumbnails;
  "lib/storytellingFoundation": typeof lib_storytellingFoundation;
  notifications: typeof notifications;
  notificationsActions: typeof notificationsActions;
  stylePresetActions: typeof stylePresetActions;
  stylePresets: typeof stylePresets;
  users: typeof users;
  whatsappAuth: typeof whatsappAuth;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
