// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { EditorPanel } from "./EditorPanel";
import { ExplorerPanel, ExplorerFullscreen } from "./ExplorerPanel";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { SettingsPanel } from "./SettingsPanel";
import { WorkspacePanel } from "./WorkspacePanel";
import { ShellStatusStrip } from "./ShellStatusStrip";
import { api, createChat, setActiveChat, closeAgentTab, openAgentTabs, requestHealAlert, attachWorkspacePathToChat, isChatBusy, ensureChatHealed } from "@/desk/lib/agent-run";
import { setDeskWorkspace } from "@mos-app/store.js";
import { tabId, fileExt, closeTab, closeAllTabs, tabsForWorkspace, editorTabFromSaved, hydrateEditorTabContent } from "@/desk/lib/editor-tabs";
import { fileViewerKind, isEditableInTab, defaultEditorViewMode } from "@/desk/lib/file-kind";
import { workspaceFileRawUrl } from "@/desk/lib/workspace-file-url.js";
import { scheduleVideoPrefetch } from "@/desk/lib/video-chunk-prefetch.js";
import { externalPreviewUrl } from "@mos-app/preview.js";
import { MERCURYOS_WORKSPACE_ID } from "@/desk/lib/workspace";
import {
  collectDroppedUploadFiles,
  healExplorerUploadJobsOnBoot,
  listExplorerUploadJobs,
  removeExplorerUploadJob,
} from "@/desk/lib/explorer-upload-queue";
import {
  createExplorerUploadJob,
  retryExplorerUpload,
  runExplorerUpload,
  cancelExplorerUpload,
} from "@/desk/lib/explorer-upload-runner";
import { deleteWorkspaceFile, renameWorkspaceFile, createExplorerFile, createExplorerFolder } from "@/desk/lib/explorer-file-actions";
import { normalizeExplorerPath } from "@/desk/lib/explorer-pins";
import { MobileTabBar } from "./MobileTabBar";
import { MobileShellHeader } from "./MobileShellHeader";
import { Icon } from "./Icons";
import {
  useMobileLayout,
  loadMobileTab,
  saveMobileTab,
  type MobileTab,
} from "@/hooks/use-mobile-layout";
import {
  loadClientLayout,
  scheduleSaveLayout,
  flushSaveLayout,
  buildDeskLayoutPatch,
  fractionsFromPanelSizes,
} from "@/desk/lib/layout-persist";
import {
  buildUnifiedTabDescriptors,
  BUCKETS_TAB_KEY,
  chatTabKey,
  fileTabKey,
  PULSE_TAB_KEY,
  neighborTabKey,
  parseWorkspaceTabKey,
  reorderTabKeys,
  syncTabOrder,
} from "@/desk/lib/workspace-tabs";
import { useDeskChrome } from "@/desk/lib/desk-chat-hooks";
import { getDeskChatState, setDeskVisibleChatId } from "@/desk/lib/desk-chat-store";
import { scanChatTabAlerts } from "@/desk/lib/chat-tab-alerts";
import { ChatAgentViewport } from "./ChatAgentViewport";
import { PulsePanel } from "@/components/pulse-panel";
import { FinanceBucketsPanel } from "@/components/finance-buckets-panel";

