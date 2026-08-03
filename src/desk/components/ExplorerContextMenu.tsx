// @ts-nocheck
"use client";

import {
  ArrowUpFromLine,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  FilePlus,
  FolderOpen,
  FolderPlus,
  ImagePlus,
  Link2Off,
  MessageSquarePlus,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wallpaper,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenuPosition } from "@/desk/lib/use-floating-menu-position";
import {
  VIEWPORT_EDGE_PAD,
  clampFloatingPosition,
} from "@/desk/lib/context-menu-position.js";
import { REACTION_EMOJIS } from "@/studio/lib/itemReactions";

const EXPLORER_MENU_ICONS = {
  open: FolderOpen,
  "go-up": ArrowUpFromLine,
  "new-file": FilePlus,
  "new-folder": FolderPlus,
  "new-note": FilePlus,
  "new-video-edit": Clapperboard,
  "new-element": Sparkles,
  upload: Upload,
  refresh: RefreshCw,
  "empty-trash": Trash2,
  pin: Pin,
  "pin-root": Pin,
  "pin-here": Pin,
  unpin: PinOff,
  "copy-path": Copy,
  download: Download,
  "download-zip": Download,
  "use-wallpaper": Wallpaper,
  "set-profile-image": ImagePlus,
  upscale: Sparkles,
  "generate-video": Clapperboard,
  "share-profile": Share2,
  "unshare-profile": Link2Off,
  rename: Pencil,
  attach: MessageSquarePlus,
  delete: Trash2,
  "delete-forever": Trash2,
  restore: Undo2,
  new: FolderPlus,
  organize: Pin,
  share: Share2,
  more: Sparkles,
};

