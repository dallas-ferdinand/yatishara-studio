"use client";

import type { ReactNode } from "react";

type CursorTableEmptyProps = {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Centered empty plate for tables / list sections.
 * Pair with CursorTable, or drop into any cursor-table-wrap.
 */
export function CursorTableEmpty({
  title,
  hint,
  action,
  className = "",
}: CursorTableEmptyProps) {
  return (
    <div className={`cursor-table-empty${className ? ` ${className}` : ""}`}>
      <p className="cursor-table-empty-title">{title}</p>
      {hint ? <p className="cursor-table-empty-hint">{hint}</p> : null}
      {action ? <div className="cursor-table-empty-action">{action}</div> : null}
    </div>
  );
}

type CursorTableProps = {
  children?: ReactNode;
  /** When true, table body is replaced by the empty state. */
  empty?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  minWidth?: number | string;
  ariaLabel?: string;
  className?: string;
  wrapClassName?: string;
};

/**
 * Global table plate — same language as admin / offers tables.
 * Classes: .cursor-table-wrap + .cursor-table (+ legacy .studio-admin-table*).
 */
export function CursorTable({
  children,
  empty = false,
  emptyTitle = "Nothing here",
  emptyHint,
  emptyAction,
  loading = false,
  loadingLabel = "Loading…",
  minWidth = 760,
  ariaLabel,
  className = "",
  wrapClassName = "",
}: CursorTableProps) {
  const minWidthValue = typeof minWidth === "number" ? `${minWidth}px` : minWidth;

  return (
    <div
      className={`cursor-table-wrap studio-admin-table-wrap${wrapClassName ? ` ${wrapClassName}` : ""}`}
    >
      {loading ? (
        <div className="cursor-table-loading" role="status" aria-live="polite">
          <span className="cursor-table-loading-label">{loadingLabel}</span>
        </div>
      ) : empty ? (
        <CursorTableEmpty title={emptyTitle} hint={emptyHint} action={emptyAction} />
      ) : (
        <table
          className={`cursor-table studio-admin-table${className ? ` ${className}` : ""}`}
          style={{ minWidth: minWidthValue }}
          aria-label={ariaLabel}
        >
          {children}
        </table>
      )}
    </div>
  );
}