export function Shell({
  onBump,
  onUiBump,
}: {
  onBump: () => void;
  onUiBump?: () => void;
}) {
  const workspaceId = MERCURYOS_WORKSPACE_ID;
  const chrome = useDeskChrome(workspaceId);
  const chatState = chrome.state;
  const [health, setHealth] = useState(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>(0);
  const [editorTabs, setEditorTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [filesPath, setFilesPath] = useState("");
  const [fileEntries, setFileEntries] = useState({ loading: true });
  const [explorerUploads, setExplorerUploads] = useState(() => healExplorerUploadJobsOnBoot());
  const [explorerFullscreen, setExplorerFullscreen] = useState(false);
  const [rootEntries, setRootEntries] = useState({ loading: true });
  const [agentHistoryOpen, setAgentHistoryOpen] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pulseTabOpen, setPulseTabOpen] = useState(false);
  const [bucketsTabOpen, setBucketsTabOpen] = useState(false);
  const [pulseChrome, setPulseChrome] = useState({
    busy: false,
    showSearch: false,
    pending: 0,
    positionLabel: "",
  });
  const pulseApiRef = useRef(null);
  const [workspaceTabOrder, setWorkspaceTabOrder] = useState([]);
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState(() => {
    const id = getDeskChatState()?.activeId ?? chatState?.activeId;
    return id ? chatTabKey(String(id)) : null;
  });
  const [healBusy, setHealBusy] = useState(false);
  const { isMobile, keyboardOpen, onComposerFocus, onComposerBlur } = useMobileLayout();
  const fileRevisionRef = useRef("");
  const wasStreamingRef = useRef(false);
  const layoutBootRef = useRef(false);
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;
  const [twoPanelSizes, setTwoPanelSizes] = useState([22, 78]);

  const openChatTabs = chrome.stripTabs;

  const activeChat = chatState.chats.find((c) => c.id === chatState.activeId);
  const openEditorTabs = useMemo(
    () => tabsForWorkspace(editorTabs, workspaceId),
    [editorTabs, workspaceId]
  );
  const unifiedTabs = useMemo(
    () =>
      buildUnifiedTabDescriptors({
        chatTabs: openChatTabs,
        fileTabs: openEditorTabs,
        order: workspaceTabOrder,
        pulseOpen: pulseTabOpen,
        bucketsOpen: bucketsTabOpen,
      }),
    [openChatTabs, openEditorTabs, workspaceTabOrder, pulseTabOpen, bucketsTabOpen]
  );

  const activeWorkspace = parseWorkspaceTabKey(activeWorkspaceKey);
  const activeKind = activeWorkspace?.kind ?? null;
  const viewChatId = isMobile
    ? chatState.activeId
      ? String(chatState.activeId)
      : null
    : activeKind === "chat"
      ? activeWorkspace.id
      : null;

  useEffect(() => {
    setDeskVisibleChatId(viewChatId);
    scanChatTabAlerts(chatState, {
      activeChatId: chatState.activeId ?? null,
      workspaceId,
    });
  }, [viewChatId, chatState, workspaceId]);
  const hasEditorOpen = openEditorTabs.length > 0;
  const hasWorkspaceTabs = unifiedTabs.length > 0;
  const agentBusy = isChatBusy(chatState, activeChat?.id);

  const bumpUi = onUiBump ?? onBump;
  const bump = onBump;

  const persistLayout = useCallback(() => {
    scheduleSaveLayout(() =>
      buildDeskLayoutPatch({
        mobileTab,
        twoPanelSizes,
        workspaceTabOrder,
        activeWorkspaceKey,
        editorTabs,
        activeTabId,
        workspaceId,
        pulseTabOpen,
        bucketsTabOpen,
      })
    );
  }, [
    mobileTab,
    twoPanelSizes,
    workspaceTabOrder,
    activeWorkspaceKey,
    editorTabs,
    activeTabId,
    workspaceId,
    pulseTabOpen,
    bucketsTabOpen,
  ]);

  const flushLayoutNow = useCallback(
    (overrides = {}) => {
      void flushSaveLayout(
        buildDeskLayoutPatch({
          mobileTab,
          twoPanelSizes,
          workspaceTabOrder,
          activeWorkspaceKey,
          editorTabs,
          activeTabId,
          workspaceId,
          pulseTabOpen,
          bucketsTabOpen,
          ...overrides,
        })
      );
    },
    [
      mobileTab,
      twoPanelSizes,
      workspaceTabOrder,
      activeWorkspaceKey,
      editorTabs,
      activeTabId,
      workspaceId,
      pulseTabOpen,
      bucketsTabOpen,
    ]
  );

  const openPulseTab = useCallback(() => {
    setPulseTabOpen(true);
    setActiveWorkspaceKey(PULSE_TAB_KEY);
    setSettingsOpen(false);
    if (isMobile) {
      setMobileTab(0);
      saveMobileTab(0);
    }
    flushLayoutNow({
      pulseTabOpen: true,
      activeWorkspaceKey: PULSE_TAB_KEY,
    });
  }, [isMobile, flushLayoutNow]);

  const openBucketsTab = useCallback(() => {
    setBucketsTabOpen(true);
    setActiveWorkspaceKey(BUCKETS_TAB_KEY);
    setSettingsOpen(false);
    if (isMobile) {
      setMobileTab(0);
      saveMobileTab(0);
    }
    flushLayoutNow({
      bucketsTabOpen: true,
      activeWorkspaceKey: BUCKETS_TAB_KEY,
    });
  }, [isMobile, flushLayoutNow]);

  const selectWorkspaceTab = useCallback(
    (key) => {
      setActiveWorkspaceKey(key);
      const parsed = parseWorkspaceTabKey(key);
      if (parsed?.kind === "chat") {
        const state = chatStateRef.current;
        if (state) setActiveChat(state, parsed.id);
        bumpUi();
        const row = state?.chats?.find((c) => c.id === parsed.id);
        if (row?.status === "streaming" || row?.status === "awaiting") {
          void ensureChatHealed(state, parsed.id, workspaceId, bump);
        }
      } else if (parsed?.kind === "file") {
        setActiveTabId(parsed.id);
      }
    },
    [bumpUi, bump, workspaceId]
  );

  const closeWorkspaceTab = useCallback(
    (key) => {
      const parsed = parseWorkspaceTabKey(key);
      let nextEditorTabs = editorTabs;
      let nextActiveTabId = activeTabId;
      let nextWorkspaceKey = activeWorkspaceKey;

      if (parsed?.kind === "chat") {
        const state = chatStateRef.current;
        if (state) closeAgentTab(state, parsed.id);
        bumpUi();
      } else if (parsed?.kind === "file") {
        const closed = closeTab(editorTabs, activeTabId, parsed.id);
        nextEditorTabs = closed.tabs;
        nextActiveTabId = closed.activeId;
        setEditorTabs(closed.tabs);
        setActiveTabId(closed.activeId);
      } else if (parsed?.kind === "pulse") {
        setPulseTabOpen(false);
      } else if (parsed?.kind === "buckets") {
        setBucketsTabOpen(false);
      }

      const nextOrder = workspaceTabOrder.filter((k) => k !== key);
      const syncedOrder = syncTabOrder(nextOrder, nextOrder);

      if (activeWorkspaceKey === key) {
        const neighbor = neighborTabKey(workspaceTabOrder, key);
        if (neighbor) {
          nextWorkspaceKey = neighbor;
          selectWorkspaceTab(neighbor);
        } else {
          nextWorkspaceKey = null;
          setActiveWorkspaceKey(null);
        }
      }

      setWorkspaceTabOrder(syncedOrder);

      flushLayoutNow({
        workspaceTabOrder: syncedOrder,
        activeWorkspaceKey: nextWorkspaceKey,
        editorTabs: nextEditorTabs,
        activeTabId: nextActiveTabId,
        ...(parsed?.kind === "pulse" ? { pulseTabOpen: false } : {}),
        ...(parsed?.kind === "buckets" ? { bucketsTabOpen: false } : {}),
      });
    },
    [
      bumpUi,
      bump,
      editorTabs,
      activeTabId,
      activeWorkspaceKey,
      workspaceTabOrder,
      selectWorkspaceTab,
      flushLayoutNow,
    ]
  );

  const reorderWorkspaceTabs = useCallback((fromKey, toKey) => {
    setWorkspaceTabOrder((prev) => reorderTabKeys(prev, fromKey, toKey));
  }, []);

  const setWorkspaceTabOrderDirect = useCallback((order) => {
    setWorkspaceTabOrder(order);
  }, []);

  useEffect(() => {
    const chatKeys = openChatTabs.map((c) => chatTabKey(c.id));
    const fileKeys = openEditorTabs.map((f) => fileTabKey(f.id));
    const pulseKeys = pulseTabOpen ? [PULSE_TAB_KEY] : [];
    const bucketKeys = bucketsTabOpen ? [BUCKETS_TAB_KEY] : [];
    setWorkspaceTabOrder((prev) => syncTabOrder(prev, [...chatKeys, ...fileKeys, ...pulseKeys, ...bucketKeys]));
  }, [openChatTabs, openEditorTabs, pulseTabOpen, bucketsTabOpen]);

  useEffect(() => {
    if (!layoutBootRef.current) return;

    const activeId = chatState.activeId ? String(chatState.activeId) : null;
    const activeChatKey = activeId ? chatTabKey(activeId) : null;
    const parsed = parseWorkspaceTabKey(activeWorkspaceKey);
    const keyInTabs =
      activeWorkspaceKey && unifiedTabs.some((t) => t.key === activeWorkspaceKey);

    if (!unifiedTabs.length) {
      if (activeWorkspaceKey) setActiveWorkspaceKey(null);
      return;
    }

    if (!activeWorkspaceKey) {
      if (activeChatKey && unifiedTabs.some((t) => t.key === activeChatKey)) {
        setActiveWorkspaceKey(activeChatKey);
      } else {
        setActiveWorkspaceKey(unifiedTabs[0].key);
      }
      return;
    }

    if (!keyInTabs) {
      let nextKey = null;
      if (activeChatKey && unifiedTabs.some((t) => t.key === activeChatKey)) {
        nextKey = activeChatKey;
      } else {
        nextKey = neighborTabKey(workspaceTabOrder, activeWorkspaceKey);
        if (nextKey && !unifiedTabs.some((t) => t.key === nextKey)) nextKey = null;
        if (!nextKey) nextKey = unifiedTabs[0]?.key ?? null;
      }
      if (nextKey && nextKey !== activeWorkspaceKey) {
        setActiveWorkspaceKey(nextKey);
        const nextParsed = parseWorkspaceTabKey(nextKey);
        if (nextParsed?.kind === "file") setActiveTabId(nextParsed.id);
      } else if (!nextKey) {
        setActiveWorkspaceKey(null);
      }
      return;
    }

    if (parsed?.kind === "chat" && activeId && parsed.id !== activeId) {
      const state = chatStateRef.current;
      const openIds = new Set(state?.openAgentTabIds ?? []);
      if (openIds.has(parsed.id) && state) {
        setActiveChat(state, parsed.id);
        bumpUi();
      } else if (activeChatKey && unifiedTabs.some((t) => t.key === activeChatKey)) {
        setActiveWorkspaceKey(activeChatKey);
      }
    }
  }, [unifiedTabs, activeWorkspaceKey, chatState.activeId, workspaceTabOrder, bumpUi]);

  useEffect(() => {
    setMobileTab(loadMobileTab());
  }, []);

  const setMobileTabPersist = useCallback((tab: MobileTab) => {
    setMobileTab(tab);
    saveMobileTab(tab);
    if (tab !== 0) setAgentHistoryOpen(false);
  }, []);

  useEffect(() => {
    api.fetchHealthFull().then(setHealth).catch(() => {});
    setDeskWorkspace(chatState, MERCURYOS_WORKSPACE_ID);
  }, []);

  useEffect(() => {
    if (!layoutBootRef.current) return;
    persistLayout();
  }, [persistLayout]);

  useEffect(() => {
    if (layoutBootRef.current) return;
    void (async () => {
      const layout = await loadClientLayout();
      if (layout) {
        if (typeof layout.mobileTab === "number") {
          setMobileTab(layout.mobileTab);
          saveMobileTab(layout.mobileTab);
        }
        if (layout.columnFractions?.length) {
          const cols = layout.columnFractions;
          if (cols.length >= 2) {
            const explorer = cols[0] ?? 0.22;
            const workspace = cols.length === 2 ? cols[1] : (cols[1] ?? 0) + (cols[2] ?? 0);
            const sum = explorer + workspace || 1;
            setTwoPanelSizes([
              Math.max(14, Math.round((explorer / sum) * 100)),
              Math.max(40, Math.round((workspace / sum) * 100)),
            ]);
          }
        }
        const savedTabs = layout.editorTabs ?? [];
        const savedTabIds = new Set(savedTabs.map((t) => tabId(workspaceId, t.path)));
        const chatKeys = (chatState.openAgentTabIds ?? [])
          .map((id) => chatTabKey(String(id)))
          .filter((key) => chatState.chats?.some((c) => chatTabKey(c.id) === key));
        const openChatIdSet = new Set(chatState.openAgentTabIds ?? []);
        const fileKeys = savedTabs.map((t) => fileTabKey(tabId(workspaceId, t.path)));
        const savedOrderKeys = Array.isArray(layout.workspaceTabOrder)
          ? layout.workspaceTabOrder.filter((k) => {
              const p = parseWorkspaceTabKey(k);
              if (p?.kind === "file") return savedTabIds.has(p.id);
              if (p?.kind === "chat") return openChatIdSet.has(p.id);
              if (p?.kind === "pulse") return Boolean(layout.pulseTabOpen);
              if (p?.kind === "buckets") return Boolean(layout.bucketsTabOpen);
              return false;
            })
          : [];
        const pulseWasOpen = Boolean(layout.pulseTabOpen);
        if (pulseWasOpen) setPulseTabOpen(true);
        const bucketsWasOpen = Boolean(layout.bucketsTabOpen);
        if (bucketsWasOpen) setBucketsTabOpen(true);
        const pulseKeys = pulseWasOpen ? [PULSE_TAB_KEY] : [];
        const bucketKeys = bucketsWasOpen ? [BUCKETS_TAB_KEY] : [];
        setWorkspaceTabOrder(syncTabOrder(savedOrderKeys, [...chatKeys, ...fileKeys, ...pulseKeys, ...bucketKeys]));
        for (const t of savedTabs) {
          const name = t.name ?? t.path?.split("/").pop() ?? t.path;
          const id = tabId(workspaceId, t.path);
          setEditorTabs((prev) => {
            if (prev.some((row) => row.id === id)) return prev;
            return [
              ...prev,
              {
                id,
                workspaceId,
                path: t.path,
                name,
                ext: t.ext ?? fileExt(name),
                viewMode: t.viewMode === "preview" ? "preview" : "code",
                loading: true,
              },
            ];
          });
          try {
            const file = await api.readFile(t.path, workspaceId);
            setEditorTabs((prev) =>
              prev.map((row) =>
                row.id === id
                  ? {
                      ...row,
                      loading: false,
                      content: file.content,
                      savedContent: file.content,
                      dirty: false,
                    }
                  : row
              )
            );
          } catch (err) {
            setEditorTabs((prev) =>
              prev.map((row) =>
                row.id === id ? { ...row, loading: false, error: err.message } : row
              )
            );
          }
        }
        const idx = layout.activeEditorTabIndex ?? 0;
        const pick = savedTabs[idx] ?? savedTabs[0];
        const validKeys = new Set([...chatKeys, ...fileKeys, ...pulseKeys, ...bucketKeys]);
        const activeChatKey = chatState.activeId
          ? chatTabKey(String(chatState.activeId))
          : null;
        if (activeChatKey && validKeys.has(activeChatKey)) {
          setActiveWorkspaceKey(activeChatKey);
          setActiveChat(chatState, chatState.activeId);
        } else if (layout.activeWorkspaceTabKey && validKeys.has(layout.activeWorkspaceTabKey)) {
          setActiveWorkspaceKey(layout.activeWorkspaceTabKey);
          const layoutParsed = parseWorkspaceTabKey(layout.activeWorkspaceTabKey);
          if (layoutParsed?.kind === "chat") {
            setActiveChat(chatState, layoutParsed.id);
          }
        } else if (pulseWasOpen) {
          setActiveWorkspaceKey(PULSE_TAB_KEY);
        } else if (bucketsWasOpen) {
          setActiveWorkspaceKey(BUCKETS_TAB_KEY);
        } else if (pick) {
          setActiveWorkspaceKey(fileTabKey(tabId(workspaceId, pick.path)));
          setActiveTabId(tabId(workspaceId, pick.path));
        }
      }
      layoutBootRef.current = true;
    })();
  }, [workspaceId]);

  const reloadOpenTabs = useCallback(async () => {
    const tabs = editorTabs.filter((t) => t.workspaceId === workspaceId && !t.loading);
    for (const t of tabs) {
      try {
        const file = await api.readFile(t.path, workspaceId);
        setEditorTabs((prev) =>
          prev.map((row) =>
            row.id === t.id
              ? row.dirty
                ? row
                : { ...row, content: file.content, savedContent: file.content, error: undefined }
              : row
          )
        );
      } catch {
        /* tab may have been deleted */
      }
    }
  }, [editorTabs, workspaceId]);

  const loadFiles = useCallback(
    async (path = "", { silent = false } = {}) => {
      setFilesPath(path);
      if (!silent) setFileEntries({ loading: true });
      try {
        const data = await api.listFiles(path, workspaceId);
        fileRevisionRef.current = data.revision ?? "";
        setFileEntries(data);
        if (path === "") setRootEntries(data);
      } catch (err) {
        if (!silent) setFileEntries({ error: err.message });
      }
    },
    [workspaceId]
  );

  const loadRoot = useCallback(async () => {
    try {
      const data = await api.listFiles("", workspaceId);
      setRootEntries(data);
    } catch (err) {
      setRootEntries({ error: err.message });
    }
  }, [workspaceId]);

  const listDir = useCallback((path) => api.listFiles(path, workspaceId), [workspaceId]);

  const syncExplorerUploads = useCallback(() => {
    setExplorerUploads(listExplorerUploadJobs());
  }, []);

  const onUploadJobChange = useCallback(
    (_job, meta) => {
      syncExplorerUploads();
      if (meta?.completed || meta?.removedId) {
        void loadFiles(filesPath, { silent: true });
        void loadRoot();
      }
    },
    [syncExplorerUploads, filesPath, loadFiles, loadRoot],
  );

  const startExplorerUpload = useCallback(
    (file, relativePath, destDir) => {
      const job = createExplorerUploadJob({
        destDir,
        workspaceId,
        relativePath,
        file,
      });
      syncExplorerUploads();
      void runExplorerUpload(job, file, onUploadJobChange);
    },
    [workspaceId, syncExplorerUploads, onUploadJobChange],
  );

  const handleExplorerDrop = useCallback(
    async (dataTransfer) => {
      const dest = filesPath || "";
      const entries = await collectDroppedUploadFiles(dataTransfer);
      if (!entries.length) return;
      for (const { file, relativePath } of entries) {
        startExplorerUpload(file, relativePath, dest);
      }
    },
    [filesPath, startExplorerUpload],
  );

  const retryExplorerUploadById = useCallback(
    (id) => {
      const job = listExplorerUploadJobs().find((j) => j.id === id);
      if (!job) return;
      void retryExplorerUpload(job, onUploadJobChange);
    },
    [onUploadJobChange],
  );

  const dismissExplorerUpload = useCallback(
    (id, status) => {
      if (status === "uploading") {
        cancelExplorerUpload(id);
      } else {
        removeExplorerUploadJob(id);
      }
      syncExplorerUploads();
    },
    [syncExplorerUploads],
  );

  const deleteExplorerFile = useCallback(
    async (path) => {
      await deleteWorkspaceFile(path, workspaceId);
      const norm = normalizeExplorerPath(path);
      const prefix = norm ? `${norm}/` : "";
      const isUnder = (p) => {
        const rel = normalizeExplorerPath(p);
        if (!rel) return false;
        return rel === norm || (prefix && rel.startsWith(prefix));
      };

      let nextActive = activeTabId;
      const removedKeys = [];
      setEditorTabs((prev) => {
        let tabs = prev;
        for (const t of prev) {
          if (isUnder(t.path)) {
            removedKeys.push(fileTabKey(t.id));
            const closed = closeTab(tabs, nextActive, t.id);
            tabs = closed.tabs;
            nextActive = closed.activeId;
          }
        }
        return tabs;
      });
      setActiveTabId(nextActive);

      if (removedKeys.length) {
        setWorkspaceTabOrder((prev) => prev.filter((k) => !removedKeys.includes(k)));
        if (removedKeys.includes(activeWorkspaceKey)) {
          const neighbor = neighborTabKey(workspaceTabOrder, activeWorkspaceKey);
          if (neighbor) selectWorkspaceTab(neighbor);
          else if (nextActive) setActiveWorkspaceKey(fileTabKey(nextActive));
          else setActiveWorkspaceKey(null);
        }
      }

      const cur = normalizeExplorerPath(filesPath);
      let reloadPath = filesPath;
      if (isUnder(cur)) {
        reloadPath = norm.split("/").filter(Boolean).slice(0, -1).join("/");
      }
      await loadFiles(reloadPath, { silent: true });
      await loadRoot();
    },
    [
      workspaceId,
      filesPath,
      loadFiles,
      loadRoot,
      activeTabId,
      activeWorkspaceKey,
      workspaceTabOrder,
      selectWorkspaceTab,
    ],
  );

  const renameExplorerFile = useCallback(
    async (fromPath, newName) => {
      const result = await renameWorkspaceFile(fromPath, newName, workspaceId);
      const oldNorm = normalizeExplorerPath(fromPath);
      const newNorm = normalizeExplorerPath(result?.path ?? fromPath);
      const oldPrefix = oldNorm ? `${oldNorm}/` : "";

      const mapPath = (p) => {
        const rel = normalizeExplorerPath(p);
        if (rel === oldNorm) return newNorm;
        if (oldPrefix && rel.startsWith(oldPrefix)) return `${newNorm}${rel.slice(oldNorm.length)}`;
        return rel;
      };

      setEditorTabs((prev) =>
        prev.map((t) => {
          const mapped = mapPath(t.path);
          if (mapped === normalizeExplorerPath(t.path)) return t;
          const name = mapped === newNorm ? newName : t.name;
          const ext = mapped === newNorm ? fileExt(newName) : t.ext;
          const newId = tabId(workspaceId, mapped);
          return { ...t, id: newId, path: mapped, name, ext };
        }),
      );

      setWorkspaceTabOrder((prev) =>
        prev.map((k) => {
          const parsed = parseWorkspaceTabKey(k);
          if (parsed?.kind !== "file") return k;
          const colon = parsed.id.indexOf(":");
          if (colon < 0) return k;
          const ws = parsed.id.slice(0, colon);
          const pathPart = parsed.id.slice(colon + 1);
          const mapped = mapPath(pathPart);
          if (mapped === normalizeExplorerPath(pathPart)) return k;
          return fileTabKey(tabId(ws, mapped));
        }),
      );

      if (activeTabId) {
        const colon = activeTabId.indexOf(":");
        const pathPart = colon >= 0 ? activeTabId.slice(colon + 1) : activeTabId;
        const mapped = mapPath(pathPart);
        if (mapped !== normalizeExplorerPath(pathPart)) {
          setActiveTabId(tabId(workspaceId, mapped));
        }
      }

      if (activeWorkspaceKey) {
        const parsed = parseWorkspaceTabKey(activeWorkspaceKey);
        if (parsed?.kind === "file") {
          const colon = parsed.id.indexOf(":");
          const pathPart = colon >= 0 ? parsed.id.slice(colon + 1) : parsed.id;
          const mapped = mapPath(pathPart);
          if (mapped !== normalizeExplorerPath(pathPart)) {
            setActiveWorkspaceKey(fileTabKey(tabId(workspaceId, mapped)));
          }
        }
      }

      const cur = normalizeExplorerPath(filesPath);
      let reloadPath = filesPath;
      if (cur === oldNorm || (oldPrefix && cur.startsWith(oldPrefix))) {
        reloadPath = mapPath(cur);
      }
      await loadFiles(reloadPath, { silent: true });
      await loadRoot();
      return result;
    },
    [workspaceId, filesPath, loadFiles, loadRoot, activeTabId, activeWorkspaceKey],
  );

  useEffect(() => {
    void loadFiles("");
  }, [loadFiles]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pulse") !== "1") return;
    setPulseTabOpen(true);
    setActiveWorkspaceKey(PULSE_TAB_KEY);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      if (isMobile && mobileTab !== 1) return;
      try {
        const { revision } = await api.fetchFilesRevision(filesPath, workspaceId);
        if (cancelled || !revision || revision === fileRevisionRef.current) return;
        await loadFiles(filesPath, { silent: true });
        await reloadOpenTabs();
      } catch {
        /* ignore */
      }
    };
    const ms = agentBusy ? 4000 : 8000;
    const t = setInterval(tick, ms);
    tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [agentBusy, filesPath, workspaceId, loadFiles, reloadOpenTabs, isMobile, mobileTab]);

  useEffect(() => {
    if (wasStreamingRef.current && !agentBusy) {
      void loadFiles(filesPath, { silent: true }).then(() => reloadOpenTabs());
    }
    wasStreamingRef.current = agentBusy;
  }, [agentBusy, filesPath, loadFiles, reloadOpenTabs]);

  const openFilePreview = useCallback(
    async (path, name, meta = {}) => {
      const id = tabId(workspaceId, path);
      const key = fileTabKey(id);
      const ext = fileExt(name);
      const viewerKind = fileViewerKind(ext);
      const defaultView = defaultEditorViewMode(ext);
      const isMedia = viewerKind === "video" || viewerKind === "audio";
      let size = meta.size ?? null;
      let mtimeMs = meta.mtimeMs ?? null;

      if (isMedia) {
        if (size == null || mtimeMs == null) {
          try {
            const fm = await api.fetchFileMeta(path, workspaceId);
            size = fm.size ?? size;
            mtimeMs = fm.mtimeMs ?? mtimeMs;
          } catch {
            /* prefetch still works without size */
          }
        }
        const warmUrl = workspaceFileRawUrl(path, workspaceId, mtimeMs);
        if (warmUrl) scheduleVideoPrefetch(warmUrl, { fileSize: size });
        setActiveTabId(id);
        setActiveWorkspaceKey(key);
        if (isMobile) setMobileTabPersist(2);
        setEditorTabs((prev) => {
          const existing = prev.find((t) => t.id === id);
          if (existing) return prev;
          return [
            ...prev,
            {
              id,
              workspaceId,
              path,
              name,
              ext,
              size,
              mtimeMs,
              loading: false,
              content: "",
              viewMode: "preview",
            },
          ];
        });
        return;
      }

      setActiveTabId(id);
      setActiveWorkspaceKey(key);
      if (isMobile) setMobileTabPersist(2);
      setEditorTabs((prev) => {
        const existing = prev.find((t) => t.id === id);
        if (existing) return prev;
        return [...prev, { id, workspaceId, path, name, ext, loading: true, viewMode: defaultView }];
      });

      try {
        const file = await api.readFile(path, workspaceId);
        setEditorTabs((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  loading: false,
                  content: file.content,
                  savedContent: file.content,
                  dirty: false,
                  error: undefined,
                  size: file.size ?? t.size,
                  mtimeMs: file.mtimeMs ?? t.mtimeMs,
                  viewMode: isEditableInTab(fileViewerKind(t.ext)) ? t.viewMode : "preview",
                }
              : t
          )
        );
      } catch (err) {
        const canPreviewWithoutText = !isEditableInTab(viewerKind);
        setEditorTabs((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  loading: false,
                  content: canPreviewWithoutText ? "" : undefined,
                  error: canPreviewWithoutText ? undefined : err.message,
                  viewMode: canPreviewWithoutText ? "preview" : t.viewMode,
                }
              : t
          )
        );
      }
    },
    [workspaceId, isMobile, setMobileTabPersist]
  );

  const navigateFolderFromChat = useCallback(
    (dir) => {
      const path = normalizeExplorerPath(dir);
      void loadFiles(path);
      if (isMobile) setMobileTabPersist(1);
    },
    [loadFiles, isMobile, setMobileTabPersist],
  );

  const handleCreateExplorerFile = useCallback(
    async (name, fileType, destDir) => {
      const dir = destDir ?? filesPath;
      const created = await createExplorerFile(name, fileType, dir, workspaceId);
      if (dir === filesPath) await loadFiles(filesPath, { silent: true });
      await loadRoot();
      if (created?.path) openFilePreview(created.path, created.name ?? name);
    },
    [filesPath, workspaceId, loadFiles, loadRoot, openFilePreview],
  );

  const handleCreateExplorerFolder = useCallback(
    async (name, destDir) => {
      const dir = destDir ?? filesPath;
      await createExplorerFolder(name, dir, workspaceId);
      if (dir === filesPath) await loadFiles(filesPath, { silent: true });
      await loadRoot();
    },
    [filesPath, workspaceId, loadFiles, loadRoot],
  );

  const onTabContextAction = useCallback(
    (action, tab) => {
      if (action === "close") {
        closeWorkspaceTab(tab.key);
        return;
      }
      if (action === "close-others") {
        for (const t of unifiedTabs) {
          if (t.key !== tab.key) closeWorkspaceTab(t.key);
        }
        return;
      }
      if (action === "delete" && tab.kind === "file" && tab.path) {
        void (async () => {
          const ok = window.confirm(`Delete "${tab.title}"?`);
          if (!ok) return;
          try {
            await deleteWorkspaceFile(tab.path, workspaceId);
            closeWorkspaceTab(tab.key);
            await loadFiles(filesPath, { silent: true });
            await loadRoot();
          } catch (err) {
            console.warn("Tab delete failed", err);
          }
        })();
        return;
      }
      if (tab.kind === "file" && tab.path) {
        if (action === "add-to-composer" || action === "attach") {
          const chatId = chatState.activeId;
          if (!chatId) return;
          attachWorkspacePathToChat(chatState, chatId, {
            path: tab.path,
            name: tab.title,
            type: "file",
          });
          bump();
          return;
        }
        if (action === "reveal-explorer") {
          const dir = tab.path.includes("/") ? tab.path.split("/").slice(0, -1).join("/") : "";
          void loadFiles(dir);
          return;
        }
        if (action === "open-external") {
          window.open(externalPreviewUrl(tab.path, workspaceId), "_blank", "noopener,noreferrer");
        }
      }
    },
    [
      unifiedTabs,
      closeWorkspaceTab,
      chatState,
      bump,
      loadFiles,
      loadRoot,
      filesPath,
      workspaceId,
    ]
  );

  const onCommitTabRename = useCallback(
    async (tab, nextName) => {
      if (!tab?.path || tab.kind !== "file") return;
      const result = await renameWorkspaceFile(tab.path, nextName, workspaceId);
      const nextPath = result?.path ?? null;
      if (nextPath && nextPath !== tab.path) {
        // Refresh open file tab metadata via editor tab close/reopen path map.
        setEditorTabs((prev) =>
          prev.map((t) => {
            const tabId = String(tab.key ?? "").replace(/^file:/, "");
            if (t.id === tabId || t.path === tab.path) {
              return { ...t, path: nextPath, name: nextName, title: nextName };
            }
            return t;
          }),
        );
      }
      await loadFiles(filesPath, { silent: true });
      await loadRoot();
    },
    [workspaceId, filesPath, loadFiles, loadRoot],
  );

  const onCloseTab = useCallback((id) => {
    let nextActive = activeTabId;
    setEditorTabs((prev) => {
      const next = closeTab(prev, activeTabId, id);
      nextActive = next.activeId;
      return next.tabs;
    });
    setActiveTabId(nextActive);
  }, [activeTabId]);

  const onCloseAllTabs = useCallback(() => {
    const next = closeAllTabs();
    setEditorTabs(next.tabs);
    setActiveTabId(next.activeId);
    let nextWorkspaceKey = activeWorkspaceKey;
    if (parseWorkspaceTabKey(activeWorkspaceKey)?.kind === "file") {
      const chatKey = openChatTabs[0] ? chatTabKey(openChatTabs[0].id) : null;
      if (chatKey) {
        nextWorkspaceKey = chatKey;
        selectWorkspaceTab(chatKey);
      } else {
        nextWorkspaceKey = null;
        setActiveWorkspaceKey(null);
      }
    }
    const chatKeys = openChatTabs.map((c) => chatTabKey(c.id));
    flushLayoutNow({
      editorTabs: next.tabs,
      activeTabId: next.activeId,
      workspaceTabOrder: chatKeys,
      activeWorkspaceKey: nextWorkspaceKey,
    });
  }, [activeWorkspaceKey, openChatTabs, selectWorkspaceTab, flushLayoutNow]);

  const onEditorContentChange = useCallback((id, content) => {
    setEditorTabs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, content, dirty: content !== (t.savedContent ?? t.content) }
          : t
      )
    );
  }, []);

  const onToggleViewMode = useCallback((id) => {
    setEditorTabs((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, viewMode: t.viewMode === "preview" ? "code" : "preview" } : t
      )
    );
  }, []);

  const saveActiveTab = useCallback(async () => {
    const tab = editorTabs.find((t) => t.id === activeTabId);
    if (!tab || tab.loading || tab.saving || !tab.dirty) return;
    setEditorTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, saving: true, error: undefined } : t)));
    try {
      const file = await api.writeFile(tab.path, tab.content ?? "", tab.workspaceId);
      setEditorTabs((prev) =>
        prev.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                saving: false,
                dirty: false,
                content: file.content,
                savedContent: file.content,
              }
            : t
        )
      );
    } catch (err) {
      setEditorTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, saving: false, error: err.message } : t))
      );
    }
  }, [editorTabs, activeTabId]);

  const onNewAgentChat = useCallback(() => {
    const state = chatStateRef.current;
    if (!state) return null;
    const chat = createChat(state, workspaceId);
    void api.warmAgent?.({ workspaceId, mode: chat.agentPrefs?.mode ?? "agent" }).catch(() => {});
    setAgentHistoryOpen(false);
    setChatHistoryOpen(false);
    const key = chatTabKey(chat.id);
    setActiveWorkspaceKey(key);
    setWorkspaceTabOrder((prev) => {
      const keys = openAgentTabs(state)
        .filter((c) => (c.workspaceId ?? "mercuryos") === workspaceId)
        .map((c) => chatTabKey(c.id));
      return syncTabOrder(prev, keys);
    });
    bump();
    return chat.id;
  }, [workspaceId, bump]);

  const toggleChatHistory = useCallback(() => {
    setChatHistoryOpen((open) => !open);
  }, []);

  const onRequestHeal = useCallback(async () => {
    if (!chatState.activeId || healBusy) return;
    setHealBusy(true);
    try {
      const res = await requestHealAlert(chatState, chatState.activeId, workspaceId);
      if (!res.ok) throw new Error(res.error ?? "Heal failed");
      bump();
    } catch {
      /* AgentPanel surfaces errors when active */
    } finally {
      setHealBusy(false);
    }
  }, [chatState, workspaceId, bump, healBusy]);

  useEffect(() => {
    if (!isMobile || hasEditorOpen || mobileTab !== 2) return;
    setMobileTabPersist(1);
  }, [hasEditorOpen, isMobile, mobileTab, setMobileTabPersist]);

  const activeEditorTab = editorTabs.find((t) => t.id === activeTabId);
  const editorTitle = activeEditorTab?.name ?? "Editor";
  const filesHeaderTitle = filesPath
    ? (filesPath.split("/").filter(Boolean).pop() ?? "Files")
    : "Files";

  const onAttachExplorerEntry = useCallback(
    (entry) => {
      const chatId = chatState.activeId;
      if (!chatId || !entry?.path) return;
      attachWorkspacePathToChat(chatState, chatId, entry);
      bump();
      if (isMobile) setMobileTabPersist(0);
    },
    [chatState, bump, setMobileTabPersist, isMobile]
  );

  useEffect(() => {
    if (!explorerFullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setExplorerFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [explorerFullscreen]);

  const explorerPanel = useMemo(
    () => (
      <ExplorerPanel
        filesPath={filesPath}
        fileEntries={fileEntries}
        rootEntries={rootEntries}
        listDir={listDir}
        onNavigate={loadFiles}
        onOpenFile={openFilePreview}
        onRefresh={() => {
          void loadFiles(filesPath);
          void loadRoot();
        }}
        hidePanelHead={isMobile}
        uploadQueue={explorerUploads}
        onDropFiles={handleExplorerDrop}
        onRetryUpload={retryExplorerUploadById}
        onDismissUpload={dismissExplorerUpload}
        onDeleteFile={deleteExplorerFile}
        onRenameFile={renameExplorerFile}
        onCreateFile={handleCreateExplorerFile}
        onCreateFolder={handleCreateExplorerFolder}
        onAttachEntry={onAttachExplorerEntry}
        workspaceId={workspaceId}
        fullscreen={explorerFullscreen}
        onToggleFullscreen={() => setExplorerFullscreen((v) => !v)}
      />
    ),
    [
      filesPath,
      fileEntries,
      rootEntries,
      isMobile,
      listDir,
      loadFiles,
      loadRoot,
      openFilePreview,
      explorerUploads,
      handleExplorerDrop,
      onAttachExplorerEntry,
      retryExplorerUploadById,
      dismissExplorerUpload,
      deleteExplorerFile,
      renameExplorerFile,
      handleCreateExplorerFile,
      handleCreateExplorerFolder,
      workspaceId,
      explorerFullscreen,
    ]
  );

  const editorPanel = useMemo(() => (
    <EditorPanel
      tabs={editorTabs}
      activeTabId={activeTabId}
      workspaceId={workspaceId}
      onSelectTab={(id) => {
        setActiveTabId(id);
        setActiveWorkspaceKey(fileTabKey(id));
      }}
      onCloseTab={onCloseTab}
      onCloseAll={onCloseAllTabs}
      onToggleViewMode={onToggleViewMode}
      onContentChange={onEditorContentChange}
      onSave={() => void saveActiveTab()}
      hidePanelHead={isMobile}
      hideTabStrip={!isMobile}
    />
  ), [
    editorTabs,
    activeTabId,
    workspaceId,
    isMobile,
    onToggleViewMode,
    onEditorContentChange,
    saveActiveTab,
    onCloseTab,
    onCloseAllTabs,
  ]);

  const agentPanelInner = isMobile || viewChatId ? (
    <ChatAgentViewport
      chatId={isMobile ? (chatState.activeId ? String(chatState.activeId) : null) : viewChatId}
      onBump={bump}
      onUiBump={bumpUi}
      onNewChat={onNewAgentChat}
      workspaceId={workspaceId}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenFile={(path) => openFilePreview(path, path.split("/").pop() ?? path)}
      onNavigateFolder={navigateFolderFromChat}
      hidePanelHead={isMobile}
      historyOpen={isMobile ? agentHistoryOpen : undefined}
      onHistoryOpenChange={isMobile ? setAgentHistoryOpen : undefined}
      historyColumnOpen={!isMobile && chatHistoryOpen}
      onToggleHistory={!isMobile ? toggleChatHistory : undefined}
      onComposerFocus={onComposerFocus}
      onComposerBlur={onComposerBlur}
      health={health}
      unifiedLayout={!isMobile}
      onHistoryChatSelect={(id) => {
        setActiveWorkspaceKey(chatTabKey(id));
        bumpUi();
      }}
      openFileTabs={openEditorTabs.map((t) => ({
        path: t.path,
        name: t.name,
        ext: t.ext,
      }))}
    />
  ) : null;

  const activeFileDescriptor = unifiedTabs.find((t) => t.key === activeWorkspaceKey && t.kind === "file");
  const canSaveFile =
    activeEditorTab &&
    !activeEditorTab.loading &&
    !activeEditorTab.saving &&
    activeEditorTab.dirty;

  const workspaceEmpty = (
    <div className="desk-workspace-empty cursor-chat-empty thread-empty">
      <div className="empty-state-icon">
        <Icon name="message" size={28} />
      </div>
      <p className="empty-state-title">Nothing open</p>
      <p className="empty-state-hint">Open a file from the explorer, start a chat, or browse history.</p>
      <div className="suggestion-chips">
        <button type="button" className="suggestion-chip" onClick={onNewAgentChat}>
          New chat
        </button>
        <button type="button" className="suggestion-chip" onClick={openPulseTab}>
          Open Pulse
        </button>
        <button type="button" className="suggestion-chip" onClick={openBucketsTab}>
          Buckets
        </button>
        <button type="button" className="suggestion-chip" onClick={toggleChatHistory}>
          Past chats
        </button>
      </div>
    </div>
  );

  const workspaceBody = (
    <div className="desk-workspace-pane flex-1 min-h-0 flex flex-col">
      {activeKind === "file" ? editorPanel : null}
      {activeKind === "chat" ? agentPanelInner : null}
      {activeKind === "pulse" ? (
        <PulsePanel
          embedded
          registerApi={(api) => {
            pulseApiRef.current = api;
          }}
          onChromeState={setPulseChrome}
        />
      ) : null}
      {activeKind === "buckets" ? <FinanceBucketsPanel embedded /> : null}
      {!activeKind && !hasWorkspaceTabs ? workspaceEmpty : null}
    </div>
  );

  const workspaceMain = (
    <WorkspacePanel
      tabs={unifiedTabs}
      activeKey={activeWorkspaceKey}
      activeKind={activeKind}
      activeFile={activeFileDescriptor}
      workspaceId={workspaceId}
      onSelectTab={selectWorkspaceTab}
      onCloseTab={closeWorkspaceTab}
      onReorderTabs={reorderWorkspaceTabs}
      onSetTabOrder={setWorkspaceTabOrderDirect}
      onNewChat={onNewAgentChat}
      onTabContextAction={onTabContextAction}
      onCommitTabRename={onCommitTabRename}
      onOpenSettings={() => setSettingsOpen(true)}
      onToggleHistory={toggleChatHistory}
      historyOpen={chatHistoryOpen}
      streaming={agentBusy}
      onRequestHeal={onRequestHeal}
      healBusy={healBusy}
      onSaveFile={() => void saveActiveTab()}
      canSaveFile={canSaveFile}
      onToggleViewMode={onToggleViewMode}
      onCloseAllFiles={onCloseAllTabs}
      onOpenPulse={openPulseTab}
      pulseTabOpen={pulseTabOpen}
      pulseChrome={pulseChrome}
      onPulseRefresh={() => pulseApiRef.current?.refresh?.()}
      onPulseToggleSearch={() => pulseApiRef.current?.toggleSearch?.()}
      onOpenBuckets={openBucketsTab}
      bucketsTabOpen={bucketsTabOpen}
    >
      {workspaceBody}
    </WorkspacePanel>
  );

  const workspaceColumn = useMemo(() => {
    if (isMobile || !chatHistoryOpen) return workspaceMain;
    return (
      <PanelGroup direction="horizontal" autoSaveId="desk-workspace-history" className="h-full min-w-0">
        <Panel defaultSize={72} minSize={50}>
          {workspaceMain}
        </Panel>
        <PanelResizeHandle className="cursor-resize" />
        <Panel defaultSize={28} minSize={18} maxSize={40}>
          <ChatHistoryPanel
            chatState={chatState}
            workspaceId={workspaceId}
            onBump={bump}
            onClose={() => setChatHistoryOpen(false)}
            onActivateChat={(id) => setActiveWorkspaceKey(chatTabKey(id))}
          />
        </Panel>
      </PanelGroup>
    );
  }, [isMobile, chatHistoryOpen, workspaceMain, chatState, workspaceId, bump]);

  const settingsSheet = (
    <SettingsPanel
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      chatState={chatState}
      onBump={bump}
      onOpenPulse={openPulseTab}
    />
  );

  const showMobilePulse =
    isMobile && pulseTabOpen && activeWorkspaceKey === PULSE_TAB_KEY && mobileTab === 0;
  const showMobileBuckets =
    isMobile && bucketsTabOpen && activeWorkspaceKey === BUCKETS_TAB_KEY && mobileTab === 0;

  const mobileHeaderActions = (children) => (
    <div className="desk-mobile-header-actions">{children}</div>
  );

  const renderMobileHeader = () => {
    if (keyboardOpen) return null;

    if (mobileTab === 1) {
      return (
        <MobileShellHeader
          title={filesHeaderTitle}
          actions={mobileHeaderActions(
            <button
              type="button"
              className="desk-mobile-header-btn"
              title="Refresh"
              onClick={() => void loadFiles(filesPath)}
            >
              <Icon name="refresh" size={17} />
            </button>
          )}
        />
      );
    }

    if (mobileTab === 2) {
      return null;
    }

    return (
      <MobileShellHeader
        title={agentHistoryOpen ? "Chats" : showMobilePulse ? "Pulse" : showMobileBuckets ? "Buckets" : (activeChat?.title ?? "Agent")}
        onBack={
          showMobilePulse
            ? () => closeWorkspaceTab(PULSE_TAB_KEY)
            : showMobileBuckets
              ? () => closeWorkspaceTab(BUCKETS_TAB_KEY)
              : agentHistoryOpen
              ? () => setAgentHistoryOpen(false)
              : undefined
        }
        backLabel="Back to chat"
        backIcon="chevL"
        actions={mobileHeaderActions(
          <>
            {!agentHistoryOpen && !showMobilePulse && !showMobileBuckets ? (
              <>
                <button
                  type="button"
                  className="desk-mobile-header-btn"
                  title="Chat history"
                  onClick={() => setAgentHistoryOpen(true)}
                >
                  <Icon name="clock" size={17} />
                </button>
                <button
                  type="button"
                  className="desk-mobile-header-btn"
                  title="Settings"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Icon name="settings" size={17} />
                </button>
                <button
                  type="button"
                  className="desk-mobile-header-btn"
                  title="New chat"
                  onClick={onNewAgentChat}
                >
                  <Icon name="plus" size={17} />
                </button>
              </>
            ) : null}
          </>
        )}
      />
    );
  };

  if (isMobile) {
    return (
      <div
        className={`desk-mobile-shell h-full flex flex-col bg-cursor-bg${keyboardOpen ? " desk-mobile-shell--keyboard" : ""}`}
        data-mobile-tab={mobileTab}
      >
        <ShellStatusStrip onOpenWorkspaceFile={openFilePreview} />
        {renderMobileHeader()}
        <main className="desk-mobile-main flex-1 min-h-0">
          <div
            className={`desk-mobile-pane${mobileTab === 0 ? " is-active" : ""}`}
            aria-hidden={mobileTab !== 0}
          >
            {showMobilePulse ? (
              <PulsePanel
                embedded
                registerApi={(api) => {
                  pulseApiRef.current = api;
                }}
                onChromeState={setPulseChrome}
              />
            ) : showMobileBuckets ? (
              <FinanceBucketsPanel embedded />
            ) : (
              agentPanelInner
            )}
          </div>
          <div
            className={`desk-mobile-pane${mobileTab === 1 && !explorerFullscreen ? " is-active" : ""}`}
            aria-hidden={mobileTab !== 1 || explorerFullscreen}
          >
            {explorerPanel}
          </div>
          <div
            className={`desk-mobile-pane${mobileTab === 2 && hasEditorOpen ? " is-active" : ""}`}
            aria-hidden={mobileTab !== 2 || !hasEditorOpen}
          >
            <div className="desk-mobile-editor flex flex-col flex-1 min-h-0">
              <div className="desk-mobile-editor-pane">{editorPanel}</div>
            </div>
          </div>
        </main>
        {!keyboardOpen ? (
          <MobileTabBar
            active={mobileTab}
            onChange={setMobileTabPersist}
            showEditor={hasEditorOpen}
            onOpenPulse={openPulseTab}
            onOpenFinance={openBucketsTab}
            activeAction={showMobilePulse ? "pulse" : showMobileBuckets ? "finance" : null}
          />
        ) : null}
        {settingsSheet}
        <ExplorerFullscreen open={explorerFullscreen && mobileTab === 1} onClose={() => setExplorerFullscreen(false)}>
          {explorerPanel}
        </ExplorerFullscreen>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-cursor-bg">
      <ShellStatusStrip onOpenWorkspaceFile={openFilePreview} />
      <div className="h-full flex flex-1 min-h-0">
      <PanelGroup
        direction="horizontal"
        autoSaveId="desk-main-h-2"
        className="flex-1 min-w-0"
        onLayout={(sizes) => {
          if (sizes?.length === 2) setTwoPanelSizes(sizes);
        }}
      >
        <Panel defaultSize={twoPanelSizes[0]} minSize={14} maxSize={40}>
          {!explorerFullscreen ? explorerPanel : (
            <div className="desk-explorer-collapsed-rail">
              <button
                type="button"
                className="cursor-icon-btn"
                title="Show files full view"
                onClick={() => setExplorerFullscreen(true)}
              >
                <Icon name="folder" size={16} />
              </button>
            </div>
          )}
        </Panel>
        <PanelResizeHandle className="cursor-resize" />
        <Panel defaultSize={twoPanelSizes[1]} minSize={40}>
          {workspaceColumn}
        </Panel>
      </PanelGroup>
      <ExplorerFullscreen open={explorerFullscreen} onClose={() => setExplorerFullscreen(false)}>
        {explorerPanel}
      </ExplorerFullscreen>
      {settingsSheet}
      </div>
    </div>
  );
}
