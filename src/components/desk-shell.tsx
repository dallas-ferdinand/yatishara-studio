"use client";

import { useState } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { Sidebar } from "./sidebar";
import { AgentPanel } from "./agent-panel";
import { useDeskSession } from "@/hooks/use-desk-session";
import type { Session } from "@/lib/types";
import { clearSession } from "@/lib/session";

type Props = {
  session: Session;
  onDisconnect: () => void;
};

export function DeskShell({ session, onDisconnect }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const desk = useDeskSession(session);

  const disconnect = () => {
    clearSession();
    onDisconnect();
  };

  if (!desk.ready) {
    return <AppLoadingScreen message="Restoring workspace…" />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-mos-border-soft bg-mos-sidebar px-3">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold text-mos-text-bright"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            MercuryOS
          </span>
          <span className="rounded bg-mos-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-mos-accent">
            Desk 2
          </span>
        </div>
        <div className="flex items-center gap-1">
          <a
            href="/"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-mos-muted hover:bg-mos-hover hover:text-mos-text"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Full desk
          </a>
          <button
            type="button"
            onClick={disconnect}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-mos-muted hover:bg-mos-hover hover:text-mos-text"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          chats={desk.state.chats}
          activeId={desk.state.activeId}
          onSelect={desk.selectChat}
          onNew={desk.createChat}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />
        <AgentPanel
          chat={desk.activeChat}
          streaming={desk.isStreaming}
          onSend={(t) => void desk.sendMessage(t)}
          onCancel={() => void desk.cancelRun()}
          onDraft={desk.setDraft}
        />
      </div>
    </div>
  );
}
