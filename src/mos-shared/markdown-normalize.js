/** Fix common LLM / Cursor markdown quirks before parse. */

function polishCursorMarkdown(text) {
  let s = String(text ?? "");

  s = s.replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/[\u201C\u201D]/g, '"');

  // Blank line before lists/headings when previous line is prose (not another list item)
  const lines = s.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = out[out.length - 1] ?? "";
    const prevTrim = prev.trim();
    const isUl = /^[-*+]\s/.test(line);
    const isOl = /^\d+\.\s/.test(line);
    const isHead = /^#{1,6}\s/.test(line);
    const prevIsList = /^[-*+]\s/.test(prevTrim) || /^\d+\.\s/.test(prevTrim);

    if (
      out.length &&
      prevTrim &&
      !prevIsList &&
      (isUl || isOl || isHead)
    ) {
      out.push("");
    }

    out.push(line);
  }
  s = out.join("\n");

  // Cursor often bolds labels inline — ensure space after closing ** before next word
  s = s.replace(/\*\*([^*\n]+)\*\*(?=[A-Za-z(])/g, "**$1** ");

  return s;
}

/** Split a pipe row with or without leading/trailing pipes. */
function splitPipeRow(line) {
  let s = String(line ?? "").trim();
  if (!s.includes("|")) return null;
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = s.split("|").map((c) => c.trim());
  return cells.length >= 2 ? cells : null;
}

function formatPipeRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

/** Pipe-delimited table line — GFM or LLM style (# | A | B |). */
function isTableLine(line) {
  const t = String(line ?? "").trim();
  if (!t.includes("|")) return false;
  if (t.startsWith("|")) return true;
  const cells = splitPipeRow(t);
  if (!cells || cells.length < 2) return false;
  // Avoid code-ish single pipes in prose
  if (cells.length === 2 && cells.every((c) => c.length > 80)) return false;
  return true;
}

function isSeparatorRow(line) {
  const cells = splitPipeRow(line);
  if (!cells?.length) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function isSeparatorOnlyLine(line) {
  const t = String(line ?? "").trim();
  if (/^\|[-:\s|]+\|$/.test(t)) return true;
  if (/^\|?\s*:?-{2,}\s*:?\s*\|?$/.test(t)) return true;
  return isSeparatorRow(line);
}

/** Rebuild broken GFM pipe tables so marked can parse them. */
function repairPipeTables(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const pipeish = isTableLine(line) || isSeparatorOnlyLine(line);

    if (!pipeish) {
      out.push(line);
      i += 1;
      continue;
    }

    const block = [];
    while (i < lines.length && (isTableLine(lines[i]) || isSeparatorOnlyLine(lines[i]))) {
      block.push(lines[i]);
      i += 1;
    }

    const repaired = repairTableBlock(block);
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    out.push(...repaired);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function repairTableBlock(rows) {
  if (!rows.length) return rows;

  let headerIdx = rows.findIndex((r) => !isSeparatorRow(r) && !isSeparatorOnlyLine(r));
  if (headerIdx < 0) headerIdx = 0;

  const headerCells = splitPipeRow(rows[headerIdx]);
  if (!headerCells?.length) return rows.map((r) => normalizePipeRow(r));

  let colCount = headerCells.length;

  if (colCount < 2) return rows.map((r) => normalizePipeRow(r));

  const fixed = [formatPipeRow(headerCells.slice(0, colCount))];
  fixed.push(formatPipeRow(Array(colCount).fill("---")));

  for (let i = 0; i < rows.length; i++) {
    if (i === headerIdx) continue;
    if (isSeparatorRow(rows[i]) || isSeparatorOnlyLine(rows[i])) continue;

    let cells = splitPipeRow(rows[i]) ?? [];
    if (cells[0] != null) cells[0] = cells[0].replace(/^---+\s*/, "");
    cells = cells.map((c) => c.replace(/\s+/g, " ").trim());

    while (cells.length < colCount) cells.push("");
    if (cells.length > colCount) {
      const head = cells.slice(0, colCount - 1);
      const tail = cells.slice(colCount - 1).join(" · ");
      cells = [...head, tail];
    }

    if (cells.some((c) => c)) fixed.push(formatPipeRow(cells));
  }

  return fixed;
}

function normalizePipeRow(line) {
  const t = String(line ?? "").trim();
  if (!t.includes("|")) return line;
  const cells = splitPipeRow(t);
  if (!cells) return line;
  return formatPipeRow(cells);
}

/** Close dangling fences / table rows while streaming so marked stays stable. */
export function stabilizeStreamingMarkdown(raw) {
  let s = polishCursorMarkdown(raw);
  const fences = (s.match(/```/g) ?? []).length;
  if (fences % 2 === 1) s += "\n```";

  const lines = s.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (last.includes("|")) {
    const cells = splitPipeRow(last);
    if (cells && cells.length >= 2) {
      lines[lines.length - 1] = formatPipeRow(cells);
      s = lines.join("\n");
    }
  }
  const last2 = lines[lines.length - 1]?.trim() ?? "";
  if (isTableLine(last2) && !lines.some((l) => isSeparatorRow(l) || isSeparatorOnlyLine(l))) {
    const cells = splitPipeRow(last2);
    if (cells && cells.length >= 2) {
      lines.splice(lines.length - 1, 0, formatPipeRow(Array(cells.length).fill("---")));
      s = lines.join("\n");
    }
  }
  return s;
}

export function normalizeMarkdown(raw) {
  let s = polishCursorMarkdown(raw);

  s = repairPipeTables(s);

  // Blank line before pipe tables (GFM) — repairPipeTables normalizes rows first
  s = s.replace(/([^\n|])\n(\|[^\n]+\|)/g, "$1\n\n$2");

  // Separator glued to data on SAME line only: |---|---|Cell (not valid | --- | --- |)
  s = s.replace(/^(\|(?:\s*:?\s*-+\s*:?\s*\|)+)([A-Za-z0-9(\[].*)$/gm, (_, sep, tail) => {
    const cell = tail.trim();
    if (!cell) return sep;
    return `${sep}\n| ${cell}${cell.includes("|") ? "" : " |"}`;
  });

  // Ensure pipe rows have closing |
  s = s.replace(/^([^\n]*\|[^\n]+)$/gm, (line) => {
    const t = line.trim();
    if (!t.includes("|")) return line;
    const cells = splitPipeRow(t);
    if (!cells || cells.length < 2) return line;
    return formatPipeRow(cells);
  });

  return s.replace(/\n{3,}/g, "\n\n");
}
