/** Shared todo board parse for Agent UI (mirrors agentPlan.mjs shape). */

export type TodoStep = { id: string; text: string; status: string };
export type TodoList = {
  id: string;
  title: string;
  status: string;
  steps: TodoStep[];
};
export type TodoBoard = { lists: TodoList[]; activeId: string | null };

export function parseBoard(raw?: string | null): TodoBoard {
  if (!raw) return { lists: [], activeId: null };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.steps) && !Array.isArray(parsed?.lists)) {
      return {
        lists: [
          {
            id: "todo_legacy",
            title: String(parsed.goal || "Plan"),
            status: "active",
            steps: (parsed.steps || []).map(
              (s: string | { id?: string; text?: string; status?: string }, i: number) =>
                typeof s === "string"
                  ? { id: `s${i + 1}`, text: s, status: "pending" }
                  : {
                      id: String(s.id || `s${i + 1}`),
                      text: String(s.text || ""),
                      status: String(s.status || "pending"),
                    },
            ),
          },
        ],
        activeId: "todo_legacy",
      };
    }
    const lists = Array.isArray(parsed?.lists) ? parsed.lists : [];
    return {
      lists: lists.map((l: Record<string, unknown>) => ({
        id: String(l.id || ""),
        title: String(l.title || "To-do"),
        status: String(l.status || "active"),
        steps: Array.isArray(l.steps)
          ? l.steps.map((s: Record<string, unknown>, i: number) => ({
              id: String(s.id || `s${i + 1}`),
              text: String(s.text || ""),
              status: String(s.status || "pending"),
            }))
          : [],
      })),
      activeId: parsed?.activeId ? String(parsed.activeId) : null,
    };
  } catch {
    return { lists: [], activeId: null };
  }
}
