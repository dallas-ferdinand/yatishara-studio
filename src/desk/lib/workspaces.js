/** Cross-workspace activity chips (desk). */
export function workspaceActivity(chats) {
  const out = {};
  for (const c of chats ?? []) {
    const id = c.workspaceId ?? "mercuryos";
    if (!out[id]) out[id] = { streaming: 0, awaiting: 0 };
    if (c.status === "streaming") out[id].streaming += 1;
    else if (c.status === "awaiting") out[id].awaiting += 1;
  }
  return out;
}

export function crossProjectTargets(chats, activeWorkspaceId) {
  const activity = workspaceActivity(chats);
  const targets = [];
  for (const [id, act] of Object.entries(activity)) {
    if (id === activeWorkspaceId) continue;
    if (act.awaiting > 0) targets.push({ id, kind: "awaiting", count: act.awaiting, priority: 0 });
    else if (act.streaming > 0) targets.push({ id, kind: "streaming", count: act.streaming, priority: 1 });
  }
  targets.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return targets;
}
