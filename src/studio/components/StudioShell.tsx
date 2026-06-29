// @ts-nocheck
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQueries, useQuery } from "convex/react";
import {
  ChevronDown,
  Clock3,
  FileText,
  Gauge,
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
  Plus,
  RectangleHorizontal,
  Coins,
  Settings,
  Sparkles,
  Upload,
  UserRound,
  Video,
  Volume2,
  Zap,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import { ExplorerContextMenu } from "@/desk/components/ExplorerContextMenu";
import { FileBreadcrumbs } from "@/desk/components/FileBreadcrumbs";
import { FileTree } from "@/desk/components/FileTree";
import { DeskMediaPlayer } from "@/desk/components/DeskMediaPlayer";
import { ImageZoomViewer } from "@/desk/components/ImageZoomViewer";
import { MarkdownDocEditor } from "@/desk/components/MarkdownDocEditor";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { ThemeSettings } from "@/desk/components/ThemeSettings";
import { UnifiedTabStrip } from "@/desk/components/UnifiedTabStrip";
import { readExplorerDragData } from "@/desk/lib/explorer-dnd";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { MERCURY_LOGO_SIDEBAR, mercuryLogoAssets } from "@/lib/brand-assets";
import { getDeviceId, loadSession } from "@/lib/session";
import * as mosApi from "@mos-app/api.js";

const WORKSPACE_ID = "yatishara-studio";
const COMPOSER_TAB = "composer:main";
const CREATE_MENU_ITEMS = [
  { action: "upload", label: "Upload media", icon: Upload },
  { action: "new-folder", label: "Folder", icon: Plus },
  { action: "new-file", label: "Ad copy", icon: FileText },
  { sep: true },
  { action: "new-element", label: "Add element", icon: Sparkles },
];
const STUDIO_CUSTOM_CURSOR_KEY = "yatishara-studio-custom-cursor";
const STUDIO_VOICE_NOT_CONNECTED =
  "Voice is not connected yet. Please try typing your request, or connect voice and try again.";
const MERCURY_EMPTY_LOGO = mercuryLogoAssets(96);

function studioCursorUrl(accent, active = false) {
  const accentSoft = studioMixHex(accent, "#ffffff", 0.3);
  const fill = active ? "url(#theme)" : "#10131a";
  const fillOpacity = active ? ".94" : ".1";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24"><defs><linearGradient id="theme" x1="5" y1="3" x2="17" y2="17"><stop offset="0" stop-color="${accentSoft}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><path d="M5.2 3.9c-.36-.27-.88-.01-.88.44v15.18c0 .49.6.72.93.36l4.28-4.63 6.86-.14c.49-.01.7-.64.31-.94L5.2 3.9Z" fill="${fill}" fill-opacity="${fillOpacity}" stroke="url(#theme)" stroke-width="2" stroke-linejoin="round"/><path d="M6.54 6.55v9.88l2.24-2.44 4.54-.09L6.54 6.55Z" fill="none" stroke="#fff" stroke-opacity="${active ? ".38" : ".2"}" stroke-width=".72" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 3`;
}

function studioCursorTextUrl(accent) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="24" viewBox="0 0 18 24"><path d="M9 3.2v17.6" stroke="${accent}" stroke-width="2" stroke-linecap="butt"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 9 12, text`;
}

function studioMixHex(hex, target, amount) {
  const clean = String(hex || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(clean)) return "#66e8ff";
  const a = clean.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
  const b = target.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
  return `#${a
    .map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
}

function applyStudioCursorTheme(element) {
  if (!element) return;
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--cursor-accent").trim() ||
    "#22c55e";
  element.style.setProperty("--studio-cursor-default", studioCursorUrl(accent, false));
  element.style.setProperty("--studio-cursor-active", studioCursorUrl(accent, true));
  element.style.setProperty("--studio-cursor-text", studioCursorTextUrl(accent));
}

function cssUrlToPath(value) {
  const match = value.trim().match(/^url\(["']?(.*?)["']?\)$/);
  return match?.[1] ?? "";
}

const STYLE = {
  shell: "flex h-dvh min-h-0 bg-cursor-bg text-cursor-text",
  sidebar: "flex h-full w-full min-w-0 flex-col border-r border-cursor-border bg-cursor-sidebar",
  main: "flex min-w-0 flex-1 flex-col bg-cursor-bg",
  panelHead: "cursor-panel-head justify-between",
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
  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);
  const trashDocument = useMutation(api.documents.moveToTrash);
  const createElement = useMutation(api.elements.create);
  const updateElement = useMutation(api.elements.update);
  const trashElement = useMutation(api.elements.moveToTrash);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const completeUpload = useMutation(api.assets.completeUpload);
  const updateAsset = useMutation(api.assets.update);
  const duplicateAsset = useMutation(api.assets.duplicate);
  const trashAsset = useMutation(api.assets.moveToTrash);
  const createThread = useMutation(api.generation.createThread);
  const switchThreadFolder = useMutation(api.generation.switchThreadFolder);
  const updateAccountDetails = useMutation(api.users.updateAccountDetails);
  const seedStylePresets = useMutation(api.stylePresets.adminSeedDefaults);
  const runFlow = useAction(api.generationActions.runFlow);
  const generateScript = useAction(api.generationActions.generateScript);

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
  const [mode, setMode] = useState("image");
  const [imageTier, setImageTier] = useState("medium");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageResolution, setImageResolution] = useState("2K");
  const [resolution, setResolution] = useState("1280x720");
  const [durationSeconds, setDurationSeconds] = useState("4");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [flowPending, setFlowPending] = useState(false);
  const [status, setStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState("composer");
  const [customCursorEnabled, setCustomCursorEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STUDIO_CUSTOM_CURSOR_KEY) !== "off";
  });
  const [contextMenu, setContextMenu] = useState(null);
  const [entitlementNow] = useState(() => Date.now());
  const [assetUrlExpiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);
  const [studioBackground, setStudioBackground] = useState({ path: "", value: "", ready: false });
  const deferredSearch = useDeferredValue(search);
  const fileInputRef = useRef(null);
  const composerUploadInputRef = useRef(null);
  const shellRef = useRef(null);
  const editorRef = useRef(null);
  const composerKeyRef = useRef(COMPOSER_TAB);
  const createTabIndexRef = useRef(0);
  const composerContextsRef = useRef({});
  const folderByIdRef = useRef(new Map());
  const currentEntriesCacheRef = useRef(new Map());
  const lastRootEntriesRef = useRef(null);
  const studioBackgroundPathRef = useRef("");

  const currentUser = useQuery(api.users.current, {});
  const billingAccount = useQuery(api.billing.currentAccount, {});
  const pricing = useQuery(api.billing.getPricing, {});
  const bankAccounts = useQuery(api.billing.listBankAccounts, {});
  const subscriptionPlans = useQuery(api.billing.listSubscriptionPlans, {});
  const payments = useQuery(api.billing.listMyPayments, {});
  const notifications = useQuery(api.notifications.listMine, {});
  const isAdminUser = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const adminPayments = useQuery(api.billing.adminListPayments, isAdminUser ? {} : "skip");
  const topFolders = useQuery(api.folders.list, {});
  const selectedFolder = useQuery(
    api.folders.get,
    activeFolderId ? { folderId: activeFolderId } : "skip",
  );
  const activeFolder = activeFolderId
    ? (selectedFolder ?? folderByIdRef.current.get(activeFolderId) ?? topFolders?.find((folder) => folder._id === activeFolderId) ?? null)
    : (topFolders?.[0] ?? null);

  useEffect(() => {
    if (!isMobile && mobileSection !== "composer") setMobileSection("composer");
  }, [isMobile, mobileSection]);
  const childFolders = useQuery(
    api.folders.list,
    activeFolder ? { parentId: activeFolder._id } : "skip",
  );
  const assets = useQuery(
    api.assets.listByFolder,
    activeFolder ? { folderId: activeFolder._id } : "skip",
  );
  const documents = useQuery(
    api.documents.listByFolder,
    activeFolder ? { folderId: activeFolder._id } : "skip",
  );
  const elements = useQuery(api.elements.list, {});
  const threads = useQuery(api.generation.listThreads, {});
  const activeThreadId = activeTab.startsWith("thread:")
    ? activeTab.slice("thread:".length)
    : null;
  const events = useQuery(
    api.generation.listEvents,
    activeThreadId ? { threadId: activeThreadId } : "skip",
  );
  const assetPreviewQueries = useMemo(() => {
    const queries = {};
    for (const asset of assets ?? []) {
      if (!asset?._id || !["image", "video"].includes(asset.kind)) continue;
      queries[`asset:${asset._id}`] = {
        query: api.assets.signedReadUrl,
        args: { assetId: asset._id, expiresUnix: assetUrlExpiresUnix },
      };
    }
    return queries;
  }, [assetUrlExpiresUnix, assets]);
  const assetPreviewUrls = useQueries(assetPreviewQueries);
  const attachmentUrlQueries = useMemo(() => {
    const queries = {};
    for (const attachment of attachments) {
      if (
        attachment?.studioKind !== "asset" ||
        !attachment.studioId ||
        !["image", "video", "audio"].includes(attachment.kind) ||
        /^https?:\/\//i.test(attachment.mediaUrl ?? "")
      ) {
        // Not a direct media asset; it may still carry source media below.
      } else {
        queries[`attachment:${attachment.id}`] = {
          query: api.assets.signedReadUrl,
          args: { assetId: attachment.studioId, expiresUnix: assetUrlExpiresUnix },
        };
      }
      for (const sourceAsset of attachment.sourceAssets ?? []) {
        if (
          !sourceAsset?.studioId ||
          !["image", "video", "audio"].includes(sourceAsset.kind) ||
          /^https?:\/\//i.test(sourceAsset.mediaUrl ?? "")
        ) {
          continue;
        }
        queries[`element-source:${attachment.id}:${sourceAsset.studioId}`] = {
          query: api.assets.signedReadUrl,
          args: { assetId: sourceAsset.studioId, expiresUnix: assetUrlExpiresUnix },
        };
      }
    }
    return queries;
  }, [assetUrlExpiresUnix, attachments]);
  const attachmentMediaUrls = useQueries(attachmentUrlQueries);
  const assetsWithPreviewUrls = useMemo(
    () =>
      assets?.map((asset) => {
        const previewUrl = assetPreviewUrls[`asset:${asset._id}`];
        return {
          ...asset,
          signedReadUrl: asset.signedReadUrl ?? previewUrl,
          signedThumbnailUrl: asset.signedThumbnailUrl ?? (asset.kind === "image" ? previewUrl : undefined),
        };
      }),
    [assetPreviewUrls, assets],
  );
  const presets = useQuery(api.stylePresets.listEnabled, {
    kind: mode === "video" ? "video" : "image",
  });
  const generationReferences = useMemo(
    () => generationReferenceInputs(attachments, attachmentMediaUrls),
    [attachmentMediaUrls, attachments],
  );
  const composerElementEntries = useMemo(
    () => (elements ?? []).filter((element) => !element.deletedAt).map((element) => elementToEntry(element, assetsWithPreviewUrls)),
    [assetsWithPreviewUrls, elements],
  );
  const hasVideoReferenceInput = generationReferences.some((reference) => reference.kind === "video");
  const hasNonVideoReferenceInput = generationReferences.some((reference) => reference.kind === "image" || reference.kind === "audio");
  const entitlement = useQuery(api.generation.canGenerate, {
    tier: mode === "video" ? "pro_video" : imageTier,
    now: entitlementNow,
    resolution: mode === "video" ? resolution : undefined,
    durationSeconds: mode === "video" ? Number(durationSeconds) : undefined,
    hasReferenceInput: mode === "video" ? generationReferences.length > 0 : undefined,
    hasVideoReferenceInput: mode === "video" ? hasVideoReferenceInput : undefined,
    hasNonVideoReferenceInput: mode === "video" ? hasNonVideoReferenceInput : undefined,
    audioEnabled: mode === "video" ? audioEnabled : undefined,
  });

  const composerContextKey = activeTab.startsWith("composer:") || activeTab.startsWith("thread:")
    ? activeTab
    : COMPOSER_TAB;

  useEffect(() => {
    const prevKey = composerKeyRef.current;
    composerContextsRef.current[prevKey] = {
      draft,
      attachments,
      mode,
      imageTier,
      aspectRatio,
      imageResolution,
      resolution,
      durationSeconds,
      audioEnabled,
    };
    const next = composerContextsRef.current[composerContextKey];
    setDraft(next?.draft ?? "");
    setAttachments(next?.attachments ?? []);
    setMode(next?.mode ?? "image");
    setImageTier(next?.imageTier ?? "medium");
    setAspectRatio(next?.aspectRatio ?? "16:9");
    setImageResolution(next?.imageResolution ?? "2K");
    setResolution(next?.resolution ?? "1280x720");
    setDurationSeconds(next?.durationSeconds ?? "4");
    setAudioEnabled(next?.audioEnabled ?? true);
    composerKeyRef.current = composerContextKey;
  }, [composerContextKey]);

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
    return () => {
      observer.disconnect();
      window.removeEventListener("mercuryos-theme-change", updateCursor);
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let loadId = 0;
    let rafId = 0;

    const loadBackground = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const nextUrl = cssUrlToPath(getComputedStyle(shell).getPropertyValue("--studio-active-bg"));
        const currentUrl = studioBackgroundPathRef.current;
        if (!nextUrl) {
          if (!currentUrl) return;
          studioBackgroundPathRef.current = "";
          setStudioBackground({ path: "", value: "", ready: false });
          return;
        }
        if (!nextUrl || nextUrl === currentUrl) return;

        const id = loadId + 1;
        loadId = id;
        studioBackgroundPathRef.current = "";
        setStudioBackground({ path: "", value: "", ready: false });

        const image = new Image();
        image.decoding = "async";
        image.src = nextUrl;

        const showLoadedImage = () => {
          if (id !== loadId) return;
          studioBackgroundPathRef.current = nextUrl;
          setStudioBackground({ path: nextUrl, value: `url("${nextUrl}")`, ready: true });
        };

        if (image.decode) {
          void image.decode().then(showLoadedImage).catch(() => {
            if (image.complete) showLoadedImage();
            else image.onload = showLoadedImage;
          });
        } else {
          image.onload = showLoadedImage;
        }
      });
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === "data-theme" || mutation.attributeName === "data-studio-bg-pack")) {
        loadBackground();
      }
    });

    loadBackground();
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-studio-bg-pack"],
    });
    window.addEventListener("mercuryos-theme-change", loadBackground);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("mercuryos-theme-change", loadBackground);
      loadId += 1;
    };
  }, []);

  const folderContentLoading = Boolean(
    activeFolder &&
      (childFolders === undefined ||
        assetsWithPreviewUrls === undefined ||
        documents === undefined ||
        elements === undefined),
  );

  const currentEntries = useMemo(
    () =>
      buildFlatEntries({
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
        elements: elements?.filter((element) => element.folderId === activeFolder?._id),
      }),
    [activeFolder, navTrail, childFolders, assetsWithPreviewUrls, documents, elements, folderContentLoading],
  );

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

  const visibleFolderIds = useMemo(
    () =>
      (displayCurrentEntries.entries ?? [])
        .filter((entry) => entry.type === "dir" && entry.studioId && entry.studioId !== activeFolder?._id)
        .slice(0, 24)
        .map((entry) => entry.studioId),
    [activeFolder?._id, displayCurrentEntries.entries],
  );
  const folderPrefetchQueries = useMemo(() => {
    const queries = {};
    for (const folderId of visibleFolderIds) {
      queries[`folders:${folderId}`] = {
        query: api.folders.list,
        args: { parentId: folderId },
      };
      queries[`assets:${folderId}`] = {
        query: api.assets.listByFolder,
        args: { folderId },
      };
      queries[`documents:${folderId}`] = {
        query: api.documents.listByFolder,
        args: { folderId },
      };
    }
    return queries;
  }, [visibleFolderIds]);
  useQueries(folderPrefetchQueries);

  const tabs = useMemo(() => {
    const descriptors = openTabs.map((key) =>
      tabDescriptor({
        key,
        threads,
        assets: assetsWithPreviewUrls ?? assets,
        documents,
        elements,
        snapshots: tabEntrySnapshots,
      }),
    );
    return descriptors.filter(Boolean);
  }, [openTabs, threads, assetsWithPreviewUrls, assets, documents, elements, tabEntrySnapshots]);

  const activeEntry = useMemo(
    () => findEntryByTab(activeTab, { threads, assets: assetsWithPreviewUrls ?? assets, documents, elements, snapshots: tabEntrySnapshots }),
    [activeTab, threads, assetsWithPreviewUrls, assets, documents, elements, tabEntrySnapshots],
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

  function openTab(key) {
    setOpenTabs((tabs) => (tabs.includes(key) ? tabs : [...tabs, key]));
    setActiveTab(key);
  }

  function openNewComposerTab() {
    openTab(`composer:${Date.now()}`);
  }

  function openCreateTab(kind, elementType = "") {
    createTabIndexRef.current += 1;
    openTab(`create:${kind}${elementType ? `:${elementType}` : ""}:${createTabIndexRef.current}`);
  }

  function runCreateAction(action) {
    if (action === "upload") {
      fileInputRef.current?.click();
      return;
    }
    if (action === "new-folder") openCreateTab("folder");
    if (action === "new-file") openCreateTab("script");
    if (action === "new-element") openCreateTab("element");
  }

  function openSettingsTab() {
    setOpenTabs((tabs) => tabs.filter((tab) => !tab.startsWith("settings:")));
    if (activeTab.startsWith("settings:")) {
      setActiveTab(COMPOSER_TAB);
    }
    if (isMobile) setMobileSection("settings");
    setSettingsOpen(true);
  }

  function openMobileSection(section) {
    setMobileSection(section);
    if (section === "composer") {
      setSettingsOpen(false);
      if (!activeTab.startsWith("composer:")) setActiveTab(COMPOSER_TAB);
      return;
    }
    if (section === "files") {
      setSettingsOpen(false);
      return;
    }
    if (section === "settings") {
      setSettingsOpen(true);
    }
  }

  function closeTab(key) {
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
    if (entry.type === "dir") {
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
    const exists = attachments.some((item) => item.id === attachment.id);
    if (!exists) {
      setAttachments((items) => [...items, attachment]);
    }
    if (!activeTab.startsWith("composer:")) {
      setActiveTab(COMPOSER_TAB);
    }
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      insertComposerAttachmentToken(editor, attachment, insertRange);
      setDraft(readComposerEditorText(editor));
    });
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
    const id = await createElement({
      folderId: activeFolder._id,
      type: values.elementType,
      name: values.name.trim(),
      sourceAssetIds: values.sourceAssetIds ?? [],
    });
    openTab(`element:${id}`);
  }

  async function renameEntry(entry) {
    if (!entry) return;
    const nextName = window.prompt("Rename", entry.name.replace(/^@/, ""));
    if (!nextName?.trim()) return;
    if (entry.studioKind === "folder") {
      await updateFolder({ folderId: entry.studioId, name: nextName.trim() });
    } else if (entry.studioKind === "document") {
      await updateDocument({ documentId: entry.studioId, title: nextName.trim().replace(/\.md$/i, "") });
    } else if (entry.studioKind === "asset") {
      await updateAsset({ assetId: entry.studioId, name: nextName.trim() });
    }
  }

  async function updateElementDetails(entry, values) {
    if (!entry?.studioId || !values?.name?.trim()) return;
    await updateElement({
      elementId: entry.studioId,
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      sourceAssetIds: values.sourceAssetIds ?? [],
    });
    setTabEntrySnapshots((snapshots) => ({
      ...snapshots,
      [`element:${entry.studioId}`]: {
        ...entry,
        name: `@${values.name.trim()}`,
        description: values.description?.trim() || undefined,
        sourceAssetIds: values.sourceAssetIds ?? [],
        sourceAssets: values.sourceAssets ?? entry.sourceAssets,
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
    if (!entry) return;
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
    }
    closeTab(`${entry.studioKind}:${entry.studioId}`);
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
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
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
      if (mode === "script") {
        const result = await generateScript({
          folderId: activeFolder._id,
          userPrompt: buildPromptWithAttachments(draft, attachments),
          referenceInputs: generationReferences,
        });
        openTab(`document:${result.documentId}`);
        setDraft("");
        setAttachments([]);
        return;
      }

      if (presets === undefined) {
        throw new Error("Style options are still loading. Try again in a moment.");
      }
      const preset = presets[0];
      if (!preset) {
        const canSeedPresets =
          currentUser?.role === "admin" || currentUser?.role === "super_admin";
        throw new Error(
          canSeedPresets
            ? "Style options are not ready yet. Open Settings > Team tools and seed them first."
            : "Style options are not ready yet. Ask an admin to seed them in Settings.",
        );
      }
      if (entitlement && !entitlement.canGenerate) {
        throw new Error(entitlement.reason ?? "Content generation is not available right now.");
      }
      const threadId = await createThread({
        folderId: activeFolder._id,
        title: draft.trim().slice(0, 64),
      });
      openTab(`thread:${threadId}`);
      await runFlow({
        threadId,
        mode,
        tier: mode === "video" ? "pro_video" : imageTier,
        stylePresetId: preset._id,
        userPrompt: buildPromptWithAttachments(draft, attachments),
        audioEnabled: mode === "video" ? audioEnabled : undefined,
        aspectRatio,
        resolution: mode === "image" ? normalizeImageResolution(imageTier, imageResolution) : resolution,
        durationSeconds: mode === "video" ? Number(durationSeconds) : undefined,
        referenceUrls: mode === "image"
          ? generationReferences
            .filter((reference) => reference.kind === "image")
            .map((reference) => reference.url)
          : undefined,
        referenceInputs: mode === "video" ? generationReferences : undefined,
      });
      setDraft("");
      setAttachments([]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Studio action failed.");
    } finally {
      setFlowPending(false);
    }
  }

  return (
    <div
      ref={shellRef}
      className={`${STYLE.shell} studio-polish${isMobile ? ` is-studio-mobile is-mobile-${mobileSection}` : ""}${customCursorEnabled ? " is-custom-cursor" : ""}${studioBackground.ready ? " is-studio-bg-ready" : ""}`}
      style={studioBackground.value ? { "--studio-loaded-bg": studioBackground.value } : undefined}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.("button, [role='button'], .cursor-tree-row, .desk-file-grid-item")) {
          playStudioTapFeedback();
        }
      }}
    >
      <style jsx global>{`
        .studio-polish {
          --studio-scene-bg: url("/studio-empty-space-4k.webp");
          --studio-space-bg: url("/studio-empty-space-4k.webp");
          --studio-active-bg: var(--studio-scene-bg);
          --studio-glow-soft: color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          --studio-glow-mid: color-mix(in srgb, var(--cursor-accent) 24%, transparent);
          --studio-surface-hover: color-mix(in srgb, var(--cursor-accent) 5%, var(--color-cursor-hover));
          --studio-card-bg: color-mix(in srgb, var(--mos-surface) 72%, transparent);
          --studio-shell-border: color-mix(in srgb, var(--color-cursor-border-soft) 42%, transparent);
          --studio-card-border: color-mix(in srgb, var(--cursor-accent) 8%, var(--studio-shell-border));
          --studio-motion-fast: 220ms;
          --studio-motion-med: 360ms;
          --studio-motion-ease: cubic-bezier(0.34, 1.38, 0.64, 1);
          --studio-motion-spring: cubic-bezier(0.18, 1.42, 0.32, 1);
          --studio-composer-focus-line-ease: cubic-bezier(0.16, 1, 0.3, 1);
          --studio-hover-scale: 1.018;
          --studio-press-scale: 0.985;
          --studio-focus-ring: 0 0 0 3px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          position: relative;
          overflow: hidden;
          isolation: isolate;
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
          max-height: calc(70px + env(safe-area-inset-bottom, 0px));
          flex-shrink: 0;
          align-items: center;
          z-index: 60;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
          padding: 7px max(8px, env(safe-area-inset-right, 0px)) calc(7px + env(safe-area-inset-bottom, 0px))
            max(8px, env(safe-area-inset-left, 0px));
          border-top: 1px solid color-mix(in srgb, var(--color-cursor-border) 74%, transparent);
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--cursor-accent) 8%, transparent), transparent 52%),
            color-mix(in srgb, var(--mos-bg) 82%, transparent);
          box-shadow: 0 -18px 42px rgba(0, 0, 0, 0.34);
          backdrop-filter: blur(22px);
        }
        .studio-mobile-nav-btn {
          display: flex;
          min-width: 0;
          min-height: 44px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          border: 1px solid transparent;
          border-radius: 16px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.01em;
          -webkit-tap-highlight-color: transparent;
        }
        .studio-mobile-nav-btn svg {
          width: 17px;
          height: 17px;
        }
        .studio-mobile-nav-btn.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, transparent);
          background: color-mix(in srgb, var(--cursor-accent) 12%, transparent);
          color: var(--cursor-accent);
          box-shadow: 0 0 18px color-mix(in srgb, var(--cursor-accent) 14%, transparent);
        }
        @media (max-width: 899px) {
          .studio-polish .studio-main-panels > .cursor-resize {
            display: none !important;
          }
          .studio-polish .studio-main-panels {
            padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px));
          }
          .studio-polish.is-mobile-files .studio-main-panels > [data-panel]:first-child,
          .studio-polish:not(.is-mobile-files) .studio-main-panels > [data-panel]:last-child {
            display: flex !important;
          }
          .studio-polish:not(.is-mobile-files) .studio-main-panels > [data-panel]:first-child,
          .studio-polish.is-mobile-files .studio-main-panels > [data-panel]:last-child {
            display: none !important;
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
            gap: 4px;
            padding-right: max(6px, env(safe-area-inset-right, 0px));
          }
          .studio-polish .cursor-workspace-tools {
            gap: 4px;
            padding-left: 2px;
          }
          .studio-polish .cursor-workspace-tools .studio-credit-pill {
            max-width: 104px;
          }
          .studio-polish .cursor-unified-tabs {
            padding-left: max(8px, env(safe-area-inset-left, 0px));
          }
          .studio-mobile-bottom-nav {
            display: grid !important;
          }
        }
        [data-studio-bg-pack="space"] .studio-polish {
          --studio-active-bg: var(--studio-space-bg);
        }
        [data-studio-bg-pack="clean"] .studio-polish {
          --studio-active-bg: none;
        }
        [data-studio-bg-pack="worlds"] .studio-polish,
        [data-studio-bg-pack="space"] .studio-polish {
          --studio-glow-soft: transparent;
          --studio-glow-mid: transparent;
          --studio-surface-hover: color-mix(in srgb, var(--mos-text-bright) 4%, var(--color-cursor-hover));
          --studio-card-border: var(--studio-shell-border);
          --studio-focus-ring: 0 0 0 3px color-mix(in srgb, var(--mos-text-bright) 10%, transparent);
        }
        [data-theme="agent"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-agent-genesis-4k.webp");
          --studio-space-bg: url("/studio-space-agent-genesis-4k.webp");
        }
        [data-theme="gold"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-gold-archive-4k.webp");
          --studio-space-bg: url("/studio-bg-gold-solstice-4k.webp");
        }
        [data-theme="ocean"] .studio-polish {
          --studio-scene-bg: url("/studio-empty-space-4k.webp");
          --studio-space-bg: url("/studio-empty-space-4k.webp");
        }
        [data-theme="ember"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-ember-forge-4k.webp");
          --studio-space-bg: url("/studio-bg-ember-forge-4k.webp");
        }
        [data-theme="mint"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-mint-meadow-4k.webp");
          --studio-space-bg: url("/studio-space-mint-meadow-4k.webp");
        }
        [data-theme="violet"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-violet-dusk-4k.webp");
          --studio-space-bg: url("/studio-bg-violet-nebula-4k.webp");
        }
        [data-theme="rose"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-rose-bloom-4k.webp");
          --studio-space-bg: url("/studio-space-rose-bloom-4k.webp");
        }
        [data-theme="cobalt"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-cobalt-skyline-4k.webp");
          --studio-space-bg: url("/studio-space-cobalt-skyline-4k.webp");
        }
        [data-theme="coral"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-coral-reef-4k.webp");
          --studio-space-bg: url("/studio-space-coral-reef-4k.webp");
        }
        [data-theme="sage"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-sage-grove-4k.webp");
          --studio-space-bg: url("/studio-space-sage-grove-4k.webp");
        }
        [data-theme="cherry"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-cherry-pulse-4k.webp");
          --studio-space-bg: url("/studio-space-cherry-pulse-4k.webp");
        }
        [data-theme="teal"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-teal-lagoon-4k.webp");
          --studio-space-bg: url("/studio-space-teal-lagoon-4k.webp");
        }
        [data-theme="lime"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-lime-canopy-4k.webp");
          --studio-space-bg: url("/studio-space-lime-canopy-4k.webp");
        }
        [data-theme="fuchsia"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-fuchsia-neon-4k.webp");
          --studio-space-bg: url("/studio-space-fuchsia-neon-4k.webp");
        }
        [data-theme="copper"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-copper-foundry-4k.webp");
          --studio-space-bg: url("/studio-space-copper-foundry-4k.webp");
        }
        [data-theme="indigo"] .studio-polish {
          --studio-scene-bg: url("/studio-scene-indigo-midnight-4k.webp");
          --studio-space-bg: url("/studio-space-indigo-midnight-4k.webp");
        }
        .studio-polish.is-custom-cursor {
          --studio-cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2222%22%20height%3D%2222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.6%204.55%2019.9%2014.62l-5.92.68-3.04%205.42L5.6%204.55Z%22%20fill%3D%22%2303030a%22%20opacity%3D%22.34%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22%2322c55e%22%20fill-opacity%3D%22.82%22%20stroke%3D%22%2315111f%22%20stroke-width%3D%222.05%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M8.55%2017.4%209.94%2021.1l2.98-5.05%205.75-.66-4.6-1.82Z%22%20fill%3D%22%23064e3b%22%20opacity%3D%22.26%22%2F%3E%3Cpath%20d%3D%22M6.85%206.4%2015.72%2012.74l-4.32.5-2.1%203.72L6.85%206.4Z%22%20fill%3D%22none%22%20stroke%3D%22%23dcffe8%22%20stroke-opacity%3D%22.55%22%20stroke-width%3D%22.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22none%22%20stroke%3D%22%23dcffe8%22%20stroke-opacity%3D%22.45%22%20stroke-width%3D%22.72%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-active: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2222%22%20height%3D%2222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.6%204.55%2019.9%2014.62l-5.92.68-3.04%205.42L5.6%204.55Z%22%20fill%3D%22%2303030a%22%20opacity%3D%22.34%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22%2322c55e%22%20fill-opacity%3D%22.96%22%20stroke%3D%22%2315111f%22%20stroke-width%3D%222.05%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M8.55%2017.4%209.94%2021.1l2.98-5.05%205.75-.66-4.6-1.82Z%22%20fill%3D%22%23064e3b%22%20opacity%3D%22.26%22%2F%3E%3Cpath%20d%3D%22M6.85%206.4%2015.72%2012.74l-4.32.5-2.1%203.72L6.85%206.4Z%22%20fill%3D%22none%22%20stroke%3D%22%23dcffe8%22%20stroke-opacity%3D%22.55%22%20stroke-width%3D%22.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22none%22%20stroke%3D%22%23dcffe8%22%20stroke-opacity%3D%22.45%22%20stroke-width%3D%22.72%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-text: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2218%22%20height%3D%2224%22%20viewBox%3D%220%200%2018%2024%22%3E%3Cpath%20d%3D%22M9%203.2v17.6%22%20stroke%3D%22%2322c55e%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22butt%22%2F%3E%3C%2Fsvg%3E") 9 12, text;
          cursor: var(--studio-cursor-default), auto !important;
        }
        .studio-polish.is-custom-cursor * {
          cursor: inherit !important;
        }
        .studio-polish.is-custom-cursor :where(input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .cursor-code-input, .studio-composer-inputline, .cursor-composer-textarea, .cursor-composer-mention-editor, .cursor-html-source-pane) {
          cursor: var(--studio-cursor-text, text) !important;
          caret-color: var(--cursor-accent);
        }
        .studio-polish.is-custom-cursor :where(button, a, [role="button"], .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .cursor-unified-tab, .studio-inline-tag, .cursor-tab-close):is(:hover, :active) {
          cursor: var(--studio-cursor-active), pointer !important;
        }
        [data-theme="gold"] .studio-polish.is-custom-cursor {
          --studio-cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2222%22%20height%3D%2222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.6%204.55%2019.9%2014.62l-5.92.68-3.04%205.42L5.6%204.55Z%22%20fill%3D%22%2303030a%22%20opacity%3D%22.34%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22%23c4a574%22%20fill-opacity%3D%22.82%22%20stroke%3D%22%2315111f%22%20stroke-width%3D%222.05%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M8.55%2017.4%209.94%2021.1l2.98-5.05%205.75-.66-4.6-1.82Z%22%20fill%3D%22%235f4316%22%20opacity%3D%22.26%22%2F%3E%3Cpath%20d%3D%22M6.85%206.4%2015.72%2012.74l-4.32.5-2.1%203.72L6.85%206.4Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff3cf%22%20stroke-opacity%3D%22.55%22%20stroke-width%3D%22.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff3cf%22%20stroke-opacity%3D%22.45%22%20stroke-width%3D%22.72%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-active: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2222%22%20height%3D%2222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.6%204.55%2019.9%2014.62l-5.92.68-3.04%205.42L5.6%204.55Z%22%20fill%3D%22%2303030a%22%20opacity%3D%22.34%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22%23c4a574%22%20fill-opacity%3D%22.96%22%20stroke%3D%22%2315111f%22%20stroke-width%3D%222.05%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M8.55%2017.4%209.94%2021.1l2.98-5.05%205.75-.66-4.6-1.82Z%22%20fill%3D%22%235f4316%22%20opacity%3D%22.26%22%2F%3E%3Cpath%20d%3D%22M6.85%206.4%2015.72%2012.74l-4.32.5-2.1%203.72L6.85%206.4Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff3cf%22%20stroke-opacity%3D%22.55%22%20stroke-width%3D%22.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff3cf%22%20stroke-opacity%3D%22.45%22%20stroke-width%3D%22.72%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
        }
        [data-theme="copper"] .studio-polish.is-custom-cursor,
        [data-theme="ember"] .studio-polish.is-custom-cursor {
          --studio-cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2222%22%20height%3D%2222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.6%204.55%2019.9%2014.62l-5.92.68-3.04%205.42L5.6%204.55Z%22%20fill%3D%22%2303030a%22%20opacity%3D%22.34%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22%23d97706%22%20fill-opacity%3D%22.82%22%20stroke%3D%22%2315111f%22%20stroke-width%3D%222.05%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M8.55%2017.4%209.94%2021.1l2.98-5.05%205.75-.66-4.6-1.82Z%22%20fill%3D%22%237c2d12%22%20opacity%3D%22.26%22%2F%3E%3Cpath%20d%3D%22M6.85%206.4%2015.72%2012.74l-4.32.5-2.1%203.72L6.85%206.4Z%22%20fill%3D%22none%22%20stroke%3D%22%23ffe0b5%22%20stroke-opacity%3D%22.55%22%20stroke-width%3D%22.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22none%22%20stroke%3D%22%23ffe0b5%22%20stroke-opacity%3D%22.45%22%20stroke-width%3D%22.72%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-active: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2222%22%20height%3D%2222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.6%204.55%2019.9%2014.62l-5.92.68-3.04%205.42L5.6%204.55Z%22%20fill%3D%22%2303030a%22%20opacity%3D%22.34%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22%23d97706%22%20fill-opacity%3D%22.96%22%20stroke%3D%22%2315111f%22%20stroke-width%3D%222.05%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M8.55%2017.4%209.94%2021.1l2.98-5.05%205.75-.66-4.6-1.82Z%22%20fill%3D%22%237c2d12%22%20opacity%3D%22.26%22%2F%3E%3Cpath%20d%3D%22M6.85%206.4%2015.72%2012.74l-4.32.5-2.1%203.72L6.85%206.4Z%22%20fill%3D%22none%22%20stroke%3D%22%23ffe0b5%22%20stroke-opacity%3D%22.55%22%20stroke-width%3D%22.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M4.65%203.55%2019.1%2013.76c.68.48.4%201.54-.43%201.63l-5.75.66-2.95%205.28c-.42.74-1.53.52-1.64-.31L4.65%203.55Z%22%20fill%3D%22none%22%20stroke%3D%22%23ffe0b5%22%20stroke-opacity%3D%22.45%22%20stroke-width%3D%22.72%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
        }
        .studio-polish.is-custom-cursor {
          --studio-cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.35%203.9%2018.25%2013.15c.58.42.34%201.33-.37%201.43l-4.7.64-2.18%204.54c-.34.7-1.39.54-1.5-.23L5.35%203.9Z%22%20fill%3D%22%2311131a%22%20stroke%3D%22%2322c55e%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.1%206.8%2015.55%2012.82l-3.72.5-1.72%203.56L7.1%206.8Z%22%20fill%3D%22none%22%20stroke%3D%22%23f8fafc%22%20stroke-opacity%3D%22.42%22%20stroke-width%3D%22.85%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-active: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.35%203.9%2018.25%2013.15c.58.42.34%201.33-.37%201.43l-4.7.64-2.18%204.54c-.34.7-1.39.54-1.5-.23L5.35%203.9Z%22%20fill%3D%22%2322c55e%22%20stroke%3D%22%230b0c10%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.1%206.8%2015.55%2012.82l-3.72.5-1.72%203.56L7.1%206.8Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff8ea%22%20stroke-opacity%3D%22.58%22%20stroke-width%3D%22.85%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
        }
        [data-theme="gold"] .studio-polish.is-custom-cursor {
          --studio-cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.35%203.9%2018.25%2013.15c.58.42.34%201.33-.37%201.43l-4.7.64-2.18%204.54c-.34.7-1.39.54-1.5-.23L5.35%203.9Z%22%20fill%3D%22%2311131a%22%20stroke%3D%22%23c4a574%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.1%206.8%2015.55%2012.82l-3.72.5-1.72%203.56L7.1%206.8Z%22%20fill%3D%22none%22%20stroke%3D%22%23f8fafc%22%20stroke-opacity%3D%22.42%22%20stroke-width%3D%22.85%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-active: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.35%203.9%2018.25%2013.15c.58.42.34%201.33-.37%201.43l-4.7.64-2.18%204.54c-.34.7-1.39.54-1.5-.23L5.35%203.9Z%22%20fill%3D%22%23c4a574%22%20stroke%3D%22%230b0c10%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.1%206.8%2015.55%2012.82l-3.72.5-1.72%203.56L7.1%206.8Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff8ea%22%20stroke-opacity%3D%22.58%22%20stroke-width%3D%22.85%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
        }
        [data-theme="copper"] .studio-polish.is-custom-cursor,
        [data-theme="ember"] .studio-polish.is-custom-cursor {
          --studio-cursor-default: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.35%203.9%2018.25%2013.15c.58.42.34%201.33-.37%201.43l-4.7.64-2.18%204.54c-.34.7-1.39.54-1.5-.23L5.35%203.9Z%22%20fill%3D%22%2311131a%22%20stroke%3D%22%23d97706%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.1%206.8%2015.55%2012.82l-3.72.5-1.72%203.56L7.1%206.8Z%22%20fill%3D%22none%22%20stroke%3D%22%23f8fafc%22%20stroke-opacity%3D%22.42%22%20stroke-width%3D%22.85%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
          --studio-cursor-active: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22M5.35%203.9%2018.25%2013.15c.58.42.34%201.33-.37%201.43l-4.7.64-2.18%204.54c-.34.7-1.39.54-1.5-.23L5.35%203.9Z%22%20fill%3D%22%23d97706%22%20stroke%3D%22%230b0c10%22%20stroke-width%3D%221.9%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.1%206.8%2015.55%2012.82l-3.72.5-1.72%203.56L7.1%206.8Z%22%20fill%3D%22none%22%20stroke%3D%22%23fff8ea%22%20stroke-opacity%3D%22.58%22%20stroke-width%3D%22.85%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E") 4 3;
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
        .studio-polish > :not(style) {
          position: relative;
          z-index: 1;
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
        .studio-polish aside {
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--mos-sidebar) 98%, var(--mos-bg) 2%), var(--mos-sidebar)) !important;
        }
        .studio-polish :where(.border-cursor-border-soft) {
          border-color: color-mix(in srgb, var(--color-cursor-border-soft) 34%, transparent) !important;
        }
        @keyframes studio-ambient-drift {
          from { transform: translate3d(0, 0, 0) scale(0.96); }
          to { transform: translate3d(-18px, 12px, 0) scale(1.05); }
        }
        .studio-polish :where(button, [role="button"], .cursor-tab, .cursor-agent-chat-tab, .cursor-unified-tab, .cursor-tab-close, .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .desk-file-breadcrumbs-chip, .theme-chip, .cursor-composer-box, .studio-credit-pill) {
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            background-color var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease),
            filter var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring),
            opacity var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish :where(button, [role="button"], .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .desk-file-breadcrumbs-chip) {
          -webkit-tap-highlight-color: transparent;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn) {
          position: relative;
        }
        .studio-polish :where(button, [role="button"], .cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .desk-file-breadcrumbs-chip):focus-visible {
          outline: 2px solid color-mix(in srgb, var(--cursor-accent) 42%, transparent);
          outline-offset: 2px;
          box-shadow: var(--studio-focus-ring);
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn):hover:not(:disabled) {
          box-shadow: 0 0 18px var(--studio-glow-soft);
          transform: scale(var(--studio-hover-scale));
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn):active:not(:disabled),
        .studio-polish :where(.cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item, .desk-file-breadcrumbs-chip):active {
          transform: scale(var(--studio-press-scale));
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn)::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          border: 1px solid transparent;
          opacity: 0;
          transform: scale(0.86);
          transition: opacity 220ms ease, transform 240ms var(--studio-motion-spring), border-color 220ms ease;
          pointer-events: none;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn):active::after {
          opacity: 1;
          transform: scale(1.08);
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, transparent);
        }
        .studio-polish .cursor-panel-head {
          border-bottom: 0 !important;
          backdrop-filter: none;
          background: color-mix(in srgb, var(--mos-surface) 78%, var(--mos-bg) 22%) !important;
          box-shadow: none !important;
        }
        .studio-polish .cursor-sidebar-brand-logo-img {
          filter: drop-shadow(0 0 8px var(--studio-glow-soft));
        }
        .studio-polish .cursor-sidebar-brand-logo {
          width: 24px;
          height: 24px;
        }
        .studio-polish .cursor-sidebar-brand-logo-img {
          width: 24px;
          height: 24px;
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
          overflow: hidden;
          background: var(--mos-bg) !important;
        }
        .studio-polish main.studio-composer-bg {
          background: var(--mos-bg) !important;
        }
        .studio-polish main::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0;
          background:
            radial-gradient(ellipse at center, transparent 28%, color-mix(in srgb, #000 22%, transparent) 68%, color-mix(in srgb, #000 48%, transparent) 100%),
            var(--studio-loaded-bg) center / cover no-repeat;
          transition: opacity 180ms ease;
        }
        .studio-polish.is-studio-bg-ready main.studio-composer-bg::before {
          opacity: 1;
        }
        .studio-polish main.studio-composer-bg::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          height: min(58vh, 460px);
          pointer-events: none;
          background: linear-gradient(
            180deg,
            transparent 0%,
            color-mix(in srgb, var(--mos-bg) 34%, transparent) 28%,
            color-mix(in srgb, var(--mos-bg) 82%, transparent) 66%,
            var(--mos-bg) 100%
          );
        }
        .studio-polish main > :not(style) {
          position: relative;
          z-index: 1;
        }
        .studio-polish :where(.cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item) {
          position: relative;
          overflow: hidden;
        }
        .studio-polish :where(.cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item)::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          opacity: 0;
          background:
            radial-gradient(
              circle at var(--mos-pointer-x, 50%) var(--mos-pointer-y, 50%),
              color-mix(in srgb, var(--cursor-accent) 13%, transparent),
              transparent 46%
            ),
            linear-gradient(90deg, color-mix(in srgb, var(--mos-text-bright) 4%, transparent), transparent 58%);
          transition: opacity var(--studio-motion-fast) var(--studio-motion-ease);
        }
        .studio-polish .cursor-tree-row:hover,
        .studio-polish .desk-file-list-row:hover,
        .studio-polish .desk-file-grid-item:hover,
        .studio-polish .desk-file-preview-item:hover {
          background: var(--studio-surface-hover);
          border-color: color-mix(in srgb, var(--cursor-accent) 22%, var(--studio-shell-border));
          box-shadow:
            0 1px 0 color-mix(in srgb, var(--mos-text-bright) 7%, transparent) inset,
            0 10px 28px color-mix(in srgb, var(--cursor-accent) 10%, rgba(2, 6, 23, 0.24));
          transform: scale(var(--studio-hover-scale));
        }
        .studio-polish :where(.cursor-tree-row, .desk-file-list-row, .desk-file-grid-item, .desk-file-preview-item):hover::after {
          opacity: 1;
        }
        .studio-polish .cursor-tree-row[aria-selected="true"],
        .studio-polish .desk-file-list-row[aria-selected="true"],
        .studio-polish .desk-file-grid-item[aria-selected="true"],
        .studio-polish .desk-file-preview-item[aria-selected="true"],
        .studio-polish .cursor-tree-row.is-selected,
        .studio-polish .desk-file-list-row.is-selected,
        .studio-polish .desk-file-grid-item.is-selected,
        .studio-polish .desk-file-preview-item.is-selected {
          background: color-mix(in srgb, var(--cursor-accent) 10%, var(--color-cursor-hover));
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 28%, transparent),
            0 0 16px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-polish .desk-file-breadcrumbs-chip:hover {
          background: var(--cursor-overlay-subtle);
          box-shadow: 0 0 12px var(--studio-glow-soft);
        }
        .studio-polish .cursor-workspace-head {
          padding: 0 !important;
          gap: 0;
          align-items: center;
        }
        .studio-polish .cursor-workspace-head::after {
          content: none !important;
        }
        .studio-polish .cursor-unified-tabs {
          align-items: center;
          gap: 4px;
          padding: 0 0 0 12px;
        }
        .studio-polish .cursor-unified-tab {
          height: 30px !important;
          width: min(152px, var(--cursor-unified-tab-width, 168px));
          min-width: min(152px, var(--cursor-unified-tab-width, 168px));
          max-width: min(152px, var(--cursor-unified-tab-width, 168px));
          border: 1px solid color-mix(in srgb, var(--mos-text-bright) 4%, transparent) !important;
          border-left-width: 0 !important;
          border-radius: 0 11px 11px 0 !important;
          background:
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 68%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 42%, var(--mos-bg))
            ) !important;
          padding: 0 2px !important;
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent),
            0 1px 0 color-mix(in srgb, #000 12%, transparent) !important;
          overflow: hidden;
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
          border-radius: inherit;
          pointer-events: none;
          opacity: 0;
          transition:
            opacity var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-med) var(--studio-motion-spring),
            background-color var(--studio-motion-fast) var(--studio-motion-ease);
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
        }
        .studio-polish .cursor-unified-tab-placeholder {
          width: min(152px, var(--cursor-unified-tab-width, 168px));
          min-width: min(152px, var(--cursor-unified-tab-width, 168px));
          max-width: min(152px, var(--cursor-unified-tab-width, 168px));
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
        .studio-polish :where(.cursor-tab, .cursor-agent-chat-tab, .cursor-unified-tab):hover {
          border-color: color-mix(in srgb, var(--mos-text-bright) 6%, transparent) !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 46%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 78%, var(--mos-bg)),
              color-mix(in srgb, var(--mos-surface) 50%, var(--mos-bg))
            ) !important;
        }
        .studio-polish :where(.cursor-tab.active, .cursor-agent-chat-tab.active, .cursor-tab.is-active, .cursor-agent-chat-tab.is-active, .cursor-unified-tab.is-active) {
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
        .studio-polish .cursor-unified-tab.is-active::before {
          opacity: 0;
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
        .studio-polish .cursor-unified-tab:nth-child(1) { z-index: 40 !important; }
        .studio-polish .cursor-unified-tab:nth-child(2) { z-index: 39 !important; }
        .studio-polish .cursor-unified-tab:nth-child(3) { z-index: 38 !important; }
        .studio-polish .cursor-unified-tab:nth-child(4) { z-index: 37 !important; }
        .studio-polish .cursor-unified-tab:nth-child(5) { z-index: 36 !important; }
        .studio-polish .cursor-unified-tab:nth-child(6) { z-index: 35 !important; }
        .studio-polish .cursor-unified-tab:nth-child(7) { z-index: 34 !important; }
        .studio-polish .cursor-unified-tab:nth-child(8) { z-index: 33 !important; }
        .studio-polish .cursor-unified-tab:not(.cursor-unified-tab-new) {
          z-index: var(--tab-stack, 1) !important;
        }
        .studio-polish .cursor-unified-tab.cursor-unified-tab-new {
          width: 30px;
          min-width: 30px;
          max-width: 30px;
          height: 30px;
          border-radius: 999px !important;
          justify-content: center;
          margin-left: 4px;
          padding: 0;
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
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 24%, transparent) inset,
            0 10px 22px color-mix(in srgb, #000 28%, transparent),
            0 0 20px color-mix(in srgb, var(--cursor-accent) 20%, transparent);
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
          box-shadow: -12px 0 30px color-mix(in srgb, #000 18%, transparent) !important;
        }
        [data-appearance="light"] .studio-polish .cursor-settings-backdrop {
          background: color-mix(in srgb, #000 12%, transparent) !important;
        }
        [data-appearance="light"] .studio-polish .cursor-settings-panel {
          box-shadow: -10px 0 24px color-mix(in srgb, #000 10%, transparent) !important;
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
          min-height: 28px;
          align-items: center;
          gap: 6px;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid var(--color-cursor-border);
          background: var(--color-cursor-panel);
          padding: 4px 9px;
          color: var(--color-cursor-muted);
          font-size: 11px;
          font-weight: 650;
          font-family: inherit;
          cursor: pointer;
        }
        .studio-settings-pill:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border));
          color: var(--color-cursor-text);
          box-shadow: 0 0 14px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
        }
        .studio-settings-floating-overlay {
          position: fixed;
          inset: 0;
          z-index: 360;
          display: flex;
          justify-content: flex-end;
          padding: 0;
          pointer-events: auto;
        }
        .studio-settings-floating-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: color-mix(in srgb, #000 34%, transparent);
          cursor: pointer;
        }
        .studio-settings-floating-panel {
          position: relative;
          z-index: 1;
          display: flex;
          width: min(380px, 100vw);
          height: 100vh;
          align-self: stretch;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 14%, var(--color-cursor-border));
          border-width: 0 0 0 1px;
          border-radius: 0;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-panel) 94%, var(--mos-bg));
          box-shadow:
            0 24px 70px color-mix(in srgb, #000 46%, transparent),
            0 0 34px var(--studio-glow-soft);
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
          border-bottom: 1px solid var(--color-cursor-border);
          padding: 6px 8px;
        }
        .studio-settings-workspace-head h2 {
          margin: 0;
          color: var(--color-cursor-text-bright);
          font-size: 24px;
          font-weight: 720;
        }
        .studio-settings-horizontal-menu {
          display: flex;
          gap: 4px;
          overflow-x: auto;
        }
        .studio-settings-horizontal-menu button {
          flex: 0 0 auto;
          border: 1px solid var(--color-cursor-border-soft);
          border-radius: var(--cursor-radius-sm);
          background: color-mix(in srgb, var(--mos-surface) 64%, transparent);
          padding: 5px 8px;
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
          padding: 8px 10px;
          display: grid;
          gap: 10px;
          align-content: start;
          width: 100%;
        }
        .studio-settings-stack {
          display: grid;
          gap: 10px;
        }
        .studio-settings-simple-card {
          padding: 10px !important;
        }
        .studio-settings-workspace .cursor-settings-section {
          border: 0;
          border-radius: 0;
          background: transparent;
          padding: 0 !important;
        }
        .studio-settings-billing-panel {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          padding: 0 !important;
        }
        .studio-settings-balance-block {
          display: grid;
          align-content: center;
          gap: 5px;
          min-height: 88px;
          border-radius: 10px;
          background:
            radial-gradient(circle at 24% 12%, color-mix(in srgb, var(--cursor-accent) 18%, transparent), transparent 48%),
            color-mix(in srgb, var(--mos-bg) 42%, transparent);
          padding: 12px;
        }
        .studio-settings-balance-block span,
        .studio-settings-balance-block small {
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-balance-block strong {
          color: var(--color-cursor-text-bright);
          font-size: 28px;
          line-height: 1;
        }
        .studio-settings-rows {
          display: grid;
        }
        .studio-settings-row {
          display: flex;
          min-height: 36px;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 72%, transparent);
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-card-title {
          margin: 0 0 8px;
          color: var(--color-cursor-text-bright);
          font-size: 12px;
          font-weight: 750;
        }
        .studio-settings-invoice-list {
          display: grid;
          gap: 2px;
        }
        .studio-settings-invoice-row {
          display: flex;
          min-height: 42px;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 70%, transparent);
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-invoice-row:last-child {
          border-bottom: 0;
        }
        .studio-settings-invoice-row div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .studio-settings-invoice-row strong,
        .studio-settings-invoice-row a,
        .studio-settings-invoice-row > span {
          color: var(--color-cursor-text-bright);
          font-weight: 700;
          text-decoration: none;
        }
        .studio-settings-invoice-row a[aria-disabled="true"] {
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
        .studio-settings-row:last-child {
          border-bottom: 0;
        }
        .studio-settings-row strong {
          color: var(--color-cursor-text-bright);
          font-size: 13px;
          font-weight: 650;
          text-align: right;
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
          margin: 0 0 8px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-settings-payment-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
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
        .studio-settings-bank-list,
        .studio-settings-feed {
          display: grid;
          gap: 6px;
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
          font-weight: 700;
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
          .studio-settings-billing-panel,
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
        }
        .studio-polish .cursor-settings-action:hover,
        .studio-polish .theme-chip:hover {
          box-shadow: 0 0 18px var(--studio-glow-soft);
        }
        .studio-polish .cursor-composer-box:focus-within {
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, rgba(255, 255, 255, 0.15));
          background: transparent !important;
          backdrop-filter: blur(58px) saturate(1.35) brightness(1.12);
          -webkit-backdrop-filter: blur(58px) saturate(1.35) brightness(1.12);
          box-shadow:
            0 24px 64px color-mix(in srgb, #000 42%, transparent),
            0 0 36px color-mix(in srgb, var(--cursor-accent) 16%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 7%, transparent),
            inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
          transition:
            background-color 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            background 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            border-color 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            box-shadow 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            backdrop-filter 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            -webkit-backdrop-filter 1000ms cubic-bezier(0.45, 0, 0.2, 1);
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
          border-color: color-mix(in srgb, var(--cursor-accent) 62%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 28%, transparent), transparent 70%),
            color-mix(in srgb, var(--cursor-accent) 20%, var(--color-cursor-hover));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--color-cursor-text-bright) 14%, transparent),
            0 0 16px color-mix(in srgb, var(--cursor-accent) 22%, transparent);
        }
        .studio-polish .cursor-resize {
          transition: background var(--studio-motion-fast) var(--studio-motion-ease), box-shadow var(--studio-motion-med) var(--studio-motion-ease);
        }
        .studio-polish .cursor-resize:hover {
          background: color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          box-shadow: 0 0 18px var(--studio-glow-soft);
        }
        .studio-polish .desk-file-list-head {
          display: none;
        }
        .studio-polish .desk-file-list {
          padding: 4px 4px 8px;
        }
        .studio-polish .cursor-file-grid {
          padding: 6px 6px 10px;
          grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
          grid-auto-rows: auto;
        }
        .studio-polish .desk-file-preview-grid {
          padding: 6px 6px 12px;
        }
        .studio-polish .desk-file-list-row {
          min-height: 30px;
          border-color: transparent !important;
          border-radius: 8px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--mos-surface) 14%, transparent), transparent);
          box-shadow: none;
        }
        .studio-polish .desk-file-list-row:hover {
          border-color: transparent !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--mos-text-bright) 4%, transparent), transparent 46%),
            color-mix(in srgb, var(--mos-text-bright) 3%, var(--color-cursor-hover));
          box-shadow: 0 4px 10px color-mix(in srgb, #000 10%, transparent);
        }
        .studio-polish .desk-file-list-row.is-parent-row,
        .studio-polish .cursor-file-grid .desk-file-grid-back-row {
          min-height: 30px;
          justify-content: flex-start;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-border-soft)) !important;
          border-radius: 10px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 8%, var(--mos-surface)), color-mix(in srgb, var(--mos-surface) 38%, transparent));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 7%, transparent),
            0 4px 12px color-mix(in srgb, #000 12%, transparent);
        }
        .studio-polish .cursor-file-grid .desk-file-grid-back-row {
          grid-column: 1 / -1;
          width: 100%;
          justify-self: stretch;
        }
        .studio-polish .desk-file-list-row.is-parent-row:hover,
        .studio-polish .cursor-file-grid .desk-file-grid-back-row:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border)) !important;
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--cursor-accent) 14%, transparent), transparent 42%),
            color-mix(in srgb, var(--cursor-accent) 8%, var(--color-cursor-hover));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 10%, transparent),
            0 8px 18px color-mix(in srgb, #000 18%, transparent),
            0 0 14px color-mix(in srgb, var(--cursor-accent) 12%, transparent);
        }
        .studio-polish .cursor-file-grid,
        .studio-polish .desk-file-preview-grid {
          gap: 10px;
          align-content: start;
        }
        .studio-polish .desk-file-grid-item,
        .studio-polish .desk-file-preview-item {
          min-height: 0;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft)) !important;
          border-radius: 14px;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 9%, transparent), transparent 45%),
            linear-gradient(180deg, color-mix(in srgb, var(--mos-surface) 54%, var(--mos-bg)), color-mix(in srgb, var(--mos-surface) 34%, var(--mos-bg)));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 8%, transparent),
            0 8px 22px color-mix(in srgb, #000 18%, transparent),
            0 0 0 1px color-mix(in srgb, var(--mos-text-bright) 3%, transparent);
          overflow: hidden;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-visual {
          flex: 0 0 auto;
          aspect-ratio: 1 / 1;
          height: auto;
          width: calc(100% - 10px);
          margin: 5px auto 0;
          border-radius: 10px;
        }
        .studio-polish .desk-file-grid-item .desk-file-thumb-label,
        .studio-polish .desk-file-preview-item .desk-file-thumb-label {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          max-height: 24px;
          padding: 3px 7px;
          border-top: 1px solid color-mix(in srgb, var(--cursor-accent) 18%, var(--color-cursor-border-soft));
          border-bottom: 1px solid color-mix(in srgb, #000 22%, transparent);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--mos-panel) 86%, var(--mos-bg)), color-mix(in srgb, var(--mos-bg) 82%, #000 18%));
          color: var(--color-cursor-text-bright);
          font-weight: 650;
          line-height: 1.15;
          text-shadow: 0 1px 0 color-mix(in srgb, #000 36%, transparent);
        }
        .studio-polish .desk-file-grid-item:hover,
        .studio-polish .desk-file-preview-item:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-border)) !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 16%, transparent), transparent 46%),
            linear-gradient(180deg, color-mix(in srgb, var(--mos-surface) 66%, var(--cursor-accent) 8%), color-mix(in srgb, var(--mos-surface) 42%, var(--mos-bg)));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 10%, transparent),
            0 12px 26px color-mix(in srgb, #000 24%, transparent),
            0 0 18px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-polish .desk-file-grid-item:hover .desk-file-thumb-label,
        .studio-polish .desk-file-preview-item:hover .desk-file-thumb-label {
          border-top-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 10%, var(--mos-panel)), color-mix(in srgb, var(--mos-bg) 78%, #000 22%));
        }
        .studio-polish .desk-file-grid-item[aria-selected="true"],
        .studio-polish .desk-file-preview-item[aria-selected="true"],
        .studio-polish .desk-file-list-row[aria-selected="true"],
        .studio-polish .desk-file-grid-item.is-selected,
        .studio-polish .desk-file-preview-item.is-selected,
        .studio-polish .desk-file-list-row.is-selected {
          border-color: color-mix(in srgb, var(--cursor-accent) 58%, var(--color-cursor-border)) !important;
          background:
            radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--cursor-accent) 20%, transparent), transparent 48%),
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 15%, var(--mos-surface)), color-mix(in srgb, var(--mos-surface) 42%, var(--mos-bg)));
          box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 36%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 10%, transparent),
            0 0 22px color-mix(in srgb, var(--cursor-accent) 20%, transparent);
        }
        .studio-polish .desk-file-search-divider {
          display: flex;
          align-items: center;
          min-height: 26px;
          padding-top: 6px;
          padding-bottom: 4px;
        }
        .studio-polish .cursor-file-grid .desk-file-search-divider,
        .studio-polish .desk-file-preview-grid .desk-file-search-divider {
          grid-column: 1 / -1;
          height: auto;
          min-height: 28px;
        }
        .studio-polish .cursor-chat-empty.thread-empty.cursor-chat-empty-logo-only {
          min-height: 100%;
          height: 100%;
          justify-content: center;
          padding-bottom: 116px;
        }
        .studio-folder-pathbar {
          display: flex;
          align-items: center;
          gap: 4px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 38%, transparent);
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
        .cursor-composer-box.is-drop-target {
          border-style: dashed !important;
          border-color: color-mix(in srgb, var(--cursor-accent) 72%, var(--cursor-border-subtle)) !important;
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 42%, transparent) inset,
            0 0 24px color-mix(in srgb, var(--cursor-accent) 24%, transparent) !important;
        }
        .cursor-attach-tile-open {
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring) !important;
        }
        .cursor-attach-tile-open:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border)) !important;
          box-shadow: 0 0 18px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-composer .cursor-composer {
          display: flex;
          width: 100%;
          max-width: min(700px, calc(100% - 24px));
          margin: 0 auto;
          padding: 2px 10px max(8px, env(safe-area-inset-bottom, 8px));
          background: transparent !important;
        }
        .studio-composer-row {
          position: relative;
          isolation: auto;
          display: flex;
          align-items: flex-end;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }
        .studio-composer .cursor-composer-box {
          /* Backdrop blur needs the image on main behind this overlay; avoid opacity/transform/will-change wrappers here. */
          position: relative;
          overflow: hidden;
          display: flex;
          align-self: stretch;
          min-height: 96px;
          flex: 1 1 auto;
          flex-direction: column;
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          background: transparent !important;
          backdrop-filter: blur(48px) saturate(1.28) brightness(1.1);
          -webkit-backdrop-filter: blur(48px) saturate(1.28) brightness(1.1);
          box-shadow:
            0 24px 68px color-mix(in srgb, #000 38%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 7%, transparent),
            inset 0 0 0 1px rgba(255, 255, 255, 0.04);
          transition:
            background-color 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            background 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            border-color 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            box-shadow 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            backdrop-filter 1000ms cubic-bezier(0.45, 0, 0.2, 1),
            -webkit-backdrop-filter 1000ms cubic-bezier(0.45, 0, 0.2, 1);
          padding: 0 !important;
        }
        .studio-composer .cursor-composer-box::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          z-index: 3;
          width: 124px;
          height: 70px;
          border-radius: 17px 0 0 0;
          border-top: 2px solid color-mix(in srgb, var(--cursor-accent) 86%, transparent);
          border-left: 2px solid color-mix(in srgb, var(--cursor-accent) 86%, transparent);
          background: transparent;
          mask-image: radial-gradient(ellipse at 0 0, #000 0 10%, rgba(0, 0, 0, 0.58) 22%, rgba(0, 0, 0, 0.12) 34%, transparent 48%);
          -webkit-mask-image: radial-gradient(ellipse at 0 0, #000 0 10%, rgba(0, 0, 0, 0.58) 22%, rgba(0, 0, 0, 0.12) 34%, transparent 48%);
          opacity: 0.78;
          transition:
            width 1000ms var(--studio-composer-focus-line-ease),
            height 1000ms var(--studio-composer-focus-line-ease),
            border-color 1000ms var(--studio-composer-focus-line-ease),
            opacity 1000ms var(--studio-composer-focus-line-ease);
          pointer-events: none;
        }
        .studio-composer .cursor-composer-box:focus-within::before {
          width: 330px;
          height: 150px;
          border-top-color: var(--cursor-accent);
          border-left-color: var(--cursor-accent);
          opacity: 1;
          transition:
            width 1000ms var(--studio-composer-focus-line-ease),
            height 1000ms var(--studio-composer-focus-line-ease),
            border-color 1000ms var(--studio-composer-focus-line-ease),
            opacity 1000ms var(--studio-composer-focus-line-ease);
        }
        .studio-composer .cursor-composer-box::after {
          content: "";
          position: absolute;
          right: 0;
          bottom: 0;
          z-index: 3;
          width: 124px;
          height: 70px;
          border-radius: 0 0 17px 0;
          border-right: 2px solid color-mix(in srgb, var(--cursor-accent) 86%, transparent);
          border-bottom: 2px solid color-mix(in srgb, var(--cursor-accent) 86%, transparent);
          background: transparent;
          mask-image: radial-gradient(ellipse at 100% 100%, #000 0 10%, rgba(0, 0, 0, 0.58) 22%, rgba(0, 0, 0, 0.12) 34%, transparent 48%);
          -webkit-mask-image: radial-gradient(ellipse at 100% 100%, #000 0 10%, rgba(0, 0, 0, 0.58) 22%, rgba(0, 0, 0, 0.12) 34%, transparent 48%);
          opacity: 0.78;
          transition:
            width 1000ms var(--studio-composer-focus-line-ease),
            height 1000ms var(--studio-composer-focus-line-ease),
            border-color 1000ms var(--studio-composer-focus-line-ease),
            opacity 1000ms var(--studio-composer-focus-line-ease);
          pointer-events: none;
        }
        .studio-composer .cursor-composer-box:focus-within::after {
          width: 310px;
          height: 140px;
          border-right-color: var(--cursor-accent);
          border-bottom-color: var(--cursor-accent);
          opacity: 1;
          transition:
            width 1000ms var(--studio-composer-focus-line-ease),
            height 1000ms var(--studio-composer-focus-line-ease),
            border-color 1000ms var(--studio-composer-focus-line-ease),
            opacity 1000ms var(--studio-composer-focus-line-ease);
        }
        .studio-composer .cursor-composer-box > * {
          position: relative;
          z-index: 1;
        }
        .studio-mode-switcher {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-rows: repeat(3, minmax(32px, 1fr));
          gap: 4px;
          flex: 0 0 116px;
          width: 116px;
          min-height: 96px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 12%, var(--color-cursor-border-soft));
          border-radius: 16px;
          background:
            radial-gradient(circle at 22% 0%, color-mix(in srgb, var(--cursor-accent) 13%, transparent), transparent 38%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--mos-surface) 94%, var(--mos-bg) 6%),
              color-mix(in srgb, var(--mos-panel) 88%, var(--mos-bg) 12%)
            );
          box-shadow:
            0 16px 38px color-mix(in srgb, var(--mos-bg) 32%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 5%, transparent);
          padding: 5px;
          backdrop-filter: blur(18px);
        }
        .studio-mode-row {
          display: flex;
          align-items: center;
          gap: 7px;
          width: 100%;
          min-width: 0;
          border: 1px solid transparent;
          border-radius: 11px;
          background: color-mix(in srgb, var(--mos-surface) 72%, transparent);
          padding: 0 9px;
          color: var(--color-cursor-muted);
          font-size: 12px;
          font-weight: 650;
          line-height: 1;
          text-align: left;
          cursor: pointer;
          transition:
            background var(--studio-motion-fast) var(--studio-motion-ease),
            border-color var(--studio-motion-fast) var(--studio-motion-ease),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease),
            color var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-mode-row:hover {
          background: var(--color-cursor-hover);
          color: var(--color-cursor-text);
          transform: scale(var(--studio-hover-scale));
        }
        .studio-mode-row.is-active {
          border-color: color-mix(in srgb, var(--cursor-accent) 30%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 16% 0%, color-mix(in srgb, var(--cursor-accent) 18%, transparent), transparent 48%),
            color-mix(in srgb, var(--cursor-accent-dim) 48%, var(--color-cursor-hover));
          box-shadow:
            0 7px 18px color-mix(in srgb, var(--mos-bg) 28%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent);
          color: var(--color-cursor-text-bright);
          transform: scale(1.008);
        }
        .studio-mode-row svg {
          width: 15px;
          height: 15px;
          flex: 0 0 auto;
          stroke-width: 2.25;
        }
        .studio-mode-row span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-composer .cursor-composer-textarea {
          --studio-composer-line-size: 24px;
          --studio-composer-text-size: 14px;
          --studio-composer-chip-size: 20px;
          --studio-composer-chip-font-size: 11px;
          flex: 1 1 auto;
          align-self: center;
          height: auto;
          min-height: var(--studio-composer-line-size) !important;
          max-height: 100%;
          overflow-y: auto;
          padding: 0 !important;
          font-size: var(--studio-composer-text-size);
          line-height: var(--studio-composer-line-size);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .studio-composer .cursor-composer-mention-editor:empty::before {
          color: color-mix(in srgb, var(--color-cursor-text) 58%, transparent) !important;
          opacity: 0.58;
          line-height: var(--studio-composer-line-size);
        }
        .studio-composer .cursor-composer-box:focus-within .cursor-composer-mention-editor:empty::before {
          color: color-mix(in srgb, var(--color-cursor-text-bright) 66%, transparent) !important;
          opacity: 0.66;
        }
        .studio-composer-inputline {
          position: relative;
          display: flex;
          flex: 1 1 0;
          min-height: 0;
          align-items: center;
          align-content: flex-start;
          gap: 6px;
          flex-wrap: wrap;
          overflow: hidden;
          padding: 10px;
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
          border-radius: 7px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 54%, transparent), color-mix(in srgb, var(--cursor-accent) 34%, transparent)),
            color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-hover));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--color-cursor-text-bright) 12%, transparent),
            0 0 10px color-mix(in srgb, var(--cursor-accent) 18%, transparent);
        }
        .studio-composer .cursor-composer-mention-editor {
          position: relative;
          z-index: 2;
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
          min-height: 20px;
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
          height: var(--studio-composer-chip-size, 20px);
          max-width: min(220px, 48vw);
          align-items: center;
          align-self: center;
          gap: 3px;
          margin: 1px 4px 1px 0;
          vertical-align: middle;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 22%, transparent), transparent 72%),
            color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-hover));
          padding: 0 6px;
          color: var(--color-cursor-text-bright);
          font-size: var(--studio-composer-chip-font-size, 11px);
          line-height: var(--studio-composer-chip-size, 20px);
          white-space: nowrap;
          cursor: grab;
          user-select: none;
          -webkit-user-select: none;
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 14%, transparent),
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 7%, transparent);
        }
        .studio-inline-tag.is-dragging {
          opacity: 0.45;
          cursor: grabbing;
          border-color: color-mix(in srgb, var(--cursor-accent) 72%, var(--color-cursor-border-soft));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 14%, transparent),
            0 0 18px color-mix(in srgb, var(--cursor-accent) 28%, transparent);
        }
        .studio-inline-tag.is-selection-highlighted {
          border-color: color-mix(in srgb, var(--cursor-accent) 78%, var(--color-cursor-border-soft));
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 48%, transparent), transparent 74%),
            color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-hover));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--color-cursor-text-bright) 18%, transparent),
            0 0 12px color-mix(in srgb, var(--cursor-accent) 24%, transparent);
        }
        .studio-inline-tag::selection,
        .studio-inline-tag *::selection {
          background: color-mix(in srgb, var(--cursor-accent) 62%, var(--color-cursor-hover));
          color: var(--color-cursor-text-bright);
          text-shadow: none;
        }
        .studio-inline-tag-label {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          height: auto;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: inherit;
        }
        .studio-inline-tag--preview {
          height: var(--studio-composer-chip-size, 20px);
          padding-left: 2px;
        }
        .studio-inline-tag--image-only {
          width: var(--studio-composer-chip-size, 20px);
          min-width: var(--studio-composer-chip-size, 20px);
          max-width: var(--studio-composer-chip-size, 20px);
          padding: 0;
          border-radius: 999px;
          overflow: hidden;
          gap: 0;
        }
        .studio-inline-tag-media {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          object-fit: cover;
          flex-shrink: 0;
          background: var(--cursor-overlay-subtle);
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 32%, transparent),
            0 1px 3px color-mix(in srgb, #000 38%, transparent);
        }
        .studio-inline-tag-kind {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 11px;
          height: 100%;
          color: color-mix(in srgb, var(--cursor-accent) 74%, var(--color-cursor-text-bright));
          flex-shrink: 0;
          line-height: 1;
        }
        .studio-inline-tag--image-only .studio-inline-tag-kind {
          width: 100%;
          height: 100%;
        }
        .studio-inline-tag--image-only .studio-inline-tag-media {
          width: 100%;
          height: 100%;
          box-shadow: none;
        }
        .studio-inline-tag-kind svg {
          display: block;
          width: 11px;
          height: 11px;
          stroke-width: 2.25;
        }
        .studio-inline-tag-kind--video > svg {
          position: absolute;
          inset: 50% auto auto 50%;
          width: 8px;
          height: 8px;
          transform: translate(-43%, -50%);
          color: white;
          fill: color-mix(in srgb, #000 36%, transparent);
          filter: drop-shadow(0 1px 2px color-mix(in srgb, #000 72%, transparent));
        }
        .studio-chip-preview-card {
          position: fixed;
          z-index: 80;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 32%, var(--color-cursor-border-soft));
          border-radius: 18px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 56%),
            color-mix(in srgb, var(--color-cursor-bg) 72%, #020617);
          box-shadow:
            0 18px 50px color-mix(in srgb, #000 48%, transparent),
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 8%, transparent),
            0 0 26px color-mix(in srgb, var(--cursor-accent) 18%, transparent);
          pointer-events: none;
          transform-origin: bottom center;
          animation: studio-chip-preview-in 120ms ease-out;
          backdrop-filter: blur(18px) saturate(1.14);
          -webkit-backdrop-filter: blur(18px) saturate(1.14);
        }
        .studio-chip-preview-media {
          position: relative;
          height: 104px;
          overflow: hidden;
          background: color-mix(in srgb, var(--cursor-accent) 8%, var(--color-cursor-hover));
        }
        .studio-chip-preview-media img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .studio-chip-preview-play {
          position: absolute;
          inset: 50% auto auto 50%;
          display: inline-grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border-radius: 999px;
          color: white;
          background: color-mix(in srgb, #000 46%, transparent);
          transform: translate(-50%, -50%);
          box-shadow: 0 8px 24px color-mix(in srgb, #000 44%, transparent);
        }
        .studio-chip-preview-label {
          overflow: hidden;
          padding: 7px 9px 8px;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 650;
          line-height: 1.15;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @keyframes studio-chip-preview-in {
          from { opacity: 0; transform: translateY(4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .studio-composer-preview-dock {
          width: min(420px, max(220px, calc(100% - 292px)));
          max-height: min(34vh, 260px);
          display: flex;
          flex-direction: column;
          margin: 0 auto 8px;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 22%, var(--color-cursor-border-soft));
          border-radius: var(--cursor-composer-radius);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--cursor-accent) 6%, transparent), transparent 62%),
            color-mix(in srgb, var(--mos-surface) 88%, var(--mos-bg));
          box-shadow:
            0 10px 34px color-mix(in srgb, #000 28%, transparent),
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 6%, transparent);
          pointer-events: auto;
        }
        .studio-composer-preview-head {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 28px;
          padding: 0 8px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 70%, transparent);
        }
        .studio-composer-preview-title {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          color: var(--color-cursor-text-bright);
          font-size: 11px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .studio-composer-preview-close {
          display: inline-grid;
          width: 20px;
          height: 20px;
          place-items: center;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--color-cursor-muted);
          font-size: 17px;
          line-height: 1;
        }
        .studio-composer-preview-close:hover {
          background: var(--cursor-overlay-hover);
          color: var(--color-cursor-text-bright);
        }
        .studio-composer-preview-body {
          min-height: 0;
          overflow: hidden;
          display: grid;
          place-items: center;
          background: color-mix(in srgb, var(--color-cursor-bg) 82%, transparent);
        }
        .studio-composer-preview-image,
        .studio-composer-preview-video {
          display: block;
          width: 100%;
          max-height: min(29vh, 226px);
          object-fit: contain;
        }
        .studio-composer-preview-fallback {
          padding: 20px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-composer-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: nowrap;
          gap: 8px;
          margin-top: auto;
          padding: 3px 8px 7px;
          min-width: 0;
        }
        .studio-composer-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow: visible;
          scrollbar-width: none;
        }
        .studio-composer-controls::-webkit-scrollbar {
          display: none;
        }
        .studio-composer-inline-settings {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          overflow-x: auto;
          overflow-y: visible;
          scrollbar-width: none;
        }
        .studio-composer-inline-settings::-webkit-scrollbar {
          display: none;
        }
        .studio-inline-setting {
          position: relative;
          flex: 0 0 auto;
        }
        .studio-inline-setting-trigger {
          display: inline-flex;
          min-height: 30px;
          max-width: 156px;
          align-items: center;
          gap: 5px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 84%, transparent);
          border-radius: var(--cursor-radius-pill);
          background: color-mix(in srgb, var(--mos-surface) 56%, transparent);
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
          background: color-mix(in srgb, var(--cursor-accent-dim) 32%, var(--color-cursor-hover));
          box-shadow: inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 6%, transparent);
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
          flex-shrink: 0;
          margin-left: auto;
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
            transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-pill-btn:hover,
        .studio-pill-btn[aria-expanded="true"] {
          background: var(--color-cursor-hover);
          border-color: color-mix(in srgb, var(--cursor-accent) 28%, var(--color-cursor-border-soft));
          box-shadow: 0 0 14px color-mix(in srgb, var(--cursor-accent) 10%, transparent);
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
          backdrop-filter: blur(18px);
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
          backdrop-filter: blur(18px);
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
          width: 30px;
          min-width: 30px;
          height: 30px;
          min-height: 30px;
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
        .cursor-composer-mic {
          width: 30px;
          min-width: 30px;
          border-radius: var(--cursor-radius-pill);
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
          backdrop-filter: blur(18px);
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
          width: min(420px, max(220px, calc(100% - 292px))) !important;
          max-width: min(420px, calc(100vw - 24px)) !important;
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
          z-index: 1;
          display: flex;
          align-self: stretch;
          align-items: flex-end;
          flex: 0 0 118px;
          min-height: 96px;
        }
        .studio-generate-btn {
          display: inline-flex;
          width: 100%;
          min-width: 0;
          min-height: 100%;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 42%, var(--color-cursor-border-soft));
          border-radius: 16px;
          background:
            radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--mos-text-bright) 22%, transparent), transparent 42%),
            linear-gradient(
              180deg,
              color-mix(in srgb, var(--cursor-accent-hover) 86%, var(--mos-text-bright) 14%),
              var(--cursor-accent)
            );
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 28%, transparent),
            inset 0 -12px 20px color-mix(in srgb, var(--mos-bg) 12%, transparent),
            0 16px 36px color-mix(in srgb, var(--cursor-accent) 16%, transparent),
            0 0 22px color-mix(in srgb, var(--cursor-accent) 18%, transparent);
          color: var(--mos-bg);
          cursor: pointer;
          text-align: center;
          transition:
            filter var(--studio-motion-fast) var(--studio-motion-ease),
            transform var(--studio-motion-fast) var(--studio-motion-spring),
            box-shadow var(--studio-motion-med) var(--studio-motion-ease);
        }
        .studio-generate-btn:hover:not(:disabled) {
          filter: brightness(1.04) saturate(1.05);
          transform: scale(var(--studio-hover-scale));
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 34%, transparent),
            inset 0 -12px 20px color-mix(in srgb, var(--mos-bg) 14%, transparent),
            0 0 28px color-mix(in srgb, var(--cursor-accent) 28%, transparent);
        }
        .studio-generate-btn:active:not(:disabled) {
          transform: scale(var(--studio-press-scale));
        }
        .studio-generate-btn:disabled {
          cursor: not-allowed;
          filter: grayscale(0.35) brightness(0.82);
          opacity: 0.62;
        }
        .studio-generate-label {
          font-size: 12px;
          font-weight: 650;
          line-height: 1;
          letter-spacing: -0.01em;
        }
        .studio-generate-cost {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 650;
          line-height: 1;
        }
        .studio-generate-mark {
          width: 11px;
          height: 11px;
          object-fit: contain;
          filter: drop-shadow(0 0 5px color-mix(in srgb, var(--mos-bg) 24%, transparent));
        }
        @media (max-width: 640px) {
          .studio-composer .cursor-composer {
            max-width: 100%;
            padding-inline: 8px;
          }
          .studio-composer-row {
            flex-direction: column;
            gap: 6px;
          }
          .studio-mode-switcher {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            grid-template-rows: none;
            width: 100%;
            min-height: 44px;
            flex: 0 0 auto;
          }
          .studio-generate-column {
            flex: 0 0 auto;
            min-height: 52px;
            width: 100%;
          }
          .studio-composer .cursor-composer-box {
            align-self: auto;
            width: 100%;
            min-height: 112px;
          }
          .studio-mode-row {
            min-height: 34px;
            justify-content: center;
            padding: 0 7px;
          }
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
          max-width: 1040px;
          margin: 0 auto;
        }
        .studio-asset-preview {
          position: relative;
          display: block;
          height: 100%;
          padding: 10px;
        }
        .studio-asset-preview-head {
          position: absolute;
          top: 18px;
          right: 18px;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          max-width: min(640px, calc(100% - 36px));
          border: 1px solid color-mix(in srgb, var(--mos-text-bright) 8%, transparent);
          border-radius: 16px;
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--cursor-accent) 10%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-bg) 62%, transparent);
          padding: 8px;
          box-shadow:
            0 16px 38px color-mix(in srgb, #000 28%, transparent),
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 8%, transparent);
          backdrop-filter: blur(20px) saturate(1.28);
          -webkit-backdrop-filter: blur(20px) saturate(1.28);
          opacity: 0.9;
          transition: opacity var(--studio-motion-fast) var(--studio-motion-ease), transform var(--studio-motion-fast) var(--studio-motion-spring);
        }
        .studio-asset-preview-head:hover {
          opacity: 1;
          transform: translateY(-1px);
        }
        .studio-asset-preview-title {
          min-width: 0;
          max-width: min(280px, 34vw);
          padding: 0 4px 0 8px;
        }
        .studio-asset-preview-head h2 {
          color: var(--color-cursor-text-bright);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 700;
        }
        .studio-asset-preview-head p:not(.studio-section-kicker) {
          display: none;
        }
        .studio-asset-preview-head .studio-section-kicker {
          margin: 0 0 2px;
          color: var(--color-cursor-muted);
          font-size: 9px;
          letter-spacing: 0.16em;
        }
        .studio-asset-actions {
          display: flex;
          flex-wrap: nowrap;
          justify-content: flex-end;
          gap: 5px;
        }
        .studio-asset-actions .cursor-icon-btn,
        .studio-asset-actions .inline-flex {
          height: 28px;
          min-height: 28px;
          padding: 0 8px;
          border-radius: 10px;
        }
        .studio-asset-lightbox {
          height: 100%;
          min-height: 0;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--mos-text-bright) 5%, transparent);
          border-radius: 20px;
          background:
            radial-gradient(circle at 50% 12%, color-mix(in srgb, var(--cursor-accent) 9%, transparent), transparent 42%),
            color-mix(in srgb, var(--mos-bg) 96%, #03040a);
          box-shadow:
            inset 0 1px 0 color-mix(in srgb, var(--mos-text-bright) 4%, transparent);
        }
        .studio-asset-preview .desk-image-viewer {
          background: transparent;
        }
        .studio-asset-preview .desk-image-viewer-toolbar {
          position: absolute;
          left: 50%;
          bottom: 18px;
          z-index: 4;
          min-height: 34px;
          height: 34px;
          width: auto;
          min-width: 224px;
          transform: translateX(-50%);
          border: 1px solid color-mix(in srgb, var(--mos-text-bright) 8%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--mos-bg) 60%, transparent);
          box-shadow: 0 14px 34px color-mix(in srgb, #000 26%, transparent);
          backdrop-filter: blur(18px) saturate(1.22);
          -webkit-backdrop-filter: blur(18px) saturate(1.22);
        }
        .studio-asset-preview .desk-image-viewer-stage {
          padding: 28px;
        }
        .studio-asset-preview .desk-image-viewer-img {
          border-radius: 12px;
          box-shadow: 0 18px 55px color-mix(in srgb, #000 28%, transparent);
        }
        .studio-asset-player {
          height: 100%;
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
        .studio-price-card:hover,
        .studio-bank-card:hover,
        .studio-admin-card:hover {
          transform: scale(var(--studio-hover-scale));
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, var(--color-cursor-border-soft));
          box-shadow: 0 0 22px var(--studio-glow-soft), inset 0 1px 0 rgba(255, 255, 255, 0.05);
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
        .studio-upload-popover {
          min-width: 190px;
        }
        .studio-upload-hint {
          padding: 6px 8px 4px;
          color: var(--color-cursor-muted);
          font-size: 10px;
          line-height: 1.25;
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
          width: 176px;
          height: 176px;
          margin: 0 auto;
        }
        .studio-empty-logo::before {
          content: "";
          position: absolute;
          inset: -8px;
          z-index: 0;
          border-radius: 999px;
          background:
            radial-gradient(circle, color-mix(in srgb, #000 88%, transparent) 0 34%, transparent 74%),
            radial-gradient(circle, color-mix(in srgb, #000 54%, transparent) 0 48%, transparent 82%);
          box-shadow:
            0 34px 86px color-mix(in srgb, #000 72%, transparent),
            0 10px 46px color-mix(in srgb, #000 52%, transparent);
          filter: blur(18px);
          animation: studio-logo-breathe 3.8s ease-in-out infinite;
        }
        [data-appearance="light"] .studio-empty-logo::before {
          background:
            radial-gradient(circle, color-mix(in srgb, #000 18%, transparent) 0 34%, transparent 70%),
            radial-gradient(circle, color-mix(in srgb, var(--cursor-accent) 16%, transparent), transparent 72%);
          box-shadow: 0 18px 42px color-mix(in srgb, #000 16%, transparent);
        }
        .studio-empty-logo img {
          position: relative;
          z-index: 1;
          width: 148px;
          height: 148px;
          object-fit: contain;
          filter:
            drop-shadow(0 20px 34px color-mix(in srgb, #000 58%, transparent))
            drop-shadow(0 6px 16px color-mix(in srgb, #000 42%, transparent));
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
          backdrop-filter: blur(18px) saturate(1.08);
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
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-hero::before,
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-hero::after,
        [data-studio-bg-pack="space"] .studio-polish .studio-empty-hero::before,
        [data-studio-bg-pack="space"] .studio-polish .studio-empty-hero::after {
          display: none;
        }
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-copy,
        [data-studio-bg-pack="space"] .studio-polish .studio-empty-copy {
          border-color: color-mix(in srgb, var(--mos-text-bright) 6%, transparent);
          background: color-mix(in srgb, #000 16%, transparent);
          box-shadow: none;
          backdrop-filter: none;
        }
        [data-studio-bg-pack="worlds"] .studio-polish .studio-empty-chips span,
        [data-studio-bg-pack="space"] .studio-polish .studio-empty-chips span {
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
      <PanelGroup direction="horizontal" autoSaveId="studio-main-h" className="studio-main-panels min-w-0 flex-1">
        <Panel defaultSize={24} minSize={16} maxSize={42}>
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
        <PanelSearchBar value={search} onChange={setSearch} placeholder="Search your content" aria-label="Search your content" />
        <div className="studio-folder-pathbar">
          <FileBreadcrumbs path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
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
          />
        </div>
      </aside>
        </Panel>
        <PanelResizeHandle className="cursor-resize" />
        <Panel defaultSize={76} minSize={42}>

      <main className={`${STYLE.main}${activeTab.startsWith("composer:") ? " studio-composer-bg" : ""}`}>
        <header className="cursor-panel-head cursor-workspace-head shrink-0">
          <UnifiedTabStrip
            tabs={tabs}
            activeKey={activeTab}
            onSelect={setActiveTab}
            onClose={closeTab}
            onSetTabOrder={setOpenTabs}
            onNewChat={openNewComposerTab}
          />
          <div className="cursor-panel-head-tools cursor-workspace-tools">
            {isMobile ? (
              <StudioAddMenu
                open={addMenuOpen}
                setOpen={setAddMenuOpen}
                onAction={runCreateAction}
              />
            ) : null}
            <CreditPill entitlement={entitlement} />
            <StudioSettingsLauncher
              onOpenSettingsTab={openSettingsTab}
            />
          </div>
        </header>
        <section className="min-h-0 flex-1 overflow-hidden">
          <ActivePane
            activeTab={activeTab}
            activeEntry={activeEntry}
            assets={assetsWithPreviewUrls ?? []}
            events={events}
            onAttach={attachEntry}
            onDuplicate={duplicateEntry}
            onRename={renameEntry}
            onTrash={trashEntry}
            onElementUpdate={updateElementDetails}
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
            payments={payments}
            notifications={notifications}
            onOpenSettings={() => openSettingsTab("general")}
            onCreateItem={(values) => createStudioItem(values)}
            onUploadElementFiles={(files) => uploadElementFiles(files)}
            onCloseTab={closeTab}
          />
        </section>
        {activeTab.startsWith("composer:") ? (
          <StudioComposer
            draft={draft}
            setDraft={setDraft}
            editorRef={editorRef}
            attachments={attachments}
            setAttachments={setAttachments}
            mode={mode}
            setMode={setMode}
            imageTier={imageTier}
            setImageTier={setImageTier}
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
            hasReferenceInput={mode === "video" && generationReferences.length > 0}
            hasVideoReferenceInput={mode === "video" && hasVideoReferenceInput}
            hasNonVideoReferenceInput={mode === "video" && hasNonVideoReferenceInput}
            generationReferences={generationReferences}
            pricing={pricing}
            disabled={flowPending}
            status={status}
            elements={composerElementEntries}
            onSubmit={handleSubmit}
            onDropEntry={(entry, range) => attachEntry(entry, range)}
            onAttachElement={(entry) => attachEntry(entry)}
            onUploadFiles={(files) => uploadComposerFiles(files)}
            uploadInputRef={composerUploadInputRef}
          />
        ) : null}
      </main>
        </Panel>
      </PanelGroup>

      {isMobile && typeof document !== "undefined"
        ? createPortal(
            <nav className="studio-mobile-bottom-nav" aria-label="Studio mobile sections">
              <button
                type="button"
                className={`studio-mobile-nav-btn${mobileSection === "files" ? " is-active" : ""}`}
                aria-current={mobileSection === "files" ? "page" : undefined}
                onClick={() => openMobileSection("files")}
              >
                <LayoutGrid aria-hidden="true" />
                <span>Files</span>
              </button>
              <button
                type="button"
                className={`studio-mobile-nav-btn${mobileSection === "composer" ? " is-active" : ""}`}
                aria-current={mobileSection === "composer" ? "page" : undefined}
                onClick={() => openMobileSection("composer")}
              >
                <Sparkles aria-hidden="true" />
                <span>Create</span>
              </button>
              <button
                type="button"
                className={`studio-mobile-nav-btn${mobileSection === "settings" ? " is-active" : ""}`}
                aria-current={mobileSection === "settings" ? "page" : undefined}
                onClick={() => openMobileSection("settings")}
              >
                <Settings aria-hidden="true" />
                <span>Settings</span>
              </button>
            </nav>,
            document.body,
          )
        : null}

      {settingsOpen ? (
        <SettingsFloatingPanel
          currentUser={currentUser}
          payments={payments}
          notifications={notifications}
          billingAccount={billingAccount}
          pricing={pricing}
          bankAccounts={bankAccounts}
          subscriptionPlans={subscriptionPlans}
          onClose={() => {
            setSettingsOpen(false);
            if (isMobile) setMobileSection("composer");
          }}
          onSaveAccount={(values) => void updateAccountDetails(values).then(() => setStatus("Account updated."))}
          onSeedStylePresets={() => seedStylePresets()}
          customCursorEnabled={customCursorEnabled}
          onCustomCursorChange={setCustomCursorEnabled}
        />
      ) : null}
      {contextMenu ? (
        <ExplorerContextMenu
          entry={contextMenu.entry}
          x={contextMenu.x}
          y={contextMenu.y}
          canCreateFile
          canCreateFolder
          createItems={CREATE_MENU_ITEMS}
          onClose={() => setContextMenu(null)}
          onRequestRename={(entry) => {
            setContextMenu(null);
            void renameEntry(entry);
          }}
          onRequestDelete={(entry) => {
            setContextMenu(null);
            void trashEntry(entry);
          }}
          onAction={(action, entry) => {
            setContextMenu(null);
            if (action === "open") handleEntryOpen(entry);
            if (action === "attach") attachEntry(entry);
            if (action.startsWith("new-") || action === "upload") runCreateAction(action);
            if (action === "copy-path") void navigator.clipboard?.writeText(entry.path ?? "");
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
  mode,
  setMode,
  imageTier,
  setImageTier,
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
  hasReferenceInput,
  hasVideoReferenceInput,
  hasNonVideoReferenceInput,
  generationReferences,
  pricing,
  disabled,
  status,
  elements,
  onSubmit,
  onDropEntry,
  onAttachElement,
  onUploadFiles,
  uploadInputRef,
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [elementMenuOpen, setElementMenuOpen] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [dropMarker, setDropMarker] = useState(null);
  const [selectionHighlights, setSelectionHighlights] = useState([]);
  const [chipPreview, setChipPreview] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const inputLineRef = useRef(null);
  const cost = composerCreditCost({
    mode,
    imageTier,
    resolution,
    durationSeconds,
    hasReferenceInput,
    hasVideoReferenceInput,
    hasNonVideoReferenceInput,
    audioEnabled,
    referenceInputs: generationReferences,
    pricing,
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
    let previewTimer = null;
    const showPreview = (event) => {
      const attachment = event.detail?.attachment;
      const rect = event.detail?.rect;
      if (!attachment?.thumbnailUrl || !rect) return;
      if (previewTimer) window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        setChipPreview({ attachment, rect });
      }, 420);
    };
    const hidePreview = () => {
      if (previewTimer) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
      }
      setChipPreview(null);
    };
    window.addEventListener("studio-composer-token-preview", showPreview);
    window.addEventListener("studio-composer-token-preview-hide", hidePreview);
    window.addEventListener("scroll", hidePreview, true);
    window.addEventListener("resize", hidePreview);
    return () => {
      window.removeEventListener("studio-composer-token-preview", showPreview);
      window.removeEventListener("studio-composer-token-preview-hide", hidePreview);
      window.removeEventListener("scroll", hidePreview, true);
      window.removeEventListener("resize", hidePreview);
      if (previewTimer) window.clearTimeout(previewTimer);
    };
  }, []);

  useEffect(() => {
    const openPreview = (event) => {
      const attachment = event.detail?.attachment;
      if (!attachment) return;
      setPreviewAttachment(attachment);
      setChipPreview(null);
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
        }
      }}
    >
      {chipPreview ? <StudioComposerChipPreview preview={chipPreview} /> : null}
      {previewAttachment ? (
        <StudioComposerPreviewDock
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      ) : null}
      <div className="cursor-composer">
        <div className="studio-composer-row">
          <StudioModeSwitcher mode={mode} setMode={setMode} />
          <div className={`cursor-composer-box ${recording ? "is-recording" : ""} ${transcribing ? "is-transcribing" : ""}${dragOver ? " is-drop-target" : ""}`}>
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
            data-placeholder="Describe the video, ad, or post you want"
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
          <div className="studio-composer-controls">
            <StudioUploadMenu
              open={uploadMenuOpen}
              setOpen={setUploadMenuOpen}
              inputRef={uploadInputRef}
            />
            <StudioElementPicker
              open={elementMenuOpen}
              setOpen={setElementMenuOpen}
              elements={elements}
              onPick={onAttachElement}
            />
            {mode !== "script" ? (
              <StudioComposerInlineSettings
                mode={mode}
                imageTier={imageTier}
                setImageTier={setImageTier}
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
            ) : null}
          </div>
          <div className="studio-composer-actions">
            <button
              type="button"
              className={`studio-pill-btn studio-settings-trigger cursor-composer-mic${recording ? " is-recording" : ""}`}
              title={transcribing ? "Turning voice into text..." : recording ? "Stop recording" : "Use your voice"}
              onClick={() => void toggleVoice()}
              disabled={transcribing}
            >
              {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {status ? <p className="px-3 pb-2 text-xs text-red-300">{status}</p> : null}
        {voiceError ? <p className="px-3 pb-2 text-xs text-red-300">{voiceError}</p> : null}
          </div>
          <div className="studio-generate-column">
            <button
              type="button"
              disabled={disabled || !draft.trim()}
              onClick={() => void onSubmit()}
              className="studio-generate-btn"
              title="Generate content"
            >
              <span className="studio-generate-label">Generate</span>
              <span className="studio-generate-cost">
                <Coins className="studio-generate-mark" aria-hidden="true" />
                {`${cost} Credits`}
              </span>
            </button>
          </div>
        </div>
      <input
        ref={uploadInputRef}
        className="sr-only"
        type="file"
        multiple
        accept="image/*,video/*,.md,text/markdown"
        onChange={(event) => {
          void onUploadFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      </div>
    </div>
  );
}

function StudioComposerChipPreview({ preview }) {
  const { attachment, rect } = preview;
  const width = 188;
  const height = 132;
  const left = Math.min(Math.max(12, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 12);
  const top = rect.top > height + 18 ? rect.top - height - 10 : rect.bottom + 10;
  const label = attachment.label ?? attachment.filename ?? "Preview";
  return (
    <div className="studio-chip-preview-card" style={{ left, top, width }} role="tooltip">
      <div className="studio-chip-preview-media">
        <img src={attachment.thumbnailUrl} alt="" loading="lazy" />
        {attachment.kind === "video" ? (
          <span className="studio-chip-preview-play" aria-hidden="true">
            <Video className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="studio-chip-preview-label">{label}</div>
    </div>
  );
}

function StudioComposerPreviewDock({ attachment, onClose }) {
  const label = attachment.label ?? attachment.filename ?? "Preview";
  const src = attachment.mediaUrl ?? attachment.thumbnailUrl;
  const isImage = attachment.kind === "image";
  const isVideo = attachment.kind === "video";
  return (
    <div className="studio-composer-preview-dock">
      <div className="studio-composer-preview-head">
        <span className="studio-composer-preview-title">{label}</span>
        <button type="button" className="studio-composer-preview-close" onClick={onClose} aria-label="Close preview">
          ×
        </button>
      </div>
      <div className="studio-composer-preview-body">
        {isImage && src ? (
          <img className="studio-composer-preview-image" src={src} alt="" loading="lazy" />
        ) : isVideo && src ? (
          <video className="studio-composer-preview-video" src={src} poster={attachment.thumbnailUrl} controls playsInline />
        ) : (
          <div className="studio-composer-preview-fallback">
            {createPreviewKindLabel(attachment)}
          </div>
        )}
      </div>
    </div>
  );
}

function createPreviewKindLabel(attachment) {
  if (attachment.studioKind === "folder") return "Folder reference";
  if (attachment.studioKind === "document") return "Script reference";
  if (attachment.studioKind === "element") return "Brand item reference";
  return attachment.filename ?? attachment.path ?? "Reference";
}

function StudioModeSwitcher({ mode, setMode }) {
  const items = [
    { value: "image", label: "Image", icon: ImageIcon },
    { value: "video", label: "Video", icon: Video },
    { value: "script", label: "Script", icon: FileText },
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

function StudioUploadMenu({ open, setOpen, inputRef }) {
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useFixedMenuPosition(open, wrapRef, 190);

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
        className="studio-pill-btn studio-upload-trigger"
        title="Add photos, videos, or notes"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="cursor-tab-context-menu studio-dropdown-menu studio-upload-popover is-fixed"
              style={menuStyle}
            >
              <button
                type="button"
                className="cursor-tab-context-item"
                onClick={() => {
                  inputRef.current?.click();
                  setOpen(false);
                }}
              >
                <Upload className="h-3.5 w-3.5" />
                Add photos, videos, or notes
              </button>
              <p className="studio-upload-hint">Use uploads as inspiration for your next request.</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StudioElementPicker({ open, setOpen, elements, onPick }) {
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useFixedMenuPosition(open, wrapRef, 280);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = elements ?? [];
    if (!q) return items.slice(0, 12);
    return items
      .filter((entry) =>
        `${entry.name} ${entry.kindLabel} ${entry.description ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [elements, query]);

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
        className="studio-pill-btn studio-upload-trigger"
        title="Use saved element"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <Sparkles className="h-4 w-4" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="cursor-tab-context-menu studio-dropdown-menu studio-element-picker is-fixed"
              style={menuStyle}
            >
              <input
                className="mb-2 h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-xs text-cursor-text outline-none placeholder:text-cursor-muted focus:border-cursor-accent"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search elements"
                autoFocus
              />
              {filtered.length ? (
                filtered.map((entry) => (
                  <button
                    key={entry.studioId}
                    type="button"
                    className="cursor-tab-context-item studio-element-picker-item"
                    onClick={() => {
                      onPick(entry);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate">{entry.name}</span>
                      <span className="block truncate text-[11px] text-cursor-muted">{entry.kindLabel}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-3 text-xs text-cursor-muted">No elements yet. Use Add then Add element.</p>
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StudioComposerInlineSettings({
  mode,
  imageTier,
  setImageTier,
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
  const [localDurationSeconds, setLocalDurationSeconds] = useState(String(durationSeconds));
  useEffect(() => {
    setLocalDurationSeconds(String(durationSeconds));
  }, [durationSeconds]);
  const aspectItems = [
    { value: "16:9", label: "16:9", meta: "YouTube / TV" },
    { value: "9:16", label: "9:16", meta: "TikTok / Shorts" },
    { value: "1:1", label: "1:1", meta: "Instagram / LinkedIn" },
    { value: "4:3", label: "4:3", meta: "Deck / Frame" },
    { value: "3:4", label: "3:4", meta: "Portrait frame" },
    { value: "21:9", label: "21:9", meta: "Cinematic wide" },
  ];
  const imageQualityItems = [
    { value: "low", label: "Quick", meta: "Seedream 4.0 - simple drafts", icon: Zap },
    { value: "medium", label: "Standard", meta: "Seedream 5.0 - PNG + multi-image", icon: CircleDot },
    { value: "high", label: "Ultra", meta: "Seedream 4.5 - best final/4K", icon: Sparkles },
  ];
  const imageResolutionItems =
    imageTier === "low"
      ? [
          { value: "1K", label: "1K", meta: "Fast draft" },
          { value: "2K", label: "2K", meta: "Default image size" },
          { value: "4K", label: "4K", meta: "Large final" },
        ]
      : imageTier === "medium"
        ? [
            { value: "2K", label: "2K", meta: "Default image size" },
            { value: "3K", label: "3K", meta: "Seedream 5 max" },
          ]
        : [
            { value: "2K", label: "2K", meta: "Default image size" },
            { value: "4K", label: "4K", meta: "Ultra final" },
          ];
  const resolutionItems = [
    { value: "854x480", label: "480p" },
    { value: "1280x720", label: "720p" },
    { value: "1920x1080", label: "1080p" },
  ];
  const durationProgress = `${((Number(localDurationSeconds) - 4) / 11) * 100}%`;
  const commitDuration = (seconds = localDurationSeconds) => {
    const next = String(Math.max(4, Math.min(15, Number(seconds) || 4)));
    setLocalDurationSeconds(next);
    setDurationSeconds(next);
  };
  const activeImageResolution = imageResolutionItems.some((item) => item.value === imageResolution)
    ? imageResolution
    : imageResolutionItems[0].value;

  return (
    <div className="studio-composer-inline-settings" aria-label="Composer settings">
      <StudioInlineSettingSelect
        icon={RectangleHorizontal}
        label="Aspect ratio"
        value={aspectRatio}
        items={aspectItems}
        onChange={setAspectRatio}
        hideLabel
      />
      <StudioInlineSettingSelect
        icon={Gauge}
        label={mode === "image" ? "Finish" : "Quality"}
        value={mode === "image" ? imageTier : resolution}
        items={mode === "image" ? imageQualityItems : resolutionItems}
        onChange={
          mode === "image"
            ? (value) => {
                setImageTier(value);
                const nextResolutionItems =
                  value === "low"
                    ? [
                        { value: "1K" },
                        { value: "2K" },
                        { value: "4K" },
                      ]
                    : value === "medium"
                      ? [
                          { value: "2K" },
                          { value: "3K" },
                        ]
                      : [
                          { value: "2K" },
                          { value: "4K" },
                        ];
                if (!nextResolutionItems.some((item) => item.value === imageResolution)) {
                  setImageResolution(nextResolutionItems[0].value);
                }
              }
            : setResolution
        }
        hideLabel
      />
      {mode === "image" ? (
        <StudioInlineSettingSelect
          icon={Maximize2}
          label="Resolution"
          value={activeImageResolution}
          items={imageResolutionItems}
          onChange={setImageResolution}
          hideLabel
        />
      ) : null}
      {mode === "video" ? (
        <StudioInlineSettingPopover
          icon={Clock3}
          label="Duration"
          valueLabel={`${durationSeconds}s`}
          menuLabel="Video duration"
          hideLabel
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
              max="15"
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
              <span>10s</span>
              <span>15s</span>
            </div>
            <div className="studio-settings-chip-grid studio-duration-presets" role="group" aria-label="Video duration presets">
              {["4", "10", "15"].map((seconds) => (
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
        <StudioInlineSettingSelect
          icon={Volume2}
          label="Audio"
          value={audioEnabled ? "on" : "off"}
          items={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          onChange={(value) => setAudioEnabled(value === "on")}
          hideLabel
          hideChevron
        />
      ) : null}
    </div>
  );
}

function StudioInlineSettingSelect({ icon, label, value, items, onChange, hideLabel = false, hideValue = false, hideChevron = false }) {
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

function StudioInlineSettingPopover({ icon: Icon, label, valueLabel, menuLabel, minWidth = 0, hideLabel = false, hideValue = false, hideChevron = false, children }) {
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
    <div className="studio-inline-setting" ref={wrapRef}>
      <button
        type="button"
        className="studio-inline-setting-trigger"
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

function StudioSettingsLauncher({ onOpenSettingsTab }) {
  return (
                      <button
                        type="button"
      className="studio-settings-pill studio-settings-trigger"
      title="Settings"
      aria-label="Open settings"
      onClick={() => onOpenSettingsTab("general")}
    >
      <Settings className="h-3.5 w-3.5" aria-hidden="true" />
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
            src={MERCURY_LOGO_SIDEBAR}
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
  if (type === "doc") return "Element notes";
  return "Element";
}

function resolveElementSourceAssets(entry, assets) {
  const ids = entry.sourceAssetIds ?? [];
  return ids
    .map((assetId) => {
      const asset = (assets ?? []).find((item) => item._id === assetId || item.studioId === assetId);
      return asset ? assetToEntry(asset) : null;
    })
    .filter(Boolean);
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
  { value: "doc", label: "Notes", meta: "Rules, style notes, references", icon: FileText },
];

function CreateStudioTab({ target, onCancel, onCreate, onUploadElementFiles }) {
  const kind = target.kind ?? "folder";
  const [name, setName] = useState("");
  const [elementType, setElementType] = useState(target.elementType ?? "character");
  const [elementAssets, setElementAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const elementUploadInputRef = useRef(null);
  const title = kind === "folder" ? "New folder" : kind === "script" ? "New ad copy" : `New ${elementTypeLabel(elementType).toLowerCase()}`;
  const helper =
    kind === "folder"
      ? "Create a folder in the current workspace folder."
      : kind === "script"
        ? "Start a note or ad copy draft in a new editable tab."
        : "Save a reusable element for characters, props, places, or notes.";
  async function handleElementUpload(files) {
    if (!files?.length) return;
    setUploadError("");
    setUploading(true);
    try {
      const uploaded = await onUploadElementFiles(files, entry.folderId);
      setElementAssets((items) => [...items, ...(uploaded ?? [])]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <form
        className="mx-auto mt-10 w-full max-w-2xl rounded-3xl border border-white/15 bg-transparent p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({
            kind,
            name,
            elementType,
            sourceAssetIds: elementAssets.map((asset) => asset.assetId),
          });
        }}
      >
        <p className="studio-section-kicker">Create</p>
        <h2 className="mt-2 text-2xl font-semibold text-cursor-text-bright">{title}</h2>
        <p className="mt-2 text-sm text-cursor-muted">{helper}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/[0.03] px-3 text-xs font-semibold text-cursor-text">
            {kind === "folder" ? "Folder" : kind === "element" ? "Element" : "Ad copy"}
          </span>
        </div>
        {kind === "element" ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cursor-muted">Element type</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {ELEMENT_TYPE_OPTIONS.map((item) => {
                const Icon = item.icon;
                const active = elementType === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-cursor-accent bg-cursor-accent/10 text-cursor-text-bright"
                        : "border-white/15 bg-white/[0.03] text-cursor-text hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                    onClick={() => setElementType(item.value)}
                  >
                    <span className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-black/20">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-0.5 block text-xs text-cursor-muted">{item.meta}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <label className="mt-6 block text-xs font-medium text-cursor-muted">
          Name it
          <input
            autoFocus
            className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.03] px-4 text-lg font-medium text-cursor-text outline-none transition focus:border-cursor-accent"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === "folder" ? "Folder name" : kind === "script" ? "Campaign idea" : `${elementTypeLabel(elementType)} name`}
          />
        </label>
        {kind === "element" ? (
          <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-cursor-text-bright">Media for this element</p>
                <p className="mt-1 text-xs text-cursor-muted">Upload reference photos, clips, or audio that define it.</p>
              </div>
              <button
                type="button"
                className={STYLE.iconButton}
                disabled={uploading}
                onClick={() => elementUploadInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "Uploading..." : "Upload media"}
              </button>
              <input
                ref={elementUploadInputRef}
                className="hidden"
                type="file"
                multiple
                onChange={(event) => {
                  void handleElementUpload(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </div>
            {uploadError ? <p className="mt-3 text-xs text-red-300">{uploadError}</p> : null}
            {elementAssets.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {elementAssets.map((asset) => (
                  <div key={asset.assetId} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2">
                    {asset.previewUrl ? (
                      <span
                        className="h-10 w-10 rounded-lg bg-cover bg-center"
                        style={{ backgroundImage: `url(${asset.previewUrl})` }}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/[0.06]">
                        <Upload className="h-4 w-4 text-cursor-muted" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-cursor-text">{asset.name}</span>
                      <span className="text-[11px] uppercase tracking-wide text-cursor-muted">{asset.kind}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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
    description: attachment.description,
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
  token.addEventListener("mouseenter", () => {
    const attachmentData = JSON.parse(token.dataset.attachment ?? "{}");
    if (!attachmentData.thumbnailUrl) return;
    window.dispatchEvent(new CustomEvent("studio-composer-token-preview", {
      detail: {
        attachment: attachmentData,
        rect: token.getBoundingClientRect(),
      },
    }));
  });
  token.addEventListener("mouseleave", () => {
    window.dispatchEvent(new CustomEvent("studio-composer-token-preview-hide"));
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
  const isPreviewAsset = attachment.thumbnailUrl && (attachment.kind === "image" || attachment.kind === "video");
  if (isPreviewAsset) {
    token.classList.add("studio-inline-tag--preview");
    const img = document.createElement("img");
    img.className = "studio-inline-tag-media";
    img.src = attachment.thumbnailUrl;
    img.alt = "";
    kind.appendChild(img);
    if (attachment.kind === "video") {
      kind.classList.add("studio-inline-tag-kind--video");
      kind.appendChild(createComposerTokenIcon("video-play"));
    }
  } else {
    kind.appendChild(createComposerTokenIcon(composerTokenIconKind(attachment)));
  }

  const label = document.createElement("span");
  label.className = "studio-inline-tag-label";
  label.textContent = attachment.label;

  if (attachment.kind === "image" && attachment.thumbnailUrl) {
    token.classList.add("studio-inline-tag--image-only");
    token.title = attachment.label ?? attachment.filename ?? "Image";
    token.append(kind);
  } else {
    token.append(kind, label);
  }
  return token;
}

function composerTokenIconKind(attachment) {
  if (attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "audio") return attachment.kind;
  if (attachment.studioKind === "folder") return "folder";
  if (attachment.studioKind === "element") return "sparkles";
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
  };
  const iconKey =
    kind === "image" || kind === "video" || kind === "video-play" || kind === "audio" || kind === "folder" || kind === "sparkles"
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

function getStudioComposerSelectionHighlights(editor, inputLine) {
  const selection = window.getSelection();
  clearStudioComposerSelectedTags(editor);
  if (!selection?.rangeCount || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer) && !range.intersectsNode(editor)) return [];

  const inputRect = inputLine.getBoundingClientRect();
  const editorRect = editor.getBoundingClientRect();
  const rects = [...range.getClientRects()]
    .map((rect) => ({
      left: Math.max(rect.left, editorRect.left) - inputRect.left,
      top: rect.top - inputRect.top,
      width: Math.min(rect.right, editorRect.right) - Math.max(rect.left, editorRect.left),
      height: rect.height,
    }))
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      left: Math.round(rect.left - 2),
      top: Math.round(rect.top - 1),
      width: Math.round(rect.width + 4),
      height: Math.round(rect.height + 2),
    }));

  editor.querySelectorAll(".studio-inline-tag").forEach((token) => {
    try {
      if (range.intersectsNode(token)) token.classList.add("is-selection-highlighted");
    } catch {
      // Detached nodes can throw while the browser is mutating selection.
    }
  });

  return rects;
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
      parts.push(`@${node.dataset.label ?? node.textContent ?? ""} `);
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

function ActivePane({
  activeTab,
  activeEntry,
  assets,
  events,
  onAttach,
  onDuplicate,
  onRename,
  onTrash,
  onElementUpdate,
  onDocumentChange,
  onSwitchThreadFolder,
  adminTab,
  billingTab,
  currentUser,
  billingAccount,
  pricing,
  bankAccounts,
  adminPayments,
  payments,
  notifications,
  onOpenSettings,
  onCreateItem,
  onUploadElementFiles,
  onCloseTab,
}) {
  if (activeTab.startsWith("create:")) {
    const createTarget = parseCreateTab(activeTab);
    return (
      <CreateStudioTab
        target={createTarget}
        onCancel={() => onCloseTab(activeTab)}
        onUploadElementFiles={onUploadElementFiles}
        onCreate={(values) => {
          void onCreateItem(values).then(() => onCloseTab(activeTab));
        }}
      />
    );
  }
  if (activeTab.startsWith("composer:")) {
    return (
      <div className="cursor-chat-empty thread-empty cursor-chat-empty-logo-only">
        <div className="studio-empty-hero">
          <div className="studio-empty-logo" aria-hidden="true">
            <img
              src={MERCURY_EMPTY_LOGO.src}
              srcSet={MERCURY_EMPTY_LOGO.srcSet}
              sizes={MERCURY_EMPTY_LOGO.sizes}
              alt=""
              width={72}
              height={72}
            />
          </div>
        </div>
      </div>
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
      <div className="flex h-full flex-col">
        <div className="studio-thread-head flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-cursor-text-bright">Generation updates</p>
            <p className="text-xs text-cursor-muted">Your results stay with this project.</p>
          </div>
          <button className={STYLE.iconButton} onClick={() => onSwitchThreadFolder(activeTab.slice("thread:".length))}>
            Save in current folder
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          {(events ?? []).map((event) => (
            <article key={event._id} className="studio-thread-card">
              <p className="studio-thread-kind">{event.kind}</p>
              {event.prompt ? <p className="mt-2 whitespace-pre-wrap text-sm text-cursor-text">{event.prompt}</p> : null}
              {event.stage ? <p className="studio-thread-stage mt-3">{event.stage}</p> : null}
              {event.assetIds?.length ? <p className="mt-2 text-xs text-cursor-muted">{event.assetIds.length} result(s) ready</p> : null}
            </article>
          ))}
        </div>
      </div>
    );
  }
  if (adminTab) {
    return (
      <AdminWorkspacePane
        tab={adminTab}
        currentUser={currentUser}
        billingAccount={billingAccount}
        pricing={pricing}
        bankAccounts={bankAccounts}
        payments={adminPayments ?? payments}
        notifications={notifications}
        onOpenSettings={onOpenSettings}
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
        onAttach={onAttach}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onTrash={onTrash}
      />
    );
  }
  if (activeEntry.studioKind === "element") {
    return (
      <StudioElementDetailPane
        entry={activeEntry}
        assets={assets}
        onAttach={onAttach}
        onRename={onRename}
        onUpdate={onElementUpdate}
        onUploadElementFiles={onUploadElementFiles}
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

function StudioElementDetailPane({ entry, assets, onAttach, onRename, onUpdate, onUploadElementFiles, onTrash }) {
  const [name, setName] = useState(entry.name.replace(/^@/, ""));
  const [description, setDescription] = useState(entry.description ?? "");
  const [sourceAssets, setSourceAssets] = useState(entry.sourceAssets ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setName(entry.name.replace(/^@/, ""));
    setDescription(entry.description ?? "");
    setSourceAssets(resolveElementSourceAssets(entry, assets));
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
        sourceAssetIds: sourceAssets.map((asset) => asset.studioId).filter(Boolean),
        sourceAssets,
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

  const draftEntry = {
    ...entry,
    name: `@${name.trim() || entry.name.replace(/^@/, "")}`,
    description,
    sourceAssetIds: sourceAssets.map((asset) => asset.studioId).filter(Boolean),
    sourceAssets,
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-white/15 bg-transparent p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="studio-section-kicker">{entry.kindLabel}</p>
            <h2 className="mt-2 text-2xl font-semibold text-cursor-text-bright">{entry.name}</h2>
            <p className="mt-2 text-sm text-cursor-muted">Reusable creative ingredient for generation prompts.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={STYLE.iconButton} onClick={() => onAttach(draftEntry)}>
              <Plus className="h-3.5 w-3.5" />
              Use in request
            </button>
            <button className={STYLE.iconButton} onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-5">
          <label className="block text-xs font-medium text-cursor-muted">
            Name
            <input
              className="mt-2 h-11 w-full rounded-2xl border border-white/15 bg-white/[0.03] px-4 text-base font-medium text-cursor-text outline-none transition focus:border-cursor-accent"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-cursor-muted">
            Notes for generation
            <textarea
              className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-cursor-text outline-none transition placeholder:text-cursor-muted focus:border-cursor-accent"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the look, behavior, constraints, or what the model should preserve."
            />
          </label>
        </div>

        <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-cursor-text-bright">Reference media</p>
              <p className="mt-1 text-xs text-cursor-muted">Images, clips, or audio that define this element.</p>
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
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {sourceAssets.map((asset) => (
                <div key={asset.studioId} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2">
                  {asset.thumbnailUrl || asset.mediaUrl ? (
                    <span
                      className="h-12 w-12 rounded-lg bg-cover bg-center"
                      style={{ backgroundImage: `url(${asset.thumbnailUrl ?? asset.mediaUrl})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-lg bg-white/[0.06]">
                      <Upload className="h-4 w-4 text-cursor-muted" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-cursor-text">{asset.name}</span>
                    <span className="text-[11px] uppercase tracking-wide text-cursor-muted">{asset.kindLabel ?? asset.kind}</span>
                  </span>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-[11px] text-cursor-muted hover:bg-white/[0.06] hover:text-cursor-text"
                    onClick={() => setSourceAssets((items) => items.filter((item) => item.studioId !== asset.studioId))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-xs text-cursor-muted">
              No media yet. Add references so this element can guide image and video generation.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-cursor-muted">{message}</p>
          <div className="flex flex-wrap gap-2">
            <button className={STYLE.iconButton} onClick={() => onRename(entry)}>Rename quick</button>
            <button className={STYLE.iconButton} onClick={() => onTrash(entry)}>Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StudioAssetPreview({ entry, onAttach, onRename, onDuplicate, onTrash }) {
  const kind = inferAttachmentKind(entry);
  const [previewExpiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60 * 12);
  const signedMediaUrl = useQuery(
    api.assets.signedReadUrl,
    entry.studioId && !entry.mediaUrl ? { assetId: entry.studioId, expiresUnix: previewExpiresUnix } : "skip",
  );
  const mediaUrl = entry.mediaUrl ?? signedMediaUrl;
  const thumbUrl = entry.thumbnailUrl ?? mediaUrl;
  return (
    <div className="studio-asset-preview">
      <header className="studio-asset-preview-head">
        <div className="studio-asset-preview-title">
          <p className="studio-section-kicker">{entry.kindLabel}</p>
          <h2>{entry.name}</h2>
          <p>{entry.mimeType ?? entry.description}</p>
        </div>
        <div className="studio-asset-actions">
          <button className={STYLE.iconButton} onClick={() => onAttach(entry)}>
            <Plus className="h-4 w-4" />
            Use in request
          </button>
          <button className={STYLE.iconButton} onClick={() => onRename(entry)}>Rename</button>
          <button className={STYLE.iconButton} onClick={() => onDuplicate(entry)}>Duplicate</button>
          <button className={STYLE.iconButton} onClick={() => onTrash(entry)}>Remove</button>
        </div>
      </header>
      <div className="studio-asset-lightbox">
        {kind === "image" && mediaUrl ? (
          <ImageZoomViewer thumbUrl={thumbUrl} fullUrl={mediaUrl} name={entry.name} />
        ) : kind === "video" && mediaUrl ? (
          <div className="desk-media-player-embed studio-asset-player">
            <DeskMediaPlayer kind="video" src={mediaUrl} name={entry.name} poster={thumbUrl} fileSize={entry.byteSize ?? null} />
          </div>
        ) : kind === "audio" && mediaUrl ? (
          <div className="desk-media-player-embed studio-asset-player">
            <DeskMediaPlayer kind="audio" src={mediaUrl} name={entry.name} fileSize={entry.byteSize ?? null} />
          </div>
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

function AdminWorkspacePane({ tab, currentUser, billingAccount, pricing, bankAccounts, payments, notifications, onOpenSettings }) {
  const plans = pricingPlans(pricing);
  const pendingPayments = (payments ?? []).filter((payment) => payment.status !== "payment_completed");
  const adminReviewPayment = useMutation(api.billing.adminReviewPayment);
  const [reviewStatus, setReviewStatus] = useState("");
  async function reviewPayment(paymentId, status) {
    setReviewStatus("Updating payment...");
    try {
      await adminReviewPayment({
        paymentId,
        status,
        rejectionReason: status === "rejected" ? "Rejected by admin." : undefined,
      });
      setReviewStatus("Payment updated.");
    } catch (error) {
      setReviewStatus(error instanceof Error ? error.message : "Payment update failed.");
    }
  }
  return (
    <div className="h-full overflow-auto p-6">
      <div className="studio-admin-workspace">
        <section className="studio-admin-hero-card">
          <div>
            <p className="studio-section-kicker">Team tools</p>
            <h2>{tab === "payments" ? "Payments and receipts" : "Pricing setup"}</h2>
            <p>Logged in as {currentUser?.email ?? currentUser?.phone ?? currentUser?.name ?? "admin"}.</p>
          </div>
          <button type="button" className="cursor-settings-action" onClick={onOpenSettings}>
            <Settings className="h-3.5 w-3.5" />
            Settings
          </button>
        </section>

        {tab === "pricing" ? (
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
                <div className="studio-credit-cost"><span>Quick image</span><strong>{pricing?.imageLowCredits ?? 1} credit</strong><em>Seedream 4.0 - simple drafts</em></div>
                <div className="studio-credit-cost"><span>Standard image</span><strong>{pricing?.imageMediumCredits ?? 2} credits</strong><em>Seedream 5.0 - PNG + multi-image</em></div>
                <div className="studio-credit-cost"><span>Ultra image</span><strong>{pricing?.imageHighCredits ?? 4} credits</strong><em>Seedream 4.5 - best final/4K</em></div>
                <div className="studio-credit-cost"><span>Video</span><strong>from {pricing?.videoCredits ?? 15} credits</strong></div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="studio-admin-grid-large">
              <article className="studio-admin-card">
                <p className="studio-admin-card-kicker">Credits</p>
                <h3>{billingAccount?.creditBalance ?? 0}</h3>
                <p>{billingAccount?.reservedCredits ?? 0} set aside for content in progress.</p>
              </article>
              <article className="studio-admin-card">
                <p className="studio-admin-card-kicker">Pending payments</p>
                <h3>{pendingPayments.length}</h3>
                <p>Bank transfer receipts waiting for review.</p>
              </article>
              <article className="studio-admin-card">
                <p className="studio-admin-card-kicker">Notifications</p>
                <h3>{notifications?.length ?? 0}</h3>
                <p>Recent account and content updates.</p>
              </article>
            </section>
            <section className="studio-admin-card">
              <p className="studio-admin-card-kicker">Payment review</p>
              <div className="studio-settings-invoice-list">
                {(payments ?? []).slice(0, 12).map((payment) => {
                  const isSubscription = Boolean(payment.subscriptionPlanId);
                  return (
                    <div key={payment._id} className="studio-settings-invoice-row">
                      <div>
                        <strong>{isSubscription ? "Subscription" : "Top up"} · ${(payment.amountCents / 100).toFixed(2)}</strong>
                        <span>{humanizePaymentStatus(payment.status)} · {formatDate(payment.createdAt)}</span>
                      </div>
                      <div className="studio-payment-review-actions">
                        {payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" rel="noreferrer">Receipt</a> : <span>No receipt</span>}
                        {payment.status !== "payment_completed" && payment.status !== "rejected" ? (
                          <>
                            <button type="button" onClick={() => void reviewPayment(payment._id, "receipt_received")}>Received</button>
                            <button type="button" onClick={() => void reviewPayment(payment._id, "payment_completed")}>Approve</button>
                            <button type="button" onClick={() => void reviewPayment(payment._id, "rejected")}>Reject</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!payments?.length ? <p className="studio-settings-empty">No payments yet.</p> : null}
                {reviewStatus ? <p className="studio-settings-payment-status">{reviewStatus}</p> : null}
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

function SettingsFloatingPanel({
  currentUser,
  payments,
  notifications,
  billingAccount,
  pricing,
  bankAccounts,
  subscriptionPlans,
  onClose,
  onSaveAccount,
  onSeedStylePresets,
  customCursorEnabled,
  onCustomCursorChange,
}) {
  return (
    <div className="studio-settings-floating-overlay" role="dialog" aria-label="Studio settings">
      <button type="button" className="studio-settings-floating-backdrop" onClick={onClose} aria-label="Close settings" />
      <aside className="studio-settings-floating-panel">
        <header className="studio-settings-floating-head">
          <span>Settings</span>
          <button type="button" className="cursor-icon-btn cursor-icon-btn-sm" onClick={onClose} aria-label="Close">×</button>
        </header>
        <SettingsWorkspacePane
          tab="general"
          currentUser={currentUser}
          payments={payments}
          notifications={notifications}
          billingAccount={billingAccount}
          pricing={pricing}
          bankAccounts={bankAccounts}
          subscriptionPlans={subscriptionPlans}
          onSaveAccount={onSaveAccount}
          onSeedStylePresets={onSeedStylePresets}
          customCursorEnabled={customCursorEnabled}
          onCustomCursorChange={onCustomCursorChange}
        />
      </aside>
    </div>
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
  onSeedStylePresets,
  customCursorEnabled,
  onCustomCursorChange,
}) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const [section, setSection] = useState(tab || "general");
  const [creditMode, setCreditMode] = useState("top-up");
  const [selectedPlanName, setSelectedPlanName] = useState("Studio");
  const [selectedSubscriptionPlanName, setSelectedSubscriptionPlanName] = useState("Studio");
  const [isPaymentStep, setIsPaymentStep] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [setupStatus, setSetupStatus] = useState("");
  const [pendingReceiptPaymentId, setPendingReceiptPaymentId] = useState(null);
  const receiptInputRef = useRef(null);
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
    setPendingReceiptPaymentId(null);
    setPaymentStatus("");
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
    setPaymentStatus("Creating payment request...");
    try {
      const paymentId = await submitBankPayment({
        bankAccountId,
        amountCents: isSubscription ? selectedSubscriptionPlan.amountCents : selectedPlan.amountCents,
        creditsRequested: isSubscription ? undefined : selectedPlan.credits,
        subscriptionPlanId: isSubscription ? selectedSubscriptionPlan._id : undefined,
        reference: isSubscription ? `Subscription: ${selectedSubscriptionPlan.name}` : `Top up: ${selectedPlan.name}`,
      });
      setPendingReceiptPaymentId(paymentId);
      setPaymentStatus(`Payment request created for ${isSubscription ? selectedSubscriptionPlan.name : selectedPlan.name}. Upload receipt to finish.`);
    } catch (error) {
      setPaymentStatus(error instanceof Error ? error.message : "Payment request failed.");
    }
  }
  async function handleReceiptUpload(file) {
    if (!pendingReceiptPaymentId || !file) return;
    setPaymentStatus("Uploading receipt...");
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
      setPaymentStatus("Receipt uploaded. We will review and activate once payment clears.");
    } catch (error) {
      setPaymentStatus(error instanceof Error ? error.message : "Receipt upload failed.");
    }
  }
  async function seedDefaultStylePresets() {
    setSetupStatus("Seeding style presets...");
    try {
      const created = await onSeedStylePresets?.();
      setSetupStatus(
        created === 0
          ? "Style presets already exist."
          : `Seeded ${created} style preset${created === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setSetupStatus(error instanceof Error ? error.message : "Style preset setup failed.");
    }
  }
  const items = [
    { id: "general", label: "Appearance" },
    { id: "account", label: "Account details" },
    { id: "billing", label: "Billing" },
    { id: "top-up", label: "Add credits" },
    { id: "activity", label: "Activity" },
    ...(isAdmin ? [{ id: "team", label: "Team tools" }] : []),
  ];
  return (
    <div className="studio-settings-workspace">
      <header className="studio-settings-workspace-head">
        <nav className="studio-settings-horizontal-menu" aria-label="Settings sections">
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

        {section === "billing" ? (
          <div className="studio-settings-stack">
            <section className="cursor-settings-section studio-settings-billing-panel">
              <div className="studio-settings-balance-block">
                <span>Available credits</span>
                <strong>{billingAccount?.creditBalance ?? 0}</strong>
                <small>{billingAccount?.reservedCredits ?? 0} reserved</small>
                </div>
              <div className="studio-settings-rows">
                <div className="studio-settings-row">
                  <span>Plan</span>
                  <strong>{billingAccount?.subscription?.planName ?? "None"}</strong>
                  </div>
                <div className="studio-settings-row">
                  <span>Renewal</span>
                  <strong>{billingAccount?.subscription ? formatDate(billingAccount.subscription.currentPeriodEnd) : "None"}</strong>
                </div>
                <div className="studio-settings-row">
                  <span>Latest payment</span>
                  <strong>
                    {(payments ?? [])[0]
                      ? `${humanizePaymentStatus((payments ?? [])[0].status)} · $${((payments ?? [])[0].amountCents / 100).toFixed(2)}`
                      : "None"}
                  </strong>
                </div>
              </div>
              </section>
            <section className="cursor-settings-section studio-settings-simple-card">
              <div className="studio-settings-card-title">Invoices</div>
              <div className="studio-settings-invoice-list">
                {(payments ?? []).slice(0, 6).map((payment) => {
                  const paymentUrl = payment.receiptUrl ?? (payment.externalPaymentId?.startsWith("http") ? payment.externalPaymentId : null);
                  return (
                    <div key={payment._id} className="studio-settings-invoice-row">
                  <div>
                        <strong>{payment.subscriptionPlanId ? "Subscription invoice" : "Credit invoice"}</strong>
                        <span>{formatDate(payment.createdAt)} · {humanizePaymentStatus(payment.status)}</span>
                  </div>
                      {paymentUrl ? (
                        <a href={paymentUrl} target="_blank" rel="noreferrer">Open</a>
                      ) : (
                        <span>${(payment.amountCents / 100).toFixed(2)}</span>
                      )}
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
            {!isPaymentStep ? (
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
                          {selectedPlan?.name === plan.name && isPaymentStep ? "Selected" : "Choose"}
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
                          {selectedSubscriptionPlan?.name === plan.name && isPaymentStep ? "Selected" : "Choose"}
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
            {isPaymentStep ? (
              <section className="cursor-settings-section studio-settings-simple-card">
                <div className="studio-settings-payment-head">
                  <div>
                    <h4>{creditMode === "subscription" ? selectedSubscriptionPlan?.name : selectedPlan?.name}</h4>
                    <p>
                      {creditMode === "subscription"
                        ? `${selectedSubscriptionPlan?.price}/mo · ${selectedSubscriptionPlan?.credits} credits/mo`
                        : `${selectedPlan?.price} · ${selectedPlan?.credits} credits`}
                    </p>
                  </div>
                  <button type="button" className="studio-settings-plan-choice" onClick={resetPaymentDraft}>
                    Back
                  </button>
                </div>
                <p className="studio-settings-payment-lead">
                  Payment for {creditMode === "subscription" ? selectedSubscriptionPlan?.name : selectedPlan?.name}. Choose a bank account, then upload receipt.
                </p>
                <div className="studio-settings-bank-list">
                  {(bankAccounts ?? []).map((bank) => (
                    <div
                      key={bank._id}
                      className="studio-bank-card studio-bank-card-button"
                      role="button"
                      tabIndex={0}
                      onClick={() => void handleBankPayment(bank._id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void handleBankPayment(bank._id);
                        }
                      }}
                    >
                      <p className="studio-bank-card-title">{bank.label}</p>
                      <BankLine label="Bank" value={bank.bankName} />
                      <BankLine label="Name" value={bank.accountName} />
                      <BankLine label="Number" value={bank.accountNumber} />
                      <BankLine label="Type" value={bank.accountType} />
                    </div>
                  ))}
                  {paymentStatus ? <p className="studio-settings-payment-status">{paymentStatus}</p> : null}
                  <input
                    ref={receiptInputRef}
                    className="hidden"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void handleReceiptUpload(file);
                    }}
                  />
                  {pendingReceiptPaymentId ? (
                    <button
                      type="button"
                      className="cursor-settings-action"
                      onClick={() => receiptInputRef.current?.click()}
                    >
                      Upload receipt
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
          ) : null}

        {section === "activity" ? (
          <section className="cursor-settings-section studio-settings-simple-card">
            <div className="studio-settings-feed">
              {(notifications ?? []).slice(0, 8).map((item) => (
                <p key={item._id}><strong>{item.title}</strong><span>{item.body}</span></p>
              ))}
              {(payments ?? []).slice(0, 8).map((item) => (
                <p key={item._id}><strong>Payment</strong><span>{humanizePaymentStatus(item.status)} · ${(item.amountCents / 100).toFixed(2)}</span></p>
                ))}
                {!notifications?.length && !payments?.length ? <p>No recent billing or notification activity.</p> : null}
              </div>
            </section>
          ) : null}

        {section === "team" && isAdmin ? (
          <section className="cursor-settings-section studio-settings-simple-card">
            <div className="studio-settings-rows">
              <div className="studio-settings-row">
                <span>Style presets</span>
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => void seedDefaultStylePresets()}
                >
                  Seed defaults
                </button>
              </div>
              <div className="studio-settings-row">
                <span>Role</span>
                <strong>{currentUser?.role ?? "Admin"}</strong>
                </div>
              <div className="studio-settings-row">
                <span>Pending payments</span>
                <strong>{(payments ?? []).filter((payment) => payment.status !== "payment_completed").length}</strong>
              </div>
              <div className="studio-settings-row">
                <span>Payment accounts</span>
                <strong>{bankAccounts?.length ?? 0}</strong>
              </div>
            </div>
            {setupStatus ? <p className="studio-settings-payment-status">{setupStatus}</p> : null}
            </section>
          ) : null}

        {section === "general" ? (
          <>
            <CustomCursorSettings enabled={customCursorEnabled} onChange={onCustomCursorChange} />
            <ThemeSettings />
          </>
        ) : null}
        </div>
      </div>
  );
}

function CustomCursorSettings({ enabled, onChange }) {
  return (
    <section className="cursor-settings-section">
      <div className="studio-section-head">
        <div>
          <p className="studio-section-kicker">Pointer</p>
          <h3>Modern cursor</h3>
          <p>Use the custom Studio mouse pointer.</p>
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
  const [name, setName] = useState(currentUser?.name ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [phone, setPhone] = useState(currentUser?.phone ?? "");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    setName(currentUser?.name ?? "");
    setEmail(currentUser?.email ?? "");
    setPhone(currentUser?.phone ?? "");
  }, [currentUser?.name, currentUser?.email, currentUser?.phone]);
  return (
    <section className="cursor-settings-section studio-account-card">
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

function videoCreditCost({
  resolution,
  durationSeconds,
  hasReferenceInput,
  hasVideoReferenceInput,
  hasNonVideoReferenceInput,
  audioEnabled,
}) {
  const duration = Math.max(4, Math.min(15, Math.ceil(Number(durationSeconds) || 4)));
  const multiplier = Math.ceil(duration / 5);
  const base =
    resolution === "854x480"
      ? 15
      : resolution === "1920x1080"
        ? 45
        : 25;
  const videoReferenceSurcharge = hasVideoReferenceInput ? 5 : 0;
  const nonVideoReferenceSurcharge = hasNonVideoReferenceInput
    ? resolution === "1920x1080"
      ? 10
      : 5
    : hasReferenceInput
      ? 5
      : 0;
  const audioSurcharge = audioEnabled ? 5 : 0;
  return (base + videoReferenceSurcharge + nonVideoReferenceSurcharge + audioSurcharge) * multiplier;
}

function normalizeImageResolution(imageTier, imageResolution) {
  const allowed =
    imageTier === "low"
      ? ["1K", "2K", "4K"]
      : imageTier === "medium"
        ? ["2K", "3K"]
        : ["2K", "4K"];
  return allowed.includes(imageResolution) ? imageResolution : allowed[0];
}

function composerCreditCost({
  mode,
  imageTier,
  resolution,
  durationSeconds,
  hasReferenceInput,
  hasVideoReferenceInput,
  hasNonVideoReferenceInput,
  audioEnabled,
  referenceInputs,
  pricing,
}) {
  if (mode === "script") return scriptCreditCost(referenceInputs ?? [], pricing);
  if (mode === "video") {
    return videoCreditCost({
      resolution,
      durationSeconds,
      hasReferenceInput,
      hasVideoReferenceInput,
      hasNonVideoReferenceInput,
      audioEnabled,
    });
  }
  if (imageTier === "low") return pricing?.imageLowCredits ?? 1;
  if (imageTier === "high") return pricing?.imageHighCredits ?? 4;
  return pricing?.imageMediumCredits ?? 2;
}

function scriptCreditCost(referenceInputs, pricing) {
  const base = pricing?.textCredits ?? 1;
  return referenceInputs.reduce((total, reference) => {
    if (reference.kind === "video") return total + 5;
    if (reference.kind === "audio") return total + 2;
    if (reference.kind === "image") return total + 1;
    return total;
  }, base);
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function humanizePaymentStatus(status) {
  return String(status ?? "")
    .replace(/^payment_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Pending";
}

function CreditPill({ entitlement }) {
  return (
    <span className="studio-credit-pill inline-flex items-center gap-1 rounded-full border border-cursor-border bg-cursor-panel px-2 py-1 text-[11px] font-semibold text-cursor-muted">
      <Coins className="h-3 w-3" aria-hidden="true" />
      {entitlement ? `${entitlement.creditBalance} Credits` : "Credits"}
    </span>
  );
}

function buildFlatEntries({ folder, parent, loading, folders, assets, documents, elements }) {
  return {
    loading: loading ?? !folder,
    parent,
    entries: [
      ...(folders ?? []).map(folderToEntry),
      ...(documents ?? []).map(documentToEntry),
      ...(assets ?? []).map(assetToEntry),
      ...(elements ?? []).map((element) => elementToEntry(element, assets)),
    ],
  };
}

function folderToEntry(folder) {
  return {
    type: "dir",
    name: folder.name,
    path: studioPathForFolder(folder),
    modified: folder.updatedAt,
    mtimeMs: folder.updatedAt,
    studioKind: "folder",
    studioId: folder._id,
  };
}

function documentToEntry(doc) {
  return {
    type: "file",
    name: `${doc.title}.md`,
    path: `/Studio/scripts/${doc._id}.md`,
    modified: doc.updatedAt,
    mtimeMs: doc.updatedAt,
    ext: ".md",
    studioKind: "document",
    studioId: doc._id,
    kindLabel: "Ad copy",
    description: doc.contentMarkdown,
  };
}

function assetToEntry(asset) {
  const ext = asset.kind === "image" ? ".png" : asset.kind === "video" ? ".mp4" : asset.kind === "audio" ? ".mp3" : ".bin";
  return {
    type: "file",
    name: asset.name,
    path: `/Studio/assets/${asset._id}${ext}`,
    modified: asset.updatedAt,
    mtimeMs: asset.updatedAt,
    ext,
    studioKind: "asset",
    studioId: asset._id,
    kind: asset.kind,
    kindLabel: asset.kind === "image" ? "Image" : asset.kind === "video" ? "Video" : asset.kind === "audio" ? "Audio" : "Content",
    description: asset.mimeType,
    mediaUrl: asset.signedReadUrl,
    thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
  };
}

function elementToEntry(element, assets = []) {
  const sourceAssets = (element.sourceAssetIds ?? [])
    .map((assetId) => {
      const asset = (assets ?? []).find((item) => item._id === assetId || item.studioId === assetId);
      return asset ? assetToEntry(asset) : null;
    })
    .filter(Boolean);
  return {
    type: "file",
    name: `@${element.name}`,
    path: `/Studio/elements/${element._id}.element`,
    modified: element.updatedAt,
    mtimeMs: element.updatedAt,
    ext: ".element",
    studioKind: "element",
    studioId: element._id,
    folderId: element.folderId,
    elementType: element.type,
    sourceAssetIds: element.sourceAssetIds ?? [],
    sourceAssets,
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

function tabDescriptor({ key, threads, assets, documents, elements, snapshots }) {
  if (key.startsWith("composer:")) {
    return { key, kind: "chat", title: key === COMPOSER_TAB ? "Generate" : "New request", status: "ready" };
  }
  if (key.startsWith("admin:")) {
    const kind = key.slice("admin:".length);
    const title = kind === "payments" ? "Payments" : kind === "pricing" ? "Pricing" : "Team tools";
    return { key, kind: "settings", title, status: "ready" };
  }
  if (key.startsWith("billing:")) {
    const kind = key.slice("billing:".length);
    const title = kind === "top-up" ? "Credit top up" : "Billing";
    return { key, kind: "settings", title, status: "ready" };
  }
  if (key.startsWith("create:")) {
    const target = parseCreateTab(key);
    return { key, kind: "file", title: createTabTitle(target), status: "ready" };
  }
  if (key.startsWith("thread:")) {
    const thread = threads?.find((item) => item._id === key.slice("thread:".length));
    return { key, kind: "chat", title: thread?.title ?? "Generation", status: "ready" };
  }
  const entry = findEntryByTab(key, { assets, documents, elements, snapshots });
  if (entry) {
    return {
      key,
      kind: "file",
      title: entry.name,
      path: entry.path,
      ext: entry.ext,
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

function findEntryByTab(key, { assets, documents, elements, snapshots }) {
  if (key.startsWith("asset:")) {
    const item = assets?.find((asset) => asset._id === key.slice("asset:".length));
    return item ? assetToEntry(item) : snapshots?.[key] ?? null;
  }
  if (key.startsWith("document:")) {
    const item = documents?.find((doc) => doc._id === key.slice("document:".length));
    return item ? documentToEntry(item) : snapshots?.[key] ?? null;
  }
  if (key.startsWith("element:")) {
    const item = elements?.find((element) => element._id === key.slice("element:".length));
    return item ? elementToEntry(item, assets) : snapshots?.[key] ?? null;
  }
  return null;
}

function entryToAttachment(entry) {
  const studioKind = entry.studioKind ?? (entry.type === "dir" ? "folder" : undefined);
  const kind = studioKind === "asset" || !studioKind ? inferAttachmentKind(entry) : studioKind === "document" ? "file" : "context";
  return {
    id: studioKind && entry.studioId ? `${studioKind}:${entry.studioId}` : entry.path,
    kind,
    label: entry.name.replace(/^@/, ""),
    path: entry.path,
    filename: entry.name,
    studioKind,
    studioId: entry.studioId,
    elementType: entry.elementType,
    description: entry.description,
    sourceAssetIds: entry.sourceAssetIds,
    sourceAssets: entry.sourceAssets,
    thumbnailUrl: entry.thumbnailUrl,
    mediaUrl: entry.mediaUrl,
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

function buildPromptWithAttachments(prompt, attachments) {
  if (!attachments.length) return prompt.trim();
  const refs = attachments
    .map((item) =>
      [
        `- @${item.label}`,
        item.kind ? `kind: ${item.kind}` : "",
        item.elementType ? `element: ${elementTypeLabel(item.elementType)}` : "",
        item.description ? `notes: ${item.description}` : "",
        item.sourceAssets?.length ? `media: ${item.sourceAssets.map((asset) => asset.name).join(", ")}` : "",
        item.path ? `path: ${item.path}` : "",
        item.filename ? `file: ${item.filename}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
  return `${prompt.trim()}\n\nReferences:\n${refs}`;
}

function generationReferenceInputs(attachments, signedUrls = {}) {
  return attachments
    .flatMap((attachment) => {
      const direct = {
        kind: attachment.kind,
        url: attachment.mediaUrl ?? signedUrls[`attachment:${attachment.id}`] ?? attachment.thumbnailUrl,
      };
      const sourceRefs = (attachment.sourceAssets ?? []).map((asset) => ({
        kind: asset.kind,
        url: asset.mediaUrl ?? signedUrls[`element-source:${attachment.id}:${asset.studioId}`] ?? asset.thumbnailUrl,
      }));
      return [direct, ...sourceRefs];
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
