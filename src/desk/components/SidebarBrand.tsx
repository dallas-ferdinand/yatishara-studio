"use client";

import { loadSession } from "@/lib/session";
import { MERCURYOS_LABEL } from "@/desk/lib/workspace";
import { MERCURY_LOGO_SIDEBAR } from "@/lib/brand-assets";
import { Icon } from "./Icons";

export function SidebarBrand() {
  const session = loadSession();
  const userName = session?.displayName?.trim() || session?.userId?.trim() || "";
  const vaultLabel = userName ? `${userName} chats` : "This device (PIN)";

  return (
    <span
      className="cursor-project-btn cursor-explorer-title cursor-sidebar-brand"
      title={`${MERCURYOS_LABEL} · ${vaultLabel}`}
    >
      <span className="cursor-sidebar-brand-logo" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MERCURY_LOGO_SIDEBAR}
          alt=""
          width={16}
          height={16}
          decoding="async"
          loading="eager"
          className="cursor-sidebar-brand-logo-img"
        />
      </span>
      <span className="cursor-sidebar-brand-text truncate">
        <span className="cursor-sidebar-brand-os">{MERCURYOS_LABEL}</span>
        {userName ? (
          <>
            <span className="cursor-sidebar-brand-sep" aria-hidden="true">
              ·
            </span>
            <span className="cursor-sidebar-brand-user">
              <span className="cursor-sidebar-brand-user-icon" aria-hidden="true">
                <Icon name="user" size={11} />
              </span>
              <span className="cursor-sidebar-brand-user-name truncate">{userName}</span>
            </span>
          </>
        ) : null}
      </span>
    </span>
  );
}
