// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { displayWorkspacePath } from "@/desk/lib/display-path";

function buildCrumbs(path: string) {
  const crumbs = [{ label: "files", path: "" }];
  if (!path) return crumbs;
  const rawParts = String(path).split("/").filter(Boolean);
  const parts = rawParts[0]?.toLowerCase() === "studio" ? rawParts.slice(1) : rawParts;
  const rawOffset = rawParts.length - parts.length;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const acc = rawParts.slice(0, index + rawOffset + 1).join("/");
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function FileBreadcrumbs({
  path,
  onNavigate,
  onDropEntry,
}: {
  path: string;
  onNavigate: (path: string) => void;
  onDropEntry?: (event: React.DragEvent, crumbPath: string, crumbIndex: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const crumbs = buildCrumbs(path ?? "");
  const [dragOverIndex, setDragOverIndex] = useState(-1);

  useHorizontalWheelScroll(scrollRef);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [path]);

  return (
    <div className="desk-file-breadcrumbs shrink-0">
      <div ref={scrollRef} className="desk-file-breadcrumbs-track">
        {crumbs.map((crumb, i) => (
          <span key={crumb.path || "root"} className="desk-file-breadcrumbs-segment">
            {i > 0 ? (
              <Icon name="chevR" size={10} className="desk-file-breadcrumbs-sep" aria-hidden />
            ) : null}
            <button
              type="button"
              className={`desk-file-breadcrumbs-chip${i === crumbs.length - 1 ? " is-current" : ""}${dragOverIndex === i ? " is-drag-over" : ""}`}
              data-drop-target="breadcrumb"
              onClick={() => onNavigate(crumb.path)}
              title={displayWorkspacePath(crumb.path)}
              onDragOver={onDropEntry ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIndex(i); } : undefined}
              onDragLeave={onDropEntry ? () => setDragOverIndex(-1) : undefined}
              onDrop={onDropEntry ? (e) => { e.preventDefault(); setDragOverIndex(-1); onDropEntry(e, crumb.path, i); } : undefined}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
