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
import type * as apiKeys from "../apiKeys.js";
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as composerCatalog from "../composerCatalog.js";
import type * as documents from "../documents.js";
import type * as elementActions from "../elementActions.js";
import type * as elements from "../elements.js";
import type * as folders from "../folders.js";
import type * as generation from "../generation.js";
import type * as generationActions from "../generationActions.js";
import type * as http from "../http.js";
import type * as lib_aiGateway from "../lib/aiGateway.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bunny from "../lib/bunny.js";
import type * as lib_composerScriptTypes from "../lib/composerScriptTypes.js";
import type * as lib_creativeDirection from "../lib/creativeDirection.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_elementAssetModel from "../lib/elementAssetModel.js";
import type * as lib_elementSheetGuides from "../lib/elementSheetGuides.js";
import type * as lib_elementSheets from "../lib/elementSheets.js";
import type * as lib_generateElementSheet from "../lib/generateElementSheet.js";
import type * as lib_generationPricing from "../lib/generationPricing.js";
import type * as lib_generationUserErrors from "../lib/generationUserErrors.js";
import type * as lib_klingGatewayPrompt from "../lib/klingGatewayPrompt.js";
import type * as lib_presetThumbnails from "../lib/presetThumbnails.js";
import type * as lib_referenceInput from "../lib/referenceInput.js";
import type * as lib_referenceIntent from "../lib/referenceIntent.js";
import type * as lib_scriptTypeLayers from "../lib/scriptTypeLayers.js";
import type * as lib_skipPromptEnhancement from "../lib/skipPromptEnhancement.js";
import type * as lib_storytellingFoundation from "../lib/storytellingFoundation.js";
import type * as lib_studioApi_auth from "../lib/studioApi/auth.js";
import type * as lib_studioApi_crypto from "../lib/studioApi/crypto.js";
import type * as lib_studioApi_folderScope from "../lib/studioApi/folderScope.js";
import type * as lib_studioApi_httpHelpers from "../lib/studioApi/httpHelpers.js";
import type * as lib_studioApi_openapi from "../lib/studioApi/openapi.js";
import type * as lib_studioApi_scopes from "../lib/studioApi/scopes.js";
import type * as lib_videoGeneration from "../lib/videoGeneration.js";
import type * as lib_videoModels from "../lib/videoModels.js";
import type * as notifications from "../notifications.js";
import type * as notificationsActions from "../notificationsActions.js";
import type * as studioApiActions from "../studioApiActions.js";
import type * as studioApiHttp from "../studioApiHttp.js";
import type * as studioApiInternal from "../studioApiInternal.js";
import type * as stylePresetActions from "../stylePresetActions.js";
import type * as stylePresets from "../stylePresets.js";
import type * as users from "../users.js";
import type * as videoEditActions from "../videoEditActions.js";
import type * as videoEditInternal from "../videoEditInternal.js";
import type * as videoEdits from "../videoEdits.js";
import type * as videoModels from "../videoModels.js";
import type * as whatsappAuth from "../whatsappAuth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  aiGatewayActions: typeof aiGatewayActions;
  apiKeys: typeof apiKeys;
  assets: typeof assets;
  auth: typeof auth;
  billing: typeof billing;
  composerCatalog: typeof composerCatalog;
  documents: typeof documents;
  elementActions: typeof elementActions;
  elements: typeof elements;
  folders: typeof folders;
  generation: typeof generation;
  generationActions: typeof generationActions;
  http: typeof http;
  "lib/aiGateway": typeof lib_aiGateway;
  "lib/auth": typeof lib_auth;
  "lib/bunny": typeof lib_bunny;
  "lib/composerScriptTypes": typeof lib_composerScriptTypes;
  "lib/creativeDirection": typeof lib_creativeDirection;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/elementAssetModel": typeof lib_elementAssetModel;
  "lib/elementSheetGuides": typeof lib_elementSheetGuides;
  "lib/elementSheets": typeof lib_elementSheets;
  "lib/generateElementSheet": typeof lib_generateElementSheet;
  "lib/generationPricing": typeof lib_generationPricing;
  "lib/generationUserErrors": typeof lib_generationUserErrors;
  "lib/klingGatewayPrompt": typeof lib_klingGatewayPrompt;
  "lib/presetThumbnails": typeof lib_presetThumbnails;
  "lib/referenceInput": typeof lib_referenceInput;
  "lib/referenceIntent": typeof lib_referenceIntent;
  "lib/scriptTypeLayers": typeof lib_scriptTypeLayers;
  "lib/skipPromptEnhancement": typeof lib_skipPromptEnhancement;
  "lib/storytellingFoundation": typeof lib_storytellingFoundation;
  "lib/studioApi/auth": typeof lib_studioApi_auth;
  "lib/studioApi/crypto": typeof lib_studioApi_crypto;
  "lib/studioApi/folderScope": typeof lib_studioApi_folderScope;
  "lib/studioApi/httpHelpers": typeof lib_studioApi_httpHelpers;
  "lib/studioApi/openapi": typeof lib_studioApi_openapi;
  "lib/studioApi/scopes": typeof lib_studioApi_scopes;
  "lib/videoGeneration": typeof lib_videoGeneration;
  "lib/videoModels": typeof lib_videoModels;
  notifications: typeof notifications;
  notificationsActions: typeof notificationsActions;
  studioApiActions: typeof studioApiActions;
  studioApiHttp: typeof studioApiHttp;
  studioApiInternal: typeof studioApiInternal;
  stylePresetActions: typeof stylePresetActions;
  stylePresets: typeof stylePresets;
  users: typeof users;
  videoEditActions: typeof videoEditActions;
  videoEditInternal: typeof videoEditInternal;
  videoEdits: typeof videoEdits;
  videoModels: typeof videoModels;
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
