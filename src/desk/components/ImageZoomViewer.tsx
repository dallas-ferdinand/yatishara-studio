// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

function clampScale(value) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(value).toFixed(2)));
}

export function ImageZoomViewer({ thumbUrl, fullUrl, name, onDownload }) {
  const [displayUrl, setDisplayUrl] = useState(thumbUrl || fullUrl);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [editingScale, setEditingScale] = useState(false);
  const [scaleDraft, setScaleDraft] = useState("100");
  const stageRef = useRef(null);
  const scaleInputRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 });

  const canPan = scale > 1.001;

  useEffect(() => {
    setDisplayUrl(thumbUrl || fullUrl);
    setFullLoaded(false);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setEditingScale(false);
    setScaleDraft("100");
  }, [thumbUrl, fullUrl]);

  useEffect(() => {
    if (!fullUrl || fullUrl === thumbUrl) {
      setFullLoaded(true);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setDisplayUrl(fullUrl);
      setFullLoaded(true);
    };
    img.onerror = () => setFullLoaded(true);
    img.src = fullUrl;
  }, [fullUrl, thumbUrl]);

  useEffect(() => {
    if (editingScale) scaleInputRef.current?.focus();
  }, [editingScale]);

  useEffect(() => {
    if (!editingScale) setScaleDraft(String(Math.round(scale * 100)));
  }, [scale, editingScale]);

  const applyScale = useCallback((next, anchor = null) => {
    setScale((prev) => {
      const clamped = clampScale(next);
      if (clamped <= 1) {
        setPan({ x: 0, y: 0 });
        return clamped;
      }
      if (anchor && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const mx = anchor.x - cx;
        const my = anchor.y - cy;
        const ratio = clamped / prev;
        setPan((p) => ({
          x: mx - (mx - p.x) * ratio,
          y: my - (my - p.y) * ratio,
        }));
      }
      return clamped;
    });
  }, []);

  const zoom = useCallback(
    (delta, anchor = null) => {
      setScale((prev) => {
        const next = clampScale(prev + delta);
        if (next <= 1) {
          setPan({ x: 0, y: 0 });
          return next;
        }
        if (anchor && stageRef.current) {
          const rect = stageRef.current.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const mx = anchor.x - cx;
          const my = anchor.y - cy;
          const ratio = next / prev;
          setPan((p) => ({
            x: mx - (mx - p.x) * ratio,
            y: my - (my - p.y) * ratio,
          }));
        }
        return next;
      });
    },
    [],
  );

  const fit = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setEditingScale(false);
    setScaleDraft("100");
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.12 : -0.12;
      zoom(step, { x: e.clientX, y: e.clientY });
    };
    const opts = { passive: false };
    el.addEventListener("wheel", onWheel, opts);
    return () => el.removeEventListener("wheel", onWheel, opts);
  }, [zoom]);

  const onPointerDown = useCallback(
    (e) => {
      if (!canPan || e.button !== 0) return;
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [canPan, pan.x, pan.y],
  );

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
    e.preventDefault();
  }, []);

  const endDrag = useCallback((e) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const commitScaleDraft = useCallback(() => {
    const raw = String(scaleDraft).trim().replace(/%$/, "");
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setScaleDraft(String(Math.round(scale * 100)));
      setEditingScale(false);
      return;
    }
    applyScale(n / 100);
    setScaleDraft(String(Math.round(n)));
    setEditingScale(false);
  }, [scaleDraft, scale, applyScale]);

  const statusLabel = !fullLoaded
    ? "Loading full…"
    : fullUrl !== thumbUrl
      ? "Full quality"
      : null;

  return (
    <div className="desk-image-viewer">
      <div className="desk-image-viewer-toolbar">
        <div className="desk-image-viewer-toolbar-left">
          {name ? (
            <span className="desk-image-viewer-name truncate" title={name}>
              {name}
            </span>
          ) : null}
          {statusLabel ? <span className="desk-image-viewer-status">{statusLabel}</span> : null}
        </div>
        <div className="desk-image-viewer-toolbar-center">
          <button type="button" className="cursor-icon-btn" title="Zoom out" onClick={() => zoom(-0.25)}>
            <Icon name="zoomOut" size={14} />
          </button>
          {editingScale ? (
            <input
              ref={scaleInputRef}
              type="text"
              inputMode="numeric"
              className="desk-image-viewer-scale-input"
              value={scaleDraft}
              onChange={(e) => setScaleDraft(e.target.value)}
              onBlur={commitScaleDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitScaleDraft();
                } else if (e.key === "Escape") {
                  setEditingScale(false);
                  setScaleDraft(String(Math.round(scale * 100)));
                }
              }}
              aria-label="Zoom percentage"
            />
          ) : (
            <button
              type="button"
              className="desk-image-viewer-scale-btn"
              title="Set zoom %"
              onClick={() => {
                setScaleDraft(String(Math.round(scale * 100)));
                setEditingScale(true);
              }}
            >
              {Math.round(scale * 100)}%
            </button>
          )}
          <button type="button" className="cursor-icon-btn" title="Zoom in" onClick={() => zoom(0.25)}>
            <Icon name="zoomIn" size={14} />
          </button>
          <button type="button" className="cursor-icon-btn" title="Fit to screen" onClick={fit}>
            <Icon name="maximize" size={14} />
          </button>
        </div>
        <div className="desk-image-viewer-toolbar-right">
          {onDownload ? (
            <button type="button" className="cursor-icon-btn" title="Download" onClick={onDownload}>
              <Icon name="download" size={14} />
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={stageRef}
        className={`desk-image-viewer-stage${canPan ? " is-pannable" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={displayUrl}
          alt={name}
          className="desk-image-viewer-img"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}
