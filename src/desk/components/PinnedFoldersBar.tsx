// @ts-nocheck
"use client";

import { Icon } from "./Icons";

export function PinnedFoldersBar({ pins, onNavigate, onUnpin }) {
  if (!pins?.length) return null;

  return (
    <div className="desk-explorer-pins shrink-0">
      <div className="desk-explorer-pins-head">
        <Icon name="pin" size={12} className="desk-explorer-pins-icon" />
        <span>Pinned</span>
      </div>
      <div className="desk-explorer-pins-list">
        {pins.map((pin) => (
          <div key={pin.path} className="desk-explorer-pin-row">
            <button
              type="button"
              className="desk-explorer-pin-btn"
              title={pin.path}
              onClick={() => onNavigate(pin.path)}
            >
              <Icon name="folder" size={14} className="shrink-0 text-cursor-muted" />
              <span className="truncate">{pin.label}</span>
            </button>
            {onUnpin ? (
              <button
                type="button"
                className="desk-explorer-pin-unpin"
                aria-label={`Unpin ${pin.label}`}
                title="Unpin"
                onClick={() => onUnpin(pin.path)}
              >
                <Icon name="x" size={12} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
