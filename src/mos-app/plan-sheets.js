/** Plan review sheet — view plan markdown, execute, close back to chat. */
import { renderMarkdown, enhanceMarkdown } from "./markdown.js";
import { icon } from "./icons.js";

/** @type {null | { title: string, content: string, callId?: string }} */
let activePlan = null;
/** @type {null | object} */
let ctx = null;

export function wirePlanSheets(appCtx) {
  ctx = appCtx;

  document.querySelector("#plan-sheet-close")?.addEventListener("click", closePlanSheet);
  document.querySelector(".plan-backdrop")?.addEventListener("click", closePlanSheet);
  document.querySelector("#plan-execute-btn")?.addEventListener("click", executeActivePlan);
  document.querySelector("#plan-close-btn")?.addEventListener("click", closePlanSheet);
}

export function openPlanSheet(plan) {
  if (!plan?.content) return;
  activePlan = {
    title: plan.title ?? "Plan",
    content: plan.content,
    callId: plan.callId,
  };
  const titleEl = document.querySelector("#plan-sheet-title");
  const bodyEl = document.querySelector("#plan-sheet-body");
  if (titleEl) titleEl.textContent = activePlan.title;
  if (bodyEl) {
    bodyEl.innerHTML = renderMarkdown(activePlan.content);
    enhanceMarkdown(bodyEl);
  }
  document.querySelector("#plan-sheet")?.classList.remove("hidden");
  ctx?.haptic?.tap?.();
}

export function closePlanSheet() {
  document.querySelector("#plan-sheet")?.classList.add("hidden");
  activePlan = null;
  ctx?.focusInput?.();
}

function executeActivePlan() {
  if (!activePlan) return;
  closePlanSheet();
  ctx?.haptic?.tap?.();
  ctx?.sound?.tap?.();
  ctx?.executePlan?.(activePlan);
}

export function getPlanFromBlock(block) {
  if (!block || block.type !== "plan") return null;
  return { title: block.title, content: block.content, callId: block.callId };
}

export function paintPlanSheetCloseIcon() {
  const btn = document.querySelector("#plan-sheet-header-close");
  if (btn) btn.innerHTML = icon("x", 18);
}
