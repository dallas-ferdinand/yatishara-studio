/** @ picker search — clean results for files, folders, skills, MCPs. */

import * as api from "@mos-app/api.js";
import {
  RefPickerScope,
  ROOT_SCOPES,
  scopeApiCategory,
  scopeIsClientOnly,
  scopeLabel,
  scopedComposerPrefix,
  sectionLabelForKind,
} from "@/desk/lib/ref-picker.js";

const NOISY_PATH =
  /(?:^|\/)(?:node_modules|\.git|dist|build|out|\.next|android|\.capacitor|__pycache__)(?:\/|$)/i;

const KIND_RANK = {
  person: -2,
  tab: 0,
  dir: 1,
  file: 2,
  doc: 3,
  skill: 4,
  mcp: 5,
  git: 6,
  terminal: 7,
  chat: 8,
  web: 9,
  scope: 10,
};

function rankKind(kind) {
  return KIND_RANK[kind] ?? 50;
}

function dedupeRefs(items) {
  const seen = new Set();
  const out = [];
  for (const item of items ?? []) {
    const key = `${item.kind ?? "file"}:${item.path ?? item.name ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isNoisyPath(path) {
  return NOISY_PATH.test(String(path ?? ""));
}

function rankItem(item, q) {
  const query = q.trim().toLowerCase();
  if (!query) return rankKind(item.kind);
  const name = String(item.name ?? "").toLowerCase();
  const path = String(item.path ?? "").toLowerCase();
  if (name === query || path === query) return 0;
  if (name.startsWith(query) || path.startsWith(query)) return 1;
  if (name.includes(query) || path.includes(query)) return 2;
  return 3 + rankKind(item.kind);
}

export function polishRefResults(items, query = "") {
  const q = String(query ?? "").trim();
  let list = dedupeRefs(items).filter((item) => {
    if (item.kind === "scope") return true;
    const path = item.path ?? "";
    if (isNoisyPath(path)) return false;
    if (!q && item.kind === "git") return false;
    return true;
  });
  list.sort((a, b) => rankItem(a, q) - rankItem(b, q));
  return list.slice(0, 16);
}

export function refRowSubtitle(item) {
  if (!item) return "";
  if (item.kind === "scope") return `Type ${item.path ?? ""} in composer`;
  if (item.kind === "person") {
    if (item.subtitle) return item.subtitle;
    if (item.phone && item.name !== item.phone) return item.phone;
    return item.detail ?? "WhatsApp";
  }
  if (item.kind === "mcp") return item.enabled === false ? "MCP · disabled" : "MCP server";
  if (item.kind === "dir") {
    const path = item.path ?? "";
    const parent = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
    return parent ? parent : "Folder";
  }
  if (item.kind === "file" || item.kind === "doc" || item.kind === "skill") {
    const path = item.path ?? "";
    if (!path.includes("/")) return sectionLabelForKind(item.kind);
    return path.split("/").slice(0, -1).join("/");
  }
  return sectionLabelForKind(item.kind);
}

function rootCategories() {
  return ROOT_SCOPES.map((scope) => ({
    kind: "scope",
    name: scopeLabel(scope),
    path: scopedComposerPrefix(scope),
    scope,
  }));
}

function filterMcps(servers, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [];
  return (servers ?? [])
    .filter((s) => {
      const id = String(s.id ?? s.name ?? "").toLowerCase();
      const name = String(s.name ?? s.id ?? "").toLowerCase();
      return id.includes(q) || name.includes(q);
    })
    .map((s) => ({
      kind: "mcp",
      name: String(s.name ?? s.id ?? "MCP").replace(/-mcp$/i, ""),
      path: String(s.id ?? s.name ?? ""),
      enabled: s.enabled !== false,
    }));
}

function matchOpenTabs(openFileTabs, query) {
  const q = String(query ?? "").trim().toLowerCase();
  return (openFileTabs ?? [])
    .filter((tab) => {
      const path = String(tab?.path ?? "").trim();
      if (!path) return false;
      if (!q) return true;
      const name = String(tab.name ?? path.split("/").pop() ?? "").toLowerCase();
      return name.includes(q) || path.toLowerCase().includes(q);
    })
    .map((tab) => ({
      kind: "tab",
      name: tab.name ?? tab.path.split("/").pop() ?? tab.path,
      path: tab.path,
    }));
}

/** Flat list with optional section labels for grouped picker UI. */
export function groupRefResults(items) {
  const groups = [];
  const byKey = new Map();
  for (const item of items ?? []) {
    const key = item.kind === "scope" ? "Browse" : sectionLabelForKind(item.kind);
    if (!byKey.has(key)) {
      const group = { label: key, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).items.push(item);
  }
  return groups;
}

function clientOnlyResults(scope, { refQuery, shellTerminals, chats, workspaceId }) {
  if (scope === RefPickerScope.terminals && shellTerminals?.tabs?.length) {
    const q = refQuery.trim().toLowerCase();
    return shellTerminals.tabs
      .filter((tab) => {
        if (!q) return true;
        const title = String(tab.title ?? "bash").toLowerCase();
        return title.includes(q);
      })
      .map((tab) => ({
        kind: "terminal",
        name: tab.title ?? "bash",
        path: tab.id,
      }));
  }
  if (scope === RefPickerScope.chats) {
    const q = refQuery.trim().toLowerCase();
    return (chats ?? [])
      .filter((c) => (c.workspaceId ?? "mercuryos") === workspaceId)
      .filter((c) => {
        if (!q) return true;
        return String(c.title ?? "").toLowerCase().includes(q);
      })
      .slice(0, 20)
      .map((c) => ({ kind: "chat", name: c.title, path: c.id }));
  }
  if (scope === RefPickerScope.web && refQuery.trim()) {
    return [{ kind: "web", name: `Search web: ${refQuery.trim()}`, path: refQuery.trim() }];
  }
  return [];
}

export async function searchRefPickerResults({
  refScope,
  refQuery = "",
  workspaceId = "mercuryos",
  openFileTabs = [],
  shellTerminals = null,
  chats = [],
  mcpServers = [],
  signal = null,
}) {
  const q = String(refQuery ?? "").trim();

  if (refScope === RefPickerScope.root && !q) {
    const tabs = matchOpenTabs(openFileTabs, "");
    return polishRefResults([...rootCategories(), ...tabs.slice(0, 6)], q);
  }

  if (scopeIsClientOnly(refScope)) {
    return polishRefResults(
      clientOnlyResults(refScope, { refQuery: q, shellTerminals, chats, workspaceId }),
      q,
    );
  }

  const category = scopeApiCategory(refScope);
  const local = [];
  if (refScope === RefPickerScope.root || refScope === RefPickerScope.files) {
    local.push(...matchOpenTabs(openFileTabs, q));
  }
  if (refScope === RefPickerScope.root) {
    local.push(...filterMcps(mcpServers, q));
  }

  const minRemoteLen =
    refScope === RefPickerScope.people ? 0
    : refScope === RefPickerScope.files || refScope === RefPickerScope.docs || refScope === RefPickerScope.skills ? 0
    : 2;
  if (q.length < minRemoteLen && refScope !== RefPickerScope.root) {
    return polishRefResults(local, q);
  }

  let remote = [];
  try {
    remote = await api.searchRefs(q, 40, workspaceId, category, openFileTabs, signal);
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    remote = [];
  }

  return polishRefResults([...local, ...remote], q);
}
