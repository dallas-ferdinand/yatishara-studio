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
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as byteplusActions from "../byteplusActions.js";
import type * as documents from "../documents.js";
import type * as elements from "../elements.js";
import type * as folders from "../folders.js";
import type * as generation from "../generation.js";
import type * as generationActions from "../generationActions.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bunny from "../lib/bunny.js";
import type * as lib_byteplus from "../lib/byteplus.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as notifications from "../notifications.js";
import type * as notificationsActions from "../notificationsActions.js";
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
  assets: typeof assets;
  auth: typeof auth;
  billing: typeof billing;
  byteplusActions: typeof byteplusActions;
  documents: typeof documents;
  elements: typeof elements;
  folders: typeof folders;
  generation: typeof generation;
  generationActions: typeof generationActions;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/bunny": typeof lib_bunny;
  "lib/byteplus": typeof lib_byteplus;
  "lib/customFunctions": typeof lib_customFunctions;
  notifications: typeof notifications;
  notificationsActions: typeof notificationsActions;
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