function buildMenuItems(entry, {
  pinnedPaths,
  currentPath,
  canCreateFile,
  canCreateFolder,
  createItems,
  onRequestRename,
  onRequestDelete,
  inTrashView = false,
  sharedAssetIds,
  canDownloadZip = true,
  canPin = true,
  canListOnNetwork = false,
  networkListingId = null,
  networkListingStatus = null,
  networkPurchaseCount = 0,
  networkPlatformOwned = false,
  presentation = "menu",
  hasOutgoingShare = false,
}) {
  if (!entry) return [];

  const isBlank = entry.type === "blank";
  const isParent = entry.type === "parent";
  const isTrashFolder = entry.studioKind === "trash";
  const isMessagesFolder =
    entry.studioKind === "messages" || entry.systemKind === "messages";
  const isPurchasedFolder =
    entry.studioKind === "purchased" || entry.systemKind === "purchased_assets";
  const isPublicFolder =
    entry.studioKind === "public" || entry.systemKind === "public_assets";
  const isSharedWithMeFolder =
    entry.studioKind === "shared" || entry.systemKind === "shared_with_me";
  const isPurchasedNetworkAsset = entry.licenseKind === "purchased_network";
  const isListedNetworkAsset = entry.licenseKind === "listed_network";
  const isLockedNetworkAsset = isPurchasedNetworkAsset || isListedNetworkAsset;
  const isSharedLiveItem = Boolean(entry.sharedFromUserId || entry.isSharedLive);
  const canEditShared = isSharedLiveItem && entry.sharePermission === "edit";
  const isDir = entry.type === "dir" || isParent;
  const isFile = !isDir && !isBlank;

  const creationChildren = createItems?.length
    ? createItems
        .filter((item) => !item.sep)
        .map((item) => ({ ...item, id: item.id ?? item.action }))
    : [
        ...(canCreateFile ? [{ id: "new-file", label: "Ad copy" }] : []),
        ...(canCreateFolder ? [{ id: "new-folder", label: "Folder" }] : []),
      ];

  if (
    isTrashFolder ||
    isMessagesFolder ||
    isPurchasedFolder ||
    isPublicFolder ||
    isSharedWithMeFolder
  ) {
    return [{ id: "open", label: "Open folder" }];
  }

  if (isBlank && inTrashView) {
    return [
      { id: "refresh", label: "Refresh" },
      { id: "sep-trash-empty", sep: true },
      { id: "empty-trash", label: "Empty trash", danger: true },
    ];
  }

  if (isBlank) {
    const items = [];
    if (creationChildren.length) {
      items.push({ id: "new", label: "New", children: creationChildren });
    }
    items.push({ id: "refresh", label: "Refresh" });
    return items;
  }

  if (isParent) {
    return [{ id: "open", label: "Go up", iconKey: "go-up" }];
  }

  if (inTrashView) {
    const items = [
      { id: "open", label: isDir ? "Open folder" : "Open" },
      { id: "copy-path", label: "Copy item link" },
    ];
    if (onRequestDelete) {
      items.push({ id: "sep-trash-restore", sep: true });
      items.push({ id: "delete", label: "Restore", iconKey: "restore" });
    }
    if (entry.studioKind === "asset" && entry.studioId) {
      items.push({ id: "delete-forever", label: "Delete forever", danger: true });
    }
    return items;
  }

  const items = [];
  const isImageAsset =
    isFile &&
    entry.studioKind === "asset" &&
    entry.kind === "image" &&
    entry.studioId;
  const isShareableMedia =
    isFile &&
    entry.studioKind === "asset" &&
    (entry.kind === "image" || entry.kind === "video") &&
    entry.studioId;

  // —— Primary ——
  items.push({ id: "open", label: isDir ? "Open folder" : "Open" });
  if (isDir && creationChildren.length) {
    items.push({ id: "new", label: "New", children: creationChildren });
  }
  if (isFile) items.push({ id: "download", label: "Download" });
  if (isDir && canDownloadZip) {
    items.push({ id: "download-zip", label: "Download folder" });
  }
  items.push({
    id: "attach",
    label: isDir ? "Use folder in chat" : "Use in chat",
  });

  // Live share to people (any Studio item). Shared-with-me receipts stay read-only for re-share.
  if (!isSharedLiveItem && !isLockedNetworkAsset) {
    items.push({
      id: "share-people",
      label: "Share",
      iconKey: "share",
    });
    if (hasOutgoingShare) {
      items.push({
        id: "shared-with",
        label: "Shared with",
        iconKey: "share",
        children: [{ id: "shared-with:lazy", label: "…" }],
        submenuKind: "share-recipients",
      });
    }
  }

  if (
    isSharedLiveItem &&
    isFile &&
    entry.studioKind === "asset" &&
    entry.studioId
  ) {
    items.push({
      id: "copy-to-folder",
      label: "Copy to…",
      iconKey: "copy-path",
    });
  }

  // —— React ——
  if (!isSharedLiveItem || canEditShared) {
    items.push({ id: "sep-react", sep: true });
    if (presentation === "sheet") {
      items.push({ id: "react-open", label: "React" });
    } else {
      const reactChildren = REACTION_EMOJIS.map((emoji) => ({
        id: `react:${emoji}`,
        label: emoji,
      }));
      if (entry.reactionEmoji) {
        reactChildren.push({ id: "react:clear", label: "Clear" });
      }
      items.push({
        id: "react",
        label: "React",
        children: reactChildren,
        submenuKind: "emoji-grid",
      });
    }
  }

  // —— Organize ——
  if (!isSharedLiveItem) {
    items.push({ id: "sep-organize", sep: true });
    if (isDir && canPin) {
      const pinnedHere =
        pinnedPaths?.has?.(entry.path) ||
        pinnedPaths?.has?.(
          String(entry.path ?? "")
            .trim()
            .replace(/^\/+|\/+$/g, ""),
        );
      if (pinnedHere) {
        items.push({ id: "unpin", label: "Unpin folder" });
      } else if (currentPath) {
        items.push({
          id: "organize",
          label: "Pin",
          children: [
            { id: "pin-here", label: "Pin here" },
            { id: "pin-root", label: "Pin to home" },
          ],
        });
      } else {
        items.push({ id: "pin-here", label: "Pin folder" });
      }
    }
    if (onRequestRename) {
      items.push({ id: "rename", label: "Rename" });
    }
  } else if (canEditShared && onRequestRename) {
    items.push({ id: "sep-organize", sep: true });
    items.push({ id: "rename", label: "Rename" });
  }
  items.push({ id: "copy-path", label: "Copy item link" });

  // —— Media extras (images/videos only) ——
  if (!isSharedLiveItem && (isImageAsset || isShareableMedia)) {
    items.push({ id: "sep-media", sep: true });
    if (isImageAsset) {
      items.push({ id: "upscale", label: "Upscale" });
      items.push({ id: "generate-video", label: "Generate video" });
    }
    const profileChildren = [];
    if (isImageAsset) {
      profileChildren.push({ id: "use-wallpaper", label: "Use as wallpaper" });
      profileChildren.push({ id: "set-profile-image", label: "Set as profile image" });
    }
    if (isShareableMedia) {
      const alreadyShared = sharedAssetIds?.has?.(entry.studioId);
      profileChildren.push({
        id: alreadyShared ? "unshare-profile" : "share-profile",
        label: alreadyShared ? "Remove from profile" : "Create post",
      });
    }
    if (profileChildren.length) {
      items.push({
        id: "post-profile",
        label: "Post / profile",
        iconKey: "share-profile",
        children: profileChildren,
      });
    }
  }

  const isListableAudio =
    isFile &&
    entry.studioKind === "asset" &&
    entry.kind === "audio" &&
    !isPurchasedNetworkAsset;
  if (isListableAudio && canListOnNetwork) {
    items.push({ id: "sep-network", sep: true });
    if (networkListingId && networkListingStatus === "pending_review") {
      items.push({
        id: "unlist-network",
        label: "Withdraw Creative Network submission",
      });
    } else if (
      networkListingId &&
      networkListingStatus === "listed" &&
      !networkPlatformOwned
    ) {
      if (networkPurchaseCount > 0) {
        items.push({
          id: "release-network",
          label: "Release listing to platform",
        });
      } else {
        items.push({
          id: "unlist-network",
          label: "Unlist from Creative Network",
        });
      }
    } else if (
      networkListingStatus === "rejected" ||
      networkListingStatus === "unlisted"
    ) {
      items.push({
        id: "list-network",
        label: "Resubmit to Creative Network",
      });
    } else if (!networkListingId && !isListedNetworkAsset) {
      items.push({ id: "list-network", label: "List on Creative Network" });
    } else if (isListedNetworkAsset && !networkListingId) {
      items.push({ id: "list-network", label: "List on Creative Network" });
    } else if (networkPlatformOwned) {
      items.push({
        id: "network-released",
        label: "Released to platform",
        disabled: true,
      });
    }
  }

  // —— Danger ——
  if (onRequestDelete && !isLockedNetworkAsset && !isSharedLiveItem) {
    items.push({ id: "sep-danger", sep: true });
    items.push({
      id: "delete",
      label: isDir ? "Delete folder" : "Delete",
      danger: true,
    });
  }

  return items;
}

