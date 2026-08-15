/**
 * Multi todo-list board for Agent Mode.
 * Active list reinjected into tool observations; full board synced to thread.
 */

/**
 * @typedef {{ id: string, text: string, status: string }} PlanStep
 * @typedef {{
 *   id: string,
 *   title: string,
 *   status: "active"|"working"|"completed"|"cancelled",
 *   steps: PlanStep[],
 *   updatedAt?: number,
 * }} TodoList
 * @typedef {{ lists: TodoList[], activeId: string|null }} TodoBoard
 */

const LIST_STATUS = new Set(["active", "working", "completed", "cancelled"]);
const STEP_STATUS = new Set(["pending", "doing", "done", "blocked"]);

const LIST_STATUS_ALIAS = {
  done: "completed",
  complete: "completed",
  finished: "completed",
  in_progress: "working",
  "in-progress": "working",
  doing: "working",
  started: "working",
  canceled: "cancelled",
  cancel: "cancelled",
  open: "active",
  pending: "active",
};

const STEP_STATUS_ALIAS = {
  complete: "done",
  completed: "done",
  finished: "done",
  in_progress: "doing",
  "in-progress": "doing",
  working: "doing",
  started: "doing",
  progress: "doing",
  todo: "pending",
  open: "pending",
  cancelled: "blocked",
  canceled: "blocked",
};

function normalizeListStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  return LIST_STATUS_ALIAS[raw] || raw;
}

function normalizeStepStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  return STEP_STATUS_ALIAS[raw] || raw;
}

function findStep(list, stepId) {
  const raw = String(stepId || "").trim();
  if (!raw || !list) return null;
  const exact = list.steps.find((step) => step.id === raw);
  if (exact) return exact;
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= list.steps.length) {
    return list.steps[asNum - 1];
  }
  const numbered = list.steps.find((step) => step.id === `s${raw}`);
  if (numbered) return numbered;
  const needle = raw.toLowerCase();
  return (
    list.steps.find((step) => step.text.toLowerCase() === needle) ||
    list.steps.find((step) => step.text.toLowerCase().includes(needle)) ||
    null
  );
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  return list.slice(0, 16).map((step, index) => {
    if (typeof step === "string") {
      return {
        id: `s${index + 1}`,
        text: step.slice(0, 160),
        status: "pending",
      };
    }
    return {
      id: String(step.id || `s${index + 1}`).slice(0, 32),
      text: String(step.text || step.title || "").slice(0, 160),
      status: STEP_STATUS.has(step.status) ? step.status : "pending",
    };
  });
}

export function emptyBoard() {
  return { lists: [], activeId: null };
}

export function parseBoard(raw) {
  if (!raw) return emptyBoard();
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return emptyBoard();
    // Legacy single-plan shape { goal, steps }
    if (Array.isArray(parsed.steps) && !Array.isArray(parsed.lists)) {
      const id = "todo_legacy";
      return {
        lists: [
          {
            id,
            title: String(parsed.goal || "Plan").slice(0, 120),
            status: "active",
            steps: normalizeSteps(parsed.steps),
            updatedAt: Date.now(),
          },
        ],
        activeId: id,
      };
    }
    const lists = Array.isArray(parsed.lists)
      ? parsed.lists
          .slice(0, 12)
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const id = String(row.id || newId("todo")).slice(0, 40);
            return {
              id,
              title: String(row.title || row.goal || "To-do").slice(0, 120),
              status: LIST_STATUS.has(row.status) ? row.status : "active",
              steps: normalizeSteps(row.steps),
              updatedAt: Number(row.updatedAt) || Date.now(),
            };
          })
          .filter(Boolean)
      : [];
    let activeId = parsed.activeId ? String(parsed.activeId) : null;
    if (activeId && !lists.some((l) => l.id === activeId)) activeId = null;
    if (!activeId) {
      const working = lists.find((l) => l.status === "working" || l.status === "active");
      activeId = working?.id ?? lists[0]?.id ?? null;
    }
    return { lists, activeId };
  } catch {
    return emptyBoard();
  }
}

