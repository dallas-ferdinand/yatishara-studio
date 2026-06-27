// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icons";
import { useHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";

function buildCrumbs(path: string) {
  const crumbs = [{ label: "Files", path: "" }];
  if (!path) return crumbs;
  const parts = path.split("/").filter(Boolean);
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function FileBreadcrumbs({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const crumbs = buildCrumbs(path ?? "");

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
              className={`desk-file-breadcrumbs-chip${i === crumbs.length - 1 ? " is-current" : ""}`}
              onClick={() => onNavigate(crumb.path)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
