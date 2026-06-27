// @ts-nocheck
"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUp,
  Bell,
  Box,
  ChevronDown,
  CircleDollarSign,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Infinity,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ExplorerContextMenu } from "@/desk/components/ExplorerContextMenu";
import { ExplorerViewMenu } from "@/desk/components/ExplorerViewMenu";
import { FileBreadcrumbs } from "@/desk/components/FileBreadcrumbs";
import { FileTree } from "@/desk/components/FileTree";
import { PanelSearchBar } from "@/desk/components/PanelSearchBar";
import { UnifiedTabStrip } from "@/desk/components/UnifiedTabStrip";
import { readExplorerDragData } from "@/desk/lib/explorer-dnd";

const WORKSPACE_ID = "yatishara-studio";
const COMPOSER_TAB = "composer:main";

const STYLE = {
  shell: "flex h-dvh min-h-0 bg-cursor-bg text-cursor-text",
  sidebar: "flex w-[310px] shrink-0 flex-col border-r border-cursor-border bg-cursor-sidebar",
  main: "flex min-w-0 flex-1 flex-col bg-cursor-bg",
  panelHead: "flex h-11 shrink-0 items-center justify-between border-b border-cursor-border bg-cursor-panel px-3",
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
    () => navTrail.map((crumb) => crumb.name).join("/"),
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
    if (!path || path === "Studio") {
      const root = navTrail[0] ?? (topFolders?.[0] ? { id: topFolders[0]._id, name: topFolders[0].name } : null);
      if (!root) return;
      setActiveFolderId(root.id);
      setNavTrail([root]);
      return;
    }
    const parts = path.split("/").filter(Boolean);
    const index = parts.length - 1;
    const target = navTrail[index];
    if (!target) return;
    const nextTrail = navTrail.slice(0, index + 1);
    setNavTrail(nextTrail);
    setActiveFolderId(target.id);
  }

  function attachEntry(entry) {
    if (!entry || entry.type === "parent") return;
    const attachment = entryToAttachment(entry);
    setAttachments((items) =>
      items.some((item) => item.id === attachment.id) ? items : [...items, attachment],
    );
    setDraft((text) => `${text}${text.endsWith(" ") || !text ? "" : " "}@${attachment.label} `);
    editorRef.current?.focus();
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
    <div className={STYLE.shell} data-appearance="dark">
      <aside className={STYLE.sidebar}>
        <div className={STYLE.panelHead}>
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-cursor-border bg-cursor-bg text-cursor-accent">
              <Infinity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-cursor-text-bright">Studio</p>
              <p className="truncate text-[11px] text-cursor-muted">
                {currentUser?.name ?? currentUser?.email ?? currentUser?.phone ?? "Creator"}
              </p>
            </div>
          </div>
          <button className="cursor-icon-btn cursor-icon-btn-sm" title="Sign out" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 border-b border-cursor-border px-2 py-2">
          <div className="relative">
            <button className="cursor-icon-btn" title="Add" onClick={() => setAddMenuOpen((open) => !open)}>
              <Plus className="h-4 w-4" />
            </button>
            {addMenuOpen ? (
              <div className="cursor-tab-context-menu absolute left-0 top-9 z-40 w-44">
                <button className="cursor-tab-context-item" onClick={() => { setCreateDialog({ kind: "folder" }); setAddMenuOpen(false); }}>Folder</button>
                <button className="cursor-tab-context-item" onClick={() => { setCreateDialog({ kind: "element" }); setAddMenuOpen(false); }}>Element</button>
                <button className="cursor-tab-context-item" onClick={() => { setCreateDialog({ kind: "script" }); setAddMenuOpen(false); }}>Script/document</button>
              </div>
            ) : null}
          </div>
          <button className="cursor-icon-btn" title="Upload" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
          </button>
          <div className="ml-auto">
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
        <FileBreadcrumbs path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
        <PanelSearchBar value={search} onChange={setSearch} placeholder="Search Studio" aria-label="Search Studio" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <FileTree
            viewMode={viewMode}
            workspaceId={WORKSPACE_ID}
            rootEntries={rootEntries}
            flatEntries={currentEntries}
            listDir={() => {}}
            onNavigate={(path) => {
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
            onSwitchThreadFolder={(threadId) => {
              if (!activeFolder) return;
              void switchThreadFolder({ threadId, folderId: activeFolder._id });
            }}
          />
        </section>
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
      </main>

      {settingsOpen ? (
        <SettingsSheet
          currentUser={currentUser}
          billingAccount={billingAccount}
          pricing={pricing}
          bankAccounts={bankAccounts}
          payments={payments}
          notifications={notifications}
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
  return (
    <div
      className="border-t border-cursor-border bg-cursor-composer px-4 py-3"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const entry = readExplorerDragData(event.dataTransfer);
        if (entry) onDropEntry(entry);
      }}
    >
      <div className="mx-auto max-w-5xl rounded-2xl border border-cursor-border bg-cursor-panel p-2 shadow-2xl shadow-black/20">
        <div className="px-2 pt-2">
          <StudioAttachmentRow
            items={attachments}
            onRemove={(item) => setAttachments((items) => items.filter((entry) => entry.id !== item.id))}
          />
        </div>
        <div className="px-2 pt-1">
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Message Studio"
            className="cursor-composer-textarea cursor-composer-mention-editor min-h-16"
            onInput={(event) => setDraft(event.currentTarget.innerText ?? "")}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onSubmit();
              }
            }}
          >
            {draft}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-2">
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
              <label className="flex items-center gap-1 text-xs text-cursor-muted">
                <input type="checkbox" checked={audioEnabled} onChange={(e) => setAudioEnabled(e.target.checked)} />
                Audio
              </label>
            </>
          ) : null}
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={() => void onSubmit()}
            className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-cursor-accent text-black transition hover:bg-cursor-accent-hover disabled:opacity-40"
            title="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        {status ? <p className="px-3 pb-2 text-xs text-red-300">{status}</p> : null}
      </div>
    </div>
  );
}

