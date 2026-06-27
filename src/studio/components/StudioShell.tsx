// @ts-nocheck
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUp,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Plus,
  Settings,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import { ExplorerContextMenu } from "@/desk/components/ExplorerContextMenu";
import { ExplorerViewMenu } from "@/desk/components/ExplorerViewMenu";
import { FileBreadcrumbs } from "@/desk/components/FileBreadcrumbs";
import { FileTree } from "@/desk/components/FileTree";
import { DeskMediaPlayer } from "@/desk/components/DeskMediaPlayer";
import { ImageZoomViewer } from "@/desk/components/ImageZoomViewer";
import { MarkdownDocEditor } from "@/desk/components/MarkdownDocEditor";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { ThemeSettings } from "@/desk/components/ThemeSettings";
import { UnifiedTabStrip } from "@/desk/components/UnifiedTabStrip";
import { readExplorerDragData } from "@/desk/lib/explorer-dnd";
import { MERCURY_LOGO_SIDEBAR, mercuryLogoAssets } from "@/lib/brand-assets";
import { getDeviceId, loadSession } from "@/lib/session";
import * as mosApi from "@mos-app/api.js";

const WORKSPACE_ID = "yatishara-studio";
const COMPOSER_TAB = "composer:main";
const STUDIO_VOICE_NOT_CONNECTED =
  "Voice transcription needs a connected MercuryOS gateway with Deepgram enabled. Connect Desk first, then try voice again.";
const MERCURY_EMPTY_LOGO = mercuryLogoAssets(96);

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
    return "Voice transcription could not reach the gateway. Check connection, then try again.";
  }
  return clean;
}

