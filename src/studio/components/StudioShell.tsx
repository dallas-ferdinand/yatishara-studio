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
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ExplorerContextMenu } from "@/desk/components/ExplorerContextMenu";
import { ExplorerViewMenu } from "@/desk/components/ExplorerViewMenu";
import { FileBreadcrumbs } from "@/desk/components/FileBreadcrumbs";
import { FileTree } from "@/desk/components/FileTree";
import { MarkdownDocEditor } from "@/desk/components/MarkdownDocEditor";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { ThemeSettings } from "@/desk/components/ThemeSettings";
import { UnifiedTabStrip } from "@/desk/components/UnifiedTabStrip";
import { readExplorerDragData } from "@/desk/lib/explorer-dnd";
import { MERCURY_LOGO_SIDEBAR, mercuryLogoAssets } from "@/lib/brand-assets";

const WORKSPACE_ID = "yatishara-studio";
const COMPOSER_TAB = "composer:main";
const MERCURY_EMPTY_LOGO = mercuryLogoAssets(96);

const STYLE = {
  shell: "flex h-dvh min-h-0 bg-cursor-bg text-cursor-text",
  sidebar: "flex h-full w-full min-w-0 flex-col border-r border-cursor-border bg-cursor-sidebar",
  main: "flex min-w-0 flex-1 flex-col bg-cursor-bg",
  panelHead: "cursor-panel-head justify-between",
  iconButton:
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-cursor-border bg-cursor-panel px-2 text-xs text-cursor-muted transition hover:border-cursor-accent/50 hover:bg-cursor-hover hover:text-cursor-text",
};

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
  const runFlow = useAction(api.generationActions.runFlow);
  const adminSeedStylePresets = useMutation(api.stylePresets.adminSeedDefaults);
  const adminSeedBankAccount = useMutation(api.billing.adminSeedBankAccountFromEnv);

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
  const fileInputRef = useRef(null);
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

  const currentEntries = useMemo(
    () =>
      buildFlatEntries({
        folder: activeFolder,
        folders: childFolders,
        assets,
        documents,
        elements: elements?.filter((element) => element.folderId === activeFolder?._id),
      }),
    [activeFolder, childFolders, assets, documents, elements],
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

  const pathToEntry = useMemo(() => {
    const map = new Map();
    for (const entry of [...(rootEntries.entries ?? []), ...(currentEntries.entries ?? [])]) {
      map.set(entry.path, entry);
    }
    return map;
  }, [rootEntries, currentEntries]);

  const visibleEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (currentEntries.entries ?? []).filter((entry) =>
      String(entry.name ?? "").toLowerCase().includes(q),
    );
  }, [currentEntries, search]);

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

  function attachEntry(entry) {
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
      if (!exists) insertComposerAttachmentToken(editor, attachment);
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
    <div className={`${STYLE.shell} studio-polish`}>
      <style jsx global>{`
        .studio-polish {
          --studio-glow-soft: color-mix(in srgb, var(--cursor-accent) 14%, transparent);
          --studio-glow-mid: color-mix(in srgb, var(--cursor-accent) 24%, transparent);
          --studio-surface-hover: color-mix(in srgb, var(--cursor-accent) 5%, var(--color-cursor-hover));
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
          display: flex;
          min-height: 42px;
          align-items: flex-start;
          gap: 6px;
          flex-wrap: wrap;
          padding: 10px 12px 4px;
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
        <FileBreadcrumbs path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <FileTree
            viewMode={viewMode}
            workspaceId={WORKSPACE_ID}
            rootEntries={rootEntries}
            flatEntries={currentEntries}
            listDir={() => {}}
            onNavigate={(path) => {
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
            searchResults={visibleEntries}
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
            disabled={flowPending}
            status={status}
            onSubmit={handleSubmit}
            onDropEntry={(entry) => attachEntry(entry)}
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
          bankAccounts={bankAccounts}
          payments={payments}
          notifications={notifications}
          onSignOut={() => void signOut()}
          onClose={() => setSettingsOpen(false)}
          onSeedPresets={() => void adminSeedStylePresets().then(() => setStatus("Style presets seeded."))}
          onSeedBank={() => void adminSeedBankAccount().then(() => setStatus("Bank account seeded."))}
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
  disabled,
  status,
  onSubmit,
  onDropEntry,
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
      const voice = await import("@/desk/lib/voice-desk");
      if (recording) {
        setRecording(false);
        setTranscribing(true);
        const data = await voice.stopRecording();
        const text = await voice.transcribeRecording(data);
        if (text?.trim()) {
          const current = editorRef.current ? readComposerEditorText(editorRef.current) : draft;
          setEditorText(`${current}${current ? " " : ""}${text.trim()}`);
        }
        return;
      }
      await voice.startRecording();
      setRecording(true);
    } catch (error) {
      console.error("Voice input failed", error);
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
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const entry = readExplorerDragData(event.dataTransfer);
        if (entry) onDropEntry(entry);
      }}
    >
      <div className="cursor-composer">
      <div className={`cursor-composer-box ${recording ? "is-recording" : ""} ${transcribing ? "is-transcribing" : ""}${dragOver ? " is-drop-target" : ""}`}>
        <div className="studio-composer-inputline">
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
      </div>
      </div>
    </div>
  );
}

function StudioDropdown({ value, onChange, items }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const active = items.find((item) => item.value === value) ?? items[0];
  const ActiveIcon = active?.icon;
  useEffect(() => {
    if (!open) return;
    const onDoc = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
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
      {open ? (
        <div className="cursor-tab-context-menu studio-dropdown-menu absolute bottom-9 left-0 z-40">
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
        </div>
      ) : null}
    </div>
  );
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
  token.dataset.attachmentId = attachment.id;
  token.dataset.label = attachment.label;
  token.dataset.kind = attachment.kind ?? "file";

  const kind = document.createElement("span");
  kind.className = "studio-inline-tag-kind";
  kind.textContent = (attachment.kind ?? attachment.studioKind ?? "file").slice(0, 1).toUpperCase();

  const label = document.createElement("span");
  label.className = "studio-inline-tag-label";
  label.textContent = attachment.label;

  token.append(kind, label);
  return token;
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

function insertComposerAttachmentToken(editor, attachment) {
  const range = ensureSelectionInEditor(editor);
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
  if (id) setAttachments((items) => items.filter((item) => item.id !== id));
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

function ActivePane({ activeTab, activeEntry, events, onAttach, onDuplicate, onRename, onTrash, onDocumentChange, onSwitchThreadFolder }) {
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
  if (!activeEntry) {
    return <div className="p-6 text-sm text-cursor-muted">Open something from the project tree.</div>;
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

function SettingsSheet({
  currentUser,
  billingAccount,
  pricing,
  bankAccounts,
  payments,
  notifications,
  onSignOut,
  onClose,
  onSeedPresets,
  onSeedBank,
}) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const [tab, setTab] = useState("general");
  const tabs = [
    ["general", "General"],
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
          {tab === "general" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Account</h3>
                <p className="mb-2 text-xs text-cursor-muted">{currentUser?.email ?? currentUser?.phone ?? "Signed in"}</p>
                <button className="cursor-settings-action muted" onClick={onSignOut}>Sign out</button>
              </section>
              <ThemeSettings />
            </>
          ) : null}

          {tab === "billing" ? (
            <>
              <section className="cursor-settings-section">
                <h3>Billing</h3>
                <p className="text-sm text-cursor-text">
                  {billingAccount?.creditBalance ?? 0} credits
                  <span className="text-cursor-muted"> · {billingAccount?.reservedCredits ?? 0} reserved</span>
                </p>
                {pricing ? (
                  <p className="mt-1 text-xs text-cursor-muted">
                    Low {pricing.imageLowCredits} · Medium {pricing.imageMediumCredits} · High {pricing.imageHighCredits} · Video {pricing.videoCredits}
                  </p>
                ) : null}
              </section>

              <section className="cursor-settings-section">
                <h3>Bank accounts</h3>
                <div className="space-y-2">
                  {(bankAccounts ?? []).map((bank) => (
                    <div key={bank._id} className="rounded-lg border border-cursor-border/70 p-2 text-xs text-cursor-muted">
                      <p className="font-medium text-cursor-text">{bank.label}</p>
                      <CopyLine label="Bank" value={bank.bankName} />
                      <CopyLine label="Name" value={bank.accountName} />
                      <CopyLine label="Number" value={bank.accountNumber} />
                      <CopyLine label="Type" value={bank.accountType} />
                    </div>
                  ))}
                  {bankAccounts?.length === 0 ? <p className="text-xs text-cursor-muted">No enabled bank account yet.</p> : null}
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
            <section className="cursor-settings-section">
              <h3>Admin setup</h3>
              <div className="flex flex-wrap gap-2">
                <button className="cursor-settings-action" onClick={onSeedPresets}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Seed presets
                </button>
                <button className="cursor-settings-action" onClick={onSeedBank}>
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Seed bank from env
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function CopyLine({ label, value }) {
  return (
    <p className="mt-1 flex items-center justify-between gap-2">
      <span>{label}: {value}</span>
      <button
        className="rounded border border-cursor-border px-1.5 py-0.5 text-[10px] text-cursor-text hover:bg-cursor-hover"
        onClick={() => void navigator.clipboard?.writeText(String(value))}
      >
        Copy
      </button>
    </p>
  );
}

function CreditPill({ entitlement }) {
  return (
    <span className="rounded-full border border-cursor-border bg-cursor-panel px-2 py-1 text-[11px] text-cursor-muted">
      {entitlement ? `${entitlement.creditBalance} credits` : "Credits"}
    </span>
  );
}

function buildFlatEntries({ folder, folders, assets, documents, elements }) {
  return {
    loading: !folder,
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
