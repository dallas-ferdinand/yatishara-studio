/** Background gateway run poll — keeps chats streaming + heals stale status. */
import * as api from "@mos-app/api.js";
import { pollActiveRuns } from "@mos-app/run-sync.js";
import {
  ensureChatRunMirror,
  reconcileActiveChat,
  healStaleThreadStatus,
  chatHasStaleLocalActivity,
} from "@/desk/lib/agent-run.js";

let started = false;

export function startDeskRunPoll(getState, onBump) {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  let busy = false;
  let timer = null;

  const tick = async () => {
    timer = null;
    if (!api.getSession()) {
      timer = setTimeout(tick, 4000);
      return;
    }
    if (busy) {
      timer = setTimeout(tick, 1500);
      return;
    }
    busy = true;
    try {
      const state = getState();
      if (!state) return;
      const ws = state.deskWorkspaceId ?? "mercuryos";
      await pollActiveRuns(state, {
        onAttachResume: (chatId) => {
          ensureChatRunMirror(state, chatId, ws, onBump);
        },
        onReconciled: () => onBump?.(),
        onClearStale: () => onBump?.(),
        onHealStale: (chatId) => {
          void healStaleThreadStatus(state, chatId, ws, onBump);
        },
      });
      const active = state.chats.find((c) => c.id === state.activeId);
      if (active) {
        const activeWs = active.workspaceId ?? ws;
        if (chatHasStaleLocalActivity(state, active.id)) {
          await healStaleThreadStatus(state, active.id, activeWs, onBump);
        }
        const refreshed = state.chats.find((c) => c.id === active.id) ?? active;
        if (
          refreshed.status === "streaming" ||
          refreshed.status === "awaiting" ||
          chatHasStaleLocalActivity(state, refreshed.id)
        ) {
          ensureChatRunMirror(state, refreshed.id, activeWs, onBump);
          await reconcileActiveChat(state, refreshed.id, activeWs, onBump);
        }
      }
    } catch {
      /* ignore poll errors */
    } finally {
      busy = false;
      timer = setTimeout(tick, document.hidden ? 12000 : 8000);
    }
  };

  timer = setTimeout(tick, 1200);
  return () => {
    if (timer) clearTimeout(timer);
    started = false;
  };
}
