/** Android back + in-app navigation stack (WhatsApp-style). */
let ctx = null;

export function initNavigation(appCtx) {
  ctx = appCtx;
  window.__mercuryBack = () => handleBack();
}

export function handleBack() {
  if (!ctx) return false;

  const preview = document.querySelector("#preview");
  if (preview && !preview.classList.contains("hidden")) {
    ctx.closePreview();
    return true;
  }

  const renameSheet = document.querySelector("#rename-sheet");
  if (renameSheet && !renameSheet.classList.contains("hidden")) {
    ctx.closeRenameSheet?.();
    return true;
  }

  const deleteSheet = document.querySelector("#delete-sheet");
  if (deleteSheet && !deleteSheet.classList.contains("hidden")) {
    ctx.closeDeleteSheet?.();
    return true;
  }

  const onboardSheet = document.querySelector("#onboard-sheet");
  if (onboardSheet && !onboardSheet.classList.contains("hidden")) {
    ctx.closeOnboardSheet?.();
    return true;
  }

  const pairingHelp = document.querySelector("#pairing-help-sheet");
  if (pairingHelp && !pairingHelp.classList.contains("hidden")) {
    ctx.closePairingHelp?.();
    return true;
  }

  const projectRowSheet = document.querySelector("#project-row-sheet");
  if (projectRowSheet && !projectRowSheet.classList.contains("hidden")) {
    ctx.closeProjectRowSheet?.();
    return true;
  }

  const fileActionsSheet = document.querySelector("#file-actions-sheet");
  if (fileActionsSheet && !fileActionsSheet.classList.contains("hidden")) {
    ctx.closeFileActions?.();
    return true;
  }

  if (ctx.activeView === "settings") {
    const sessionsSheet = document.querySelector("#sessions-sheet");
    if (sessionsSheet && !sessionsSheet.classList.contains("hidden")) {
      sessionsSheet.classList.add("hidden");
      return true;
    }
    const runsSheet = document.querySelector("#runs-sheet");
    if (runsSheet && !runsSheet.classList.contains("hidden")) {
      runsSheet.classList.add("hidden");
      return true;
    }
    ctx.closeSettingsToLastTab?.();
    return true;
  }

  const setPinSheet = document.querySelector("#set-pin-sheet");
  if (setPinSheet && !setPinSheet.classList.contains("hidden")) {
    ctx.closeSetPinSheet?.();
    return true;
  }

  const pasteSheet = document.querySelector("#paste-sheet");
  if (pasteSheet && !pasteSheet.classList.contains("hidden")) {
    ctx.closePasteSheet?.();
    return true;
  }

  for (const id of ["theme-sheet", "attach-sheet", "chat-agent-sheet", "plan-sheet"]) {
    const sheet = document.querySelector(`#${id}`);
    if (sheet && !sheet.classList.contains("hidden")) {
      sheet.classList.add("hidden");
      return true;
    }
  }

  if (ctx.handleExplorerSystemBack?.()) return true;

  const projectSheet = document.querySelector("#project-switcher-sheet");
  if (projectSheet && !projectSheet.classList.contains("hidden")) {
    projectSheet.classList.add("hidden");
    return true;
  }

  const sessionsSheet = document.querySelector("#sessions-sheet");
  if (sessionsSheet && !sessionsSheet.classList.contains("hidden")) {
    sessionsSheet.classList.add("hidden");
    return true;
  }

  const runsSheet = document.querySelector("#runs-sheet");
  if (runsSheet && !runsSheet.classList.contains("hidden")) {
    runsSheet.classList.add("hidden");
    return true;
  }

  const permsSheet = document.querySelector("#perms-sheet");
  if (permsSheet && !permsSheet.classList.contains("hidden")) {
    ctx.closePermsSheet();
    return true;
  }

  const msgActionsSheet = document.querySelector("#msg-actions-sheet");
  if (msgActionsSheet && !msgActionsSheet.classList.contains("hidden")) {
    ctx.closeMsgActions?.();
    return true;
  }

  const chatActionsSheet = document.querySelector("#chat-actions-sheet");
  if (chatActionsSheet && !chatActionsSheet.classList.contains("hidden")) {
    ctx.closeChatActions?.();
    return true;
  }

  if (ctx.activeView === "files" && ctx.filesPath && ctx.filesPath !== ".") {
    const parts = ctx.filesPath.split("/").filter(Boolean);
    parts.pop();
    ctx.loadFiles(parts.join("/") || ".");
    return true;
  }

  if (ctx.activeView === "files") {
    ctx.showChatsTab?.();
    return true;
  }

  if (ctx.activeView === "thread") {
    ctx.backToInbox?.();
    return true;
  }

  return false;
}
