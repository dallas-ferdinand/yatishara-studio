// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@mos-app/api.js";
import {
  applyDesk2Update,
  deskHasLiveChat,
  dismissDesk2Update,
  isDesk2UpdateDismissed,
  startDesk2UpdatePoll,
  stopDesk2UpdatePoll,
} from "@/desk/lib/desk-web-update";
import { getDeskChatState } from "@/desk/lib/desk-chat-store";
import {
  SESSION_END_NOW_MD,
  dismissSessionEndNudge,
  hasSessionEndNudge,
  initSessionEndHook,
} from "@mos-app/session-end-hook.js";

function offlineMessage() {
  const url = api.getSession()?.gatewayUrl ?? "";
  return url.includes("yatishara.com") || url.startsWith("https://")
    ? "Gateway unreachable — check internet, then retry"
    : "Computer unreachable — same WiFi? Start the gateway on your PC";
}

export function ShellStatusStrip({ onOpenWorkspaceFile } = {}) {
  const [offline, setOffline] = useState(false);
  const [offlineText, setOfflineText] = useState("");
  const [update, setUpdate] = useState(null);
  const [sessionEndNudge, setSessionEndNudge] = useState(false);
  const pingInFlight = useRef(false);
  const failStreak = useRef(0);

  const ping = useCallback(async () => {
    if (!api.getSession()?.token) {
      failStreak.current = 0;
      setOffline(false);
      return true;
    }
    if (pingInFlight.current) return;
    pingInFlight.current = true;
    try {
      const health = await api.ping();
      const ok = Boolean(health?.ok);
      if (ok) {
        failStreak.current = 0;
        setOffline(false);
      } else {
        failStreak.current += 1;
        if (failStreak.current >= 2) {
          setOffline(true);
          setOfflineText(offlineMessage());
        }
      }
      return ok;
    } catch {
      failStreak.current += 1;
      if (failStreak.current >= 2) {
        setOffline(true);
        setOfflineText("Gateway unreachable — check internet, then retry");
      }
      return false;
    } finally {
      pingInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void ping();
    const interval = setInterval(() => void ping(), document.hidden ? 20000 : 8000);
    const onVis = () => {
      if (!document.hidden) void ping();
    };
    document.addEventListener("visibilitychange", onVis);
    startDesk2UpdatePoll((offer) => {
      if (offer && !isDesk2UpdateDismissed(offer.deskBuildId)) {
        setUpdate(offer);
        const state = getDeskChatState();
        if (
          offer.localBuildId &&
          offer.deskBuildId !== offer.localBuildId &&
          !deskHasLiveChat(state)
        ) {
          void applyDesk2Update();
        }
      } else setUpdate(null);
    });
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      stopDesk2UpdatePoll();
    };
  }, [ping]);

  useEffect(() => {
    if (hasSessionEndNudge()) setSessionEndNudge(true);
    return initSessionEndHook({
      onNudge: () => setSessionEndNudge(true),
    });
  }, []);

  const showUpdate = update && !offline;
  if (!offline && !showUpdate && !sessionEndNudge) return null;

  return (
    <div className="desk-status-strip" role="status" aria-live="polite">
      {offline ? (
        <div className="desk-status-row desk-status-offline">
          <span>{offlineText}</span>
          <button type="button" className="desk-status-btn" onClick={() => void ping()}>
            Retry
          </button>
        </div>
      ) : null}
      {showUpdate ? (
        <div className="desk-status-row desk-status-update">
          <span className="desk-status-update-ver">v{update.versionName}</span>
          <span className="desk-status-update-hint">Desk update ready — reload to apply</span>
          <button
            type="button"
            className="desk-status-btn desk-status-btn-primary"
            onClick={() => void applyDesk2Update()}
          >
            Apply
          </button>
          <button
            type="button"
            className="desk-status-btn"
            onClick={() => {
              dismissDesk2Update(update.deskBuildId);
              setUpdate(null);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {sessionEndNudge ? (
        <div className="desk-status-row desk-status-session-end">
          <span>Sophie — leave a thread in now.md before you go?</span>
          <button
            type="button"
            className="desk-status-btn desk-status-btn-primary"
            onClick={() => {
              onOpenWorkspaceFile?.(SESSION_END_NOW_MD, "now.md");
              dismissSessionEndNudge();
              setSessionEndNudge(false);
            }}
          >
            Open now.md
          </button>
          <button
            type="button"
            className="desk-status-btn"
            onClick={() => {
              dismissSessionEndNudge();
              setSessionEndNudge(false);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
