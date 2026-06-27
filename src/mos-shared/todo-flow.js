export function mergeTodoSnapshot(prev, event = {}) {
  const incoming = Array.isArray(event.items)
    ? event.items
    : Array.isArray(event.todos)
      ? event.todos
      : Array.isArray(event.content)
        ? event.content
        : [];
  const items = incoming.length ? incoming : (prev?.items ?? []);
  return {
    type: "todos",
    id: event.id ?? prev?.id ?? "todos",
    title: event.title ?? prev?.title ?? "Tasks",
    status: event.status ?? prev?.status ?? "active",
    items: items.map((item, idx) => ({
      id: item.id ?? item.key ?? `todo_${idx}`,
      content: item.content ?? item.text ?? item.title ?? "",
      status: item.status ?? (item.done ? "completed" : "pending"),
    })),
  };
}