function renderMenuIcon(item) {
  const MappedIcon = EXPLORER_MENU_ICONS[item.iconKey || item.id];
  if (MappedIcon) return <MappedIcon aria-hidden="true" />;
  const icon = item.icon;
  if (icon == null) return null;
  if (typeof icon === "object" && icon.$$typeof) return icon;
  if (typeof icon === "function" || (typeof icon === "object" && icon.render)) {
    const Icon = icon;
    return <Icon aria-hidden="true" />;
  }
  return null;
}

function MenuItemButton({ item, active, onActivate, onHover }) {
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const disabled = Boolean(item.disabled);
  return (
    <button
      type="button"
      className={`cursor-tab-context-item${item.danger ? " is-danger" : ""}${active ? " is-active" : ""}${hasChildren ? " has-submenu" : ""}${disabled ? " is-disabled" : ""}`}
      role="menuitem"
      disabled={disabled}
      aria-haspopup={hasChildren ? "menu" : undefined}
      aria-expanded={hasChildren ? active : undefined}
      onMouseEnter={() => {
        if (!disabled) onHover?.(item);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onActivate(item, e);
      }}
    >
      {renderMenuIcon(item)}
      <span className="cursor-tab-context-item-label">{item.label}</span>
      {hasChildren ? (
        <ChevronRight className="cursor-tab-context-caret" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export function ExplorerContextMenu({
  entry,
  x,
  y,
  onClose,
  onAction,
  onRequestDelete,
  onRequestRename,
  pinnedPaths,
  currentPath = "",
  canCreateFile = false,
  canCreateFolder = false,
  createItems,
  inTrashView = false,
  sharedAssetIds,
  canDownloadZip = true,
  canPin = true,
  canListOnNetwork = false,
  networkListingId = null,
  networkListingStatus = null,
  networkPurchaseCount = 0,
  networkPlatformOwned = false,
  /** "menu" = floating desktop menu; "sheet" = mobile half-height panel above Files. */
  presentation = "menu",
  hasOutgoingShare = false,
  shareRecipients = null,
  onRevokeShare = null,
}) {
  const menuRef = useRef(null);
  const submenuRef = useRef(null);
  const submenuCloseTimerRef = useRef(null);
  const open = Boolean(entry) && typeof document !== "undefined";
  const isSheet = presentation === "sheet";
  const [openSubmenuId, setOpenSubmenuId] = useState(null);
  const [submenuPos, setSubmenuPos] = useState({ left: 0, top: 0 });
  const [portalRoot, setPortalRoot] = useState(null);

  function clearSubmenuCloseTimer() {
    if (submenuCloseTimerRef.current != null) {
      window.clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
  }

  function scheduleSubmenuClose() {
    clearSubmenuCloseTimer();
    submenuCloseTimerRef.current = window.setTimeout(() => {
      submenuCloseTimerRef.current = null;
      setOpenSubmenuId(null);
    }, 120);
  }

  function openSubmenu(id) {
    clearSubmenuCloseTimer();
    setOpenSubmenuId(id);
  }

  const items = useMemo(
    () =>
      buildMenuItems(entry, {
        pinnedPaths,
        currentPath,
        canCreateFile,
        canCreateFolder,
        createItems,
        onRequestRename,
        onRequestDelete,
        inTrashView,
        sharedAssetIds,
        canDownloadZip,
        canPin,
        canListOnNetwork,
        networkListingId,
        networkListingStatus,
        networkPurchaseCount,
        networkPlatformOwned,
        presentation,
        hasOutgoingShare,
      }),
    [
      entry,
      pinnedPaths,
      currentPath,
      canCreateFile,
      canCreateFolder,
      createItems,
      onRequestRename,
      onRequestDelete,
      inTrashView,
      sharedAssetIds,
      canDownloadZip,
      canPin,
      canListOnNetwork,
      networkListingId,
      networkListingStatus,
      networkPurchaseCount,
      networkPlatformOwned,
      presentation,
      hasOutgoingShare,
    ],
  );

  const openSubmenuItem = useMemo(
    () => items.find((item) => item.id === openSubmenuId && item.children?.length) ?? null,
    [items, openSubmenuId],
  );

  const pos = useFloatingMenuPosition(x, y, menuRef, open && !isSheet, [
    items.length,
    entry?.path,
    entry?.type,
    openSubmenuId,
  ]);

  useEffect(() => {
    if (!open) {
      setPortalRoot(null);
      return;
    }
    if (isSheet) {
      setPortalRoot(document.querySelector(".studio-polish") ?? document.body);
    } else {
      setPortalRoot(document.body);
    }
  }, [open, isSheet]);

  useEffect(() => {
    clearSubmenuCloseTimer();
    setOpenSubmenuId(null);
  }, [entry?.path, entry?.type, x, y]);

  useEffect(() => () => clearSubmenuCloseTimer(), []);

  useLayoutEffect(() => {
    if (isSheet || !openSubmenuItem || !menuRef.current) return;
    const parentBtn = menuRef.current.querySelector(
      `[data-submenu-id="${openSubmenuItem.id}"]`,
    );
    if (!parentBtn) return;
    const rect = parentBtn.getBoundingClientRect();
    const gap = 2;
    const isEmoji = openSubmenuItem.submenuKind === "emoji-grid";
    const estimatedWidth = isEmoji ? 132 : openSubmenuItem.submenuKind === "share-recipients" ? 220 : 180;
    const estimatedHeight = isEmoji
      ? 160
      : Math.min(
          window.innerHeight - 16,
          openSubmenuItem.children.length * 28 + 16,
        );
    let left = rect.right + gap;
    let top = rect.top;
    if (left + estimatedWidth > window.innerWidth - VIEWPORT_EDGE_PAD) {
      left = Math.max(VIEWPORT_EDGE_PAD, rect.left - estimatedWidth - gap);
    }
    setSubmenuPos(
      clampFloatingPosition(left, top, estimatedWidth, estimatedHeight),
    );

    // Remeasure after paint — emoji grid / recipient lists differ from estimates.
    const frame = window.requestAnimationFrame(() => {
      const el = submenuRef.current;
      if (!el || !parentBtn.isConnected) return;
      const btn = parentBtn.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      let nextLeft = btn.right + gap;
      if (nextLeft + box.width > window.innerWidth - VIEWPORT_EDGE_PAD) {
        nextLeft = Math.max(VIEWPORT_EDGE_PAD, btn.left - box.width - gap);
      }
      setSubmenuPos(
        clampFloatingPosition(nextLeft, btn.top, box.width, box.height),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSheet, openSubmenuItem, pos.left, pos.top, shareRecipients]);

  useEffect(() => {
    if (!entry) return;
    const onDoc = (e) => {
      if (e.type === "contextmenu") return;
      if (menuRef.current?.contains(e.target)) return;
      if (submenuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (openSubmenuId) setOpenSubmenuId(null);
        else onClose();
      }
    };
    // Sheet opens on long-press release; wait out iOS synthetic mouse events
    // so the opening gesture cannot immediately dismiss the sheet.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("touchstart", onDoc, { passive: true });
      // Floating menus close on outside scroll; sheet keeps internal scroll.
      if (!isSheet) document.addEventListener("scroll", onDoc, true);
      document.addEventListener("keydown", onKey);
    }, isSheet ? 420 : 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("scroll", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [entry, onClose, openSubmenuId, isSheet]);

  if (!open || !portalRoot) return null;

  const runAction = (actionId) => {
    if (actionId === "delete") {
      onRequestDelete?.(entry, { x, y });
      return;
    }
    if (actionId === "rename") {
      onRequestRename?.(entry, { x, y });
      return;
    }
    onAction?.(actionId, entry, { x, y });
  };

  const activateItem = (item) => {
    if (item.children?.length) {
      setOpenSubmenuId((prev) => (prev === item.id ? null : item.id));
      return;
    }
    runAction(item.id);
    if (isSheet) onClose();
  };

  if (isSheet) {
    const title =
      entry?.type === "blank"
        ? "Actions"
        : entry?.name || entry?.path?.split("/").pop() || "Actions";
    return createPortal(
      <>
        <button
          type="button"
          className="studio-explorer-context-sheet-backdrop"
          aria-label="Dismiss"
          onClick={onClose}
        />
        <div
          ref={menuRef}
          className="studio-explorer-context-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <header className="studio-explorer-context-sheet-head">
            <span className="studio-explorer-context-sheet-title truncate">{title}</span>
            <button
              type="button"
              className="studio-explorer-context-sheet-close"
              onClick={onClose}
              aria-label="Close"
            >
              Done
            </button>
          </header>
          <div className="studio-explorer-context-sheet-scroll" role="menu">
            {items.map((item) =>
              item.sep ? (
                <div key={item.id} className="cursor-tab-context-sep" role="separator" />
              ) : (
                <div key={item.id} className="studio-explorer-context-sheet-group">
                  <MenuItemButton
                    item={item}
                    active={openSubmenuId === item.id}
                    onActivate={activateItem}
                  />
                  {openSubmenuId === item.id && item.children?.length ? (
                    <div
                      className={`studio-explorer-context-sheet-submenu${
                        item.submenuKind === "emoji-grid"
                          ? " is-emoji-grid"
                          : item.submenuKind === "share-recipients"
                            ? " is-share-recipients"
                            : ""
                      }`}
                      role="group"
                    >
                      {item.submenuKind === "emoji-grid" ? (
                        <div className="desk-explorer-react-grid">
                          {item.children
                            .filter((child) => child.id !== "react:clear")
                            .map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                className={`desk-explorer-react-emoji${
                                  entry?.reactionEmoji &&
                                  child.label === entry.reactionEmoji
                                    ? " is-active"
                                    : ""
                                }`}
                                onClick={() => {
                                  runAction(child.id);
                                  onClose();
                                }}
                              >
                                {child.label}
                              </button>
                            ))}
                          {item.children.some((child) => child.id === "react:clear") ? (
                            <button
                              type="button"
                              className="desk-explorer-react-clear"
                              onClick={() => {
                                runAction("react:clear");
                                onClose();
                              }}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      ) : item.submenuKind === "share-recipients" ? (
                        <div className="desk-explorer-share-recipients">
                          {(shareRecipients ?? []).length === 0 ? (
                            <p className="desk-explorer-share-recipients-empty">
                              Not shared with anyone
                            </p>
                          ) : (
                            (shareRecipients ?? []).map((peer) => (
                              <div
                                key={peer.shareId}
                                className="desk-explorer-share-recipient"
                              >
                                <span>@{peer.username}</span>
                                <button
                                  type="button"
                                  className="desk-explorer-share-unshare"
                                  onClick={() => {
                                    onRevokeShare?.(peer.shareId);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                          )}
                          <MenuItemButton
                            item={{ id: "share-people", label: "Add people…" }}
                            active={false}
                            onActivate={() => {
                              runAction("share-people");
                              onClose();
                            }}
                          />
                        </div>
                      ) : (
                        item.children
                          .filter((child) => !child.sep)
                          .map((child) => (
                            <MenuItemButton
                              key={child.id}
                              item={child}
                              active={false}
                              onActivate={(picked) => {
                                runAction(picked.id);
                                onClose();
                              }}
                            />
                          ))
                      )}
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </div>
      </>,
      portalRoot,
    );
  }

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="cursor-tab-context-menu desk-explorer-context-menu"
        style={{ left: pos.left, top: pos.top }}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseLeave={(e) => {
          const next = e.relatedTarget;
          if (next instanceof Node && submenuRef.current?.contains(next)) {
            clearSubmenuCloseTimer();
            return;
          }
          scheduleSubmenuClose();
        }}
        onMouseEnter={clearSubmenuCloseTimer}
      >
        {items.map((item) =>
          item.sep ? (
            <div key={item.id} className="cursor-tab-context-sep" role="separator" />
          ) : (
            <div key={item.id} data-submenu-id={item.id || undefined}>
              <MenuItemButton
                item={item}
                active={openSubmenuId === item.id}
                onHover={(hovered) => {
                  if (hovered.children?.length) openSubmenu(hovered.id);
                  else {
                    clearSubmenuCloseTimer();
                    setOpenSubmenuId(null);
                  }
                }}
                onActivate={activateItem}
              />
            </div>
          ),
        )}
      </div>
      {openSubmenuItem ? (
        <div
          ref={submenuRef}
          className={`cursor-tab-context-menu desk-explorer-context-menu desk-explorer-context-submenu${
            openSubmenuItem.submenuKind === "emoji-grid"
              ? " is-emoji-grid"
              : openSubmenuItem.submenuKind === "share-recipients"
                ? " is-share-recipients"
                : ""
          }`}
          style={{ left: submenuPos.left, top: submenuPos.top }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={clearSubmenuCloseTimer}
          onMouseLeave={(e) => {
            const next = e.relatedTarget;
            if (next instanceof Node && menuRef.current?.contains(next)) {
              clearSubmenuCloseTimer();
              return;
            }
            scheduleSubmenuClose();
          }}
        >
          {openSubmenuItem.submenuKind === "emoji-grid" ? (
            <div className="desk-explorer-react-grid" role="group" aria-label="Reactions">
              {openSubmenuItem.children
                .filter((child) => child.id !== "react:clear")
                .map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className={`desk-explorer-react-emoji${
                      entry?.reactionEmoji && child.label === entry.reactionEmoji
                        ? " is-active"
                        : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      runAction(child.id);
                    }}
                  >
                    {child.label}
                  </button>
                ))}
              {openSubmenuItem.children.some((child) => child.id === "react:clear") ? (
                <button
                  type="button"
                  className="desk-explorer-react-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    runAction("react:clear");
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : openSubmenuItem.submenuKind === "share-recipients" ? (
            <div className="desk-explorer-share-recipients" role="group" aria-label="Shared with">
              {(shareRecipients ?? []).length === 0 ? (
                <p className="desk-explorer-share-recipients-empty">Not shared with anyone</p>
              ) : (
                (shareRecipients ?? []).map((peer) => (
                  <div key={peer.shareId} className="desk-explorer-share-recipient">
                    <span>@{peer.username}</span>
                    <button
                      type="button"
                      className="desk-explorer-share-unshare"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRevokeShare?.(peer.shareId);
                        runAction("shared-with:revoked");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
              <button
                type="button"
                className="cursor-tab-context-item"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  runAction("share-people");
                }}
              >
                <Share2 aria-hidden="true" />
                <span className="cursor-tab-context-item-label">Add people…</span>
              </button>
            </div>
          ) : (
            openSubmenuItem.children
              .filter((child) => !child.sep)
              .map((child) => (
                <MenuItemButton
                  key={child.id}
                  item={child}
                  active={false}
                  onActivate={(picked) => runAction(picked.id)}
                />
              ))
          )}
        </div>
      ) : null}
    </>,
    portalRoot,
  );
}
