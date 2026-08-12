"use client";

import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { MarkdownDocEditor } from "@/desk/components/MarkdownDocEditor";

type Props = {
  name?: string;
  documentId: string;
  value: string;
  onChange: (contentMarkdown: string) => void;
};

type BoundaryState = { failed: boolean; message: string };

/** Keep Script render failures inside the pane — never wall StudioShell. */
class ScriptPaneErrorBoundary extends Component<
  { children: ReactNode; documentId: string },
  BoundaryState
> {
  state: BoundaryState = { failed: false, message: "" };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return {
      failed: true,
      message: String(error?.message ?? "Script failed to render").slice(0, 240),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ScriptPane]", this.props.documentId, error, info?.componentStack);
    try {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "script-pane",
          documentId: this.props.documentId,
          message: error?.message,
          stack: String(error?.stack ?? "").slice(0, 2000),
        }),
        keepalive: true,
      });
    } catch {
      /* ignore */
    }
  }

  componentDidUpdate(prevProps: { documentId: string }) {
    if (prevProps.documentId !== this.props.documentId && this.state.failed) {
      this.setState({ failed: false, message: "" });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="studio-asset-preview studio-document-preview p-6">
          <p className="text-sm font-medium text-cursor-fg">Couldn’t open this Script</p>
          <p className="mt-2 text-xs text-cursor-muted">{this.state.message}</p>
          <button
            type="button"
            className="mt-4 text-xs underline"
            onClick={() => this.setState({ failed: false, message: "" })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Isolates Script body edits from StudioShell. Parent only gets debounced saves;
 * live typing stays local so the shell doesn’t re-render on every keystroke.
 */
export function StudioScriptPane({ name, documentId, value, onChange }: Props) {
  const [localValue, setLocalValue] = useState(value ?? "");
  const saveTimerRef = useRef(0);
  const lastSavedRef = useRef(value ?? "");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    // Hydrate from Convex when switching docs or remote body arrives.
    setLocalValue(value ?? "");
    lastSavedRef.current = value ?? "";
  }, [documentId, value]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (next: string) => {
      setLocalValue(next);
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        if (next === lastSavedRef.current) return;
        lastSavedRef.current = next;
        onChangeRef.current(next);
      }, 400);
    },
    [],
  );

  return (
    <ScriptPaneErrorBoundary documentId={documentId}>
      <div className="studio-asset-preview studio-document-preview">
        <MarkdownDocEditor
          name={name}
          value={localValue}
          onChange={handleChange}
          onSave={() => {
            window.clearTimeout(saveTimerRef.current);
            if (localValue === lastSavedRef.current) return;
            lastSavedRef.current = localValue;
            onChangeRef.current(localValue);
          }}
        />
      </div>
    </ScriptPaneErrorBoundary>
  );
}
