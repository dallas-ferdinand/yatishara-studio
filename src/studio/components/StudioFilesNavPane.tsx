"use client";

import {
  Clock,
  Folder,
  Globe,
  Home,
  MessageCircle,
  Monitor,
  Pin,
  ShoppingBag,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  EXPLORER_DND_TYPE,
  peekActiveExplorerDrag,
  readExplorerDragData,
  writeExplorerDragData,
  clearActiveExplorerDrag,
} from "@/desk/lib/explorer-dnd";
import "./studio-files-nav.css";

export type StudioFilesNavEntry = {
  type?: string;
  name: string;
  path?: string;
  studioId?: string;
  studioKind?: string;
  systemKind?: string;
};

export type StudioFilesNavPin = {
  path: string;
  parentPath?: string;
  label: string;
  studioId?: string;
};

export type StudioFilesNavAccessItem = {
  studioId?: string;
  path: string;
  label: string;
  visitCount?: number;
};

type StudioFilesNavPaneProps = {
  activeFolderId?: string | null;
  /** Workspace home folder id — never listed under access lists (Home covers it). */
  workspaceRootId?: string | null;
  isHomeActive?: boolean;
  rootEntries?: StudioFilesNavEntry[];
  quickPins?: StudioFilesNavPin[];
  recentFolders?: StudioFilesNavAccessItem[];
  frequentFolders?: StudioFilesNavAccessItem[];
  onOpenHome: () => void;
  onOpenEntry: (entry: StudioFilesNavEntry) => void;
  onOpenPin: (pin: StudioFilesNavPin) => void;
  onOpenAccessItem: (item: StudioFilesNavAccessItem) => void;
  onPinFolder: (entry: StudioFilesNavEntry) => void;
  onUnpinPath: (path: string) => void;
};

const SYSTEM_ORDER = [
  "recents",
  "trash",
  "messages",
  "purchased",
  "public",
  "screenRecordings",
] as const;

function systemIcon(kind: string | undefined): ReactNode {
  switch (kind) {
    case "recents":
      return <Clock aria-hidden="true" />;
    case "trash":
      return <Trash2 aria-hidden="true" />;
    case "messages":
      return <MessageCircle aria-hidden="true" />;
    case "purchased":
      return <ShoppingBag aria-hidden="true" />;
    case "public":
      return <Globe aria-hidden="true" />;
    case "screenRecordings":
      return <Monitor aria-hidden="true" />;
    default:
      return <Folder aria-hidden="true" />;
  }
}

function isSystemFolder(entry: StudioFilesNavEntry): boolean {
  return (
    entry.studioKind === "recents" ||
    entry.studioKind === "trash" ||
    entry.studioKind === "messages" ||
    entry.studioKind === "purchased" ||
    entry.studioKind === "public" ||
    entry.studioKind === "screenRecordings"
  );
}

function canPinEntry(entry: StudioFilesNavEntry | null | undefined): boolean {
  if (!entry || entry.type !== "dir") return false;
  if (isSystemFolder(entry)) return false;
  if (!entry.studioId && !entry.path) return false;
  return true;
}

/** Custom MIME types are often hidden during dragover — also trust armed payload. */
function isExplorerFolderDrag(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  if (types.some((t) => t === EXPLORER_DND_TYPE || t.toLowerCase() === EXPLORER_DND_TYPE)) {
    return true;
  }
  const armed = peekActiveExplorerDrag() as StudioFilesNavEntry | null;
  return Boolean(armed && canPinEntry(armed));
}

function accessToEntry(item: StudioFilesNavAccessItem): StudioFilesNavEntry {
  return {
    type: "dir",
    name: item.label,
    path: item.path?.startsWith("/") ? item.path : item.path ? `/${item.path}` : undefined,
    studioId: item.studioId,
    studioKind: "folder",
  };
}

