"use client";

import { useEffect, useRef } from "react";
import { playUiSound } from "@/mos-app/sounds.js";

type WatchRow = {
  _id: string;
  kind: string;
  conversationId?: string | null;
  createdAt: number;
};

const CHIME_COOLDOWN_MS = 700;
const FRESH_WINDOW_MS = 60_000;

type WatchKind = "dm_message" | "followed_post" | "help_answer_posted" | "help_answer_unlocked";

function isChimeKind(kind: string): kind is WatchKind {
  return (
    kind === "dm_message" ||
    kind === "followed_post" ||
    kind === "help_answer_posted" ||
    kind === "help_answer_unlocked"
  );
}

function playIncoming(kind: WatchKind) {
  playUiSound(kind === "dm_message" ? "message" : "notify");
}

/**
 * WhatsApp-style in-app chimes:
 * - Hear on Generate / Feed / Network / etc. — any Studio surface
 * - Mute only when that DM thread is the one open on screen
 * - If the browser tab was in the background, play one catch-up chime on return
 *   (OS push still covers fully backgrounded alerts)
 */
export function useIncomingAlertChimes(args: {
  rows: WatchRow[] | undefined;
  /** Conversation id for the thread currently shown in the Messages UI. */
  activeConversationId?: string | null;
  /** True only when the Messages chat surface is actually visible. */
  messagesThreadVisible?: boolean;
}) {
  const seededRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastChimeAtRef = useRef(0);
  const deferredRef = useRef<WatchKind | null>(null);
  const activeConversationIdRef = useRef(args.activeConversationId);
  const messagesThreadVisibleRef = useRef(args.messagesThreadVisible);
  activeConversationIdRef.current = args.activeConversationId;
  messagesThreadVisibleRef.current = args.messagesThreadVisible;

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const pending = deferredRef.current;
      if (!pending) return;
      deferredRef.current = null;
      const now = Date.now();
      if (now - lastChimeAtRef.current < CHIME_COOLDOWN_MS) return;
      playIncoming(pending);
      lastChimeAtRef.current = now;
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  useEffect(() => {
    const rows = args.rows;
    if (!rows) return;

    if (!seededRef.current) {
      seededRef.current = true;
      seenIdsRef.current = new Set(rows.map((row) => row._id));
      return;
    }

    const seen = seenIdsRef.current;
    const fresh: WatchRow[] = [];
    for (const row of rows) {
      if (seen.has(row._id)) continue;
      seen.add(row._id);
      fresh.push(row);
    }
    if (!fresh.length) return;

    if (seen.size > 200) {
      seenIdsRef.current = new Set(rows.map((row) => row._id));
    }

    const now = Date.now();
    const tabHidden =
      typeof document !== "undefined" && (document.hidden || !document.hasFocus?.());

    for (const row of fresh) {
      if (now - row.createdAt > FRESH_WINDOW_MS) continue;
      if (!isChimeKind(row.kind)) continue;

      // WA: no ding while that exact chat is open on screen.
      if (
        row.kind === "dm_message" &&
        messagesThreadVisibleRef.current &&
        row.conversationId &&
        row.conversationId === activeConversationIdRef.current
      ) {
        continue;
      }

      if (tabHidden) {
        // Prefer the more personal DM chime if both arrived while away.
        if (row.kind === "dm_message" || deferredRef.current !== "dm_message") {
          deferredRef.current = row.kind;
        }
        continue;
      }

      if (now - lastChimeAtRef.current < CHIME_COOLDOWN_MS) continue;
      playIncoming(row.kind);
      lastChimeAtRef.current = now;
      deferredRef.current = null;
      break;
    }
  }, [args.rows]);
}
