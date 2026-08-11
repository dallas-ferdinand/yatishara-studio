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
import type * as academy from "../academy.js";
import type * as academyActions from "../academyActions.js";
import type * as academyAdSideHustleLessons from "../academyAdSideHustleLessons.js";
import type * as academyLiveCatalog from "../academyLiveCatalog.js";
import type * as agentActions from "../agentActions.js";
import type * as agentApprovals from "../agentApprovals.js";
import type * as agentApprovalsNode from "../agentApprovalsNode.js";
import type * as agentCapabilities from "../agentCapabilities.js";
import type * as agentMemory from "../agentMemory.js";
import type * as agentMessages from "../agentMessages.js";
import type * as agentPreferences from "../agentPreferences.js";
import type * as agentQuestions from "../agentQuestions.js";
import type * as agentRuns from "../agentRuns.js";
import type * as agentThreads from "../agentThreads.js";
import type * as agentWorkerHttp from "../agentWorkerHttp.js";
import type * as aiGatewayActions from "../aiGatewayActions.js";
import type * as apiKeys from "../apiKeys.js";
import type * as assetActions from "../assetActions.js";
import type * as assetStore from "../assetStore.js";
import type * as assetStoreActions from "../assetStoreActions.js";
import type * as assets from "../assets.js";
import type * as assetsInternal from "../assetsInternal.js";
import type * as assistanceApprovals from "../assistanceApprovals.js";
import type * as assistanceWorkspace from "../assistanceWorkspace.js";
import type * as audioActions from "../audioActions.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as composerCatalog from "../composerCatalog.js";
import type * as composerEnhanceActions from "../composerEnhanceActions.js";
import type * as crons from "../crons.js";
import type * as dmActions from "../dmActions.js";
import type * as dmLabels from "../dmLabels.js";
import type * as dmPeerPanel from "../dmPeerPanel.js";
import type * as dms from "../dms.js";
import type * as documents from "../documents.js";
import type * as elementActions from "../elementActions.js";
import type * as elements from "../elements.js";
import type * as exportJobs from "../exportJobs.js";
import type * as folders from "../folders.js";
import type * as generation from "../generation.js";
import type * as generationActions from "../generationActions.js";
import type * as generationLibrary from "../generationLibrary.js";
import type * as guidedVideo from "../guidedVideo.js";
import type * as guidedVideoActions from "../guidedVideoActions.js";
import type * as guidedVideoLite from "../guidedVideoLite.js";
import type * as hashtags from "../hashtags.js";
import type * as http from "../http.js";
import type * as lib_academyPricing from "../lib/academyPricing.js";
import type * as lib_academyPurchase from "../lib/academyPurchase.js";
import type * as lib_agentByokModel from "../lib/agentByokModel.js";
import type * as lib_agentCrypto from "../lib/agentCrypto.js";
import type * as lib_agentTools_catalog from "../lib/agentTools/catalog.js";
import type * as lib_agentTools_http from "../lib/agentTools/http.js";
import type * as lib_agentTools_index from "../lib/agentTools/index.js";
import type * as lib_agentTools_policy from "../lib/agentTools/policy.js";
import type * as lib_agentTools_types from "../lib/agentTools/types.js";
import type * as lib_aiGateway from "../lib/aiGateway.js";
import type * as lib_assetStorePricing from "../lib/assetStorePricing.js";
import type * as lib_assistanceAgent from "../lib/assistanceAgent.js";
import type * as lib_assistanceGenerationPlan from "../lib/assistanceGenerationPlan.js";
import type * as lib_assistanceTools from "../lib/assistanceTools.js";
import type * as lib_assistedAnalysis from "../lib/assistedAnalysis.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authEmail from "../lib/authEmail.js";
import type * as lib_bunny from "../lib/bunny.js";
import type * as lib_bunnyStream from "../lib/bunnyStream.js";
import type * as lib_byteplusArk from "../lib/byteplusArk.js";
import type * as lib_commentSort from "../lib/commentSort.js";
import type * as lib_composerEnhance from "../lib/composerEnhance.js";
import type * as lib_composerScriptTypes from "../lib/composerScriptTypes.js";
import type * as lib_creativeDirection from "../lib/creativeDirection.js";
import type * as lib_creditBalanceHigh from "../lib/creditBalanceHigh.js";
import type * as lib_customFunctions from "../lib/customFunctions.js";
import type * as lib_deepgram from "../lib/deepgram.js";
import type * as lib_editorEffectContract from "../lib/editorEffectContract.js";
import type * as lib_editorExport from "../lib/editorExport.js";
import type * as lib_editorExportAudio from "../lib/editorExportAudio.js";
import type * as lib_editorProjectOps from "../lib/editorProjectOps.js";
import type * as lib_elementAssetModel from "../lib/elementAssetModel.js";
import type * as lib_elementSheetGuides from "../lib/elementSheetGuides.js";
import type * as lib_elementSheets from "../lib/elementSheets.js";
import type * as lib_elevenlabs from "../lib/elevenlabs.js";
import type * as lib_feedRanking from "../lib/feedRanking.js";
import type * as lib_generateElementSheet from "../lib/generateElementSheet.js";
import type * as lib_generationAssetNames from "../lib/generationAssetNames.js";
import type * as lib_generationPricing from "../lib/generationPricing.js";
import type * as lib_generationUserErrors from "../lib/generationUserErrors.js";
import type * as lib_guidedVideoTypes from "../lib/guidedVideoTypes.js";
import type * as lib_hashtagNormalize from "../lib/hashtagNormalize.js";
import type * as lib_hashtagOps from "../lib/hashtagOps.js";
import type * as lib_hypermotionWorkflow from "../lib/hypermotionWorkflow.js";
import type * as lib_itemReactions from "../lib/itemReactions.js";
import type * as lib_klingGatewayPrompt from "../lib/klingGatewayPrompt.js";
import type * as lib_marketplaceEscrow from "../lib/marketplaceEscrow.js";
import type * as lib_naturalAudioSpeed from "../lib/naturalAudioSpeed.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_passwordCrypto from "../lib/passwordCrypto.js";
import type * as lib_paywise from "../lib/paywise.js";
import type * as lib_presetThumbnails from "../lib/presetThumbnails.js";
import type * as lib_profileEnsure from "../lib/profileEnsure.js";
import type * as lib_profileIdentity from "../lib/profileIdentity.js";
import type * as lib_referenceInput from "../lib/referenceInput.js";
import type * as lib_referenceIntent from "../lib/referenceIntent.js";
import type * as lib_scriptTypeLayers from "../lib/scriptTypeLayers.js";
import type * as lib_seedancePromptCraft from "../lib/seedancePromptCraft.js";
import type * as lib_seedanceResolution from "../lib/seedanceResolution.js";
import type * as lib_skipPromptEnhancement from "../lib/skipPromptEnhancement.js";
import type * as lib_storageBilling from "../lib/storageBilling.js";
import type * as lib_storagePricing from "../lib/storagePricing.js";
import type * as lib_storytellingFoundation from "../lib/storytellingFoundation.js";
import type * as lib_studioApi_auth from "../lib/studioApi/auth.js";
import type * as lib_studioApi_crypto from "../lib/studioApi/crypto.js";
import type * as lib_studioApi_folderScope from "../lib/studioApi/folderScope.js";
import type * as lib_studioApi_httpHelpers from "../lib/studioApi/httpHelpers.js";
import type * as lib_studioApi_openapi from "../lib/studioApi/openapi.js";
import type * as lib_studioApi_requestAuth from "../lib/studioApi/requestAuth.js";
import type * as lib_studioApi_scopes from "../lib/studioApi/scopes.js";
import type * as lib_studioPackageEnvelope from "../lib/studioPackageEnvelope.js";
import type * as lib_studioPackageFormat from "../lib/studioPackageFormat.js";
import type * as lib_studioShareAccess from "../lib/studioShareAccess.js";
import type * as lib_styleSheetGuides from "../lib/styleSheetGuides.js";
import type * as lib_videoDurationPlan from "../lib/videoDurationPlan.js";
import type * as lib_videoGeneration from "../lib/videoGeneration.js";
import type * as lib_videoModels from "../lib/videoModels.js";
import type * as lib_voiceExploreFilters from "../lib/voiceExploreFilters.js";
import type * as magicLoginAuth from "../magicLoginAuth.js";
import type * as marketplace from "../marketplace.js";
import type * as marketplaceActions from "../marketplaceActions.js";
import type * as mediaProxyActions from "../mediaProxyActions.js";
import type * as notifications from "../notifications.js";
import type * as notificationsActions from "../notificationsActions.js";
import type * as passwordAuth from "../passwordAuth.js";
import type * as paywiseActions from "../paywiseActions.js";
import type * as paywiseHttp from "../paywiseHttp.js";
import type * as phonePasswordAuth from "../phonePasswordAuth.js";
import type * as profiles from "../profiles.js";
import type * as savedVoices from "../savedVoices.js";
import type * as storageActions from "../storageActions.js";
import type * as storageBilling from "../storageBilling.js";
import type * as studioApiAccountExtra from "../studioApiAccountExtra.js";
import type * as studioApiActions from "../studioApiActions.js";
import type * as studioApiContext from "../studioApiContext.js";
import type * as studioApiExtraHttp from "../studioApiExtraHttp.js";
import type * as studioApiHttp from "../studioApiHttp.js";
import type * as studioApiInternal from "../studioApiInternal.js";
import type * as studioApiNetworkHttp from "../studioApiNetworkHttp.js";
import type * as studioApiSocialHttp from "../studioApiSocialHttp.js";
import type * as studioCs from "../studioCs.js";
import type * as studioCsActions from "../studioCsActions.js";
import type * as studioCsOpsActions from "../studioCsOpsActions.js";
import type * as studioDownloads from "../studioDownloads.js";
import type * as studioPackage from "../studioPackage.js";
import type * as studioShareActions from "../studioShareActions.js";
import type * as studioShares from "../studioShares.js";
import type * as stylePresetActions from "../stylePresetActions.js";
import type * as stylePresets from "../stylePresets.js";
import type * as userAgentKeys from "../userAgentKeys.js";
import type * as userAgentKeysActions from "../userAgentKeysActions.js";
import type * as userAgentKeysInternal from "../userAgentKeysInternal.js";
import type * as users from "../users.js";
import type * as videoEditActions from "../videoEditActions.js";
import type * as videoEditInternal from "../videoEditInternal.js";
import type * as videoEdits from "../videoEdits.js";
import type * as videoModels from "../videoModels.js";
import type * as voiceActions from "../voiceActions.js";
import type * as whatsappAuth from "../whatsappAuth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  academy: typeof academy;
  academyActions: typeof academyActions;
  academyAdSideHustleLessons: typeof academyAdSideHustleLessons;
  academyLiveCatalog: typeof academyLiveCatalog;
  agentActions: typeof agentActions;
  agentApprovals: typeof agentApprovals;
  agentApprovalsNode: typeof agentApprovalsNode;
  agentCapabilities: typeof agentCapabilities;
  agentMemory: typeof agentMemory;
  agentMessages: typeof agentMessages;
  agentPreferences: typeof agentPreferences;
  agentQuestions: typeof agentQuestions;
  agentRuns: typeof agentRuns;
  agentThreads: typeof agentThreads;
  agentWorkerHttp: typeof agentWorkerHttp;
  aiGatewayActions: typeof aiGatewayActions;
  apiKeys: typeof apiKeys;
  assetActions: typeof assetActions;
  assetStore: typeof assetStore;
  assetStoreActions: typeof assetStoreActions;
  assets: typeof assets;
  assetsInternal: typeof assetsInternal;
  assistanceApprovals: typeof assistanceApprovals;
  assistanceWorkspace: typeof assistanceWorkspace;
  audioActions: typeof audioActions;
  auth: typeof auth;
  billing: typeof billing;
  composerCatalog: typeof composerCatalog;
  composerEnhanceActions: typeof composerEnhanceActions;
  crons: typeof crons;
  dmActions: typeof dmActions;
  dmLabels: typeof dmLabels;
  dmPeerPanel: typeof dmPeerPanel;
  dms: typeof dms;
  documents: typeof documents;
  elementActions: typeof elementActions;
  elements: typeof elements;
  exportJobs: typeof exportJobs;
  folders: typeof folders;
  generation: typeof generation;
  generationActions: typeof generationActions;
  generationLibrary: typeof generationLibrary;
  guidedVideo: typeof guidedVideo;
  guidedVideoActions: typeof guidedVideoActions;
  guidedVideoLite: typeof guidedVideoLite;
  hashtags: typeof hashtags;
  http: typeof http;
  "lib/academyPricing": typeof lib_academyPricing;
  "lib/academyPurchase": typeof lib_academyPurchase;
  "lib/agentByokModel": typeof lib_agentByokModel;
  "lib/agentCrypto": typeof lib_agentCrypto;
  "lib/agentTools/catalog": typeof lib_agentTools_catalog;
  "lib/agentTools/http": typeof lib_agentTools_http;
  "lib/agentTools/index": typeof lib_agentTools_index;
  "lib/agentTools/policy": typeof lib_agentTools_policy;
  "lib/agentTools/types": typeof lib_agentTools_types;
  "lib/aiGateway": typeof lib_aiGateway;
  "lib/assetStorePricing": typeof lib_assetStorePricing;
  "lib/assistanceAgent": typeof lib_assistanceAgent;
  "lib/assistanceGenerationPlan": typeof lib_assistanceGenerationPlan;
  "lib/assistanceTools": typeof lib_assistanceTools;
  "lib/assistedAnalysis": typeof lib_assistedAnalysis;
  "lib/auth": typeof lib_auth;
  "lib/authEmail": typeof lib_authEmail;
  "lib/bunny": typeof lib_bunny;
  "lib/bunnyStream": typeof lib_bunnyStream;
  "lib/byteplusArk": typeof lib_byteplusArk;
  "lib/commentSort": typeof lib_commentSort;
  "lib/composerEnhance": typeof lib_composerEnhance;
  "lib/composerScriptTypes": typeof lib_composerScriptTypes;
  "lib/creativeDirection": typeof lib_creativeDirection;
  "lib/creditBalanceHigh": typeof lib_creditBalanceHigh;
  "lib/customFunctions": typeof lib_customFunctions;
  "lib/deepgram": typeof lib_deepgram;
  "lib/editorEffectContract": typeof lib_editorEffectContract;
  "lib/editorExport": typeof lib_editorExport;
  "lib/editorExportAudio": typeof lib_editorExportAudio;
  "lib/editorProjectOps": typeof lib_editorProjectOps;
  "lib/elementAssetModel": typeof lib_elementAssetModel;
  "lib/elementSheetGuides": typeof lib_elementSheetGuides;
  "lib/elementSheets": typeof lib_elementSheets;
  "lib/elevenlabs": typeof lib_elevenlabs;
  "lib/feedRanking": typeof lib_feedRanking;
  "lib/generateElementSheet": typeof lib_generateElementSheet;
  "lib/generationAssetNames": typeof lib_generationAssetNames;
  "lib/generationPricing": typeof lib_generationPricing;
  "lib/generationUserErrors": typeof lib_generationUserErrors;
  "lib/guidedVideoTypes": typeof lib_guidedVideoTypes;
  "lib/hashtagNormalize": typeof lib_hashtagNormalize;
  "lib/hashtagOps": typeof lib_hashtagOps;
  "lib/hypermotionWorkflow": typeof lib_hypermotionWorkflow;
  "lib/itemReactions": typeof lib_itemReactions;
  "lib/klingGatewayPrompt": typeof lib_klingGatewayPrompt;
  "lib/marketplaceEscrow": typeof lib_marketplaceEscrow;
  "lib/naturalAudioSpeed": typeof lib_naturalAudioSpeed;
  "lib/notify": typeof lib_notify;
  "lib/passwordCrypto": typeof lib_passwordCrypto;
  "lib/paywise": typeof lib_paywise;
  "lib/presetThumbnails": typeof lib_presetThumbnails;
  "lib/profileEnsure": typeof lib_profileEnsure;
  "lib/profileIdentity": typeof lib_profileIdentity;
  "lib/referenceInput": typeof lib_referenceInput;
  "lib/referenceIntent": typeof lib_referenceIntent;
  "lib/scriptTypeLayers": typeof lib_scriptTypeLayers;
  "lib/seedancePromptCraft": typeof lib_seedancePromptCraft;
  "lib/seedanceResolution": typeof lib_seedanceResolution;
  "lib/skipPromptEnhancement": typeof lib_skipPromptEnhancement;
  "lib/storageBilling": typeof lib_storageBilling;
  "lib/storagePricing": typeof lib_storagePricing;
  "lib/storytellingFoundation": typeof lib_storytellingFoundation;
  "lib/studioApi/auth": typeof lib_studioApi_auth;
  "lib/studioApi/crypto": typeof lib_studioApi_crypto;
  "lib/studioApi/folderScope": typeof lib_studioApi_folderScope;
  "lib/studioApi/httpHelpers": typeof lib_studioApi_httpHelpers;
  "lib/studioApi/openapi": typeof lib_studioApi_openapi;
  "lib/studioApi/requestAuth": typeof lib_studioApi_requestAuth;
  "lib/studioApi/scopes": typeof lib_studioApi_scopes;
  "lib/studioPackageEnvelope": typeof lib_studioPackageEnvelope;
  "lib/studioPackageFormat": typeof lib_studioPackageFormat;
  "lib/studioShareAccess": typeof lib_studioShareAccess;
  "lib/styleSheetGuides": typeof lib_styleSheetGuides;
  "lib/videoDurationPlan": typeof lib_videoDurationPlan;
  "lib/videoGeneration": typeof lib_videoGeneration;
  "lib/videoModels": typeof lib_videoModels;
  "lib/voiceExploreFilters": typeof lib_voiceExploreFilters;
  magicLoginAuth: typeof magicLoginAuth;
  marketplace: typeof marketplace;
  marketplaceActions: typeof marketplaceActions;
  mediaProxyActions: typeof mediaProxyActions;
  notifications: typeof notifications;
  notificationsActions: typeof notificationsActions;
  passwordAuth: typeof passwordAuth;
  paywiseActions: typeof paywiseActions;
  paywiseHttp: typeof paywiseHttp;
  phonePasswordAuth: typeof phonePasswordAuth;
  profiles: typeof profiles;
  savedVoices: typeof savedVoices;
  storageActions: typeof storageActions;
  storageBilling: typeof storageBilling;
  studioApiAccountExtra: typeof studioApiAccountExtra;
  studioApiActions: typeof studioApiActions;
  studioApiContext: typeof studioApiContext;
  studioApiExtraHttp: typeof studioApiExtraHttp;
  studioApiHttp: typeof studioApiHttp;
  studioApiInternal: typeof studioApiInternal;
  studioApiNetworkHttp: typeof studioApiNetworkHttp;
  studioApiSocialHttp: typeof studioApiSocialHttp;
  studioCs: typeof studioCs;
  studioCsActions: typeof studioCsActions;
  studioCsOpsActions: typeof studioCsOpsActions;
  studioDownloads: typeof studioDownloads;
  studioPackage: typeof studioPackage;
  studioShareActions: typeof studioShareActions;
  studioShares: typeof studioShares;
  stylePresetActions: typeof stylePresetActions;
  stylePresets: typeof stylePresets;
  userAgentKeys: typeof userAgentKeys;
  userAgentKeysActions: typeof userAgentKeysActions;
  userAgentKeysInternal: typeof userAgentKeysInternal;
  users: typeof users;
  videoEditActions: typeof videoEditActions;
  videoEditInternal: typeof videoEditInternal;
  videoEdits: typeof videoEdits;
  videoModels: typeof videoModels;
  voiceActions: typeof voiceActions;
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