export function createPlanStore(seed) {
  /** @type {TodoBoard} */
  let board = parseBoard(seed);
  /** @type {((board: TodoBoard) => void)|null} */
  let onChange = null;

  function emit() {
    try {
      onChange?.(api.snapshot());
    } catch {
      // ignore
    }
  }

  function activeList() {
    return board.lists.find((l) => l.id === board.activeId) || null;
  }

  const api = {
    setOnChange(fn) {
      onChange = typeof fn === "function" ? fn : null;
    },
    snapshot() {
      return {
        lists: board.lists.map((l) => ({
          ...l,
          steps: l.steps.map((s) => ({ ...s })),
        })),
        activeId: board.activeId,
      };
    },
    /** @deprecated single-plan get — prefer snapshot() */
    get() {
      const list = activeList();
      if (!list) return { goal: "", steps: [], open: 0 };
      return {
        goal: list.title,
        steps: list.steps.map((s) => ({ ...s })),
        open: list.steps.filter((s) => s.status !== "done").length,
        listId: list.id,
        listStatus: list.status,
      };
    },
    formatBlock() {
      const snap = this.snapshot();
      if (!snap.lists.length) return "";
      const active = snap.lists.find((l) => l.id === snap.activeId);
      const lines = ["TODO BOARD (update as you go):"];
      for (const list of snap.lists) {
        const done = list.steps.filter((s) => s.status === "done").length;
        const total = list.steps.length;
        const mark =
          list.id === snap.activeId
            ? "ACTIVE"
            : list.status === "cancelled"
              ? "CANCELLED"
              : list.status === "completed"
                ? "DONE"
                : list.status.toUpperCase();
        lines.push(`• [${mark}] ${list.id} “${list.title}” ${done}/${total}`);
      }
      if (active?.steps?.length) {
        lines.push(`Current “${active.title}”:`);
        for (const s of active.steps) {
          const m =
            s.status === "done"
              ? "[x]"
              : s.status === "doing"
                ? "[~]"
                : s.status === "blocked"
                  ? "[!]"
                  : "[ ]";
          lines.push(`  ${m} ${s.id}: ${s.text}`);
        }
      }
      return lines.join("\n");
    },
    create({ title, steps, cancelActive } = {}) {
      const normalized = normalizeSteps(steps);
      if (normalized.length < 2) {
        return { ok: false, error: "create needs 2+ steps" };
      }
      if (cancelActive && board.activeId) {
        const prev = board.lists.find((l) => l.id === board.activeId);
        if (prev && (prev.status === "active" || prev.status === "working")) {
          prev.status = "cancelled";
          prev.updatedAt = Date.now();
        }
      }
      const id = newId("todo");
      const list = {
        id,
        title: String(title || "To-do").trim().slice(0, 120) || "To-do",
        status: "working",
        steps: normalized,
        updatedAt: Date.now(),
      };
      board.lists.push(list);
      board.activeId = id;
      emit();
      return { ok: true, board: this.snapshot(), list };
    },
    /** Legacy single set — creates/replaces active list */
    set(goal, steps) {
      return this.create({
        title: goal || "To-do",
        steps,
        cancelActive: true,
      });
    },
    updateStep(listId, stepId, status) {
      const list =
        board.lists.find((l) => l.id === (listId || board.activeId)) || null;
      if (!list) return { ok: false, error: "unknown list" };
      const step = findStep(list, stepId);
      if (!step) return { ok: false, error: `unknown step ${stepId}` };
      const nextStatus = normalizeStepStatus(status);
      if (!STEP_STATUS.has(nextStatus)) {
        return { ok: false, error: "status must be pending|doing|done|blocked" };
      }
      step.status = nextStatus;
      if (nextStatus === "doing") list.status = "working";
      if (list.steps.every((s) => s.status === "done")) list.status = "completed";
      list.updatedAt = Date.now();
      board.activeId = list.id;
      emit();
      return { ok: true, board: this.snapshot() };
    },
    /** @deprecated */
    update(id, status) {
      return this.updateStep(null, id, status);
    },
    addStep(listId, text) {
      const list =
        board.lists.find((l) => l.id === (listId || board.activeId)) || null;
      if (!list) return { ok: false, error: "unknown list" };
      if (list.steps.length >= 16) return { ok: false, error: "max 16 steps" };
      const id = `s${list.steps.length + 1}_${Math.random().toString(36).slice(2, 5)}`;
      list.steps.push({
        id,
        text: String(text || "").trim().slice(0, 160),
        status: "pending",
      });
      list.status = list.status === "completed" ? "working" : list.status;
      list.updatedAt = Date.now();
      emit();
      return { ok: true, board: this.snapshot() };
    },
    removeStep(listId, stepId) {
      const list =
        board.lists.find((l) => l.id === (listId || board.activeId)) || null;
      if (!list) return { ok: false, error: "unknown list" };
      list.steps = list.steps.filter((s) => s.id !== stepId);
      list.updatedAt = Date.now();
      emit();
      return { ok: true, board: this.snapshot() };
    },
    setListStatus(listId, status) {
      const list =
        board.lists.find((l) => l.id === listId) ||
        (!listId ? activeList() : null);
      if (!list) return { ok: false, error: "unknown list" };
      const nextStatus = normalizeListStatus(status);
      if (!LIST_STATUS.has(nextStatus)) {
        return { ok: false, error: "bad list status" };
      }
      list.status = nextStatus;
      list.updatedAt = Date.now();
      if (nextStatus === "active" || nextStatus === "working") board.activeId = list.id;
      emit();
      return { ok: true, board: this.snapshot() };
    },
    renameList(listId, title) {
      const list = board.lists.find((l) => l.id === listId);
      if (!list) return { ok: false, error: "unknown list" };
      list.title = String(title || "").trim().slice(0, 120) || list.title;
      list.updatedAt = Date.now();
      emit();
      return { ok: true, board: this.snapshot() };
    },
    clear() {
      board = emptyBoard();
      emit();
      return { ok: true, board: this.snapshot() };
    },
    load(raw) {
      board = parseBoard(raw);
      emit();
      return this.snapshot();
    },
  };
  return api;
}
