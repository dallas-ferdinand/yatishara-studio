/**
 * Lightweight plan/todo for multi-step turns (local to one Pi session).
 * Latest list is reinjected into tool observations so the model stays on track.
 */

/**
 * @typedef {{ id: string, text: string, status: string }} PlanStep
 * @typedef {{ goal: string, steps: PlanStep[], open: number }} PlanSnapshot
 */

export function createPlanStore() {
  /** @type {{ goal: string, steps: PlanStep[] }} */
  let plan = { goal: "", steps: [] };
  /** @type {((snap: PlanSnapshot) => void)|null} */
  let onChange = null;

  const api = {
    /**
     * @param {(snap: PlanSnapshot) => void} fn
     */
    setOnChange(fn) {
      onChange = typeof fn === "function" ? fn : null;
    },
    get() {
      return {
        goal: plan.goal,
        steps: plan.steps.map((s) => ({ ...s })),
        open: plan.steps.filter((s) => s.status !== "done").length,
      };
    },
    /** Compact block for prompt / observation reinjection */
    formatBlock() {
      const snap = this.get();
      if (!snap.steps.length) return "";
      const lines = [
        "TODO (update as you go — mark doing/done):",
        snap.goal ? `Goal: ${snap.goal}` : null,
        ...snap.steps.map((s) => {
          const mark =
            s.status === "done"
              ? "[x]"
              : s.status === "doing"
                ? "[~]"
                : s.status === "blocked"
                  ? "[!]"
                  : "[ ]";
          return `${mark} ${s.id}: ${s.text}`;
        }),
      ].filter(Boolean);
      return lines.join("\n");
    },
    set(goal, steps) {
      const list = Array.isArray(steps) ? steps : [];
      plan = {
        goal: String(goal || "").trim().slice(0, 240),
        steps: list.slice(0, 12).map((step, index) => {
          if (typeof step === "string") {
            return {
              id: `s${index + 1}`,
              text: step.slice(0, 160),
              status: "pending",
            };
          }
          return {
            id: String(step.id || `s${index + 1}`).slice(0, 24),
            text: String(step.text || step.title || "").slice(0, 160),
            status: ["pending", "doing", "done", "blocked"].includes(step.status)
              ? step.status
              : "pending",
          };
        }),
      };
      const snap = this.get();
      try {
        onChange?.(snap);
      } catch {
        // ignore sync errors
      }
      return snap;
    },
    update(id, status) {
      const step = plan.steps.find((s) => s.id === id);
      if (!step) return { ok: false, error: `unknown step ${id}` };
      if (!["pending", "doing", "done", "blocked"].includes(status)) {
        return { ok: false, error: "status must be pending|doing|done|blocked" };
      }
      step.status = status;
      const snap = this.get();
      try {
        onChange?.(snap);
      } catch {
        // ignore
      }
      return { ok: true, plan: snap };
    },
    clear() {
      plan = { goal: "", steps: [] };
      const snap = this.get();
      try {
        onChange?.(snap);
      } catch {
        // ignore
      }
      return { ok: true };
    },
  };
  return api;
}