function StudioDropdown({ value, onChange, items }) {
  const [open, setOpen] = useState(false);
  const active = items.find((item) => item.value === value) ?? items[0];
  const ActiveIcon = active?.icon;
  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cursor-border bg-cursor-bg px-2 text-xs text-cursor-text hover:bg-cursor-hover"
        onClick={() => setOpen((state) => !state)}
      >
        {ActiveIcon ? <ActiveIcon className="h-3.5 w-3.5" /> : null}
        <span>{active?.label}</span>
        <ChevronDown className="h-3 w-3 text-cursor-muted" />
      </button>
      {open ? (
        <div className="cursor-tab-context-menu absolute bottom-9 left-0 z-40 min-w-36">
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
  const [kind, setKind] = useState(initialKind ?? "folder");
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
          <StudioDropdown
            value={kind}
            onChange={setKind}
            items={[
              { value: "folder", label: "Folder", icon: Plus },
              { value: "element", label: "Element", icon: Box },
              { value: "script", label: "Script/document", icon: FileText },
            ]}
          />
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

function StudioAttachmentRow({ items, onRemove }) {
  if (!items?.length) return null;
  return (
    <div className="cursor-attach-tiles">
      {items.map((item) => (
        <span key={item.id} className="cursor-attach-tile is-tag" data-attach-kind={item.kind ?? "file"}>
          <span className="cursor-attach-tile-open">
            <span className="cursor-attach-tile-icon">
              {item.kind === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : item.kind === "video" ? <Video className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
            </span>
            <span className="cursor-attach-tile-label">{item.label}</span>
          </span>
          <button
            type="button"
            className="cursor-attach-tile-remove"
            aria-label="Remove"
            onClick={() => onRemove(item)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

function ActivePane({ activeTab, activeEntry, events, onAttach, onDuplicate, onRename, onTrash, onSwitchThreadFolder }) {
  if (activeTab.startsWith("composer:")) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="max-w-xl">
          <Clapperboard className="mx-auto h-12 w-12 text-cursor-accent" />
          <h1 className="mt-4 text-2xl font-semibold text-cursor-text-bright">Studio composer</h1>
          <p className="mt-2 text-sm text-cursor-muted">
            Open folders/assets/scripts/elements as tabs. Use the bottom MercuryOS composer to create scripts, images, or videos.
          </p>
        </div>
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
  onClose,
  onSeedPresets,
  onSeedBank,
}) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={onClose}>
      <aside
        className="h-full w-full max-w-md border-l border-cursor-border bg-cursor-sidebar p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-cursor-text-bright">Studio settings</h2>
            <p className="text-xs text-cursor-muted">{currentUser?.email ?? currentUser?.phone ?? "Signed in"}</p>
          </div>
          <button className="cursor-icon-btn cursor-icon-btn-sm" onClick={onClose}>×</button>
        </div>
        <div className="mt-5 space-y-3">
          <section className="rounded-xl border border-cursor-border bg-cursor-panel p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-cursor-text-bright">
              <CircleDollarSign className="h-4 w-4 text-cursor-accent" />
              Billing
            </div>
            <p className="mt-2 text-sm text-cursor-text">
              {billingAccount?.creditBalance ?? 0} credits
              <span className="text-cursor-muted"> · {billingAccount?.reservedCredits ?? 0} reserved</span>
            </p>
            {pricing ? (
              <p className="mt-1 text-xs text-cursor-muted">
                Low {pricing.imageLowCredits} · Medium {pricing.imageMediumCredits} · High {pricing.imageHighCredits} · Video {pricing.videoCredits}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-cursor-border bg-cursor-panel p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-cursor-text-bright">
              <CircleDollarSign className="h-4 w-4 text-cursor-accent" />
              Bank accounts
            </div>
            <div className="mt-2 space-y-2">
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

          <section className="rounded-xl border border-cursor-border bg-cursor-panel p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-cursor-text-bright">
              <Bell className="h-4 w-4 text-cursor-accent" />
              Recent activity
            </div>
            <div className="mt-2 space-y-1 text-xs text-cursor-muted">
              {(notifications ?? []).slice(0, 3).map((item) => (
                <p key={item._id}>{item.title}: {item.body}</p>
              ))}
              {(payments ?? []).slice(0, 3).map((item) => (
                <p key={item._id}>Payment {item.status}: ${(item.amountCents / 100).toFixed(2)}</p>
              ))}
              {!notifications?.length && !payments?.length ? <p>No recent billing or notification activity.</p> : null}
            </div>
          </section>

          {isAdmin ? (
            <section className="rounded-xl border border-cursor-border bg-cursor-panel p-3">
              <p className="text-sm font-semibold text-cursor-text-bright">Admin setup</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={STYLE.iconButton} onClick={onSeedPresets}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Seed presets
                </button>
                <button className={STYLE.iconButton} onClick={onSeedBank}>
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