export function StudioFilesNavPane({
  activeFolderId,
  workspaceRootId = null,
  isHomeActive = false,
  rootEntries = [],
  quickPins = [],
  recentFolders = [],
  frequentFolders = [],
  onOpenHome,
  onOpenEntry,
  onOpenPin,
  onOpenAccessItem,
  onPinFolder,
  onUnpinPath,
}: StudioFilesNavPaneProps) {
  const [dropActive, setDropActive] = useState(false);

  const places = useMemo(() => {
    const byKind = new Map<string, StudioFilesNavEntry>();
    for (const entry of rootEntries) {
      if (entry.studioKind && SYSTEM_ORDER.includes(entry.studioKind as (typeof SYSTEM_ORDER)[number])) {
        byKind.set(entry.studioKind, entry);
      }
    }
    return SYSTEM_ORDER.map((kind) => byKind.get(kind)).filter(
      (entry): entry is StudioFilesNavEntry => Boolean(entry),
    );
  }, [rootEntries]);

  const recents = useMemo(
    () =>
      recentFolders.filter(
        (item) =>
          item &&
          (item.studioId || item.path) &&
          !(workspaceRootId && item.studioId === workspaceRootId),
      ),
    [recentFolders, workspaceRootId],
  );

  const frequents = useMemo(
    () =>
      frequentFolders.filter(
        (item) =>
          item &&
          (item.studioId || item.path) &&
          !(workspaceRootId && item.studioId === workspaceRootId),
      ),
    [frequentFolders, workspaceRootId],
  );

  return (
    <nav className="studio-files-nav-pane" aria-label="Files navigation">
      <div className="studio-files-nav-scroll">
        <div className="studio-files-nav-section">
          <button
            type="button"
            className={`studio-files-nav-item${isHomeActive ? " is-active" : ""}`}
            onClick={onOpenHome}
          >
            <Home aria-hidden="true" />
            <span>Home</span>
          </button>
        </div>

        {places.length ? (
          <div className="studio-files-nav-section">
            <div className="studio-files-nav-section-label">Places</div>
            {places.map((entry) => (
              <button
                key={entry.studioId || entry.path || entry.name}
                type="button"
                className={`studio-files-nav-item${
                  activeFolderId && entry.studioId === activeFolderId ? " is-active" : ""
                }`}
                onClick={() => onOpenEntry(entry)}
              >
                {systemIcon(entry.studioKind)}
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`studio-files-nav-section studio-files-nav-quick${
            dropActive ? " is-drop-target" : ""
          }`}
          onDragEnter={(event) => {
            if (!isExplorerFolderDrag(event)) return;
            event.preventDefault();
            setDropActive(true);
          }}
          onDragOver={(event) => {
            if (!isExplorerFolderDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "link";
            setDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDropActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDropActive(false);
            const payload =
              (readExplorerDragData(event.dataTransfer) as StudioFilesNavEntry | null) ||
              (peekActiveExplorerDrag() as StudioFilesNavEntry | null);
            clearActiveExplorerDrag();
            if (!canPinEntry(payload)) return;
            onPinFolder(payload as StudioFilesNavEntry);
          }}
        >
          <div className="studio-files-nav-section-label">Quick access</div>
          {quickPins.length === 0 ? (
            <p className="studio-files-nav-quick-empty">
              Drag folders here for quick links
            </p>
          ) : (
            quickPins.map((pin) => (
              <div key={`${pin.parentPath ?? ""}:${pin.path}`} className="studio-files-nav-pin-row">
                <button
                  type="button"
                  className="studio-files-nav-item"
                  title={pin.label}
                  onClick={() => onOpenPin(pin)}
                >
                  <Pin aria-hidden="true" />
                  <span>{pin.label}</span>
                </button>
                <button
                  type="button"
                  className="studio-files-nav-unpin"
                  aria-label={`Remove ${pin.label} from Quick access`}
                  title="Remove"
                  onClick={() => onUnpinPath(pin.path)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="studio-files-nav-section">
          <div className="studio-files-nav-section-label">Recent folders</div>
          {recents.length === 0 ? (
            <p className="studio-files-nav-quick-empty">Folders you open show up here</p>
          ) : (
            recents.map((item) => (
              <button
                key={`recent:${item.studioId || item.path}`}
                type="button"
                draggable
                className="studio-files-nav-item"
                title={item.label}
                onClick={() => onOpenAccessItem(item)}
                onDragStart={(event) => {
                  writeExplorerDragData(event.dataTransfer, accessToEntry(item));
                  event.dataTransfer.effectAllowed = "linkMove";
                }}
                onDragEnd={() => clearActiveExplorerDrag()}
              >
                <Clock aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))
          )}
        </div>

        <div className="studio-files-nav-section">
          <div className="studio-files-nav-section-label">Frequent</div>
          {frequents.length === 0 ? (
            <p className="studio-files-nav-quick-empty">
              Folders you visit often show up here
            </p>
          ) : (
            frequents.map((item) => (
              <button
                key={`freq:${item.studioId || item.path}`}
                type="button"
                draggable
                className="studio-files-nav-item"
                title={item.label}
                onClick={() => onOpenAccessItem(item)}
                onDragStart={(event) => {
                  writeExplorerDragData(event.dataTransfer, accessToEntry(item));
                  event.dataTransfer.effectAllowed = "linkMove";
                }}
                onDragEnd={() => clearActiveExplorerDrag()}
              >
                <TrendingUp aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </nav>
  );
}
