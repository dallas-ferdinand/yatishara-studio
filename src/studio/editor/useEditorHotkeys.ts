import { useEffect } from "react";

type HotkeyHandlers = {
  onPlayToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onNudgePlayhead: (delta: number) => void;
  onZoom: (delta: number) => void;
  onDeselect: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canSplit: boolean;
  hasSelection: boolean;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function useEditorHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (key === " " || key === "Spacebar") {
        event.preventDefault();
        handlers.onPlayToggle();
        return;
      }

      if (mod && key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        if (handlers.canUndo) handlers.onUndo();
        return;
      }

      if (mod && (key.toLowerCase() === "z" && event.shiftKey || key.toLowerCase() === "y")) {
        event.preventDefault();
        if (handlers.canRedo) handlers.onRedo();
        return;
      }

      if ((key === "Delete" || key === "Backspace") && handlers.hasSelection) {
        event.preventDefault();
        handlers.onDelete();
        return;
      }

      if (key.toLowerCase() === "s" && !mod) {
        event.preventDefault();
        if (handlers.canSplit) handlers.onSplit();
        return;
      }

      if (mod && key.toLowerCase() === "d" && handlers.hasSelection) {
        event.preventDefault();
        handlers.onDuplicate();
        return;
      }

      if (key === "Escape") {
        handlers.onDeselect();
        return;
      }

      if (key === "ArrowLeft") {
        event.preventDefault();
        handlers.onNudgePlayhead(event.shiftKey ? -1 : -1 / 30);
        return;
      }

      if (key === "ArrowRight") {
        event.preventDefault();
        handlers.onNudgePlayhead(event.shiftKey ? 1 : 1 / 30);
        return;
      }

      if (mod && (key === "=" || key === "+")) {
        event.preventDefault();
        handlers.onZoom(12);
        return;
      }

      if (mod && key === "-") {
        event.preventDefault();
        handlers.onZoom(-12);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