export function StudioShell() {
  const { signOut } = useAuthActions();
  const ensureDefaults = useMutation(api.users.ensureStudioDefaults);
  const createFolder = useMutation(api.folders.create);
  const updateFolder = useMutation(api.folders.update);
  const trashFolder = useMutation(api.folders.moveToTrash);
  const createDocument = useMutation(api.documents.create);
  const updateDocument = useMutation(api.documents.update);
  const trashDocument = useMutation(api.documents.moveToTrash);
  const createElement = useMutation(api.elements.create);
  const trashElement = useMutation(api.elements.moveToTrash);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const completeUpload = useMutation(api.assets.completeUpload);
  const updateAsset = useMutation(api.assets.update);
  const duplicateAsset = useMutation(api.assets.duplicate);
  const trashAsset = useMutation(api.assets.moveToTrash);
  const createThread = useMutation(api.generation.createThread);
  const switchThreadFolder = useMutation(api.generation.switchThreadFolder);
  const updateAccountDetails = useMutation(api.users.updateAccountDetails);
  const runFlow = useAction(api.generationActions.runFlow);
  const adminSeedStylePresets = useMutation(api.stylePresets.adminSeedDefaults);
  const adminSeedBankAccount = useMutation(api.billing.adminSeedBankAccountFromEnv);
  const adminSeedLaunchPricing = useMutation(api.billing.adminSeedLaunchPricing);

  const [activeFolderId, setActiveFolderId] = useState(null);
  const [openTabs, setOpenTabs] = useState([COMPOSER_TAB]);
  const [tabEntrySnapshots, setTabEntrySnapshots] = useState({});
  const [activeTab, setActiveTab] = useState(COMPOSER_TAB);
  const [navTrail, setNavTrail] = useState([]);
  const [viewMode, setViewMode] = useState("list");
  const [search, setSearch] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [createDialog, setCreateDialog] = useState(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [mode, setMode] = useState("image");
  const [imageTier, setImageTier] = useState("medium");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1024x1024");
  const [durationSeconds, setDurationSeconds] = useState("5");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [flowPending, setFlowPending] = useState(false);
  const [status, setStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [entitlementNow] = useState(() => Date.now());
  const [assetUrlExpires] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const deferredSearch = useDeferredValue(search);
  const fileInputRef = useRef(null);
  const composerUploadInputRef = useRef(null);
  const editorRef = useRef(null);
  const composerKeyRef = useRef(COMPOSER_TAB);
  const composerContextsRef = useRef({});

  const currentUser = useQuery(api.users.current, {});
  const billingAccount = useQuery(api.billing.currentAccount, {});
  const pricing = useQuery(api.billing.getPricing, {});
  const bankAccounts = useQuery(api.billing.listBankAccounts, {});
  const payments = useQuery(api.billing.listMyPayments, {});
  const notifications = useQuery(api.notifications.listMine, {});
  const topFolders = useQuery(api.folders.list, {});
  const selectedFolder = useQuery(
    api.folders.get,
    activeFolderId ? { folderId: activeFolderId } : "skip",
  );
  const activeFolder =
    selectedFolder ??
    topFolders?.find((folder) => folder._id === activeFolderId) ??
    topFolders?.[0] ??
    null;
  const childFolders = useQuery(
    api.folders.list,
    activeFolder ? { parentId: activeFolder._id } : "skip",
  );
  const assets = useQuery(
    api.assets.listByFolder,
    activeFolder ? { folderId: activeFolder._id, expiresUnix: assetUrlExpires } : "skip",
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
  const presets = useQuery(api.stylePresets.listEnabled, {
    kind: mode === "video" ? "video" : "image",
  });
  const entitlement = useQuery(api.generation.canGenerate, {
    tier: mode === "video" ? "pro_video" : imageTier,
    now: entitlementNow,
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
    setResolution(next?.resolution ?? "1024x1024");
    setDurationSeconds(next?.durationSeconds ?? "5");
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

  const folderContentLoading = Boolean(
    activeFolder &&
      (childFolders === undefined ||
        assets === undefined ||
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
                name: "Parent folder",
                path: `/Studio/${navTrail[navTrail.length - 2].name}`,
                studioId: navTrail[navTrail.length - 2].id,
              }
            : null,
        loading: !activeFolder || folderContentLoading,
        folders: childFolders,
        assets,
        documents,
        elements: elements?.filter((element) => element.folderId === activeFolder?._id),
      }),
    [activeFolder, navTrail, childFolders, assets, documents, elements, folderContentLoading],
  );

  const rootEntries = useMemo(
    () => ({
      loading: !topFolders,
      entries: (topFolders ?? []).map(folderToEntry),
    }),
    [topFolders],
  );

  const tabs = useMemo(() => {
    const descriptors = openTabs.map((key) =>
      tabDescriptor({
        key,
        threads,
        assets,
        documents,
        elements,
        snapshots: tabEntrySnapshots,
      }),
    );
    return descriptors.filter(Boolean);
  }, [openTabs, threads, assets, documents, elements, tabEntrySnapshots]);

  const activeEntry = useMemo(
    () => findEntryByTab(activeTab, { threads, assets, documents, elements, snapshots: tabEntrySnapshots }),
    [activeTab, threads, assets, documents, elements, tabEntrySnapshots],
  );
  const activeAdminTab = activeTab.startsWith("admin:") ? activeTab.slice("admin:".length) : null;
  const activeBillingTab = activeTab.startsWith("billing:") ? activeTab.slice("billing:".length) : null;

  const pathToEntry = useMemo(() => {
    const map = new Map();
    for (const entry of [...(rootEntries.entries ?? []), ...(currentEntries.entries ?? [])]) {
      map.set(entry.path, entry);
    }
    return map;
  }, [rootEntries, currentEntries]);

  const searchState = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return { entries: [], truncated: false };
    const entries = [];
    let truncated = false;
    for (const entry of currentEntries.entries ?? []) {
      if (!String(entry.name ?? "").toLowerCase().includes(q)) continue;
      if (entries.length >= 80) {
        truncated = true;
        break;
      }
      entries.push(entry);
    }
    return { entries, truncated };
  }, [currentEntries, deferredSearch]);

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

  function openAdminTab(kind) {
    openTab(`admin:${kind}`);
  }

  function openBillingTab(kind) {
    openTab(`billing:${kind}`);
    setSettingsOpen(false);
  }

  function closeTab(key) {
    if (key === COMPOSER_TAB) return;
    setOpenTabs((tabs) => {
      const next = tabs.filter((tab) => tab !== key);
      if (activeTab === key) {
        setActiveTab(next[next.length - 1] ?? COMPOSER_TAB);
      }
      return next.length ? next : [COMPOSER_TAB];
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
    const attachment = entryToAttachment(entry);
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
      sourceAssetIds: [],
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
        const id = await createDocument({
          folderId: activeFolder._id,
          title: draft.trim().slice(0, 60) || "Untitled script",
          contentMarkdown: draft.trim(),
        });
        openTab(`document:${id}`);
        setDraft("");
        setAttachments([]);
        return;
      }

      const preset = presets?.[0];
      if (!preset) throw new Error("Seed style presets in settings first.");
      if (entitlement && !entitlement.canGenerate) {
        throw new Error(entitlement.reason ?? "Generation not available.");
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
        resolution,
        durationSeconds: mode === "video" ? Number(durationSeconds) : undefined,
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
      className={`${STYLE.shell} studio-polish`}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.("button, [role='button'], .cursor-tree-row, .desk-file-grid-item")) {
          playStudioTapFeedback();
        }
      }}
    >
      <style jsx global>{`
        .studio-polish {
          --studio-glow-soft: color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          --studio-glow-mid: color-mix(in srgb, var(--cursor-accent) 24%, transparent);
          --studio-surface-hover: color-mix(in srgb, var(--cursor-accent) 5%, var(--color-cursor-hover));
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .studio-polish::before,
        .studio-polish::after {
          content: "";
          position: fixed;
          z-index: 0;
          pointer-events: none;
          border-radius: 999px;
          filter: blur(32px);
          opacity: 0.34;
          mix-blend-mode: screen;
          animation: studio-ambient-drift 9s ease-in-out infinite alternate;
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
          background: radial-gradient(circle, color-mix(in srgb, #06b6d4 16%, transparent), transparent 70%);
          animation-duration: 12s;
        }
        .studio-polish > :not(style) {
          position: relative;
          z-index: 1;
        }
        @keyframes studio-ambient-drift {
          from { transform: translate3d(0, 0, 0) scale(0.96); }
          to { transform: translate3d(-18px, 12px, 0) scale(1.05); }
        }
        .studio-polish :where(button, [role="button"], .cursor-tab, .cursor-agent-chat-tab, .cursor-tree-row, .desk-file-grid-item, .desk-file-breadcrumbs-chip, .theme-chip) {
          transition:
            background 180ms ease,
            border-color 180ms ease,
            color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease,
            opacity 180ms ease;
        }
        .studio-polish :where(button, [role="button"], .cursor-tree-row, .desk-file-grid-item, .desk-file-breadcrumbs-chip) {
          -webkit-tap-highlight-color: transparent;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn) {
          position: relative;
        }
        .studio-polish :where(button, [role="button"], .cursor-tree-row, .desk-file-grid-item, .desk-file-breadcrumbs-chip):focus-visible {
          outline: 2px solid color-mix(in srgb, var(--cursor-accent) 42%, transparent);
          outline-offset: 2px;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn):hover:not(:disabled) {
          box-shadow: 0 0 18px var(--studio-glow-soft);
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn):active:not(:disabled),
        .studio-polish :where(.cursor-tree-row, .desk-file-grid-item, .desk-file-breadcrumbs-chip):active {
          transform: translateY(1px);
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn)::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          border: 1px solid transparent;
          opacity: 0;
          transform: scale(0.86);
          transition: opacity 160ms ease, transform 160ms ease, border-color 160ms ease;
          pointer-events: none;
        }
        .studio-polish :where(.cursor-icon-btn, .cursor-toolbar-icon, .studio-pill-btn):active::after {
          opacity: 1;
          transform: scale(1.08);
          border-color: color-mix(in srgb, var(--cursor-accent) 34%, transparent);
        }
        .studio-polish .cursor-panel-head {
          backdrop-filter: blur(10px);
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--mos-surface) 92%, transparent), color-mix(in srgb, var(--mos-bg) 98%, transparent));
        }
        .studio-polish .cursor-sidebar-brand-logo-img {
          filter: drop-shadow(0 0 8px var(--studio-glow-soft));
        }
        .studio-polish .cursor-tree-row:hover,
        .studio-polish .desk-file-grid-item:hover {
          background: var(--studio-surface-hover);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 12%, transparent);
        }
        .studio-polish .desk-file-grid-item:hover {
          transform: translateY(-1px);
        }
        .studio-polish .cursor-tree-row[aria-selected="true"],
        .studio-polish .desk-file-grid-item[aria-selected="true"],
        .studio-polish .cursor-tree-row.is-selected,
        .studio-polish .desk-file-grid-item.is-selected {
          background: color-mix(in srgb, var(--cursor-accent) 10%, var(--color-cursor-hover));
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cursor-accent) 20%, transparent);
        }
        .studio-polish .desk-file-breadcrumbs-chip:hover {
          background: var(--cursor-overlay-subtle);
          box-shadow: 0 0 12px var(--studio-glow-soft);
        }
        .studio-polish :where(.cursor-tab, .cursor-agent-chat-tab):hover {
          background: var(--studio-surface-hover);
        }
        .studio-polish :where(.cursor-tab.active, .cursor-agent-chat-tab.active, .cursor-tab.is-active, .cursor-agent-chat-tab.is-active) {
          box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--cursor-accent) 42%, transparent);
        }
        .studio-polish :where(.cursor-tab-context-menu, .cursor-dropdown, .desk-explorer-view-dropdown, .cursor-settings-panel) {
          border-color: color-mix(in srgb, var(--cursor-accent) 12%, var(--color-cursor-border));
          box-shadow:
            0 18px 50px rgba(0, 0, 0, 0.34),
            0 0 0 1px rgba(255, 255, 255, 0.025),
            0 0 30px var(--studio-glow-soft);
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
        .studio-settings-menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 12px;
          margin-top: 14px;
        }
        .studio-settings-menu-card {
          display: flex;
          align-items: center;
          gap: 14px;
          min-height: 92px;
          border-radius: 20px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-border-soft));
          background:
            radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--cursor-accent) 16%, transparent), transparent 45%),
            color-mix(in srgb, var(--mos-surface) 70%, transparent);
          padding: 16px;
          color: var(--color-cursor-text);
          text-align: left;
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
          gap: 5px;
          min-width: 0;
        }
        .studio-settings-menu-copy strong {
          font-size: 14px;
          color: var(--color-cursor-text-bright);
        }
        .studio-settings-menu-copy small {
          color: var(--color-cursor-muted);
          font-size: 12px;
          line-height: 1.35;
        }
        .studio-account-card {
          display: grid;
          gap: 16px;
          padding: 16px !important;
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
          gap: 10px;
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
          height: 38px;
          border-radius: 12px;
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
          gap: 10px;
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
          border-color: color-mix(in srgb, var(--cursor-accent) 56%, var(--cursor-border-subtle));
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--cursor-accent) 24%, transparent) inset,
            0 0 28px var(--studio-glow-mid);
        }
        .studio-polish .studio-inline-tag:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 38%, var(--color-cursor-border-soft));
          box-shadow: 0 0 14px var(--studio-glow-soft);
        }
        .studio-polish .cursor-resize {
          transition: background 180ms ease, box-shadow 180ms ease;
        }
        .studio-polish .cursor-resize:hover {
          background: color-mix(in srgb, var(--cursor-accent) 16%, transparent);
          box-shadow: 0 0 18px var(--studio-glow-soft);
        }
        .studio-polish .desk-file-list-head {
          margin-top: 2px;
        }
        .studio-polish .desk-file-list-row {
          min-height: 30px;
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
          justify-content: center;
        }
        .studio-folder-pathbar {
          display: flex;
          align-items: center;
          gap: 4px;
          border-bottom: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 76%, transparent);
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
            background 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease !important;
        }
        .cursor-attach-tile-open:hover {
          border-color: color-mix(in srgb, var(--cursor-accent) 36%, var(--color-cursor-border)) !important;
          box-shadow: 0 0 18px color-mix(in srgb, var(--cursor-accent) 16%, transparent);
        }
        .studio-composer .cursor-composer {
          padding: 2px 10px max(8px, env(safe-area-inset-bottom, 8px));
        }
        .studio-composer .cursor-composer-box {
          padding: 0 !important;
        }
        .studio-composer .cursor-composer-textarea {
          flex: 1 1 160px;
          min-height: 24px !important;
          max-height: 168px;
          padding: 2px 4px !important;
        }
        .studio-composer-inputline {
          position: relative;
          display: flex;
          min-height: 42px;
          align-items: flex-start;
          gap: 6px;
          flex-wrap: wrap;
          padding: 10px 12px 4px;
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
          height: 22px;
          max-width: min(220px, 48vw);
          align-items: center;
          gap: 5px;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 22%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 12%, var(--color-cursor-hover));
          padding: 0 7px;
          color: var(--color-cursor-text);
          font-size: 12px;
          line-height: 1;
          white-space: nowrap;
          vertical-align: middle;
          cursor: grab;
        }
        .studio-inline-tag.is-dragging {
          opacity: 0.45;
          cursor: grabbing;
        }
        .studio-inline-tag-label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .studio-inline-tag-media {
          width: 15px;
          height: 15px;
          border-radius: 999px;
          object-fit: cover;
          flex-shrink: 0;
          background: var(--cursor-overlay-subtle);
        }
        .studio-inline-tag-kind {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--cursor-accent) 18%, transparent);
          color: var(--color-cursor-muted);
          flex-shrink: 0;
          font-size: 9px;
          font-weight: 700;
          line-height: 1;
        }
        .studio-inline-tag-kind svg {
          width: 10px;
          height: 10px;
          stroke-width: 2.5;
        }
        .studio-composer-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: nowrap;
          gap: 8px;
          padding: 4px 8px 8px;
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
          transition: background var(--cursor-ease), border-color var(--cursor-ease), box-shadow var(--cursor-ease);
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
          bottom: calc(100% + 6px) !important;
          left: 0 !important;
        }
        .studio-dropdown-menu.is-fixed {
          position: fixed !important;
          bottom: auto !important;
          top: auto;
          left: auto !important;
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
        .studio-composer-cost {
          display: inline-flex;
          height: 28px;
          align-items: center;
          border-radius: var(--cursor-radius-pill);
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 24%, var(--color-cursor-border-soft));
          background: color-mix(in srgb, var(--cursor-accent) 10%, transparent);
          padding: 0 9px;
          color: var(--cursor-accent);
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
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
          display: grid;
          grid-template-rows: auto minmax(0, 1fr);
          gap: 14px;
          height: 100%;
          padding: 18px;
        }
        .studio-asset-preview-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 16%, var(--color-cursor-border-soft));
          border-radius: 22px;
          background: color-mix(in srgb, var(--mos-surface) 70%, transparent);
          padding: 16px;
        }
        .studio-asset-preview-head h2 {
          color: var(--color-cursor-text-bright);
          font-size: 22px;
          font-weight: 760;
        }
        .studio-asset-preview-head p:not(.studio-section-kicker) {
          margin-top: 4px;
          color: var(--color-cursor-muted);
          font-size: 12px;
        }
        .studio-asset-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }
        .studio-asset-lightbox {
          min-height: 0;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--cursor-accent) 12%, var(--color-cursor-border-soft));
          border-radius: 24px;
          background:
            radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--cursor-accent) 12%, transparent), transparent 38%),
            color-mix(in srgb, var(--mos-bg) 92%, #03040a);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
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
          transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
        }
        .studio-price-card:hover,
        .studio-bank-card:hover,
        .studio-admin-card:hover {
          transform: translateY(-1px);
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
          transition: background var(--cursor-ease), border-color var(--cursor-ease);
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
          transition: transform var(--cursor-ease), background var(--cursor-ease);
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
          inset: -48px;
          border-radius: 999px;
          background: radial-gradient(circle, color-mix(in srgb, var(--cursor-accent) 26%, transparent), transparent 65%);
          filter: blur(10px);
          animation: studio-logo-breathe 3.8s ease-in-out infinite;
        }
        .studio-empty-logo img {
          position: relative;
          width: 148px;
          height: 148px;
          object-fit: contain;
          filter: drop-shadow(0 0 18px color-mix(in srgb, var(--cursor-accent) 26%, transparent));
        }
        @keyframes studio-logo-breathe {
          0%, 100% { opacity: 0.48; transform: scale(0.96); }
          50% { opacity: 0.9; transform: scale(1.05); }
        }
      `}</style>
      <PanelGroup direction="horizontal" autoSaveId="studio-main-h" className="min-w-0 flex-1">
        <Panel defaultSize={24} minSize={16} maxSize={42}>
      <aside className={STYLE.sidebar}>
        <div className={STYLE.panelHead}>
          <div className="cursor-project-btn cursor-explorer-title cursor-sidebar-brand min-w-0">
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
            <span className="cursor-sidebar-brand-text truncate">
              <span className="cursor-sidebar-brand-os">Studio</span>
              <span className="cursor-sidebar-brand-sep" aria-hidden="true">·</span>
              <span className="cursor-sidebar-brand-user">
                <span className="cursor-sidebar-brand-user-name truncate">
                  {currentUser?.phone ?? currentUser?.email ?? currentUser?.name ?? "Creator"}
                </span>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
            <button className="cursor-icon-btn" title="Add" onClick={() => setAddMenuOpen((open) => !open)}>
              <Plus className="h-4 w-4" />
            </button>
            {addMenuOpen ? (
              <div className="cursor-tab-context-menu absolute left-0 top-9 z-40 w-44">
                <button className="cursor-tab-context-item" onClick={() => { setCreateDialog({ kind: "folder" }); setAddMenuOpen(false); }}>Folder</button>
                <button className="cursor-tab-context-item" onClick={() => { setCreateDialog({ kind: "element" }); setAddMenuOpen(false); }}>Element</button>
                <button className="cursor-tab-context-item" onClick={() => { setCreateDialog({ kind: "script" }); setAddMenuOpen(false); }}>Script</button>
              </div>
            ) : null}
            </div>
            <button className="cursor-icon-btn" title="Upload" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
            </button>
            <ExplorerViewMenu viewMode={viewMode} onChange={setViewMode} />
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
        <PanelSearchBar value={search} onChange={setSearch} placeholder="Search Studio" aria-label="Search Studio" />
        <div className="studio-folder-pathbar">
          <FileBreadcrumbs path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <FileTree
            viewMode={viewMode}
            workspaceId={WORKSPACE_ID}
            rootEntries={rootEntries}
            flatEntries={currentEntries}
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
            searchBusy={search !== deferredSearch || currentEntries.loading}
            searchTruncated={searchState.truncated}
            onEntryContextMenu={(entry, x, y) => setContextMenu({ entry, x, y })}
            onBlankContextMenu={(x, y) => setContextMenu({ entry: { type: "blank", path: activeFolder?.name ?? "" }, x, y })}
          />
        </div>
      </aside>
        </Panel>
        <PanelResizeHandle className="cursor-resize" />
        <Panel defaultSize={76} minSize={42}>

      <main className={STYLE.main}>
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
            <CreditPill entitlement={entitlement} />
            <button className="cursor-icon-btn cursor-icon-btn-sm" title="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </header>
        <section className="min-h-0 flex-1 overflow-hidden">
          <ActivePane
            activeTab={activeTab}
            activeEntry={activeEntry}
            events={events}
            onAttach={attachEntry}
            onDuplicate={duplicateEntry}
            onRename={renameEntry}
            onTrash={trashEntry}
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
            payments={payments}
            notifications={notifications}
            onOpenSettings={() => setSettingsOpen(true)}
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
            resolution={resolution}
            setResolution={setResolution}
            durationSeconds={durationSeconds}
            setDurationSeconds={setDurationSeconds}
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            pricing={pricing}
            disabled={flowPending}
            status={status}
            onSubmit={handleSubmit}
            onDropEntry={(entry, range) => attachEntry(entry, range)}
            onUploadFiles={(files) => uploadComposerFiles(files)}
            uploadInputRef={composerUploadInputRef}
          />
        ) : null}
      </main>
        </Panel>
      </PanelGroup>

      {settingsOpen ? (
        <SettingsSheet
          currentUser={currentUser}
          billingAccount={billingAccount}
          pricing={pricing}
          payments={payments}
          notifications={notifications}
          onSignOut={() => void signOut()}
          onClose={() => setSettingsOpen(false)}
          onSeedPresets={() => void adminSeedStylePresets().then(() => setStatus("Style presets seeded."))}
          onSeedBank={() => void adminSeedBankAccount().then(() => setStatus("Bank account seeded."))}
          onSeedPricing={() => void adminSeedLaunchPricing({}).then(() => setStatus("Launch pricing seeded."))}
          onOpenAdminTab={openAdminTab}
          onOpenBillingTab={openBillingTab}
          onSaveAccount={(values) => void updateAccountDetails(values).then(() => setStatus("Account updated."))}
        />
      ) : null}
      {contextMenu ? (
        <ExplorerContextMenu
          entry={contextMenu.entry}
          x={contextMenu.x}
          y={contextMenu.y}
          canCreateFile
          canCreateFolder
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
            if (action === "new-folder") setCreateDialog({ kind: "folder" });
            if (action === "new-file") setCreateDialog({ kind: "script" });
            if (action === "copy-path") void navigator.clipboard?.writeText(entry.path ?? "");
            if (action === "download") handleEntryOpen(entry);
          }}
        />
      ) : null}
      {createDialog ? (
        <CreateStudioDialog
          initialKind={createDialog.kind}
          onClose={() => setCreateDialog(null)}
          onCreate={(values) => {
            void createStudioItem(values).then(() => setCreateDialog(null));
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
  resolution,
  setResolution,
  durationSeconds,
  setDurationSeconds,
  audioEnabled,
  setAudioEnabled,
  pricing,
  disabled,
  status,
  onSubmit,
  onDropEntry,
  onUploadFiles,
  uploadInputRef,
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [dropMarker, setDropMarker] = useState(null);
  const inputLineRef = useRef(null);
  const cost = composerCreditCost({ mode, imageTier, pricing });

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
      const voice = await import("@/desk/lib/voice-desk");
      if (recording) {
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
        throw new Error(STUDIO_VOICE_NOT_CONNECTED);
      }
      await voice.startRecording();
      setRecording(true);
    } catch (error) {
      console.error("Voice input failed", error);
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
      <div className="cursor-composer">
      <div className={`cursor-composer-box ${recording ? "is-recording" : ""} ${transcribing ? "is-transcribing" : ""}${dragOver ? " is-drop-target" : ""}`}>
        <div className="studio-composer-inputline" ref={inputLineRef}>
          {dropMarker ? (
            <span className="studio-composer-drop-caret" style={{ left: dropMarker.left, top: dropMarker.top, height: dropMarker.height }} />
          ) : null}
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Message Studio"
            className="cursor-composer-textarea cursor-composer-mention-editor"
            onInput={(event) => setDraft(readComposerEditorText(event.currentTarget))}
            onKeyDown={(event) => {
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
            <StudioDropdown
              value={mode}
              onChange={setMode}
              items={[
                { value: "script", label: "Script", icon: FileText },
                { value: "image", label: "Image", icon: ImageIcon },
                { value: "video", label: "Video", icon: Video },
              ]}
            />
            {mode === "image" ? (
              <StudioDropdown
                value={imageTier}
                onChange={setImageTier}
                items={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            ) : null}
            {mode !== "script" ? (
              <>
                <StudioDropdown
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  items={["16:9", "9:16", "1:1", "4:3"].map((value) => ({ value, label: value }))}
                />
                <StudioDropdown
                  value={resolution}
                  onChange={setResolution}
                  items={["1024x1024", "1280x720", "1920x1080"].map((value) => ({ value, label: value }))}
                />
              </>
            ) : null}
            {mode === "video" ? (
              <>
                <StudioDropdown
                  value={durationSeconds}
                  onChange={setDurationSeconds}
                  items={[
                    { value: "5", label: "5s" },
                    { value: "10", label: "10s" },
                  ]}
                />
                <button
                  type="button"
                  className="studio-pill-btn"
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  aria-pressed={audioEnabled}
                  title={audioEnabled ? "Audio on" : "Audio off"}
                >
                  Audio
                  <span className={`studio-audio-switch${audioEnabled ? " is-on" : ""}`} aria-hidden="true" />
                </button>
              </>
            ) : null}
            <span className="studio-composer-cost" title="Estimated generation cost">
              {mode === "script" ? "No credits" : `${cost} credits`}
            </span>
          </div>
          <div className="studio-composer-actions">
            <button
              type="button"
              className={`cursor-toolbar-icon ${recording ? "is-recording" : ""}`}
              title={transcribing ? "Transcribing..." : recording ? "Stop recording" : "Voice input"}
              onClick={() => void toggleVoice()}
              disabled={transcribing}
            >
              {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              disabled={disabled || !draft.trim()}
              onClick={() => void onSubmit()}
              className="cursor-toolbar-icon cursor-composer-submit"
              title="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        {status ? <p className="px-3 pb-2 text-xs text-red-300">{status}</p> : null}
        {voiceError ? <p className="px-3 pb-2 text-xs text-red-300">{voiceError}</p> : null}
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
        className={`cursor-toolbar-icon cursor-composer-mobile-menu${open ? " active" : ""}`}
        title="Attach/upload files"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <Plus className="h-3.5 w-3.5" />
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
                Upload image/video/md
              </button>
              <p className="studio-upload-hint">Files attach inline to this composer prompt.</p>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StudioDropdown({ value, onChange, items }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useFixedMenuPosition(open, wrapRef, 180);
  const active = items.find((item) => item.value === value) ?? items[0];
  const ActiveIcon = active?.icon;
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
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="studio-pill-btn"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        {ActiveIcon ? <ActiveIcon className="h-3.5 w-3.5" /> : null}
        <span>{active?.label}</span>
        <ChevronDown className="h-3 w-3 text-cursor-muted" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="cursor-tab-context-menu studio-dropdown-menu is-fixed"
              style={menuStyle}
            >
              {items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.value}
                    type="button"
                    className={`cursor-tab-context-item${item.value === value ? " active" : ""}`}
                    onClick={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    {ItemIcon ? <ItemIcon className="h-3.5 w-3.5" /> : null}
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

function CreateStudioDialog({ initialKind, onClose, onCreate }) {
  const kind = initialKind ?? "folder";
  const [name, setName] = useState("");
  const [elementType, setElementType] = useState("character");
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <form
        className="w-full max-w-sm rounded-2xl border border-cursor-border bg-cursor-sidebar p-4 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({ kind, name, elementType });
        }}
      >
        <h2 className="text-base font-semibold text-cursor-text-bright">Add to Studio</h2>
        <div className="mt-4 flex gap-2">
          <span className="inline-flex h-8 items-center rounded-lg border border-cursor-border bg-cursor-bg px-2 text-xs text-cursor-text">
            {kind === "folder" ? "Folder" : kind === "element" ? "Element" : "Script"}
          </span>
          {kind === "element" ? (
            <StudioDropdown
              value={elementType}
              onChange={setElementType}
              items={[
                { value: "character", label: "Character" },
                { value: "prop", label: "Prop" },
                { value: "location", label: "Location" },
                { value: "doc", label: "Doc" },
              ]}
            />
          ) : null}
        </div>
        <label className="mt-4 block text-xs font-medium text-cursor-muted">
          Name
          <input
            autoFocus
            className="mt-1 h-9 w-full rounded-lg border border-cursor-border bg-cursor-bg px-3 text-sm text-cursor-text outline-none focus:border-cursor-accent"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={kind === "folder" ? "Folder name" : kind === "script" ? "Script title" : "Element name"}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={STYLE.iconButton} onClick={onClose}>Cancel</button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex h-8 items-center rounded-lg bg-cursor-accent px-3 text-xs font-semibold text-black disabled:opacity-40"
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
    thumbnailUrl: attachment.thumbnailUrl,
    mediaUrl: attachment.mediaUrl,
  });
  token.addEventListener("dragstart", (event) => {
    token.classList.add("is-dragging");
    event.dataTransfer?.setData("application/x-studio-composer-token", JSON.stringify({
      ...JSON.parse(token.dataset.attachment ?? "{}"),
      tokenId: token.dataset.tokenId,
    }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  token.addEventListener("dragend", () => {
    token.classList.remove("is-dragging");
  });

  const kind = document.createElement("span");
  kind.className = "studio-inline-tag-kind";
  if (attachment.thumbnailUrl && (attachment.kind === "image" || attachment.kind === "video")) {
    const img = document.createElement("img");
    img.className = "studio-inline-tag-media";
    img.src = attachment.thumbnailUrl;
    img.alt = "";
    kind.appendChild(img);
  } else {
    kind.appendChild(createComposerTokenIcon(attachment.kind ?? attachment.studioKind ?? "file"));
  }

  const label = document.createElement("span");
  label.className = "studio-inline-tag-label";
  label.textContent = attachment.label;

  token.append(kind, label);
  return token;
}

function createComposerTokenIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  const paths =
    kind === "image"
      ? ["M15 8h.01", "M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z", "m3 16 5-5a2 2 0 0 1 3 0l5 5", "m14 14 1-1a2 2 0 0 1 3 0l3 3"]
      : kind === "video"
        ? ["m16 13 5 3V8l-5 3", "M3 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"]
        : kind === "audio"
          ? ["M9 18V5l12-2v13", "M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z", "M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"]
          : kind === "context" || kind === "element"
            ? ["M12 3v18", "M3 12h18", "m7 7 9-14", "m5 5 14 5"]
            : ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v6h6"];
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
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

function insertComposerAttachmentToken(editor, attachment, insertRange = null) {
  const range = normalizeComposerInsertRange(editor, insertRange ? insertRange.cloneRange() : ensureSelectionInEditor(editor));
  const token = createComposerAttachmentToken(attachment);
  const spacer = document.createTextNode(" ");
  range.deleteContents();
  range.insertNode(spacer);
  range.insertNode(token);
  range.setStartAfter(spacer);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
  if (!markerRect) {
    setDropMarker({ left: Math.max(12, event.clientX - hostRect.left), top: 10, height: emptyComposer ? 44 : 22 });
    return;
  }
  setDropMarker({
    left: Math.max(8, markerRect.left - hostRect.left),
    top: Math.max(8, markerRect.top - hostRect.top),
    height: emptyComposer ? 44 : Math.min(24, Math.max(18, markerRect.height || 22)),
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
  events,
  onAttach,
  onDuplicate,
  onRename,
  onTrash,
  onDocumentChange,
  onSwitchThreadFolder,
  adminTab,
  billingTab,
  currentUser,
  billingAccount,
  pricing,
  payments,
  notifications,
  onOpenSettings,
}) {
  if (activeTab.startsWith("composer:")) {
    return (
      <div className="cursor-chat-empty thread-empty cursor-chat-empty-logo-only">
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
        <div className="flex items-center justify-between border-b border-cursor-border px-4 py-2">
          <div>
            <p className="text-sm font-semibold text-cursor-text-bright">Generation history</p>
            <p className="text-xs text-cursor-muted">Saved to the folder linked when the tab was created.</p>
          </div>
          <button className={STYLE.iconButton} onClick={() => onSwitchThreadFolder(activeTab.slice("thread:".length))}>
            Switch to current folder
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          {(events ?? []).map((event) => (
            <article key={event._id} className="rounded-xl border border-cursor-border bg-cursor-panel p-3">
              <p className="text-xs uppercase tracking-wide text-cursor-muted">{event.kind}</p>
              {event.prompt ? <p className="mt-2 whitespace-pre-wrap text-sm text-cursor-text">{event.prompt}</p> : null}
              {event.stage ? <p className="mt-2 text-sm text-cursor-accent">{event.stage}</p> : null}
              {event.assetIds?.length ? <p className="mt-2 text-xs text-cursor-muted">{event.assetIds.length} output asset(s)</p> : null}
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
        payments={payments}
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
    return <div className="p-6 text-sm text-cursor-muted">Open something from the project tree.</div>;
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
  return (
    <div className="h-full overflow-auto p-6">
      <div className="rounded-2xl border border-cursor-border bg-cursor-panel p-5">
        <p className="text-xs uppercase tracking-wide text-cursor-muted">{activeEntry.kindLabel}</p>
        <h2 className="mt-2 text-2xl font-semibold text-cursor-text-bright">{activeEntry.name}</h2>
        {activeEntry.description ? <p className="mt-3 whitespace-pre-wrap text-sm text-cursor-muted">{activeEntry.description}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={STYLE.iconButton} onClick={() => onAttach(activeEntry)}>
            <Plus className="h-3.5 w-3.5" />
            Add to composer
          </button>
          <button className={STYLE.iconButton} onClick={() => onRename(activeEntry)}>Rename</button>
          {activeEntry.studioKind === "asset" || activeEntry.studioKind === "document" ? (
            <button className={STYLE.iconButton} onClick={() => onDuplicate(activeEntry)}>Duplicate</button>
          ) : null}
          <button className={STYLE.iconButton} onClick={() => onTrash(activeEntry)}>Trash</button>
        </div>
      </div>
    </div>
  );
}

function StudioAssetPreview({ entry, onAttach, onRename, onDuplicate, onTrash }) {
  const kind = inferAttachmentKind(entry);
  const mediaUrl = entry.mediaUrl;
  const thumbUrl = entry.thumbnailUrl ?? mediaUrl;
  return (
    <div className="studio-asset-preview">
      <header className="studio-asset-preview-head">
        <div>
          <p className="studio-section-kicker">{entry.kindLabel}</p>
          <h2>{entry.name}</h2>
          <p>{entry.mimeType ?? entry.description}</p>
        </div>
        <div className="studio-asset-actions">
          <button className={STYLE.iconButton} onClick={() => onAttach(entry)}>
            <Plus className="h-4 w-4" />
            Add to composer
          </button>
          <button className={STYLE.iconButton} onClick={() => onRename(entry)}>Rename</button>
          <button className={STYLE.iconButton} onClick={() => onDuplicate(entry)}>Duplicate</button>
          <button className={STYLE.iconButton} onClick={() => onTrash(entry)}>Trash</button>
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
            <p>No inline preview for this asset yet.</p>
            {mediaUrl ? <a href={mediaUrl} target="_blank" rel="noreferrer">Open file</a> : null}
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
            <p className="studio-section-kicker">{tab === "top-up" ? "Credit top up" : "Billing"}</p>
            <h2>{tab === "top-up" ? "Choose a credit pack" : "Subscription and balance"}</h2>
            <p>{billingAccount?.creditBalance ?? 0} credits available, {billingAccount?.reservedCredits ?? 0} reserved.</p>
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
              <p>{billingAccount?.subscription ? `Renews ${formatDate(billingAccount.subscription.currentPeriodEnd)}` : "Top up credits or activate a plan."}</p>
            </article>
            <article className="studio-admin-card">
              <p className="studio-admin-card-kicker">Balance</p>
              <h3>{billingAccount?.creditBalance ?? 0}</h3>
              <p>{billingAccount?.reservedCredits ?? 0} reserved for active generations.</p>
            </article>
            <article className="studio-admin-card">
              <p className="studio-admin-card-kicker">Recent payments</p>
              <h3>{payments?.length ?? 0}</h3>
              <p>{(payments ?? [])[0] ? `Latest: ${(payments ?? [])[0].status}` : "No payments yet."}</p>
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
  return (
    <div className="h-full overflow-auto p-6">
      <div className="studio-admin-workspace">
        <section className="studio-admin-hero-card">
          <div>
            <p className="studio-section-kicker">Admin workspace</p>
            <h2>{tab === "payments" ? "Payments and receipts" : "Launch pricing"}</h2>
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
              <p className="studio-admin-card-kicker">Generation costs</p>
              <div className="studio-credit-costs">
                <div className="studio-credit-cost"><span>Low image</span><strong>{pricing?.imageLowCredits ?? 2} credits</strong></div>
                <div className="studio-credit-cost"><span>Medium image</span><strong>{pricing?.imageMediumCredits ?? 5} credits</strong></div>
                <div className="studio-credit-cost"><span>High image</span><strong>{pricing?.imageHighCredits ?? 9} credits</strong></div>
                <div className="studio-credit-cost"><span>Video draft</span><strong>{pricing?.videoCredits ?? 35} credits</strong></div>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="studio-admin-grid-large">
              <article className="studio-admin-card">
                <p className="studio-admin-card-kicker">Credits</p>
                <h3>{billingAccount?.creditBalance ?? 0}</h3>
                <p>{billingAccount?.reservedCredits ?? 0} reserved for active generations.</p>
              </article>
              <article className="studio-admin-card">
                <p className="studio-admin-card-kicker">Pending payments</p>
                <h3>{pendingPayments.length}</h3>
                <p>Receipt review queue for bank transfers.</p>
              </article>
              <article className="studio-admin-card">
                <p className="studio-admin-card-kicker">Notifications</p>
                <h3>{notifications?.length ?? 0}</h3>
                <p>Recent account and generation notices.</p>
              </article>
            </section>
            <section className="studio-admin-card">
              <p className="studio-admin-card-kicker">Bank accounts</p>
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

function SettingsSheet({
  currentUser,
  billingAccount,
  pricing,
  payments,
  notifications,
  onSignOut,
  onClose,
  onSeedPresets,
  onSeedBank,
  onSeedPricing,
  onOpenAdminTab,
  onOpenBillingTab,
  onSaveAccount,
}) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const [tab, setTab] = useState("menu");
  const tabs = [
    ["menu", "Menu"],
    ["account", "Account"],
    ["billing", "Billing"],
    ["activity", "Activity"],
    ...(isAdmin ? [["admin", "Admin"]] : []),
  ];
  return (
    <div className="cursor-settings-overlay" role="dialog" aria-label="Studio settings">
      <button type="button" className="cursor-settings-backdrop" onClick={onClose} aria-label="Close settings" />
      <aside className="cursor-settings-panel">
        <header className="cursor-panel-head cursor-settings-head">
          <h2 className="min-w-0 flex-1 text-sm font-medium">Studio settings</h2>
          <div className="cursor-panel-head-tools">
            <button type="button" className="cursor-icon-btn cursor-icon-btn-sm" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>
        <nav className="cursor-settings-tabs">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cursor-settings-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <span className="cursor-settings-tab-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="cursor-settings-body">
          {tab === "menu" ? (
            <SettingsMenuGrid
              isAdmin={isAdmin}
              onOpenAccount={() => setTab("account")}
              onOpenBilling={() => setTab("billing")}
              onOpenTopUp={() => onOpenBillingTab("top-up")}
              onOpenActivity={() => setTab("activity")}
              onOpenAdmin={() => setTab("admin")}
            />
          ) : null}

          {tab === "account" ? (
            <>
              <AccountDetailsCard currentUser={currentUser} onSave={onSaveAccount} onSignOut={onSignOut} />
              <ThemeSettings />
            </>
          ) : null}

          {tab === "billing" ? (
            <>
              <section className="cursor-settings-section studio-billing-hero">
                <div>
                  <p className="studio-section-kicker">Credit balance</p>
                  <h3>{billingAccount?.creditBalance ?? 0} credits</h3>
                  <p className="text-xs text-cursor-muted">{billingAccount?.reservedCredits ?? 0} reserved for active generations</p>
                </div>
                {pricing ? (
                  <div className="studio-rate-grid">
                    <span>Low image <b>{pricing.imageLowCredits}</b></span>
                    <span>Medium <b>{pricing.imageMediumCredits}</b></span>
                    <span>High <b>{pricing.imageHighCredits}</b></span>
                    <span>Video <b>{pricing.videoCredits}</b></span>
                  </div>
                ) : null}
              </section>

              <section className="cursor-settings-section">
                <div className="studio-section-head">
                  <div>
                    <p className="studio-section-kicker">Subscription</p>
                    <h3>{billingAccount?.subscription?.planName ?? "No active subscription"}</h3>
                    <p className="text-xs text-cursor-muted">
                      {billingAccount?.subscription
                        ? `Renews ${formatDate(billingAccount.subscription.currentPeriodEnd)}`
                        : "Credit top-up is available in a dedicated workspace tab."}
                    </p>
                  </div>
                  <button type="button" className="cursor-settings-action" onClick={() => onOpenBillingTab("top-up")}>
                    <CircleDollarSign className="h-4 w-4" />
                    Open top up
                  </button>
                </div>
              </section>

              <section className="cursor-settings-section">
                <div className="studio-section-head">
                  <div>
                    <p className="studio-section-kicker">Rates</p>
                    <h3>Generation pricing</h3>
                  </div>
                </div>
                <div className="studio-credit-costs">
                  <div className="studio-credit-cost"><span>Low image</span><strong>{pricing?.imageLowCredits ?? 2} credits</strong></div>
                  <div className="studio-credit-cost"><span>Medium image</span><strong>{pricing?.imageMediumCredits ?? 5} credits</strong></div>
                  <div className="studio-credit-cost"><span>High image</span><strong>{pricing?.imageHighCredits ?? 9} credits</strong></div>
                  <div className="studio-credit-cost"><span>Video draft</span><strong>{pricing?.videoCredits ?? 35} credits</strong></div>
                </div>
              </section>
            </>
          ) : null}

          {tab === "activity" ? (
            <section className="cursor-settings-section">
              <h3>Recent activity</h3>
              <div className="space-y-1 text-xs text-cursor-muted">
                {(notifications ?? []).slice(0, 3).map((item) => (
                  <p key={item._id}>{item.title}: {item.body}</p>
                ))}
                {(payments ?? []).slice(0, 3).map((item) => (
                  <p key={item._id}>Payment {item.status}: ${(item.amountCents / 100).toFixed(2)}</p>
                ))}
                {!notifications?.length && !payments?.length ? <p>No recent billing or notification activity.</p> : null}
              </div>
            </section>
          ) : null}

          {tab === "admin" && isAdmin ? (
            <section className="cursor-settings-section studio-admin-panel">
              <div className="studio-section-head">
                <div>
                  <p className="studio-section-kicker">Admin control</p>
                  <h3>Launch operations</h3>
                </div>
                <span className="studio-admin-chip">{currentUser?.role}</span>
              </div>
              <div className="studio-admin-grid">
                <button className="cursor-settings-action" onClick={onSeedPresets}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Seed presets
                </button>
                <button className="cursor-settings-action" onClick={onSeedBank}>
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Seed First Citizens bank
                </button>
                <button className="cursor-settings-action" onClick={onSeedPricing}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Seed launch pricing
                </button>
                <button className="cursor-settings-action" onClick={() => onOpenBillingTab("top-up")}>
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Open top up
                </button>
                <button className="cursor-settings-action" onClick={() => onOpenAdminTab("pricing")}>
                  <Settings className="h-3.5 w-3.5" />
                  Open pricing tab
                </button>
                <button className="cursor-settings-action" onClick={() => onOpenAdminTab("payments")}>
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Open payments tab
                </button>
              </div>
              <p className="mt-3 text-xs text-cursor-muted">
                Admin bank seed creates First Citizens · Tishara Sophia Aaron · 2617327 · Savings when no enabled account exists.
              </p>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function SettingsMenuGrid({ isAdmin, onOpenAccount, onOpenBilling, onOpenTopUp, onOpenActivity, onOpenAdmin }) {
  const items = [
    { label: "Account details", body: "Name, email, phone, sign out", icon: Settings, onClick: onOpenAccount },
    { label: "Billing", body: "Subscription, renewal, credits", icon: CircleDollarSign, onClick: onOpenBilling },
    { label: "Credit top up", body: "Open packs and bank transfer", icon: Plus, onClick: onOpenTopUp },
    { label: "Activity", body: "Payments and notifications", icon: Sparkles, onClick: onOpenActivity },
    ...(isAdmin ? [{ label: "Admin", body: "Pricing and receipts tools", icon: Settings, onClick: onOpenAdmin }] : []),
  ];
  return (
    <section className="cursor-settings-section studio-settings-menu">
      <div className="studio-section-head">
        <div>
          <p className="studio-section-kicker">Settings home</p>
          <h3>Choose what to manage</h3>
        </div>
      </div>
      <div className="studio-settings-menu-grid">
        {items.map((item) => {
          const ItemIcon = item.icon;
          return (
            <button key={item.label} type="button" className="studio-settings-menu-card" onClick={item.onClick}>
              <span className="studio-settings-menu-icon"><ItemIcon className="h-6 w-6" /></span>
              <span className="studio-settings-menu-copy">
                <strong>{item.label}</strong>
                <small>{item.body}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AccountDetailsCard({ currentUser, onSave, onSignOut }) {
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
      <div className="studio-account-hero">
        <div className="studio-account-avatar" aria-hidden>
          {(name || email || phone || "C").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="studio-section-kicker">Account details</p>
          <h3>{name || "Creator account"}</h3>
          <p>{currentUser?.role ?? "user"} · {email || phone || "Add contact details"}</p>
        </div>
      </div>
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
        <label>
          <span>Role</span>
          <input value={currentUser?.role ?? "user"} readOnly />
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
        <button type="button" className="cursor-settings-action muted" onClick={onSignOut}>
          Sign out
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
  const pricePerCredit = (pricing?.creditPriceCents ?? 100) / 100;
  const makePrice = (credits) => `$${Math.round(credits * pricePerCredit).toLocaleString()}`;
  return [
    {
      name: "Starter",
      badge: "Try",
      credits: 25,
      price: makePrice(25),
      features: ["5 medium images", "Folder context", "Bank top-up"],
    },
    {
      name: "Studio",
      badge: "Popular",
      credits: 100,
      price: makePrice(100),
      featured: true,
      features: ["20 medium images", "2-3 video drafts", "Best creator value"],
    },
    {
      name: "Production",
      badge: "Scale",
      credits: 300,
      price: makePrice(300),
      features: ["High-res iteration", "8+ video drafts", "Team-ready balance"],
    },
  ];
}

function composerCreditCost({ mode, imageTier, pricing }) {
  if (mode === "script") return 0;
  if (mode === "video") return pricing?.videoCredits ?? 35;
  if (imageTier === "low") return pricing?.imageLowCredits ?? 2;
  if (imageTier === "high") return pricing?.imageHighCredits ?? 9;
  return pricing?.imageMediumCredits ?? 5;
}

function formatDate(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function CreditPill({ entitlement }) {
  return (
    <span className="rounded-full border border-cursor-border bg-cursor-panel px-2 py-1 text-[11px] text-cursor-muted">
      {entitlement ? `${entitlement.creditBalance} credits` : "Credits"}
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
      ...(elements ?? []).map(elementToEntry),
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
    kindLabel: "Script document",
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
    kindLabel: `${asset.kind} asset`,
    description: asset.mimeType,
    mediaUrl: asset.signedReadUrl,
    thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
  };
}

function elementToEntry(element) {
  return {
    type: "file",
    name: `@${element.name}`,
    path: `/Studio/elements/${element._id}.element`,
    modified: element.updatedAt,
    mtimeMs: element.updatedAt,
    ext: ".element",
    studioKind: "element",
    studioId: element._id,
    kindLabel: `${element.type} element`,
    description: element.description,
  };
}

function studioPathForFolder(folder) {
  return `/Studio/${folder.name}`;
}

function tabDescriptor({ key, threads, assets, documents, elements, snapshots }) {
  if (key.startsWith("composer:")) {
    return { key, kind: "chat", title: key === COMPOSER_TAB ? "Composer" : "New composer", status: "ready" };
  }
  if (key.startsWith("admin:")) {
    const kind = key.slice("admin:".length);
    const title = kind === "payments" ? "Admin payments" : kind === "pricing" ? "Admin pricing" : "Admin";
    return { key, kind: "settings", title, status: "ready" };
  }
  if (key.startsWith("billing:")) {
    const kind = key.slice("billing:".length);
    const title = kind === "top-up" ? "Credit top up" : "Billing";
    return { key, kind: "settings", title, status: "ready" };
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
    return item ? elementToEntry(item) : snapshots?.[key] ?? null;
  }
  return null;
}

function entryToAttachment(entry) {
  const kind = entry.studioKind === "asset" ? inferAttachmentKind(entry) : entry.studioKind === "document" ? "file" : "context";
  return {
    id: `${entry.studioKind}:${entry.studioId}`,
    kind,
    label: entry.name.replace(/^@/, ""),
    path: entry.path,
    filename: entry.name,
    studioKind: entry.studioKind,
    studioId: entry.studioId,
    thumbnailUrl: entry.thumbnailUrl,
    mediaUrl: entry.mediaUrl,
  };
}

function inferAttachmentKind(entry) {
  if (entry.ext === ".png") return "image";
  if (entry.ext === ".mp4") return "video";
  if (entry.ext === ".mp3") return "audio";
  return "file";
}

function buildPromptWithAttachments(prompt, attachments) {
  if (!attachments.length) return prompt.trim();
  const refs = attachments.map((item) => `@${item.label}`).join(", ");
  return `${prompt.trim()}\n\nReferences: ${refs}`;
}

function kindFromMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}
