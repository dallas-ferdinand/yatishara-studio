// @ts-nocheck
"use client";

import { StudioApiKeysSettings } from "./StudioApiKeysSettings";
import { StudioHistoryPanel } from "./StudioHistoryPanel";
import { StudioMobileBottomNav } from "./StudioMobileBottomNav";
import { StudioPromptMessage } from "./StudioPromptMessage";
import { StudioDotGridWave } from "./StudioDotGridWave";
import { StudioChatMarkdown } from "./StudioChatMarkdown";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvex, useMutation, useQueries, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  ChevronDown,
  Clock3,
  FileText,
  Gauge,
  History,
  Image as ImageIcon,
  CircleDot,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  MapPin,
  Maximize2,
  Mic,
  Package,
  Palette,
  Plus,
  ArrowUp,
  Scissors,
  SlidersHorizontal,
  RectangleHorizontal,
  Coins,
  Settings,
  Sparkles,
  Upload,
  Wand2,
  X,
  UserRound,
  Video,
  Zap,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, useCallback } from "react";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { createPortal } from "react-dom";
import { AttachmentPreviewSheet } from "@/desk/components/AttachmentPreviewSheet";
import { ExplorerContextMenu } from "@/desk/components/ExplorerContextMenu";
import { warmThumbUrl } from "@/desk/components/FileEntryThumb";
import { FileBreadcrumbs } from "@/desk/components/FileBreadcrumbs";
import { FileTree } from "@/desk/components/FileTree";
import { DeskMediaPlayer } from "@/desk/components/DeskMediaPlayer";
import { Icon } from "@/desk/components/Icons";
import { ImageZoomViewer } from "@/desk/components/ImageZoomViewer";
import { MarkdownDocEditor } from "@/desk/components/MarkdownDocEditor";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { ThemeSettings } from "@/desk/components/ThemeSettings";
import { StudioStyleSheetPickerPanel, StudioStyleSheetTriggerButton } from "@/studio/components/StudioStyleSheetPicker";
import { friendlyGenerationError } from "@/studio/lib/generationUserErrors";
import { UnifiedTabStrip } from "@/desk/components/UnifiedTabStrip";
import {
  EXPLORER_DND_TYPE,
  clearActiveExplorerDrag,
  readExplorerDragData,
  writeExplorerDragData,
} from "@/desk/lib/explorer-dnd";
import { displayWorkspacePath } from "@/desk/lib/display-path";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { playUiSound } from "@/mos-app/sounds.js";
import { randomizeStudioAppearance, SCHEMES, STUDIO_BACKGROUND_FAMILIES } from "@/mos-app/theme.js";
import { useStudioBackground } from "@/studio/hooks/useStudioBackground";
import { useMercuryLogoAssets, useMercurySidebarLogo } from "@/lib/use-appearance-mode";
import { getDeviceId, loadSession } from "@/lib/session";
import {
  creditCostForGeneration,
  imageCreditCost,
  normalizeImageResolutionLabel as normalizeImageResolution,
  textCreditCost,
} from "../../../convex/lib/generationPricing";
import * as mosApi from "@mos-app/api.js";

const WORKSPACE_ID = "yatishara-studio";
const COMPOSER_TAB = "composer:main";
const TRASH_FOLDER_ID = "__trash__";
const TRASH_ACTIVE_FOLDER = { _id: TRASH_FOLDER_ID, name: "Trash" };
const TRASH_FOLDER_ENTRY = {
  type: "dir",
  name: "Trash",
  path: "/Studio/Trash",
  displayPath: displayWorkspacePath("/Studio/Trash"),
  modified: 0,
  mtimeMs: 0,
  studioKind: "trash",
  studioId: TRASH_FOLDER_ID,
};
const CREATE_MENU_ITEMS = [
  { action: "upload", label: "Upload media", icon: Upload },
  { action: "new-folder", label: "Folder", icon: Plus },
  { action: "new-file", label: "Ad copy", icon: FileText },
  { action: "new-video-edit", label: "Video edit", icon: Scissors },
  { sep: true },
  { action: "new-element", label: "Add element", icon: Sparkles },
];
const STUDIO_CUSTOM_CURSOR_KEY = "yatishara-studio-custom-cursor";
const ACTIVE_STYLE_SHEET_KEY = "mercuryos-studio-active-style-sheet-v1";
const COMPOSER_STYLE_MODE_KEY = "mercuryos-studio-composer-style-mode-v1";
const STUDIO_VOICE_NOT_CONNECTED =
  "Voice is not connected yet. Please try typing your request, or connect voice and try again.";
function studioCursorUrl(accent, active = false) {
  const path = "M4 6.3 L4 19.9 Q4 21.9 5.258 20.346 L7.4 17.7 C8.4 16.4 9.9 15.7 11.5 15.7 L14.902 15.826 Q16.9 15.9 15.414 14.562 L5.486 5.638 Q4 4.3 4 6.3 Z";
  const glow = `<path d='${path}' fill='none' stroke='${accent}' stroke-width='5' stroke-opacity='.22' stroke-linejoin='round' stroke-linecap='round' filter='blur(2.5px)'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 26'>${glow}<path d='${path}' fill='${active ? accent : "none"}' fill-opacity='${active ? 1 : 0}' stroke='${accent}' stroke-width='${active ? 1 : 2}' stroke-linejoin='round' stroke-linecap='round'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 6, auto`;
}

function studioCursorTextUrl(accent) {
  const glow = `<rect x='1' y='1' width='2' height='16' fill='${accent}' fill-opacity='.22' rx='1' filter='blur(2.5px)'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='18' viewBox='0 0 4 18'>${glow}<rect x='1' y='1' width='2' height='16' fill='${accent}' rx='1'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 9, text`;
}

function studioCursorResizeXUrl(accent) {
  const glow = `<path d='M9 7 L3 7 M5 5 L3 7 L5 9 M19 7 L25 7 M23 5 L25 7 L23 9' fill='none' stroke='${accent}' stroke-width='5' stroke-opacity='.22' stroke-linecap='round' stroke-linejoin='round' filter='blur(2.5px)'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='14' viewBox='0 0 28 14'>${glow}<path d='M9 7 L3 7 M5 5 L3 7 L5 9' fill='none' stroke='${accent}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M19 7 L25 7 M23 5 L25 7 L23 9' fill='none' stroke='${accent}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 7, ew-resize`;
}

function studioCursorDragUrl(accent) {
  const glow = `<circle cx='12' cy='12' r='9' fill='none' stroke='${accent}' stroke-width='5' stroke-opacity='.22' filter='blur(2.5px)'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${glow}<circle cx='12' cy='12' r='9' fill='none' stroke='${accent}' stroke-width='1.6'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}

function studioCursorGrabbingUrl(accent) {
  const glow = `<circle cx='14' cy='14' r='11' fill='${accent}' fill-opacity='.22' filter='blur(2.5px)'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>${glow}<circle cx='14' cy='14' r='11' fill='${accent}' fill-opacity='.92'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, grabbing`;
}

function applyStudioCursorTheme(element) {
  if (!element) return;
  const root = document.documentElement;
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--cursor-accent").trim() ||
    "#22c55e";
  root.style.setProperty("--studio-cursor-default", studioCursorUrl(accent, false));
  root.style.setProperty("--studio-cursor-active", studioCursorUrl(accent, true));
  root.style.setProperty("--studio-cursor-text", studioCursorTextUrl(accent));
  root.style.setProperty("--studio-cursor-resize-x", studioCursorResizeXUrl(accent));
  root.style.setProperty("--studio-cursor-drag", studioCursorDragUrl(accent));
  root.style.setProperty("--studio-cursor-grabbing", studioCursorGrabbingUrl(accent));
}

function cssUrlToPath(value) {
  const match = value.trim().match(/^url\(["']?(.*?)["']?\)$/);
  return match?.[1] ?? "";
}

const STYLE = {
  shell: "flex h-dvh min-h-0 text-cursor-text",
  sidebar: "flex h-full w-full min-w-0 flex-col border-r border-cursor-border-soft",
  main: "flex min-w-0 flex-1 flex-col",
  panelHead: "cursor-panel-head cursor-sidebar-head justify-between",
  iconButton:
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-cursor-border bg-cursor-panel px-2 text-xs text-cursor-muted transition hover:border-cursor-accent/50 hover:bg-cursor-hover hover:text-cursor-text",
};

function ensureStudioVoiceSession() {
  const current = mosApi.getSession?.();
  if (current?.gatewayUrl) return true;

  const stored = loadSession();
  if (!stored?.gatewayUrl || !stored?.token) return false;

  mosApi.setDeviceIdProvider?.(getDeviceId);
  mosApi.setSession({
    gatewayUrl: stored.gatewayUrl.replace(/\/+$/, ""),
    token: stored.token,
    deviceId: stored.deviceId,
    userId: stored.userId,
    clientTag: "desk",
  });
  return true;
}

function studioVoiceErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const clean = message.trim() || "Voice input failed.";
  if (clean === "Not connected") {
    return STUDIO_VOICE_NOT_CONNECTED;
  }
  if (mosApi.isNetworkError?.(error)) {
    return "Voice could not connect. Please try again in a moment.";
  }
  return clean;
}

export function StudioShell() {
  const { isMobile } = useMobileLayout();
  const { signOut } = useAuthActions();
  const ensureDefaults = useMutation(api.users.ensureStudioDefaults);
  const createFolder = useMutation(api.folders.create);
  const updateFolder = useMutation(api.folders.update);
  const trashFolder = useMutation(api.folders.moveToTrash);
  const restoreFolder = useMutation(api.folders.restore);
  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);
  const trashDocument = useMutation(api.documents.moveToTrash);
  const restoreDocument = useMutation(api.documents.restore);
  const createElement = useMutation(api.elements.create);
  const updateElement = useMutation(api.elements.update);
  const trashElement = useMutation(api.elements.moveToTrash);
  const restoreElement = useMutation(api.elements.restore);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const completeUpload = useMutation(api.assets.completeUpload);
  const updateAsset = useMutation(api.assets.update);
  const duplicateAsset = useMutation(api.assets.duplicate);
  const trashAsset = useMutation(api.assets.moveToTrash);
  const restoreAsset = useMutation(api.assets.restore);
  const createVideoEdit = useMutation(api.videoEdits.create);
  const updateVideoEdit = useMutation(api.videoEdits.update);
  const trashVideoEdit = useMutation(api.videoEdits.moveToTrash);
  const restoreVideoEdit = useMutation(api.videoEdits.restore);
  const createThread = useMutation(api.generation.createThread);
  const switchThreadFolder = useMutation(api.generation.switchThreadFolder);
  const updateAccountDetails = useMutation(api.users.updateAccountDetails);
  const seedStylePresets = useMutation(api.stylePresets.adminSeedDefaults);
  const generatePresetThumbnails = useAction(api.stylePresetActions.adminGenerateThumbnails);
  const runFlow = useAction(api.generationActions.runFlow);
  const generateScript = useAction(api.generationActions.generateScript);
  const generateElementSheet = useAction(api.elementActions.generateSheet);
  const convex = useConvex();

  const lastGenerationModeRef = useRef("image");

  const [activeFolderId, setActiveFolderId] = useState(null);
  const [openTabs, setOpenTabs] = useState([COMPOSER_TAB]);
  const [tabEntrySnapshots, setTabEntrySnapshots] = useState({});
  const [activeTab, setActiveTab] = useState(COMPOSER_TAB);
  const [navTrail, setNavTrail] = useState([]);
  const [viewMode, setViewMode] = useState("grid");
  const [search, setSearch] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [startFrameAttachmentId, setStartFrameAttachmentId] = useState("");
  const [mode, setMode] = useState("image");

  useEffect(() => {
    if (mode === "image" || mode === "video" || mode === "script") {
      lastGenerationModeRef.current = mode;
    }
  }, [mode]);

  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageResolution, setImageResolution] = useState("2K");
  const [resolution, setResolution] = useState("1280x720");
  const [durationSeconds, setDurationSeconds] = useState("4");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [skipPromptEnhancement, setSkipPromptEnhancement] = useState(false);
  const [elementType, setElementType] = useState("character");
  const [selectedStylePresetId, setSelectedStylePresetId] = useState(null);
  const [composerStyleMode, setComposerStyleMode] = useState(() => {
    if (typeof window === "undefined") return "direct";
    return window.localStorage.getItem(COMPOSER_STYLE_MODE_KEY) === "styled" ? "styled" : "direct";
  });
  const [activeStyleSheetId, setActiveStyleSheetId] = useState(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_STYLE_SHEET_KEY) || null;
  });
  const [scriptType, setScriptType] = useState("production");
  const [referenceIntent, setReferenceIntent] = useState("auto");
  const [flowPending, setFlowPending] = useState(false);
  /** Optimistic prompt + loader bubbles keyed by threadId until Convex events catch up. */
  const [optimisticByThread, setOptimisticByThread] = useState({});
  const [status, setStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("general");
  const [mobileSection, setMobileSection] = useState("composer");
  const [, startMobileTransition] = useTransition();
  const [customCursorEnabled, setCustomCursorEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STUDIO_CUSTOM_CURSOR_KEY) !== "off";
  });
  const [contextMenu, setContextMenu] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [entitlementNow] = useState(() => Date.now());
  const [assetUrlExpiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);
  useStudioBackground();
  const deferredSearch = useDeferredValue(search);
  const fileInputRef = useRef(null);
  const composerUploadInputRef = useRef(null);
  const shellRef = useRef(null);
  const editorRef = useRef(null);
  const composerKeyRef = useRef(COMPOSER_TAB);
  const composerTabIndexRef = useRef(0);
  const createTabIndexRef = useRef(0);
  const lastChatTabRef = useRef(COMPOSER_TAB);
  const composerContextsRef = useRef({});
  const folderByIdRef = useRef(new Map());
  const currentEntriesCacheRef = useRef(new Map());
  const lastRootEntriesRef = useRef(null);
  const currentUser = useQuery(api.users.current, {});
  const hasCurrentUser = currentUser !== undefined;
  const billingAccount = useQuery(api.billing.currentAccount, hasCurrentUser ? {} : "skip");
  const pricing = useQuery(api.billing.getPricing, hasCurrentUser ? {} : "skip");
  const bankAccounts = useQuery(api.billing.listBankAccounts, hasCurrentUser ? {} : "skip");
  const subscriptionPlans = useQuery(api.billing.listSubscriptionPlans, hasCurrentUser ? {} : "skip");
  const payments = useQuery(api.billing.listMyPayments, hasCurrentUser ? {} : "skip");
  const notifications = useQuery(api.notifications.listMine, hasCurrentUser ? {} : "skip");
  const isAdminUser = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const adminPayments = useQuery(api.billing.adminListPayments, isAdminUser ? {} : "skip");
  const adminCustomers = useQuery(api.users.adminListCustomers, isAdminUser ? {} : "skip");
  const topFolders = useQuery(
    api.folders.listWithPeeks,
    hasCurrentUser ? { expiresUnix: assetUrlExpiresUnix } : "skip",
  );
  const isTrashView = activeFolderId === TRASH_FOLDER_ID;
  const selectedFolder = useQuery(
    api.folders.get,
    hasCurrentUser && activeFolderId && !isTrashView ? { folderId: activeFolderId } : "skip",
  );
  const activeFolder = isTrashView
    ? TRASH_ACTIVE_FOLDER
    : activeFolderId
      ? (selectedFolder ?? folderByIdRef.current.get(activeFolderId) ?? topFolders?.find((folder) => folder._id === activeFolderId) ?? null)
      : (topFolders?.[0] ?? null);

  useEffect(() => {
    if (!isMobile && mobileSection !== "composer") setMobileSection("composer");
  }, [isMobile, mobileSection]);
  const childFolders = useQuery(
    api.folders.listWithPeeks,
    hasCurrentUser && activeFolder && !isTrashView
      ? { parentId: activeFolder._id, expiresUnix: assetUrlExpiresUnix }
      : "skip",
  );
  const trashedFolders = useQuery(api.folders.listTrash, hasCurrentUser && isTrashView ? {} : "skip");
  const trashedAssets = useQuery(
    api.assets.listTrash,
    hasCurrentUser && isTrashView ? { expiresUnix: assetUrlExpiresUnix } : "skip",
  );
  const trashedDocuments = useQuery(api.documents.listTrash, hasCurrentUser && isTrashView ? {} : "skip");
  const trashedElementsRaw = useQuery(
    api.elements.list,
    hasCurrentUser && isTrashView ? { includeDeleted: true } : "skip",
  );
  const trashedElements = useMemo(
    () => (trashedElementsRaw ?? []).filter((element) => element.deletedAt),
    [trashedElementsRaw],
  );
  const assets = useQuery(
    api.assets.listByFolder,
    hasCurrentUser && activeFolder && !isTrashView
      ? { folderId: activeFolder._id, expiresUnix: assetUrlExpiresUnix }
      : "skip",
  );
  const documents = useQuery(
    api.documents.listByFolder,
    hasCurrentUser && activeFolder && !isTrashView ? { folderId: activeFolder._id } : "skip",
  );
  const videoEdits = useQuery(
    api.videoEdits.listByFolder,
    hasCurrentUser && activeFolder && !isTrashView ? { folderId: activeFolder._id } : "skip",
  );
  const trashedVideoEdits = useQuery(api.videoEdits.listTrash, hasCurrentUser && isTrashView ? {} : "skip");
  const elements = useQuery(api.elements.list, hasCurrentUser ? {} : "skip");
  const threads = useQuery(api.generation.listThreads, hasCurrentUser ? {} : "skip");
  const activeThreadId = activeTab.startsWith("thread:")
    ? activeTab.slice("thread:".length)
    : null;
  const events = useQuery(
    api.generation.listEvents,
    hasCurrentUser && activeThreadId && threads?.some((t) => t._id === activeThreadId)
      ? { threadId: activeThreadId, expiresUnix: assetUrlExpiresUnix }
      : "skip",
  );
  const chatEvents = useMemo(
    () => mergeOptimisticThreadEvents(events ?? [], optimisticByThread[activeThreadId] ?? []),
    [activeThreadId, events, optimisticByThread],
  );

  useEffect(() => {
    if (!activeThreadId || !events?.length) return;
    setOptimisticByThread((prev) => {
      const current = prev[activeThreadId];
      if (!current?.length) return prev;
      const next = reconcileOptimisticThreadEvents(current, events);
      if (next.length === current.length) return prev;
      if (!next.length) {
        const { [activeThreadId]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [activeThreadId]: next };
    });
  }, [activeThreadId, events]);

  const assetPreviewQueries = useMemo(() => {
    const queries = {};
    if (!hasCurrentUser) return queries;
    const previewAssets = isTrashView ? (trashedAssets ?? []) : (assets ?? []);
    for (const asset of previewAssets) {
      if (!asset?._id || !["image", "video"].includes(asset.kind)) continue;
      const hasThumb = Boolean(asset.signedThumbnailUrl);
      const hasRead = Boolean(asset.signedReadUrl);
      if (asset.kind === "image" && (hasThumb || hasRead)) continue;
      if (asset.kind === "video" && hasThumb) continue;
      if (asset.kind === "video" && hasRead) continue;
      queries[`asset:${asset._id}`] = {
        query: api.assets.signedReadUrl,
        args: { assetId: asset._id, expiresUnix: assetUrlExpiresUnix },
      };
    }
    return queries;
  }, [assetUrlExpiresUnix, assets, hasCurrentUser, isTrashView, trashedAssets]);
  const assetPreviewUrls = useQueries(assetPreviewQueries);
  const attachmentUrlQueries = useMemo(() => {
    const queries = {};
    if (!hasCurrentUser) return queries;
    for (const attachment of attachments) {
      if (
        attachment?.studioKind !== "asset" ||
        !attachment.studioId ||
        !["image", "video", "audio"].includes(attachment.kind) ||
        /^https?:\/\//i.test(attachment.mediaUrl ?? "")
      ) {
        // Not a direct media asset; elements resolve via their sheet below.
      } else {
        queries[`attachment:${attachment.id}`] = {
          query: api.assets.signedReadUrl,
          args: { assetId: attachment.studioId, expiresUnix: assetUrlExpiresUnix },
        };
      }
      if (
        attachment.studioKind === "element" &&
        attachment.sheetAsset?.studioId &&
        !/^https?:\/\//i.test(attachment.sheetAsset.mediaUrl ?? "")
      ) {
        queries[`element-sheet:${attachment.id}`] = {
          query: api.assets.signedReadUrl,
          args: { assetId: attachment.sheetAsset.studioId, expiresUnix: assetUrlExpiresUnix },
        };
      }
    }
    return queries;
  }, [assetUrlExpiresUnix, attachments, hasCurrentUser]);
  const attachmentMediaUrls = useQueries(attachmentUrlQueries);
  const assetsWithPreviewUrls = useMemo(
    () =>
      assets?.map((asset) => {
        const previewUrl = assetPreviewUrls[`asset:${asset._id}`];
        return {
          ...asset,
          signedReadUrl: asset.signedReadUrl ?? previewUrl,
          signedThumbnailUrl:
            asset.signedThumbnailUrl ??
            (asset.kind === "image" || asset.kind === "video" ? previewUrl : undefined),
        };
      }),
    [assetPreviewUrls, assets],
  );
  const elementLinkedAssetIds = useMemo(() => {
    const folderAssetIds = new Set((assets ?? []).map((asset) => asset._id));
    const linked = new Set();
    for (const element of elements ?? []) {
      for (const assetId of element.referenceAssetIds ?? element.sourceAssetIds ?? []) {
        if (!folderAssetIds.has(assetId)) {
          linked.add(assetId);
        }
      }
      if (element.sheetAssetId && !folderAssetIds.has(element.sheetAssetId)) {
        linked.add(element.sheetAssetId);
      }
    }
    return [...linked];
  }, [assets, elements]);
  const linkedElementAssets = useQuery(
    api.assets.listByIds,
    hasCurrentUser && elementLinkedAssetIds.length
      ? { assetIds: elementLinkedAssetIds, expiresUnix: assetUrlExpiresUnix }
      : "skip",
  );
  /** Folder assets plus element-linked assets in other folders (sheets, upload refs). */
  const assetLookupPool = useMemo(() => {
    const byId = new Map();
    for (const asset of assetsWithPreviewUrls ?? []) {
      byId.set(asset._id, asset);
    }
    for (const asset of linkedElementAssets ?? []) {
      if (!byId.has(asset._id)) {
        byId.set(asset._id, asset);
      }
    }
    return [...byId.values()];
  }, [assetsWithPreviewUrls, linkedElementAssets]);
  const trashedAssetsWithPreviewUrls = useMemo(
    () =>
      trashedAssets?.map((asset) => {
        const previewUrl = assetPreviewUrls[`asset:${asset._id}`];
        return {
          ...asset,
          signedReadUrl: asset.signedReadUrl ?? previewUrl,
          signedThumbnailUrl:
            asset.signedThumbnailUrl ??
            (asset.kind === "image" || asset.kind === "video" ? previewUrl : undefined),
        };
      }),
    [assetPreviewUrls, trashedAssets],
  );
  const presets = useQuery(
    api.stylePresets.listComposerPresets,
    hasCurrentUser
      ? {
          expiresUnix: assetUrlExpiresUnix,
        }
      : "skip",
  );
  const styleSheets = useQuery(api.elements.listStyleSheets, hasCurrentUser ? {} : "skip");
  const setActiveStyleSheetMutation = useMutation(api.users.setActiveStyleSheet);
  const scriptTypes = useQuery(api.composerCatalog.listScriptTypes, hasCurrentUser ? {} : "skip");
  const referenceIntents = useQuery(api.composerCatalog.listReferenceIntents, hasCurrentUser ? {} : "skip");
  const attachedScriptMarkdown = useMemo(
    () =>
      attachments
        .filter((attachment) => attachment.studioKind === "document" && attachment.description?.trim())
        .map((attachment) => attachment.description.trim()),
    [attachments],
  );
  const attachedElementSheets = useMemo(
    () =>
      attachments
        .filter((attachment) => attachment.studioKind === "element" && attachment.description?.trim())
        .map((attachment) => attachment.description.trim()),
    [attachments],
  );
  const attachedCreativeMarkdown = useMemo(
    () => [...attachedScriptMarkdown, ...attachedElementSheets],
    [attachedElementSheets, attachedScriptMarkdown],
  );
  const elementReferenceSummaries = useMemo(
    () =>
      attachments
        .filter((attachment) => attachment.studioKind === "element" && attachment.description?.trim())
        .map(
          (attachment) =>
            `${elementTypeLabel(attachment.elementType)} @${attachment.label}:\n${attachment.description.trim()}`,
        ),
    [attachments],
  );
  const videoGenerationInputs = useMemo(
    () =>
      splitVideoGenerationInputs(attachments, attachmentMediaUrls, startFrameAttachmentId),
    [attachmentMediaUrls, attachments, startFrameAttachmentId],
  );
  const generationReferences = useMemo(() => {
    if (mode === "video") {
      return videoGenerationInputs.referenceInputs;
    }
    return generationReferenceInputs(attachments, attachmentMediaUrls);
  }, [attachmentMediaUrls, attachments, mode, videoGenerationInputs.referenceInputs]);
  const videoStartFrameUrl = mode === "video" ? videoGenerationInputs.startFrameUrl : undefined;
  const hasVideoReferenceInput = generationReferences.some((reference) => reference.kind === "video");
  const composerReferenceFlags = useMemo(() => {
    const hasElementReference = attachments.some((attachment) => attachment.studioKind === "element");
    const hasRawImageReference = attachments.some(
      (attachment) =>
        attachment.studioKind === "asset" &&
        (attachment.kind === "image" || attachment.kind === "video"),
    );
    return { hasElementReference, hasRawImageReference };
  }, [attachments]);
  const directPreset = useMemo(() => {
    if (!presets?.length) return null;
    return presets.find((preset) => preset.slug === "unstyled") ?? presets[0];
  }, [presets]);
  const activeStyleSheet = useMemo(() => {
    if (!activeStyleSheetId || !styleSheets?.length) return null;
    return styleSheets.find((sheet) => sheet._id === activeStyleSheetId) ?? null;
  }, [activeStyleSheetId, styleSheets]);
  const selectedStylePreset = directPreset;
  const handleSelectDirect = useCallback(() => {
    if (directPreset) setSelectedStylePresetId(directPreset._id);
    setComposerStyleMode("direct");
    setSkipPromptEnhancement(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPOSER_STYLE_MODE_KEY, "direct");
    }
  }, [directPreset]);
  const handleSelectStyleSheet = useCallback((sheetId) => {
    setActiveStyleSheetId(sheetId);
    setComposerStyleMode("styled");
    setSkipPromptEnhancement(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_STYLE_SHEET_KEY, sheetId);
      window.localStorage.setItem(COMPOSER_STYLE_MODE_KEY, "styled");
    }
    void setActiveStyleSheetMutation({ styleSheetElementId: sheetId });
  }, [setActiveStyleSheetMutation]);
  useEffect(() => {
    if (directPreset && !selectedStylePresetId) {
      setSelectedStylePresetId(directPreset._id);
      if (composerStyleMode === "direct") setSkipPromptEnhancement(true);
    }
  }, [directPreset, selectedStylePresetId, composerStyleMode]);
  const hasNonVideoReferenceInput = generationReferences.some((reference) => reference.kind === "image" || reference.kind === "audio");
  const videoSupportsReferenceInput = mode === "video";
  const entitlement = useQuery(
    api.generation.canGenerate,
    hasCurrentUser
      ? {
          tier: mode === "video" ? "pro_video" : "image",
          now: entitlementNow,
          resolution:
            mode === "video"
              ? resolution
              : normalizeImageResolution(imageResolution),
          durationSeconds: mode === "video" ? Number(durationSeconds) : undefined,
          hasReferenceInput:
            mode === "video"
              ? generationReferences.length > 0 || Boolean(videoStartFrameUrl)
              : generationReferences.length > 0,
          hasVideoReferenceInput: mode === "video" ? hasVideoReferenceInput : undefined,
          hasNonVideoReferenceInput: mode === "video" ? hasNonVideoReferenceInput : undefined,
          audioEnabled: mode === "video" ? audioEnabled : undefined,
        }
      : "skip",
  );

  const composerContextKey = activeTab.startsWith("composer:") || activeTab.startsWith("thread:")
    ? activeTab
    : COMPOSER_TAB;

  useEffect(() => {
    if (activeTab.startsWith("composer:") || activeTab.startsWith("thread:")) {
      lastChatTabRef.current = activeTab;
    }
  }, [activeTab]);

  useEffect(() => {
    const prevKey = composerKeyRef.current;
    const editor = editorRef.current;
    composerContextsRef.current[prevKey] = {
      draft,
      attachments,
      editorHtml: editor?.innerHTML || composerContextsRef.current[prevKey]?.editorHtml,
      startFrameAttachmentId,
      mode,
      aspectRatio,
      imageResolution,
      resolution,
      durationSeconds,
      audioEnabled,
      skipPromptEnhancement,
      selectedStylePresetId,
      scriptType,
      referenceIntent,
    };
    const next = composerContextsRef.current[composerContextKey];
    setDraft(next?.draft ?? "");
    setAttachments(next?.attachments ?? []);
    setStartFrameAttachmentId(next?.startFrameAttachmentId ?? "");
    setMode(next?.mode ?? "image");
    setAspectRatio(next?.aspectRatio ?? "16:9");
    setImageResolution(next?.imageResolution ?? "2K");
    setResolution(next?.resolution ?? "1280x720");
    setDurationSeconds(next?.durationSeconds ?? "4");
    setAudioEnabled(next?.audioEnabled ?? false);
    setSkipPromptEnhancement(next?.skipPromptEnhancement ?? false);
    setSelectedStylePresetId(next?.selectedStylePresetId ?? null);
    setScriptType(next?.scriptType ?? "production");
    setReferenceIntent(next?.referenceIntent ?? "auto");
    composerKeyRef.current = composerContextKey;
    requestAnimationFrame(() => {
      const el = editorRef.current;
      const ctx = composerContextsRef.current[composerContextKey];
      if (!el || !ctx?.editorHtml) return;
      if (el.innerHTML !== ctx.editorHtml) {
        el.innerHTML = ctx.editorHtml;
      }
    });
  }, [composerContextKey, mobileSection]);

  useEffect(() => {
    void ensureDefaults().then((defaults) => {
      setActiveFolderId((current) => current ?? defaults.rootFolderId);
      setNavTrail((trail) =>
        trail.length ? trail : [{ id: defaults.rootFolderId, name: "Studio" }],
      );
    });
  }, [ensureDefaults]);

  useEffect(() => {
    if (!activeFolderId && topFolders?.[0]) {
      setActiveFolderId(topFolders[0]._id);
      setNavTrail([{ id: topFolders[0]._id, name: topFolders[0].name }]);
    }
  }, [activeFolderId, topFolders]);

  useEffect(() => {
    for (const folder of [...(topFolders ?? []), ...(childFolders ?? [])]) {
      folderByIdRef.current.set(folder._id, folder);
    }
  }, [topFolders, childFolders]);

  useEffect(() => {
    window.localStorage.setItem(STUDIO_CUSTOM_CURSOR_KEY, customCursorEnabled ? "on" : "off");
  }, [customCursorEnabled]);

  useEffect(() => {
    const updateCursor = () => applyStudioCursorTheme(shellRef.current);
    updateCursor();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === "data-theme" || mutation.attributeName === "style")) {
        updateCursor();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    window.addEventListener("mercuryos-theme-change", updateCursor);

    const CLICKABLE_SELECTOR =
      "button, a, [role=\"button\"], [role=\"tab\"], [role=\"menuitem\"], [role=\"option\"], [data-clickable], .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .cursor-unified-tab, .studio-inline-tag, .cursor-tab-close, .cursor-clickable, [class*=\"cursor-tab\"], [class*=\"cursor-tree\"]";
    const root = document.documentElement;
    const handlePointerOver = (event) => {
      const target = event.target;
      if (target && target.closest && target.closest(CLICKABLE_SELECTOR)) {
        root.classList.add("is-cursor-interactive");
      }
    };
    const handlePointerOut = (event) => {
      const related = event.relatedTarget;
      if (!related || !(related.closest && related.closest(CLICKABLE_SELECTOR))) {
        root.classList.remove("is-cursor-interactive");
      }
    };
    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("mercuryos-theme-change", updateCursor);
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
    };
  }, []);

  const folderContentLoading = isTrashView
    ? Boolean(
        trashedFolders === undefined ||
          trashedAssets === undefined ||
          trashedDocuments === undefined ||
          trashedVideoEdits === undefined ||
          trashedElementsRaw === undefined,
      )
    : Boolean(
        activeFolder &&
          (childFolders === undefined ||
            assetsWithPreviewUrls === undefined ||
            documents === undefined ||
            videoEdits === undefined ||
            elements === undefined),
      );

  const currentEntries = useMemo(() => {
    if (isTrashView) {
      return buildFlatEntries({
        folder: activeFolder,
        parent:
          navTrail.length > 1
            ? {
                type: "parent",
                name: "Back",
                path: `/Studio/${navTrail[navTrail.length - 2].name}`,
                studioId: navTrail[navTrail.length - 2].id,
              }
            : null,
        loading: folderContentLoading,
        folders: trashedFolders,
        assets: trashedAssetsWithPreviewUrls,
        documents: trashedDocuments,
        videoEdits: trashedVideoEdits,
        elements: trashedElements,
      });
    }

    const entries = buildFlatEntries({
      folder: activeFolder,
      parent:
        navTrail.length > 1
          ? {
              type: "parent",
              name: "Back",
              path: `/Studio/${navTrail[navTrail.length - 2].name}`,
              studioId: navTrail[navTrail.length - 2].id,
            }
          : null,
      loading: !activeFolder || folderContentLoading,
      folders: childFolders,
      assets: assetsWithPreviewUrls,
      documents,
      videoEdits,
      elements: elements?.filter((element) => element.folderId === activeFolder?._id),
      assetLookupPool,
    });

    const rootFolderId = navTrail[0]?.id;
    if (rootFolderId && activeFolderId === rootFolderId) {
      return {
        ...entries,
        entries: [TRASH_FOLDER_ENTRY, ...(entries.entries ?? [])],
      };
    }
    return entries;
  }, [
    activeFolderId,
    navTrail,
    childFolders,
    assetsWithPreviewUrls,
    assetLookupPool,
    documents,
    elements,
    folderContentLoading,
    isTrashView,
    trashedFolders,
    trashedAssetsWithPreviewUrls,
    trashedDocuments,
    trashedVideoEdits,
    trashedElements,
    videoEdits,
  ]);

  const rootEntries = useMemo(
    () => ({
      loading: !topFolders,
      entries: (topFolders ?? []).map(folderToEntry),
    }),
    [topFolders],
  );

  useEffect(() => {
    if (!currentEntries.loading && !currentEntries.error) {
      currentEntriesCacheRef.current.set(activeFolder?._id ?? "root", currentEntries);
    }
  }, [activeFolder?._id, currentEntries]);

  useEffect(() => {
    if (!rootEntries.loading && !rootEntries.error) {
      lastRootEntriesRef.current = rootEntries;
    }
  }, [rootEntries]);

  const displayCurrentEntries = currentEntries.loading
    ? (currentEntriesCacheRef.current.get(activeFolder?._id ?? "root") ?? currentEntries)
    : currentEntries;
  const displayRootEntries = rootEntries.loading
    ? (lastRootEntriesRef.current ?? rootEntries)
    : rootEntries;

  // Warm LQIP + thumbs as soon as Convex returns — browser cache before paint.
  useEffect(() => {
    const entries = displayCurrentEntries.entries ?? [];
    for (const entry of entries) {
      warmThumbUrl(entry.thumbnailLqipUrl);
      warmThumbUrl(entry.thumbnailUrl);
      for (const peek of entry.peekItems ?? []) {
        warmThumbUrl(peek.thumbnailLqipUrl);
        warmThumbUrl(peek.thumbnailUrl);
      }
    }
  }, [displayCurrentEntries.entries]);

  const visibleFolderIds = useMemo(
    () =>
      (displayCurrentEntries.entries ?? [])
        .filter((entry) => entry.type === "dir" && entry.studioId && entry.studioId !== activeFolder?._id)
        .slice(0, 8)
        .map((entry) => entry.studioId),
    [activeFolder?._id, displayCurrentEntries.entries],
  );
  const folderPrefetchQueries = useMemo(() => {
    const queries = {};
    if (!hasCurrentUser) return queries;
    for (const folderId of visibleFolderIds) {
      queries[`folders:${folderId}`] = {
        query: api.folders.list,
        args: { parentId: folderId },
      };
      // Prefetch signed thumbs so opening a folder feels instant.
      queries[`assets:${folderId}`] = {
        query: api.assets.listByFolder,
        args: { folderId, expiresUnix: assetUrlExpiresUnix },
      };
      queries[`foldersPeek:${folderId}`] = {
        query: api.folders.listWithPeeks,
        args: { parentId: folderId, expiresUnix: assetUrlExpiresUnix },
      };
      queries[`documents:${folderId}`] = {
        query: api.documents.listByFolder,
        args: { folderId },
      };
      queries[`videoEdits:${folderId}`] = {
        query: api.videoEdits.listByFolder,
        args: { folderId },
      };
    }
    return queries;
  }, [assetUrlExpiresUnix, hasCurrentUser, visibleFolderIds]);
  useQueries(folderPrefetchQueries);

  const tabs = useMemo(() => {
    const descriptors = openTabs.map((key) =>
      tabDescriptor({
        key,
        threads,
        assets: assetLookupPool.length ? assetLookupPool : (assetsWithPreviewUrls ?? assets),
        documents,
        videoEdits,
        elements,
        snapshots: tabEntrySnapshots,
      }),
    );
    return descriptors.filter(Boolean);
  }, [openTabs, threads, assetLookupPool, assetsWithPreviewUrls, assets, documents, videoEdits, elements, tabEntrySnapshots]);

  const activeEntry = useMemo(
    () =>
      findEntryByTab(activeTab, {
        threads,
        assets: assetLookupPool.length ? assetLookupPool : (assetsWithPreviewUrls ?? assets),
        documents,
        videoEdits,
        elements,
        snapshots: tabEntrySnapshots,
      }),
    [activeTab, threads, assetLookupPool, assetsWithPreviewUrls, assets, documents, videoEdits, elements, tabEntrySnapshots],
  );
  const activeAdminTab = activeTab.startsWith("admin:") ? activeTab.slice("admin:".length) : null;
  const activeBillingTab = activeTab.startsWith("billing:") ? activeTab.slice("billing:".length) : null;

  const pathToEntry = useMemo(() => {
    const map = new Map();
    for (const entry of [...(displayRootEntries.entries ?? []), ...(displayCurrentEntries.entries ?? [])]) {
      map.set(entry.path, entry);
    }
    return map;
  }, [displayRootEntries, displayCurrentEntries]);

  const searchState = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return { entries: [], truncated: false };
    const entries = [];
    let truncated = false;
    for (const entry of displayCurrentEntries.entries ?? []) {
      if (!String(entry.name ?? "").toLowerCase().includes(q)) continue;
      if (entries.length >= 80) {
        truncated = true;
        break;
      }
      entries.push(entry);
    }
    return { entries, truncated };
  }, [displayCurrentEntries, deferredSearch]);

  const breadcrumbPath = useMemo(
    () => navTrail.slice(1).map((crumb) => crumb.name).join("/"),
    [navTrail],
  );

  function replaceTabKey(fromKey, toKey) {
    if (fromKey === toKey) return;
    setOpenTabs((tabs) => {
      if (tabs.includes(toKey)) {
        return tabs.filter((tab) => tab !== fromKey);
      }
      return tabs.map((tab) => (tab === fromKey ? toKey : tab));
    });
    setActiveTab((tab) => (tab === fromKey ? toKey : tab));
    setTabEntrySnapshots((snapshots) => {
      const next = { ...snapshots };
      if (next[fromKey]) {
        next[toKey] = next[fromKey];
        delete next[fromKey];
      }
      return next;
    });
  }

  function openEditTab({ assetId, folderId, projectId, assetName }) {
    if (projectId) {
      openTab(`videoEdit:${projectId}`);
      return;
    }
    openTab(`edit:asset:${assetId}:${folderId}`);
  }

  async function createNewVideoEdit() {
    if (!activeFolder || isTrashView) return;
    const result = await createVideoEdit({
      folderId: activeFolder._id,
      name: "Untitled edit",
    });
    const entry = videoEditToEntry({
      _id: result.projectId,
      name: "Untitled edit",
      folderId: activeFolder._id,
      updatedAt: Date.now(),
    });
    setTabEntrySnapshots((snapshots) => ({
      ...snapshots,
      [`videoEdit:${result.projectId}`]: entry,
    }));
    openTab(`videoEdit:${result.projectId}`);
  }

  function handleVideoEditProjectSaved(fromTabKey, projectId, name) {
    const toKey = `videoEdit:${projectId}`;
    if (fromTabKey && fromTabKey !== toKey) {
      replaceTabKey(fromTabKey, toKey);
    }
    setTabEntrySnapshots((snapshots) => ({
      ...snapshots,
      [toKey]: videoEditToEntry({
        _id: projectId,
        name,
        folderId: activeFolder?._id,
        updatedAt: Date.now(),
      }),
    }));
  }

  function openTab(key) {
    setOpenTabs((tabs) => (tabs.includes(key) ? tabs : [...tabs, key]));
    setActiveTab(key);
  }

  function openNewComposerTab() {
    composerTabIndexRef.current += 1;
    openTab(`composer:${composerTabIndexRef.current}`);
  }

  function openHistoryThread(threadId) {
    openTab(`thread:${threadId}`);
    setActiveTab(`thread:${threadId}`);
    setHistoryOpen(false);
    if (isMobile) setMobileSection("composer");
  }

  function resolveAttachTargetTab() {
    if (activeTab.startsWith("composer:") || activeTab.startsWith("thread:")) {
      return activeTab;
    }
    return lastChatTabRef.current || COMPOSER_TAB;
  }

  function openCreateTab(kind, elementType = "") {
    createTabIndexRef.current += 1;
    openTab(`create:${kind}${elementType ? `:${elementType}` : ""}:${createTabIndexRef.current}`);
  }

  function runCreateAction(action) {
    if (isTrashView) return;
    if (action === "upload") {
      fileInputRef.current?.click();
      return;
    }
    if (action === "new-folder") openCreateTab("folder");
    if (action === "new-file") openCreateTab("script");
    if (action === "new-video-edit") void createNewVideoEdit();
    if (action === "new-element") openElementCreateInComposer();
  }

  function openElementCreateInComposer() {
    if (isMobile) setMobileSection("composer");
    setActiveTab(COMPOSER_TAB);
    setMode("element");
  }

  function openSettingsTab(section = "general") {
    if (settingsOpen && settingsSection === section && !isMobile) {
      setSettingsOpen(false);
      return;
    }
    setSettingsSection(section);
    setOpenTabs((tabs) => tabs.filter((tab) => !tab.startsWith("settings:")));
    if (activeTab.startsWith("settings:")) {
      setActiveTab(COMPOSER_TAB);
    }
    if (isMobile) setMobileSection("settings");
    setSettingsOpen(true);
  }

  const settingsPanelProps = {
    settingsSection,
    currentUser,
    payments,
    notifications,
    billingAccount,
    pricing,
    bankAccounts,
    subscriptionPlans,
    onClose: () => {
      setSettingsOpen(false);
      if (isMobile) setMobileSection("composer");
    },
    onSaveAccount: (values) => void updateAccountDetails(values).then(() => setStatus("Account updated.")),
    customCursorEnabled,
    onCustomCursorChange: setCustomCursorEnabled,
  };

  function openCreditsPane() {
    const balance = billingAccount?.creditBalance ?? entitlement?.creditBalance ?? 0;
    openSettingsTab(balance > 0 ? "billing" : "top-up");
  }

  function openAdminTab(tab) {
    if (!isAdminUser) return;
    setSettingsOpen(false);
    if (isMobile) setMobileSection("composer");
    openTab(`admin:${tab}`);
  }

  function openMobileSection(section) {
    startMobileTransition(() => {
      setMobileSection(section);
      if (section === "composer") {
        setSettingsOpen(false);
        if (!activeTab.startsWith("composer:") && !activeTab.startsWith("thread:")) {
          setActiveTab(lastChatTabRef.current || COMPOSER_TAB);
        }
        return;
      }
      if (section === "files") {
        setSettingsOpen(false);
        return;
      }
      if (section === "settings") {
        setSettingsOpen(true);
      }
    });
  }

  const handleTabSelect = useCallback((key) => {
    startMobileTransition(() => setActiveTab(key));
  }, []);

  function closeTab(key) {
    if (key.startsWith("composer:")) {
      delete composerContextsRef.current[key];
    }
    setOpenTabs((tabs) => {
      const remaining = tabs.filter((tab) => tab !== key);
      const next = remaining.length ? remaining : [COMPOSER_TAB];
      if (activeTab === key) {
        setActiveTab(next[next.length - 1]);
      }
      return next;
    });
  }

  function handleEntryOpen(entry) {
    if (entry.studioKind === "trash") {
      setActiveFolderId(TRASH_FOLDER_ID);
      setNavTrail((trail) => {
        const existing = trail.findIndex((crumb) => crumb.id === TRASH_FOLDER_ID);
        if (existing >= 0) return trail.slice(0, existing + 1);
        return [...trail, { id: TRASH_FOLDER_ID, name: "Trash" }];
      });
      return;
    }
    if (entry.type === "dir") {
      if (isTrashView) return;
      setActiveFolderId(entry.studioId);
      setNavTrail((trail) => {
        const existing = trail.findIndex((crumb) => crumb.id === entry.studioId);
        if (existing >= 0) return trail.slice(0, existing + 1);
        return [...trail, { id: entry.studioId, name: entry.name }];
      });
      return;
    }
    const key = `${entry.studioKind}:${entry.studioId}`;
    setTabEntrySnapshots((snapshots) => ({ ...snapshots, [key]: entry }));
    openTab(key);
  }

  function handleOpenPath(path) {
    const entry = pathToEntry.get(path);
    if (entry) handleEntryOpen(entry);
  }

  function handleBreadcrumbNavigate(path) {
    if (!path) {
      const root = navTrail[0] ?? (topFolders?.[0] ? { id: topFolders[0]._id, name: topFolders[0].name } : null);
      if (!root) return;
      setActiveFolderId(root.id);
      setNavTrail([root]);
      return;
    }
    const parts = path.split("/").filter(Boolean);
    const index = parts.length - 1;
    const target = navTrail[index + 1];
    if (!target) return;
    const nextTrail = navTrail.slice(0, index + 2);
    setNavTrail(nextTrail);
    setActiveFolderId(target.id);
  }

  function attachEntry(entry, insertRange = null) {
    if (!entry || entry.type === "parent") return;
    const fullEntry = pathToEntry.get(entry.path) ?? entry;
    const attachment = entryToAttachment(fullEntry);
    const targetTab = resolveAttachTargetTab();
    const existing =
      composerContextKey === targetTab
        ? attachments
        : (composerContextsRef.current[targetTab]?.attachments ?? []);
    const nextAttachments = existing.some((item) => item.id === attachment.id)
      ? existing
      : [...existing, attachment];
    const stayOnFiles = isMobile && mobileSection === "files";

    composerContextsRef.current[targetTab] = {
      ...(composerContextsRef.current[targetTab] ?? {}),
      attachments: nextAttachments,
    };

    const liveEditor =
      composerContextKey === targetTab && editorRef.current ? editorRef.current : null;
    if (liveEditor) {
      insertComposerAttachmentToken(liveEditor, attachment, insertRange);
      composerContextsRef.current[targetTab] = {
        ...composerContextsRef.current[targetTab],
        editorHtml: liveEditor.innerHTML,
        draft: readComposerEditorText(liveEditor),
      };
      if (composerContextKey === targetTab) {
        setAttachments(nextAttachments);
        setDraft(composerContextsRef.current[targetTab].draft ?? "");
      }
    } else {
      appendAttachmentChipToComposerContext(composerContextsRef, targetTab, attachment);
      if (composerContextKey === targetTab) {
        setAttachments(nextAttachments);
        setDraft(composerContextsRef.current[targetTab]?.draft ?? "");
      }
    }

    if (stayOnFiles) {
      return;
    }

    if (composerContextKey !== targetTab) {
      setActiveTab(targetTab);
    }
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
    });
  }

  async function referenceInputsForAssetIds(assetMetas = []) {
    const expiresUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
    const inputs = [];
    for (const asset of assetMetas) {
      if (!asset?.assetId || !["image", "video", "audio"].includes(asset.kind)) continue;
      const url = await convex.query(api.assets.signedReadUrl, {
        assetId: asset.assetId,
        expiresUnix,
      });
      if (url) inputs.push({ kind: asset.kind, url, mimeType: asset.mimeType });
    }
    return inputs;
  }

  async function createAndAttachElement(values) {
    if (!activeFolder || !values?.name?.trim()) {
      throw new Error("Pick a folder and name your element first.");
    }
    const uploadedAssets = values.uploadedAssets ?? [];
    const referenceAssetIds = values.sourceAssetIds?.length
      ? values.sourceAssetIds
      : uploadedAssets.map((asset) => asset.assetId).filter(Boolean);
    const id = await createElement({
      folderId: activeFolder._id,
      type: values.elementType,
      name: values.name.trim(),
      referenceAssetIds,
    });
    const referenceInputs =
      values.referenceInputs?.length
        ? values.referenceInputs
        : await referenceInputsForAssetIds(uploadedAssets);
    let description;
    let sheetAssetId;
    if (values.generateSheet) {
      const result = await generateElementSheet({
        elementId: id,
        referenceInputs,
        existingNotes: referenceInputs.length ? undefined : values.name.trim(),
        stylePresetSlug: values.stylePresetSlug ?? selectedStylePreset?.slug ?? "toon-prime",
      });
      description = result.description;
      sheetAssetId = result.sheetAssetId;
    }
    const elementRecord = {
      _id: id,
      name: values.name.trim(),
      type: values.elementType,
      description,
      referenceAssetIds,
      sheetAssetId,
      updatedAt: Date.now(),
    };
    const referenceAssetEntries = referenceAssetIds
      .map((assetId) => {
        const uploaded = uploadedAssets.find((asset) => asset.assetId === assetId);
        if (uploaded) return uploadedElementAssetToEntry(uploaded);
        const asset = assetLookupPool?.find((item) => item._id === assetId);
        return asset ? assetToEntry(asset) : null;
      })
      .filter(Boolean);
    const entry = elementToEntry(elementRecord, assetLookupPool ?? []);
    entry.referenceAssets = referenceAssetEntries;
    if (sheetAssetId) {
      const sheetAsset = assetLookupPool?.find((item) => item._id === sheetAssetId);
      entry.sheetAsset = sheetAsset ? assetToEntry(sheetAsset) : null;
      entry.buildStatus = "built";
    }
    attachEntry(entry);
    setStatus(`@${values.name.trim()} attached to your request.`);
    return id;
  }

  async function createStudioItem(values) {
    if (!activeFolder || !values?.name?.trim()) return;
    if (values.kind === "folder") {
      const id = await createFolder({
        parentId: activeFolder._id,
        name: values.name.trim(),
        icon: "Folder",
        color: "#22c55e",
      });
      setActiveFolderId(id);
      setNavTrail((trail) => [...trail, { id, name: values.name.trim() }]);
      return;
    }
    if (values.kind === "script") {
      const id = await createDocument({
        folderId: activeFolder._id,
        title: values.name.trim(),
        contentMarkdown: "",
      });
      openTab(`document:${id}`);
      return;
    }
  }

  async function buildElementSheet(entry, sourceAssets, existingNotes, stylePresetSlug) {
    if (!entry?.studioId) return;
    const referenceInputs = elementSheetReferenceInputs(sourceAssets);
    const result = await generateElementSheet({
      elementId: entry.studioId,
      referenceInputs,
      existingNotes,
      stylePresetSlug: stylePresetSlug ?? "unstyled",
    });
    setTabEntrySnapshots((snapshots) => ({
      ...snapshots,
      [`element:${entry.studioId}`]: {
        ...entry,
        description: result.description,
        sheetAssetId: result.sheetAssetId,
        buildStatus: result.sheetAssetId ? "built" : entry.buildStatus,
      },
    }));
    return result;
  }

  async function renameEntry(entry) {
    if (!entry) return;
    const nextName = window.prompt(
      "Rename",
      entry.name.replace(/^@/, "").replace(/\.edit$/i, "").replace(/\.md$/i, ""),
    );
    if (!nextName?.trim()) return;
    if (entry.studioKind === "folder") {
      await updateFolder({ folderId: entry.studioId, name: nextName.trim() });
    } else if (entry.studioKind === "document") {
      await updateDocument({ documentId: entry.studioId, title: nextName.trim().replace(/\.md$/i, "") });
    } else if (entry.studioKind === "asset") {
      await updateAsset({ assetId: entry.studioId, name: nextName.trim() });
    } else if (entry.studioKind === "videoEdit") {
      await updateVideoEdit({
        projectId: entry.studioId,
        name: nextName.trim().replace(/\.edit$/i, ""),
      });
    }
  }

  async function updateElementDetails(entry, values) {
    if (!entry?.studioId || !values?.name?.trim()) return;
    await updateElement({
      elementId: entry.studioId,
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      styleRules: values.styleRules?.trim() || undefined,
      renderMode: values.renderMode,
      referenceAssetIds: values.referenceAssetIds ?? values.sourceAssetIds ?? [],
    });
    setTabEntrySnapshots((snapshots) => ({
      ...snapshots,
      [`element:${entry.studioId}`]: {
        ...entry,
        name: `@${values.name.trim()}`,
        description: values.description?.trim() || undefined,
        styleRules: values.styleRules?.trim() || undefined,
        renderMode: values.renderMode ?? entry.renderMode,
        referenceAssetIds: values.referenceAssetIds ?? values.sourceAssetIds ?? [],
        referenceAssets: values.referenceAssets ?? values.sourceAssets ?? entry.referenceAssets,
        sheetAsset: values.sheetAsset ?? entry.sheetAsset,
        buildStatus: values.sheetAsset || entry.sheetAsset ? "built" : "unbuilt",
      },
    }));
  }

  async function duplicateEntry(entry) {
    if (!entry || !activeFolder) return;
    if (entry.studioKind === "asset") {
      const id = await duplicateAsset({ assetId: entry.studioId, targetFolderId: activeFolder._id });
      openTab(`asset:${id}`);
    } else if (entry.studioKind === "document") {
      const doc = documents?.find((item) => item._id === entry.studioId);
      const id = await createDocument({
        folderId: activeFolder._id,
        title: `Copy of ${doc?.title ?? entry.name.replace(/\.md$/i, "")}`,
        contentMarkdown: doc?.contentMarkdown ?? "",
      });
      openTab(`document:${id}`);
    }
  }

  async function trashEntry(entry) {
    if (!entry || isTrashView || entry.studioKind === "trash") return;
    const ok = window.confirm(`Move "${entry.name}" to trash?`);
    if (!ok) return;
    if (entry.studioKind === "folder") {
      await trashFolder({ folderId: entry.studioId });
    } else if (entry.studioKind === "document") {
      await trashDocument({ documentId: entry.studioId });
    } else if (entry.studioKind === "asset") {
      await trashAsset({ assetId: entry.studioId });
    } else if (entry.studioKind === "element") {
      await trashElement({ elementId: entry.studioId });
    } else if (entry.studioKind === "videoEdit") {
      await trashVideoEdit({ projectId: entry.studioId });
    }
    closeTab(`${entry.studioKind}:${entry.studioId}`);
  }

  async function restoreEntry(entry) {
    if (!entry || entry.studioKind === "trash") return;
    const ok = window.confirm(`Restore "${entry.name}"?`);
    if (!ok) return;
    if (entry.studioKind === "folder") {
      await restoreFolder({ folderId: entry.studioId });
    } else if (entry.studioKind === "document") {
      await restoreDocument({ documentId: entry.studioId });
    } else if (entry.studioKind === "asset") {
      await restoreAsset({ assetId: entry.studioId });
    } else if (entry.studioKind === "element") {
      await restoreElement({ elementId: entry.studioId });
    } else if (entry.studioKind === "videoEdit") {
      await restoreVideoEdit({ projectId: entry.studioId });
    }
  }

  function handleEntryDrop(event, targetEntry) {
    if (isTrashView || targetEntry?.studioKind === "trash") return;
    if (!targetEntry?.studioId) return;
    const raw = event.dataTransfer?.getData(EXPLORER_DND_TYPE);
    if (!raw) return;
    let source;
    try { source = JSON.parse(raw); } catch { return; }
    if (!source?.studioKind || !source?.studioId) return;
    if (source.studioId === targetEntry.studioId) return;
    if (targetEntry.type === "dir" || targetEntry.studioKind === "folder") {
      void moveEntryToFolder(source, targetEntry.studioId);
    }
  }

  function handleBreadcrumbDrop(event, crumbPath, crumbIndex) {
    const raw = event.dataTransfer?.getData(EXPLORER_DND_TYPE);
    if (!raw) return;
    let source;
    try { source = JSON.parse(raw); } catch { return; }
    if (!source?.studioKind || !source?.studioId) return;
    let targetId;
    if (crumbIndex === 0) {
      targetId = navTrail[0]?.id;
    } else {
      const target = navTrail[crumbIndex];
      if (!target) return;
      targetId = target.id;
    }
    if (!targetId || source.studioId === targetId) return;
    void moveEntryToFolder(source, targetId);
  }

  async function moveEntryToFolder(source, targetFolderId) {
    try {
      if (source.studioKind === "folder") {
        await updateFolder({ folderId: source.studioId, parentId: targetFolderId });
      } else if (source.studioKind === "asset") {
        await updateAsset({ assetId: source.studioId, folderId: targetFolderId });
      } else if (source.studioKind === "document") {
        await updateDocument({ documentId: source.studioId, folderId: targetFolderId });
      } else if (source.studioKind === "element") {
        await updateElement({ elementId: source.studioId, folderId: targetFolderId });
      } else if (source.studioKind === "videoEdit") {
        await updateVideoEdit({ projectId: source.studioId, folderId: targetFolderId });
      }
    } catch (err) {
      console.error("Failed to move entry:", err);
    }
  }

  async function uploadFiles(files) {
    if (!activeFolder) return;
    for (const file of Array.from(files ?? [])) {
      const reserved = await reserveUpload({
        folderId: activeFolder._id,
        name: file.name,
        kind: kindFromMime(file.type),
        mimeType: file.type || "application/octet-stream",
      });
      const res = await fetch(reserved.putUrl, {
        method: "PUT",
        headers: {
          AccessKey: reserved.storageAccessKey,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      await completeUpload({ assetId: reserved.assetId, byteSize: file.size });
      openTab(`asset:${reserved.assetId}`);
    }
  }

  async function uploadElementFiles(files, folderId = activeFolder?._id) {
    if (!folderId) return [];
    const uploaded = [];
    for (const file of Array.from(files ?? [])) {
      const kind = kindFromMime(file.type);
      const reserved = await reserveUpload({
        folderId,
        name: file.name,
        kind,
        mimeType: file.type || "application/octet-stream",
      });
      const res = await fetch(reserved.putUrl, {
        method: "PUT",
        headers: {
          AccessKey: reserved.storageAccessKey,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      await completeUpload({ assetId: reserved.assetId, byteSize: file.size });
      uploaded.push({
        assetId: reserved.assetId,
        name: file.name,
        kind,
        previewUrl:
          file.type.startsWith("image/") || file.type.startsWith("video/")
            ? URL.createObjectURL(file)
            : "",
      });
    }
    return uploaded;
  }

  async function uploadComposerFiles(files) {
    if (!activeFolder) return;
    setStatus("");
    try {
      for (const file of Array.from(files ?? [])) {
        const reserved = await reserveUpload({
          folderId: activeFolder._id,
          name: file.name,
          kind: kindFromMime(file.type),
          mimeType: file.type || "application/octet-stream",
        });
        const res = await fetch(reserved.putUrl, {
          method: "PUT",
          headers: {
            AccessKey: reserved.storageAccessKey,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        await completeUpload({ assetId: reserved.assetId, byteSize: file.size });
        attachComposerUpload({
          id: `asset:${reserved.assetId}`,
          kind: kindFromMime(file.type),
          label: file.name,
          path: `/Studio/assets/${reserved.assetId}`,
          filename: file.name,
          studioKind: "asset",
          studioId: reserved.assetId,
          thumbnailUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  function attachComposerUpload(attachment) {
    setAttachments((items) =>
      items.some((item) => item.id === attachment.id) ? items : [...items, attachment],
    );
    if (
      mode === "video" &&
      attachment.kind === "image" &&
      attachment.studioKind === "asset" &&
      !startFrameAttachmentId
    ) {
      setStartFrameAttachmentId(attachment.id);
    }
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      insertComposerAttachmentToken(editor, attachment);
      setDraft(readComposerEditorText(editor));
    });
  }

  async function handleSubmit() {
    if (!activeFolder || !draft.trim()) return;
    setStatus("");
    setFlowPending(true);
    try {
      if (mode === "element") {
        const mediaAttachments = attachments.filter(
          (attachment) =>
            attachment.studioKind === "asset" &&
            (attachment.kind === "image" ||
              attachment.kind === "video" ||
              attachment.kind === "audio") &&
            Boolean(attachment.studioId),
        );
        const uploadedAssets = mediaAttachments.map((attachment) => ({
          assetId: attachment.studioId,
          name: attachment.label ?? attachment.filename ?? "reference",
          kind: attachment.kind,
          previewUrl: attachment.mediaUrl ?? attachment.thumbnailUrl,
        }));
        const sheetCost = elementSheetCreditCost({
          elementType,
          imageReferenceCount: mediaAttachments.filter((attachment) => attachment.kind === "image").length,
          videoReferenceCount: mediaAttachments.filter((attachment) => attachment.kind === "video").length,
          audioReferenceCount: mediaAttachments.filter((attachment) => attachment.kind === "audio").length,
        });
        if (entitlement && entitlement.creditBalance < sheetCost) {
          openSettingsTab("top-up");
          throw new Error(
            entitlement.reason ?? `You need ${sheetCost} credits to build this ${elementSheetLabel(elementType)}.`,
          );
        }
        await createAndAttachElement({
          elementType,
          name: draft.trim(),
          sourceAssetIds: uploadedAssets.map((asset) => asset.assetId),
          uploadedAssets,
          generateSheet: true,
          stylePresetSlug: values.stylePresetSlug ?? "unstyled",
        });
        setDraft("");
        setAttachments([]);
        setMode(lastGenerationModeRef.current ?? "image");
        return;
      }
      if (mode === "script") {
        if (!directPreset) {
          throw new Error("Style options are still loading. Try again in a moment.");
        }
        if (composerStyleMode === "styled") {
          if (!activeStyleSheetId || !activeStyleSheet) {
            throw new Error("Create and select a Style Sheet before styled script generation, or switch to Direct.");
          }
          if (!activeStyleSheet.sheetAssetId && !activeStyleSheet.styleRules?.trim()) {
            throw new Error("Build your Style Sheet before using it for script generation.");
          }
        }
        const result = await generateScript({
          folderId: activeFolder._id,
          stylePresetId: directPreset._id,
          styleSheetElementId: composerStyleMode === "styled" ? activeStyleSheetId : undefined,
          userPrompt: buildPromptWithAttachments(draft, attachments),
          attachedScriptMarkdown: attachedScriptMarkdown.length ? attachedScriptMarkdown : undefined,
          referenceInputs: generationReferences,
          skipPromptEnhancement: composerStyleMode === "direct" ? true : skipPromptEnhancement,
          scriptType,
          referenceIntent,
          hasRawImageReference: composerReferenceFlags.hasRawImageReference,
          hasElementReference: composerReferenceFlags.hasElementReference,
        });
        openTab(`document:${result.documentId}`);
        setDraft("");
        setAttachments([]);
        return;
      }

      if (presets === undefined) {
        throw new Error("Style options are still loading. Try again in a moment.");
      }
      const preset = directPreset;
      if (!preset) {
        throw new Error("Direct generation preset is not ready yet.");
      }
      if (composerStyleMode === "styled") {
        if (!activeStyleSheetId || !activeStyleSheet) {
          throw new Error("Create and select a Style Sheet before styled generation, or switch to Direct.");
        }
        if (!activeStyleSheet.sheetAssetId && !activeStyleSheet.styleRules?.trim()) {
          throw new Error("Build your Style Sheet before using it for generation.");
        }
      }
      if (entitlement && !entitlement.canGenerate) {
        openSettingsTab("top-up");
        throw new Error(entitlement.reason ?? "Content generation is not available right now.");
      }
      // Stay in the open chat when generating again; only mint a thread from a blank composer tab.
      const reuseThreadId =
        activeThreadId && threads?.some((thread) => thread._id === activeThreadId)
          ? activeThreadId
          : null;
      const userPrompt = buildPromptWithAttachments(draft, attachments);
      const genMode = mode;

      let threadId = reuseThreadId;
      if (!threadId) {
        threadId = await createThread({
          folderId: activeFolder._id,
          title: userPrompt.trim().slice(0, 64),
        });
        const composerTab = activeTab;
        if (composerTab.startsWith("composer:")) {
          delete composerContextsRef.current[composerTab];
          setOpenTabs((tabs) => tabs.map((tab) => (tab === composerTab ? `thread:${threadId}` : tab)));
          setActiveTab(`thread:${threadId}`);
        } else {
          openTab(`thread:${threadId}`);
        }
      }

      // Show sent prompt + loader immediately; Convex events replace these when they land.
      const optimistic = createOptimisticGenerationEvents({
        prompt: userPrompt,
        mode: genMode,
      });
      setOptimisticByThread((prev) => ({
        ...prev,
        [threadId]: [...(prev[threadId] ?? []), ...optimistic.events],
      }));
      setDraft("");
      setAttachments([]);
      setStartFrameAttachmentId("");
      if (editorRef.current) editorRef.current.replaceChildren();
      const chatKey = `thread:${threadId}`;
      composerContextsRef.current[chatKey] = {
        ...(composerContextsRef.current[chatKey] ?? {}),
        draft: "",
        attachments: [],
        editorHtml: "",
      };
      setFlowPending(false);

      const flowArgs = {
        threadId,
        mode: genMode,
        tier: genMode === "video" ? "pro_video" : "image",
        stylePresetId: preset._id,
        styleSheetElementId: composerStyleMode === "styled" ? activeStyleSheetId : undefined,
        userPrompt,
        attachedScriptMarkdown: attachedCreativeMarkdown.length ? attachedCreativeMarkdown : undefined,
        referenceSummaries: elementReferenceSummaries.length ? elementReferenceSummaries : undefined,
        audioEnabled: genMode === "video" ? audioEnabled : undefined,
        aspectRatio,
        resolution: genMode === "image" ? normalizeImageResolution(imageResolution) : resolution,
        durationSeconds: genMode === "video" ? Number(durationSeconds) : undefined,
        referenceUrls: genMode === "image"
          ? generationReferences
            .filter((reference) => reference.kind === "image")
            .map((reference) => reference.url)
          : undefined,
        referenceInputs: genMode === "video" ? generationReferences : undefined,
        startFrameUrl: genMode === "video" ? videoStartFrameUrl : undefined,
        skipPromptEnhancement: composerStyleMode === "direct" ? true : skipPromptEnhancement,
        referenceIntent,
        hasRawImageReference: composerReferenceFlags.hasRawImageReference,
        hasElementReference: composerReferenceFlags.hasElementReference,
      };
      void runFlow(flowArgs).catch((error) => {
        setOptimisticByThread((prev) => {
          const current = prev[threadId] ?? [];
          const next = current.filter((event) => event.clientId !== optimistic.clientId);
          if (!next.length) {
            const { [threadId]: _drop, ...rest } = prev;
            return rest;
          }
          return { ...prev, [threadId]: next };
        });
        const raw = error instanceof Error ? error.message : "Studio action failed.";
        const friendly = friendlyGenerationError(raw, genMode);
        const detail = friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message;
        setStatus(
          friendly.title !== "Something went wrong" ? `${friendly.title}. ${detail}` : detail,
        );
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Studio action failed.";
      const friendly = friendlyGenerationError(
        raw,
        mode === "element" ? "element" : mode,
      );
      const detail = friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message;
      setStatus(
        friendly.title !== "Something went wrong" ? `${friendly.title}. ${detail}` : detail,
      );
    } finally {
      setFlowPending(false);
    }
  }

  return (
    <div
      ref={shellRef}
      className={`${STYLE.shell} studio-polish is-studio-bg-ready${isMobile ? ` is-studio-mobile is-mobile-${mobileSection}` : ""}${customCursorEnabled ? " is-custom-cursor" : ""}`}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.("button, [role='button'], .cursor-tree-row, .desk-file-grid-item")) {
          playStudioTapFeedback();
        }
      }}
    >
      <div className="studio-backdrop" aria-hidden="true" />
      <style jsx global>{`
        .studio-polish {
          --studio-active-bg: none;
          --studio-glow-soft: color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          --studio-glow-mid: color-mix(in srgb, var(--cursor-accent) 24%, transparent);
          --studio-surface-hover: color-mix(in srgb, var(--cursor-accent) 5%, var(--color-cursor-hover));
          --studio-card-bg: color-mix(in srgb, var(--mos-surface) 72%, transparent);
          --studio-shell-border: var(--color-cursor-border-soft);
          --studio-chrome-divider: var(--color-cursor-border-soft);
          --studio-card-border: color-mix(in srgb, var(--cursor-accent) 8%, var(--studio-shell-border));
          --studio-motion-fast: 100ms;
          --studio-motion-med: 120ms;
          --studio-motion-ease: cubic-bezier(0.2, 0, 0.2, 1);
          --studio-motion-spring: cubic-bezier(0.2, 0, 0.2, 1);
          --studio-composer-focus-line-ease: cubic-bezier(0.16, 1, 0.3, 1);
          --studio-hover-scale: 1;
          --studio-press-scale: 0.985;
          --studio-focus-ring: 0 0 0 3px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          --studio-composer-glass: color-mix(in srgb, var(--color-mos-composer, #07111f) 34%, transparent);
          --studio-composer-glass-strong: color-mix(in srgb, var(--color-mos-composer, #07111f) 48%, transparent);
          --studio-composer-glass-muted: color-mix(in srgb, var(--color-mos-composer, #07111f) 26%, transparent);
          --studio-composer-glass-border: rgba(255, 255, 255, 0.11);
          --studio-composer-glass-blur: saturate(150%) blur(5px);
          --studio-composer-glass-shadow:
            0 20px 48px rgba(0, 0, 0, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          --studio-composer-shell-max: 720px;
          --studio-composer-min-height: 96px;
          --studio-composer-side-width: 112px;
          --studio-mode-switcher-width: var(--studio-composer-side-width);
          --studio-generate-column-width: var(--studio-composer-side-width);
          --studio-composer-row-gap: 8px;
          --studio-mobile-nav-height: 44px;
          --studio-mobile-chrome-glass:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--cursor-accent) 8%, transparent), transparent 52%),
            color-mix(in srgb, var(--mos-bg) 82%, transparent);
          --studio-mobile-chrome-glass-foot:
            radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--cursor-accent) 8%, transparent), transparent 52%),
            color-mix(in srgb, var(--mos-bg) 82%, transparent);
          --studio-mobile-chrome-blur: saturate(150%) blur(8px);
          --studio-mobile-chrome-border: color-mix(in srgb, var(--color-cursor-border) 74%, transparent);
          --studio-mobile-chrome-sheen: linear-gradient(
            90deg,
            transparent 0%,
            color-mix(in srgb, var(--cursor-accent) 34%, transparent) 16%,
            color-mix(in srgb, var(--cursor-accent) 82%, #fff 10%) 50%,
            color-mix(in srgb, var(--cursor-accent) 34%, transparent) 84%,
            transparent 100%
          );
          --studio-mobile-nav-sheen: linear-gradient(
            90deg,
            transparent 0%,
            color-mix(in srgb, var(--cursor-accent) 16%, transparent) 18%,
            color-mix(in srgb, var(--cursor-accent) 42%, transparent) 50%,
            color-mix(in srgb, var(--cursor-accent) 16%, transparent) 82%,
            transparent 100%
          );
          --studio-grid-tile-bg: color-mix(in srgb, var(--mos-text-bright) 2.8%, var(--mos-bg));
          --studio-grid-tile-hover: color-mix(in srgb, var(--mos-text-bright) 5.5%, var(--mos-bg));
          --studio-grid-folder-tile-bg: color-mix(in srgb, var(--mos-text-bright) 4.2%, var(--mos-bg));
          --studio-grid-folder-tile-hover: color-mix(in srgb, var(--mos-text-bright) 6.5%, var(--mos-bg));
          --studio-grid-tile-selected: color-mix(in srgb, var(--mos-accent) 8%, var(--mos-bg));
          --studio-grid-tile-glow: none;
          --studio-gen-frame-bg: rgba(0, 0, 0, 0.9);
          --studio-gen-frame-text: var(--color-cursor-text-bright);
          --studio-gen-card-shadow: 0 28px 64px rgb(0 0 0 / 0.65);
          --studio-gen-media-bg: rgba(0, 0, 0, 0.9);
          --studio-gen-glass-fill: color-mix(in srgb, #ffffff 32%, transparent);
          --studio-gen-glass-blur: saturate(190%) blur(20px);
          --studio-gen-aura-a: color-mix(in srgb, var(--cursor-accent) 30%, transparent);
          --studio-gen-aura-b: color-mix(in srgb, var(--cursor-accent-hover) 24%, transparent);
          position: relative;
          background: var(--mos-bg) !important;
          overflow: hidden;
        }
        .studio-backdrop {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.74;
          background: var(--studio-loaded-bg, var(--studio-active-bg)) center / cover no-repeat;
        }
        .studio-polish.is-studio-bg-ready .studio-backdrop {
          opacity: 1;
        }
        .studio-polish > :not(style, .studio-backdrop) {
          position: relative;
        }
        .studio-mobile-bottom-nav {
          display: none;
          position: fixed;
          top: auto !important;
          right: 0;
          bottom: 0;
          left: 0;
          width: 100vw;
          height: auto !important;
          min-height: 0 !important;
          max-height: calc(var(--studio-mobile-nav-height, 44px) + env(safe-area-inset-bottom, 0px));
          flex-shrink: 0;
          align-items: center;
          z-index: 60;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2px;
          padding: 4px max(8px, env(safe-area-inset-right, 0px)) calc(4px + env(safe-area-inset-bottom, 0px))
            max(8px, env(safe-area-inset-left, 0px));
          border-top: 1px solid var(--studio-mobile-chrome-border);
          background: var(--studio-mobile-chrome-glass-foot);
          box-shadow: 0 -12px 28px rgba(0, 0, 0, 0.28);
          contain: layout style;
        }
        .studio-mobile-nav-indicator {
          position: absolute;
          top: 0;
          left: 0;
          height: 1px;
          border-radius: 999px;
          background: var(--studio-mobile-nav-sheen);
          transition:
            transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
            width 220ms cubic-bezier(0.22, 1, 0.36, 1);
          pointer-events: none;
          will-change: transform, width;
        }
        .studio-mobile-nav-indicator::after {
          content: "";
          position: absolute;
          top: -9px;
          left: 50%;
          width: min(220px, 118%);
          height: 10px;
          transform: translateX(-50%);
          background: radial-gradient(
            ellipse 140% 100% at 50% 100%,
            color-mix(in srgb, var(--cursor-accent) 14%, transparent),
            transparent 78%
          );
          opacity: 0.38;
          pointer-events: none;
        }
        .studio-mobile-nav-btn {
          display: flex;
          min-width: 0;
          min-height: 34px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: var(--color-cursor-muted);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.01em;
          -webkit-tap-highlight-color: transparent;
        }
        .studio-mobile-nav-btn svg {
          width: 15px;
          height: 15px;
        }
        .studio-mobile-nav-btn.is-active,
        .studio-mobile-nav-btn.is-active svg {
          color: var(--cursor-accent);
        }
        @media (max-width: 899px) {
          .studio-polish .studio-main-panels > .cursor-resize {
            display: none !important;
          }
          .studio-polish .studio-main-panels {
            padding-bottom: calc(var(--studio-mobile-nav-height, 44px) + env(safe-area-inset-bottom, 0px));
            contain: layout style;
          }
          .studio-polish.is-studio-mobile .studio-main-panels > [data-panel] {
            flex: 1 1 100% !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .studio-polish.is-studio-mobile .cursor-workspace-head {
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .studio-polish.is-studio-mobile .studio-mobile-bottom-nav {
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .studio-polish.is-studio-mobile .cursor-unified-tabs.is-dragging-strip,
          .studio-polish.is-studio-mobile .cursor-unified-tab.is-entering {
            animation: none !important;
          }
          .studio-polish.is-studio-mobile .cursor-unified-tab {
            transition: color 120ms ease, border-color 120ms ease !important;
          }
          .studio-polish.is-studio-mobile {
            --cursor-head-h: var(--studio-mobile-nav-height, 44px);
          }
          .studio-polish.is-studio-mobile :where(
            .cursor-workspace-head,
            .cursor-panel-head,
            .cursor-sidebar-head,
            .cursor-panel-search,
            .studio-folder-pathbar,
            .desk-file-breadcrumbs
          ) {
            min-height: var(--studio-mobile-nav-height, 44px) !important;
            height: var(--studio-mobile-nav-height, 44px) !important;
          }
          .studio-polish.is-studio-mobile .studio-folder-pathbar .desk-file-breadcrumbs {
            min-height: 100% !important;
            height: 100% !important;
            border-bottom: none;
          }
          .studio-polish.is-studio-mobile .desk-file-breadcrumbs-track {
            min-height: var(--studio-mobile-nav-height, 44px);
            padding: 0 10px;
            gap: 6px;
            align-items: center;
          }
          .studio-polish.is-studio-mobile .cursor-panel-search-input {
            height: auto;
            min-height: 0;
            line-height: 1.2;
          }
          .studio-polish.is-mobile-files aside {
            border-right: 0 !important;
          }
          .studio-polish.is-mobile-files .studio-folder-pathbar {
            padding-inline: max(8px, env(safe-area-inset-left, 0px)) max(8px, env(safe-area-inset-right, 0px));
          }
          .studio-polish.is-mobile-files .cursor-panel-search {
            padding-inline: max(8px, env(safe-area-inset-left, 0px)) max(8px, env(safe-area-inset-right, 0px));
          }
          .studio-composer-notice {
            margin: 0 12px 10px;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid color-mix(in srgb, #f59e0b 28%, transparent);
            background: color-mix(in srgb, #f59e0b 10%, transparent);
            color: var(--color-cursor-fg);
            font-size: 12px;
            line-height: 1.45;
          }
          .studio-composer-notice p {
            margin: 0;
          }
          [data-appearance="light"] .studio-polish .studio-composer-notice {
            border-color: color-mix(in srgb, #d97706 22%, transparent);
            background: color-mix(in srgb, #f59e0b 8%, transparent);
          }
          .studio-polish.is-mobile-files .cursor-sidebar-head,
          .studio-polish.is-mobile-files .cursor-panel-head {
            padding-left: max(8px, env(safe-area-inset-left, 0px));
            padding-right: max(8px, env(safe-area-inset-right, 0px));
          }
          .studio-polish .studio-main-panels > [data-panel]:first-child,
          .studio-polish .studio-main-panels > [data-panel]:last-child {
            flex: 1 1 100% !important;
            width: 100% !important;
            min-width: 0 !important;
          }
          .studio-polish .cursor-workspace-head {
            gap: 6px;
            padding-right: max(10px, env(safe-area-inset-right, 0px));
          }
          .studio-polish .cursor-workspace-tools {
            gap: 8px;
            padding-left: 6px;
            padding-right: max(4px, env(safe-area-inset-right, 0px));
          }
          .studio-polish .cursor-workspace-tools .studio-settings-pill {
            min-width: 28px;
            min-height: 28px;
            border-radius: 999px;
            padding: 0;
          }
          .studio-polish .cursor-workspace-tools .studio-settings-pill svg {
            width: 12px;
            height: 12px;
          }
          .studio-polish .cursor-workspace-tools .studio-credit-pill {
            min-height: 28px;
            height: 28px;
            max-width: 132px;
            padding-inline: 10px;
            border-radius: 999px;
            font-size: 11px;
          }
          .studio-polish .cursor-workspace-tools .studio-credit-pill svg {
            width: 12px;
            height: 12px;
          }
          .studio-polish .cursor-unified-tabs {
            padding-left: 0;
          }
          .studio-polish .cursor-unified-tabs {
            position: relative;
            min-width: 0;
            padding-right: 46px;
          }
          .studio-polish .cursor-unified-tab {
            height: 36px !important;
            width: min(92px, var(--cursor-unified-tab-width, 104px)) !important;
            min-width: min(92px, var(--cursor-unified-tab-width, 104px)) !important;
            max-width: min(92px, var(--cursor-unified-tab-width, 104px)) !important;
            padding-left: 8px !important;
          }
          .studio-polish .cursor-unified-tab:not(.cursor-unified-tab-new):nth-child(n + 2) {
            padding-left: 14px !important;
          }
          .studio-polish .cursor-unified-tab.cursor-unified-tab-new {
            position: absolute;
            right: max(6px, env(safe-area-inset-right, 0px));
            top: 50%;
            transform: translateY(-50%);
            z-index: 6;
            width: 34px !important;
            min-width: 34px !important;
            max-width: 34px !important;
            height: 34px !important;
            min-height: 34px !important;
            margin: 0 !important;
            padding-left: 0 !important;
          }
          .studio-polish .cursor-unified-tab-placeholder {
            width: min(92px, var(--cursor-unified-tab-width, 104px)) !important;
            min-width: min(92px, var(--cursor-unified-tab-width, 104px)) !important;
            max-width: min(92px, var(--cursor-unified-tab-width, 104px)) !important;
          }
          .studio-mobile-bottom-nav {
            display: grid !important;
          }
          .studio-polish .studio-composer.cursor-composer-shell {
            bottom: calc(var(--studio-mobile-nav-height, 44px) + env(safe-area-inset-bottom, 0px));
          }
          .studio-polish .studio-composer .cursor-composer {
            max-width: 100%;
            left: 0;
            padding-inline: max(10px, env(safe-area-inset-left, 0px)) max(10px, env(safe-area-inset-right, 0px));
            padding-bottom: max(6px, env(safe-area-inset-bottom, 0px));
          }
          .studio-polish .studio-composer-row {
            flex-direction: column;
            gap: 8px;
          }
          .studio-polish .studio-mode-switcher {
            width: 100%;
            min-height: 44px;
            flex: 0 0 auto;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            grid-template-rows: none;
            padding: 4px;
          }
          .studio-polish .studio-mode-row {
            flex-direction: row;
            min-height: 36px;
            justify-content: center;
            gap: 5px;
            padding: 0 6px;
            font-size: 10px;
          }
          .studio-polish .studio-mode-row svg {
            width: 14px;
            height: 14px;
          }
          .studio-polish .studio-generate-column--desktop {
            display: none !important;
          }
          .studio-polish .studio-composer .cursor-composer-box {
            width: 100%;
            min-height: 96px;
            align-self: auto;
          }
          .studio-polish .studio-composer .cursor-composer-box::before {
            width: 220px;
            height: 118px;
            opacity: 0.82;
          }
          .studio-polish .studio-composer .cursor-composer-box::after {
            width: 200px;
            height: 104px;
            opacity: 0.82;
          }
          .studio-polish .studio-composer .cursor-composer-box:focus-within::before {
            width: min(100%, 520px);
            height: 240px;
            opacity: 1;
          }
          .studio-polish .studio-composer .cursor-composer-box:focus-within::after {
            width: min(100%, 480px);
            height: 220px;
            opacity: 1;
          }
          .studio-polish .studio-composer-toolbar {
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 4px 8px 8px;
          }
          .studio-polish .studio-composer-toolbar-scroll {
            display: none !important;
          }
          .studio-polish .studio-composer-controls {
            display: none !important;
          }
          .studio-polish .studio-composer-options-btn {
            display: inline-flex;
            flex: 0 0 auto;
            margin-right: auto;
          }
          .studio-polish .studio-composer-actions {
            flex: 0 0 auto;
            gap: 8px;
            margin-left: auto;
          }
          .studio-polish .studio-composer-circle-btn {
            display: inline-flex;
          }
          .studio-polish .studio-chat-stream {
            padding-bottom: calc(220px + env(safe-area-inset-bottom, 0px));
            scroll-padding-bottom: calc(220px + env(safe-area-inset-bottom, 0px));
          }
          .studio-polish .studio-chat-composer-align {
            grid-template-columns: minmax(0, 1fr);
            max-width: 100%;
            left: 0;
            padding-inline: 0;
          }
          .studio-polish .studio-chat-composer-gutter {
            display: none;
          }
          .studio-polish .studio-chat-stream {
            padding-inline: max(10px, env(safe-area-inset-left, 0px)) max(10px, env(safe-area-inset-right, 0px));
          }
          .studio-polish .studio-element-detail {
            padding-inline: max(12px, env(safe-area-inset-left, 0px)) max(12px, env(safe-area-inset-right, 0px));
          }
        }
        [data-studio-bg-family="animated"] .studio-polish,
        [data-studio-bg-family="cinematic"] .studio-polish,
        [data-studio-bg-pack="worlds"] .studio-polish {
          --studio-glow-soft: transparent;
          --studio-glow-mid: transparent;
          --studio-surface-hover: color-mix(in srgb, var(--mos-text-bright) 4%, var(--color-cursor-hover));
          --studio-card-border: var(--studio-shell-border);
          --studio-focus-ring: 0 0 0 3px color-mix(in srgb, var(--mos-text-bright) 10%, transparent);
        }
        :root {
          --studio-cursor-transition: opacity 0.2s ease;
        }
        :root.is-cursor-interactive {
          --studio-cursor-default: var(--studio-cursor-active) !important;
        }
        .studio-cursor-fade {
          position: fixed;
          pointer-events: none;
          z-index: 99999;
          width: 24px;
          height: 26px;
          background: var(--studio-cursor-default, none) center / contain no-repeat;
          opacity: 1;
          transition: opacity 0.18s ease;
        }
        .studio-cursor-fade.is-fading {
          opacity: 0;
        }
        .studio-polish.is-custom-cursor,
        .studio-polish.is-custom-cursor * {
          cursor: var(--studio-cursor-default, auto) !important;
        }
        .studio-polish.is-custom-cursor :where(input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .cursor-code-input, .studio-composer-inputline, .cursor-composer-textarea, .cursor-composer-mention-editor, .cursor-html-source-pane) {
          cursor: var(--studio-cursor-text, text) !important;
          caret-color: var(--cursor-accent);
        }
        .studio-polish.is-custom-cursor :where(.cursor-resize, [data-panel-resize-handle-id], [role="separator"]) {
          cursor: var(--studio-cursor-resize-x, ew-resize) !important;
        }
        body.is-drag-cursor,
        .studio-polish.is-custom-cursor [draggable="true"]:active {
          cursor: var(--studio-cursor-drag, grab) !important;
        }
        body.is-grabbing-cursor {
          cursor: var(--studio-cursor-grabbing, grabbing) !important;
        }
        .desk-file-list-row.is-drag-over,
        .desk-file-grid-item.is-drag-over,
        .desk-file-preview-item.is-drag-over {
          outline: none !important;
          border: 1px solid var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14)) !important;
          background: color-mix(in srgb, var(--studio-composer-glass-muted, rgba(7, 17, 31, 0.44)) 90%, var(--cursor-accent) 10%) !important;
          backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          -webkit-backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          box-shadow:
            0 12px 32px color-mix(in srgb, #000 30%, transparent),
            0 4px 12px color-mix(in srgb, #000 18%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.07);
          border-radius: 10px;
        }
        .desk-file-breadcrumbs-chip.is-drag-over {
          outline: none !important;
          border: 1px solid var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14)) !important;
          background: color-mix(in srgb, var(--studio-composer-glass-muted, rgba(7, 17, 31, 0.44)) 88%, var(--cursor-accent) 12%) !important;
          backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          -webkit-backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          box-shadow:
            0 10px 24px color-mix(in srgb, #000 28%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .desk-file-drag-preview {
          border: 1px solid var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14)) !important;
          background: color-mix(in srgb, var(--studio-composer-glass-muted, rgba(7, 17, 31, 0.52)) 78%, transparent) !important;
          backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(8px));
          -webkit-backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(8px));
          box-shadow:
            0 18px 44px color-mix(in srgb, #000 36%, transparent),
            0 6px 16px color-mix(in srgb, #000 22%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
        }
        .cursor-composer-box.is-drop-target {
          border-style: solid !important;
          border-color: var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14)) !important;
          background: var(--studio-composer-glass, color-mix(in srgb, rgba(7, 17, 31, 0.58) 88%, transparent)) !important;
          backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          -webkit-backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          box-shadow:
            0 16px 40px color-mix(in srgb, #000 32%, transparent),
            0 6px 16px color-mix(in srgb, #000 20%, transparent),
            var(--studio-composer-glass-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.08)) !important;
        }
        .cursor-composer-shell.is-drop-target-hit .cursor-composer-box,
        .cursor-composer-box.is-drop-target-hit {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14))) !important;
          box-shadow:
            0 20px 48px color-mix(in srgb, #000 34%, transparent),
            0 8px 20px color-mix(in srgb, var(--cursor-accent) 16%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
        }
        .cursor-explorer-panel.is-drop-target {
          background: color-mix(in srgb, var(--studio-composer-glass-muted, rgba(7, 17, 31, 0.44)) 92%, var(--cursor-accent) 8%);
          box-shadow: inset 0 0 0 1px var(--studio-composer-glass-border, rgba(255, 255, 255, 0.1));
        }
        .studio-inline-tag.is-drag-image {
          opacity: 0.96;
          border: 1px solid var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14));
          background: color-mix(in srgb, var(--studio-composer-glass-muted, rgba(7, 17, 31, 0.52)) 82%, transparent);
          backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(8px));
          -webkit-backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(8px));
          box-shadow:
            0 14px 36px color-mix(in srgb, #000 34%, transparent),
            0 4px 12px color-mix(in srgb, #000 20%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          border-radius: 999px;
        }
        .studio-polish::before,
        .studio-polish::after {
          content: "";
          display: none;
        }
        .studio-polish::before {
          width: 36vw;
          height: 36vw;
          right: -12vw;
          top: -14vw;
          background: radial-gradient(circle, color-mix(in srgb, var(--cursor-accent) 28%, transparent), transparent 68%);
        }
        .studio-polish::after {
          width: 30vw;
          height: 30vw;
          left: 18vw;
          bottom: -16vw;
          background: radial-gradient(circle, color-mix(in srgb, var(--cursor-accent-hover) 12%, transparent), transparent 70%);
          animation-duration: 12s;
        }
        .studio-polish > :not(style, .studio-backdrop) {
          position: relative;
        }
        .studio-polish ::selection {
          background: color-mix(in srgb, var(--cursor-accent) 46%, var(--color-cursor-hover));
          color: var(--color-cursor-text-bright);
          text-shadow: none;
        }
        .studio-polish ::-moz-selection {
          background: color-mix(in srgb, var(--cursor-accent) 46%, var(--color-cursor-hover));
          color: var(--color-cursor-text-bright);
          text-shadow: none;
        }
        .studio-polish :where(svg, .icon-inline) {
          color: var(--color-cursor-text-bright);
        }
        .studio-polish :where(.text-cursor-muted, .text-cursor-muted svg, .cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn) {
          color: color-mix(in srgb, var(--color-cursor-text-bright) 88%, transparent) !important;
        }
        .studio-polish :where(button:hover, [role="button"]:hover, .cursor-icon-btn:hover, .cursor-toolbar-icon:hover, .studio-pill-btn:hover) :where(svg, .icon-inline) {
          color: var(--color-cursor-text-bright) !important;
        }
        .studio-polish :where(aside, .cursor-panel-head, .cursor-workspace-head, .cursor-settings-panel, .border-cursor-border) {
          border-color: var(--studio-shell-border) !important;
        }
        .studio-polish aside,
        .studio-polish .studio-settings-sidebar {
          background: var(--mos-sidebar) !important;
        }
        .studio-polish :where(.border-cursor-border-soft) {
          border-color: var(--color-cursor-border-soft) !important;
        }
        @keyframes studio-ambient-drift {
          from { transform: translate3d(0, 0, 0) scale(0.96); }
          to { transform: translate3d(-18px, 12px, 0) scale(1.05); }
        }
        .studio-polish :where(
          button,
          [role="button"],
          .cursor-tab-close,
          .cursor-tree-row,
          .desk-file-list-row,
          .desk-file-breadcrumbs-chip,
          .theme-chip,
          .studio-credit-pill,
          .cursor-icon-btn,
          .cursor-toolbar-icon,
          .studio-pill-btn,
          .studio-settings-pill
        ) {
          transition:
            background-color var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish :where(.cursor-tab, .cursor-agent-chat-tab, .cursor-unified-tab) {
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish :where(button, [role="button"], .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .desk-file-breadcrumbs-chip) {
          -webkit-tap-highlight-color: transparent;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn, .studio-settings-pill) {
          position: relative;
          transform-origin: center center;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn, .studio-settings-pill):hover:not(:disabled) {
          transform: none;
          box-shadow: none;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn, .studio-settings-pill):active:not(:disabled) {
          transform: scale(var(--studio-press-scale));
        }
        .studio-polish :where(button, [role="button"], .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .desk-file-breadcrumbs-chip):focus-visible {
          outline: 2px solid color-mix(in srgb, var(--cursor-accent) 42%, transparent);
          outline-offset: 2px;
          box-shadow: var(--studio-focus-ring);
        }
        .studio-polish :where(.cursor-tree-row, .desk-file-list-row, .desk-file-breadcrumbs-chip):active {
          transform: scale(var(--studio-press-scale));
        }
        .studio-polish .cursor-panel-head {
          border-bottom: 0 !important;
          background: rgb(255 255 255 / 0.001) !important;
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.04),
            0 12px 34px rgb(0 0 0 / 0.14) !important;
        }
        .studio-polish aside .cursor-panel-head,
        .studio-polish aside .cursor-sidebar-head,
        .studio-polish .studio-settings-sidebar .cursor-panel-head {
          background: var(--color-cursor-bg) !important;
          border-bottom: 1px solid var(--studio-chrome-divider) !important;
          box-shadow: none !important;
        }
        .studio-workspace-panels {
          height: 100%;
          min-height: 0;
        }
        .studio-settings-sidebar {
          min-width: 0;
          background: var(--mos-sidebar);
        }
        .studio-settings-sidebar .studio-settings-workspace {
          display: flex;
          min-height: 0;
          flex: 1 1 auto;
          flex-direction: column;
        }
        .studio-polish :where(.studio-main-panels, [data-panel], aside, main, .cursor-explorer-panel, .cursor-settings-sheet, .cursor-settings-body, .cursor-workspace-head) {
          background: transparent !important;
        }
        .studio-polish :where(.cursor-panel-head, .cursor-explorer-panel, .cursor-tree-row, .studio-credit-pill, .cursor-icon-btn, .studio-pill-btn) {
        }
        .studio-polish .cursor-sidebar-brand-logo-img {
          filter: drop-shadow(0 0 8px var(--studio-glow-soft));
        }
        .studio-polish .cursor-sidebar-brand-logo {
          width: 20px;
          height: 20px;
        }
        .studio-polish .cursor-sidebar-brand-logo-img {
          width: 18px;
          height: 18px;
        }
        .studio-user-menu-wrap {
          position: relative;
          min-width: 0;
        }
        .studio-user-menu-trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: 100%;
          border: 0;
          background: transparent;
          font-family: inherit;
          cursor: pointer;
          pointer-events: auto;
        }
        .cursor-sidebar-brand-user {
          display: inline-flex;
          min-width: 0;
          align-items: center;
          gap: 5px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border));
          border-radius: 999px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 14%, var(--mos-surface)), color-mix(in srgb, var(--mos-surface) 68%, var(--mos-bg)));
          padding: 3px 7px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 650;
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 12%, transparent) inset,
            0 8px 18px color-mix(in srgb, #000 20%, transparent),
            0 0 14px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-user-menu-trigger:hover .cursor-sidebar-brand-user {
          border-color: color-mix(in srgb, var(--cursor-accent) 48%, var(--color-cursor-border));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 22%, var(--mos-surface)), color-mix(in srgb, var(--cursor-accent) 8%, var(--mos-surface)));
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 18%, transparent) inset,
            0 10px 22px color-mix(in srgb, #000 24%, transparent),
            0 0 20px color-mix(in srgb, var(--cursor-accent) 18%, transparent);
        }
        .cursor-sidebar-brand-user-type-icon {
          width: 13px;
          height: 13px;
          flex-shrink: 0;
          color: color-mix(in srgb, var(--cursor-accent) 72%, var(--color-cursor-text-bright));
        }
        .cursor-sidebar-brand-user-name {
          max-width: 132px;
        }
        .studio-user-menu-popover {
          position: absolute;
          top: 32px;
          left: 0;
          z-index: 60;
          width: 150px;
        }
        .studio-polish main {
          position: relative;
          background: transparent !important;
        }
        .studio-polish main.studio-composer-bg {
          background: transparent !important;
        }
        .studio-polish main::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0;
          background:
            radial-gradient(ellipse at center,
              transparent 0%,
              color-mix(in srgb, #000 2%, transparent) 28%,
              color-mix(in srgb, #000 10%, transparent) 48%,
              color-mix(in srgb, #000 22%, transparent) 66%,
              color-mix(in srgb, #000 38%, transparent) 82%,
              color-mix(in srgb, #000 56%, transparent) 100%
            ),
            radial-gradient(ellipse at 50% -4%,
              color-mix(in srgb, var(--cursor-accent) 6%, transparent) 0%,
              transparent 50%
            ),
            radial-gradient(ellipse at 82% 94%,
              color-mix(in srgb, var(--cursor-accent-hover) 3%, transparent) 0%,
              transparent 40%
            );
          transition: opacity 180ms ease;
        }
        .studio-polish.is-studio-bg-ready main.studio-composer-bg::before {
          opacity: 1;
        }
        [data-appearance="light"] .studio-polish main.studio-composer-bg::before {
          opacity: 0;
        }
        .studio-polish main > :not(style) {
          position: relative;
        }
        .studio-polish :where(.cursor-tree-row) {
          position: relative;
          overflow: hidden;
        }
        .studio-polish :where(.desk-file-list-row) {
          position: relative;
          overflow: hidden;
        }
        .studio-polish :where(.desk-file-grid-item, .desk-file-preview-item) {
          position: relative;
          overflow: visible;
        }
        .studio-polish .cursor-tree-row:hover {
          background: var(--studio-surface-hover);
          border-color: color-mix(in srgb, var(--cursor-accent) 22%, var(--studio-shell-border));
          box-shadow: none;
          transform: none;
        }
        .studio-polish .cursor-tree-row[aria-selected="true"],
        .studio-polish .cursor-tree-row.is-selected {
          background: color-mix(in srgb, var(--cursor-accent) 10%, var(--color-cursor-hover));
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 28%, transparent),
            0 0 16px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-polish .desk-file-breadcrumbs-chip:hover {
          background: var(--studio-grid-tile-hover);
          box-shadow: none;
        }
        .studio-polish .cursor-workspace-head {
          padding: 0 !important;
          gap: 0;
          align-items: center;
          background: var(--color-cursor-bg) !important;
          border-bottom: 1px solid var(--studio-chrome-divider) !important;
          box-shadow: none !important;
        }
        .studio-polish .cursor-workspace-head::after {
          content: none !important;
        }
        @media (max-width: 899px) {
          .studio-polish .cursor-workspace-head {
            position: relative;
            min-height: var(--studio-mobile-nav-height, 44px);
            height: var(--studio-mobile-nav-height, 44px);
            padding-top: env(safe-area-inset-top, 0px);
            background: var(--studio-mobile-chrome-glass) !important;
            border-bottom: 1px solid var(--studio-mobile-chrome-border) !important;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.22) !important;
            overflow: visible;
          }
          .studio-polish .cursor-workspace-head::before {
            content: "";
            position: absolute;
            bottom: -20px;
            left: 12%;
            right: 12%;
            height: 22px;
            background: radial-gradient(
              ellipse at 50% 0%,
              color-mix(in srgb, var(--cursor-accent) 24%, transparent),
              transparent 72%
            );
            opacity: 0.72;
            pointer-events: none;
          }
          .studio-polish .cursor-workspace-head::after {
            content: "" !important;
            position: absolute;
            bottom: 0;
            left: 8%;
            right: 8%;
            height: 1px;
            background: var(--studio-mobile-chrome-sheen);
            pointer-events: none;
          }
        }
        .studio-polish .cursor-unified-tabs {
          align-items: center;
          gap: 4px;
          padding: 0;
        }
        .studio-polish .cursor-unified-tab {
          height: 30px !important;
          width: min(140px, var(--cursor-unified-tab-width, 154px));
          min-width: min(140px, var(--cursor-unified-tab-width, 154px));
          max-width: min(140px, var(--cursor-unified-tab-width, 154px));
          border: 1px solid color-mix(in srgb, var(--mos-text-bright) 4%, transparent) !important;
          border-left-width: 0 !important;
          border-radius: 0 11px 11px 0 !important;
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 68%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 42%, var(--mos-bg))
            ) !important;
          padding: 0 2px 0 8px !important;
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent),
            0 1px 0 color-mix(in srgb, #000 12%, transparent) !important;
          overflow: hidden;
        }
        .studio-polish .cursor-unified-tab-preview {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          border-radius: 999px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--color-cursor-muted) 12%, transparent);
        }
        .studio-polish .cursor-unified-tab-preview img,
        .studio-polish .cursor-unified-tab-preview video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .studio-polish .cursor-unified-tab.has-preview .cursor-unified-tab-label {
          min-width: 0;
        }
        .studio-polish .cursor-unified-tab > * {
          position: relative;
          z-index: 1;
        }
        .studio-polish .cursor-unified-tab::before,
        .studio-polish .cursor-unified-tab::after {
          content: "";
          position: absolute;
          inset: 0;
          left: var(--tab-overlap-inset, 0);
          border-radius: inherit;
          pointer-events: none;
          opacity: 0;
          transition: none;
        }
        .studio-polish .cursor-unified-tab::before {
          z-index: 0;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 46%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 78%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 50%, var(--mos-bg))
            );
        }
        .studio-polish .cursor-unified-tab:hover::before {
          opacity: 1;
        }
        .studio-polish .cursor-unified-tab:not(.cursor-unified-tab-new) {
          margin: 0 0 0 -12px;
          z-index: var(--tab-stack, 1) !important;
        }
        /* Active tab on top; hover never lifts z-index so overlay stays under left neighbor. */
        .studio-polish .cursor-unified-tab:not(.cursor-unified-tab-new).is-active {
          z-index: calc(var(--tab-count, 8) + 5) !important;
        }
        .studio-polish .cursor-unified-tab:not(.cursor-unified-tab-new):nth-child(n + 2) {
          padding-left: 18px !important;
        }
        .studio-polish .cursor-unified-tab-placeholder {
          width: min(140px, var(--cursor-unified-tab-width, 154px));
          min-width: min(140px, var(--cursor-unified-tab-width, 154px));
          max-width: min(140px, var(--cursor-unified-tab-width, 154px));
          margin: 0 0 0 -18px;
          border-left-width: 1px;
          border-radius: 11px;
        }
        .studio-polish .cursor-unified-tab:not(.cursor-unified-tab-new):first-child {
          margin-left: 0;
        }
        .studio-polish .cursor-unified-tab-placeholder:first-child {
          margin-left: 0;
          border-radius: 0 11px 11px 0;
        }
        .studio-polish :where(.cursor-tab, .cursor-agent-chat-tab):hover {
          border-color: color-mix(in srgb, var(--mos-text-bright) 6%, transparent) !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 46%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 78%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 50%, var(--mos-bg))
            ) !important;
        }
        .studio-polish .cursor-unified-tab:hover {
          border-color: color-mix(in srgb, var(--mos-text-bright) 6%, transparent) !important;
          background: transparent !important;
        }
        .studio-polish :where(.cursor-tab.active, .cursor-agent-chat-tab.active, .cursor-tab.is-active, .cursor-agent-chat-tab.is-active) {
          border-color: color-mix(in srgb, var(--mos-text-bright) 4%, transparent) !important;
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 68%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 42%, var(--mos-bg))
            ) !important;
          color: var(--color-cursor-text-bright) !important;
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent),
            0 1px 0 color-mix(in srgb, #000 12%, transparent) !important;
        }
        .studio-polish .cursor-unified-tab.is-active {
          border-color: color-mix(in srgb, var(--mos-text-bright) 4%, transparent) !important;
          background: transparent !important;
          color: var(--color-cursor-text-bright) !important;
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent),
            0 1px 0 color-mix(in srgb, #000 12%, transparent) !important;
        }
        .studio-polish .cursor-unified-tab.is-active::before {
          opacity: 1;
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 68%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 42%, var(--mos-bg))
            );
        }
        .studio-polish .cursor-unified-tab.is-active::after {
          z-index: 2;
          background: linear-gradient(
            90deg,
            transparent 0%,
            transparent 62%,
            color-mix(in srgb, var(--cursor-accent) 16%, transparent) 82%,
            color-mix(in srgb, var(--cursor-accent) 58%, transparent) 100%
          );
          opacity: 1;
          padding: 1px;
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
        }
        .studio-polish :where(.cursor-tab.active, .cursor-agent-chat-tab.active, .cursor-tab.is-active, .cursor-agent-chat-tab.is-active, .cursor-unified-tab.is-active) svg {
          color: currentColor !important;
          filter: none !important;
          stroke-width: inherit;
        }
        .studio-polish .cursor-unified-tab.is-active .cursor-tab-close {
          background: transparent !important;
          color: currentColor !important;
        }
        .studio-polish .cursor-unified-tab.is-active .cursor-tab-close:hover {
          background: transparent !important;
          color: var(--color-cursor-text-bright) !important;
        }
        .studio-polish .cursor-unified-tab.is-active,
        .studio-polish .cursor-unified-tab.is-streaming.is-active,
        .studio-polish .cursor-unified-tab.is-awaiting.is-active,
        .studio-polish .cursor-unified-tab.is-awaiting-question.is-active,
        .studio-polish .cursor-unified-tab.is-awaiting-input.is-active,
        .studio-polish .cursor-unified-tab.is-awaiting-plan.is-active,
        .studio-polish .cursor-unified-tab.is-error.is-active {
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent),
            0 1px 0 color-mix(in srgb, #000 12%, transparent) !important;
        }
        .studio-polish .cursor-unified-tab.cursor-unified-tab-new {
          width: 30px !important;
          min-width: 30px !important;
          max-width: 30px !important;
          height: 30px !important;
          min-height: 30px !important;
          aspect-ratio: 1;
          border-radius: 999px !important;
          border-width: 1px !important;
          border-left-width: 1px !important;
          justify-content: center;
          align-items: center;
          margin-left: 4px;
          padding: 0 !important;
          overflow: visible;
          flex-shrink: 0;
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border)) !important;
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent) 16%, var(--mos-surface)),
              color-mix(in srgb, var(--mos-surface) 58%, var(--mos-bg))
            ) !important;
          color: color-mix(in srgb, var(--color-cursor-text-bright) 92%, var(--cursor-accent));
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 16%, transparent) inset,
            0 8px 20px color-mix(in srgb, #000 24%, transparent),
            0 0 14px color-mix(in srgb, var(--cursor-accent) 12%, transparent);
        }
        .studio-polish .cursor-unified-tab.cursor-unified-tab-new:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 58%, var(--studio-shell-border)) !important;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 24%, var(--mos-surface)), color-mix(in srgb, var(--cursor-accent) 8%, var(--mos-surface))) !important;
          color: var(--color-cursor-text-bright);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 24%, transparent) inset;
        }
        .studio-polish .cursor-unified-tab.cursor-unified-tab-new svg {
          width: 12px;
          height: 12px;
        }
        .studio-polish .cursor-unified-tab.is-drag-source,
        .studio-polish .cursor-unified-tabs.is-dragging-strip .cursor-unified-tab:not(.cursor-unified-tab-new) {
          border-left-width: 1px !important;
          border-left-color: color-mix(in srgb, var(--cursor-accent) 18%, var(--studio-shell-border)) !important;
          border-radius: 11px !important;
          background-clip: padding-box;
        }
        .studio-polish .cursor-unified-tab.is-entering {
          animation: studio-tab-slide-from-behind 520ms var(--studio-motion-spring) both;
        }
        .studio-polish .cursor-unified-tab-ghost {
          border-color: color-mix(in srgb, var(--cursor-accent) 24%, var(--studio-shell-border)) !important;
          border-radius: 11px !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent-hover) 14%, transparent), transparent 45%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent) 10%, var(--mos-surface) 72%),
              color-mix(in srgb, var(--cursor-accent) 6%, var(--mos-bg) 82%)
            ) !important;
          box-shadow:
            0 12px 30px color-mix(in srgb, #000 34%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 7%, transparent) !important;
          overflow: hidden;
        }
        .studio-polish .cursor-unified-tab-ghost.is-first-drag {
          border-radius: 0 11px 11px 0 !important;
        }
        .studio-polish .cursor-unified-tab-ghost svg {
          color: var(--cursor-accent-hover) !important;
        }
        .studio-polish :where(.cursor-tab-context-menu, .cursor-dropdown, .desk-explorer-view-dropdown, .cursor-settings-panel) {
          border-color: color-mix(in srgb, var(--cursor-accent) 12%, var(--color-cursor-border));
          box-shadow:
            0 18px 50px rgba(0, 0, 0, 0.34),
            0 0 0 1px rgba(255, 255, 255, 0.025),
            0 0 30px var(--studio-glow-soft);
        }
        .studio-polish .cursor-settings-backdrop {
          background: color-mix(in srgb, #000 28%, transparent) !important;
        }
        .studio-polish .cursor-settings-panel {
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-settings-backdrop {
          background: color-mix(in srgb, #000 12%, transparent) !important;
        }
        [data-appearance="light"] .studio-polish .cursor-settings-panel {
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish {
          --studio-composer-glass: color-mix(in srgb, var(--color-mos-composer, #ffffff) 34%, transparent);
          --studio-composer-glass-strong: color-mix(in srgb, var(--color-mos-composer, #ffffff) 48%, transparent);
          --studio-composer-glass-muted: color-mix(in srgb, var(--color-mos-composer, #ffffff) 26%, transparent);
          --studio-composer-glass-border: rgba(15, 23, 42, 0.10);
          --studio-composer-glass-blur: saturate(180%) blur(10px);
          --studio-composer-glass-shadow:
            0 2px 10px color-mix(in srgb, #000 3.5%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.48);
          --studio-card-bg: var(--mos-panel);
          --studio-shell-border: var(--color-cursor-border-soft);
          --studio-chrome-divider: var(--color-cursor-border-soft);
          --studio-surface-hover: var(--color-cursor-hover);
          --studio-grid-tile-bg: color-mix(in srgb, var(--mos-text) 2%, var(--mos-bg));
          --studio-grid-tile-hover: color-mix(in srgb, var(--mos-text) 4.5%, var(--mos-bg));
          --studio-grid-folder-tile-bg: color-mix(in srgb, var(--mos-text) 3.4%, var(--mos-bg));
          --studio-grid-folder-tile-hover: color-mix(in srgb, var(--mos-text) 5.5%, var(--mos-bg));
          --studio-grid-tile-selected: color-mix(in srgb, var(--mos-accent) 6%, var(--mos-bg));
          --studio-grid-tile-glow: none;
          --studio-gen-frame-bg: transparent;
          --studio-gen-frame-text: var(--color-cursor-text);
          --studio-gen-card-shadow: var(--studio-composer-glass-shadow);
          --studio-gen-media-bg: transparent;
          --studio-gen-glass-fill: color-mix(in srgb, #ffffff 32%, transparent);
          --studio-gen-glass-blur: saturate(190%) blur(20px);
          --studio-gen-aura-a: color-mix(in srgb, var(--cursor-accent) 12%, transparent);
          --studio-gen-aura-b: color-mix(in srgb, var(--cursor-accent-hover) 8%, transparent);
        }
        [data-appearance="light"] .studio-polish :where(
          .studio-composer .cursor-composer-box,
          .studio-chat-bubble,
          .studio-mode-row::before,
          .studio-preset-grid-panel,
          .studio-preset-trigger,
          .studio-preset-grid-card,
          .studio-composer.cursor-composer-shell > .cursor-attach-preview-dock,
          .studio-composer .studio-pill-btn,
          .studio-composer .cursor-attach-tile-open,
          .studio-chat-chip,
          .studio-settings-menu.is-fixed,
          .studio-add-menu.is-fixed,
          .studio-dropdown-menu.is-fixed
        ) {
          backdrop-filter: var(--studio-composer-glass-blur) !important;
          -webkit-backdrop-filter: var(--studio-composer-glass-blur) !important;
        }
        [data-appearance="light"] .studio-polish aside {
          background: var(--mos-sidebar) !important;
          border-right-color: var(--color-cursor-border-soft) !important;
        }
        [data-appearance="light"] .studio-polish .studio-folder-pathbar,
        [data-appearance="light"] .studio-polish .cursor-panel-search {
          background: var(--color-cursor-sidebar) !important;
        }
        [data-appearance="light"] .studio-polish aside .cursor-panel-head,
        [data-appearance="light"] .studio-polish aside .cursor-sidebar-head,
        [data-appearance="light"] .studio-polish .studio-settings-sidebar .cursor-panel-head,
        [data-appearance="light"] .studio-polish main .cursor-workspace-head {
          background: #fff !important;
          border-bottom: 1px solid var(--studio-chrome-divider) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-sidebar-brand-logo-img {
          filter: none;
        }
        [data-appearance="light"] .studio-polish .cursor-sidebar-brand-user,
        [data-appearance="light"] .studio-polish .studio-user-menu-trigger:hover .cursor-sidebar-brand-user {
          border-color: var(--color-cursor-border-soft) !important;
          background: var(--color-cursor-panel) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish :where(aside .cursor-panel-head, .cursor-sidebar-head, .cursor-workspace-head) :where(
          .studio-settings-pill,
          .studio-credit-pill,
          .cursor-icon-btn,
          .studio-pill-btn
        ) {
          border-color: var(--color-cursor-border-soft) !important;
          background: var(--color-cursor-panel) !important;
          color: var(--color-cursor-muted) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish :where(aside .cursor-panel-head, .cursor-sidebar-head, .cursor-workspace-head) .studio-settings-pill.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft)) !important;
          background: color-mix(in srgb, var(--cursor-accent) 10%, var(--color-cursor-panel)) !important;
          color: var(--color-cursor-text) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .studio-credit-pill {
          background: var(--color-cursor-panel) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .studio-credit-pill svg {
          filter: none;
        }
        [data-appearance="light"] .studio-polish :where(aside .cursor-panel-head, .cursor-sidebar-head, .cursor-workspace-head) :where(
          .studio-settings-pill,
          .studio-credit-pill,
          .cursor-icon-btn,
          .studio-pill-btn
        ):hover:not(:disabled) {
          background: var(--color-cursor-hover) !important;
          color: var(--color-cursor-text) !important;
          box-shadow: none !important;
          transform: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab {
          border-color: var(--color-cursor-border-soft) !important;
          background: color-mix(in srgb, var(--mos-bg) 72%, var(--color-cursor-panel)) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish :where(
          .cursor-tab,
          .cursor-agent-chat-tab
        ):hover {
          background: var(--color-cursor-hover) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab:hover {
          background: transparent !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab:hover::before {
          opacity: 1;
          background: var(--color-cursor-hover);
        }
        [data-appearance="light"] .studio-polish :where(
          .cursor-tab.active,
          .cursor-agent-chat-tab.active,
          .cursor-tab.is-active,
          .cursor-agent-chat-tab.is-active
        ) {
          border-color: var(--color-cursor-border-soft) !important;
          background: var(--color-cursor-panel) !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-active {
          background: transparent !important;
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-active::before {
          opacity: 1;
          background: var(--color-cursor-panel);
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-active,
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-streaming.is-active,
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-awaiting.is-active,
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-awaiting-question.is-active,
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-awaiting-input.is-active,
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-awaiting-plan.is-active,
        [data-appearance="light"] .studio-polish .cursor-unified-tab.is-error.is-active {
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish .cursor-unified-tab::before {
          display: block;
        }
        [data-appearance="light"] .studio-polish .studio-settings-pill.is-active {
          box-shadow: none !important;
        }
        [data-appearance="light"] .studio-polish :where(aside .cursor-panel-head, .cursor-sidebar-head, .cursor-workspace-head) :where(.cursor-icon-btn, .studio-pill-btn):hover:not(:disabled) {
          box-shadow: none !important;
          transform: none;
        }
        [data-appearance="light"] .studio-backdrop {
          opacity: 0.52;
        }
        [data-appearance="light"] .studio-polish.is-studio-bg-ready .studio-backdrop {
          opacity: 0.64;
        }
        .studio-polish :where(.cursor-tab-context-item, .cursor-dropdown-item):hover {
          background: var(--studio-surface-hover);
        }
        .studio-polish .cursor-settings-tab:hover {
          background: var(--cursor-overlay-subtle);
          color: var(--color-cursor-text);
        }
        .studio-polish .cursor-settings-section {
          border-radius: 14px;
          padding: 10px;
          background: color-mix(in srgb, var(--mos-surface) 34%, transparent);
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 66%, transparent);
        }
        .studio-settings-pill {
          display: inline-flex;
          min-height: 24px;
          align-items: center;
          gap: 6px;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid var(--color-cursor-border);
          background: var(--color-cursor-panel);
          padding: 0 8px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          font-family: inherit;
          cursor: pointer;
        }
        .studio-settings-pill.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-border));
          color: var(--color-cursor-text-bright);
          background: color-mix(in srgb, var(--cursor-accent) 12%, transparent);
          box-shadow: 0 0 18px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-settings-floating-overlay {
          position: fixed;
          inset: 0;
          z-index: 360;
          padding: 0;
          pointer-events: auto;
        }
        .studio-side-sheet-overlay {
          display: block;
        }
        .studio-side-sheet-shell {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          z-index: 1;
          display: flex;
          min-width: 0;
          max-width: 100vw;
        }
        .studio-side-sheet-overlay .studio-settings-floating-backdrop {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .studio-settings-floating-backdrop {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: color-mix(in srgb, #000 34%, transparent);
          cursor: pointer;
        }
        .studio-side-sheet-resize {
          position: relative;
          z-index: 2;
          flex: 0 0 10px;
          width: 10px;
          align-self: stretch;
          margin-right: -5px;
          touch-action: none;
          cursor: ew-resize;
          background: var(--color-cursor-border-soft);
          transition: background 120ms ease, width 120ms ease;
        }
        .studio-polish.is-custom-cursor .studio-side-sheet-resize {
          cursor: var(--studio-cursor-resize-x, ew-resize) !important;
        }
        .studio-side-sheet-resize:hover,
        .studio-side-sheet-resize[data-resize-handle-active] {
          width: 12px;
          flex-basis: 12px;
          background: color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-border-soft));
        }
        .studio-side-sheet-shell .studio-settings-floating-panel {
          flex: 1 1 auto;
          min-width: 0;
          width: auto;
          height: 100%;
          overflow: hidden;
        }
        .studio-settings-floating-panel {
          position: relative;
          z-index: 1;
          display: flex;
          min-height: 0;
          flex-direction: column;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 14%, var(--color-cursor-border));
          border-width: 0 0 0 1px;
          border-radius: 0;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-panel) 94%, var(--mos-bg));
          box-shadow: none;
        }
        @media (max-width: 899px) {
          .studio-side-sheet-shell {
            width: min(100vw, 420px) !important;
          }
          .studio-side-sheet-resize {
            display: none;
          }
        }
        .studio-settings-floating-head {
          display: flex;
          min-height: 34px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--color-cursor-border);
          padding: 0 6px 0 10px;
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 700;
        }
        .studio-settings-workspace {
          display: flex;
          height: 100%;
          min-height: 0;
          flex-direction: column;
        }
        .studio-settings-workspace-head {
          display: flex;
          flex-shrink: 0;
          min-height: var(--cursor-head-h);
          height: var(--cursor-head-h);
          align-items: stretch;
          border-bottom: 1px solid var(--studio-chrome-divider);
          background: var(--color-cursor-sidebar);
          padding: 0;
        }
        .studio-settings-horizontal-menu {
          display: flex;
          flex: 1;
          min-width: 0;
          width: 100%;
          align-items: center;
          gap: 4px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 8px;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .studio-settings-horizontal-menu::-webkit-scrollbar {
          display: none;
        }
        .studio-settings-horizontal-menu button {
          display: inline-flex;
          flex: 0 0 auto;
          min-height: 24px;
          height: 24px;
          align-items: center;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: var(--cursor-radius-sm);
          background: color-mix(in srgb, var(--mos-surface) 64%, transparent);
          padding: 0 10px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          font-family: inherit;
          cursor: pointer;
        }
        .studio-settings-horizontal-menu button:hover,
        .studio-settings-horizontal-menu button.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 12%, var(--mos-surface));
          color: var(--color-cursor-text-bright);
        }
        .studio-settings-workspace-body {
          min-height: 0;
          flex: 1;
          overflow: auto;
          padding: 12px 14px 16px;
          display: grid;
          gap: 10px;
          align-content: start;
          width: 100%;
        }
        .studio-settings-stack {
          display: grid;
          gap: 14px;
        }
        .studio-settings-simple-card {
          padding: 0 !important;
        }
        .studio-settings-workspace .cursor-settings-section {
          border: 0;
          border-radius: 0;
          background: transparent;
          padding: 0 !important;
        }
        .studio-settings-workspace .studio-settings-billing-summary,
        .studio-settings-workspace .studio-settings-invoices-card {
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 82%, transparent);
          border-radius: 18px;
          background: color-mix(in srgb, var(--mos-surface) 58%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent),
            0 10px 28px color-mix(in srgb, #000 18%, transparent);
        }
        .studio-settings-billing-summary {
          display: grid;
          gap: 0;
        }
        .studio-settings-balance-block {
          display: grid;
          align-content: center;
          gap: 6px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 58%, transparent);
          background:
            radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--cursor-accent) 18%, transparent), transparent 46%),
            radial-gradient(circle at 12% 100%, color-mix(in srgb, var(--cursor-accent) 8%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-bg) 28%, transparent);
          padding: 18px 18px 16px;
        }
        .studio-settings-balance-block span,
        .studio-settings-balance-block small {
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .studio-settings-balance-block strong {
          color: var(--color-cursor-text-bright);
          font-size: 34px;
          font-weight: 750;
          line-height: 1.02;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .studio-settings-balance-block small {
          text-transform: none;
          letter-spacing: 0;
          font-weight: 500;
          font-size: 12px;
        }
        .studio-settings-stat-list {
          display: grid;
          margin: 0;
          padding: 6px 0;
        }
        .studio-settings-stat-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          min-height: 46px;
          padding: 0 18px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 48%, transparent);
        }
        .studio-settings-stat-row:last-child {
          border-bottom: 0;
        }
        .studio-settings-stat-row dt,
        .studio-settings-stat-row span:first-child {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          font-weight: 500;
        }
        .studio-settings-stat-row dd,
        .studio-settings-stat-row strong {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .studio-settings-invoices-card {
          padding: 16px 16px 12px;
        }
        .studio-settings-card-title {
          margin: 0 0 4px;
          padding: 0 2px 10px;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 750;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 48%, transparent);
        }
        .studio-settings-invoice-list {
          display: grid;
          gap: 0;
        }
        .studio-settings-invoice-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          min-height: 58px;
          padding: 12px 2px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 42%, transparent);
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-invoice-row:last-child {
          border-bottom: 0;
          padding-bottom: 2px;
        }
        .studio-settings-invoice-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .studio-settings-invoice-copy strong {
          overflow: hidden;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-settings-invoice-copy span {
          overflow: hidden;
          color: var(--color-cursor-muted);
          font-size: 11px;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-settings-invoice-meta {
          display: grid;
          justify-items: end;
          align-content: center;
          gap: 6px;
          min-width: 76px;
        }
        .studio-settings-invoice-amount {
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
          white-space: nowrap;
        }
        .studio-settings-invoice-meta a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 36%, transparent);
          padding: 0 10px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 650;
          line-height: 1;
          text-decoration: none;
          white-space: nowrap;
        }
        .studio-settings-invoice-meta a:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 34%, var(--color-cursor-hover));
        }
        .studio-settings-invoice-meta a[aria-disabled="true"] {
          pointer-events: none;
        }
        .studio-payment-review-actions {
          display: flex !important;
          align-items: center;
          justify-content: flex-end;
          gap: 6px !important;
        }
        .studio-payment-review-actions a,
        .studio-payment-review-actions button,
        .studio-payment-review-actions span {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-surface) 64%, transparent);
          padding: 5px 8px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 750;
          line-height: 1;
          text-decoration: none;
        }
        .studio-payment-review-actions button {
          cursor: pointer;
        }
        .studio-payment-review-actions button:hover,
        .studio-payment-review-actions a:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 34%, var(--color-cursor-hover));
        }
        .studio-settings-empty {
          margin: 0;
          padding: 8px 0 4px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-credit-switch {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 4px;
        }
        .studio-settings-credit-switch button {
          min-height: 30px;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: var(--cursor-radius-sm);
          background: color-mix(in srgb, var(--mos-surface) 54%, transparent);
          color: var(--color-cursor-muted);
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .studio-settings-credit-switch button.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 32%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 11%, var(--mos-surface));
          color: var(--color-cursor-text-bright);
        }
        .studio-settings-rate-strip {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .studio-settings-rate-strip span {
          display: grid;
          gap: 4px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--mos-bg) 38%, transparent);
          padding: 8px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-rate-strip b {
          color: var(--color-cursor-text-bright);
          font-size: 15px;
        }
        .studio-settings-plans {
          display: grid;
          gap: 8px;
          padding: 8px !important;
        }
        .studio-settings-plan-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          min-height: 82px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 76%, transparent);
          border-radius: 10px;
          background: color-mix(in srgb, var(--mos-surface) 46%, transparent);
          padding: 12px;
          color: inherit;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }
        .studio-settings-plan-copy {
          display: grid;
          min-width: 0;
          gap: 4px;
        }
        .studio-settings-plan-row:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 24%, var(--color-cursor-border-soft));
        }
        .studio-settings-plan-row.is-featured {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 8%, var(--mos-surface));
          box-shadow: 0 0 18px color-mix(in srgb, var(--cursor-accent) 8%, transparent);
        }
        .studio-settings-plan-row.is-discounted {
          border-color: color-mix(in srgb, var(--cursor-accent) 30%, var(--color-cursor-border-soft));
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 60%),
            color-mix(in srgb, var(--mos-surface) 52%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, #fff 9%, transparent),
            0 0 16px color-mix(in srgb, var(--cursor-accent) 9%, transparent);
        }
        .studio-settings-plan-row.is-discounted.is-featured {
          border-color: color-mix(in srgb, var(--cursor-accent) 38%, var(--color-cursor-border-soft));
          background:
            linear-gradient(135deg, color-mix(in srgb, var(--cursor-accent) 17%, transparent), transparent 60%),
            color-mix(in srgb, var(--cursor-accent) 8%, var(--mos-surface));
        }
        .studio-settings-plan-row h4,
        .studio-settings-plan-row p {
          margin: 0;
        }
        .studio-settings-plan-row h4 {
          color: var(--color-cursor-text-bright);
          font-size: 14px;
        }
        .studio-settings-plan-row p,
        .studio-settings-plan-price span {
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-plan-price {
          display: grid;
          justify-items: end;
          align-content: center;
          grid-template-rows: 22px 16px 20px;
          min-width: 132px;
          gap: 4px;
          white-space: nowrap;
        }
        .studio-settings-plan-price strong {
          color: var(--color-cursor-text-bright);
          font-size: 16px;
        }
        .studio-settings-price-line {
          display: inline-flex;
          align-items: baseline;
          justify-content: flex-end;
          gap: 6px;
          min-height: 22px;
        }
        .studio-settings-plan-price s {
          color: var(--color-cursor-muted);
          font-size: 11px;
          text-decoration-color: color-mix(in srgb, var(--cursor-accent) 52%, transparent);
        }
        .studio-settings-discount {
          display: inline-flex;
          width: max-content;
          min-height: 18px;
          align-items: center;
          justify-self: start;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 34%, transparent);
          background: color-mix(in srgb, var(--cursor-accent) 13%, transparent);
          padding: 2px 6px;
          color: var(--color-cursor-text-bright) !important;
          font-size: 10px !important;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .studio-settings-discount.is-empty {
          display: none;
        }
        .studio-settings-plan-choice {
          min-width: 0;
          min-height: 18px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 34%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 13%, transparent);
          padding: 2px 6px;
          color: var(--color-cursor-text-bright);
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          text-align: center;
          cursor: pointer;
        }
        .studio-settings-plan-choice:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 48%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 18%, transparent);
        }
        .studio-settings-payment-lead {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-settings-payment-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .studio-settings-payment-head h4,
        .studio-settings-payment-head p {
          margin: 0;
        }
        .studio-settings-payment-head h4 {
          color: var(--color-cursor-text-bright);
          font-size: 14px;
        }
        .studio-settings-payment-head p {
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-workspace .studio-settings-payment-card {
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 82%, transparent);
          border-radius: 18px;
          background: color-mix(in srgb, var(--mos-surface) 58%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent),
            0 10px 28px color-mix(in srgb, #000 18%, transparent);
          display: grid;
          gap: 0;
          padding: 0 !important;
        }
        .studio-settings-payment-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 58%, transparent);
          background:
            radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--cursor-accent) 18%, transparent), transparent 46%),
            color-mix(in srgb, var(--mos-bg) 28%, transparent);
          padding: 18px 18px 16px;
        }
        .studio-settings-payment-hero-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .studio-settings-payment-hero-copy span {
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .studio-settings-payment-hero-copy strong {
          color: var(--color-cursor-text-bright);
          font-size: 34px;
          font-weight: 750;
          line-height: 1.02;
          letter-spacing: -0.02em;
          font-variant-numeric: tabular-nums;
        }
        .studio-settings-payment-hero-copy small {
          color: var(--color-cursor-muted);
          font-size: 12px;
          font-weight: 500;
        }
        .studio-settings-payment-back {
          flex: 0 0 auto;
          min-height: 28px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 42%, transparent);
          padding: 0 12px;
          color: var(--color-cursor-text-bright);
          font: inherit;
          font-size: 11px;
          font-weight: 650;
          cursor: pointer;
        }
        .studio-settings-payment-back:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 12%, transparent);
        }
        .studio-settings-payment-body {
          display: grid;
          gap: 14px;
          padding: 16px 18px 18px;
        }
        .studio-settings-payment-step {
          display: grid;
          gap: 10px;
        }
        .studio-settings-payment-step-label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 700;
        }
        .studio-settings-payment-step-num {
          display: inline-grid;
          place-items: center;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          color: var(--color-cursor-text-bright);
          font-size: 10px;
          font-weight: 800;
        }
        .studio-settings-payment-amount-note {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-settings-bank-list,
        .studio-settings-feed {
          display: grid;
          gap: 8px;
        }
        .studio-bank-card-button {
          width: 100%;
          color: inherit;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
        }
        .studio-bank-card-button:hover,
        .studio-bank-card-button:focus-visible {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          outline: none;
        }
        .studio-settings-payment-status {
          margin: 0;
          color: var(--cursor-accent);
          font-size: 12px;
          font-weight: 650;
        }
        .studio-settings-payment-status.is-error {
          color: #ff8f8f;
        }
        .studio-bank-card.is-selected {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-settings-payment-card .studio-bank-card {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          border-radius: 14px;
          background: color-mix(in srgb, var(--mos-bg) 34%, transparent);
          padding: 12px;
          gap: 8px;
        }
        .studio-settings-payment-card .studio-bank-card-title {
          margin: 0 0 2px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .studio-settings-payment-card .studio-bank-row {
          background: transparent;
          border-radius: 0;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 42%, transparent);
          padding: 8px 0;
        }
        .studio-settings-payment-card .studio-bank-row:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }
        .studio-settings-payment-card .studio-bank-row strong {
          color: var(--color-cursor-text-bright);
          font-weight: 650;
        }
        .studio-settings-receipt-dropzone {
          display: grid;
          justify-items: center;
          gap: 6px;
          width: 100%;
          min-height: 132px;
          border: 1px dashed color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 58%),
            color-mix(in srgb, var(--mos-bg) 36%, transparent);
          padding: 18px 16px;
          color: var(--color-cursor-muted);
          text-align: center;
          cursor: pointer;
          font-family: inherit;
        }
        .studio-settings-receipt-dropzone.has-file {
          border-style: solid;
          color: var(--color-cursor-text);
        }
        .studio-settings-receipt-dropzone strong {
          color: var(--color-cursor-text-bright);
          font-size: 13px;
        }
        .studio-settings-receipt-dropzone span {
          font-size: 11px;
          line-height: 1.35;
        }
        .studio-settings-receipt-submit {
          width: 100%;
          min-height: 44px;
          border-radius: 12px !important;
          font-size: 13px !important;
          font-weight: 700 !important;
        }
        .studio-settings-receipt-submit:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .studio-settings-thankyou {
          display: grid;
          gap: 12px;
          text-align: center;
        }
        .studio-settings-thankyou-kicker {
          margin: 0;
          color: var(--cursor-accent);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .studio-settings-thankyou h3 {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: 20px;
        }
        .studio-settings-thankyou-lead {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .studio-settings-thankyou-summary {
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          border-radius: 14px;
          background: color-mix(in srgb, var(--mos-bg) 36%, transparent);
          padding: 4px 0;
          text-align: left;
        }
        .studio-settings-thankyou-summary .studio-settings-stat-row {
          padding-inline: 14px;
        }
        .studio-polish .studio-credit-pill {
          cursor: pointer;
        }
        .studio-polish .studio-credit-pill:hover:not(:disabled) {
          transform: none;
          box-shadow: none;
        }
        .studio-settings-feed p {
          display: grid;
          gap: 3px;
          margin: 0;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 68%, transparent);
          padding: 0 0 10px;
          color: var(--color-cursor-muted);
          font-size: 13px;
        }
        .studio-settings-feed p:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }
        .studio-settings-feed strong {
          color: var(--color-cursor-text-bright);
          font-size: 13px;
        }
        .studio-settings-workspace .studio-settings-activity-card {
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 82%, transparent);
          border-radius: 18px;
          background: color-mix(in srgb, var(--mos-surface) 58%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent),
            0 10px 28px color-mix(in srgb, #000 18%, transparent);
          padding: 0 !important;
        }
        .studio-settings-activity-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 48%, transparent);
          padding: 14px 16px 12px;
        }
        .studio-settings-activity-head strong {
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 750;
        }
        .studio-settings-activity-head span {
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 500;
        }
        .studio-settings-activity-list {
          display: grid;
          gap: 0;
          padding: 4px 0;
        }
        .studio-settings-activity-row {
          display: grid;
          grid-template-columns: 10px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          padding: 12px 16px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 36%, transparent);
        }
        .studio-settings-activity-row:last-child {
          border-bottom: 0;
        }
        .studio-settings-activity-tone {
          width: 8px;
          height: 8px;
          margin-top: 5px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-cursor-muted) 55%, transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-cursor-muted) 12%, transparent);
        }
        .studio-settings-activity-row.is-success .studio-settings-activity-tone {
          background: color-mix(in srgb, #5ddea8 88%, white);
          box-shadow: 0 0 0 3px color-mix(in srgb, #5ddea8 16%, transparent);
        }
        .studio-settings-activity-row.is-danger .studio-settings-activity-tone {
          background: color-mix(in srgb, #ff8f8f 88%, white);
          box-shadow: 0 0 0 3px color-mix(in srgb, #ff8f8f 16%, transparent);
        }
        .studio-settings-activity-row.is-payment .studio-settings-activity-tone {
          background: color-mix(in srgb, var(--cursor-accent) 82%, white);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-settings-activity-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .studio-settings-activity-title-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
        }
        .studio-settings-activity-title-row strong {
          overflow: hidden;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-settings-activity-title-row time {
          flex: 0 0 auto;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
        }
        .studio-settings-activity-copy p {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-settings-activity-count {
          display: inline-flex;
          align-items: center;
          margin-left: 6px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 48%, transparent);
          padding: 1px 7px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 700;
          vertical-align: middle;
        }
        .studio-settings-activity-empty {
          margin: 0;
          padding: 28px 18px;
          color: var(--color-cursor-muted);
          font-size: 13px;
          text-align: center;
        }
        .studio-polish .cursor-settings-body > .studio-settings-menu {
          padding: 0;
          background: transparent;
          border: 0;
        }
        .studio-settings-menu-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .studio-settings-menu-card {
          display: flex;
          aspect-ratio: 1 / 1;
          width: 100%;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--cursor-accent) 16%, transparent), transparent 45%),
            color-mix(in srgb, var(--mos-surface) 70%, transparent);
          padding: 14px;
          color: var(--color-cursor-text);
          text-align: center;
          cursor: pointer;
        }
        .studio-settings-menu-icon,
        .studio-account-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: 50px;
          height: 50px;
          border-radius: 18px;
          background: color-mix(in srgb, var(--cursor-accent) 18%, transparent);
          color: var(--cursor-accent);
          box-shadow: 0 0 22px var(--studio-glow-soft);
        }
        .studio-settings-menu-copy {
          display: grid;
          min-width: 0;
          justify-items: center;
        }
        .studio-settings-menu-copy strong {
          font-size: 14px;
          line-height: 1.2;
          color: var(--color-cursor-text-bright);
        }
        .studio-settings-launcher-menu {
          width: min(360px, calc(100vw - 24px));
          max-width: min(360px, calc(100vw - 24px)) !important;
          padding: 10px !important;
        }
        .studio-settings-launcher-menu .studio-settings-menu {
          width: 100%;
          max-width: none !important;
          padding: 0 !important;
          border: 0 !important;
          background: transparent !important;
          box-shadow: none;
        }
        @media (max-width: 420px) {
          .studio-settings-menu-grid {
            grid-template-columns: 1fr;
          }
        }
        .studio-account-card {
          display: grid;
          gap: 10px;
          padding: 10px !important;
        }
        .studio-settings-workspace .studio-account-card,
        .studio-settings-workspace .studio-settings-appearance-card {
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 82%, transparent);
          border-radius: 18px;
          background: color-mix(in srgb, var(--mos-surface) 58%, transparent);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent),
            0 10px 28px color-mix(in srgb, #000 18%, transparent);
          padding: 16px 18px !important;
        }
        .studio-settings-appearance-card .cursor-settings-section {
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .studio-settings-appearance-card h3 {
          margin: 0 0 4px;
          color: var(--color-cursor-text-bright);
          font-size: 14px;
          font-weight: 750;
        }
        .studio-settings-appearance-card .studio-settings-appearance-lead,
        .studio-settings-appearance-card > .cursor-settings-section > p:first-of-type {
          margin: 0 0 14px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-settings-appearance-group {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
        }
        .studio-settings-appearance-group:last-child {
          margin-bottom: 0;
        }
        .studio-settings-appearance-label {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .studio-settings-appearance-hint {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 11px;
          line-height: 1.35;
        }
        .studio-settings-cursor-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .studio-settings-cursor-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .studio-settings-cursor-copy strong {
          color: var(--color-cursor-text-bright);
          font-size: 14px;
          font-weight: 750;
        }
        .studio-settings-cursor-copy p {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-account-card-title {
          margin: 0 0 12px;
          color: var(--color-cursor-text-bright);
          font-size: 14px;
          font-weight: 750;
        }
        .studio-account-card-lead {
          margin: -6px 0 12px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-account-hero {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .studio-account-avatar {
          width: 58px;
          height: 58px;
          border-radius: 22px;
          font-size: 22px;
          font-weight: 800;
        }
        .studio-account-fields {
          display: grid;
          gap: 8px;
        }
        .studio-account-fields label {
          display: grid;
          gap: 6px;
        }
        .studio-account-fields span {
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .studio-account-fields input {
          height: 34px;
          border-radius: 9px;
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-bg) 46%, transparent);
          padding: 0 12px;
          color: var(--color-cursor-text);
          outline: none;
        }
        .studio-account-fields input:focus {
          border-color: color-mix(in srgb, var(--cursor-accent) 48%, var(--color-cursor-border-soft));
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-account-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .studio-account-actions .cursor-settings-action {
          width: auto;
          min-width: 124px;
        }
        .studio-account-saved {
          color: var(--cursor-accent);
          font-size: 12px;
          font-weight: 700;
        }
        .studio-api-keys-panel {
          width: 100%;
        }
        .studio-api-keys-lead {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.45;
        }
        .studio-api-keys-card {
          display: grid;
          gap: 10px;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 8%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-bg) 42%, transparent);
        }
        .studio-api-keys-form {
          display: grid;
          gap: 10px;
        }
        .studio-api-keys-scope-row {
          display: grid;
          gap: 6px;
        }
        .studio-api-keys-scope-label {
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .studio-api-keys-secret {
          display: block;
          padding: 10px 12px;
          border-radius: 9px;
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-bg) 56%, transparent);
          color: var(--color-cursor-text-bright);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          line-height: 1.45;
          word-break: break-all;
        }
        .studio-api-keys-rows {
          display: grid;
          gap: 2px;
        }
        .studio-api-keys-item {
          display: flex;
          min-height: 42px;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 70%, transparent);
          padding: 6px 0;
        }
        .studio-api-keys-item:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }
        .studio-api-keys-item-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .studio-api-keys-item-copy strong {
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 750;
        }
        .studio-api-keys-item-copy span {
          color: var(--color-cursor-muted);
          font-size: 11px;
        }
        .studio-api-keys-item-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 6px;
        }
        .studio-api-keys-item-actions .cursor-settings-action,
        .studio-api-keys-card .studio-account-actions .cursor-settings-action {
          width: auto;
          min-width: 0;
          min-height: 28px;
          padding: 0 10px;
          font-size: 11px;
        }
        .studio-api-keys-edit {
          display: grid;
          gap: 8px;
          width: 100%;
        }
        .studio-api-keys-status {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 12px;
          font-weight: 650;
        }
        .studio-api-keys-secret-card {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--cursor-accent) 14%, transparent), transparent 48%),
            color-mix(in srgb, var(--mos-bg) 42%, transparent);
        }
        .studio-section-head,
        .studio-billing-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .studio-section-kicker {
          margin-bottom: 3px;
          color: var(--cursor-accent);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .studio-rate-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          min-width: 190px;
          font-size: 10px;
          color: var(--color-cursor-muted);
        }
        .studio-rate-grid span,
        .studio-admin-chip {
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 9%, transparent);
          padding: 5px 8px;
        }
        .studio-rate-grid b {
          color: var(--color-cursor-text);
        }
        .studio-plan-grid,
        .studio-admin-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .studio-plan-card,
        .studio-bank-card {
          position: relative;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          border-radius: 16px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--mos-surface) 58%, transparent), color-mix(in srgb, var(--mos-bg) 88%, transparent));
          padding: 10px;
        }
        .studio-plan-card.is-featured {
          border-color: color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-border-soft));
          box-shadow: 0 0 26px color-mix(in srgb, var(--cursor-accent) 13%, transparent);
        }
        .studio-plan-badge {
          display: inline-flex;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          padding: 3px 7px;
          color: var(--cursor-accent);
          font-size: 10px;
          font-weight: 700;
        }
        .studio-plan-card h4 {
          margin-top: 8px;
          color: var(--color-cursor-text);
          font-size: 13px;
          font-weight: 700;
        }
        .studio-plan-price {
          margin-top: 4px;
          color: var(--color-cursor-text-bright);
          font-size: 20px;
          font-weight: 750;
        }
        .studio-plan-sub,
        .studio-plan-card li {
          color: var(--color-cursor-muted);
          font-size: 11px;
        }
        .studio-plan-card ul {
          margin-top: 8px;
          display: grid;
          gap: 4px;
        }
        .studio-bank-card {
          padding: 12px;
          font-size: 12px;
          color: var(--color-cursor-muted);
        }
        .studio-admin-panel {
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--cursor-accent) 18%, transparent), transparent 44%),
            color-mix(in srgb, var(--mos-surface) 38%, transparent) !important;
        }
        @media (max-width: 760px) {
          .studio-settings-billing-summary,
          .studio-settings-invoices-card,
          .studio-settings-rate-strip {
            grid-template-columns: 1fr;
          }
          .studio-settings-plan-row {
            align-items: flex-start;
            flex-direction: column;
          }
          .studio-settings-plan-price {
            justify-items: start;
            width: 100%;
          }
          .studio-billing-hero,
          .studio-section-head {
            flex-direction: column;
          }
          .studio-rate-grid,
          .studio-plan-grid,
          .studio-admin-grid {
            grid-template-columns: 1fr;
            width: 100%;
          }
          .studio-admin-payment-layout {
            grid-template-columns: 1fr;
          }
          .studio-admin-hero-card,
          .studio-admin-table-head,
          .studio-admin-hero-actions {
            align-items: stretch;
            flex-direction: column;
          }
          .studio-admin-quick-links {
            max-width: 42vw;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .studio-admin-quick-link {
            min-width: 72px;
            flex: 0 0 auto;
          }
          .studio-admin-filter-tabs {
            justify-content: flex-start;
          }
        }
        .studio-polish .cursor-settings-action:hover,
        .studio-polish .theme-chip:hover {
          box-shadow: none;
        }
        .studio-polish .cursor-composer-box:focus-within {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, rgba(255, 255, 255, 0.12));
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          box-shadow:
            var(--studio-composer-glass-shadow),
            0 0 28px color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          transition:
            border-color 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            box-shadow 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            backdrop-filter 1000ms cubic-bezier(0.45, 0, 0.2, 1);
        }
        .studio-polish .cursor-composer-box:focus-within::before {
          opacity: 1;
        }
        .studio-polish .studio-composer.cursor-composer-shell {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 30;
          background: transparent !important;
          pointer-events: none;
        }
        .studio-polish .studio-composer.cursor-composer-shell > * {
          pointer-events: auto;
        }
        .studio-polish .studio-inline-tag:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 58%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 28%, transparent), transparent 70%),
            color-mix(in srgb, var(--cursor-accent) 20%, var(--color-cursor-hover));
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 18%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--color-cursor-text-bright) 14%, transparent);
        }
        .studio-polish .cursor-resize {
          position: relative;
          z-index: 20;
          width: 12px !important;
          margin-inline: -6px;
          flex: 0 0 12px;
          background: transparent !important;
          box-shadow: none !important;
          transition: none;
        }
        .studio-polish .cursor-resize:hover,
        .studio-polish .cursor-resize[data-resize-handle-active] {
          background: transparent !important;
          box-shadow: none !important;
        }
        .studio-polish .desk-file-list-head {
          display: none;
        }
        .studio-polish .desk-file-list {
          padding: 4px 6px 8px;
          gap: 1px;
        }
        .studio-polish .cursor-file-grid {
          padding: 8px 8px 12px;
          grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          grid-auto-rows: auto;
        }
        .studio-polish .desk-file-preview-grid {
          padding: 8px 8px 12px;
        }
        .studio-polish .desk-file-list-row {
          min-height: 28px;
          border-color: transparent !important;
          border-radius: 8px;
          background: transparent !important;
          box-shadow: none;
        }
        .studio-polish .desk-file-list-meta {
          color: var(--color-cursor-muted);
          font-size: 10px;
          opacity: 0.72;
        }
        .studio-polish .desk-file-list-name {
          min-width: 0;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.2;
        }
        .studio-polish .desk-file-list-name .truncate {
          min-width: 0;
          font-weight: 500;
        }
        .studio-polish .desk-file-list-row:hover {
          border-color: transparent !important;
          background: var(--studio-grid-tile-hover) !important;
          box-shadow: none;
          transform: none;
        }
        .studio-polish .desk-file-list-row.is-parent-row {
          min-height: 28px;
          justify-content: flex-start;
          border: none !important;
          border-radius: 8px;
          background: var(--studio-grid-tile-bg) !important;
          box-shadow: none;
        }
        .studio-polish .desk-file-list-row.is-parent-row:hover {
          background: var(--studio-grid-tile-hover) !important;
          box-shadow: none;
          transform: none;
        }
        .studio-polish .cursor-file-grid,
        .studio-polish .desk-file-preview-grid {
          gap: 10px;
          align-content: start;
        }
        .studio-polish .desk-file-grid-item,
        .studio-polish .desk-file-preview-item {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 6px;
          min-height: 0;
          padding: 0;
          border: none !important;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none !important;
          overflow: visible;
          transform: none;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb,
        .studio-polish .desk-file-preview-item .desk-file-thumb {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 100%;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item .desk-file-thumb-visual {
          flex: 0 0 auto;
          aspect-ratio: 1 / 1;
          height: auto;
          width: 100%;
          margin: 0;
          border: none;
          border-radius: 10px;
          background: var(--studio-grid-tile-bg) !important;
          box-shadow: none;
          overflow: hidden;
          transition: background-color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish .desk-file-grid-item:has(.desk-file-thumb-folder) .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item:has(.desk-file-thumb-folder) .desk-file-thumb-visual {
          background: var(--studio-grid-folder-tile-bg, var(--studio-grid-tile-bg)) !important;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-visual:has(.desk-file-thumb-peek-wrap:not(.desk-file-thumb-peek-wrap--folder-peek)),
        .studio-polish .desk-file-preview-item .desk-file-thumb-visual:has(.desk-file-thumb-peek-wrap:not(.desk-file-thumb-peek-wrap--folder-peek)) {
          clip-path: inset(0 round 10px);
        }
        .studio-polish .desk-file-grid-item:has(.desk-file-thumb-peek-wrap--folder) .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item:has(.desk-file-thumb-peek-wrap--folder) .desk-file-thumb-visual {
          background: var(--studio-grid-folder-tile-bg, var(--studio-grid-tile-bg)) !important;
        }
        .studio-polish .desk-file-grid-item:has(.desk-file-thumb-peek-wrap--folder-peek) .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item:has(.desk-file-thumb-peek-wrap--folder-peek) .desk-file-thumb-visual {
          overflow: visible;
          clip-path: none;
        }
        .studio-polish .desk-file-grid-item:has(.desk-file-thumb-folder--peek) .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item:has(.desk-file-thumb-folder--peek) .desk-file-thumb-visual {
          overflow: visible;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-peek-wrap .desk-file-thumb-badge,
        .studio-polish .desk-file-preview-item .desk-file-thumb-peek-wrap .desk-file-thumb-badge {
          inset: auto auto calc(var(--desk-peek-label-band) + 6px) 6px;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: rgba(10, 12, 16, 0.62);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
          color: rgba(255, 255, 255, 0.92);
          z-index: 3;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-peek-wrap--folder .desk-file-thumb-badge,
        .studio-polish .desk-file-preview-item .desk-file-thumb-peek-wrap--folder .desk-file-thumb-badge {
          color: var(--color-cursor-text);
        }
        [data-appearance="light"] .studio-polish .desk-file-grid-item .desk-file-thumb-peek-wrap--folder .desk-file-thumb-badge,
        [data-appearance="light"] .studio-polish .desk-file-preview-item .desk-file-thumb-peek-wrap--folder .desk-file-thumb-badge {
          background: rgba(255, 255, 255, 0.78);
          color: var(--color-cursor-text);
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-badge svg,
        .studio-polish .desk-file-preview-item .desk-file-thumb-badge svg {
          width: 11px;
          height: 11px;
          stroke-width: 2.25;
          filter: none;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-folder svg,
        .studio-polish .desk-file-preview-item .desk-file-thumb-folder svg {
          opacity: 1;
          color: var(--color-cursor-text) !important;
          transition: opacity var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-fallback svg,
        .studio-polish .desk-file-preview-item .desk-file-thumb-fallback svg {
          opacity: 0.54;
          transition: opacity var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish .desk-file-grid-item:hover .desk-file-thumb-folder svg,
        .studio-polish .desk-file-preview-item:hover .desk-file-thumb-folder svg {
          opacity: 1;
        }
        .studio-polish .desk-file-grid-item:hover .desk-file-thumb-fallback svg,
        .studio-polish .desk-file-preview-item:hover .desk-file-thumb-fallback svg {
          opacity: 0.82;
        }
        [data-appearance="light"] .studio-polish .desk-file-grid-item .desk-file-thumb-folder svg,
        [data-appearance="light"] .studio-polish .desk-file-preview-item .desk-file-thumb-folder svg {
          opacity: 1;
          color: var(--color-cursor-text) !important;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-folder .desk-file-entry-icon--pinned,
        .studio-polish .desk-file-preview-item .desk-file-thumb-folder .desk-file-entry-icon--pinned {
          color: var(--cursor-accent) !important;
        }
        [data-appearance="light"] .studio-polish .desk-file-grid-item .desk-file-thumb-fallback svg,
        [data-appearance="light"] .studio-polish .desk-file-preview-item .desk-file-thumb-fallback svg {
          opacity: 0.46;
        }
        [data-appearance="light"] .studio-polish .desk-file-grid-item:hover .desk-file-thumb-folder svg,
        [data-appearance="light"] .studio-polish .desk-file-preview-item:hover .desk-file-thumb-folder svg {
          opacity: 1;
        }
        [data-appearance="light"] .studio-polish .desk-file-grid-item:hover .desk-file-thumb-fallback svg,
        [data-appearance="light"] .studio-polish .desk-file-preview-item:hover .desk-file-thumb-fallback svg {
          opacity: 0.78;
        }
        [data-appearance="light"] .studio-polish .desk-file-breadcrumbs-chip {
          opacity: 0.82;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-label,
        .studio-polish .desk-file-preview-item .desk-file-thumb-label {
          display: block;
          min-height: 0;
          max-height: none;
          padding: 0 1px;
          border: none !important;
          background: transparent !important;
          color: var(--color-cursor-text);
          opacity: 1;
          overflow: hidden;
          white-space: nowrap;
          font-size: 10.5px;
          font-weight: 500;
          line-height: 1.2;
          text-align: center;
          text-overflow: ellipsis;
          text-shadow: none;
          transition: color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish .desk-file-grid-item:hover,
        .studio-polish .desk-file-preview-item:hover {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          transform: none;
        }
        .studio-polish .desk-file-grid-item:hover .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item:hover .desk-file-thumb-visual {
          background: var(--studio-grid-tile-hover) !important;
          box-shadow: none !important;
        }
        .studio-polish .desk-file-grid-item:has(.desk-file-thumb-folder):hover .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item:has(.desk-file-thumb-folder):hover .desk-file-thumb-visual {
          background: var(--studio-grid-folder-tile-hover, var(--studio-grid-tile-hover)) !important;
        }
        .studio-polish .desk-file-grid-item:hover .desk-file-thumb-label,
        .studio-polish .desk-file-preview-item:hover .desk-file-thumb-label {
          color: var(--color-cursor-text);
          opacity: 1;
        }
        .studio-polish .desk-file-grid-item[aria-selected="true"],
        .studio-polish .desk-file-preview-item[aria-selected="true"],
        .studio-polish .desk-file-grid-item.is-selected,
        .studio-polish .desk-file-preview-item.is-selected {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .studio-polish .desk-file-grid-item[aria-selected="true"] .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item[aria-selected="true"] .desk-file-thumb-visual,
        .studio-polish .desk-file-grid-item.is-selected .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item.is-selected .desk-file-thumb-visual {
          background: var(--studio-grid-tile-selected) !important;
          box-shadow: none;
        }
        .studio-polish .desk-file-grid-item[aria-selected="true"] .desk-file-thumb-label,
        .studio-polish .desk-file-preview-item[aria-selected="true"] .desk-file-thumb-label,
        .studio-polish .desk-file-grid-item.is-selected .desk-file-thumb-label,
        .studio-polish .desk-file-preview-item.is-selected .desk-file-thumb-label {
          color: var(--color-cursor-text);
        }
        .studio-polish .desk-file-grid-item[aria-selected="true"]:hover .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item[aria-selected="true"]:hover .desk-file-thumb-visual,
        .studio-polish .desk-file-grid-item.is-selected:hover .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item.is-selected:hover .desk-file-thumb-visual {
          box-shadow: none !important;
        }
        .studio-polish .desk-file-list-row[aria-selected="true"],
        .studio-polish .desk-file-list-row.is-selected {
          border-color: transparent !important;
          background: var(--studio-grid-tile-selected) !important;
          box-shadow: none;
        }
        .studio-polish .desk-file-list-row[aria-selected="true"]:hover,
        .studio-polish .desk-file-list-row.is-selected:hover {
          box-shadow: none;
        }
        .studio-polish .desk-file-grid-item.is-drag-over,
        .studio-polish .desk-file-preview-item.is-drag-over {
          border: none !important;
          background: transparent !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow: none !important;
        }
        .studio-polish .desk-file-grid-item.is-drag-over .desk-file-thumb-visual,
        .studio-polish .desk-file-preview-item.is-drag-over .desk-file-thumb-visual {
          background: var(--studio-grid-tile-hover) !important;
          box-shadow: none !important;
        }
        .studio-folder-pathbar {
          display: flex;
          align-items: center;
          gap: 4px;
          border-bottom: 1px solid var(--studio-chrome-divider);
          background: var(--color-cursor-sidebar);
        }
        .studio-polish .cursor-explorer-body {
          background: var(--mos-sidebar);
        }
        .studio-polish .cursor-panel-search {
          min-height: 32px;
          height: 32px;
          border-bottom: 1px solid var(--studio-chrome-divider);
          background: var(--color-cursor-sidebar);
        }
        .studio-polish .cursor-panel-search-input {
          font-size: 11.5px;
        }
        .studio-polish .cursor-panel-search-input::placeholder {
          opacity: 0.68;
        }
        .studio-polish .cursor-panel-search-input:focus,
        .studio-polish .cursor-panel-search-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .studio-polish .desk-file-breadcrumbs {
          min-height: 38px;
          border-bottom: none;
          background: transparent;
        }
        .studio-polish .desk-file-breadcrumbs-track {
          gap: 4px;
          padding: 5px 10px;
        }
        .studio-polish .desk-file-breadcrumbs-chip {
          border-radius: 8px;
          min-height: 32px;
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 550;
          line-height: 1.2;
          color: var(--color-cursor-muted);
        }
        .studio-polish .desk-file-breadcrumbs-chip.is-current {
          background: var(--studio-grid-tile-bg);
          color: var(--color-cursor-text);
        }
        .studio-polish.is-studio-mobile .desk-file-breadcrumbs-chip {
          min-height: 36px;
          padding: 8px 14px;
          font-size: 14px;
        }
        .studio-polish.is-studio-mobile .desk-file-breadcrumbs-sep {
          width: 14px;
          height: 14px;
        }
        .studio-polish.is-studio-mobile .desk-file-breadcrumbs-sep svg {
          width: 14px !important;
          height: 14px !important;
        }
        @media (max-width: 899px) {
          .studio-polish.is-studio-mobile .cursor-panel-search {
            min-height: var(--studio-mobile-nav-height, 44px) !important;
            height: var(--studio-mobile-nav-height, 44px) !important;
          }
          .studio-polish.is-studio-mobile .desk-file-breadcrumbs {
            min-height: var(--studio-mobile-nav-height, 44px) !important;
            height: var(--studio-mobile-nav-height, 44px) !important;
          }
        }
        .studio-polish .desk-file-search-divider {
          display: flex;
          align-items: center;
          min-height: 22px;
          padding: 8px 8px 2px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          opacity: 0.62;
        }
        .studio-polish .cursor-file-grid .desk-file-search-divider,
        .studio-polish .desk-file-preview-grid .desk-file-search-divider {
          grid-column: 1 / -1;
          height: auto;
          min-height: 22px;
        }
        @media (prefers-reduced-motion: reduce) {
          .studio-polish *,
          .studio-polish *::before,
          .studio-polish *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
        .cursor-panel-search-input:focus {
          outline: none !important;
          box-shadow: none !important;
          border-color: transparent !important;
        }
        .cursor-attach-tile-open {
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring) !important;
        }
        .studio-composer .cursor-attach-tile-open {
          border-color: var(--studio-composer-glass-border) !important;
          background: var(--studio-composer-glass-muted) !important;
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
        }
        .cursor-attach-tile-open:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border)) !important;
          box-shadow: 0 0 18px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-composer .cursor-composer {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          width: 100%;
          max-width: min(var(--studio-composer-shell-max), calc(100% - 24px));
          margin: 0 auto;
          position: relative;
          left: -5px;
          padding: 2px 10px max(8px, env(safe-area-inset-bottom, 8px));
          background: transparent !important;
        }
        .studio-composer-row {
          position: relative;
          isolation: auto;
          display: flex;
          align-items: stretch;
          gap: var(--studio-composer-row-gap);
          width: 100%;
          min-width: 0;
        }
        .studio-composer .cursor-composer-box {
          position: relative;
          overflow: hidden;
          display: flex;
          align-self: stretch;
          min-height: var(--studio-composer-min-height);
          flex: 1 1 auto;
          flex-direction: column;
          min-width: 0;
          border: 1px solid var(--studio-composer-glass-border) !important;
          border-radius: 16px;
          background: var(--studio-composer-glass) !important;
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          box-shadow: var(--studio-composer-glass-shadow);
          transition:
            border-color 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            box-shadow 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            background 1000ms cubic-bezier(0.45, 0, 0.2, 1);
          padding: 0 !important;
        }
        .studio-composer .cursor-composer-box::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          z-index: 3;
          width: 320px;
          height: 170px;
          border-radius: 16px 0 0 0;
          border-top: 2px solid color-mix(in srgb, var(--cursor-accent) 96%, transparent);
          border-left: 2px solid color-mix(in srgb, var(--cursor-accent) 96%, transparent);
          background: transparent;
          mask-image: radial-gradient(ellipse at 0 0, #000 0%, rgba(0, 0, 0, 0.45) 10%, rgba(0, 0, 0, 0.12) 18%, transparent 26%);
          -webkit-mask-image: radial-gradient(ellipse at 0 0, #000 0%, rgba(0, 0, 0, 0.45) 10%, rgba(0, 0, 0, 0.12) 18%, transparent 26%);
          opacity: 0.78;
          transition:
            width 2500ms var(--studio-composer-focus-line-ease),
            height 2500ms var(--studio-composer-focus-line-ease),
            border-color 2500ms var(--studio-composer-focus-line-ease),
            opacity 2500ms var(--studio-composer-focus-line-ease);
          pointer-events: none;
        }
        .studio-composer .cursor-composer-box:focus-within::before {
          width: 800px;
          height: 400px;
          border-top-color: var(--cursor-accent);
          border-left-color: var(--cursor-accent);
          opacity: 1;
          transition:
            width 2500ms var(--studio-composer-focus-line-ease),
            height 2500ms var(--studio-composer-focus-line-ease),
            border-color 2500ms var(--studio-composer-focus-line-ease),
            opacity 2500ms var(--studio-composer-focus-line-ease);
        }
        .studio-composer .cursor-composer-box::after {
          content: "";
          position: absolute;
          right: 0;
          bottom: 0;
          z-index: 3;
          width: 290px;
          height: 150px;
          border-radius: 0 0 16px 0;
          border-right: 2px solid color-mix(in srgb, var(--cursor-accent) 86%, transparent);
          border-bottom: 2px solid color-mix(in srgb, var(--cursor-accent) 86%, transparent);
          background: transparent;
          mask-image: radial-gradient(ellipse at 100% 100%, #000 0%, rgba(0, 0, 0, 0.45) 10%, rgba(0, 0, 0, 0.12) 18%, transparent 26%);
          -webkit-mask-image: radial-gradient(ellipse at 100% 100%, #000 0%, rgba(0, 0, 0, 0.45) 10%, rgba(0, 0, 0, 0.12) 18%, transparent 26%);
          opacity: 0.78;
          transition:
            width 2500ms var(--studio-composer-focus-line-ease),
            height 2500ms var(--studio-composer-focus-line-ease),
            border-color 2500ms var(--studio-composer-focus-line-ease),
            opacity 2500ms var(--studio-composer-focus-line-ease);
          pointer-events: none;
        }
        .studio-composer .cursor-composer-box:focus-within::after {
          width: 760px;
          height: 380px;
          border-right-color: var(--cursor-accent);
          border-bottom-color: var(--cursor-accent);
          opacity: 1;
          transition:
            width 2500ms var(--studio-composer-focus-line-ease),
            height 2500ms var(--studio-composer-focus-line-ease),
            border-color 2500ms var(--studio-composer-focus-line-ease),
            opacity 2500ms var(--studio-composer-focus-line-ease);
        }
        .studio-composer .cursor-composer-box > * {
          position: relative;
          z-index: 1;
        }
        .studio-mode-switcher {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 4px;
          flex: 0 0 var(--studio-mode-switcher-width);
          width: var(--studio-mode-switcher-width);
          min-height: 88px;
          align-self: stretch;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 14px;
          background: var(--studio-composer-glass);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          box-shadow: var(--studio-composer-glass-shadow);
          padding: 5px;
        }
        .studio-mode-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          min-width: 0;
          min-height: 0;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 9px;
          background: transparent;
          padding: 5px 4px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          line-height: 1.1;
          text-align: center;
          cursor: pointer;
          transform-origin: center center;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-mode-row svg {
          width: 15px;
          height: 15px;
          flex: 0 0 auto;
          stroke-width: 2.15;
        }
        .studio-mode-row:hover {
          color: var(--color-cursor-text);
          transform: none;
        }
        .studio-mode-row.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border-soft));
          color: var(--color-cursor-text-bright);
        }
        .studio-mode-row span {
          display: block;
          width: 100%;
          min-width: 0;
          overflow: visible;
          white-space: nowrap;
        }
        .studio-composer .cursor-composer-box.is-preset-open {
          overflow: visible;
        }
        .studio-composer .cursor-composer-box.is-preset-open > *:not(.studio-preset-grid-panel) {
          position: relative;
          z-index: 1;
        }
        .studio-composer .cursor-composer-box .studio-preset-grid-panel {
          position: absolute;
          left: 8px;
          right: auto;
          bottom: calc(100% + 10px);
          z-index: 40;
          width: min(360px, calc(100% - 16px));
          max-width: min(360px, calc(100% - 16px));
        }
        .studio-preset-grid-panel {
          position: absolute;
          left: 8px;
          right: auto;
          bottom: calc(100% + 10px);
          z-index: 40;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 0;
          width: min(360px, calc(100% - 16px));
          max-width: min(360px, calc(100% - 16px));
          max-height: min(72vh, 520px);
          overflow: visible;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 18px;
          background: color-mix(in srgb, var(--studio-composer-glass-strong) 88%, transparent);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          box-shadow: var(--studio-composer-glass-shadow);
          padding: 12px;
          isolation: isolate;
          animation: studio-preset-grid-in 180ms var(--studio-motion-ease);
        }
        @keyframes studio-preset-grid-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .studio-preset-grid-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex: 0 0 auto;
          min-height: 28px;
          padding: 0 2px;
        }
        .studio-preset-grid-head strong {
          font-size: 12px;
          font-weight: 700;
          color: var(--color-cursor-text-bright);
        }
        .studio-preset-grid-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 999px;
          background: var(--studio-composer-glass-muted);
          color: var(--color-cursor-muted);
          cursor: pointer;
        }
        .studio-preset-grid-close:hover {
          color: var(--color-cursor-text);
          background: color-mix(in srgb, var(--studio-composer-glass-muted) 72%, var(--color-cursor-hover) 28%);
        }
        .studio-preset-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          flex: 1 1 auto;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          margin: 0 -4px;
          padding: 8px 4px 12px;
          scrollbar-width: thin;
        }
        .studio-preset-grid::-webkit-scrollbar {
          width: 6px;
        }
        .studio-preset-grid::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-cursor-muted) 42%, transparent);
        }
        .studio-preset-grid-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 12px;
          background: transparent;
          padding: 6px;
          text-align: left;
          cursor: pointer;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease);
        }
        .studio-preset-grid-card:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--studio-composer-glass-muted) 76%, var(--cursor-accent-dim) 24%);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
        }
        .studio-preset-grid-card.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--studio-composer-glass-muted) 68%, var(--cursor-accent-dim) 32%);
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 24%, transparent),
            0 8px 18px rgba(0, 0, 0, 0.24);
        }
        .studio-preset-grid-thumb {
          position: relative;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          border-radius: 10px;
          background: color-mix(in srgb, #000 42%, var(--studio-composer-glass-strong) 58%);
        }
        .studio-preset-grid-thumb.is-direct-clean {
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--cursor-accent) 22%, transparent), transparent 58%),
            linear-gradient(
              155deg,
              color-mix(in srgb, var(--mos-surface) 70%, var(--cursor-accent-dim)),
              color-mix(in srgb, var(--mos-bg) 82%, var(--mos-surface))
            );
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 10%, transparent);
        }
        .studio-preset-grid-thumb.is-direct-clean .studio-preset-direct-mark {
          color: color-mix(in srgb, var(--cursor-accent) 72%, var(--color-cursor-text-bright));
        }
        .studio-preset-grid-thumb.is-create-sheet {
          background: color-mix(in srgb, var(--mos-surface) 42%, transparent);
          border: 1px dashed color-mix(in srgb, var(--cursor-accent) 32%, var(--color-cursor-border-soft));
        }
        .studio-preset-grid-thumb.is-create-sheet .studio-preset-grid-thumb-fallback {
          color: color-mix(in srgb, var(--cursor-accent) 78%, var(--color-cursor-text));
        }
        .studio-preset-grid-card--create:hover .studio-preset-grid-thumb.is-create-sheet {
          border-color: color-mix(in srgb, var(--cursor-accent) 52%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 8%, var(--mos-surface));
        }
        .studio-preset-trigger-direct {
          width: 100%;
          height: 100%;
          border-radius: inherit;
        }
        .studio-preset-trigger-sheet-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: inherit;
        }
        .studio-preset-grid-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .studio-preset-grid-thumb-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          color: color-mix(in srgb, var(--cursor-accent) 70%, white);
        }
        .studio-preset-grid-copy strong {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: var(--color-cursor-text-bright);
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-composer .studio-pill-btn.studio-preset-trigger {
          height: 30px;
          min-height: 30px;
          max-width: min(148px, 34vw);
          padding: 0 8px 0 4px;
          gap: 5px;
          font-size: 11px;
          font-weight: 650;
          line-height: 1;
        }
        .studio-preset-trigger {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: var(--cursor-radius-pill);
          background: var(--studio-composer-glass-muted);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          color: var(--color-cursor-text);
          cursor: pointer;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            background var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-preset-trigger:hover,
        .studio-preset-trigger.is-open {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--studio-composer-glass-muted) 64%, var(--cursor-accent-dim) 36%);
        }
        .studio-preset-trigger-thumb {
          flex: 0 0 auto;
          width: 22px;
          height: 22px;
          overflow: hidden;
          border-radius: 999px;
          background: color-mix(in srgb, #000 36%, var(--studio-composer-glass-strong) 64%);
        }
        .studio-preset-trigger-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .studio-preset-trigger-copy {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: left;
          font-size: 11px;
          font-weight: 650;
          line-height: 1;
          color: var(--color-cursor-text-bright);
        }
        .studio-preset-trigger svg {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
          opacity: 0.72;
        }
        .studio-composer .cursor-composer-textarea,
        .studio-composer .cursor-composer-textarea.cursor-composer-mention-editor {
          --studio-composer-line-size: 28px;
          --studio-composer-text-size: 16px;
          --studio-composer-chip-size: 22px;
          --studio-composer-chip-font-size: 11px;
          --studio-composer-chip-media-size: 16px;
          --studio-composer-chip-icon-size: 8px;
          --studio-composer-chip-lift: 0px;
          flex: 0 1 auto;
          align-self: auto;
          width: 100%;
          height: auto;
          min-height: var(--studio-composer-line-size) !important;
          max-height: 100%;
          overflow-y: auto;
          padding: 0 !important;
          margin: 0;
          border: 0;
          font-size: var(--studio-composer-text-size);
          line-height: var(--studio-composer-line-size) !important;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .studio-composer .cursor-composer-mention-editor:empty::before {
          color: color-mix(in srgb, var(--color-cursor-text) 58%, transparent) !important;
          opacity: 0.58;
          font-size: var(--studio-composer-text-size);
          line-height: var(--studio-composer-line-size);
        }
        .studio-composer .cursor-composer-box:focus-within .cursor-composer-mention-editor:empty::before {
          color: color-mix(in srgb, var(--color-cursor-text-bright) 66%, transparent) !important;
          opacity: 0.66;
        }
        .studio-composer-inputline {
          position: relative;
          display: flex;
          flex: 1 1 auto;
          flex-direction: column;
          justify-content: flex-start;
          min-height: 0;
          align-items: stretch;
          padding: 6px 10px 4px;
          overflow: hidden;
        }
        .studio-composer-selection-layer {
          position: absolute;
          inset: 0;
          z-index: 1;
          overflow: hidden;
          pointer-events: none;
        }
        .studio-composer-selection-pill {
          position: absolute;
          border-radius: 4px;
          background: color-mix(in srgb, var(--cursor-accent) 46%, var(--color-cursor-hover));
        }
        .studio-composer .cursor-composer-mention-editor {
          position: relative;
          z-index: 2;
        }
        .studio-composer .studio-inline-tag {
          display: inline-flex;
          height: var(--studio-composer-chip-size, 28px);
          max-width: min(220px, 48vw);
          align-items: center;
          justify-content: center;
          gap: 2px;
          margin: 0;
          margin-top: calc(
            (var(--studio-composer-line-size) - var(--studio-composer-chip-size)) / 2 -
            var(--studio-composer-chip-lift, 2px)
          );
          vertical-align: top;
          box-sizing: border-box;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 22%, transparent), transparent 72%),
            color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-hover));
          padding: 0 4px;
          color: var(--color-cursor-text-bright);
          font-family: inherit;
          font-size: var(--studio-composer-chip-font-size, 13px);
          font-weight: inherit;
          line-height: 1;
          white-space: nowrap;
          cursor: grab;
          user-select: none;
          -webkit-user-select: none;
          overflow: hidden;
          isolation: isolate;
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 12%, transparent);
        }
        .studio-composer .composer-inline-mention {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: var(--studio-composer-chip-size, 28px);
          height: var(--studio-composer-chip-size, 28px);
          margin: 0;
          margin-top: calc(
            (var(--studio-composer-line-size) - var(--studio-composer-chip-size)) / 2 -
            var(--studio-composer-chip-lift, 2px)
          );
          padding: 0 4px;
          vertical-align: top;
          font-family: inherit;
          font-size: var(--studio-composer-chip-font-size, 13px);
          font-weight: inherit;
          line-height: 1;
          overflow: hidden;
          isolation: isolate;
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 12%, transparent);
        }
        .studio-composer .composer-inline-mention--with-icon {
          height: var(--studio-composer-chip-size, 28px);
          line-height: 1;
        }
        .studio-composer .composer-inline-mention--image {
          width: var(--studio-composer-chip-size, 28px);
          height: var(--studio-composer-chip-size, 28px);
          margin: 0;
          margin-top: calc(
            (var(--studio-composer-line-size) - var(--studio-composer-chip-size)) / 2 -
            var(--studio-composer-chip-lift, 2px)
          );
          vertical-align: top;
        }
        .studio-composer .composer-inline-mention--with-icon .composer-inline-mention-icon {
          width: var(--studio-composer-chip-icon-size, 9px);
          height: var(--studio-composer-chip-icon-size, 9px);
        }
        .studio-composer .composer-inline-mention--with-icon .composer-inline-mention-icon svg {
          width: var(--studio-composer-chip-icon-size, 9px);
          height: var(--studio-composer-chip-icon-size, 9px);
        }
        .studio-composer .cursor-composer-mention-editor::selection,
        .studio-composer .cursor-composer-mention-editor *::selection {
          background: transparent;
          color: inherit;
          text-shadow: none;
        }
        .studio-composer .cursor-composer-mention-editor::-moz-selection,
        .studio-composer .cursor-composer-mention-editor *::-moz-selection {
          background: transparent;
          color: inherit;
          text-shadow: none;
        }
        .studio-composer-drop-caret {
          position: absolute;
          z-index: 4;
          width: 2px;
          min-height: var(--studio-composer-line-size, 28px);
          border-radius: 999px;
          background: var(--cursor-accent);
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 35%, transparent),
            0 0 14px color-mix(in srgb, var(--cursor-accent) 52%, transparent);
          pointer-events: none;
          animation: studio-drop-caret-pulse 860ms ease-in-out infinite;
        }
        @keyframes studio-drop-caret-pulse {
          0%, 100% { opacity: 0.58; transform: scaleY(0.9); }
          50% { opacity: 1; transform: scaleY(1.08); }
        }
        .studio-inline-tag {
          display: inline-flex;
          height: var(--studio-composer-chip-size, 28px);
          max-width: min(220px, 48vw);
          align-items: center;
          align-self: auto;
          gap: 3px;
          margin: 0 4px 0 0;
          vertical-align: middle;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 22%, transparent), transparent 72%),
            color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-hover));
          padding: 0 6px;
          color: var(--color-cursor-text-bright);
          font-size: var(--studio-composer-chip-font-size, 13px);
          line-height: 1;
          white-space: nowrap;
          cursor: grab;
          user-select: none;
          -webkit-user-select: none;
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 12%, transparent);
        }
        .studio-inline-tag.is-dragging {
          opacity: 0.55;
          cursor: grabbing;
          border-color: var(--studio-composer-glass-border, rgba(255, 255, 255, 0.14));
          box-shadow:
            0 12px 28px color-mix(in srgb, #000 28%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .studio-composer .studio-inline-tag.is-selection-highlighted {
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .studio-composer .studio-inline-tag.is-selection-highlighted::selection,
        .studio-composer .studio-inline-tag.is-selection-highlighted *::selection {
          background: transparent;
          color: inherit;
          text-shadow: none;
        }
        .studio-inline-tag.is-selection-highlighted {
          border-color: color-mix(in srgb, var(--cursor-accent) 72%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 44%, transparent), transparent 74%),
            color-mix(in srgb, var(--cursor-accent) 30%, var(--color-cursor-hover));
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 36%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--color-cursor-text-bright) 14%, transparent);
        }
        .studio-inline-tag::selection,
        .studio-inline-tag *::selection {
          background: color-mix(in srgb, var(--cursor-accent) 62%, var(--color-cursor-hover));
          color: var(--color-cursor-text-bright);
          text-shadow: none;
        }
        .studio-composer .studio-inline-tag-label,
        .studio-composer .composer-inline-mention-label {
          display: inline-flex;
          align-items: center;
          height: 100%;
          line-height: 1;
        }
        .studio-composer .studio-inline-tag-kind {
          height: var(--studio-composer-chip-media-size, 18px);
          line-height: 0;
        }
        .studio-inline-tag-label {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          height: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1;
        }
        .studio-composer .studio-inline-tag--preview {
          padding-left: 0;
          gap: 2px;
        }
        .studio-inline-tag--preview {
          height: var(--studio-composer-chip-size, 20px);
          padding-left: 2px;
        }
        .studio-inline-tag--image-only {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          width: var(--studio-composer-chip-size, 20px);
          min-width: var(--studio-composer-chip-size, 20px);
          max-width: var(--studio-composer-chip-size, 20px);
          height: var(--studio-composer-chip-size, 20px);
          padding: 0;
          border-radius: 999px;
          gap: 0;
        }
        .studio-inline-tag--image-only.studio-inline-tag--preview {
          padding: 0;
        }
        .studio-inline-tag-media {
          width: var(--studio-composer-chip-media-size, 18px);
          height: var(--studio-composer-chip-media-size, 18px);
          border-radius: 999px;
          object-fit: cover;
          flex-shrink: 0;
          background: var(--cursor-overlay-subtle);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 28%, transparent);
        }
        .studio-inline-tag-kind {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: var(--studio-composer-chip-icon-size, 9px);
          height: var(--studio-composer-chip-media-size, 18px);
          flex-shrink: 0;
          color: color-mix(in srgb, var(--cursor-accent) 74%, var(--color-cursor-text-bright));
          line-height: 0;
        }
        .studio-inline-tag--image-only .studio-inline-tag-kind {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: auto;
          height: auto;
        }
        .studio-inline-tag--image-only .studio-inline-tag-media {
          width: 100%;
          height: 100%;
          border-radius: 999px;
          box-shadow: none;
        }
        .studio-inline-tag-kind svg {
          display: block;
          width: var(--studio-composer-chip-icon-size, 9px);
          height: var(--studio-composer-chip-icon-size, 9px);
          stroke-width: 2.25;
        }
        .studio-inline-tag--image-only .studio-inline-tag-overlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.78);
          pointer-events: none;
          background: transparent;
          border-radius: 999px;
        }
        .studio-inline-tag-overlay svg {
          display: block;
          flex: 0 0 auto;
          width: 11px;
          height: 11px;
          opacity: 0.82;
          stroke-width: 2.35;
          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.42));
        }
        .studio-composer.cursor-composer-shell > .cursor-attach-preview-dock {
          width: min(var(--studio-composer-shell-max), calc(100% - 24px));
          margin-left: auto;
          margin-right: auto;
          background: var(--studio-composer-glass) !important;
          backdrop-filter: var(--studio-composer-glass-blur) !important;
          -webkit-backdrop-filter: var(--studio-composer-glass-blur) !important;
          box-shadow: var(--studio-composer-glass-shadow);
        }
        .studio-composer-preview-fallback {
          padding: 20px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-composer-toolbar {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          flex-wrap: nowrap;
          gap: 6px;
          margin-top: auto;
          padding: 3px 8px 7px;
          min-width: 0;
        }
        .studio-composer-toolbar-scroll {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1 1 auto;
          overflow-x: auto;
          overflow-y: visible;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .studio-composer-toolbar-scroll::-webkit-scrollbar {
          display: none;
        }
        .studio-composer-controls {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          flex: 0 0 auto;
          overflow: visible;
        }
        .studio-composer-inline-settings {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 0 0 auto;
          overflow: visible;
        }
        .studio-inline-audio-setting {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 30px;
          min-height: 30px;
          padding: 0 8px;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: var(--cursor-radius-pill);
          background: var(--studio-composer-glass-muted);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          flex: 0 0 auto;
        }
        .studio-inline-audio-label {
          font-size: 11px;
          color: var(--color-cursor-muted);
          white-space: nowrap;
        }
        .studio-inline-setting {
          position: relative;
          flex: 0 0 auto;
        }
        .studio-inline-setting-trigger {
          display: inline-flex;
          height: 30px;
          min-height: 30px;
          max-width: 148px;
          align-items: center;
          gap: 5px;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: var(--cursor-radius-pill);
          background: var(--studio-composer-glass-muted);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          padding: 0 8px;
          color: var(--color-cursor-text);
          font-size: 11px;
          font-weight: 650;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease);
        }
        .studio-inline-setting-trigger:hover,
        .studio-inline-setting-trigger[aria-expanded="true"] {
          border-color: color-mix(in srgb, var(--cursor-accent) 30%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 28%, var(--studio-composer-glass) 72%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .studio-inline-setting-trigger svg {
          flex: 0 0 auto;
          color: var(--color-cursor-text-bright);
        }
        .studio-inline-setting-trigger span {
          color: var(--color-cursor-muted);
        }
        .studio-inline-setting-trigger strong {
          overflow: hidden;
          max-width: 72px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 750;
          text-overflow: ellipsis;
        }
        .studio-composer-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
          margin-left: 0;
        }
        .studio-composer .studio-pill-btn {
          height: 30px;
          min-height: 30px;
          border: 1px solid var(--studio-composer-glass-border);
          background: var(--studio-composer-glass-muted);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
        }
        .studio-composer .studio-pill-btn:hover,
        .studio-composer .studio-pill-btn[aria-expanded="true"] {
          background: color-mix(in srgb, var(--studio-composer-glass-muted) 68%, var(--cursor-accent-dim) 32%);
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
        }
        .studio-pill-btn {
          position: relative;
          display: inline-flex;
          height: 28px;
          align-items: center;
          gap: 6px;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-surface) 92%, transparent);
          padding: 0 9px;
          color: var(--color-cursor-text);
          font-size: 11px;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-pill-btn:hover,
        .studio-pill-btn[aria-expanded="true"] {
          background: var(--color-cursor-hover);
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
        }
        .studio-dropdown-menu {
          min-width: max-content;
          max-width: min(240px, calc(100vw - 24px));
          border-radius: 12px !important;
          padding: 4px !important;
        }
        .studio-dropdown-menu:not(.is-fixed) {
          bottom: calc(100% + 6px);
          left: 0;
        }
        .studio-dropdown-menu.is-fixed {
          position: fixed !important;
          bottom: auto;
          top: auto;
          left: auto;
          z-index: 10000 !important;
          animation: studio-menu-pop 130ms ease-out;
          overflow: auto;
          pointer-events: auto;
        }
        .studio-dropdown-menu .cursor-tab-context-item {
          min-height: 34px;
          white-space: nowrap;
        }
        .studio-add-menu {
          position: fixed !important;
          bottom: auto;
          z-index: 10000 !important;
          width: 220px !important;
          min-width: 220px !important;
          max-width: calc(100vw - 24px);
          padding: 6px !important;
          animation: studio-menu-pop 130ms ease-out;
          overflow: auto;
          pointer-events: auto;
        }
        .studio-add-menu .cursor-tab-context-item {
          display: flex !important;
          min-height: 32px;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
          text-align: left;
        }
        .studio-add-menu .cursor-tab-context-item svg {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
        }
        .studio-settings-trigger {
          width: 24px;
          min-width: 24px;
          height: 24px;
          min-height: 24px;
          justify-content: center;
          border-radius: 9999px;
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-panel)), var(--color-cursor-panel));
          color: color-mix(in srgb, var(--color-cursor-text-bright) 92%, var(--cursor-accent));
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 16%, transparent) inset,
            0 8px 20px color-mix(in srgb, #000 24%, transparent),
            0 0 14px color-mix(in srgb, var(--cursor-accent) 12%, transparent);
          padding: 0;
        }
        .studio-settings-trigger svg {
          width: 12px;
          height: 12px;
        }
        .studio-polish :where(.cursor-panel-head, .cursor-sidebar-head, .cursor-workspace-head) .studio-credit-pill {
          min-height: 24px;
          height: 24px;
          padding: 0 8px;
          font-size: 11px;
          line-height: 1;
        }
        .studio-polish :where(.cursor-panel-head, .cursor-sidebar-head, .cursor-workspace-head) .studio-credit-pill svg {
          width: 12px;
          height: 12px;
        }
        .studio-settings-trigger:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 58%, var(--color-cursor-border));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 24%, var(--color-cursor-panel)), color-mix(in srgb, var(--cursor-accent) 8%, var(--color-cursor-panel)));
          color: var(--color-cursor-text-bright);
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 24%, transparent) inset,
            0 10px 22px color-mix(in srgb, #000 28%, transparent),
            0 0 20px color-mix(in srgb, var(--cursor-accent) 20%, transparent);
        }
        .studio-settings-trigger:active {
          background: color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-panel));
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 28%, transparent) inset,
            0 4px 10px color-mix(in srgb, #000 22%, transparent);
        }
        .studio-upload-trigger {
          width: 30px;
          min-width: 30px;
          justify-content: center;
          padding: 0;
        }
        .studio-composer-actions .cursor-composer-mic:not(.studio-composer-circle-btn) {
          width: 30px;
          min-width: 30px;
          border-radius: var(--cursor-radius-pill);
        }
        .studio-composer .studio-settings-menu,
        .studio-inline-settings-menu.is-fixed,
        .studio-add-menu.is-fixed,
        .studio-dropdown-menu.is-fixed {
          border: 1px solid var(--studio-composer-glass-border, rgba(255, 255, 255, 0.11)) !important;
          background: var(
            --studio-composer-glass-strong,
            color-mix(in srgb, var(--color-mos-composer, #07111f) 74%, transparent)
          ) !important;
          backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          -webkit-backdrop-filter: var(--studio-composer-glass-blur, saturate(150%) blur(5px));
          box-shadow: var(
            --studio-composer-glass-shadow,
            0 20px 48px rgba(0, 0, 0, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.08)
          ) !important;
        }
        .studio-settings-menu {
          width: 336px;
          max-width: min(336px, calc(100vw - 24px)) !important;
          border-radius: 18px !important;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-border-soft)) !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 12%, transparent), transparent 34%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 94%, var(--mos-bg) 6%),
              color-mix(in srgb, var(--mos-panel) 90%, var(--mos-bg) 10%)
            ) !important;
          box-shadow:
            0 14px 34px color-mix(in srgb, #000 20%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent);
          padding: 9px !important;
        }
        .studio-settings-menu.is-fixed {
          position: fixed !important;
          bottom: auto;
          top: auto;
          left: auto;
          z-index: 10000 !important;
          overflow: auto;
          pointer-events: auto;
          animation: studio-menu-pop 130ms ease-out;
        }
        .studio-inline-settings-menu {
          width: max-content !important;
          min-width: 0 !important;
          max-width: min(280px, calc(100vw - 24px)) !important;
        }
        .studio-inline-settings-menu:has(.has-ratio-icon) {
          width: 240px !important;
        }
        .studio-inline-settings-menu .studio-settings-chip-grid,
        .studio-inline-settings-menu .studio-settings-chip-grid.is-two,
        .studio-inline-settings-menu .studio-settings-chip-grid.is-three {
          grid-template-columns: 1fr;
        }
        .studio-inline-settings-menu .studio-settings-chip.has-ratio-icon {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          align-items: center;
          min-height: 42px;
          gap: 8px;
        }
        .studio-inline-settings-menu .studio-settings-chip.has-option-icon {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          align-items: center;
          min-height: 34px;
          gap: 7px;
        }
        .studio-settings-option-icon {
          width: 14px;
          height: 14px;
          color: var(--cursor-accent);
        }
        .studio-settings-chip-copy {
          display: grid;
          min-width: 0;
          gap: 2px;
        }
        .studio-ratio-glyph {
          display: inline-flex;
          width: 30px;
          height: 30px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 24%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 28%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 8%, transparent);
        }
        .studio-ratio-glyph > span {
          display: block;
          border-radius: 3px;
          background:
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) left top / 6px 1px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) left top / 1px 6px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) right top / 6px 1px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) right top / 1px 6px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) left bottom / 6px 1px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) left bottom / 1px 6px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) right bottom / 6px 1px no-repeat,
            linear-gradient(var(--cursor-accent), var(--cursor-accent)) right bottom / 1px 6px no-repeat,
            color-mix(in srgb, var(--cursor-accent) 10%, transparent);
          box-shadow: 0 0 10px color-mix(in srgb, var(--cursor-accent) 18%, transparent);
        }
        .studio-ratio-glyph-16x9 > span {
          width: 22px;
          height: 12px;
        }
        .studio-ratio-glyph-9x16 > span {
          width: 12px;
          height: 22px;
        }
        .studio-ratio-glyph-1x1 > span {
          width: 17px;
          height: 17px;
        }
        .studio-ratio-glyph-4x3 > span {
          width: 20px;
          height: 15px;
        }
        .studio-ratio-glyph-3x4 > span {
          width: 15px;
          height: 20px;
        }
        .studio-ratio-glyph-21x9 > span {
          width: 24px;
          height: 10px;
        }
        .studio-composer-settings-dock {
          width: min(520px, max(220px, calc(100% - 292px))) !important;
          max-width: min(520px, calc(100vw - 24px)) !important;
          margin: 0 auto 8px;
          pointer-events: auto;
          overflow: visible;
        }
        .studio-settings-menu-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 5px 5px 12px;
        }
        .studio-settings-stack {
          display: grid;
          gap: 8px;
        }
        .studio-settings-title {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: 14px;
          font-weight: 650;
          line-height: 1.2;
        }
        .studio-settings-desc {
          margin: 4px 0 0;
          max-width: 220px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.35;
        }
        .studio-settings-mode {
          display: inline-flex;
          min-height: 24px;
          align-items: center;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 22%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 70%, transparent);
          padding: 0 9px;
          color: var(--cursor-accent);
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          text-transform: capitalize;
        }
        .studio-settings-menu-head-compact {
          align-items: center;
          padding: 4px 4px 8px;
        }
        .studio-settings-compact {
          display: grid;
          gap: 9px;
        }
        .studio-settings-field {
          display: grid;
          gap: 6px;
        }
        .studio-settings-field-head {
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 18px;
          padding: 0 2px;
          color: var(--color-cursor-muted);
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .studio-settings-field-head strong {
          margin-left: auto;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          letter-spacing: 0;
          text-transform: none;
        }
        .studio-settings-chip-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .studio-settings-chip-grid.is-three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .studio-settings-chip-grid.is-two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .studio-settings-chip {
          display: inline-flex;
          min-height: 34px;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 2px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 11px;
          background: color-mix(in srgb, var(--mos-surface) 70%, transparent);
          padding: 5px 8px;
          color: var(--color-cursor-text);
          text-align: left;
          cursor: pointer;
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease);
        }
        .studio-settings-chip:hover,
        .studio-settings-chip.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 42%, var(--color-cursor-hover));
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent);
        }
        .studio-settings-chip span {
          overflow: hidden;
          max-width: 100%;
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 650;
          line-height: 1.05;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-settings-chip small {
          color: var(--color-cursor-muted);
          font-size: 10.5px;
          font-weight: 650;
          line-height: 1;
        }
        .studio-settings-range {
          --range-progress: 0%;
          appearance: none;
          width: 100%;
          height: 26px;
          border-radius: 999px;
          background: transparent;
          cursor: pointer;
          touch-action: pan-x;
          will-change: transform;
        }
        .studio-settings-range::-webkit-slider-runnable-track {
          height: 6px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          border-radius: 999px;
          background:
            linear-gradient(
              90deg,
              color-mix(in srgb, var(--cursor-accent) 86%, white 8%) 0 var(--range-progress),
              color-mix(in srgb, var(--mos-surface) 76%, transparent) var(--range-progress) 100%
            );
          box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35);
        }
        .studio-settings-range::-webkit-slider-thumb {
          appearance: none;
          width: 17px;
          height: 17px;
          margin-top: -6px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 72%, white 12%);
          border-radius: 999px;
          background:
            radial-gradient(circle at 35% 30%, rgba(255,255,255,0.9), transparent 34%),
            linear-gradient(135deg, var(--cursor-accent), color-mix(in srgb, var(--cursor-accent) 74%, black));
          box-shadow: 0 6px 18px color-mix(in srgb, var(--cursor-accent) 28%, transparent), 0 1px 2px rgb(0 0 0 / 0.45);
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .studio-settings-range:hover::-webkit-slider-thumb,
        .studio-settings-range:active::-webkit-slider-thumb {
          transform: scale(1.12);
          box-shadow: 0 8px 22px color-mix(in srgb, var(--cursor-accent) 36%, transparent), 0 1px 2px rgb(0 0 0 / 0.5);
        }
        .studio-settings-range::-moz-range-track {
          height: 6px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-surface) 76%, transparent);
          box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35);
        }
        .studio-settings-range::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 86%, white 8%);
        }
        .studio-settings-range::-moz-range-thumb {
          width: 17px;
          height: 17px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 72%, white 12%);
          border-radius: 999px;
          background: var(--cursor-accent);
          box-shadow: 0 6px 18px color-mix(in srgb, var(--cursor-accent) 28%, transparent), 0 1px 2px rgb(0 0 0 / 0.45);
        }
        .studio-inline-settings-range-panel {
          display: grid;
          gap: 9px;
          min-width: 188px;
        }
        .studio-video-start-frame-copy {
          margin: 0;
          color: var(--color-cursor-muted);
          font-size: 11px;
          line-height: 1.45;
        }
        .studio-duration-readout {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 0 2px;
        }
        .studio-duration-readout strong {
          color: var(--color-cursor-text-bright);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .studio-duration-readout span {
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .studio-duration-ticks {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          margin-top: -5px;
          padding: 0 3px;
          color: color-mix(in srgb, var(--color-cursor-muted) 80%, transparent);
          font-size: 9.5px;
          font-weight: 700;
        }
        .studio-duration-ticks span:nth-child(2) {
          text-align: center;
        }
        .studio-duration-ticks span:last-child {
          text-align: right;
        }
        .studio-inline-settings-menu .studio-duration-presets {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          justify-content: stretch;
        }
        .studio-inline-settings-menu .studio-duration-presets .studio-settings-chip {
          justify-content: center;
          width: 100%;
          min-height: 30px;
          padding-inline: 10px;
          text-align: center;
        }
        .studio-settings-toggle {
          display: grid;
          grid-template-columns: 16px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 12px;
          background: color-mix(in srgb, var(--mos-surface) 70%, transparent);
          padding: 0 10px;
          color: var(--color-cursor-text);
          cursor: pointer;
        }
        .studio-settings-toggle:hover,
        .studio-settings-toggle.is-on {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 42%, var(--color-cursor-hover));
        }
        .studio-settings-toggle span {
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 650;
        }
        .studio-settings-toggle strong {
          color: var(--color-cursor-muted);
          font-size: 11px;
        }
        .studio-settings-chip:focus-visible,
        .studio-settings-toggle:focus-visible,
        .studio-settings-range:focus-visible {
          outline: none;
          box-shadow: var(--studio-focus-ring);
        }
        .studio-settings-group-label {
          margin: 2px 4px -2px;
          color: color-mix(in srgb, var(--color-cursor-muted) 82%, transparent);
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.08em;
          line-height: 1;
          text-transform: uppercase;
        }
        .studio-settings-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto 32px;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 58px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 76%, transparent);
          border-radius: 14px;
          background: color-mix(in srgb, var(--mos-surface) 74%, transparent);
          padding: 7px 10px 7px 9px;
          color: var(--color-cursor-text);
          cursor: pointer;
          text-align: left;
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-settings-row:hover,
        .studio-settings-row.is-open {
          border-color: color-mix(in srgb, var(--cursor-accent) 24%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 38%, var(--color-cursor-hover));
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent);
        }
        .studio-settings-row:focus-visible,
        .studio-settings-option:focus-visible {
          outline: none;
          box-shadow: var(--studio-focus-ring);
        }
        .studio-settings-icon {
          display: inline-flex;
          width: 34px;
          height: 34px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: color-mix(in srgb, var(--cursor-accent-dim) 44%, transparent);
          color: var(--color-cursor-muted);
        }
        .studio-settings-row:hover .studio-settings-icon,
        .studio-settings-row.is-open .studio-settings-icon {
          color: var(--cursor-accent);
        }
        .studio-settings-copy {
          display: grid;
          min-width: 0;
          gap: 4px;
        }
        .studio-settings-label {
          overflow: hidden;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
          line-height: 1.1;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-settings-help {
          overflow: hidden;
          color: var(--color-cursor-muted);
          font-size: 11px;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-settings-value {
          border-radius: var(--cursor-radius-pill);
          background: color-mix(in srgb, var(--mos-bg) 44%, transparent);
          padding: 5px 8px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
        }
        .studio-settings-switch {
          position: relative;
          width: 32px;
          height: 18px;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-bg) 62%, transparent);
        }
        .studio-settings-switch::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--color-cursor-muted);
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-settings-switch.is-on {
          border-color: color-mix(in srgb, var(--cursor-accent) 38%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 22%, transparent);
        }
        .studio-settings-switch.is-on::after {
          background: var(--cursor-accent);
          transform: translateX(14px);
        }
        .studio-settings-chevron {
          color: color-mix(in srgb, var(--color-cursor-muted) 74%, transparent);
          transition: transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-settings-row.is-open .studio-settings-chevron {
          transform: rotate(90deg);
        }
        .studio-settings-options {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(94px, 1fr));
          gap: 7px;
          padding: 7px 2px 2px 44px;
        }
        .studio-settings-option {
          display: grid;
          min-height: 46px;
          align-content: center;
          gap: 4px;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: 13px;
          background: color-mix(in srgb, var(--mos-surface) 78%, transparent);
          padding: 8px 10px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          cursor: pointer;
          text-align: left;
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-settings-option:hover,
        .studio-settings-option.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, transparent);
          background: color-mix(in srgb, var(--cursor-accent-dim) 68%, var(--color-cursor-hover));
          color: var(--color-cursor-text-bright);
        }
        .studio-settings-option-label {
          color: var(--color-cursor-text-bright);
          font-weight: 700;
          line-height: 1;
        }
        .studio-settings-option-meta {
          overflow: hidden;
          font-size: 10px;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-composer-cost {
          display: inline-flex;
          height: 24px;
          align-items: center;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 24%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 10%, transparent);
          padding: 0 6px;
          color: var(--cursor-accent);
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.01em;
          white-space: nowrap;
        }
        .studio-generate-column {
          position: relative;
          isolation: auto;
          display: flex;
          align-self: stretch;
          align-items: stretch;
          flex: 0 0 var(--studio-generate-column-width);
          width: var(--studio-generate-column-width);
          min-width: var(--studio-generate-column-width);
          max-width: var(--studio-generate-column-width);
          min-height: 0;
        }
        .studio-generate-btn {
          display: inline-flex;
          height: 100%;
          width: 100%;
          min-width: 0;
          max-width: none;
          min-height: 0;
          max-height: 100%;
          aspect-ratio: auto;
          flex: 1 1 auto;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 8px 6px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 48%, #000 8%);
          border-radius: 14px;
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, #fff 24%, transparent), transparent 44%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent-hover) 82%, #fff 10%),
              color-mix(in srgb, var(--cursor-accent) 78%, #000 18%)
            );
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, #fff 36%, transparent),
            0 6px 16px color-mix(in srgb, var(--cursor-accent) 28%, transparent);
          color: #ffffff;
          cursor: pointer;
          text-align: center;
          overflow: hidden;
          transition:
            filter var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease);
        }
        [data-appearance="light"] .studio-polish .studio-generate-btn:not(:disabled) {
          border-color: color-mix(in srgb, var(--cursor-accent) 62%, #000 10%);
          background:
            radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.38), transparent 44%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent-hover) 88%, #ffffff 6%),
              color-mix(in srgb, var(--cursor-accent) 82%, #000 22%)
            );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.48),
            0 8px 20px color-mix(in srgb, var(--cursor-accent) 40%, transparent);
          color: #ffffff;
        }
        .studio-generate-btn:hover:not(:disabled) {
          transform: none;
        }
        [data-appearance="light"] .studio-polish .studio-generate-btn:hover:not(:disabled) {
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.56),
            0 8px 20px color-mix(in srgb, var(--cursor-accent) 40%, transparent);
        }
        .studio-generate-btn:active:not(:disabled) {
          transform: scale(var(--studio-press-scale));
        }
        .studio-generate-btn:disabled {
          cursor: not-allowed;
          border-color: var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-text) 5%, var(--studio-composer-glass-muted));
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 8%, transparent);
          color: var(--color-cursor-muted);
        }
        [data-appearance="light"] .studio-polish .studio-generate-btn:disabled {
          border-color: var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-text) 7%, var(--mos-panel));
          color: color-mix(in srgb, var(--mos-text) 46%, var(--mos-muted));
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
        }
        .studio-generate-btn:disabled .studio-generate-label,
        .studio-generate-btn:disabled .studio-generate-cost {
          opacity: 1;
          color: inherit;
          text-shadow: none;
        }
        .studio-generate-label {
          font-size: 11px;
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -0.01em;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: inherit;
          text-shadow: 0 1px 2px color-mix(in srgb, #000 42%, transparent);
        }
        .studio-generate-btn.is-element-mode .studio-generate-label {
          font-size: 10px;
          line-height: 1.08;
          letter-spacing: 0;
          white-space: normal;
          text-wrap: pretty;
        }
        .studio-generate-cost {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 9px;
          font-weight: 650;
          line-height: 1;
          color: color-mix(in srgb, #ffffff 94%, transparent);
          text-shadow: 0 1px 1px color-mix(in srgb, #000 32%, transparent);
        }
        .studio-generate-mark {
          width: 11px;
          height: 11px;
          object-fit: contain;
          color: inherit;
          opacity: 0.95;
          filter: none;
        }
        @media (max-width: 640px) {
          .studio-composer .cursor-composer {
            max-width: 100%;
            padding-inline: 8px;
            left: 0;
          }
        }
        .studio-composer-send-btn {
          display: none;
        }
        .studio-composer-circle-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          min-width: 40px;
          height: 40px;
          min-height: 40px;
          padding: 0;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 999px;
          background: var(--studio-composer-glass-muted);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          color: var(--color-cursor-text);
          cursor: pointer;
          transition:
            filter var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            background var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-composer-circle-btn svg {
          width: 18px;
          height: 18px;
          stroke-width: 2.25;
          flex: 0 0 auto;
        }
        .studio-composer-circle-btn:hover:not(:disabled) {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--studio-composer-glass-muted) 68%, var(--cursor-accent-dim) 32%);
        }
        .studio-composer-circle-btn.cursor-composer-mic.is-recording {
          border-color: color-mix(in srgb, #ef4444 48%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, #ef4444 18%, var(--studio-composer-glass-muted));
          color: #fecaca;
        }
        .studio-composer-circle-btn.studio-composer-options-btn.is-open {
          border-color: color-mix(in srgb, var(--cursor-accent) 48%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 16%, var(--studio-composer-glass-muted));
          color: var(--color-cursor-text-bright);
        }
        .studio-composer-circle-btn.studio-composer-send-btn {
          display: inline-flex;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 48%, #000 8%);
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, #fff 24%, transparent), transparent 44%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent-hover) 82%, #fff 10%),
              color-mix(in srgb, var(--cursor-accent) 78%, #000 18%)
            );
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, #fff 36%, transparent),
            0 4px 14px color-mix(in srgb, var(--cursor-accent) 24%, transparent);
          color: #ffffff;
        }
        .studio-composer-circle-btn.studio-composer-send-btn:hover:not(:disabled) {
          transform: none;
        }
        .studio-composer-circle-btn.studio-composer-send-btn:active:not(:disabled) {
          transform: scale(var(--studio-press-scale));
        }
        .studio-composer-circle-btn.studio-composer-send-btn:disabled {
          cursor: not-allowed;
          border-color: var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-text) 5%, var(--studio-composer-glass-muted));
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 8%, transparent);
          color: var(--color-cursor-muted);
        }
        .studio-composer-options-panel {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          flex: 0 0 auto;
          order: -1;
          max-height: min(48vh, 340px);
          margin-bottom: 8px;
          overflow: hidden;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 16px;
          background: var(--studio-composer-glass-strong);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          box-shadow: var(--studio-composer-glass-shadow);
          animation: studio-preset-grid-in 180ms var(--studio-motion-ease);
        }
        .studio-composer-options-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 12px 0;
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 700;
        }
        .studio-composer-options-close {
          display: inline-flex;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 999px;
          background: var(--studio-composer-glass-muted);
          color: var(--color-cursor-muted);
        }
        .studio-composer-options-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 8px 12px 12px;
          overflow: auto;
        }
        .studio-composer-options-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px;
          width: 100%;
          align-items: stretch;
        }
        .studio-composer-options-body .studio-composer-options-row > * {
          width: 100%;
          min-width: 0;
        }
        .studio-composer-options-field {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 5px;
        }
        .studio-composer-options-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--color-cursor-muted);
        }
        .studio-composer-options-body .studio-composer-options-row > .studio-pill-btn,
        .studio-composer-options-body .studio-composer-options-row > .studio-inline-audio-setting,
        .studio-composer-options-body .studio-composer-options-row > .studio-composer-options-field,
        .studio-composer-options-body .studio-composer-options-row .studio-inline-setting.is-panel {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }
        .studio-composer-options-body .studio-pill-btn.studio-preset-trigger.is-panel,
        .studio-composer-options-body .studio-inline-audio-setting.is-panel,
        .studio-composer-options-body .studio-inline-setting-trigger.is-panel,
        .studio-composer-options-body .studio-upload-stacked {
          width: 100%;
          max-width: none;
        }
        .studio-composer-options-body .studio-pill-btn.studio-preset-trigger.is-panel {
          display: flex;
          justify-content: flex-start;
          max-width: none;
        }
        .studio-composer-options-body .studio-pill-btn.studio-preset-trigger.is-panel .studio-preset-trigger-copy {
          max-width: none;
          flex: 1 1 auto;
        }
        .studio-composer-options-body .studio-inline-audio-setting.is-panel {
          justify-content: space-between;
          width: 100%;
          height: 36px;
          min-height: 36px;
        }
        .studio-composer-options-body .studio-inline-setting.is-panel {
          display: block;
          width: 100%;
          min-width: 0;
          flex: 1 1 0;
        }
        .studio-composer-options-body .studio-inline-setting-trigger.is-panel {
          width: 100%;
          max-width: none;
          height: 36px;
          min-height: 36px;
          justify-content: flex-start;
          gap: 6px;
        }
        .studio-composer-options-body .studio-inline-setting-trigger.is-panel span {
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
        }
        .studio-composer-options-body .studio-inline-setting-trigger.is-panel strong {
          max-width: none;
          margin-left: auto;
          text-align: right;
        }
        .studio-composer-options-body .studio-upload-stacked {
          display: inline-flex;
          width: 100%;
          height: 36px;
          min-height: 36px;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          padding-inline: 12px;
        }
        .studio-composer-options-body .studio-upload-stacked span {
          overflow: hidden;
          color: var(--color-cursor-text);
          font-size: 11px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-composer-options-body .studio-composer-inline-settings.is-panel {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
          overflow: visible;
        }
        .studio-composer-options-body .studio-composer-inline-settings.is-panel .studio-composer-options-row {
          width: 100%;
        }
        .studio-composer-options-body .studio-composer-inline-settings.is-panel .studio-inline-setting-trigger,
        .studio-composer-options-body .studio-composer-inline-settings.is-panel .studio-inline-audio-setting {
          width: 100%;
          max-width: 100%;
        }
        .studio-composer-options-body .studio-composer-inline-settings.is-panel > .studio-inline-setting {
          width: 100%;
        }
        .studio-composer-options-body .studio-composer-inline-settings.is-panel > .studio-inline-setting .studio-inline-setting-trigger {
          width: 100%;
          max-width: 100%;
          height: 36px;
          min-height: 36px;
          justify-content: space-between;
        }
        .studio-composer-options-body .studio-composer-inline-settings.is-panel > .studio-inline-audio-setting {
          width: 100%;
          height: 36px;
          min-height: 36px;
          justify-content: space-between;
        }
        .studio-composer-options-body .studio-pill-btn,
        .studio-composer-options-body .studio-inline-setting-trigger,
        .studio-composer-options-body .studio-inline-audio-setting,
        .studio-composer-options-body .studio-composer-inline-settings:not(.is-panel) {
          width: 100%;
          max-width: 100%;
        }
        .studio-composer-options-body .studio-composer-inline-settings:not(.is-panel) {
          flex-direction: column;
          align-items: stretch;
          overflow: visible;
        }
        .studio-composer-options-panel .studio-preset-grid-panel {
          position: relative;
          inset: auto;
          bottom: auto;
          left: auto;
          right: auto;
          width: 100%;
          max-width: 100%;
          margin: 0;
          border: none;
          border-radius: 0;
          box-shadow: none;
          background: transparent;
        }
        .studio-pricing-grid,
        .studio-admin-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
        }
        .studio-admin-workspace {
          display: grid;
          gap: 14px;
          max-width: 1180px;
          margin: 0 auto;
        }
        .studio-admin-quick-links {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .studio-admin-quick-link {
          width: auto;
          min-width: 78px;
          padding: 0 10px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 720;
        }
        .studio-asset-preview {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          padding: 0;
        }
        .studio-asset-media-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: var(--cursor-head-h);
          height: var(--cursor-head-h);
          padding: 0 12px;
          border-bottom: 1px solid var(--studio-chrome-divider);
          background: var(--color-cursor-sidebar) !important;
          flex-shrink: 0;
        }
        .studio-asset-media-bar-name {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--color-cursor-text);
          font-size: 13px;
          font-weight: 500;
        }
        .studio-asset-lightbox {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          border: none;
          border-radius: 0;
          background: var(--color-cursor-bg);
          box-shadow: none;
          display: flex;
          flex-direction: column;
        }
        [data-appearance="light"] .studio-asset-lightbox {
          background: #fff;
        }
        .studio-asset-preview .desk-image-viewer,
        .studio-asset-preview .desk-media-player--studio-preview {
          background: var(--color-cursor-bg);
          flex: 1;
          min-height: 0;
        }
        [data-appearance="light"] .studio-asset-preview .desk-image-viewer,
        [data-appearance="light"] .studio-asset-preview .desk-media-player--studio-preview {
          background: #fff;
        }
        .studio-asset-preview .desk-image-viewer-toolbar,
        .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-toolbar {
          position: static;
          left: auto;
          bottom: auto;
          z-index: 1;
          width: 100%;
          min-width: 0;
          min-height: var(--cursor-head-h);
          height: var(--cursor-head-h);
          transform: none;
          border: none;
          border-bottom: 1px solid var(--studio-chrome-divider);
          border-radius: 0;
          background: var(--color-cursor-sidebar) !important;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .studio-asset-preview .desk-image-viewer-name,
        .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-name {
          color: var(--color-cursor-text);
        }
        .studio-asset-preview .desk-image-viewer-status {
          color: var(--color-cursor-muted);
        }
        .studio-asset-preview .desk-image-viewer-scale-btn,
        .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-time {
          color: var(--color-cursor-muted);
        }
        .studio-asset-preview .desk-image-viewer-scale-btn:hover {
          background: var(--color-cursor-hover);
          color: var(--color-cursor-text);
        }
        .studio-asset-preview .desk-image-viewer-scale-input {
          background: var(--color-cursor-bg);
          border: 1px solid var(--studio-chrome-divider);
          color: var(--color-cursor-text);
        }
        .studio-asset-preview .desk-image-viewer-toolbar .cursor-icon-btn,
        .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-toolbar .cursor-icon-btn {
          color: var(--color-cursor-muted);
        }
        .studio-asset-preview .desk-image-viewer-toolbar .cursor-icon-btn:hover,
        .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-toolbar .cursor-icon-btn:hover {
          background: var(--color-cursor-hover);
          color: var(--color-cursor-text);
        }
        .studio-asset-preview .desk-image-viewer-stage,
        .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-stage {
          flex: 1;
          min-height: 0;
          padding: 0;
          background: var(--color-cursor-bg);
        }
        [data-appearance="light"] .studio-asset-preview .desk-image-viewer-stage,
        [data-appearance="light"] .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-stage,
        [data-appearance="light"] .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-stage {
          background: #fff;
        }
        .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-volume {
          width: 56px;
        }
        .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-controls {
          flex-shrink: 0;
          border-top: 1px solid var(--studio-chrome-divider);
          background: var(--color-cursor-sidebar);
        }
        .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-scrub {
          padding: 8px 12px 4px;
          background: transparent;
        }
        .studio-asset-preview .desk-media-player--studio-preview .desk-media-player-toolbar {
          background: transparent;
          border-top: none;
        }
        .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-stage {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-cursor-bg);
        }
        [data-appearance="light"] .studio-asset-preview .desk-media-player--studio-preview .desk-image-viewer-stage {
          background: #fff;
        }
        .studio-asset-preview .desk-image-viewer-img {
          border-radius: 0;
          box-shadow: 0 18px 55px color-mix(in srgb, #000 28%, transparent);
        }
        .studio-asset-player {
          flex: 1;
          min-height: 0;
          align-items: center;
        }
        .studio-asset-empty {
          display: grid;
          place-items: center;
          align-content: center;
          gap: 10px;
          height: 100%;
          color: var(--color-cursor-muted);
        }
        .studio-admin-grid-large {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }
        .studio-admin-hero-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          border-radius: 22px;
          background:
            radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--cursor-accent) 18%, transparent), transparent 36%),
            color-mix(in srgb, var(--mos-surface) 72%, transparent);
          padding: 20px;
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.24), 0 0 30px var(--studio-glow-soft);
        }
        .studio-admin-hero-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .studio-admin-hero-card h2,
        .studio-admin-card h3 {
          color: var(--color-cursor-text-bright);
          font-weight: 720;
        }
        .studio-admin-hero-card h2 {
          font-size: 24px;
        }
        .studio-admin-hero-card p {
          margin-top: 4px;
          color: var(--color-cursor-muted);
          font-size: 13px;
        }
        .studio-price-card,
        .studio-bank-card,
        .studio-admin-card {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 14%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--cursor-accent) 14%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-surface) 72%, transparent);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
          padding: 16px;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-admin-table-card,
        .studio-admin-table-card:hover {
          transform: none;
        }
        .studio-admin-tabbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 14%, var(--color-cursor-border-soft));
          border-radius: 18px;
          background: color-mix(in srgb, var(--mos-surface) 58%, transparent);
          padding: 8px;
        }
        .studio-admin-tabbar button,
        .studio-admin-filter-tabs button {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 48%, transparent);
          color: var(--color-cursor-muted);
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 720;
          cursor: pointer;
        }
        .studio-admin-tabbar button.is-active,
        .studio-admin-filter-tabs button.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 54%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent-dim) 62%, var(--color-cursor-hover));
          color: var(--color-cursor-text-bright);
        }
        .studio-admin-table-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .studio-admin-filter-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
        }
        .studio-admin-payment-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
          gap: 14px;
          align-items: start;
        }
        .studio-admin-payments-shell {
          position: relative;
        }
        .studio-admin-payment-sidebar-backdrop {
          position: fixed;
          inset: 0;
          z-index: 80;
          border: 0;
          background: color-mix(in srgb, #000 42%, transparent);
        }
        .studio-admin-payment-sidebar {
          position: fixed;
          top: 0;
          right: 0;
          z-index: 81;
          display: flex;
          width: min(420px, 100vw);
          height: 100dvh;
          flex-direction: column;
          gap: 14px;
          overflow: auto;
          border-left: 1px solid var(--studio-chrome-divider);
          background: var(--color-cursor-bg);
          padding: 16px;
          box-shadow: -16px 0 40px color-mix(in srgb, #000 24%, transparent);
        }
        .studio-admin-payment-sidebar-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .studio-admin-payment-sidebar-head h3 {
          margin: 4px 0 0;
        }
        .studio-admin-status-field {
          display: grid;
          gap: 6px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .studio-admin-status-field select {
          min-height: 38px;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: 10px;
          background: color-mix(in srgb, var(--mos-bg) 42%, transparent);
          padding: 0 10px;
          color: var(--color-cursor-text);
          font-size: 13px;
          font-family: inherit;
        }
        .studio-admin-receipt-preview {
          display: grid;
          gap: 8px;
          min-height: 0;
          flex: 1;
        }
        .studio-admin-receipt-image,
        .studio-admin-receipt-frame {
          width: 100%;
          min-height: 280px;
          max-height: 52vh;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: 14px;
          background: color-mix(in srgb, var(--mos-bg) 42%, transparent);
          object-fit: contain;
        }
        .studio-admin-receipt-frame {
          border: 0;
        }
        .studio-admin-receipt-preview a {
          color: var(--cursor-accent);
          font-size: 12px;
          font-weight: 650;
          text-decoration: none;
        }
        .studio-admin-table-wrap {
          overflow: auto;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          border-radius: 16px;
          background: color-mix(in srgb, var(--mos-bg) 42%, transparent);
        }
        .studio-admin-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
          color: var(--color-cursor-text);
          font-size: 12px;
        }
        .studio-admin-table th,
        .studio-admin-table td {
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 54%, transparent);
          padding: 11px 12px;
          text-align: left;
          vertical-align: middle;
        }
        .studio-admin-table th {
          color: var(--color-cursor-muted);
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .studio-admin-table tbody tr {
          cursor: pointer;
        }
        .studio-admin-table tbody tr:hover,
        .studio-admin-table tbody tr.is-selected {
          background: color-mix(in srgb, var(--cursor-accent-dim) 36%, transparent);
        }
        .studio-admin-table td strong,
        .studio-admin-detail-panel h3,
        .studio-admin-setup-card h4 {
          display: block;
          color: var(--color-cursor-text-bright);
          font-weight: 760;
        }
        .studio-admin-table td span {
          display: block;
          margin-top: 2px;
          color: var(--color-cursor-muted);
          font-size: 11px;
        }
        .studio-admin-table a {
          color: var(--cursor-accent);
          font-weight: 720;
          text-decoration: none;
        }
        .studio-payment-status-pill {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 20%, var(--color-cursor-border-soft));
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent-dim) 34%, transparent);
          color: var(--color-cursor-text-bright);
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 760;
        }
        .studio-payment-status-pill.is-payment_completed {
          border-color: color-mix(in srgb, #22c55e 42%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, #22c55e 14%, transparent);
        }
        .studio-payment-status-pill.is-rejected {
          border-color: color-mix(in srgb, #ef4444 42%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, #ef4444 14%, transparent);
        }
        .studio-admin-detail-panel {
          display: grid;
          gap: 12px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          border-radius: 18px;
          background:
            radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--cursor-accent) 13%, transparent), transparent 40%),
            color-mix(in srgb, var(--mos-surface) 72%, transparent);
          padding: 16px;
        }
        .studio-admin-detail-list {
          display: grid;
          gap: 8px;
        }
        .studio-admin-detail-actions,
        .studio-admin-setup-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .studio-admin-detail-actions a,
        .studio-admin-detail-actions button,
        .studio-admin-detail-actions span,
        .studio-admin-muted-action {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 48%, transparent);
          color: var(--color-cursor-text-bright);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 720;
          text-decoration: none;
          cursor: pointer;
        }
        .studio-admin-detail-actions span,
        .studio-admin-muted-action {
          color: var(--color-cursor-muted);
          cursor: default;
        }
        .studio-admin-rejection-note {
          border: 1px solid color-mix(in srgb, #ef4444 34%, var(--color-cursor-border-soft));
          border-radius: 12px;
          background: color-mix(in srgb, #ef4444 12%, transparent);
          color: var(--color-cursor-text-bright);
          padding: 10px;
          font-size: 12px;
        }
        .studio-admin-setup-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }
        .studio-admin-setup-card {
          align-items: flex-start;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          border-radius: 16px;
          background: color-mix(in srgb, var(--mos-bg) 42%, transparent);
          padding: 14px;
        }
        .studio-admin-setup-card p {
          margin-top: 4px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-price-card:hover,
        .studio-bank-card:hover,
        .studio-admin-card:hover {
          transform: none;
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          box-shadow: none;
        }
        .studio-price-card.is-featured {
          border-color: color-mix(in srgb, var(--cursor-accent) 48%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 28% 0%, color-mix(in srgb, var(--cursor-accent) 24%, transparent), transparent 48%),
            color-mix(in srgb, var(--mos-surface) 80%, transparent);
        }
        .studio-price-card-kicker,
        .studio-admin-card-kicker {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .studio-plan-badge {
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 22%, transparent);
          color: var(--cursor-accent);
          padding: 4px 8px;
          font-size: 10px;
          letter-spacing: 0;
          text-transform: none;
        }
        .studio-price-card-title {
          margin-top: 8px;
          color: var(--color-cursor-text-bright);
          font-size: 16px;
          font-weight: 650;
        }
        .studio-price-card-credits {
          margin-top: 4px;
          color: var(--cursor-accent);
          font-size: 26px;
          font-weight: 720;
          line-height: 1;
          text-shadow: 0 0 14px var(--studio-glow-soft);
        }
        .studio-price-card-meta,
        .studio-bank-meta,
        .studio-admin-card p {
          margin-top: 6px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.45;
        }
        .studio-credit-costs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 10px;
        }
        .studio-credit-cost {
          border-radius: 12px;
          background: var(--cursor-overlay-subtle);
          padding: 8px;
        }
        .studio-credit-cost span {
          display: block;
          color: var(--color-cursor-muted);
          font-size: 10px;
        }
        .studio-credit-cost strong {
          color: var(--color-cursor-text);
          font-size: 12px;
        }
        .studio-credit-cost em {
          display: block;
          margin-top: 3px;
          color: color-mix(in srgb, var(--color-cursor-muted) 82%, transparent);
          font-size: 10px;
          font-style: normal;
          line-height: 1.25;
        }
        .studio-bank-card {
          display: grid;
          gap: 6px;
        }
        .studio-bank-card-title {
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
        }
        .studio-bank-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--mos-bg) 40%, transparent);
          padding: 6px 8px;
          color: var(--color-cursor-muted);
          font-size: 11px;
        }
        .studio-bank-row strong {
          color: var(--color-cursor-text);
          font-weight: 520;
          text-align: right;
        }
        .studio-element-picker {
          min-width: 268px;
          max-width: 300px;
        }
        .studio-element-picker-list {
          max-height: 220px;
          overflow: auto;
        }
        .studio-element-create-types {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .studio-element-create-type-btn {
          display: grid;
          place-items: center;
          gap: 4px;
          min-height: 52px;
          border-radius: 12px;
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-bg) 36%, transparent);
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 600;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            background var(--studio-motion-fast) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-element-create-type-btn.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 55%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          color: var(--color-cursor-text-bright);
        }
        .studio-element-create-name {
          margin-top: 10px;
          width: 100%;
          height: 34px;
          border-radius: 10px;
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-bg) 36%, transparent);
          padding: 0 10px;
          color: var(--color-cursor-text);
          font-size: 12px;
          outline: none;
        }
        .studio-element-create-name:focus {
          border-color: color-mix(in srgb, var(--cursor-accent) 55%, var(--color-cursor-border-soft));
        }
        .studio-element-create-media {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
          min-height: 40px;
          align-items: center;
        }
        .studio-element-create-thumb {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--mos-bg) 50%, transparent) center/cover no-repeat;
          border: 1px solid var(--color-cursor-border-soft);
        }
        .studio-element-create-upload {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px dashed var(--color-cursor-border-soft);
          color: var(--color-cursor-muted);
          background: transparent;
        }
        .studio-element-create-upload:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 44%, var(--color-cursor-border-soft));
          color: var(--color-cursor-text);
        }
        .studio-element-create-sheet {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-top: 10px;
          font-size: 11px;
          line-height: 1.35;
          color: var(--color-cursor-muted);
        }
        .studio-element-create-sheet input {
          margin-top: 2px;
          accent-color: var(--cursor-accent);
        }
        .studio-element-create-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .studio-element-create-submit {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 34px;
          border-radius: 10px;
          border: none;
          background: var(--cursor-accent);
          color: #000;
          font-size: 12px;
          font-weight: 650;
        }
        .studio-element-create-submit:disabled {
          opacity: 0.45;
        }
        .studio-element-picker-footer {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid var(--color-cursor-border-soft);
        }
        .studio-element-detail {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: min(100%, 920px);
          margin: 0 auto;
          padding: 18px 18px 24px;
        }
        .studio-element-detail-hero {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 14%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 12%, transparent), transparent 44%),
            color-mix(in srgb, var(--mos-surface) 72%, transparent);
          padding: 18px;
        }
        .studio-element-detail-hero h2 {
          margin-top: 6px;
          color: var(--color-cursor-text-bright);
          font-size: 24px;
          font-weight: 720;
        }
        .studio-element-detail-hero p {
          margin-top: 6px;
          color: var(--color-cursor-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .studio-element-detail-status {
          margin-top: 4px !important;
          font-size: 11px !important;
        }
        .studio-element-detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .studio-element-detail-grid {
          display: grid;
          gap: 14px;
        }
        .studio-element-detail-card {
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 14%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--mos-surface) 58%, transparent);
          padding: 16px;
        }
        .studio-element-detail-card-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }
        .studio-element-detail-hint {
          margin-top: 4px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.4;
        }
        .studio-element-detail-fields {
          display: grid;
          gap: 12px;
          margin-top: 12px;
        }
        .studio-element-detail-field {
          display: grid;
          gap: 6px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 600;
        }
        .studio-element-detail-input,
        .studio-element-detail-textarea {
          width: 100%;
          border-radius: 12px;
          border: 1px solid var(--color-cursor-border-soft);
          background: color-mix(in srgb, var(--mos-bg) 36%, transparent);
          color: var(--color-cursor-text);
          outline: none;
          transition: border-color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-element-detail-input {
          height: 40px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 500;
        }
        .studio-element-detail-textarea {
          min-height: 220px;
          resize: vertical;
          padding: 12px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          line-height: 1.5;
        }
        .studio-element-detail-input:focus,
        .studio-element-detail-textarea:focus {
          border-color: color-mix(in srgb, var(--cursor-accent) 55%, var(--color-cursor-border-soft));
        }
        .studio-element-detail-media-stage {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 220px;
          margin-top: 12px;
          padding: 12px;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: 14px;
          background: transparent;
        }
        .studio-element-detail-media-stage.is-clickable {
          cursor: pointer;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            background var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-element-detail-media-stage.is-clickable:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 44%, var(--color-cursor-border-soft));
          background: var(--color-cursor-hover);
        }
        .studio-element-detail-media-img {
          display: block;
          max-width: 100%;
          max-height: min(52vh, 420px);
          object-fit: contain;
          border-radius: 8px;
        }
        .studio-element-detail-media-hint {
          position: absolute;
          right: 12px;
          bottom: 12px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 72%, transparent);
          border: 1px solid var(--color-cursor-border-soft);
          color: var(--color-cursor-muted);
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 600;
          pointer-events: none;
        }
        .studio-element-detail-media-grid {
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        }
        .studio-element-detail-media-item {
          display: grid;
          gap: 6px;
        }
        .studio-element-detail-media-item-open {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: 12px;
          background: transparent;
          color: inherit;
          text-align: left;
          transition:
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            background var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-element-detail-media-item-open:not(.is-static) {
          cursor: pointer;
        }
        .studio-element-detail-media-item-open:not(.is-static):hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 44%, var(--color-cursor-border-soft));
          background: var(--color-cursor-hover);
        }
        .studio-element-detail-media-thumb {
          flex: 0 0 auto;
          width: 56px;
          height: 56px;
          border-radius: 10px;
          border: 1px solid var(--color-cursor-border-soft);
          background: transparent center/cover no-repeat;
        }
        .studio-element-detail-media-thumb.is-empty {
          display: grid;
          place-items: center;
          background: color-mix(in srgb, var(--mos-bg) 36%, transparent);
        }
        .studio-element-detail-media-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }
        .studio-element-detail-media-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--color-cursor-text);
          font-size: 12px;
          font-weight: 600;
        }
        .studio-element-detail-media-kind {
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .studio-element-detail-media-remove {
          justify-self: start;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--color-cursor-muted);
          padding: 4px 8px;
          font-size: 11px;
          cursor: pointer;
        }
        .studio-element-detail-media-remove:hover {
          background: var(--color-cursor-hover);
          color: var(--color-cursor-text);
        }
        .studio-element-detail-empty {
          margin-top: 4px;
          border: 1px dashed var(--color-cursor-border-soft);
          border-radius: 12px;
          padding: 14px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-element-detail-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        @keyframes studio-menu-pop {
          from { opacity: 0; transform: translateY(4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .studio-audio-switch {
          position: relative;
          width: 34px;
          height: 18px;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid var(--color-cursor-border-soft);
          background: var(--cursor-overlay-subtle);
          transition: background var(--studio-motion-fast) var(--studio-motion-ease), border-color var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-audio-switch::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          background: var(--color-cursor-muted);
          transition: transform var(--studio-motion-fast) var(--studio-motion-spring), background var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-audio-switch.is-on {
          border-color: color-mix(in srgb, var(--cursor-accent) 44%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 22%, transparent);
        }
        .studio-audio-switch.is-on::after {
          transform: translateX(16px);
          background: var(--cursor-accent);
        }
        .studio-empty-logo {
          position: relative;
          display: grid;
          place-items: center;
          width: 148px;
          height: 148px;
          margin: 0 auto;
        }
        .studio-empty-logo-btn {
          position: relative;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          pointer-events: auto;
          cursor: pointer;
          border: none;
          background: transparent;
          padding: 0;
          margin: 0 auto;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .studio-empty-logo-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .studio-empty-logo-btn:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--cursor-accent) 55%, transparent);
          outline-offset: 6px;
          border-radius: 20px;
        }
        .studio-empty-logo,
        .studio-empty-logo img,
        .studio-empty-logo::before,
        .studio-polish .studio-empty-logo-blur {
          transition:
            transform 280ms cubic-bezier(0.34, 1.15, 0.64, 1),
            filter 280ms ease,
            opacity 280ms ease,
            box-shadow 280ms ease;
        }
        .studio-empty-logo-btn.is-pressed .studio-empty-logo,
        .studio-empty-logo-btn.is-pressed .studio-empty-logo img,
        .studio-empty-logo-btn.is-pressed .studio-empty-logo::before,
        .studio-empty-logo-btn.is-pressed .studio-empty-logo-blur {
          transition:
            transform 160ms cubic-bezier(0.25, 0.9, 0.35, 1),
            filter 160ms ease,
            opacity 160ms ease,
            box-shadow 160ms ease;
        }
        .studio-empty-logo-btn.is-pressed .studio-empty-logo img {
          transform: translate(-2px, 9px) scale(0.9);
          filter: drop-shadow(0 2px 5px color-mix(in srgb, #000 10%, transparent));
          opacity: 0.9;
        }
        .studio-empty-logo-btn.is-pressed .studio-empty-logo::before {
          opacity: 0.38;
          filter: blur(9px);
          transform: translateX(-50%) scale(0.72);
        }
        .studio-empty-logo-btn.is-pressed .studio-empty-logo-blur {
          transform: scale(0.94) translateY(3px);
          box-shadow:
            0 8px 18px color-mix(in srgb, #000 22%, transparent),
            0 2px 5px color-mix(in srgb, #000 14%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        [data-appearance="light"] .studio-empty-logo-btn.is-pressed .studio-empty-logo-blur {
          box-shadow:
            0 4px 10px color-mix(in srgb, #000 6%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.32);
        }
        .studio-empty-logo::before {
          content: "";
          position: absolute;
          top: 72%;
          left: 50%;
          z-index: -1;
          width: 78%;
          height: 28%;
          border-radius: 999px;
          pointer-events: none;
          transform: translateX(-50%);
          background: radial-gradient(
            ellipse at 50% 50%,
            color-mix(in srgb, #000 58%, transparent) 0%,
            color-mix(in srgb, #000 28%, transparent) 42%,
            transparent 72%
          );
          filter: blur(18px);
          opacity: 0.88;
        }
        [data-appearance="light"] .studio-empty-logo::before {
          background: radial-gradient(
            ellipse at 50% 50%,
            color-mix(in srgb, #000 24%, transparent) 0%,
            color-mix(in srgb, #000 10%, transparent) 44%,
            transparent 72%
          );
          opacity: 0.72;
        }
        [data-appearance="light"] .studio-empty-logo img {
          filter: none;
          opacity: 0.68;
        }
        .studio-empty-logo img {
          position: relative;
          z-index: 1;
          width: 104px;
          height: 104px;
          object-fit: contain;
          transform: translate(-2px, 5px);
          opacity: 0.76;
          filter: drop-shadow(0 10px 20px color-mix(in srgb, #000 18%, transparent));
        }
        .studio-polish .cursor-chat-empty.thread-empty.cursor-chat-empty-logo-only {
          position: relative;
          overflow: hidden;
          background: transparent;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none;
        }
        .studio-polish .cursor-chat-empty.thread-empty.cursor-chat-empty-logo-only::before,
        .studio-polish .cursor-chat-empty.thread-empty.cursor-chat-empty-logo-only::after {
          content: "";
          display: none;
        }
        .studio-polish .cursor-chat-empty.thread-empty.cursor-chat-empty-logo-only::before {
          opacity: 0.94;
          background:
            radial-gradient(ellipse at 52% 48%, color-mix(in srgb, var(--cursor-accent) 14%, transparent), transparent 42%),
            radial-gradient(ellipse at 44% 46%, color-mix(in srgb, var(--mos-text-bright) 8%, transparent), transparent 18%),
            radial-gradient(circle at 3% 10%, color-mix(in srgb, var(--mos-text-bright) 42%, transparent) 0 0.75px, transparent 1.25px),
            radial-gradient(circle at 8% 72%, color-mix(in srgb, var(--cursor-accent) 28%, transparent) 0 0.85px, transparent 1.35px),
            radial-gradient(circle at 14% 39%, color-mix(in srgb, var(--mos-text-bright) 48%, transparent) 0 1px, transparent 1.6px),
            radial-gradient(circle at 19% 88%, color-mix(in srgb, var(--mos-text-bright) 30%, transparent) 0 0.75px, transparent 1.25px),
            radial-gradient(circle at 26% 16%, color-mix(in srgb, var(--cursor-accent-hover) 28%, transparent) 0 0.8px, transparent 1.3px),
            radial-gradient(circle at 32% 57%, color-mix(in srgb, var(--mos-text-bright) 36%, transparent) 0 0.85px, transparent 1.35px),
            radial-gradient(circle at 40% 30%, color-mix(in srgb, var(--mos-text-bright) 62%, transparent) 0 1.15px, transparent 1.85px),
            radial-gradient(circle at 47% 82%, color-mix(in srgb, var(--cursor-accent) 30%, transparent) 0 0.9px, transparent 1.45px),
            radial-gradient(circle at 54% 12%, color-mix(in srgb, var(--mos-text-bright) 34%, transparent) 0 0.75px, transparent 1.25px),
            radial-gradient(circle at 60% 46%, color-mix(in srgb, var(--cursor-accent-hover) 28%, transparent) 0 0.8px, transparent 1.35px),
            radial-gradient(circle at 68% 91%, color-mix(in srgb, var(--mos-text-bright) 42%, transparent) 0 1px, transparent 1.65px),
            radial-gradient(circle at 76% 24%, color-mix(in srgb, var(--mos-text-bright) 54%, transparent) 0 1px, transparent 1.75px),
            radial-gradient(circle at 84% 63%, color-mix(in srgb, var(--cursor-accent) 26%, transparent) 0 0.8px, transparent 1.35px),
            radial-gradient(circle at 93% 38%, color-mix(in srgb, var(--mos-text-bright) 40%, transparent) 0 0.75px, transparent 1.25px),
            radial-gradient(circle at 97% 82%, color-mix(in srgb, var(--mos-text-bright) 28%, transparent) 0 0.65px, transparent 1.15px),
            radial-gradient(circle at 6% 27%, color-mix(in srgb, var(--mos-text-bright) 36%, transparent) 0 0.65px, transparent 1.1px),
            radial-gradient(circle at 12% 92%, color-mix(in srgb, var(--cursor-accent-hover) 22%, transparent) 0 0.6px, transparent 1.05px),
            radial-gradient(circle at 21% 24%, color-mix(in srgb, var(--mos-text-bright) 46%, transparent) 0 0.9px, transparent 1.45px),
            radial-gradient(circle at 29% 72%, color-mix(in srgb, var(--mos-text-bright) 32%, transparent) 0 0.7px, transparent 1.2px),
            radial-gradient(circle at 35% 8%, color-mix(in srgb, var(--cursor-accent) 26%, transparent) 0 0.7px, transparent 1.2px),
            radial-gradient(circle at 43% 64%, color-mix(in srgb, var(--mos-text-bright) 40%, transparent) 0 0.8px, transparent 1.35px),
            radial-gradient(circle at 50% 21%, color-mix(in srgb, var(--mos-text-bright) 30%, transparent) 0 0.65px, transparent 1.1px),
            radial-gradient(circle at 57% 93%, color-mix(in srgb, var(--cursor-accent-hover) 24%, transparent) 0 0.7px, transparent 1.2px),
            radial-gradient(circle at 64% 33%, color-mix(in srgb, var(--mos-text-bright) 52%, transparent) 0 1px, transparent 1.6px),
            radial-gradient(circle at 71% 68%, color-mix(in srgb, var(--mos-text-bright) 34%, transparent) 0 0.75px, transparent 1.25px),
            radial-gradient(circle at 81% 8%, color-mix(in srgb, var(--cursor-accent) 22%, transparent) 0 0.65px, transparent 1.1px),
            radial-gradient(circle at 91% 91%, color-mix(in srgb, var(--mos-text-bright) 38%, transparent) 0 0.8px, transparent 1.35px);
          background-blend-mode: screen, screen, normal;
          background-size: auto;
          background-position: 50% 50%;
          background-repeat: no-repeat;
          transform-origin: 50% 50%;
          animation: studio-star-orbit 32s linear infinite;
          will-change: transform, opacity;
        }
        .studio-polish .cursor-chat-empty.thread-empty.cursor-chat-empty-logo-only::after {
          opacity: 0;
          background:
            linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--mos-text-bright) 92%, transparent) 48%, transparent 100%),
            linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--cursor-accent-hover) 68%, transparent) 52%, transparent 100%),
            linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--cursor-accent) 52%, transparent) 50%, transparent 100%);
          background-size: 420px 2px, 260px 1px, 180px 1px;
          background-repeat: no-repeat;
          background-position: 116% 18%, 118% 58%, 116% 82%;
          transform: rotate(-22deg);
          transform-origin: 50% 50%;
          animation: studio-shooting-stars 12s ease-in-out infinite;
          will-change: opacity, background-position;
        }
        .studio-empty-hero {
          position: relative;
          z-index: 1;
          display: grid;
          place-items: center;
          width: min(560px, calc(100% - 32px));
          margin: 0 auto;
          text-align: center;
        }
        .studio-empty-hero::before {
          content: "";
          position: absolute;
          inset: -44vh -34vw;
          z-index: -1;
          border-radius: 999px;
          pointer-events: none;
          opacity: 0.28;
          background:
            radial-gradient(ellipse at 36% 42%, color-mix(in srgb, var(--cursor-accent) 38%, transparent), transparent 34%),
            radial-gradient(ellipse at 64% 48%, color-mix(in srgb, var(--cursor-accent-hover) 26%, transparent), transparent 33%),
            radial-gradient(ellipse at 50% 62%, color-mix(in srgb, var(--mos-text-bright) 11%, transparent), transparent 38%),
            conic-gradient(from 90deg at 50% 50%, transparent, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent, color-mix(in srgb, var(--cursor-accent-hover) 9%, transparent), transparent);
          filter: blur(22px);
          transform-origin: 50% 50%;
          animation: studio-nebula-pulse 18s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .studio-empty-hero::after {
          content: "";
          position: absolute;
          inset: -36vh -30vw;
          z-index: -1;
          pointer-events: none;
          opacity: 0.1;
          background:
            conic-gradient(
              from 120deg at 50% 52%,
              transparent 0deg,
              color-mix(in srgb, var(--cursor-accent) 18%, transparent) 56deg,
              transparent 116deg,
              color-mix(in srgb, var(--cursor-accent-hover) 16%, transparent) 196deg,
              transparent 280deg
            );
          filter: blur(24px);
          transform-origin: 50% 50%;
          animation: studio-aurora-swim 24s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .studio-empty-hero::before,
        .studio-empty-hero::after {
          content: "";
          display: block;
        }
        .studio-empty-copy {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 8px;
          margin-top: -8px;
          border: 1px solid var(--studio-card-border);
          border-radius: 24px;
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--cursor-accent) 13%, transparent), transparent 48%),
            color-mix(in srgb, var(--mos-surface) 52%, transparent);
          padding: 18px 20px;
          box-shadow:
            0 20px 50px color-mix(in srgb, var(--mos-bg) 28%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent);
        }
        .studio-empty-copy h1 {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: clamp(22px, 4vw, 34px);
          font-weight: 760;
          letter-spacing: -0.035em;
        }
        .studio-empty-copy p {
          margin: 0 auto;
          max-width: 42ch;
          color: var(--color-cursor-muted);
          font-size: 13px;
          line-height: 1.5;
        }
        [data-studio-bg-family="animated"] .studio-polish .studio-empty-hero::before,
        [data-studio-bg-family="animated"] .studio-polish .studio-empty-hero::after,
        [data-studio-bg-family="cinematic"] .studio-polish .studio-empty-hero::before,
        [data-studio-bg-family="cinematic"] .studio-polish .studio-empty-hero::after,
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-hero::before,
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-hero::after {
          display: none;
        }
        [data-studio-bg-family="animated"] .studio-polish .studio-empty-copy,
        [data-studio-bg-family="cinematic"] .studio-polish .studio-empty-copy,
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-copy {
          border-color: color-mix(in srgb, var(--mos-text-bright) 6%, transparent);
          background: color-mix(in srgb, #000 16%, transparent);
          box-shadow: none;
        }
        [data-studio-bg-family="animated"] .studio-polish .studio-empty-chips span,
        [data-studio-bg-family="cinematic"] .studio-polish .studio-empty-chips span,
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-chips span {
          border-color: color-mix(in srgb, var(--mos-text-bright) 10%, transparent);
          background: color-mix(in srgb, #000 10%, transparent);
        }
        .studio-empty-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          margin-top: 4px;
        }
        .studio-empty-chips span {
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 20%, var(--color-cursor-border-soft));
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 9%, transparent);
          padding: 5px 9px;
          color: var(--color-cursor-text);
          font-size: 11px;
          font-weight: 650;
        }
        .studio-empty-title {
          position: relative;
          z-index: 1;
          margin: -24px 0 0;
          color: var(--color-cursor-text-bright);
          font-size: clamp(20px, 3vw, 30px);
          font-weight: 740;
          line-height: 1.05;
          letter-spacing: -0.035em;
          text-shadow: 0 14px 38px color-mix(in srgb, #000 28%, transparent);
        }
        .studio-credit-pill {
          border-color: color-mix(in srgb, var(--cursor-accent) 30%, var(--color-cursor-border-soft)) !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent-hover) 20%, transparent), transparent 45%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent) 13%, var(--mos-surface) 60%),
              color-mix(in srgb, var(--cursor-accent) 7%, var(--mos-bg) 76%)
            ) !important;
          color: var(--color-cursor-text-bright) !important;
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 8%, transparent),
            0 0 16px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-credit-pill svg {
          color: var(--cursor-accent-hover);
          filter: drop-shadow(0 0 6px color-mix(in srgb, var(--cursor-accent) 28%, transparent));
          stroke-width: 2.4;
        }
        .studio-thread-head,
        .studio-thread-card {
          border: 1px solid var(--studio-card-border);
          background:
            radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--cursor-accent) 12%, transparent), transparent 38%),
            var(--studio-card-bg);
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 4%, transparent);
        }
        .studio-thread-card {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          padding: 14px;
        }
        .studio-thread-card::before {
          content: "";
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          background: linear-gradient(180deg, var(--cursor-accent), transparent);
          opacity: 0.75;
        }
        .studio-thread-kind {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 12%, transparent);
          padding: 4px 8px;
          color: var(--cursor-accent);
          font-size: 10px;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .studio-thread-stage {
          display: inline-flex;
          width: fit-content;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          padding: 5px 9px;
          color: var(--cursor-accent);
          font-size: 11px;
          font-weight: 700;
        }
        .studio-chat-render-area {
          position: relative;
          display: flex;
          height: 100%;
          min-height: 0;
          flex-direction: column;
        }
        .studio-history-floating-panel {
          width: 100%;
        }
        .studio-history-floating-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 14px 10px 12px 14px;
          border-bottom: 1px solid var(--color-cursor-border);
        }
        .studio-history-head-copy {
          min-width: 0;
        }
        .studio-history-head-title {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }
        .studio-history-head-meta {
          margin: 3px 0 0;
          color: var(--color-cursor-muted);
          font-size: 11px;
          line-height: 1.2;
        }
        .studio-history-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
          margin: 10px 12px 8px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border) 72%, transparent);
          border-radius: 12px;
          background: color-mix(in srgb, var(--color-cursor-panel) 52%, transparent);
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        .studio-history-search-wrap:focus-within {
          border-color: color-mix(in srgb, var(--cursor-accent) 50%, transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--cursor-accent) 12%, transparent);
        }
        .studio-history-search-icon {
          margin-left: 11px;
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          color: var(--color-cursor-muted);
          pointer-events: none;
        }
        .studio-history-search {
          flex: 1;
          min-width: 0;
          margin: 0;
          padding: 9px 10px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: var(--color-cursor-text);
          font-size: 12px;
          outline: none;
        }
        .studio-history-search::placeholder {
          color: var(--color-cursor-muted);
        }
        .studio-history-search-clear {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-right: 6px;
          padding: 4px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--color-cursor-muted);
          cursor: pointer;
        }
        .studio-history-search-clear:hover {
          color: var(--color-cursor-text);
          background: color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-history-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          padding: 4px 10px 16px;
        }
        .studio-history-group + .studio-history-group {
          margin-top: 12px;
        }
        .studio-history-group-label {
          margin: 0 0 6px;
          padding: 0 4px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .studio-history-group-items {
          display: grid;
          gap: 4px;
        }
        .studio-history-item {
          display: flex;
          width: 100%;
          align-items: flex-start;
          gap: 10px;
          padding: 10px;
          border: 1px solid transparent;
          border-radius: 12px;
          background: transparent;
          color: inherit;
          font-family: inherit;
          font-size: inherit;
          text-align: left;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
        }
        .studio-history-item:hover {
          background: color-mix(in srgb, var(--cursor-accent) 8%, transparent);
          border-color: color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-history-item.is-active {
          background: color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          border-color: color-mix(in srgb, var(--cursor-accent) 30%, transparent);
          box-shadow: inset 2px 0 0 var(--cursor-accent);
        }
        .studio-history-item-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          border-radius: 8px;
          background: color-mix(in srgb, var(--cursor-accent) 10%, transparent);
          color: var(--cursor-accent);
        }
        .studio-history-item-body {
          display: flex;
          min-width: 0;
          flex: 1;
          flex-direction: column;
          gap: 3px;
        }
        .studio-history-item-title {
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 650;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-history-item-date {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          line-height: 1.2;
        }
        .studio-history-item-date-icon {
          width: 11px;
          height: 11px;
          flex-shrink: 0;
          opacity: 0.8;
        }
        .studio-history-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 40px 18px;
          text-align: center;
        }
        .studio-history-empty-icon {
          width: 28px;
          height: 28px;
          color: color-mix(in srgb, var(--cursor-accent) 72%, var(--color-cursor-muted));
          opacity: 0.9;
        }
        .studio-history-empty-title {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
        }
        .studio-history-empty-copy {
          margin: 0;
          max-width: 22ch;
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.45;
        }
        .studio-chat-stream {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          scrollbar-gutter: stable;
          padding: 18px 10px calc(180px + env(safe-area-inset-bottom, 0px));
          scroll-padding-bottom: calc(180px + env(safe-area-inset-bottom, 0px));
        }
        .studio-chat-composer-align {
          display: grid;
          grid-template-columns:
            var(--studio-mode-switcher-width)
            minmax(0, 1fr)
            var(--studio-generate-column-width);
          gap: var(--studio-composer-row-gap);
          width: 100%;
          max-width: min(var(--studio-composer-shell-max), calc(100% - 24px));
          min-height: 100%;
          margin: 0 auto;
          position: relative;
          left: -5px;
          box-sizing: border-box;
        }
        .studio-chat-composer-gutter {
          pointer-events: none;
        }
        .studio-chat-stream-inner {
          display: flex;
          min-width: 0;
          min-height: 100%;
          flex-direction: column;
          justify-content: flex-end;
          align-items: stretch;
          gap: 12px;
        }
        .studio-chat-stream-inner.is-empty {
          justify-content: center;
        }
        .studio-chat-empty-state {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .studio-chat-empty-state .studio-empty-logo-btn {
          pointer-events: auto;
        }
        .studio-chat-bubble {
          position: relative;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
          border: 1px solid var(--studio-composer-glass-border);
          border-radius: 18px;
          background: var(--studio-composer-glass);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          overflow: hidden;
          padding: 12px 14px;
          box-shadow: var(--studio-composer-glass-shadow);
        }
        .studio-chat-bubble.is-user {
          background: var(--studio-composer-glass-strong);
        }
        .studio-chat-bubble.is-result {
          background: var(--studio-composer-glass-strong);
          box-shadow:
            var(--studio-composer-glass-shadow),
            0 0 24px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-chat-bubble.is-system {
          background: var(--studio-composer-glass-muted);
        }

        .studio-chat-kicker {
          margin-bottom: 6px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .studio-chat-text {
          color: var(--color-cursor-text);
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .studio-chat-markdown {
          color: var(--color-cursor-text);
          font-size: 13px;
          line-height: 1.55;
          white-space: normal;
        }
        .studio-chat-markdown :where(p, ul, ol, pre, blockquote) {
          margin: 0 0 0.65em;
        }
        .studio-chat-markdown :where(p:last-child, ul:last-child, ol:last-child, pre:last-child, blockquote:last-child) {
          margin-bottom: 0;
        }
        .studio-chat-markdown :where(code) {
          font-size: 0.92em;
        }
        .studio-chat-prompt {
          display: grid;
          gap: 10px;
        }
        .studio-chat-prompt-chips,
        .studio-chat-prompt-body {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .studio-chat-chip {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          gap: 5px;
          padding: 4px 8px 4px 6px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 22%, var(--studio-composer-glass-border));
          border-radius: 999px;
          background: var(--studio-composer-glass-muted);
          backdrop-filter: var(--studio-composer-glass-blur);
          -webkit-backdrop-filter: var(--studio-composer-glass-blur);
          color: var(--color-cursor-text);
          font-size: 11px;
          font-weight: 650;
          line-height: 1.2;
          vertical-align: middle;
        }
        .studio-chat-chip--preview {
          padding-left: 4px;
        }
        .studio-chat-chip--image-only {
          position: relative;
          padding: 0;
          width: 28px;
          height: 28px;
          min-width: 28px;
          border-radius: 999px;
          overflow: hidden;
        }
        .studio-chat-chip-media-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .studio-chat-chip-media-wrap.is-inline {
          width: 18px;
          height: 18px;
        }
        .studio-chat-chip-media {
          display: block;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          object-fit: cover;
          background: color-mix(in srgb, var(--color-cursor-muted) 18%, transparent);
        }
        .studio-chat-chip--image-only .studio-chat-chip-media {
          width: 28px;
          height: 28px;
        }
        .studio-chat-chip-overlay {
          position: absolute;
          right: -1px;
          bottom: -1px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 24%, var(--studio-composer-glass-border));
          background: var(--studio-composer-glass-muted);
          color: var(--color-cursor-text);
        }
        .studio-chat-chip--image-only .studio-chat-chip-overlay .studio-chat-chip-icon {
          width: 7px;
          height: 7px;
        }
        .studio-chat-chip-icon {
          width: 12px;
          height: 12px;
          flex-shrink: 0;
          opacity: 0.9;
        }
        .studio-chat-chip-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-chat-markdown-bit {
          display: inline;
          color: var(--color-cursor-text);
          font-size: 13px;
          line-height: 1.5;
        }
        .studio-chat-markdown-bit :where(p) {
          display: inline;
          margin: 0;
        }
        .msg-user-markdown-bit {
          display: inline;
          color: inherit;
          font-size: inherit;
          line-height: inherit;
        }
        .msg-user-markdown-bit :where(p) {
          display: inline;
          margin: 0;
        }
        .studio-video-progress-card {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid var(--studio-composer-glass-border);
          background: var(--studio-gen-frame-bg);
          box-shadow: var(--studio-gen-card-shadow);
        }
        [data-appearance="light"] .studio-polish .studio-video-progress-card {
          background: transparent;
          box-shadow: var(--studio-composer-glass-shadow);
        }
        .studio-video-progress-frame {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: var(--studio-gen-frame-bg);
        }
        [data-appearance="light"] .studio-polish .studio-video-progress-frame {
          background: var(--studio-gen-glass-fill);
          backdrop-filter: var(--studio-gen-glass-blur);
          -webkit-backdrop-filter: var(--studio-gen-glass-blur);
        }
        .studio-video-progress-frame::before {
          content: "";
          position: absolute;
          inset: -80%;
          background:
            radial-gradient(circle at 30% 50%, var(--studio-gen-aura-a) 0%, transparent 40%),
            radial-gradient(circle at 70% 50%, var(--studio-gen-aura-b) 0%, transparent 40%);
          animation: studio-aura-drift 5000ms ease-in-out infinite alternate;
        }
        @keyframes studio-aura-drift {
          0% { transform: translate(-10%, -5%) scale(1); }
          50% { transform: translate(5%, 5%) scale(1.1); }
          100% { transform: translate(10%, -5%) scale(1); }
        }
        .studio-video-progress-frame::after {
          content: "";
          position: absolute;
          inset: -100%;
          background:
            radial-gradient(circle at 50% 50%, transparent 20%, color-mix(in srgb, var(--mos-text-bright) 20%, transparent) 40%, transparent 55%),
            radial-gradient(circle at 50% 50%, transparent 0%, color-mix(in srgb, var(--cursor-accent) 12%, transparent) 25%, transparent 45%);
          animation: studio-ripple-pulse 3000ms cubic-bezier(0.25, 0, 0.2, 1) infinite;
        }
        @keyframes studio-ripple-pulse {
          0% { transform: scale(0.5); opacity: 0; }
          15% { opacity: 0.7; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .studio-gen-status-frame.has-dot-wave::before,
        .studio-gen-status-frame.has-dot-wave::after {
          display: none;
        }
        .studio-dot-grid-wave {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        .studio-dot-grid-wave-stage {
          position: relative;
          border-radius: 50%;
        }
        .studio-dot-grid-wave-dot-wrap {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(calc(-50% + var(--dot-x, 0px)), calc(-50% + var(--dot-y, 0px)));
          pointer-events: none;
        }
        .studio-dot-grid-wave-dot {
          display: block;
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 82%, white);
          box-shadow: 0 0 10px color-mix(in srgb, var(--cursor-accent) 34%, transparent);
          animation: studio-dot-grid-wave 1.85s ease-in-out infinite;
          animation-delay: var(--dot-delay, 0s);
        }
        @keyframes studio-dot-grid-wave {
          0%, 100% {
            transform: scale(0.72);
            opacity: 0.28;
          }
          50% {
            transform: scale(1.12);
            opacity: 1;
          }
        }
        .studio-gen-status-content.is-minimal {
          justify-content: flex-end;
          padding-bottom: 14px;
        }
        .studio-gen-status-content.is-minimal strong {
          font-size: 12px;
          font-weight: 600;
          color: color-mix(in srgb, var(--studio-gen-frame-text) 78%, var(--color-cursor-muted));
        }
        .studio-video-progress-content,
        .studio-gen-status-content {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 18px 20px;
          color: var(--studio-gen-frame-text);
          text-align: center;
        }
        .studio-gen-status-content strong {
          font-size: 13px;
          font-weight: 650;
          line-height: 1.35;
        }
        .studio-gen-status-detail {
          margin: 0;
          max-width: 36ch;
          color: var(--color-cursor-muted);
          font-size: 12px;
          font-weight: 450;
          line-height: 1.45;
        }
        .studio-gen-status-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          background: color-mix(in srgb, currentColor 10%, transparent);
        }
        .studio-gen-status-icon svg {
          width: 18px;
          height: 18px;
        }
        .studio-gen-status-card.is-failed .studio-gen-status-frame {
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, #ef4444 10%, transparent), transparent 58%),
            var(--studio-gen-frame-bg);
        }
        [data-appearance="light"] .studio-polish .studio-gen-status-card.is-failed .studio-gen-status-frame {
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, #ef4444 14%, transparent), transparent 62%),
            var(--studio-gen-glass-fill);
          backdrop-filter: var(--studio-gen-glass-blur);
          -webkit-backdrop-filter: var(--studio-gen-glass-blur);
        }
        .studio-gen-status-card.is-failed .studio-gen-status-content {
          color: color-mix(in srgb, #ef4444 72%, var(--studio-gen-frame-text));
        }
        .studio-gen-status-card.is-failed .studio-gen-status-detail {
          color: color-mix(in srgb, #ef4444 42%, var(--color-cursor-muted));
        }
        .studio-gen-status-card.is-cancelled .studio-gen-status-frame {
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--color-cursor-muted) 12%, transparent), transparent 58%),
            var(--studio-gen-frame-bg);
        }
        [data-appearance="light"] .studio-polish .studio-gen-status-card.is-cancelled .studio-gen-status-frame {
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--color-cursor-muted) 10%, transparent), transparent 62%),
            var(--studio-gen-glass-fill);
          backdrop-filter: var(--studio-gen-glass-blur);
          -webkit-backdrop-filter: var(--studio-gen-glass-blur);
        }
        .studio-gen-status-card.is-cancelled .studio-gen-status-content {
          color: var(--color-cursor-text);
        }
        .studio-gen-status-card.is-progress .studio-gen-status-frame::before,
        .studio-gen-status-card.is-progress .studio-gen-status-frame::after {
          display: block;
        }
        .studio-gen-status-card:not(.is-progress) .studio-gen-status-frame::before,
        .studio-gen-status-card:not(.is-progress) .studio-gen-status-frame::after {
          display: none;
        }
        @keyframes studio-spin {
          to { transform: rotate(360deg); }
        }
        .studio-chat-result-grid {
          display: grid;
          gap: 10px;
          width: calc(100% + 28px);
          max-width: none;
          min-width: 0;
          margin: -12px -14px;
          box-sizing: border-box;
        }
        .studio-chat-result-card {
          overflow: hidden;
          width: 100%;
          min-width: 0;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 80%, transparent);
          background: var(--studio-gen-frame-bg);
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--color-cursor-border-soft) 80%, transparent),
            var(--studio-gen-card-shadow);
        }
        .studio-chat-result-card.is-openable {
          cursor: pointer;
          padding: 0;
          width: 100%;
          min-width: 0;
          text-align: left;
          color: inherit;
          font: inherit;
        }
        .studio-chat-result-card[draggable="true"] {
          cursor: grab;
        }
        .studio-chat-result-card[draggable="true"]:active {
          cursor: grabbing;
        }
        .studio-chat-result-card.is-openable:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border-soft));
        }
        .studio-chat-result-card.is-openable:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 3px color-mix(in srgb, var(--cursor-accent) 16%, transparent),
            inset 0 0 0 1px color-mix(in srgb, var(--color-cursor-border-soft) 80%, transparent),
            var(--studio-gen-card-shadow);
        }
        .studio-chat-result-open {
          display: block;
          width: 100%;
          border: 0;
          border-top: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 80%, transparent);
          background: color-mix(in srgb, var(--mos-surface) 72%, transparent);
          color: var(--cursor-text);
          font-size: 12px;
          font-weight: 600;
          padding: 8px 12px;
          cursor: pointer;
          text-align: center;
        }
        .studio-chat-result-open:hover {
          background: color-mix(in srgb, var(--cursor-accent) 10%, var(--mos-surface));
        }
        [data-appearance="light"] .studio-polish .studio-chat-result-card {
          background: var(--studio-gen-glass-fill);
          backdrop-filter: var(--studio-gen-glass-blur);
          -webkit-backdrop-filter: var(--studio-gen-glass-blur);
          border-color: var(--studio-composer-glass-border);
          box-shadow: var(--studio-composer-glass-shadow);
        }
        .studio-chat-result-card img,
        .studio-chat-result-card video {
          display: block;
          width: 100%;
          max-width: 100%;
          height: auto;
          object-fit: contain;
          background: var(--studio-gen-media-bg);
        }
        .studio-chat-result-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 9px 10px;
          color: var(--color-cursor-muted);
          font-size: 11px;
        }
        @media (max-width: 899px) {
          .studio-video-progress-card {
            max-width: none;
            width: 100%;
          }
          .studio-chat-stream {
            padding: 12px 12px calc(154px + env(safe-area-inset-bottom, 0px));
            scroll-padding-bottom: calc(154px + env(safe-area-inset-bottom, 0px));
          }
        }
        @keyframes studio-logo-breathe {
          0%, 100% { opacity: 0.34; transform: scale(0.96); }
          50% { opacity: 0.62; transform: scale(1.04); }
        }
        @keyframes studio-tab-slide-from-behind {
          0% {
            opacity: 0.36;
            transform: translate3d(-42px, 0, 0) scale(0.98);
          }
          58% {
            opacity: 1;
            transform: translate3d(3px, 0, 0) scale(1.005);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes studio-star-orbit {
          0% {
            opacity: 0.58;
            transform: rotate(0deg) scale(1) translate3d(0, 0, 0);
          }
          28% {
            opacity: 0.74;
            transform: rotate(0.45deg) scale(1.028) translate3d(-0.8%, 0.4%, 0);
          }
          57% {
            opacity: 0.7;
            transform: rotate(0.8deg) scale(1.045) translate3d(0.7%, -0.5%, 0);
          }
          78% {
            opacity: 0.78;
            transform: rotate(0.35deg) scale(1.025) translate3d(0.2%, 0.8%, 0);
          }
          100% {
            opacity: 0.58;
            transform: rotate(0deg) scale(1) translate3d(0, 0, 0);
          }
        }
        @keyframes studio-nebula-pulse {
          0%,
          100% {
            opacity: 0.58;
            transform: rotate(0deg) scale(0.9) skew(-2deg);
          }
          38% {
            opacity: 0.94;
            transform: rotate(10deg) scale(1.12) skew(2deg);
          }
          70% {
            opacity: 0.74;
            transform: rotate(-7deg) scale(1.04) skew(-1deg);
          }
        }
        @keyframes studio-aurora-swim {
          0%,
          100% {
            opacity: 0.34;
            transform: rotate(-10deg) scale(0.92) translate3d(-1%, 1%, 0);
          }
          35% {
            opacity: 0.64;
            transform: rotate(10deg) scale(1.08) translate3d(2%, -1%, 0);
          }
          68% {
            opacity: 0.5;
            transform: rotate(-2deg) scale(1.02) translate3d(-1%, -2%, 0);
          }
        }
        @keyframes studio-shooting-stars {
          0%, 14%, 100% {
            opacity: 0;
            background-position: 116% 18%, 118% 58%, 116% 82%;
          }
          18% {
            opacity: 0.78;
          }
          29% {
            opacity: 0;
            background-position: -24% 18%, 118% 58%, 116% 82%;
          }
          52% {
            opacity: 0;
            background-position: 116% 18%, 118% 58%, 116% 82%;
          }
          57% {
            opacity: 0.62;
          }
          68% {
            opacity: 0;
            background-position: 116% 18%, -22% 58%, 116% 82%;
          }
          84% {
            opacity: 0;
            background-position: 116% 18%, 118% 58%, 116% 82%;
          }
          88% {
            opacity: 0.44;
          }
          96% {
            opacity: 0;
            background-position: 116% 18%, 118% 58%, -20% 82%;
          }
        }
      `}</style>
      <PanelGroup direction="horizontal" autoSaveId={isMobile ? "studio-main-h-mobile" : "studio-main-h"} className="studio-main-panels min-w-0 flex-1">
        {(!isMobile || mobileSection === "files") ? (
        <Panel defaultSize={isMobile ? 100 : 24} minSize={isMobile ? 100 : 16} maxSize={isMobile ? 100 : 42}>
      <aside className={STYLE.sidebar}>
        <div className={STYLE.panelHead}>
          <StudioUserMenu currentUser={currentUser} onSignOut={() => void signOut()} />
          <div className="flex items-center gap-1">
            <StudioAddMenu
              open={addMenuOpen}
              setOpen={setAddMenuOpen}
              onAction={runCreateAction}
            />
            <button
              type="button"
              className="studio-settings-pill studio-settings-trigger"
              title={viewMode === "grid" ? "Switch to list" : "Switch to grid"}
              aria-label={viewMode === "grid" ? "Switch to list" : "Switch to grid"}
              onClick={() => setViewMode((mode) => (mode === "grid" ? "list" : "grid"))}
            >
              {viewMode === "grid" ? <List className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            </button>
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            multiple
            onChange={(event) => {
              void uploadFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div className="cursor-explorer-body flex flex-col flex-1 min-h-0 overflow-hidden">
        <PanelSearchBar value={search} onChange={setSearch} placeholder="Search your content" aria-label="Search your content" />
        <div className="studio-folder-pathbar shrink-0">
          <FileBreadcrumbs path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} onDropEntry={handleBreadcrumbDrop} />
        </div>
        <FileTree
          viewMode={viewMode}
          workspaceId={WORKSPACE_ID}
          rootEntries={displayRootEntries}
          flatEntries={displayCurrentEntries}
          listDir={() => {}}
          onNavigate={(path, navEntry) => {
            if (navEntry?.type === "parent" && navEntry.studioId) {
              setActiveFolderId(navEntry.studioId);
              setNavTrail((trail) => trail.slice(0, -1));
              return;
            }
            const entry = pathToEntry.get(path);
            if (entry) {
              handleEntryOpen(entry);
              return;
            }
            const folder = [...(topFolders ?? []), ...(childFolders ?? [])].find(
              (item) => studioPathForFolder(item) === path,
            );
            if (folder) {
              setActiveFolderId(folder._id);
              setNavTrail((trail) => [...trail, { id: folder._id, name: folder.name }]);
            }
          }}
          onOpenFile={handleOpenPath}
          searchQuery={search}
          searchScope={breadcrumbPath}
          searchResults={searchState.entries}
          searchBusy={search !== deferredSearch}
          searchTruncated={searchState.truncated}
          onEntryContextMenu={(entry, x, y) => setContextMenu({ entry, x, y })}
          onBlankContextMenu={(x, y) => setContextMenu({ entry: { type: "blank", path: activeFolder?.name ?? "" }, x, y })}
          enableLongPress={isMobile}
          longPressDelay={isMobile ? 280 : 450}
          onEntryLongPress={(entry, coords) =>
            setContextMenu({
              entry,
              x: coords?.x ?? window.innerWidth / 2,
              y: coords?.y ?? window.innerHeight / 2,
            })
          }
          onEntryDrop={handleEntryDrop}
        />
      </div>
    </aside>
        </Panel>
        ) : null}
        {!isMobile ? <PanelResizeHandle className="cursor-resize" /> : null}
        {(!isMobile || mobileSection !== "files") ? (
        <Panel defaultSize={isMobile ? 100 : 76} minSize={42} {...(isMobile ? { maxSize: 100 } : {})}>
      <StudioWorkspaceColumn settingsOpen={settingsOpen} isMobile={isMobile} settingsPanelProps={settingsPanelProps}>
      <main className={`${STYLE.main}${activeTab.startsWith("composer:") || activeTab.startsWith("thread:") ? " studio-composer-bg" : ""}`}>
        <header className="cursor-panel-head cursor-workspace-head shrink-0">
          <UnifiedTabStrip
            tabs={tabs}
            activeKey={activeTab}
            onSelect={handleTabSelect}
            onClose={closeTab}
            onSetTabOrder={setOpenTabs}
            onNewChat={openNewComposerTab}
            disableDrag={isMobile}
          />
          <div className="cursor-panel-head-tools cursor-workspace-tools">
            <CreditPill entitlement={entitlement} onClick={openCreditsPane} />
            {isAdminUser ? (
              <AdminQuickLinks onOpenAdminTab={openAdminTab} />
            ) : null}
            <button
              className={`studio-settings-pill studio-settings-trigger${historyOpen ? " is-active" : ""}`}
              onClick={() => setHistoryOpen((open) => !open)}
              aria-label="Generation history"
              title="Generation history"
              aria-pressed={historyOpen}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {!isMobile ? (
              <StudioSettingsLauncher
                isActive={settingsOpen}
                onOpenSettingsTab={openSettingsTab}
              />
            ) : null}
          </div>
        </header>
        <section className="min-h-0 flex-1">
          <ActivePane
            activeTab={activeTab}
            activeEntry={activeEntry}
            assets={assetLookupPool.length ? assetLookupPool : (assetsWithPreviewUrls ?? [])}
            elements={elements ?? []}
            events={chatEvents}
            threads={threads ?? []}
            activeThreadId={activeThreadId}
            onAttach={attachEntry}
            onDuplicate={duplicateEntry}
            onRename={renameEntry}
            onTrash={trashEntry}
            onElementUpdate={updateElementDetails}
            onBuildElementSheet={buildElementSheet}
            stylePresets={presets}
            onDocumentChange={(entry, contentMarkdown) => {
              void updateDocument({ documentId: entry.studioId, contentMarkdown });
            }}
            onSwitchThreadFolder={(threadId) => {
              if (!activeFolder) return;
              void switchThreadFolder({ threadId, folderId: activeFolder._id });
            }}
            adminTab={activeAdminTab}
            billingTab={activeBillingTab}
            currentUser={currentUser}
            billingAccount={billingAccount}
            pricing={pricing}
            bankAccounts={bankAccounts}
            adminPayments={adminPayments}
            adminCustomers={adminCustomers}
            payments={payments}
            onOpenSettings={() => openSettingsTab("general")}
            onOpenCredits={openCreditsPane}
            onOpenAdminTab={openAdminTab}
            onSeedStylePresets={() => seedStylePresets()}
            onGeneratePresetThumbnails={() => generatePresetThumbnails({ force: true })}
            onCreateItem={(values) => createStudioItem(values)}
            onUploadElementFiles={(files) => uploadElementFiles(files)}
            onOpenElementCreate={openElementCreateInComposer}
            onOpenEntry={handleEntryOpen}
            onCloseTab={closeTab}
            activeFolderId={activeFolder?._id}
            onOpenEditTab={openEditTab}
            onOpenAssetTab={(assetId) => openTab(`asset:${assetId}`)}
            onEditorStatus={setStatus}
            onVideoEditProjectSaved={handleVideoEditProjectSaved}
            activeEditTab={activeTab}
          />
        </section>
        {activeTab.startsWith("composer:") || activeTab.startsWith("thread:") ? (
          <StudioComposer
            draft={draft}
            setDraft={setDraft}
            editorRef={editorRef}
            attachments={attachments}
            setAttachments={setAttachments}
            mode={mode}
            setMode={setMode}
            aspectRatio={aspectRatio}
            setAspectRatio={setAspectRatio}
            imageResolution={imageResolution}
            setImageResolution={setImageResolution}
            resolution={resolution}
            setResolution={setResolution}
            durationSeconds={durationSeconds}
            setDurationSeconds={setDurationSeconds}
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            skipPromptEnhancement={skipPromptEnhancement}
            setSkipPromptEnhancement={setSkipPromptEnhancement}
            elementType={elementType}
            setElementType={setElementType}
            presets={presets}
            styleSheets={styleSheets}
            composerStyleMode={composerStyleMode}
            activeStyleSheetId={activeStyleSheetId}
            activeStyleSheet={activeStyleSheet}
            styleSheetAssets={assetsWithPreviewUrls ?? []}
            onSelectDirect={handleSelectDirect}
            onSelectStyleSheet={handleSelectStyleSheet}
            onCreateStyleSheet={() => {
              setMode("element");
              setElementType("style_sheet");
            }}
            scriptTypes={scriptTypes}
            scriptType={scriptType}
            setScriptType={setScriptType}
            referenceIntents={referenceIntents}
            referenceIntent={referenceIntent}
            setReferenceIntent={setReferenceIntent}
            hasComposerReferences={generationReferences.length > 0 || Boolean(videoStartFrameUrl)}
            hasVideoReferenceInput={mode === "video" && videoSupportsReferenceInput && hasVideoReferenceInput}
            hasNonVideoReferenceInput={mode === "video" && videoSupportsReferenceInput && hasNonVideoReferenceInput}
            generationReferences={generationReferences}
            pricing={pricing}
            disabled={flowPending}
            status={status}
            entitlement={entitlement}
            onOpenCredits={openCreditsPane}
            attachments={attachments}
            startFrameAttachmentId={startFrameAttachmentId}
            setStartFrameAttachmentId={setStartFrameAttachmentId}
            onSubmit={handleSubmit}
            onDropEntry={(entry, range) => attachEntry(entry, range)}
            onUploadFiles={(files) => uploadComposerFiles(files)}
            uploadInputRef={composerUploadInputRef}
          />
        ) : null}
      </main>
      </StudioWorkspaceColumn>
        </Panel>
        ) : null}
      </PanelGroup>

      {isMobile ? <StudioMobileBottomNav section={mobileSection} onSelect={openMobileSection} /> : null}

      {historyOpen ? (
        <StudioHistoryPanel
          threads={threads ?? []}
          activeThreadId={activeThreadId}
          onSelectThread={openHistoryThread}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
      {contextMenu ? (
        <ExplorerContextMenu
          entry={contextMenu.entry}
          x={contextMenu.x}
          y={contextMenu.y}
          canCreateFile={!isTrashView}
          canCreateFolder={!isTrashView}
          inTrashView={isTrashView}
          createItems={CREATE_MENU_ITEMS}
          onClose={() => setContextMenu(null)}
          onRequestRename={(entry) => {
            if (isTrashView) return;
            setContextMenu(null);
            void renameEntry(entry);
          }}
          onRequestDelete={(entry) => {
            setContextMenu(null);
            if (isTrashView) void restoreEntry(entry);
            else void trashEntry(entry);
          }}
          onAction={(action, entry) => {
            setContextMenu(null);
            if (action === "open") handleEntryOpen(entry);
            if (action === "attach") attachEntry(entry);
            if (action.startsWith("new-") || action === "upload") runCreateAction(action);
            if (action === "copy-path") void navigator.clipboard?.writeText(displayWorkspacePath(entry.path ?? ""));
            if (action === "download") handleEntryOpen(entry);
          }}
        />
      ) : null}
    </div>
  );
}

function StudioComposer({
  draft,
  setDraft,
  editorRef,
  attachments,
  setAttachments,
  startFrameAttachmentId,
  setStartFrameAttachmentId,
  mode,
  setMode,
  aspectRatio,
  setAspectRatio,
  imageResolution,
  setImageResolution,
  resolution,
  setResolution,
  durationSeconds,
  setDurationSeconds,
  audioEnabled,
  setAudioEnabled,
  skipPromptEnhancement,
  setSkipPromptEnhancement,
  elementType,
  setElementType,
  presets,
  styleSheets,
  composerStyleMode,
  activeStyleSheetId,
  activeStyleSheet,
  styleSheetAssets,
  onSelectDirect,
  onSelectStyleSheet,
  onCreateStyleSheet,
  scriptTypes,
  scriptType,
  setScriptType,
  referenceIntents,
  referenceIntent,
  setReferenceIntent,
  hasComposerReferences,
  hasVideoReferenceInput,
  hasNonVideoReferenceInput,
  generationReferences,
  pricing,
  disabled,
  status,
  entitlement,
  onOpenCredits,
  onSubmit,
  onDropEntry,
  onUploadFiles,
  uploadInputRef,
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [dropMarker, setDropMarker] = useState(null);
  const [selectionHighlights, setSelectionHighlights] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [presetGridOpen, setPresetGridOpen] = useState(false);
  const [composerOptionsOpen, setComposerOptionsOpen] = useState(false);
  const { isMobile } = useMobileLayout();
  const activeStyleSheetAsset = useMemo(() => {
    if (!activeStyleSheet?.sheetAssetId || !styleSheetAssets?.length) return null;
    return (
      styleSheetAssets.find(
        (asset) =>
          asset._id === activeStyleSheet.sheetAssetId
          || asset.studioId === activeStyleSheet.sheetAssetId,
      ) ?? null
    );
  }, [activeStyleSheet, styleSheetAssets]);
  const inputLineRef = useRef(null);
  const isElementMode = mode === "element";
  const elementReferenceCounts = useMemo(() => {
    const media = attachments.filter(
      (attachment) =>
        attachment.studioKind === "asset" &&
        (attachment.kind === "image" ||
          attachment.kind === "video" ||
          attachment.kind === "audio"),
    );
    return {
      image: media.filter((attachment) => attachment.kind === "image").length,
      video: media.filter((attachment) => attachment.kind === "video").length,
      audio: media.filter((attachment) => attachment.kind === "audio").length,
    };
  }, [attachments]);

  useEffect(() => {
    if (mode !== "element") {
      setPresetGridOpen(false);
    }
  }, [mode]);

  useEffect(() => {
    if (!isMobile) {
      setComposerOptionsOpen(false);
    }
  }, [isMobile]);

  const cost = composerCreditCost({
    mode,
    resolution,
    imageResolution,
    durationSeconds,
    hasReferenceInput: hasComposerReferences,
    hasVideoReferenceInput,
    hasNonVideoReferenceInput,
    audioEnabled,
    referenceInputs: generationReferences,
    elementType,
    elementReferenceCounts,
  });

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!draft && !attachments.length) {
      if (el.textContent) el.replaceChildren();
      return;
    }
    if (document.activeElement !== el && !attachments.length && el.innerText !== draft) {
      el.innerText = draft;
    }
  }, [attachments.length, draft, editorRef]);

  useEffect(() => {
    const editor = editorRef.current;
    const inputLine = inputLineRef.current;
    if (!editor || !inputLine) return;

    const updateHighlights = () => {
      setSelectionHighlights(getStudioComposerSelectionHighlights(editor, inputLine));
    };
    const clearHighlights = () => {
      clearStudioComposerSelectedTags(editor);
      setSelectionHighlights([]);
    };

    document.addEventListener("selectionchange", updateHighlights);
    window.addEventListener("resize", updateHighlights);
    editor.addEventListener("keyup", updateHighlights);
    editor.addEventListener("mouseup", updateHighlights);
    editor.addEventListener("input", updateHighlights);
    editor.addEventListener("blur", clearHighlights);

    return () => {
      document.removeEventListener("selectionchange", updateHighlights);
      window.removeEventListener("resize", updateHighlights);
      editor.removeEventListener("keyup", updateHighlights);
      editor.removeEventListener("mouseup", updateHighlights);
      editor.removeEventListener("input", updateHighlights);
      editor.removeEventListener("blur", clearHighlights);
      clearStudioComposerSelectedTags(editor);
    };
  }, [editorRef]);

  useEffect(() => {
    const openPreview = (event) => {
      const attachment = event.detail?.attachment;
      if (!attachment) return;
      setPreviewAttachment(attachment);
    };
    window.addEventListener("studio-composer-token-open", openPreview);
    return () => window.removeEventListener("studio-composer-token-open", openPreview);
  }, []);

  function setEditorText(next) {
    const el = editorRef.current;
    if (el) {
      el.innerText = next;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setDraft(next);
  }

  function handleGenerateClick() {
    const needsTopUp =
      entitlement &&
      (isElementMode ? entitlement.creditBalance < cost : !entitlement.canGenerate);
    if (needsTopUp) {
      onOpenCredits?.();
      return;
    }
    void onSubmit();
  }

  const generateDisabled = disabled || !draft.trim();
  const generateTitle = isElementMode
    ? `Build ${elementSheetLabel(elementType)}`
    : "Generate";

  const controlStrip = (
    <StudioComposerControlStrip
      layout={isMobile && composerOptionsOpen ? "panel" : "toolbar"}
      isElementMode={isElementMode}
      elementType={elementType}
      setElementType={setElementType}
      composerStyleMode={composerStyleMode}
      activeStyleSheet={activeStyleSheet}
      activeStyleSheetAsset={activeStyleSheetAsset}
      presetGridOpen={presetGridOpen}
      setPresetGridOpen={setPresetGridOpen}
      uploadInputRef={uploadInputRef}
      skipPromptEnhancement={skipPromptEnhancement}
      setSkipPromptEnhancement={setSkipPromptEnhancement}
      mode={mode}
      scriptTypes={scriptTypes}
      scriptType={scriptType}
      setScriptType={setScriptType}
      referenceIntents={referenceIntents}
      referenceIntent={referenceIntent}
      setReferenceIntent={setReferenceIntent}
      hasComposerReferences={hasComposerReferences}
      aspectRatio={aspectRatio}
      setAspectRatio={setAspectRatio}
      imageResolution={imageResolution}
      setImageResolution={setImageResolution}
      resolution={resolution}
      setResolution={setResolution}
      durationSeconds={durationSeconds}
      setDurationSeconds={setDurationSeconds}
      audioEnabled={audioEnabled}
      setAudioEnabled={setAudioEnabled}
    />
  );

  async function toggleVoice() {
    try {
      setVoiceError("");
      if (recording) {
        const voice = await import("@/desk/lib/voice-desk");
        setRecording(false);
        setTranscribing(true);
        const data = await voice.stopRecording();
        const text = await voice.transcribeRecording(data);
        if (text?.trim()) {
          const editor = editorRef.current;
          if (editor) {
            insertComposerTextAtCaret(editor, text.trim());
            setDraft(readComposerEditorText(editor));
          } else {
            setEditorText(`${draft}${draft ? " " : ""}${text.trim()}`);
          }
        }
        return;
      }
      if (!ensureStudioVoiceSession()) {
        setVoiceError(STUDIO_VOICE_NOT_CONNECTED);
        return;
      }
      const voice = await import("@/desk/lib/voice-desk");
      await voice.startRecording();
      setRecording(true);
    } catch (error) {
      if (error instanceof Error && error.message !== "Not connected") {
        console.error("Voice input failed", error);
      }
      setRecording(false);
      setVoiceError(studioVoiceErrorMessage(error));
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div
      className="cursor-composer-shell studio-composer"
      data-drop-target="composer"
      onDragEnter={() => setDragOver(true)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
        updateComposerDropMarker(event, editorRef.current, inputLineRef.current, setDropMarker);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDragOver(false);
          setDropMarker(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        setDropMarker(null);
        const tokenAttachment = readComposerTokenDragData(event.dataTransfer);
        const entry = readExplorerDragData(event.dataTransfer);
        if (tokenAttachment) {
          moveComposerDraggedToken(editorRef.current, tokenAttachment.tokenId);
          const range = rangeFromPointInEditor(editorRef.current, event.clientX, event.clientY);
          insertComposerAttachmentToken(editorRef.current, tokenAttachment, range);
          setDraft(readComposerEditorText(editorRef.current));
        } else if (entry) {
          const range = rangeFromPointInEditor(editorRef.current, event.clientX, event.clientY);
          if (range) setSelectionToRange(range);
          onDropEntry(entry, range);
        } else if (event.dataTransfer?.files?.length) {
          void onUploadFiles(event.dataTransfer.files);
        }
      }}
    >
      {previewAttachment ? (
        <AttachmentPreviewSheet
          open
          layout="dock"
          attachment={studioComposerPreviewAttachment(previewAttachment)}
          workspaceId={WORKSPACE_ID}
          onClose={() => setPreviewAttachment(null)}
        />
      ) : null}
      <div className="cursor-composer">
        {isMobile && composerOptionsOpen ? (
          <div className="studio-composer-options-panel" role="region" aria-label="Generation settings">
            <div className="studio-composer-options-head">
              <strong>Settings</strong>
              <button
                type="button"
                className="studio-composer-options-close"
                aria-label="Close settings"
                onClick={() => setComposerOptionsOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {presetGridOpen ? (
              <StudioStyleSheetPickerPanel
                styleSheets={styleSheets}
                assets={styleSheetAssets}
                selectedMode={composerStyleMode}
                activeStyleSheetId={activeStyleSheetId}
                onSelectDirect={() => {
                  onSelectDirect();
                  setPresetGridOpen(false);
                }}
                onSelectStyleSheet={(sheetId) => {
                  onSelectStyleSheet(sheetId);
                  setPresetGridOpen(false);
                }}
                onCreateStyleSheet={() => {
                  onCreateStyleSheet();
                  setPresetGridOpen(false);
                }}
                onClose={() => setPresetGridOpen(false)}
              />
            ) : (
              controlStrip
            )}
          </div>
        ) : null}
        <div className="studio-composer-row">
          <StudioModeSwitcher mode={mode} setMode={setMode} />
          <div className={`cursor-composer-box${presetGridOpen && !isMobile ? " is-preset-open" : ""} ${recording ? "is-recording" : ""} ${transcribing ? "is-transcribing" : ""}${dragOver ? " is-drop-target" : ""}`}>
      {presetGridOpen && !isMobile ? (
        <StudioStyleSheetPickerPanel
          styleSheets={styleSheets}
          assets={styleSheetAssets}
          selectedMode={composerStyleMode}
          activeStyleSheetId={activeStyleSheetId}
          onSelectDirect={() => {
            onSelectDirect();
            setPresetGridOpen(false);
          }}
          onSelectStyleSheet={(sheetId) => {
            onSelectStyleSheet(sheetId);
            setPresetGridOpen(false);
          }}
          onCreateStyleSheet={() => {
            onCreateStyleSheet();
            setPresetGridOpen(false);
          }}
          onClose={() => setPresetGridOpen(false)}
        />
      ) : null}
      <div
        className="studio-composer-inputline"
        ref={inputLineRef}
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          focusComposerEditorEnd(editorRef.current);
        }}
      >
        {dropMarker ? (
          <span className="studio-composer-drop-caret" style={{ left: dropMarker.left, top: dropMarker.top, height: dropMarker.height }} />
        ) : null}
        {selectionHighlights.length ? (
          <div className="studio-composer-selection-layer" aria-hidden="true">
            {selectionHighlights.map((rect, index) => (
              <span
                key={`${index}-${rect.left}-${rect.top}-${rect.width}-${rect.height}`}
                className="studio-composer-selection-pill"
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                }}
              />
            ))}
          </div>
        ) : null}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={
            isElementMode
              ? `Name your ${elementTypeLabel(elementType).toLowerCase()} and drop reference media`
              : "Describe the video, ad, or post you want"
          }
          className="cursor-composer-textarea cursor-composer-mention-editor"
          onInput={(event) => setDraft(readComposerEditorText(event.currentTarget))}
          onKeyDown={(event) => {
            if (
              (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
              moveCaretAcrossComposerToken(editorRef.current, event.key === "ArrowLeft" ? "left" : "right")
            ) {
              event.preventDefault();
              return;
            }
            if (event.key === "Backspace" && removeComposerTokenBeforeCaret(editorRef.current, setAttachments)) {
              event.preventDefault();
              setDraft(readComposerEditorText(editorRef.current));
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSubmit();
            }
          }}
        />
      </div>
      <div className="studio-composer-toolbar">
        {!isMobile ? (
          <div className="studio-composer-toolbar-scroll">
            {controlStrip}
            <div className="studio-composer-actions">
              <button
                type="button"
                className={`studio-composer-circle-btn cursor-composer-mic${recording ? " is-recording" : ""}`}
                title={transcribing ? "Turning voice into text..." : recording ? "Stop recording" : "Use your voice"}
                onClick={() => void toggleVoice()}
                disabled={transcribing}
              >
                {transcribing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mic aria-hidden="true" />}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`studio-composer-circle-btn studio-composer-options-btn${composerOptionsOpen ? " is-open" : ""}`}
              title="Generation settings"
              aria-label="Generation settings"
              aria-expanded={composerOptionsOpen}
              onClick={() => setComposerOptionsOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden="true" />
            </button>
            <div className="studio-composer-actions">
              <button
                type="button"
                className={`studio-composer-circle-btn cursor-composer-mic${recording ? " is-recording" : ""}`}
                title={transcribing ? "Turning voice into text..." : recording ? "Stop recording" : "Use your voice"}
                onClick={() => void toggleVoice()}
                disabled={transcribing}
              >
                {transcribing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mic aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="studio-composer-circle-btn studio-composer-send-btn"
                title={generateTitle}
                aria-label={generateTitle}
                disabled={generateDisabled}
                onClick={handleGenerateClick}
              >
                <ArrowUp aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
      {status ? (
        <div className="studio-composer-notice" role="status" aria-live="polite">
          <p>{status}</p>
        </div>
      ) : null}
      {voiceError ? (
        <div className="studio-composer-notice" role="status" aria-live="polite">
          <p>{voiceError}</p>
        </div>
      ) : null}
          </div>
          <div className="studio-generate-column studio-generate-column--desktop">
            <button
              type="button"
              disabled={generateDisabled}
              onClick={handleGenerateClick}
              className={`studio-generate-btn${isElementMode ? " is-element-mode" : ""}`}
              title={generateTitle}
            >
              <span className="studio-generate-label">
                {isElementMode ? `Build ${elementSheetLabel(elementType)}` : "Generate"}
              </span>
              {!isMobile ? (
                <span className="studio-generate-cost">
                  <Coins className="studio-generate-mark" aria-hidden="true" />
                  {formatCreditBalance(cost)}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      <input
        ref={uploadInputRef}
        className="sr-only"
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.md,text/markdown"
        onChange={(event) => {
          void onUploadFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      </div>
    </div>
  );
}

function StudioComposerControlStrip({
  layout = "toolbar",
  isElementMode,
  elementType,
  setElementType,
  composerStyleMode,
  activeStyleSheet,
  activeStyleSheetAsset,
  presetGridOpen,
  setPresetGridOpen,
  uploadInputRef,
  skipPromptEnhancement,
  setSkipPromptEnhancement,
  mode,
  scriptTypes,
  scriptType,
  setScriptType,
  referenceIntents,
  referenceIntent,
  setReferenceIntent,
  hasComposerReferences,
  aspectRatio,
  setAspectRatio,
  imageResolution,
  setImageResolution,
  resolution,
  setResolution,
  durationSeconds,
  setDurationSeconds,
  audioEnabled,
  setAudioEnabled,
}) {
  const showLabels = layout === "panel";
  const className = layout === "panel" ? "studio-composer-options-body" : "studio-composer-controls";
  const scriptTypeItems = (scriptTypes ?? []).map((item) => ({
    value: item.slug,
    label: item.label,
    meta: item.description,
  }));
  const referenceIntentItems = (referenceIntents ?? []).map((item) => ({
    value: item.slug,
    label: item.label,
    meta: item.description,
  }));
  const showReferenceIntent = hasComposerReferences && !isElementMode;

  if (layout === "panel") {
    return (
      <div className={className}>
        {isElementMode ? (
          <>
            <StudioUploadButton inputRef={uploadInputRef} stacked />
            <div className="studio-composer-options-row">
              <StudioElementTypePicker elementType={elementType} setElementType={setElementType} panel />
            </div>
          </>
        ) : (
          <>
            <StudioUploadButton inputRef={uploadInputRef} stacked />
            <div className="studio-composer-options-row">
              <StudioStyleSheetTriggerButton
                selectedMode={composerStyleMode}
                activeSheet={activeStyleSheet}
                activeSheetAsset={activeStyleSheetAsset}
                open={presetGridOpen}
                onClick={() => setPresetGridOpen((open) => !open)}
                panel
              />
              <StudioPromptEnhanceToggle enabled={!skipPromptEnhancement} onChange={(enabled) => setSkipPromptEnhancement(!enabled)} panel />
            </div>
            {mode === "script" && scriptTypeItems.length ? (
              <StudioInlineSettingSelect
                icon={FileText}
                label="Script type"
                value={scriptType}
                items={scriptTypeItems}
                onChange={setScriptType}
                panel
              />
            ) : null}
            {showReferenceIntent && referenceIntentItems.length ? (
              <StudioInlineSettingSelect
                icon={ImageIcon}
                label="Reference use"
                value={referenceIntent}
                items={referenceIntentItems}
                onChange={setReferenceIntent}
                panel
              />
            ) : null}
            {mode !== "script" ? (
              <StudioComposerInlineSettings
                mode={mode}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                imageResolution={imageResolution}
                setImageResolution={setImageResolution}
                resolution={resolution}
                setResolution={setResolution}
                durationSeconds={durationSeconds}
                setDurationSeconds={setDurationSeconds}
                audioEnabled={audioEnabled}
                setAudioEnabled={setAudioEnabled}
                panelLayout
              />
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {isElementMode ? (
        <>
          <StudioUploadButton inputRef={uploadInputRef} />
          <StudioElementTypePicker elementType={elementType} setElementType={setElementType} showLabels={showLabels} />
        </>
      ) : (
        <>
          <StudioUploadButton inputRef={uploadInputRef} />
          <StudioStyleSheetTriggerButton
            selectedMode={composerStyleMode}
            activeSheet={activeStyleSheet}
            activeSheetAsset={activeStyleSheetAsset}
            open={presetGridOpen}
            onClick={() => setPresetGridOpen((open) => !open)}
          />
          {mode === "script" && scriptTypeItems.length ? (
            <StudioInlineSettingSelect
              icon={FileText}
              label="Script type"
              value={scriptType}
              items={scriptTypeItems}
              onChange={setScriptType}
              hideLabel
              hideChevron
            />
          ) : null}
          {showReferenceIntent && referenceIntentItems.length ? (
            <StudioInlineSettingSelect
              icon={ImageIcon}
              label="Refs"
              value={referenceIntent}
              items={referenceIntentItems}
              onChange={setReferenceIntent}
              hideLabel
              hideChevron
            />
          ) : null}
          <StudioPromptEnhanceToggle enabled={!skipPromptEnhancement} onChange={(enabled) => setSkipPromptEnhancement(!enabled)} />
          {mode !== "script" ? (
            <StudioComposerInlineSettings
              mode={mode}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              imageResolution={imageResolution}
              setImageResolution={setImageResolution}
              resolution={resolution}
              setResolution={setResolution}
              durationSeconds={durationSeconds}
              setDurationSeconds={setDurationSeconds}
              audioEnabled={audioEnabled}
              setAudioEnabled={setAudioEnabled}
              showLabels={showLabels}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function StudioElementTypePicker({ elementType, setElementType, showLabels = false, panel = false }) {
  const active = ELEMENT_TYPE_OPTIONS.find((item) => item.value === elementType) ?? ELEMENT_TYPE_OPTIONS[0];
  const ActiveIcon = active.icon;
  if (panel) {
    return (
      <StudioInlineSettingSelect
        icon={ActiveIcon}
        label="Type"
        value={elementType}
        items={ELEMENT_TYPE_OPTIONS}
        onChange={setElementType}
        panel
      />
    );
  }
  return (
    <StudioInlineSettingSelect
      icon={ActiveIcon}
      label="Element type"
      value={elementType}
      items={ELEMENT_TYPE_OPTIONS}
      onChange={setElementType}
      hideLabel={!showLabels}
    />
  );
}

function studioComposerPreviewAttachment(attachment) {
  if (!attachment) return null;
  const next = {
    ...attachment,
    workspacePath: attachment.path ?? attachment.workspacePath,
    previewUrl: attachment.thumbnailUrl ?? attachment.previewUrl,
  };
  if (attachment.studioKind === "folder") next.kind = "folder";
  return next;
}

function createPreviewKindLabel(attachment) {
  if (attachment.studioKind === "folder") return "Folder reference";
  if (attachment.studioKind === "document") return "Script reference";
  if (attachment.studioKind === "element") return "Brand item reference";
  return attachment.filename ?? (attachment.path ? displayWorkspacePath(attachment.path) : "Reference");
}

function StudioModeSwitcher({ mode, setMode }) {
  const items = [
    { value: "image", label: "Image", icon: ImageIcon },
    { value: "video", label: "Video", icon: Video },
    { value: "script", label: "Script", icon: FileText },
    { value: "element", label: "Element", icon: Sparkles },
  ];

  return (
    <div className="studio-mode-switcher" role="radiogroup" aria-label="Content type">
      {items.map((item) => {
        const Icon = item.icon;
        const active = mode === item.value;
        return (
          <button
            key={item.value}
            type="button"
            className={`studio-mode-row${active ? " is-active" : ""}`}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(item.value)}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StudioPresetTriggerButton({ preset, open, onClick, panel = false }) {
  return (
    <button
      type="button"
      className={`studio-pill-btn studio-preset-trigger${open ? " is-open" : ""}${panel ? " is-panel" : ""}`}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={preset?.name ? `Style: ${preset.name}` : "Choose style"}
      title={preset?.name ?? "Choose style"}
      onClick={onClick}
    >
      <span className="studio-preset-trigger-thumb">
        {preset?.previewImageUrl ? (
          <img src={preset.previewImageUrl} alt="" loading="lazy" />
        ) : (
          <span className="studio-preset-grid-thumb-fallback">
            <Wand2 className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="studio-preset-trigger-copy">{preset?.name ?? "Style"}</span>
      <ChevronDown aria-hidden="true" />
    </button>
  );
}

function StudioPresetGridPanel({ presets, selectedPresetId, onSelect, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="studio-preset-grid-panel" role="dialog" aria-label="Choose style">
      <div className="studio-preset-grid-head">
        <strong>Style</strong>
        <button type="button" className="studio-preset-grid-close" onClick={onClose} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {presets === undefined ? (
        <p className="px-2 text-xs text-cursor-muted">Loading…</p>
      ) : (
        <div className="studio-preset-grid" role="listbox" aria-label="Style presets">
          {presets.map((preset) => {
            const active = preset._id === selectedPresetId;
            return (
              <button
                key={preset._id}
                type="button"
                role="option"
                aria-selected={active}
                className={`studio-preset-grid-card${active ? " is-active" : ""}`}
                onClick={() => onSelect(preset._id)}
              >
                <div className="studio-preset-grid-thumb">
                  {preset.previewImageUrl ? (
                    <img src={preset.previewImageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="studio-preset-grid-thumb-fallback">
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="studio-preset-grid-copy">
                  <strong>{preset.name}</strong>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StudioAddMenu({ open, setOpen, onAction }) {
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useFixedMenuPosition(open, wrapRef, 220);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event) => {
      if (wrapRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="studio-settings-pill studio-settings-trigger"
        title="Add"
        aria-label="Add"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="cursor-tab-context-menu studio-add-menu is-fixed"
              style={menuStyle}
            >
              {CREATE_MENU_ITEMS.map((item, index) => {
                if (item.sep) return <div key={`sep-${index}`} className="cursor-tab-context-sep" role="separator" />;
                const Icon = item.icon;
                return (
                  <button
                    key={item.action}
                    type="button"
                    className="cursor-tab-context-item"
                    onClick={() => {
                      onAction(item.action);
                      setOpen(false);
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StudioUploadButton({ inputRef, stacked = false }) {
  if (stacked) {
    return (
      <button
        type="button"
        className="studio-pill-btn studio-upload-trigger studio-upload-stacked"
        title="Add photos, videos, or notes"
        aria-label="Add photos, videos, or notes"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        <span>Add photos, videos, or notes</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="studio-pill-btn studio-upload-trigger"
      title="Add photos, videos, or notes"
      aria-label="Add photos, videos, or notes"
      onClick={() => inputRef.current?.click()}
    >
      <Upload className="h-4 w-4" />
    </button>
  );
}


function StudioComposerInlineSettings({
  mode,
  aspectRatio,
  setAspectRatio,
  imageResolution,
  setImageResolution,
  resolution,
  setResolution,
  durationSeconds,
  setDurationSeconds,
  audioEnabled,
  setAudioEnabled,
  showLabels = false,
  panelLayout = false,
}) {
  const maxVideoDuration = 15;
  const [localDurationSeconds, setLocalDurationSeconds] = useState(String(durationSeconds));
  useEffect(() => {
    const next = String(Math.max(4, Math.min(maxVideoDuration, Number(durationSeconds) || 4)));
    setLocalDurationSeconds(next);
    if (mode === "video" && String(durationSeconds) !== next) {
      setDurationSeconds(next);
    }
  }, [durationSeconds, mode, setDurationSeconds]);
  const aspectItems = [
    { value: "16:9", label: "16:9", meta: "YouTube / TV" },
    { value: "9:16", label: "9:16", meta: "TikTok / Shorts" },
    { value: "1:1", label: "1:1", meta: "Instagram / LinkedIn" },
    { value: "4:3", label: "4:3", meta: "Deck / Frame" },
    { value: "3:4", label: "3:4", meta: "Portrait frame" },
    { value: "21:9", label: "21:9", meta: "Cinematic wide" },
  ];
  const imageResolutionItems = [
    { value: "1K", label: "1K", meta: "GPT Image 2 draft" },
    { value: "2K", label: "2K", meta: "GPT Image 2 default" },
    { value: "4K", label: "4K", meta: "GPT Image 2 max" },
  ];
  const resolutionItems = [
    { value: "854x480", label: "480p", meta: "Draft" },
    { value: "1280x720", label: "720p", meta: "Standard" },
    { value: "1920x1080", label: "1080p", meta: "Max" },
  ];
  const durationProgress = `${((Number(localDurationSeconds) - 4) / (maxVideoDuration - 4)) * 100}%`;
  const commitDuration = (seconds = localDurationSeconds) => {
    const next = String(Math.max(4, Math.min(maxVideoDuration, Number(seconds) || 4)));
    setLocalDurationSeconds(next);
    setDurationSeconds(next);
  };
  const activeImageResolution = imageResolutionItems.some((item) => item.value === imageResolution)
    ? imageResolution
    : imageResolutionItems[0].value;

  const ratioControl = (
    <StudioInlineSettingSelect
      icon={RectangleHorizontal}
      label="Ratio"
      value={aspectRatio}
      items={aspectItems}
      onChange={setAspectRatio}
      panel
    />
  );
  const resolutionControl =
    mode === "image" ? (
      <StudioInlineSettingSelect
        icon={Maximize2}
        label="Resolution"
        value={activeImageResolution}
        items={imageResolutionItems}
        onChange={setImageResolution}
        panel
      />
    ) : (
      <StudioInlineSettingSelect
        icon={Gauge}
        label="Quality"
        value={resolution}
        items={resolutionItems}
        onChange={setResolution}
        panel
      />
    );

  return (
    <div className={`studio-composer-inline-settings${panelLayout ? " is-panel" : ""}`} aria-label="Composer settings">
      {panelLayout ? (
        <div className="studio-composer-options-row">
          {ratioControl}
          {resolutionControl}
        </div>
      ) : (
        <>
          <StudioInlineSettingSelect
            icon={RectangleHorizontal}
            label="Aspect ratio"
            value={aspectRatio}
            items={aspectItems}
            onChange={setAspectRatio}
            hideLabel={!showLabels}
          />
          {mode === "image" ? (
            <StudioInlineSettingSelect
              icon={Maximize2}
              label="Resolution"
              value={activeImageResolution}
              items={imageResolutionItems}
              onChange={setImageResolution}
              hideLabel={!showLabels}
            />
          ) : (
            <StudioInlineSettingSelect
              icon={Gauge}
              label="Quality"
              value={resolution}
              items={resolutionItems}
              onChange={setResolution}
              hideLabel={!showLabels}
            />
          )}
        </>
      )}
      {mode === "video" ? (
        <StudioInlineSettingPopover
          icon={Clock3}
          label="Duration"
          valueLabel={`${durationSeconds}s`}
          menuLabel="Video duration"
          hideLabel={!showLabels}
        >
          <div className="studio-inline-settings-range-panel">
            <div className="studio-duration-readout">
              <strong>{localDurationSeconds}s</strong>
              <span>4-15s</span>
            </div>
            <input
              className="studio-settings-range"
              type="range"
              min="4"
              max={maxVideoDuration}
              step="1"
              value={localDurationSeconds}
              onChange={(event) => setLocalDurationSeconds(event.currentTarget.value)}
              onPointerUp={(event) => commitDuration(event.currentTarget.value)}
              onKeyUp={(event) => commitDuration(event.currentTarget.value)}
              onBlur={(event) => commitDuration(event.currentTarget.value)}
              style={{ "--range-progress": durationProgress }}
              aria-label="Video duration"
            />
            <div className="studio-duration-ticks" aria-hidden="true">
              <span>4s</span>
              <span>8s</span>
              <span>15s</span>
            </div>
            <div className="studio-settings-chip-grid studio-duration-presets" role="group" aria-label="Video duration presets">
              {["4", "8", "12", "15"].map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={`studio-settings-chip${String(localDurationSeconds) === seconds ? " is-active" : ""}`}
                  aria-pressed={String(localDurationSeconds) === seconds}
                  onClick={() => commitDuration(seconds)}
                >
                  <span>{seconds}s</span>
                </button>
              ))}
            </div>
          </div>
        </StudioInlineSettingPopover>
      ) : null}
      {mode === "video" ? (
        <div className="studio-inline-audio-setting">
          <span className="studio-inline-audio-label">Audio</span>
          <button
            type="button"
            className={`studio-audio-switch${audioEnabled ? " is-on" : ""}`}
            role="switch"
            aria-checked={audioEnabled}
            aria-label="Generate synchronized audio with video"
            onClick={() => setAudioEnabled(!audioEnabled)}
          />
        </div>
      ) : null}
    </div>
  );
}

function StudioPromptEnhanceToggle({ enabled, onChange, panel = false }) {
  return (
    <div className={`studio-inline-audio-setting${panel ? " is-panel" : ""}`}>
      <span className="studio-inline-audio-label">Enhance</span>
      <button
        type="button"
        className={`studio-audio-switch${enabled ? " is-on" : ""}`}
        role="switch"
        aria-checked={enabled}
        aria-label="Rewrite prompt with style preset before generation"
        title={
          enabled
            ? "GPT rewrites your prompt using the style preset (on)"
            : "Send your prompt directly to the model (off)"
        }
        onClick={() => onChange(!enabled)}
      />
    </div>
  );
}

function StudioInlineSettingSelect({ icon, label, value, items, onChange, hideLabel = false, hideValue = false, hideChevron = false, panel = false }) {
  const active = items.find((item) => item.value === value) ?? items[0];
  const hasRatioOptions = items.some((item) => item.value.includes(":"));
  const valueLabel = hasRatioOptions && active ? active.value : active?.label ?? String(value);
  return (
    <StudioInlineSettingPopover
      icon={icon}
      label={label}
      valueLabel={valueLabel}
      menuLabel={label}
      minWidth={hasRatioOptions ? 220 : 0}
      hideLabel={hideLabel}
      hideValue={hideValue}
      hideChevron={hideChevron}
      panel={panel}
    >
      {(close) => (
        <div className={`studio-settings-chip-grid${items.length === 3 ? " is-three" : ""}`} role="group" aria-label={label}>
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                className={`studio-settings-chip${item.value.includes(":") ? " has-ratio-icon" : ""}${ItemIcon ? " has-option-icon" : ""}${item.value === value ? " is-active" : ""}`}
                aria-pressed={item.value === value}
                onClick={() => {
                  onChange(item.value);
                  close();
                }}
              >
                {item.value.includes(":") ? <StudioRatioGlyph ratio={item.value} /> : null}
                {ItemIcon ? <ItemIcon className="studio-settings-option-icon" aria-hidden="true" /> : null}
                <span className="studio-settings-chip-copy">
                  <span>{item.label}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </StudioInlineSettingPopover>
  );
}

function StudioRatioGlyph({ ratio }) {
  const className = `studio-ratio-glyph studio-ratio-glyph-${ratio.replace(":", "x")}`;
  return (
    <span className={className} aria-hidden="true">
      <span />
    </span>
  );
}

function StudioInlineSettingPopover({ icon: Icon, label, valueLabel, menuLabel, minWidth = 0, hideLabel = false, hideValue = false, hideChevron = false, panel = false, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useFixedMenuPosition(open, wrapRef, minWidth);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event) => {
      if (wrapRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`studio-inline-setting${panel ? " is-panel" : ""}`} ref={wrapRef}>
      <button
        type="button"
        className={`studio-inline-setting-trigger${panel ? " is-panel" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((state) => !state)}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {hideLabel ? null : <span>{label}</span>}
        {hideValue ? null : <strong>{valueLabel}</strong>}
        {hideChevron ? null : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="studio-settings-menu studio-inline-settings-menu is-fixed"
              style={menuStyle}
              role="dialog"
              aria-label={menuLabel}
            >
              {typeof children === "function" ? children(() => setOpen(false)) : children}
            </div>,
            document.body,
          )
        : null}
              </div>
  );
}

function StudioSettingsLauncher({ onOpenSettingsTab, isActive }) {
  return (
                      <button
                        type="button"
      className={`studio-settings-pill studio-settings-trigger${isActive ? " is-active" : ""}`}
      title="Settings"
      aria-label="Open settings"
      aria-pressed={isActive}
      onClick={() => onOpenSettingsTab("general")}
    >
      <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
  );
}

function AdminQuickLinks({ onOpenAdminTab }) {
  return (
    <button
      type="button"
      className="studio-settings-pill studio-settings-trigger"
      aria-label="Admin workspace"
      title="Admin workspace"
      onClick={() => onOpenAdminTab("payments")}
    >
      <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function WhatsAppIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2.25a9.66 9.66 0 0 0-8.19 14.78l-1.1 4.01 4.11-1.08a9.66 9.66 0 1 0 5.18-17.71Zm0 1.78a7.88 7.88 0 1 1 0 15.76 7.8 7.8 0 0 1-4-1.1l-.29-.17-2.44.64.65-2.38-.19-.3a7.88 7.88 0 0 1 6.27-12.45Zm-3.35 3.7c-.18 0-.47.07-.71.34-.24.26-.93.91-.93 2.22 0 1.31.96 2.58 1.09 2.76.13.17 1.85 2.96 4.58 4.03 2.27.89 2.73.71 3.22.67.49-.04 1.59-.65 1.81-1.28.22-.63.22-1.17.15-1.28-.07-.11-.24-.18-.51-.31-.27-.13-1.59-.78-1.84-.87-.25-.09-.43-.13-.61.13-.18.27-.7.87-.86 1.05-.16.18-.31.2-.58.07-.27-.13-1.13-.42-2.15-1.33-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.31.4-.47.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.47-.07-.13-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52Z" />
    </svg>
  );
}

function StudioUserMenu({ currentUser, onSignOut }) {
  const [open, setOpen] = useState(false);
  const sidebarLogo = useMercurySidebarLogo();
  const label = currentUser?.phone ?? currentUser?.email ?? currentUser?.name ?? "Creator";
  const contactType = currentUser?.phone ? "whatsapp" : currentUser?.email ? "email" : "creator";
  return (
    <div className="studio-user-menu-wrap">
                      <button
                        type="button"
        className="cursor-project-btn cursor-explorer-title cursor-sidebar-brand studio-user-menu-trigger min-w-0"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="cursor-sidebar-brand-logo" aria-hidden="true">
          <img
            src={sidebarLogo}
            alt=""
            width={16}
            height={16}
            decoding="async"
            loading="eager"
            className="cursor-sidebar-brand-logo-img"
          />
        </span>
        <span className="cursor-sidebar-brand-user">
          {contactType === "whatsapp" ? (
            <WhatsAppIcon className="cursor-sidebar-brand-user-type-icon" />
          ) : contactType === "email" ? (
            <Mail className="cursor-sidebar-brand-user-type-icon" aria-hidden="true" />
          ) : null}
          <span className="cursor-sidebar-brand-user-name truncate">{label}</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <div className="cursor-tab-context-menu studio-user-menu-popover">
                  <button
                    type="button"
            className="cursor-tab-context-item"
            onClick={() => {
              setOpen(false);
              onSignOut?.();
            }}
          >
            Sign out
                  </button>
        </div>
                ) : null}
    </div>
  );
}

function useFixedMenuPosition(open, anchorRef, minWidth = 180) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(minWidth, rect.width);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      setStyle({
        left,
        top: openUp ? undefined : rect.bottom + 8,
        bottom: openUp ? window.innerHeight - rect.top + 8 : undefined,
        maxHeight: Math.max(160, openUp ? spaceAbove : spaceBelow),
        minWidth: width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, minWidth, open]);

  return style;
}

function elementTypeLabel(type) {
  if (type === "character") return "Character";
  if (type === "prop") return "Prop";
  if (type === "location") return "Location";
  if (type === "style_sheet") return "Style Sheet";
  if (type === "doc") return "Element notes";
  return "Element";
}

function elementSheetLabel(type) {
  if (type === "character") return "character sheet";
  if (type === "prop") return "prop sheet";
  if (type === "location") return "location sheet";
  if (type === "style_sheet") return "style board";
  if (type === "doc") return "notes sheet";
  return "element sheet";
}

function elementSheetReferenceInputs(sourceAssets = []) {
  return sourceAssets
    .flatMap((asset) => {
      const kind = asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"
        ? asset.kind
        : null;
      const url = asset.mediaUrl ?? asset.thumbnailUrl;
      return kind && /^https?:\/\//i.test(url ?? "") ? [{ kind, url, mimeType: asset.mimeType }] : [];
    });
}

function resolveElementReferenceAssets(entry, assets) {
  const ids = entry.referenceAssetIds ?? entry.sourceAssetIds ?? [];
  return ids
    .map((assetId) => {
      const asset = (assets ?? []).find((item) => item._id === assetId || item.studioId === assetId);
      return asset ? assetToEntry(asset) : null;
    })
    .filter(Boolean);
}

function resolveElementSheetAsset(entry, assets) {
  if (!entry.sheetAssetId && !entry.sheetAsset) {
    return null;
  }
  if (entry.sheetAsset) {
    return entry.sheetAsset;
  }
  const asset = (assets ?? []).find(
    (item) => item._id === entry.sheetAssetId || item.studioId === entry.sheetAssetId,
  );
  return asset ? assetToEntry(asset) : null;
}

function uploadedElementAssetToEntry(asset) {
  return {
    type: "file",
    name: asset.name,
    path: `/Studio/assets/${asset.assetId}`,
    modified: Date.now(),
    mtimeMs: Date.now(),
    studioKind: "asset",
    studioId: asset.assetId,
    kind: asset.kind,
    kindLabel: asset.kind === "image" ? "Image" : asset.kind === "video" ? "Video" : asset.kind === "audio" ? "Audio" : "Content",
    mediaUrl: asset.previewUrl,
    thumbnailUrl: asset.previewUrl,
  };
}

const ELEMENT_TYPE_OPTIONS = [
  { value: "character", label: "Character", meta: "People, mascots, hands, faces", icon: UserRound },
  { value: "prop", label: "Prop", meta: "Products, packaging, objects", icon: Package },
  { value: "location", label: "Location", meta: "Sets, rooms, streets, backdrops", icon: MapPin },
  { value: "style_sheet", label: "Style Sheet", meta: "Visual rules, palette, render mode", icon: Palette },
  { value: "doc", label: "Notes", meta: "Rules, style notes, references", icon: FileText },
];

function CreateStudioTab({ target, onCancel, onCreate }) {
  const kind = target.kind === "script" ? "script" : "folder";
  const [name, setName] = useState("");
  const title = kind === "folder" ? "New folder" : "New ad copy";
  const helper =
    kind === "folder"
      ? "Create a folder in the current workspace folder."
      : "Start a note or ad copy draft in a new editable tab.";

  return (
    <div className="h-full overflow-auto p-6">
      <form
        className="mx-auto mt-10 w-full max-w-2xl rounded-3xl border border-white/15 bg-transparent p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({ kind, name });
        }}
      >
        <p className="studio-section-kicker">Create</p>
        <h2 className="mt-2 text-2xl font-semibold text-cursor-text-bright">{title}</h2>
        <p className="mt-2 text-sm text-cursor-muted">{helper}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/[0.03] px-3 text-xs font-semibold text-cursor-text">
            {kind === "folder" ? "Folder" : "Ad copy"}
          </span>
        </div>
        <label className="mt-6 block text-xs font-medium text-cursor-muted">
          Name it
          <input
            autoFocus
            className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.03] px-4 text-lg font-medium text-cursor-text outline-none transition focus:border-cursor-accent"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === "folder" ? "Folder name" : "Campaign idea"}
          />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={STYLE.iconButton} onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex h-9 items-center rounded-xl bg-cursor-accent px-4 text-xs font-semibold text-black disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

function createComposerAttachmentToken(attachment) {
  const token = document.createElement("span");
  token.className = "studio-inline-tag";
  token.contentEditable = "false";
  token.draggable = true;
  token.dataset.attachmentId = attachment.id;
  token.dataset.label = attachment.label;
  token.dataset.kind = attachment.kind ?? "file";
  token.dataset.tokenId = attachment.tokenId ?? `tag-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  token.dataset.attachment = JSON.stringify({
    id: attachment.id,
    kind: attachment.kind,
    label: attachment.label,
    path: attachment.path,
    filename: attachment.filename,
    studioKind: attachment.studioKind,
    studioId: attachment.studioId,
    elementType: attachment.elementType,
    buildStatus: attachment.buildStatus,
    description: attachment.description,
    referenceAssetIds: attachment.referenceAssetIds,
    sheetAssetId: attachment.sheetAssetId,
    sheetAsset: attachment.sheetAsset,
    sourceAssetIds: attachment.sourceAssetIds,
    sourceAssets: attachment.sourceAssets,
    thumbnailUrl: attachment.thumbnailUrl,
    mediaUrl: attachment.mediaUrl,
  });
  token.addEventListener("dragstart", (event) => {
    token.classList.add("is-dragging");
    event.dataTransfer?.setData("application/x-studio-composer-token", JSON.stringify({
      ...JSON.parse(token.dataset.attachment ?? "{}"),
      tokenId: token.dataset.tokenId,
    }));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      const dragImage = token.cloneNode(true);
      dragImage.classList.add("is-drag-image");
      dragImage.style.position = "fixed";
      dragImage.style.left = "-1000px";
      dragImage.style.top = "-1000px";
      dragImage.style.pointerEvents = "none";
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, Math.min(token.offsetWidth / 2, 80), token.offsetHeight / 2);
      window.setTimeout(() => dragImage.remove(), 0);
    }
  });
  token.addEventListener("dragend", () => {
    token.classList.remove("is-dragging");
  });
  token.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("studio-composer-token-open", {
      detail: {
        attachment: JSON.parse(token.dataset.attachment ?? "{}"),
      },
    }));
  });

  const kind = document.createElement("span");
  kind.className = "studio-inline-tag-kind";
  const isElement = attachment.studioKind === "element";
  const elementThumb = isElement ? attachment.thumbnailUrl : null;
  const isPreviewAsset =
    !isElement && attachment.thumbnailUrl && (attachment.kind === "image" || attachment.kind === "video");
  if (isPreviewAsset || elementThumb) {
    token.classList.add("studio-inline-tag--preview");
    const media = !isElement && attachment.kind === "video"
      ? document.createElement("video")
      : document.createElement("img");
    media.className = "studio-inline-tag-media";
    media.src = !isElement && attachment.kind === "video"
      ? (attachment.mediaUrl ?? attachment.thumbnailUrl)
      : attachment.thumbnailUrl;
    if (!isElement && attachment.kind === "video") {
      media.muted = true;
      media.playsInline = true;
      media.preload = "metadata";
    } else {
      media.alt = "";
    }
    kind.appendChild(media);
  } else {
    kind.appendChild(createComposerTokenIcon(composerTokenIconKind(attachment)));
  }

  const label = document.createElement("span");
  label.className = "studio-inline-tag-label";
  label.textContent = String(attachment.label ?? attachment.filename ?? "Reference");

  if (isElement && elementThumb) {
    // Element chip: sheet thumb only, type icon overlaid — same style as image/video chips.
    token.classList.add("studio-inline-tag--image-only");
    token.title = attachment.label ?? "Element";
    const overlay = document.createElement("span");
    overlay.className = "studio-inline-tag-overlay";
    overlay.appendChild(createComposerTokenIcon(elementTokenIconKind(attachment.elementType)));
    token.append(kind, overlay);
  } else if ((attachment.kind === "image" || attachment.kind === "video") && attachment.thumbnailUrl) {
    token.classList.add("studio-inline-tag--image-only");
    token.title = attachment.label ?? attachment.filename ?? (attachment.kind === "video" ? "Video" : "Image");
    const overlay = document.createElement("span");
    overlay.className = "studio-inline-tag-overlay";
    overlay.appendChild(createComposerTokenIcon(attachment.kind === "video" ? "video" : "image"));
    token.append(kind, overlay);
  } else {
    token.append(kind, label);
  }
  return token;
}

function elementTokenIconKind(elementType) {
  if (elementType === "character") return "user";
  if (elementType === "prop") return "package";
  if (elementType === "location") return "map-pin";
  return "sparkles";
}

function composerTokenIconKind(attachment) {
  if (attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "audio") return attachment.kind;
  if (attachment.studioKind === "folder") return "folder";
  if (attachment.studioKind === "element") return elementTokenIconKind(attachment.elementType);
  if (attachment.studioKind === "document") return "file";
  return attachment.kind ?? "file";
}

function createComposerTokenIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  const lucidePaths = {
    image: [
      "M15 8h.01",
      "M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z",
      "m3 14 4-4a3 3 0 0 1 4 0l5 5",
      "m14 14 1-1a3 3 0 0 1 4 0l2 2",
    ],
    video: [
      "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
      "M3 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
    ],
    "video-play": [
      "m10 8 6 4-6 4Z",
    ],
    audio: [
      "M9 18V5l12-2v13",
      "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
      "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    ],
    folder: [
      "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
    ],
    sparkles: [
      "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
      "M20 2v4",
      "M22 4h-4",
      "M4 18v2",
      "M5 19H3",
    ],
    file: [
      "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",
      "M14 2v4a2 2 0 0 0 2 2h4",
      "M10 9H8",
      "M16 13H8",
      "M16 17H8",
    ],
    user: [
      "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
      "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    ],
    package: [
      "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
      "M12 22V12",
      "m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7",
      "m7.5 4.27 9 5.15",
    ],
    "map-pin": [
      "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
      "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    ],
  };
  const iconKey =
    kind === "image" || kind === "video" || kind === "video-play" || kind === "audio" || kind === "folder" || kind === "sparkles" || kind === "user" || kind === "package" || kind === "map-pin"
      ? kind
      : kind === "context" || kind === "element"
        ? "sparkles"
        : "file";
  const paths = lucidePaths[iconKey];
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function clearStudioComposerSelectedTags(editor) {
  editor?.querySelectorAll?.(".studio-inline-tag.is-selection-highlighted").forEach((node) => {
    node.classList.remove("is-selection-highlighted");
  });
}

function mergeComposerSelectionRects(rects) {
  if (!rects.length) return [];
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
  const merged = [];

  for (const rect of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...rect });
      continue;
    }

    const topDelta = Math.abs(last.top - rect.top);
    const heightDelta = Math.abs(last.height - rect.height);
    const sameLine = topDelta <= 4 && heightDelta <= 6;
    const gap = rect.left - (last.left + last.width);
    const touches = gap <= 4;

    if (sameLine && touches) {
      const nextLeft = Math.min(last.left, rect.left);
      const nextRight = Math.max(last.left + last.width, rect.left + rect.width);
      const nextTop = Math.min(last.top, rect.top);
      const nextBottom = Math.max(last.top + last.height, rect.top + rect.height);
      last.left = nextLeft;
      last.width = nextRight - nextLeft;
      last.top = nextTop;
      last.height = nextBottom - nextTop;
      continue;
    }

    merged.push({ ...rect });
  }

  return merged;
}

function getStudioComposerSelectionHighlights(editor, inputLine) {
  const selection = window.getSelection();
  clearStudioComposerSelectedTags(editor);
  if (!selection?.rangeCount || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer) && !range.intersectsNode(editor)) return [];

  const inputRect = inputLine.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const pills = [];

  editor.querySelectorAll(".studio-inline-tag").forEach((token) => {
    try {
      if (range.intersectsNode(token)) {
        token.classList.add("is-selection-highlighted");
        const tokenRect = token.getBoundingClientRect();
        pills.push({
          left: tokenRect.left - inputRect.left,
          top: tokenRect.top - inputRect.top,
          width: tokenRect.width,
          height: tokenRect.height,
        });
      }
    } catch {
      // Detached nodes can throw while the browser is mutating selection.
    }
  });

  for (const rect of range.getClientRects()) {
    pills.push({
      left: Math.max(rect.left, editorRect.left) - inputRect.left,
      top: rect.top - inputRect.top,
      width: Math.min(rect.right, editorRect.right) - Math.max(rect.left, editorRect.left),
      height: rect.height,
    });
  }

  return mergeComposerSelectionRects(
    pills
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map((rect) => ({
        left: Math.round(rect.left - 1),
        top: Math.round(rect.top),
        width: Math.round(rect.width + 2),
        height: Math.round(rect.height),
      })),
  );
}

function ensureSelectionInEditor(editor) {
  const selection = window.getSelection();
  if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
    return selection.getRangeAt(0);
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

function focusComposerEditorEnd(editor) {
  if (!editor) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const last = editor.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) {
    range.setStart(last, last.nodeValue?.length ?? 0);
    range.collapse(true);
  }
  const selection = window.getSelection();
  editor.focus();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function appendAttachmentChipToComposerContext(contextsRef, contextKey, attachment) {
  const ctx = contextsRef.current[contextKey] ?? {};
  const shell = document.createElement("div");
  if (ctx.editorHtml) {
    shell.innerHTML = ctx.editorHtml;
  } else if (ctx.draft) {
    shell.appendChild(document.createTextNode(ctx.draft));
  }
  const token = createComposerAttachmentToken(attachment);
  const spacer = document.createTextNode(" ");
  shell.appendChild(spacer);
  shell.appendChild(token);
  contextsRef.current[contextKey] = {
    ...ctx,
    editorHtml: shell.innerHTML,
    draft: readComposerEditorText(shell),
  };
}

function insertComposerAttachmentToken(editor, attachment, insertRange = null) {
  const range = normalizeComposerInsertRange(editor, insertRange ? insertRange.cloneRange() : ensureSelectionInEditor(editor));
  const token = createComposerAttachmentToken(attachment);
  const spacer = document.createTextNode(" ");
  range.deleteContents();
  range.insertNode(spacer);
  range.insertNode(token);
  range.setStart(spacer, spacer.nodeValue.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.focus();
}

function normalizeComposerInsertRange(editor, range) {
  if (!editor || !range) return range;
  let node = range.startContainer;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const token = node?.closest?.(".studio-inline-tag");
  if (!token || !editor.contains(token)) return range;
  const next = document.createRange();
  next.setStartAfter(token);
  next.collapse(true);
  return next;
}

function readComposerTokenDragData(dataTransfer) {
  try {
    const raw = dataTransfer?.getData("application/x-studio-composer-token");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function moveComposerDraggedToken(editor, tokenId) {
  if (!editor || !tokenId) return;
  const token = editor.querySelector(`[data-token-id="${CSS.escape(tokenId)}"]`);
  const next = token?.nextSibling;
  token?.remove();
  if (next?.nodeType === Node.TEXT_NODE && /^\s*$/.test(next.nodeValue ?? "")) {
    next.remove();
  }
}

function rangeFromPointInEditor(editor, clientX, clientY) {
  if (!editor) return null;
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range || !editor.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  return range;
}

function setSelectionToRange(range) {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function updateComposerDropMarker(event, editor, inputLine, setDropMarker) {
  const range = rangeFromPointInEditor(editor, event.clientX, event.clientY);
  if (!range || !inputLine) return;
  const markerRect = range.getClientRects?.()[0] ?? range.startContainer?.parentElement?.getBoundingClientRect?.();
  const hostRect = inputLine.getBoundingClientRect();
  const emptyComposer = !readComposerEditorText(editor).trim() && !editor.querySelector(".studio-inline-tag");
  const textCaretHeight = 22;
  if (!markerRect) {
    setDropMarker({ left: Math.max(12, event.clientX - hostRect.left), top: 10, height: textCaretHeight });
    return;
  }
  setDropMarker({
    left: Math.max(8, markerRect.left - hostRect.left),
    top: Math.max(8, markerRect.top - hostRect.top),
    height: Math.min(24, Math.max(18, emptyComposer ? textCaretHeight : markerRect.height || textCaretHeight)),
  });
}

function insertComposerTextAtCaret(editor, text) {
  const range = ensureSelectionInEditor(editor);
  const beforeRange = document.createRange();
  beforeRange.selectNodeContents(editor);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = document.createRange();
  afterRange.selectNodeContents(editor);
  afterRange.setStart(range.endContainer, range.endOffset);
  const before = beforeRange.toString();
  const after = afterRange.toString();
  const prefix = before.trim() && !/\s$/.test(before) ? " " : "";
  const suffix = after.trim() && !/^\s/.test(after) ? " " : "";
  const textNode = document.createTextNode(`${prefix}${text}${suffix}`);
  range.deleteContents();
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.focus();
}

function isComposerAttachmentToken(node) {
  return node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains("studio-inline-tag");
}

function setComposerCaretBefore(node) {
  const range = document.createRange();
  range.setStartBefore(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function setComposerCaretAfter(node) {
  const range = document.createRange();
  const next = node.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE) {
    range.setStart(next, Math.min(next.nodeValue?.length ?? 0, 1));
  } else {
    range.setStartAfter(node);
  }
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function moveCaretAcrossComposerToken(editor, direction) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor?.contains(selection.anchorNode)) return false;
  const { anchorNode, anchorOffset } = selection;
  const isLeft = direction === "left";

  if (anchorNode === editor) {
    const sibling = editor.childNodes[isLeft ? anchorOffset - 1 : anchorOffset];
    if (!isComposerAttachmentToken(sibling)) return false;
    if (isLeft) setComposerCaretBefore(sibling);
    else setComposerCaretAfter(sibling);
    return true;
  }

  if (anchorNode?.nodeType === Node.TEXT_NODE) {
    const text = anchorNode.nodeValue ?? "";
    if (isLeft) {
      const textBeforeCaret = text.slice(0, anchorOffset);
      if (!/^\s*$/.test(textBeforeCaret)) return false;
      const previous = anchorNode.previousSibling;
      if (!isComposerAttachmentToken(previous)) return false;
      setComposerCaretBefore(previous);
      return true;
    }

    const textAfterCaret = text.slice(anchorOffset);
    if (!/^\s*$/.test(textAfterCaret)) return false;
    const next = anchorNode.nextSibling;
    if (!isComposerAttachmentToken(next)) return false;
    setComposerCaretAfter(next);
    return true;
  }

  return false;
}

function previousTokenFromSelection(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !editor?.contains(selection.anchorNode)) return null;
  const { anchorNode, anchorOffset } = selection;

  if (anchorNode === editor) {
    return editor.childNodes[anchorOffset - 1] ?? null;
  }
  if (anchorNode?.nodeType === Node.TEXT_NODE) {
    const textBeforeCaret = anchorNode.nodeValue?.slice(0, anchorOffset) ?? "";
    if (textBeforeCaret.length && !/^\s+$/.test(textBeforeCaret)) return null;
    let node = anchorNode.previousSibling;
    if (!node && anchorNode.parentNode !== editor) node = anchorNode.parentNode?.previousSibling;
    if (isComposerAttachmentToken(node)) return node;
    if (anchorOffset === 0 && isComposerAttachmentToken(anchorNode.previousSibling)) return anchorNode.previousSibling;
    return null;
  }
  if (anchorNode?.nodeType === Node.ELEMENT_NODE) {
    return anchorNode.childNodes?.[anchorOffset - 1] ?? anchorNode.previousSibling ?? null;
  }
  return null;
}

function removeComposerTokenBeforeCaret(editor, setAttachments) {
  const token = previousTokenFromSelection(editor);
  if (!isComposerAttachmentToken(token)) return false;
  const id = token.dataset.attachmentId;
  const after = token.nextSibling;
  const range = document.createRange();
  range.setStartBefore(token);
  range.collapse(true);
  token.remove();
  if (after?.nodeType === Node.TEXT_NODE && /^\s*$/.test(after.nodeValue ?? "")) {
    after.remove();
  }
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  if (id && !editor.querySelector(`[data-attachment-id="${CSS.escape(id)}"]`)) {
    setAttachments((items) => items.filter((item) => item.id !== id));
  }
  return true;
}

function readComposerEditorText(editor) {
  if (!editor) return "";
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? "");
      return;
    }
    if (isComposerAttachmentToken(node)) {
      parts.push("\uFFFC");
      return;
    }
    node.childNodes?.forEach(walk);
  };
  editor.childNodes.forEach(walk);
  return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\s{2,}/g, " ");
}

let studioTapAudioCtx = null;
let studioTapLast = 0;

function playStudioTapFeedback() {
  if (typeof window === "undefined") return;
  const now = performance.now();
  if (now - studioTapLast < 55) return;
  studioTapLast = now;
  try {
    navigator.vibrate?.(8);
  } catch {
    // best-effort tactile feedback
  }
  try {
    studioTapAudioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = studioTapAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.045);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.018, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.055);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch {
    // sound unavailable or blocked
  }
}

const GENERATION_PROGRESS_STAGES = new Set(["queued", "generating", "saving"]);
const GENERATION_TERMINAL_STAGES = new Set(["failed", "cancelled"]);
const GENERATION_STATUS_STAGES = new Set([
  ...GENERATION_PROGRESS_STAGES,
  ...GENERATION_TERMINAL_STAGES,
]);
const GENERATION_STAGE_RANK = {
  queued: 1,
  generating: 2,
  saving: 3,
  failed: 10,
  cancelled: 10,
};

function createOptimisticGenerationEvents({ prompt, mode }) {
  const clientId = `opt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const now = Date.now();
  return {
    clientId,
    events: [
      {
        _id: `${clientId}-prompt`,
        kind: "prompt",
        prompt,
        optimistic: true,
        clientId,
        createdAt: now,
        order: now,
      },
      {
        _id: `${clientId}-stage`,
        kind: "stage",
        stage: "generating",
        jobMode: mode === "video" ? "video" : "image",
        generationJobId: `${clientId}-job`,
        optimistic: true,
        clientId,
        createdAt: now + 1,
        order: now + 1,
      },
    ],
  };
}

function mergeOptimisticThreadEvents(realEvents = [], optimisticEvents = []) {
  if (!optimisticEvents.length) return realEvents;
  return [...realEvents, ...optimisticEvents];
}

function reconcileOptimisticThreadEvents(optimisticEvents = [], realEvents = []) {
  if (!optimisticEvents.length) return [];
  const byClient = new Map();
  for (const event of optimisticEvents) {
    const key = event.clientId ?? event._id;
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key).push(event);
  }
  const claimedPromptIds = new Set();
  const keep = [];
  for (const [, group] of byClient) {
    const promptEvent = group.find((event) => event.kind === "prompt");
    if (!promptEvent) continue;
    const realPrompt = realEvents.find(
      (event) =>
        event.kind === "prompt" &&
        event.prompt === promptEvent.prompt &&
        !claimedPromptIds.has(event._id) &&
        (event.createdAt ?? 0) >= (promptEvent.createdAt ?? 0) - 15_000,
    );
    if (!realPrompt) {
      keep.push(...group);
      continue;
    }
    claimedPromptIds.add(realPrompt._id);
    const realCatchup = realEvents.some(
      (event) =>
        ((event.kind === "stage" && GENERATION_STATUS_STAGES.has(event.stage)) ||
          event.kind === "result") &&
        (event.createdAt ?? 0) >= (realPrompt.createdAt ?? 0),
    );
    if (realCatchup) continue;
    // Prompt landed but loader stage/result not yet — keep optimistic loader only.
    keep.push(...group.filter((event) => event.kind === "stage"));
  }
  return keep;
}

function compressThreadDisplayEvents(events = []) {
  const completedJobIds = new Set(
    events
      .filter((event) => event.kind === "result" && event.generationJobId)
      .map((event) => event.generationJobId),
  );
  const terminalJobIds = new Set(completedJobIds);
  const latestTerminalByJob = new Map();
  for (const event of events) {
    if (
      event.kind !== "stage" ||
      !event.generationJobId ||
      !GENERATION_TERMINAL_STAGES.has(event.stage)
    ) {
      continue;
    }
    terminalJobIds.add(event.generationJobId);
    const prev = latestTerminalByJob.get(event.generationJobId);
    const prevOrder = prev?.order ?? prev?.createdAt ?? 0;
    const nextOrder = event.order ?? event.createdAt ?? 0;
    if (!prev || nextOrder >= prevOrder) {
      latestTerminalByJob.set(event.generationJobId, event);
    }
  }

  const latestProgressByJob = new Map();
  for (const event of events) {
    if (
      event.kind !== "stage" ||
      !event.generationJobId ||
      !GENERATION_PROGRESS_STAGES.has(event.stage) ||
      terminalJobIds.has(event.generationJobId)
    ) {
      continue;
    }
    const prev = latestProgressByJob.get(event.generationJobId);
    const prevRank = prev ? (GENERATION_STAGE_RANK[prev.stage] ?? 0) : 0;
    const nextRank = GENERATION_STAGE_RANK[event.stage] ?? 0;
    const prevOrder = prev?.order ?? prev?.createdAt ?? 0;
    const nextOrder = event.order ?? event.createdAt ?? 0;
    if (!prev || nextRank > prevRank || (nextRank === prevRank && nextOrder >= prevOrder)) {
      latestProgressByJob.set(event.generationJobId, event);
    }
  }

  return events.filter((event) => {
    if (event.kind === "stage" && event.generationJobId && completedJobIds.has(event.generationJobId)) {
      return false;
    }
    if (
      event.kind === "stage" &&
      event.generationJobId &&
      GENERATION_TERMINAL_STAGES.has(event.stage)
    ) {
      return latestTerminalByJob.get(event.generationJobId)?._id === event._id;
    }
    if (
      event.kind === "stage" &&
      event.generationJobId &&
      GENERATION_PROGRESS_STAGES.has(event.stage)
    ) {
      return latestProgressByJob.get(event.generationJobId)?._id === event._id;
    }
    return true;
  });
}

function StudioEmptyLogoButton() {
  const emptyLogo = useMercuryLogoAssets(96);
  const [pressed, setPressed] = useState(false);
  const pressStartedRef = useRef(0);
  const releaseTimerRef = useRef(null);
  const MIN_PRESS_MS = 120;

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    };
  }, []);

  function beginPress() {
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    pressStartedRef.current = performance.now();
    setPressed(true);
  }

  function scheduleRelease() {
    const elapsed = performance.now() - pressStartedRef.current;
    const remain = Math.max(0, MIN_PRESS_MS - elapsed);
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      setPressed(false);
    }, remain);
  }

  function shuffleTheme() {
    playUiSound("shuffle");
    try {
      navigator.vibrate?.(12);
    } catch {
      /* best-effort */
    }
    randomizeStudioAppearance();
  }

  return (
    <div className="studio-empty-logo-wrap">
    <button
      type="button"
      className={`studio-empty-logo-btn${pressed ? " is-pressed" : ""}`}
      aria-label="Shuffle background style, theme, and appearance"
      title="Shuffle style"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        beginPress();
      }}
      onPointerUp={scheduleRelease}
      onPointerLeave={scheduleRelease}
      onPointerCancel={scheduleRelease}
      onClick={shuffleTheme}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          beginPress();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          scheduleRelease();
        }
      }}
    >
      <span className="studio-empty-logo" aria-hidden="true">
        <span className="studio-empty-logo-blur" aria-hidden="true" />
        <img
          src={emptyLogo.src}
          srcSet={emptyLogo.srcSet}
          sizes={emptyLogo.sizes}
          alt=""
          width={104}
          height={104}
          draggable={false}
        />
      </span>
    </button>
    </div>
  );
}

function StudioThreadChat({
  events,
  assets = [],
  elements = [],
  onOpenEntry,
}) {
  const safeEvents = events ?? [];
  const hasEvents = safeEvents.length > 0;
  const displayEvents = compressThreadDisplayEvents(safeEvents);
  const streamRef = useRef(null);

  useEffect(() => {
    const root = streamRef.current;
    if (!root || !displayEvents.length) return;
    root.scrollTop = root.scrollHeight;
  }, [displayEvents.length]);

  return (
    <div className="studio-chat-render-area">
      {!hasEvents ? (
        <div className="studio-chat-empty-state">
          <StudioEmptyLogoButton />
        </div>
      ) : null}
      {hasEvents ? (
        <div className="studio-chat-stream" ref={streamRef}>
          <div className="studio-chat-composer-align">
            <div className="studio-chat-composer-gutter" aria-hidden="true" />
            <div className="studio-chat-stream-inner">
              {displayEvents.map((event) => (
                <StudioThreadEvent
                  key={event._id}
                  event={event}
                  assets={assets}
                  elements={elements}
                  onOpenEntry={onOpenEntry}
                />
              ))}
            </div>
            <div className="studio-chat-composer-gutter" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudioThreadEvent({ event, assets, elements = [], onOpenEntry }) {
  if (event.kind === "prompt") {
    return (
      <article className="studio-chat-bubble is-user">
        <StudioPromptMessage prompt={event.prompt} assets={assets} elements={elements} />
      </article>
    );
  }
  if (event.kind === "stage") {
    if (GENERATION_STATUS_STAGES.has(event.stage)) {
      return (
        <StudioGenerationStatusCard
          stage={event.stage}
          error={event.error}
          mode={event.jobMode ?? "video"}
        />
      );
    }
    return (
      <article className="studio-chat-bubble is-system">
        <p className="studio-thread-stage">{event.stage}</p>
      </article>
    );
  }
  if (event.kind === "result") {
    const eventAssets = event.resultAssets?.length
      ? event.resultAssets
      : (event.assetIds ?? []).map((assetId) => assets.find((asset) => asset._id === assetId || asset.studioId === assetId));
    const resultAssets = eventAssets
      .filter(Boolean)
      .map(assetToEntry);
    return (
      <article className="studio-chat-bubble is-result">
        {resultAssets.length ? (
          <div className="studio-chat-result-grid">
            {resultAssets.map((entry) => (
              <StudioChatResultCard
                key={entry.studioId ?? entry.path}
                entry={entry}
                onOpen={onOpenEntry}
              />
            ))}
          </div>
        ) : (
          <StudioChatMarkdown text={`${event.assetIds?.length ?? 0} result(s) ready. Open the linked folder to view them.`} />
        )}
      </article>
    );
  }
  return (
    <article className="studio-chat-bubble is-system">
      <p className="studio-chat-kicker">Studio</p>
      <p className="studio-chat-text">Folder changed for this chat.</p>
    </article>
  );
}

function StudioGenerationStatusCard({ stage, error, mode = "video" }) {
  const isFailed = stage === "failed";
  const isCancelled = stage === "cancelled";
  const isProgress = GENERATION_PROGRESS_STAGES.has(stage);
  const friendly = isFailed ? friendlyGenerationError(error, mode) : null;
  const title = isCancelled
    ? "Generation cancelled"
    : isFailed
      ? (friendly?.title ?? "Something went wrong")
      : stage === "saving"
        ? "Saving your render into Studio..."
        : stage === "queued"
          ? "Queued for render..."
          : "Rendering...";
  const detail = isFailed
    ? (friendly
        ? (friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message)
        : (error?.trim() || "Credits were refunded automatically."))
    : isCancelled
      ? "This render was stopped before it finished."
      : null;

  return (
    <div
      className={`studio-video-progress-card studio-gen-status-card${isProgress ? " is-progress" : ""}${isFailed ? " is-failed" : ""}${isCancelled ? " is-cancelled" : ""}`}
    >
      <div
        className={`studio-video-progress-frame studio-gen-status-frame${isProgress ? " has-dot-wave" : ""}`}
        aria-live="polite"
        aria-label={isProgress ? "Generating" : undefined}
      >
        {isProgress ? <StudioDotGridWave /> : null}
        {!isProgress ? (
        <div className="studio-video-progress-content studio-gen-status-content">
          <span className="studio-gen-status-icon" aria-hidden="true">
            {isCancelled ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v5" />
                <path d="M12 16h.01" />
              </svg>
            )}
          </span>
          <strong>{title}</strong>
          {detail ? <p className="studio-gen-status-detail">{detail}</p> : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}

function StudioChatResultCard({ entry, onOpen }) {
  const isVideo = entry.kind === "video";
  const isImage = entry.kind === "image";
  const src = entry.mediaUrl ?? entry.thumbnailUrl;
  const poster = isVideoFileUrl(entry.thumbnailUrl) ? undefined : entry.thumbnailUrl;
  const canOpen = Boolean(onOpen && entry.studioId);
  const canDrag = Boolean(entry?.path);

  function openEntry() {
    if (!canOpen) return;
    onOpen(entry);
  }

  function handleDragStart(event) {
    if (!canDrag) return;
    writeExplorerDragData(event.dataTransfer, entry);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
  }

  function handleDragEnd() {
    clearActiveExplorerDrag();
  }

  if (isImage && src) {
    return (
      <button
        type="button"
        className={`studio-chat-result-card${canOpen ? " is-openable" : ""}`}
        onClick={openEntry}
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        aria-label={entry.name ? `Open ${safeEntryTitle(entry)}` : "Open image"}
        title={canOpen ? "Open in tab · drag into composer to attach" : "Drag into composer to attach"}
      >
        <img src={src} alt="" loading="lazy" draggable={false} />
      </button>
    );
  }

  return (
    <div
      className={`studio-chat-result-card${canOpen && !isVideo ? " is-openable" : ""}`}
      role={canOpen && !isVideo ? "button" : undefined}
      tabIndex={canOpen && !isVideo ? 0 : undefined}
      draggable={canDrag}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={canOpen && !isVideo ? openEntry : undefined}
      onKeyDown={
        canOpen && !isVideo
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openEntry();
              }
            }
          : undefined
      }
      title={canDrag ? "Drag into composer to attach" : undefined}
    >
      {isVideo && src ? (
        <>
          <video src={src} poster={poster} controls playsInline preload="metadata" />
          {canOpen ? (
            <button
              type="button"
              className="studio-chat-result-open"
              onClick={(event) => {
                event.stopPropagation();
                openEntry();
              }}
            >
              Open in tab
            </button>
          ) : null}
        </>
      ) : (
        <div className="studio-composer-preview-fallback">{entry.kindLabel ?? "Result"}</div>
      )}
    </div>
  );
}

function ActivePane({
  activeTab,
  activeEntry,
  assets,
  elements = [],
  events,
  threads,
  activeThreadId,
  onAttach,
  onDuplicate,
  onRename,
  onTrash,
  onElementUpdate,
  onBuildElementSheet,
  stylePresets,
  onDocumentChange,
  onSwitchThreadFolder,
  adminTab,
  billingTab,
  currentUser,
  billingAccount,
  pricing,
  bankAccounts,
  adminPayments,
  adminCustomers,
  payments,
  onOpenSettings,
  onOpenAdminTab,
  onSeedStylePresets,
  onGeneratePresetThumbnails,
  onCreateItem,
  onUploadElementFiles,
  onOpenElementCreate,
  onOpenEntry,
  onCloseTab,
  activeFolderId,
  onOpenEditTab,
  onOpenAssetTab,
  onEditorStatus,
  onVideoEditProjectSaved,
  activeEditTab,
}) {
  useEffect(() => {
    if (!activeTab.startsWith("create:")) return;
    const createTarget = parseCreateTab(activeTab);
    if (createTarget.kind === "element") {
      onCloseTab(activeTab);
      onOpenElementCreate();
    }
  }, [activeTab, onCloseTab, onOpenElementCreate]);

  const videoEditContext = useMemo(() => {
    if (activeTab.startsWith("videoEdit:")) {
      return { projectId: activeTab.slice("videoEdit:".length), tabKey: activeTab };
    }
    if (activeTab.startsWith("edit:project:")) {
      return { projectId: activeTab.slice("edit:project:".length), tabKey: activeTab };
    }
    const assetMatch = activeTab.match(/^edit:asset:([^:]+):(.+)$/);
    if (assetMatch) {
      return {
        sourceAssetId: assetMatch[1],
        folderId: assetMatch[2],
        tabKey: activeTab,
      };
    }
    if (activeEntry?.studioKind === "videoEdit") {
      return { projectId: activeEntry.studioId, tabKey: activeTab };
    }
    return null;
  }, [activeTab, activeEntry]);

  if (activeTab.startsWith("create:")) {
    const createTarget = parseCreateTab(activeTab);
    if (createTarget.kind === "element") return null;
    return (
      <CreateStudioTab
        target={createTarget}
        onCancel={() => onCloseTab(activeTab)}
        onCreate={(values) => {
          void onCreateItem(values).then(() => onCloseTab(activeTab));
        }}
      />
    );
  }
  if (videoEditContext && (videoEditContext.projectId || videoEditContext.sourceAssetId)) {
    const folderId = videoEditContext.folderId ?? activeFolderId;
    if (!folderId) {
      return <div className="p-6 text-sm text-cursor-muted">Choose a folder with clips to edit.</div>;
    }
    return (
      <StudioVideoEditor
        folderId={folderId}
        projectId={videoEditContext.projectId}
        sourceAssetId={videoEditContext.sourceAssetId}
        sourceAssetName={activeEntry?.name}
        tabKey={videoEditContext.tabKey ?? activeEditTab}
        onOpenAsset={onOpenAssetTab}
        onStatus={onEditorStatus}
        onProjectSaved={(projectId, name) =>
          onVideoEditProjectSaved?.(videoEditContext.tabKey ?? activeTab, projectId, name)
        }
      />
    );
  }
  if (activeTab.startsWith("composer:")) {
    return (
      <StudioThreadChat
        events={[]}
        assets={assets}
        elements={elements}
        onOpenEntry={onOpenEntry}
      />
    );
  }
  if (activeEntry?.studioKind === "document") {
    return (
      <div className="h-full min-h-0">
        <MarkdownDocEditor
          value={activeEntry.description ?? ""}
          onChange={(contentMarkdown) => onDocumentChange(activeEntry, contentMarkdown)}
          onSave={() => {}}
        />
      </div>
    );
  }
  if (activeTab.startsWith("thread:")) {
    return (
      <StudioThreadChat
        events={events}
        assets={assets}
        elements={elements}
        onOpenEntry={onOpenEntry}
      />
    );
  }
  if (adminTab) {
    return (
      <AdminWorkspacePane
        tab={adminTab}
        currentUser={currentUser}
        pricing={pricing}
        bankAccounts={bankAccounts}
        payments={adminPayments ?? payments}
        customers={adminCustomers}
        onOpenSettings={onOpenSettings}
        onOpenAdminTab={onOpenAdminTab}
        onSeedStylePresets={onSeedStylePresets}
        onGeneratePresetThumbnails={onGeneratePresetThumbnails}
      />
    );
  }
  if (billingTab) {
    return (
      <BillingWorkspacePane
        tab={billingTab}
        billingAccount={billingAccount}
        pricing={pricing}
        bankAccounts={bankAccounts}
        payments={payments}
      />
    );
  }
  if (!activeEntry) {
    return <div className="p-6 text-sm text-cursor-muted">Choose a video, image, or note from the left.</div>;
  }
  if (activeEntry.studioKind === "asset") {
    return (
      <StudioAssetPreview
        entry={activeEntry}
        folderId={activeFolderId}
        onEditVideo={
          onOpenEditTab && activeFolderId
            ? (item) =>
                onOpenEditTab({
                  assetId: item.studioId,
                  folderId: activeFolderId,
                  assetName: item.name,
                })
            : undefined
        }
      />
    );
  }
  if (activeEntry.studioKind === "videoEdit") {
    return null;
  }
  if (activeEntry.studioKind === "element") {
    return (
      <StudioElementDetailPane
        entry={activeEntry}
        assets={assets}
        onAttach={onAttach}
        onRename={onRename}
        onUpdate={onElementUpdate}
        onBuildSheet={onBuildElementSheet}
        stylePresets={stylePresets}
        onUploadElementFiles={onUploadElementFiles}
        onOpenEntry={onOpenEntry}
        onTrash={onTrash}
      />
    );
  }
  return (
    <div className="h-full overflow-auto p-6">
      <div className="rounded-2xl border border-cursor-border bg-cursor-panel p-5">
        <p className="text-xs uppercase tracking-wide text-cursor-muted">{activeEntry.kindLabel}</p>
        <h2 className="mt-2 text-2xl font-semibold text-cursor-text-bright">{activeEntry.name}</h2>
        {activeEntry.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-cursor-muted">{activeEntry.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={STYLE.iconButton} onClick={() => onAttach(activeEntry)}>
            <Plus className="h-3.5 w-3.5" />
            Use in request
          </button>
          <button className={STYLE.iconButton} onClick={() => onRename(activeEntry)}>Rename</button>
          {activeEntry.studioKind === "asset" || activeEntry.studioKind === "document" ? (
            <button className={STYLE.iconButton} onClick={() => onDuplicate(activeEntry)}>Duplicate</button>
          ) : null}
          <button className={STYLE.iconButton} onClick={() => onTrash(activeEntry)}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function elementAssetOpenable(asset) {
  if (!asset?.studioId) return false;
  const kind = asset.kind ?? inferAttachmentKind(asset);
  return kind === "image" || kind === "video" || kind === "audio";
}

function StudioElementDetailPane({ entry, assets, onAttach, onRename, onUpdate, onBuildSheet, stylePresets, onUploadElementFiles, onOpenEntry, onTrash }) {
  const [name, setName] = useState(entry.name.replace(/^@/, ""));
  const [description, setDescription] = useState(entry.description ?? "");
  const [styleRules, setStyleRules] = useState(entry.styleRules ?? "");
  const [renderMode, setRenderMode] = useState(entry.renderMode ?? "mixed");
  const [sourceAssets, setSourceAssets] = useState(entry.referenceAssets ?? entry.sourceAssets ?? []);
  const [sheetPreview, setSheetPreview] = useState(entry.sheetAsset ?? null);
  const [stylePresetSlug, setStylePresetSlug] = useState("unstyled");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [buildingSheet, setBuildingSheet] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);
  const sheetLabel = elementSheetLabel(entry.elementType);

  useEffect(() => {
    setName(entry.name.replace(/^@/, ""));
    setDescription(entry.description ?? "");
    setStyleRules(entry.styleRules ?? "");
    setRenderMode(entry.renderMode ?? "mixed");
    setSourceAssets(resolveElementReferenceAssets(entry, assets));
    setSheetPreview(entry.sheetAsset ?? resolveElementSheetAsset(entry, assets));
    setMessage("");
  }, [assets, entry]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await onUpdate(entry, {
        name,
        description,
        styleRules: entry.elementType === "style_sheet" ? styleRules : undefined,
        renderMode: entry.elementType === "style_sheet" ? renderMode : undefined,
        referenceAssetIds: sourceAssets.map((asset) => asset.studioId).filter(Boolean),
        referenceAssets: sourceAssets,
        sheetAsset: entry.sheetAsset,
      });
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save element.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(files) {
    if (!files?.length) return;
    setUploading(true);
    setMessage("");
    try {
      const uploaded = await onUploadElementFiles(files);
      const nextAssets = (uploaded ?? []).map(uploadedElementAssetToEntry);
      setSourceAssets((items) => [...items, ...nextAssets]);
      setMessage("Media added. Save to keep it on this element.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function buildSheet() {
    setBuildingSheet(true);
    setMessage("");
    try {
      const nextDescription = await onBuildSheet(draftEntry, sourceAssets, description, stylePresetSlug);
      if (nextDescription?.description) {
        setDescription(nextDescription.description);
      }
      if (nextDescription?.sheetAssetId && assets?.length) {
        const built = assets.find((item) => item._id === nextDescription.sheetAssetId);
        if (built) {
          setSheetPreview(assetToEntry(built));
        }
      }
      setMessage(`${sheetLabel.charAt(0).toUpperCase()}${sheetLabel.slice(1)} ready.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not build sheet.");
    } finally {
      setBuildingSheet(false);
    }
  }

  const draftEntry = {
    ...entry,
    name: `@${name.trim() || entry.name.replace(/^@/, "")}`,
    description,
    styleRules: entry.elementType === "style_sheet" ? styleRules : undefined,
    renderMode: entry.elementType === "style_sheet" ? renderMode : undefined,
    referenceAssetIds: sourceAssets.map((asset) => asset.studioId).filter(Boolean),
    referenceAssets: sourceAssets,
    sheetAsset: sheetPreview ?? resolveElementSheetAsset(entry, assets),
    buildStatus: sheetPreview || entry.sheetAssetId ? "built" : "unbuilt",
  };
  const sheetAsset = draftEntry.sheetAsset;

  function openAssetEntry(asset) {
    if (!elementAssetOpenable(asset) || !onOpenEntry) return;
    onOpenEntry(asset);
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="studio-element-detail">
        <section className="studio-element-detail-hero">
          <div className="studio-element-detail-hero-copy">
            <p className="studio-section-kicker">{entry.kindLabel}</p>
            <h2>{entry.name}</h2>
            <p>
              Upload reference photos, build a {sheetLabel}, then attach to generation — only the built sheet is sent to the model, not raw uploads.
            </p>
            <p className="studio-element-detail-status">
              Status: {sheetAsset ? "Built — ready for generation" : "Unbuilt — add refs and build sheet"}
            </p>
          </div>
          <div className="studio-element-detail-actions">
            <button
              type="button"
              className={STYLE.iconButton}
              disabled={buildingSheet || (!sourceAssets.length && !description.trim() && !styleRules.trim())}
              onClick={() => void buildSheet()}
            >
              {buildingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {buildingSheet ? "Building..." : `Build ${sheetLabel}`}
            </button>
            <button className={STYLE.iconButton} onClick={() => onAttach(draftEntry)}>
              <Plus className="h-3.5 w-3.5" />
              Use in request
            </button>
            <button className={STYLE.iconButton} onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </section>

        <div className="studio-element-detail-grid">
          {sheetAsset ? (
            <section className="studio-element-detail-card">
              <p className="studio-admin-card-kicker">Built sheet</p>
              <p className="studio-element-detail-hint">This image is attached when you use this element in generation.</p>
              {sheetAsset.mediaUrl || sheetAsset.thumbnailUrl ? (
                elementAssetOpenable(sheetAsset) ? (
                  <button
                    type="button"
                    className="studio-element-detail-media-stage is-clickable"
                    title={`Open ${sheetAsset.name} in a new tab`}
                    onClick={() => openAssetEntry(sheetAsset)}
                  >
                    <img
                      src={sheetAsset.thumbnailUrl ?? sheetAsset.mediaUrl}
                      alt={`${entry.name} sheet`}
                      className="studio-element-detail-media-img"
                    />
                    <span className="studio-element-detail-media-hint">Click to open</span>
                  </button>
                ) : (
                  <div className="studio-element-detail-media-stage">
                    <img
                      src={sheetAsset.thumbnailUrl ?? sheetAsset.mediaUrl}
                      alt={`${entry.name} sheet`}
                      className="studio-element-detail-media-img"
                    />
                  </div>
                )
              ) : null}
            </section>
          ) : null}

          <section className="studio-element-detail-card">
            <p className="studio-admin-card-kicker">Details</p>
            <div className="studio-element-detail-fields">
              {entry.elementType !== "style_sheet" ? (
                <label className="studio-element-detail-field">
                  Sheet style
                  <select
                    className="studio-element-detail-input"
                    value={stylePresetSlug}
                    onChange={(event) => setStylePresetSlug(event.target.value)}
                  >
                    {(stylePresets ?? []).map((preset) => (
                      <option key={preset._id} value={preset.slug}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="studio-element-detail-field">
                  Render mode
                  <select
                    className="studio-element-detail-input"
                    value={renderMode}
                    onChange={(event) => setRenderMode(event.target.value)}
                  >
                    <option value="photoreal">Photoreal</option>
                    <option value="illustrated_2d">Illustrated 2D</option>
                    <option value="illustrated_3d">Illustrated 3D</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </label>
              )}
              <label className="studio-element-detail-field">
                Name
                <input
                  className="studio-element-detail-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {entry.elementType === "style_sheet" ? (
                <label className="studio-element-detail-field">
                  Style rules
                  <textarea
                    className="studio-element-detail-textarea"
                    value={styleRules}
                    onChange={(event) => setStyleRules(event.target.value)}
                    placeholder="Palette, line weight, forbidden drift, render notes…"
                  />
                </label>
              ) : null}
              <label className="studio-element-detail-field">
                {sheetLabel.charAt(0).toUpperCase() + sheetLabel.slice(1)}
                <textarea
                  className="studio-element-detail-textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    entry.elementType === "style_sheet"
                      ? "Optional notes — style rules above drive the visual board."
                      : `Build a ${sheetLabel} from media, or write notes manually. Includes a ## Generation prompt section when auto-built.`
                  }
                />
              </label>
            </div>
          </section>

          <section className="studio-element-detail-card">
            <div className="studio-element-detail-card-head">
              <div>
                <p className="studio-admin-card-kicker">Reference media</p>
                <p className="studio-element-detail-hint">Images, clips, or audio that define this element.</p>
              </div>
              <button className={STYLE.iconButton} type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Upload media"}
              </button>
              <input
                ref={inputRef}
                className="hidden"
                type="file"
                multiple
                onChange={(event) => {
                  void upload(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            {sourceAssets.length ? (
              <div className="studio-element-detail-media-grid">
                {sourceAssets.map((asset) => {
                  const previewUrl = asset.thumbnailUrl ?? asset.mediaUrl;
                  const openable = elementAssetOpenable(asset);
                  const tileBody = (
                    <>
                      {previewUrl ? (
                        <span
                          className="studio-element-detail-media-thumb"
                          style={{ backgroundImage: `url(${previewUrl})` }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="studio-element-detail-media-thumb is-empty">
                          <Upload className="h-4 w-4 text-cursor-muted" aria-hidden="true" />
                        </span>
                      )}
                      <span className="studio-element-detail-media-copy">
                        <span className="studio-element-detail-media-name">{asset.name}</span>
                        <span className="studio-element-detail-media-kind">{asset.kindLabel ?? asset.kind}</span>
                      </span>
                    </>
                  );
                  return (
                    <div key={asset.studioId} className="studio-element-detail-media-item">
                      {openable ? (
                        <button
                          type="button"
                          className="studio-element-detail-media-item-open"
                          title={`Open ${asset.name} in a new tab`}
                          onClick={() => openAssetEntry(asset)}
                        >
                          {tileBody}
                        </button>
                      ) : (
                        <div className="studio-element-detail-media-item-open is-static">{tileBody}</div>
                      )}
                      <button
                        type="button"
                        className="studio-element-detail-media-remove"
                        onClick={() => setSourceAssets((items) => items.filter((item) => item.studioId !== asset.studioId))}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="studio-element-detail-empty">
                No media yet. Add references so this element can guide image and video generation.
              </p>
            )}
          </section>
        </div>

        <footer className="studio-element-detail-footer">
          <p>{message}</p>
          <div className="studio-element-detail-actions">
            <button className={STYLE.iconButton} onClick={() => onRename(entry)}>Rename quick</button>
            <button className={STYLE.iconButton} onClick={() => onTrash(entry)}>Remove</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function StudioAssetPreview({ entry, folderId, onEditVideo }) {
  const kind = inferAttachmentKind(entry);
  const [previewExpiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);
  const signedMediaUrl = useQuery(
    api.assets.signedReadUrl,
    entry.studioId && !entry.mediaUrl ? { assetId: entry.studioId, expiresUnix: previewExpiresUnix } : "skip",
  );
  const mediaUrl = entry.mediaUrl ?? signedMediaUrl;
  const thumbUrl = entry.thumbnailUrl ?? mediaUrl;
  const videoPosterUrl = isVideoFileUrl(thumbUrl) ? undefined : thumbUrl;
  const downloadAsset = () => {
    if (!mediaUrl) return;
    const anchor = document.createElement("a");
    anchor.href = mediaUrl;
    anchor.download = entry.name ?? "download";
    anchor.rel = "noopener noreferrer";
    anchor.target = "_blank";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };
  return (
    <div className="studio-asset-preview">
      {kind === "video" && onEditVideo ? (
        <div className="studio-asset-preview-actions">
          <button type="button" className="is-accent" onClick={() => onEditVideo(entry)}>
            <Scissors aria-hidden="true" />
            Edit video
          </button>
        </div>
      ) : null}
      <div className="studio-asset-lightbox">
        {kind === "image" && mediaUrl ? (
          <ImageZoomViewer thumbUrl={thumbUrl} fullUrl={mediaUrl} name={entry.name} onDownload={downloadAsset} />
        ) : kind === "video" && mediaUrl ? (
          <DeskMediaPlayer
            kind="video"
            layout="studio-preview"
            src={mediaUrl}
            name={entry.name}
            poster={videoPosterUrl}
            fileSize={entry.byteSize ?? null}
            onDownload={downloadAsset}
          />
        ) : kind === "audio" && mediaUrl ? (
          <DeskMediaPlayer
            kind="audio"
            layout="studio-preview"
            src={mediaUrl}
            name={entry.name}
            fileSize={entry.byteSize ?? null}
            onDownload={downloadAsset}
          />
        ) : (
          <div className="studio-asset-empty">
            <FileText className="h-10 w-10" />
            <p>Preview is not available for this item yet.</p>
            {mediaUrl ? <a href={mediaUrl} target="_blank" rel="noreferrer">Open original</a> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function BillingWorkspacePane({ tab, billingAccount, pricing, bankAccounts, payments }) {
  const plans = pricingPlans(pricing);
  return (
    <div className="h-full overflow-auto p-6">
      <div className="studio-admin-workspace">
        <section className="studio-admin-hero-card">
          <div>
            <p className="studio-section-kicker">{tab === "top-up" ? "Add credits" : "Billing"}</p>
            <h2>{tab === "top-up" ? "Choose a content pack" : "Plan and balance"}</h2>
            <p>{billingAccount?.creditBalance ?? 0} credits available, {billingAccount?.reservedCredits ?? 0} set aside for content in progress.</p>
          </div>
          <span className="studio-admin-chip">{billingAccount?.subscription?.planName ?? "No active plan"}</span>
        </section>
        {tab === "top-up" ? (
          <>
            <section className="studio-admin-grid-large">
              {plans.map((plan) => (
                <article key={plan.name} className={`studio-plan-card studio-plan-card-large${plan.featured ? " is-featured" : ""}`}>
                  <span className="studio-plan-badge">{plan.badge}</span>
                  <h4>{plan.name}</h4>
                  <p className="studio-plan-price">{plan.price}</p>
                  <p className="studio-plan-sub">{plan.credits} credits</p>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                </article>
              ))}
            </section>
            <section className="studio-admin-card">
              <p className="studio-admin-card-kicker">Bank transfer</p>
              <div className="space-y-2">
                {(bankAccounts ?? []).map((bank) => (
                  <div key={bank._id} className="studio-bank-card">
                    <p className="studio-bank-card-title">{bank.label}</p>
                    <BankLine label="Bank" value={bank.bankName} />
                    <BankLine label="Name" value={bank.accountName} />
                    <BankLine label="Number" value={bank.accountNumber} />
                    <BankLine label="Type" value={bank.accountType} />
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="studio-admin-grid-large">
            <article className="studio-admin-card">
              <p className="studio-admin-card-kicker">Subscription</p>
              <h3>{billingAccount?.subscription?.planName ?? "None"}</h3>
              <p>{billingAccount?.subscription ? `Renews ${formatDate(billingAccount.subscription.currentPeriodEnd)}` : "Add credits or choose a plan."}</p>
            </article>
            <article className="studio-admin-card">
              <p className="studio-admin-card-kicker">Balance</p>
              <h3>{billingAccount?.creditBalance ?? 0}</h3>
              <p>{billingAccount?.reservedCredits ?? 0} set aside for content in progress.</p>
            </article>
            <article className="studio-admin-card">
              <p className="studio-admin-card-kicker">Recent payments</p>
              <h3>{payments?.length ?? 0}</h3>
              <p>{(payments ?? [])[0] ? `Latest payment: ${humanizePaymentStatus((payments ?? [])[0].status)}` : "No payments yet."}</p>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}

function AdminWorkspacePane({
  tab,
  currentUser,
  pricing,
  bankAccounts,
  payments,
  customers,
  onOpenSettings,
  onOpenAdminTab,
  onSeedStylePresets,
  onGeneratePresetThumbnails,
}) {
  const plans = pricingPlans(pricing);
  const safePayments = payments ?? [];
  const pendingPayments = safePayments.filter((payment) => payment.status !== "payment_completed" && payment.status !== "rejected");
  const completedPayments = safePayments.filter((payment) => payment.status === "payment_completed");
  const rejectedPayments = safePayments.filter((payment) => payment.status === "rejected");
  const [paymentFilter, setPaymentFilter] = useState("pending");
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const adminReviewPayment = useMutation(api.billing.adminReviewPayment);
  const seedLaunchPricing = useMutation(api.billing.adminSeedLaunchPricing);
  const seedBankAccount = useMutation(api.billing.adminSeedBankAccountFromEnv);
  const seedSubscriptionPlans = useMutation(api.billing.adminSeedSubscriptionPlans);
  const [reviewStatus, setReviewStatus] = useState("");
  const visiblePayments = safePayments
    .filter((payment) => {
      if (paymentFilter === "all") return true;
      if (paymentFilter === "pending") return payment.status !== "payment_completed" && payment.status !== "rejected";
      return payment.status === paymentFilter;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const selectedPayment = safePayments.find((payment) => payment._id === selectedPaymentId) ?? null;

  async function reviewPayment(paymentId, status, rejectionReason) {
    setReviewStatus("Updating payment...");
    try {
      await adminReviewPayment({
        paymentId,
        status,
        rejectionReason: status === "rejected" ? (rejectionReason || "Rejected by admin.") : undefined,
      });
      setReviewStatus("Payment updated.");
    } catch (error) {
      setReviewStatus(error instanceof Error ? error.message : "Payment update failed.");
    }
  }

  async function handleAdminPaymentStatusChange(paymentId, status) {
    if (status === "rejected") {
      const reason = window.prompt("Why reject this payment?", "Receipt could not be verified.");
      if (reason === null) return;
      await reviewPayment(paymentId, status, reason);
      return;
    }
    await reviewPayment(paymentId, status);
  }

  async function runSetup(label, action) {
    setReviewStatus(`${label}...`);
    try {
      const result = await action();
      setReviewStatus(result === null || result === undefined ? `${label} complete.` : `${label} complete: ${result}`);
    } catch (error) {
      setReviewStatus(error instanceof Error ? error.message : `${label} failed.`);
    }
  }

  const adminTabs = [
    { id: "payments", label: "Payments" },
    { id: "customers", label: "Customers" },
    { id: "setup", label: "Setup" },
    { id: "pricing", label: "Pricing" },
  ];
  const customerRows = customers ?? [];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="studio-admin-workspace">
        <section className="studio-admin-hero-card">
          <div>
            <p className="studio-section-kicker">Admin workspace</p>
            <h2>{adminTitle(tab)}</h2>
            <p>Manage payments, customers, pricing, and launch setup outside Settings.</p>
          </div>
          <div className="studio-admin-hero-actions">
            <span className="studio-admin-chip">{currentUser?.email ?? currentUser?.phone ?? currentUser?.name ?? "admin"}</span>
            <button type="button" className="cursor-settings-action" onClick={onOpenSettings}>
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>
          </div>
        </section>

        <nav className="studio-admin-tabbar" aria-label="Admin sections">
          {adminTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "is-active" : ""}
              onClick={() => onOpenAdminTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "payments" ? (
          <div className="studio-admin-payments-shell">
            <section className="studio-admin-grid-large">
              <AdminMetricCard label="Pending review" value={pendingPayments.length} body="Awaiting receipt review or approval." />
              <AdminMetricCard label="Approved" value={completedPayments.length} body="Completed payments and credit grants." />
              <AdminMetricCard label="Rejected" value={rejectedPayments.length} body="Rejected or unverifiable receipts." />
            </section>
            <section className="studio-admin-card studio-admin-table-card">
              <div className="studio-admin-table-head">
                <div>
                  <p className="studio-admin-card-kicker">Payments</p>
                  <h3>All payment activity</h3>
                </div>
                <div className="studio-admin-filter-tabs" role="group" aria-label="Payment filters">
                  {[
                    ["pending", "Pending"],
                    ["receipt_uploaded", "Uploaded"],
                    ["receipt_received", "Received"],
                    ["payment_completed", "Approved"],
                    ["rejected", "Rejected"],
                    ["all", "All"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={paymentFilter === value ? "is-active" : ""}
                      onClick={() => setPaymentFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="studio-admin-table-wrap">
                <table className="studio-admin-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((payment) => (
                      <tr
                        key={payment._id}
                        className={selectedPaymentId === payment._id ? "is-selected" : ""}
                        onClick={() => setSelectedPaymentId(payment._id)}
                      >
                        <td>
                          <strong>{paymentCustomerName(payment)}</strong>
                          <span>{payment.customer?.email ?? payment.customer?.phone ?? payment.userId}</span>
                        </td>
                        <td>{payment.subscriptionPlanName ?? (payment.subscriptionPlanId ? "Subscription" : "Top up")}</td>
                        <td>{formatMoney(payment.amountCents)}</td>
                        <td><PaymentStatusPill status={payment.status} /></td>
                        <td>{formatDate(payment.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!visiblePayments.length ? <p className="studio-settings-empty">No payments match this filter.</p> : null}
              </div>
              {reviewStatus ? <p className="studio-settings-payment-status">{reviewStatus}</p> : null}
            </section>
            {selectedPayment ? (
              <AdminPaymentSidebar
                payment={selectedPayment}
                onClose={() => setSelectedPaymentId(null)}
                onStatusChange={(paymentId, status) => void handleAdminPaymentStatusChange(paymentId, status)}
              />
            ) : null}
          </div>
        ) : tab === "customers" ? (
          <section className="studio-admin-card studio-admin-table-card">
            <div className="studio-admin-table-head">
              <div>
                <p className="studio-admin-card-kicker">Customers</p>
                <h3>{customerRows.length} accounts</h3>
              </div>
            </div>
            <div className="studio-admin-table-wrap">
              <table className="studio-admin-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Role</th>
                    <th>Credits</th>
                    <th>Subscription</th>
                    <th>Payments</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {customerRows.map((customer) => (
                    <tr key={customer._id}>
                      <td>
                        <strong>{customer.name ?? customer.email ?? customer.phone ?? "Unnamed customer"}</strong>
                        <span>{customer.email ?? customer.phone ?? customer._id}</span>
                      </td>
                      <td>{customer.role}</td>
                      <td>{customer.creditBalance} <span>{customer.reservedCredits} reserved</span></td>
                      <td>
                        <strong>{customer.activeSubscription?.planName ?? "None"}</strong>
                        <span>{customer.activeSubscription ? `${customer.activeSubscription.status} until ${formatDate(customer.activeSubscription.currentPeriodEnd)}` : "No active subscription"}</span>
                      </td>
                      <td>
                        <strong>{customer.paymentCount}</strong>
                        <span>{customer.latestPaymentStatus ? humanizePaymentStatus(customer.latestPaymentStatus) : "No payments"}</span>
                      </td>
                      <td>{customer.lastSeenAt ? formatDate(customer.lastSeenAt) : "Never"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!customerRows.length ? <p className="studio-settings-empty">No customers yet.</p> : null}
            </div>
          </section>
        ) : tab === "setup" ? (
          <section className="studio-admin-card studio-admin-table-card">
            <div className="studio-admin-table-head">
              <div>
                <p className="studio-admin-card-kicker">Launch setup</p>
                <h3>Admin seeds and defaults</h3>
              </div>
            </div>
            <div className="studio-admin-setup-grid">
              <AdminSetupAction
                title="Style presets"
                body="Creates or refreshes the default creative style options used by generation."
                actionLabel="Seed style presets"
                onRun={() => runSetup("Seeding style presets", onSeedStylePresets)}
              />
              <AdminSetupAction
                title="Preset preview images"
                body="Generates preview cards for the style picker using GPT Image 2 and saves them to storage."
                actionLabel="Generate preset previews"
                onRun={() =>
                  runSetup("Generating preset preview images", async () => {
                    const result = await onGeneratePresetThumbnails();
                    if (result?.errors?.length) {
                      throw new Error(result.errors.slice(0, 3).join(" · "));
                    }
                    return result;
                  })
                }
              />
              <AdminSetupAction
                title="Launch pricing"
                body="Creates or refreshes default content credit costs."
                actionLabel="Seed pricing"
                onRun={() => runSetup("Seeding pricing", seedLaunchPricing)}
              />
              <AdminSetupAction
                title="Bank account"
                body="Creates or refreshes the configured bank-transfer receiving account."
                actionLabel="Seed bank account"
                onRun={() => runSetup("Seeding bank account", seedBankAccount)}
              />
              <AdminSetupAction
                title="Subscriptions"
                body="Creates or refreshes monthly subscription plans."
                actionLabel="Seed plans"
                onRun={() => runSetup("Seeding subscription plans", seedSubscriptionPlans)}
              />
            </div>
            {reviewStatus ? <p className="studio-settings-payment-status">{reviewStatus}</p> : null}
          </section>
        ) : (
          <>
            <section className="studio-admin-grid-large">
              {plans.map((plan) => (
                <article key={plan.name} className={`studio-plan-card${plan.featured ? " is-featured" : ""}`}>
                  <span className="studio-plan-badge">{plan.badge}</span>
                  <h4>{plan.name}</h4>
                  <p className="studio-plan-price">{plan.price}</p>
                  <p className="studio-plan-sub">{plan.credits} credits</p>
                  <ul>
                    {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                </article>
              ))}
            </section>
            <section className="studio-admin-card">
                <p className="studio-admin-card-kicker">Content costs</p>
              <div className="studio-credit-costs">
                <div className="studio-credit-cost"><span>Image 1K</span><strong>{pricing?.imageCredits1K ?? 5} credits</strong><em>incl. platform</em></div>
                <div className="studio-credit-cost"><span>Image 2K</span><strong>{pricing?.imageCredits2K ?? 19} credits</strong><em>GPT Image 2 default</em></div>
                <div className="studio-credit-cost"><span>Image 4K</span><strong>{pricing?.imageCredits4K ?? 36} credits</strong><em>GPT Image 2 max</em></div>
                <div className="studio-credit-cost"><span>Video 480p</span><strong>from {pricing?.videoCredits480p ?? 36} credits / 5s</strong><em>+{pricing?.platformOverheadCreditsMedia ?? 2} platform / gen</em></div>
                <div className="studio-credit-cost"><span>Video 720p</span><strong>from {pricing?.videoCredits720p ?? 61} credits / 5s</strong><em>+{pricing?.platformOverheadCreditsMedia ?? 2} platform / gen</em></div>
                <div className="studio-credit-cost"><span>Video 1080p</span><strong>from {pricing?.videoCredits1080p ?? 133} credits / 5s</strong><em>+{pricing?.platformOverheadCreditsMedia ?? 2} platform / gen</em></div>
                <div className="studio-credit-cost"><span>Script</span><strong>from {pricing?.textCredits ?? 3} credits</strong><em>incl. platform</em></div>
              </div>
            </section>
            <section className="studio-admin-card">
              <p className="studio-admin-card-kicker">Payment accounts</p>
              <div className="space-y-2">
                {(bankAccounts ?? []).map((bank) => (
                  <div key={bank._id} className="studio-bank-card">
                    <p className="studio-bank-card-title">{bank.label}</p>
                    <BankLine label="Bank" value={bank.bankName} />
                    <BankLine label="Name" value={bank.accountName} />
                    <BankLine label="Number" value={bank.accountNumber} />
                    <BankLine label="Type" value={bank.accountType} />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function AdminMetricCard({ label, value, body }) {
  return (
    <article className="studio-admin-card">
      <p className="studio-admin-card-kicker">{label}</p>
      <h3>{value}</h3>
      <p>{body}</p>
    </article>
  );
}

function AdminPaymentSidebar({ payment, onClose, onStatusChange }) {
  const receiptIsImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(payment.receiptUrl ?? "");
  return (
    <>
      <button type="button" className="studio-admin-payment-sidebar-backdrop" onClick={onClose} aria-label="Close payment details" />
      <aside className="studio-admin-payment-sidebar">
        <header className="studio-admin-payment-sidebar-head">
          <div>
            <p className="studio-admin-card-kicker">Payment</p>
            <h3>{formatMoney(payment.amountCents)}</h3>
          </div>
          <button type="button" className="cursor-icon-btn cursor-icon-btn-sm" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="studio-admin-detail-list">
          <BankLine label="Customer" value={paymentCustomerName(payment)} />
          <BankLine label="Contact" value={payment.customer?.email ?? payment.customer?.phone ?? "Unknown"} />
          <BankLine label="Type" value={payment.subscriptionPlanName ?? (payment.subscriptionPlanId ? "Subscription" : "Top up")} />
          <BankLine label="Credits" value={payment.creditsGranted ?? "Subscription grant"} />
          <BankLine label="Bank" value={payment.bankAccountLabel ?? "Unassigned"} />
          <BankLine label="Created" value={formatDate(payment.createdAt)} />
          <BankLine label="Reviewed" value={payment.reviewedAt ? formatDate(payment.reviewedAt) : "Not reviewed"} />
        </div>
        <label className="studio-admin-status-field">
          <span>Status</span>
          <select
            value={payment.status}
            onChange={(event) => onStatusChange(payment._id, event.target.value)}
          >
            <option value="receipt_uploaded">Receipt uploaded</option>
            <option value="receipt_received">Receipt received</option>
            <option value="payment_completed">Payment approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        {payment.rejectionReason ? <p className="studio-admin-rejection-note">{payment.rejectionReason}</p> : null}
        <div className="studio-admin-receipt-preview">
          <p className="studio-admin-card-kicker">Receipt</p>
          {payment.receiptUrl ? (
            receiptIsImage ? (
              <img src={payment.receiptUrl} alt="Payment receipt" className="studio-admin-receipt-image" />
            ) : (
              <iframe title="Payment receipt" src={payment.receiptUrl} className="studio-admin-receipt-frame" />
            )
          ) : (
            <p className="studio-settings-empty">No receipt uploaded yet.</p>
          )}
          {payment.receiptUrl ? (
            <a href={payment.receiptUrl} target="_blank" rel="noreferrer">Open receipt in new tab</a>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function AdminSetupAction({ title, body, actionLabel, onRun }) {
  return (
    <article className="studio-admin-setup-card">
      <div>
        <h4>{title}</h4>
        <p>{body}</p>
      </div>
      <button type="button" className="cursor-settings-action" onClick={() => void onRun()}>
        {actionLabel}
      </button>
    </article>
  );
}

function PaymentStatusPill({ status }) {
  return <span className={`studio-payment-status-pill is-${status}`}>{humanizePaymentStatus(status)}</span>;
}

function adminTitle(tab) {
  if (tab === "payments") return "Payments and receipts";
  if (tab === "customers") return "Customers";
  if (tab === "setup") return "Admin setup";
  if (tab === "pricing") return "Pricing setup";
  return "Admin";
}

function paymentCustomerName(payment) {
  return payment.customer?.name ?? payment.customer?.email ?? payment.customer?.phone ?? "Unknown customer";
}

function StudioWorkspaceColumn({ settingsOpen, isMobile, settingsPanelProps, children }) {
  if (settingsOpen && isMobile) {
    return <SettingsSidePanel {...settingsPanelProps} />;
  }
  if (settingsOpen && !isMobile) {
    return (
      <PanelGroup direction="horizontal" autoSaveId="studio-settings-h" className="studio-workspace-panels h-full min-w-0">
        <Panel defaultSize={72} minSize={42}>
          {children}
        </Panel>
        <PanelResizeHandle className="cursor-resize" />
        <Panel defaultSize={28} minSize={18} maxSize={42}>
          <SettingsSidePanel {...settingsPanelProps} />
        </Panel>
      </PanelGroup>
    );
  }
  return children;
}

function SettingsSidePanel({
  settingsSection,
  currentUser,
  payments,
  notifications,
  billingAccount,
  pricing,
  bankAccounts,
  subscriptionPlans,
  onClose,
  onSaveAccount,
  customCursorEnabled,
  onCustomCursorChange,
}) {
  return (
    <aside className="studio-settings-sidebar flex h-full w-full min-w-0 flex-col border-l border-cursor-border-soft">
      <div className={`${STYLE.panelHead} shrink-0`}>
        <span className="text-sm font-medium text-cursor-text-bright">Settings</span>
        <button type="button" className="cursor-icon-btn cursor-icon-btn-sm" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </div>
      <SettingsWorkspacePane
        tab={settingsSection}
        currentUser={currentUser}
        payments={payments}
        notifications={notifications}
        billingAccount={billingAccount}
        pricing={pricing}
        bankAccounts={bankAccounts}
        subscriptionPlans={subscriptionPlans}
        onSaveAccount={onSaveAccount}
        customCursorEnabled={customCursorEnabled}
        onCustomCursorChange={onCustomCursorChange}
      />
    </aside>
  );
}

function SettingsWorkspacePane({
  tab,
  currentUser,
  payments,
  notifications,
  billingAccount,
  pricing,
  bankAccounts,
  subscriptionPlans,
  onSaveAccount,
  customCursorEnabled,
  onCustomCursorChange,
}) {
  const [section, setSection] = useState(tab || "general");
  const [creditMode, setCreditMode] = useState("top-up");
  const [selectedPlanName, setSelectedPlanName] = useState("Studio");
  const [selectedSubscriptionPlanName, setSelectedSubscriptionPlanName] = useState("Studio");
  const [isPaymentStep, setIsPaymentStep] = useState(false);
  const [isThankYouStep, setIsThankYouStep] = useState(false);
  const [thankYouSummary, setThankYouSummary] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [pendingReceiptPaymentId, setPendingReceiptPaymentId] = useState(null);
  const [receiptDraftFile, setReceiptDraftFile] = useState(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const receiptInputRef = useRef(null);
  const paymentInitRef = useRef(false);
  const settingsMenuScrollRef = useRef(null);
  useHorizontalWheelScroll(settingsMenuScrollRef);
  const submitBankPayment = useMutation(api.billing.submitBankPayment);
  const reserveReceiptUpload = useMutation(api.billing.reserveReceiptUpload);
  const completeReceiptUpload = useMutation(api.billing.completeReceiptUpload);
  const plans = pricingPlans(pricing);
  const subscriptionOptions = useMemo(() => subscriptionPlanOptions(subscriptionPlans), [subscriptionPlans]);
  const selectedPlan = plans.find((plan) => plan.name === selectedPlanName) ?? plans[0];
  const selectedSubscriptionPlan = subscriptionOptions.find((plan) => plan.name === selectedSubscriptionPlanName) ?? subscriptionOptions[0];
  useEffect(() => {
    setSection(tab || "general");
  }, [tab]);
  useEffect(() => {
    if (subscriptionOptions.length && !subscriptionOptions.some((plan) => plan.name === selectedSubscriptionPlanName)) {
      setSelectedSubscriptionPlanName(subscriptionOptions[0].name);
    }
  }, [selectedSubscriptionPlanName, subscriptionOptions]);
  function resetPaymentDraft() {
    setIsPaymentStep(false);
    setIsThankYouStep(false);
    setThankYouSummary(null);
    setPendingReceiptPaymentId(null);
    setReceiptDraftFile(null);
    setReceiptUploading(false);
    setSelectedBankId(null);
    setPaymentStatus("");
    paymentInitRef.current = false;
  }
  function selectTopUpPlan(planName, proceedToPayment = false) {
    setSelectedPlanName(planName);
    setPendingReceiptPaymentId(null);
    setPaymentStatus("");
    setIsPaymentStep(proceedToPayment);
  }
  function selectSubscriptionPlan(planName, proceedToPayment = false) {
    setSelectedSubscriptionPlanName(planName);
    setPendingReceiptPaymentId(null);
    setPaymentStatus("");
    setIsPaymentStep(proceedToPayment);
  }
  async function handleBankPayment(bankAccountId) {
    if (creditMode === "top-up" && !selectedPlan) return;
    if (creditMode === "subscription" && !selectedSubscriptionPlan) return;
    const isSubscription = creditMode === "subscription";
    setSelectedBankId(bankAccountId);
    setPaymentStatus("Preparing payment...");
    try {
      const paymentId = await submitBankPayment({
        bankAccountId,
        amountCents: isSubscription ? selectedSubscriptionPlan.amountCents : selectedPlan.amountCents,
        creditsRequested: isSubscription ? undefined : selectedPlan.credits,
        subscriptionPlanId: isSubscription ? selectedSubscriptionPlan._id : undefined,
        reference: isSubscription ? `Subscription: ${selectedSubscriptionPlan.name}` : `Top up: ${selectedPlan.name}`,
      });
      setPendingReceiptPaymentId(paymentId);
      setPaymentStatus("");
    } catch (error) {
      setPaymentStatus(error instanceof Error ? error.message : "Payment request failed.");
    }
  }
  async function handleReceiptUpload(file) {
    if (!pendingReceiptPaymentId || !file) return;
    setReceiptUploading(true);
    setPaymentStatus("Making payment...");
    try {
      const upload = await reserveReceiptUpload({
        paymentId: pendingReceiptPaymentId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      const res = await fetch(upload.putUrl, {
        method: "PUT",
        headers: {
          AccessKey: upload.storageAccessKey,
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!res.ok) throw new Error("Receipt upload failed");
      await completeReceiptUpload({ paymentId: pendingReceiptPaymentId, byteSize: file.size });
      const isSubscription = creditMode === "subscription";
      setThankYouSummary({
        title: isSubscription ? selectedSubscriptionPlan.name : selectedPlan.name,
        amountCents: isSubscription ? selectedSubscriptionPlan.amountCents : selectedPlan.amountCents,
        credits: isSubscription ? selectedSubscriptionPlan.credits : selectedPlan.credits,
        kind: isSubscription ? "subscription" : "top-up",
      });
      setIsThankYouStep(true);
      setIsPaymentStep(false);
      setReceiptDraftFile(null);
      setPaymentStatus("");
    } catch (error) {
      setPaymentStatus(error instanceof Error ? error.message : "Receipt upload failed.");
    } finally {
      setReceiptUploading(false);
    }
  }
  useEffect(() => {
    if (!isPaymentStep || isThankYouStep || pendingReceiptPaymentId) return;
    const banks = bankAccounts ?? [];
    if (!banks.length) return;
    if (paymentInitRef.current) return;
    paymentInitRef.current = true;
    void handleBankPayment(banks[0]._id).catch(() => {
      paymentInitRef.current = false;
    });
  }, [isPaymentStep, isThankYouStep, pendingReceiptPaymentId, bankAccounts]);
  const items = [
    { id: "top-up", label: "Add credits" },
    { id: "billing", label: "Billing" },
    { id: "general", label: "Appearance" },
    { id: "account", label: "Account details" },
    { id: "activity", label: "Activity" },
    { id: "api-keys", label: "API keys" },
  ];
  return (
    <div className="studio-settings-workspace">
      <header className="studio-settings-workspace-head">
        <nav ref={settingsMenuScrollRef} className="studio-settings-horizontal-menu" aria-label="Settings sections">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "is-active" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="studio-settings-workspace-body">
        {section === "account" ? (
          <AccountDetailsCard currentUser={currentUser} onSave={onSaveAccount} />
          ) : null}

        {section === "api-keys" ? <StudioApiKeysSettings /> : null}

        {section === "billing" ? (
          <div className="studio-settings-stack">
            <section className="cursor-settings-section studio-settings-billing-summary">
              <div className="studio-settings-balance-block">
                <span>Available credits</span>
                <strong>{(billingAccount?.creditBalance ?? 0).toLocaleString()}</strong>
                <small>{(billingAccount?.reservedCredits ?? 0).toLocaleString()} reserved</small>
              </div>
              <dl className="studio-settings-stat-list">
                <div className="studio-settings-stat-row">
                  <dt>Plan</dt>
                  <dd>{billingAccount?.subscription?.planName ?? "None"}</dd>
                </div>
                <div className="studio-settings-stat-row">
                  <dt>Renewal</dt>
                  <dd>{billingAccount?.subscription ? formatDate(billingAccount.subscription.currentPeriodEnd) : "None"}</dd>
                </div>
                <div className="studio-settings-stat-row">
                  <dt>Latest payment</dt>
                  <dd>
                    {(payments ?? [])[0]
                      ? `${humanizePaymentStatus((payments ?? [])[0].status)} · ${formatMoney((payments ?? [])[0].amountCents)}`
                      : "None"}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="cursor-settings-section studio-settings-invoices-card">
              <div className="studio-settings-card-title">Invoices</div>
              <div className="studio-settings-invoice-list">
                {(payments ?? []).slice(0, 6).map((payment) => {
                  const paymentUrl = payment.receiptUrl ?? (payment.externalPaymentId?.startsWith("http") ? payment.externalPaymentId : null);
                  return (
                    <div key={payment._id} className="studio-settings-invoice-row">
                      <div className="studio-settings-invoice-copy">
                        <strong>{payment.subscriptionPlanId ? "Subscription invoice" : "Credit invoice"}</strong>
                        <span>{formatDate(payment.createdAt)} · {humanizePaymentStatus(payment.status)}</span>
                      </div>
                      <div className="studio-settings-invoice-meta">
                        <span className="studio-settings-invoice-amount">{formatMoney(payment.amountCents)}</span>
                        {paymentUrl ? (
                          <a href={paymentUrl} target="_blank" rel="noreferrer">Open</a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!payments?.length ? <p className="studio-settings-empty">No invoices yet.</p> : null}
              </div>
            </section>
          </div>
        ) : null}

        {section === "top-up" ? (
          <div className="studio-settings-stack">
            {isThankYouStep && thankYouSummary ? (
              <section className="cursor-settings-section studio-settings-thankyou">
                <p className="studio-settings-thankyou-kicker">Thank you</p>
                <h3>We received your payment details</h3>
                <p className="studio-settings-thankyou-lead">
                  We will review your receipt and activate your{" "}
                  {thankYouSummary.kind === "subscription" ? "subscription" : "credits"} once payment is confirmed.
                </p>
                <div className="studio-settings-thankyou-summary">
                  <dl className="studio-settings-stat-list">
                    <div className="studio-settings-stat-row">
                      <dt>Order</dt>
                      <dd>{thankYouSummary.title}</dd>
                    </div>
                    <div className="studio-settings-stat-row">
                      <dt>Amount paid</dt>
                      <dd>{formatMoney(thankYouSummary.amountCents)}</dd>
                    </div>
                    <div className="studio-settings-stat-row">
                      <dt>{thankYouSummary.kind === "subscription" ? "Monthly credits" : "Credits"}</dt>
                      <dd>
                        {thankYouSummary.credits.toLocaleString()}
                        {thankYouSummary.kind === "subscription" ? "/mo" : ""}
                      </dd>
                    </div>
                  </dl>
                </div>
                <button type="button" className="cursor-settings-action" onClick={resetPaymentDraft}>
                  Back to plans
                </button>
              </section>
            ) : null}
            {!isPaymentStep && !isThankYouStep ? (
              <>
            <section className="cursor-settings-section studio-settings-credit-switch">
              <button
                type="button"
                className={creditMode === "top-up" ? "is-active" : ""}
                onClick={() => {
                  setCreditMode("top-up");
                  resetPaymentDraft();
                }}
              >
                Top up
              </button>
              <button
                type="button"
                className={creditMode === "subscription" ? "is-active" : ""}
                onClick={() => {
                  setCreditMode("subscription");
                  resetPaymentDraft();
                }}
              >
                Subscribe
              </button>
            </section>
            <section className="cursor-settings-section studio-settings-plans">
              {creditMode === "top-up"
                ? plans.map((plan) => (
                    <div
                      key={plan.name}
                      className={`studio-settings-plan-row${selectedPlan?.name === plan.name ? " is-featured" : ""}${plan.discountPercent ? " is-discounted" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectTopUpPlan(plan.name, true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectTopUpPlan(plan.name, true);
                        }
                      }}
                      aria-pressed={selectedPlan?.name === plan.name}
                    >
                      <div className="studio-settings-plan-copy">
                        {plan.discountPercent ? <span className="studio-settings-discount">{plan.discountPercent}% off</span> : null}
                        <h4>{plan.name}</h4>
                        <p>One-time bank transfer</p>
                      </div>
                      <div className="studio-settings-plan-price">
                        <div className="studio-settings-price-line">
                          {plan.originalPrice ? <s>{plan.originalPrice}</s> : null}
                          <strong>{plan.price}</strong>
                        </div>
                        <span>{plan.credits} credits</span>
                        <button
                          type="button"
                          className="studio-settings-plan-choice"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectTopUpPlan(plan.name, true);
                          }}
                        >
                          Choose
                        </button>
                </div>
                    </div>
                  ))
                : subscriptionOptions.map((plan) => (
                    <div
                      key={plan.name}
                      className={`studio-settings-plan-row${selectedSubscriptionPlan?.name === plan.name ? " is-featured" : ""}${plan.discountPercent ? " is-discounted" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectSubscriptionPlan(plan.name, true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectSubscriptionPlan(plan.name, true);
                        }
                      }}
                      aria-pressed={selectedSubscriptionPlan?.name === plan.name}
                    >
                      <div className="studio-settings-plan-copy">
                        {plan.discountPercent ? <span className="studio-settings-discount">{plan.discountPercent}% off</span> : null}
                        <h4>{plan.name}</h4>
                        <p>Monthly studio plan</p>
                      </div>
                      <div className="studio-settings-plan-price">
                        <div className="studio-settings-price-line">
                          {plan.originalPrice ? <s>{plan.originalPrice}/mo</s> : null}
                          <strong>{plan.price}/mo</strong>
                        </div>
                        <span>{plan.credits} credits/mo</span>
                        <button
                          type="button"
                          className="studio-settings-plan-choice"
                          onClick={(event) => {
                            event.stopPropagation();
                            selectSubscriptionPlan(plan.name, true);
                          }}
                        >
                          Choose
                        </button>
                      </div>
                    </div>
                  ))}
              {creditMode === "subscription" && !subscriptionOptions.length ? (
                <p className="studio-settings-empty">No subscription plans are enabled yet.</p>
              ) : null}
              </section>
              </>
            ) : null}
            {isPaymentStep && !isThankYouStep ? (
              <section className="cursor-settings-section studio-settings-simple-card studio-settings-payment-card">
                <div className="studio-settings-payment-hero">
                  <div className="studio-settings-payment-hero-copy">
                    <span>Amount due</span>
                    <strong>
                      {creditMode === "subscription"
                        ? selectedSubscriptionPlan?.price
                        : selectedPlan?.price}
                    </strong>
                    <small>
                      {creditMode === "subscription"
                        ? `${selectedSubscriptionPlan?.name} · ${Number(selectedSubscriptionPlan?.credits ?? 0).toLocaleString()} credits/mo`
                        : `${selectedPlan?.name} · ${Number(selectedPlan?.credits ?? 0).toLocaleString()} credits`}
                    </small>
                  </div>
                  <button type="button" className="studio-settings-payment-back" onClick={resetPaymentDraft}>
                    Back
                  </button>
                </div>
                <div className="studio-settings-payment-body">
                  <div className="studio-settings-payment-step">
                    <div className="studio-settings-payment-step-label">
                      <span className="studio-settings-payment-step-num">1</span>
                      Transfer to this account
                    </div>
                    <p className="studio-settings-payment-amount-note">
                      Send exactly the amount above, then upload your receipt.
                    </p>
                    <div className="studio-settings-bank-list">
                      {(bankAccounts ?? []).map((bank) => (
                        <div
                          key={bank._id}
                          className={`studio-bank-card${selectedBankId === bank._id ? " is-selected" : ""}`}
                        >
                          <p className="studio-bank-card-title">{bank.label}</p>
                          <BankLine label="Bank" value={bank.bankName} />
                          <BankLine label="Name" value={bank.accountName} />
                          <BankLine label="Number" value={bank.accountNumber} />
                          <BankLine label="Type" value={bank.accountType} />
                        </div>
                      ))}
                      {!bankAccounts?.length ? (
                        <p className="studio-settings-empty">Bank transfer is not configured yet. Contact support.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="studio-settings-payment-step">
                    <div className="studio-settings-payment-step-label">
                      <span className="studio-settings-payment-step-num">2</span>
                      Upload your receipt
                    </div>
                    <input
                      ref={receiptInputRef}
                      className="hidden"
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        event.currentTarget.value = "";
                        setReceiptDraftFile(file);
                      }}
                    />
                    <button
                      type="button"
                      className={`studio-settings-receipt-dropzone${receiptDraftFile ? " has-file" : ""}`}
                      onClick={() => receiptInputRef.current?.click()}
                    >
                      <Upload className="h-5 w-5" aria-hidden="true" />
                      <strong>{receiptDraftFile ? receiptDraftFile.name : "Add payment receipt"}</strong>
                      <span>{receiptDraftFile ? "Tap to replace" : "PNG, JPG, or PDF"}</span>
                    </button>
                  </div>
                  {paymentStatus ? (
                    <p
                      className={`studio-settings-payment-status${
                        /fail|error/i.test(paymentStatus) ? " is-error" : ""
                      }`}
                    >
                      {paymentStatus}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="studio-settings-receipt-submit cursor-settings-action"
                    disabled={!receiptDraftFile || !pendingReceiptPaymentId || receiptUploading}
                    onClick={() => {
                      if (receiptDraftFile) void handleReceiptUpload(receiptDraftFile);
                    }}
                  >
                    {receiptUploading ? "Making payment..." : "Make payment"}
                  </button>
                </div>
              </section>
            ) : null}
          </div>
          ) : null}

        {section === "activity" ? (
          <StudioActivityFeed notifications={notifications} payments={payments} />
        ) : null}

        {section === "general" ? (
          <div className="studio-settings-stack">
            <div className="studio-settings-appearance-card">
              <ThemeSettings />
            </div>
            <div className="studio-settings-appearance-card">
              <CustomCursorSettings enabled={customCursorEnabled} onChange={onCustomCursorChange} />
            </div>
          </div>
        ) : null}
        </div>
      </div>
  );
}

function CustomCursorSettings({ enabled, onChange }) {
  return (
    <section className="cursor-settings-section">
      <div className="studio-settings-cursor-row">
        <div className="studio-settings-cursor-copy">
          <strong>Modern cursor</strong>
          <p>Use the custom Studio pointer instead of the system cursor.</p>
        </div>
        <button
          type="button"
          className={`studio-audio-switch ${enabled ? "is-on" : ""}`}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle modern cursor"
          onClick={() => onChange?.(!enabled)}
        />
      </div>
    </section>
  );
}

function AccountDetailsCard({ currentUser, onSave }) {
  const setPassword = useAction(api.passwordAuth.setPassword);
  const [name, setName] = useState(currentUser?.name ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [phone, setPhone] = useState(currentUser?.phone ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saved, setSaved] = useState("");
  const [passwordSaved, setPasswordSaved] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  useEffect(() => {
    setName(currentUser?.name ?? "");
    setEmail(currentUser?.email ?? "");
    setPhone(currentUser?.phone ?? "");
  }, [currentUser?.name, currentUser?.email, currentUser?.phone]);
  const canSetPassword = Boolean((email || phone).trim());
  return (
    <div className="studio-settings-stack">
      <section className="cursor-settings-section studio-account-card">
        <h3 className="studio-account-card-title">Profile</h3>
        <p className="studio-account-card-lead">How you show up across Studio and billing.</p>
        <div className="studio-account-fields">
          <label>
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your creator name" />
          </label>
          <label>
            <span>Email</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" />
          </label>
          <label>
            <span>Phone / WhatsApp</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 868 337 7338" type="tel" />
          </label>
        </div>
        <div className="studio-account-actions">
          <button
            type="button"
            className="cursor-settings-action"
            onClick={() => {
              onSave?.({ name, email, phone });
              setSaved("Saved");
            }}
          >
            Save account
          </button>
          {saved ? <span className="studio-account-saved">{saved}</span> : null}
        </div>
      </section>
      <section className="cursor-settings-section studio-account-card">
        <h3 className="studio-account-card-title">Password</h3>
        <p className="studio-account-card-lead">
          {currentUser?.hasPassword
            ? "Change your sign-in password."
            : "Add a password so you can sign in without a code next time."}
        </p>
        <div className="studio-account-fields">
          {currentUser?.hasPassword ? (
            <label>
              <span>Current password</span>
              <input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                type="password"
                autoComplete="current-password"
              />
            </label>
          ) : null}
          <label>
            <span>{currentUser?.hasPassword ? "New password" : "Password"}</span>
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              autoComplete="new-password"
              disabled={!canSetPassword}
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
              type="password"
              autoComplete="new-password"
              disabled={!canSetPassword}
            />
          </label>
          {!canSetPassword ? (
            <p className="studio-account-card-lead">Save an email or phone first, then add a password.</p>
          ) : null}
        </div>
        <div className="studio-account-actions">
          <button
            type="button"
            className="cursor-settings-action"
            disabled={!canSetPassword || passwordBusy}
            onClick={() => {
              setPasswordError("");
              setPasswordSaved("");
              if (newPassword.length < 8) {
                setPasswordError("Password must be at least 8 characters");
                return;
              }
              if (newPassword !== confirmPassword) {
                setPasswordError("Passwords do not match");
                return;
              }
              setPasswordBusy(true);
              void setPassword({
                newPassword,
                currentPassword: currentUser?.hasPassword ? currentPassword : undefined,
              })
                .then(() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordSaved(currentUser?.hasPassword ? "Password updated" : "Password added");
                })
                .catch((err) => {
                  setPasswordError(err instanceof Error ? err.message : "Could not save password");
                })
                .finally(() => setPasswordBusy(false));
            }}
          >
            {currentUser?.hasPassword ? "Update password" : "Add password"}
          </button>
          {passwordSaved ? <span className="studio-account-saved">{passwordSaved}</span> : null}
          {passwordError ? <span className="text-sm text-red-300">{passwordError}</span> : null}
        </div>
      </section>
    </div>
  );
}


function BankLine({ label, value }) {
  return (
    <p className="studio-bank-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  );
}

function pricingPlans(pricing) {
  const pricePerCredit = (pricing?.creditPriceCents ?? 50) / 100;
  const makePrice = (credits) => `$${Math.round(credits * pricePerCredit).toLocaleString()}`;
  const makeAmountCents = (credits) => Math.round(credits * (pricing?.creditPriceCents ?? 50));
  const makeDiscountedTopUp = (credits, discountPercent) => {
    const originalAmountCents = makeAmountCents(credits);
    const amountCents = Math.round(originalAmountCents * (100 - discountPercent) / 100);
    return {
      price: formatMoney(amountCents),
      amountCents,
      originalPrice: formatMoney(originalAmountCents),
      discountPercent,
    };
  };
  return [
    {
      name: "50 credits",
      badge: "Try",
      credits: 50,
      price: makePrice(50),
      amountCents: makeAmountCents(50),
      features: ["Quick top up", "Bank transfer available"],
    },
    {
      name: "250 credits",
      badge: "Popular",
      credits: 250,
      price: makePrice(250),
      amountCents: makeAmountCents(250),
      featured: true,
      features: ["Creator balance", "Bank transfer available"],
    },
    {
      name: "500 credits",
      badge: "Scale",
      credits: 500,
      price: makePrice(500),
      amountCents: makeAmountCents(500),
      features: ["Studio balance", "Bank transfer available"],
    },
    {
      name: "1000 credits",
      badge: "Pro",
      credits: 1000,
      price: makePrice(1000),
      amountCents: makeAmountCents(1000),
      features: ["Production balance", "Bank transfer available"],
    },
    {
      name: "2000 credits",
      badge: "Scale",
      credits: 2000,
      ...makeDiscountedTopUp(2000, 2),
      features: ["Team-ready balance", "Bank transfer available"],
    },
    {
      name: "4000 credits",
      badge: "Growth",
      credits: 4000,
      ...makeDiscountedTopUp(4000, 4),
      features: ["High-volume balance", "Bank transfer available"],
    },
    {
      name: "8000 credits",
      badge: "Enterprise",
      credits: 8000,
      ...makeDiscountedTopUp(8000, 6),
      features: ["Campaign balance", "Bank transfer available"],
    },
  ];
}

function subscriptionPlanOptions(subscriptionPlans) {
  return (subscriptionPlans ?? []).map((plan, index) => ({
    _id: plan._id,
    name: plan.name,
    badge: index === 0 ? "Monthly" : index === 1 ? "Popular" : "Scale",
    credits: plan.includedMonthlyCredits,
    price: formatMoney(plan.monthlyPriceCents),
    originalPrice:
      plan.discountPercent && plan.originalMonthlyPriceCents && plan.originalMonthlyPriceCents > plan.monthlyPriceCents
        ? formatMoney(plan.originalMonthlyPriceCents)
        : null,
    discountPercent: plan.discountPercent,
    amountCents: plan.monthlyPriceCents,
    featured: index === 1,
    features: [
      `${plan.includedMonthlyCredits} credits monthly`,
      `${formatMoney(plan.topUpCreditPriceCents)} per extra credit`,
      "Bank transfer activation",
    ],
  }));
}

function formatMoney(amountCents) {
  const amount = Number(amountCents ?? 0) / 100;
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function elementSheetCreditCost({
  elementType,
  imageReferenceCount = 0,
  videoReferenceCount = 0,
  audioReferenceCount = 0,
}) {
  const textCost = textCreditCost({
    imageReferenceCount,
    videoReferenceCount,
    audioReferenceCount,
  });
  // Notes elements are text-only; the others also generate a reference sheet image.
  const imageSheetCost =
    elementType === "doc"
      ? 0
      : imageCreditCost({
          resolution: "2K",
          hasReferenceInput: imageReferenceCount > 0,
        });
  return textCost + imageSheetCost;
}

function composerCreditCost({
  mode,
  resolution,
  imageResolution,
  durationSeconds,
  hasReferenceInput,
  hasVideoReferenceInput,
  hasNonVideoReferenceInput,
  audioEnabled,
  referenceInputs,
  elementType,
  elementReferenceCounts,
}) {
  if (mode === "element") {
    return elementSheetCreditCost({
      elementType,
      imageReferenceCount: elementReferenceCounts?.image ?? 0,
      videoReferenceCount: elementReferenceCounts?.video ?? 0,
      audioReferenceCount: elementReferenceCounts?.audio ?? 0,
    });
  }
  if (mode === "script") {
    return textCreditCost({
      imageReferenceCount: referenceInputs?.filter((reference) => reference.kind === "image").length ?? 0,
      audioReferenceCount: referenceInputs?.filter((reference) => reference.kind === "audio").length ?? 0,
      videoReferenceCount: referenceInputs?.filter((reference) => reference.kind === "video").length ?? 0,
    });
  }
  return creditCostForGeneration({
    tier: mode === "video" ? "pro_video" : "image",
    resolution: mode === "video" ? resolution : normalizeImageResolution(imageResolution),
    durationSeconds,
    hasReferenceInput,
    hasVideoReferenceInput,
    hasNonVideoReferenceInput,
    audioEnabled,
  });
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatActivityTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs >= 0 && diffMs < dayMs) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function activityToneForKind(kind, status) {
  if (kind === "generation_completed" || status === "payment_completed" || status === "completed") return "success";
  if (kind === "generation_failed" || status === "rejected" || status === "failed") return "danger";
  if (kind === "payment_status" || kind === "payment") return "payment";
  return "neutral";
}

function buildStudioActivityItems(notifications = [], payments = []) {
  const items = [
    ...(notifications ?? []).map((item) => ({
      id: `n:${item._id}`,
      kind: item.kind ?? "notification",
      title: item.title,
      body: item.body,
      createdAt: item.createdAt ?? item._creationTime,
      tone: activityToneForKind(item.kind),
    })),
    ...(payments ?? []).map((item) => ({
      id: `p:${item._id}`,
      kind: "payment",
      title: "Payment",
      body: `${humanizePaymentStatus(item.status)} · ${formatMoney(item.amountCents)}`,
      createdAt: item.createdAt ?? item._creationTime,
      tone: activityToneForKind("payment", item.status),
      status: item.status,
    })),
  ]
    .filter((item) => item.title)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  const collapsed = [];
  for (const item of items) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.title === item.title && prev.body === item.body) {
      prev.count = (prev.count || 1) + 1;
      prev.createdAt = Math.max(prev.createdAt ?? 0, item.createdAt ?? 0);
      continue;
    }
    collapsed.push({ ...item, count: 1 });
  }
  return collapsed.slice(0, 12);
}

function StudioActivityFeed({ notifications = [], payments = [] }) {
  const items = useMemo(
    () => buildStudioActivityItems(notifications, payments),
    [notifications, payments],
  );

  return (
    <section className="cursor-settings-section studio-settings-simple-card studio-settings-activity-card">
      <div className="studio-settings-activity-head">
        <strong>Recent activity</strong>
        <span>{items.length ? `${items.length} update${items.length === 1 ? "" : "s"}` : "Nothing yet"}</span>
      </div>
      {items.length ? (
        <div className="studio-settings-activity-list">
          {items.map((item) => (
            <article
              key={item.id}
              className={`studio-settings-activity-row is-${item.tone}`}
            >
              <span className="studio-settings-activity-tone" aria-hidden="true" />
              <div className="studio-settings-activity-copy">
                <div className="studio-settings-activity-title-row">
                  <strong>
                    {item.title}
                    {item.count > 1 ? (
                      <span className="studio-settings-activity-count">×{item.count}</span>
                    ) : null}
                  </strong>
                  <time dateTime={item.createdAt ? new Date(item.createdAt).toISOString() : undefined}>
                    {formatActivityTime(item.createdAt)}
                  </time>
                </div>
                {item.body ? <p>{item.body}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="studio-settings-activity-empty">No recent billing or generation activity.</p>
      )}
    </section>
  );
}

function humanizePaymentStatus(status) {
  return String(status ?? "")
    .replace(/^payment_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Pending";
}

function formatCreditBalance(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value));
}

function CreditPill({ entitlement, onClick }) {
  const label = formatCreditBalance(entitlement?.creditBalance);
  const content = (
    <>
      <Coins className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </>
  );
  if (!onClick) {
    return (
      <span className="studio-credit-pill inline-flex h-6 items-center gap-1.5 rounded-full border border-cursor-border bg-cursor-panel px-2.5 text-[11px] font-semibold leading-none text-cursor-muted tabular-nums">
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="studio-credit-pill inline-flex h-6 items-center gap-1.5 rounded-full border border-cursor-border bg-cursor-panel px-2.5 text-[11px] font-semibold leading-none text-cursor-muted tabular-nums"
      onClick={onClick}
      title={entitlement?.creditBalance != null ? "View balance and billing" : "Add credits"}
      aria-label={
        entitlement?.creditBalance != null
          ? `${label} tokens — view balance and billing`
          : "Add credits"
      }
    >
      {content}
    </button>
  );
}

function buildFlatEntries({ folder, parent, loading, folders, assets, documents, videoEdits, elements, assetLookupPool }) {
  const lookup = assetLookupPool ?? assets;
  return {
    loading: loading ?? !folder,
    parent,
    entries: [
      ...(folders ?? []).map(folderToEntry),
      ...(documents ?? []).map(documentToEntry),
      ...(videoEdits ?? []).map(videoEditToEntry),
      ...(assets ?? []).map(assetToEntry),
      ...(elements ?? []).map((element) => elementToEntry(element, lookup)),
    ],
  };
}

function folderToEntry(folder) {
  return {
    type: "dir",
    name: folder.name,
    path: studioPathForFolder(folder),
    displayPath: displayWorkspacePath(studioPathForFolder(folder)),
    modified: folder.updatedAt,
    mtimeMs: folder.updatedAt,
    studioKind: "folder",
    studioId: folder._id,
    peekItems: folder.peekItems ?? [],
  };
}

function documentToEntry(doc) {
  return {
    type: "file",
    name: `${doc.title}.md`,
    path: `/Studio/scripts/${doc._id}.md`,
    displayPath: displayWorkspacePath(`/Studio/${virtualFileName(doc.title, ".md")}`),
    modified: doc.updatedAt,
    mtimeMs: doc.updatedAt,
    ext: ".md",
    studioKind: "document",
    studioId: doc._id,
    kindLabel: "Ad copy",
    description: doc.contentMarkdown,
  };
}

function videoEditToEntry(project) {
  return {
    type: "file",
    name: `${project.name}.edit`,
    path: `/Studio/edits/${project._id}.edit`,
    displayPath: displayWorkspacePath(`/Studio/${virtualFileName(project.name, ".edit")}`),
    modified: project.updatedAt,
    mtimeMs: project.updatedAt,
    ext: ".edit",
    studioKind: "videoEdit",
    studioId: project._id,
    folderId: project.folderId,
    kindLabel: "Video edit",
  };
}

function assetToEntry(asset) {
  const assetId = asset._id ?? asset.studioId;
  const ext = asset.kind === "image" ? ".png" : asset.kind === "video" ? ".mp4" : asset.kind === "audio" ? ".mp3" : ".bin";
  const name = safeEntryTitle({
    name: asset.name,
    path: `/Studio/assets/${assetId}${ext}`,
    kind: asset.kind,
    kindLabel: asset.kind === "image" ? "Image" : asset.kind === "video" ? "Video" : asset.kind === "audio" ? "Audio" : "Content",
  });
  return {
    type: "file",
    name,
    path: `/Studio/assets/${assetId}${ext}`,
    displayPath: displayWorkspacePath(`/Studio/${virtualFileName(name, ext)}`),
    modified: asset.updatedAt,
    mtimeMs: asset.updatedAt,
    ext,
    studioKind: "asset",
    studioId: assetId,
    kind: asset.kind,
    kindLabel: asset.kind === "image" ? "Image" : asset.kind === "video" ? "Video" : asset.kind === "audio" ? "Audio" : "Content",
    description: asset.mimeType,
    mediaUrl: asset.signedReadUrl ?? asset.mediaUrl,
    thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl ?? asset.thumbnailUrl ?? asset.mediaUrl,
    thumbnailLqipUrl: asset.signedThumbnailLqipUrl ?? asset.thumbnailLqipUrl,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
  };
}

function isVideoFileUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

function elementToEntry(element, assets = []) {
  let referenceAssetIds = element.referenceAssetIds ?? [];
  let sheetAssetId = element.sheetAssetId;

  if (!element.referenceAssetIds?.length && !element.sheetAssetId && element.sourceAssetIds?.length) {
    const firstId = element.sourceAssetIds[0];
    const firstAsset = (assets ?? []).find((item) => item._id === firstId || item.studioId === firstId);
    if (firstAsset?.name?.includes("-sheet.")) {
      sheetAssetId = firstId;
      referenceAssetIds = element.sourceAssetIds.slice(1);
    } else {
      referenceAssetIds = element.sourceAssetIds;
    }
  }

  const referenceAssets = referenceAssetIds
    .map((assetId) => {
      const asset = (assets ?? []).find((item) => item._id === assetId || item.studioId === assetId);
      return asset ? assetToEntry(asset) : null;
    })
    .filter(Boolean);
  const sheetAsset = sheetAssetId
    ? (() => {
        const asset = (assets ?? []).find((item) => item._id === sheetAssetId || item.studioId === sheetAssetId);
        return asset ? assetToEntry(asset) : null;
      })()
    : null;

  return {
    type: "file",
    name: `@${element.name}`,
    path: `/Studio/elements/${element._id}.element`,
    displayPath: displayWorkspacePath(`/Studio/${virtualFileName(`@${element.name}`, ".element")}`),
    modified: element.updatedAt,
    mtimeMs: element.updatedAt,
    ext: ".element",
    studioKind: "element",
    studioId: element._id,
    folderId: element.folderId,
    elementType: element.type,
    buildStatus: sheetAssetId || sheetAsset ? "built" : "unbuilt",
    builtAt: element.builtAt,
    referenceAssetIds,
    referenceAssets,
    sheetAssetId,
    sheetAsset,
    thumbnailUrl: sheetAsset?.thumbnailUrl ?? sheetAsset?.mediaUrl,
    mediaUrl: sheetAsset?.mediaUrl ?? sheetAsset?.thumbnailUrl,
    mimeType: sheetAsset?.mimeType,
    sourceAssetIds: referenceAssetIds,
    sourceAssets: referenceAssets,
    kindLabel:
      element.type === "character"
        ? "Person"
        : element.type === "prop"
          ? "Product"
          : element.type === "location"
            ? "Place"
            : "Notes",
    description: element.description,
  };
}

function studioPathForFolder(folder) {
  return `/Studio/${folder.name}`;
}

function virtualFileName(name, ext) {
  const cleanName = String(name ?? "item").replace(/[\\/]/g, "-").trim() || "item";
  return cleanName.toLowerCase().endsWith(ext.toLowerCase()) ? cleanName : `${cleanName}${ext}`;
}

function tabDescriptor({ key, threads, assets, documents, videoEdits, elements, snapshots }) {
  if (key.startsWith("composer:")) {
    return { key, kind: "chat", title: key === COMPOSER_TAB ? "Generate" : "New request", status: "ready" };
  }
  if (key.startsWith("admin:")) {
    const kind = key.slice("admin:".length);
    const title =
      kind === "payments"
        ? "Payments"
        : kind === "customers"
          ? "Customers"
          : kind === "setup"
            ? "Admin setup"
            : kind === "pricing"
              ? "Pricing"
              : "Admin";
    return { key, kind: "settings", title, status: "ready" };
  }
  if (key.startsWith("billing:")) {
    const kind = key.slice("billing:".length);
    const title = kind === "top-up" ? "Credit top up" : "Billing";
    return { key, kind: "settings", title, status: "ready" };
  }
  if (key.startsWith("create:")) {
    const target = parseCreateTab(key);
    return {
      key,
      kind: "file",
      title: createTabTitle(target),
      status: "ready",
      studioKind: target.kind === "element" ? "element" : undefined,
      elementType: target.elementType,
    };
  }
  if (key.startsWith("videoEdit:")) {
    const projectId = key.slice("videoEdit:".length);
    const snapshot = snapshots?.[key];
    const project = videoEdits?.find((item) => item._id === projectId);
    const title = snapshot?.name?.replace(/\.edit$/i, "") ?? project?.name ?? "Video edit";
    return { key, kind: "file", title, status: "ready", studioKind: "videoEdit" };
  }
  if (key.startsWith("edit:")) {
    if (key.startsWith("edit:project:")) {
      const projectId = key.slice("edit:project:".length);
      const project = videoEdits?.find((item) => item._id === projectId);
      return { key, kind: "file", title: project?.name ?? "Video edit", status: "ready", studioKind: "videoEdit" };
    }
    return { key, kind: "file", title: "Edit video", status: "ready", studioKind: "videoEdit" };
  }
  if (key.startsWith("thread:")) {
    const thread = threads?.find((item) => item._id === key.slice("thread:".length));
    return { key, kind: "chat", title: thread?.title ?? "Generation", status: "ready" };
  }
  const entry = findEntryByTab(key, { assets, documents, videoEdits, elements, snapshots });
  if (entry) {
    const previewUrl =
      (typeof entry.thumbnailUrl === "string" && entry.thumbnailUrl) ||
      entry.sheetAsset?.thumbnailUrl ||
      entry.sheetAsset?.mediaUrl ||
      ((entry.kind === "image" || entry.kind === "video") && typeof entry.mediaUrl === "string"
        ? entry.mediaUrl
        : undefined);
    return {
      key,
      kind: "file",
      title: safeEntryTitle(entry),
      path: entry.path,
      displayPath: entry.displayPath ?? displayWorkspacePath(entry.path),
      ext: entry.ext,
      studioKind: entry.studioKind,
      elementType: entry.elementType,
      previewUrl,
      previewKind: entry.kind ?? (entry.studioKind === "element" ? "image" : undefined),
      status: "ready",
    };
  }
  return null;
}

function parseCreateTab(key) {
  const [, kind, elementType] = key.split(":");
  const validElementType = ["character", "prop", "location", "doc"].includes(elementType) ? elementType : undefined;
  return {
    kind: kind || "folder",
    elementType: kind === "element" ? validElementType : undefined,
  };
}

function createTabTitle(target) {
  if (target.kind === "folder") return "New folder";
  if (target.kind === "script") return "New ad copy";
  if (target.kind === "element") {
    return `New ${elementTypeLabel(target.elementType).toLowerCase()}`;
  }
  return "Add content";
}

function findEntryByTab(key, { assets, documents, videoEdits, elements, snapshots }) {
  if (key.startsWith("asset:")) {
    const id = key.slice("asset:".length);
    const item = assets?.find((asset) => asset._id === id || asset.studioId === id);
    const snapshot = snapshots?.[key] ?? null;
    if (item) return mergeEntrySnapshot(assetToEntry(item), snapshot);
    return snapshot;
  }
  if (key.startsWith("document:")) {
    const item = documents?.find((doc) => doc._id === key.slice("document:".length));
    return item ? documentToEntry(item) : snapshots?.[key] ?? null;
  }
  if (key.startsWith("videoEdit:")) {
    const item = videoEdits?.find((project) => project._id === key.slice("videoEdit:".length));
    return item ? videoEditToEntry(item) : snapshots?.[key] ?? null;
  }
  if (key.startsWith("element:")) {
    const item = elements?.find((element) => element._id === key.slice("element:".length));
    return item ? elementToEntry(item, assets) : snapshots?.[key] ?? null;
  }
  return null;
}

function safeEntryTitle(entry) {
  const raw = entry?.name ?? entry?.filename ?? entry?.title ?? entry?.label;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/^@/, "").trim();
    if (cleaned && cleaned !== "[object Object]") return cleaned;
  }
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  const fromPath = String(entry?.displayPath ?? entry?.path ?? "")
    .split("/")
    .filter(Boolean)
    .pop();
  if (fromPath && fromPath !== "undefined" && !fromPath.includes("[object")) return fromPath;
  if (entry?.kind === "image") return "Image";
  if (entry?.kind === "video") return "Video";
  if (entry?.kind === "audio") return "Audio";
  return entry?.kindLabel ?? "Untitled";
}

function mergeEntrySnapshot(entry, snapshot) {
  if (!snapshot) return entry;
  const title = safeEntryTitle(entry);
  const snapshotTitle = safeEntryTitle(snapshot);
  return {
    ...entry,
    name: title !== "Untitled" ? title : snapshotTitle,
    thumbnailUrl:
      (typeof entry.thumbnailUrl === "string" && entry.thumbnailUrl) ||
      snapshot.thumbnailUrl ||
      snapshot.mediaUrl ||
      entry.mediaUrl,
    mediaUrl:
      (typeof entry.mediaUrl === "string" && entry.mediaUrl) ||
      snapshot.mediaUrl ||
      snapshot.thumbnailUrl ||
      entry.thumbnailUrl,
  };
}

function entryToAttachment(entry) {
  const studioKind = entry.studioKind ?? (entry.type === "dir" ? "folder" : undefined);
  const kind = studioKind === "asset" || !studioKind ? inferAttachmentKind(entry) : studioKind === "document" ? "file" : "context";
  const label = safeEntryTitle(entry);
  return {
    id: studioKind && entry.studioId ? `${studioKind}:${entry.studioId}` : entry.path,
    kind,
    label,
    path: entry.path,
    displayPath: entry.displayPath ?? displayWorkspacePath(entry.path),
    filename: typeof entry.name === "string" ? entry.name : label,
    studioKind,
    studioId: entry.studioId,
    elementType: entry.elementType,
    buildStatus: entry.buildStatus,
    description: typeof entry.description === "string" ? entry.description : undefined,
    referenceAssetIds: entry.referenceAssetIds ?? entry.sourceAssetIds,
    referenceAssets: entry.referenceAssets ?? entry.sourceAssets,
    sheetAssetId: entry.sheetAssetId,
    sheetAsset: entry.sheetAsset,
    sourceAssetIds: entry.referenceAssetIds ?? entry.sourceAssetIds,
    sourceAssets: entry.referenceAssets ?? entry.sourceAssets,
    mimeType: entry.mimeType ?? entry.sheetAsset?.mimeType,
    thumbnailUrl: entry.sheetAsset?.thumbnailUrl ?? entry.sheetAsset?.mediaUrl ?? entry.thumbnailUrl,
    mediaUrl: entry.sheetAsset?.mediaUrl ?? entry.mediaUrl,
  };
}

function inferAttachmentKind(entry) {
  const ext = String(entry.ext ?? entry.name?.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  const mime = String(entry.mimeType ?? entry.description ?? "").toLowerCase();
  if ([".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"].includes(ext) || mime.startsWith("image/")) return "image";
  if ([".mp4", ".webm", ".mov"].includes(ext) || mime.startsWith("video/")) return "video";
  if ([".mp3", ".wav", ".m4a", ".ogg"].includes(ext) || mime.startsWith("audio/")) return "audio";
  return "file";
}

function sanitizePromptRefMeta(value, maxLen = 160) {
  if (value == null) return "";
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .replace(/\|/g, "/")
    .trim()
    .slice(0, maxLen);
}

function buildPromptWithAttachments(prompt, attachments) {
  if (!attachments.length) return prompt.trim();
  const refs = attachments
    .map((item) => {
      const notes = sanitizePromptRefMeta(item.description);
      // Prefer canonical /Studio/assets|elements/{id} paths so chat chips can resolve previews.
      const canonicalPath = item.path || item.displayPath || "";
      return [
        `- @${item.label}`,
        item.kind ? `kind: ${item.kind}` : "",
        item.elementType ? `element: ${item.elementType}` : "",
        item.buildStatus ? `build: ${item.buildStatus}` : "",
        notes ? `notes: ${notes}` : "",
        canonicalPath ? `path: ${canonicalPath}` : "",
        item.filename ? `file: ${item.filename}` : "",
        item.studioId ? `studio: ${item.studioId}` : "",
        item.thumbnailUrl ? `thumb: ${item.thumbnailUrl}` : "",
        item.mediaUrl ? `media: ${item.mediaUrl}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
  return `${prompt.trim()}\n\nReferences:\n${refs}`;
}

function splitVideoGenerationInputs(attachments, signedUrls = {}, startFrameAttachmentId = "") {
  let startFrameUrl;
  const referenceInputs = [];
  for (const attachment of attachments) {
    if (attachment.id === startFrameAttachmentId) {
      const url =
        attachment.mediaUrl ??
        signedUrls[`attachment:${attachment.id}`] ??
        attachment.thumbnailUrl;
      if (url && /^https?:\/\//i.test(url)) {
        startFrameUrl = url;
      }
      continue;
    }
    if (attachment.studioKind === "element") {
      if (attachment.elementType === "character") {
        continue;
      }
      const sheet = attachment.sheetAsset;
      if (!sheet) continue;
      const url =
        sheet.mediaUrl ??
        signedUrls[`element-sheet:${attachment.id}`] ??
        sheet.thumbnailUrl;
      if (!url || !/^https?:\/\//i.test(url)) continue;
      referenceInputs.push({ kind: "image", url, mimeType: sheet.mimeType });
      continue;
    }
    const direct = {
      kind: attachment.kind,
      url:
        attachment.mediaUrl ??
        signedUrls[`attachment:${attachment.id}`] ??
        attachment.thumbnailUrl,
      mimeType: attachment.mimeType,
    };
    if (
      ["image", "video", "audio"].includes(direct.kind) &&
      /^https?:\/\//i.test(direct.url ?? "")
    ) {
      referenceInputs.push(direct);
    }
  }
  return { startFrameUrl, referenceInputs };
}

function generationReferenceInputs(attachments, signedUrls = {}) {
  return attachments
    .flatMap((attachment) => {
      if (attachment.studioKind === "element") {
        const sheet = attachment.sheetAsset;
        if (!sheet) {
          // Unbuilt element: no sheet to send. Its notes still ride along in the prompt.
          return [];
        }
        const url =
          sheet.mediaUrl ??
          signedUrls[`element-sheet:${attachment.id}`] ??
          sheet.thumbnailUrl;
        if (!url || !/^https?:\/\//i.test(url)) {
          return [];
        }
        return [{ kind: "image", url, mimeType: sheet.mimeType }];
      }
      const direct = {
        kind: attachment.kind,
        url: attachment.mediaUrl ?? signedUrls[`attachment:${attachment.id}`] ?? attachment.thumbnailUrl,
        mimeType: attachment.mimeType,
      };
      return [direct];
    })
    .filter((reference) =>
      ["image", "video", "audio"].includes(reference.kind) &&
      /^https?:\/\//i.test(reference.url ?? ""),
    );
}

function kindFromMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
