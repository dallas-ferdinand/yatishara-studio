/**
 * Lightweight plan/todo for multi-step turns (local to one Pi session).
 */

export function createPlanStore() {
  /** @type {{ goal: string, steps: Array<{ id: string, text: string, status: string }> }} */
  let plan = { goal: "", steps: [] };

  return {
    get() {
      return {
        goal: plan.goal,
        steps: plan.steps.map((s) => ({ ...s })),
        open: plan.steps.filter((s) => s.status !== "done").length,
      };
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
      return this.get();
    },
    update(id, status) {
      const step = plan.steps.find((s) => s.id === id);
      if (!step) return { ok: false, error: `unknown step ${id}` };
      if (!["pending", "doing", "done", "blocked"].includes(status)) {
        return { ok: false, error: "status must be pending|doing|done|blocked" };
      }
      step.status = status;
      return { ok: true, plan: this.get() };
    },
    clear() {
      plan = { goal: "", steps: [] };
      return { ok: true };
    },
  };
}
