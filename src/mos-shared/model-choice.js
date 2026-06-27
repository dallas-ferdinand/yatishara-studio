/** User model choice — never confuse with SDK-resolved model id. */
export const AUTO_MODEL = "auto";

/** Normalize stored/API model id to user choice ("auto" or concrete id). */
export function normalizeModelChoice(model) {
  if (model == null || model === "") return AUTO_MODEL;
  const id = String(model).trim();
  const lower = id.toLowerCase();
  if (lower === "auto" || lower === "default") return AUTO_MODEL;
  return id;
}

export function isAutoModel(model) {
  return normalizeModelChoice(model) === AUTO_MODEL;
}

/** Label for composer / settings — always "Auto" when user chose auto. */
export function modelChoiceLabel(model) {
  return isAutoModel(model) ? "Auto" : normalizeModelChoice(model);
}

/** Status line when auto resolves to a concrete model (informational only). */
export function autoResolvedHint(choice, resolved) {
  if (!isAutoModel(choice)) return null;
  if (!resolved || isAutoModel(resolved)) return null;
  return normalizeModelChoice(resolved);
}

export function connectedStatusMessage(choice, resolved) {
  const c = normalizeModelChoice(choice);
  if (isAutoModel(c)) {
    const hint = autoResolvedHint(c, resolved);
    return hint ? `Connected · Auto (${hint})` : "Connected · Auto";
  }
  return `Connected · ${resolved && !isAutoModel(resolved) ? normalizeModelChoice(resolved) : c}`;
}

/** Connection/bootstrap lines — hide in chat UI (tools/thinking show real progress). */
export function isNoiseStatusMessage(message) {
  const m = String(message ?? "").trim();
  if (!m) return true;
  if (/^Starting agent/i.test(m)) return true;
  if (/^Connected ·/i.test(m)) return true;
  if (/^Connecting to agent/i.test(m)) return true;
  return false;
}
