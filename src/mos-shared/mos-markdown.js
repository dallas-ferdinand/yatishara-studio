/**
 * MercuryOS Markdown — purpose-built for AI chat replies on phone + desk.
 * Parses common LLM output directly to styled HTML (no marked/DOMPurify).
 */

import { normalizeMarkdown } from "./markdown-normalize.js";
import { renderMosUi } from "./mos-ui-render.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return esc(s).replace(/'/g, "&#39;");
}

function splitPipeRow(line) {
  let s = String(line ?? "").trim();
  if (!s.includes("|")) return null;
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = s.split("|").map((c) => c.trim());
  return cells.length >= 2 ? cells : null;
}

function isSeparatorRow(line) {
  const cells = splitPipeRow(line);
  if (!cells?.length) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function isTableLine(line) {
  const t = String(line ?? "").trim();
  if (!t.includes("|")) return false;
  if (t.startsWith("|")) return true;
  const cells = splitPipeRow(t);
  if (!cells || cells.length < 2) return false;
  if (cells.length === 2 && cells.every((c) => c.length > 80)) return false;
  return true;
}

function isBlank(line) {
  return !String(line ?? "").trim();
}

function safeHref(url) {
  const u = String(url ?? "").trim();
  if (/^mos-(file|dir):/i.test(u)) return u;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  return u.startsWith(".") || u.includes("/") ? u : null;
}

function workspaceLinkHtml(label, url) {
  const u = String(url ?? "").trim();
  const fileMatch = u.match(/^mos-file:(.+)$/i);
  if (fileMatch) {
    const path = fileMatch[1].replace(/^\/+/, "");
    return `<a href="#" class="mos-workspace-link mos-workspace-file" data-mos-file="${escAttr(path)}" title="Open file">${inline(label)}</a>`;
  }
  const dirMatch = u.match(/^mos-dir:(.+)$/i);
  if (dirMatch) {
    const path = dirMatch[1].replace(/^\/+/, "").replace(/\/+$/, "");
    return `<a href="#" class="mos-workspace-link mos-workspace-dir" data-mos-dir="${escAttr(path)}" title="Open folder">${inline(label)}</a>`;
  }
  return null;
}

/** Inline spans — code, links, images, bold, italic. */
export function renderInlineMarkdown(text) {
  return inline(text);
}

function inline(text) {
  const s = String(text ?? "");
  let out = "";
  let i = 0;

  while (i < s.length) {
    if (s[i] === "`") {
      const end = s.indexOf("`", i + 1);
      if (end !== -1) {
        out += `<code>${esc(s.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }

    if (s.startsWith("![", i)) {
      const m = s.slice(i).match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
      if (m) {
        const href = safeHref(m[2]);
        if (href) {
          out += `<img src="${escAttr(href)}" alt="${escAttr(m[1])}" loading="lazy" decoding="async" />`;
        } else {
          out += esc(m[0]);
        }
        i += m[0].length;
        continue;
      }
    }

    if (s[i] === "[") {
      const m = s.slice(i).match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/);
      if (m) {
        const ws = workspaceLinkHtml(m[1], m[2]);
        if (ws) {
          out += ws;
          i += m[0].length;
          continue;
        }
        const href = safeHref(m[2]);
        if (href) {
          out += `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">${inline(m[1])}</a>`;
        } else {
          out += esc(m[1]);
        }
        i += m[0].length;
        continue;
      }
    }

    if (s.startsWith("**", i)) {
      const end = s.indexOf("**", i + 2);
      if (end !== -1) {
        out += `<strong>${inline(s.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (s.startsWith("__", i)) {
      const end = s.indexOf("__", i + 2);
      if (end !== -1) {
        out += `<strong>${inline(s.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (s[i] === "*" && s[i + 1] !== "*") {
      const end = s.indexOf("*", i + 1);
      if (end !== -1 && s[end + 1] !== "*") {
        out += `<em>${inline(s.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    if (s[i] === "_" && s[i + 1] !== "_") {
      const end = s.indexOf("_", i + 1);
      if (end !== -1 && s[end + 1] !== "_") {
        out += `<em>${inline(s.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }

    out += esc(s[i]);
    i += 1;
  }

  return out;
}

function paragraphHtml(lines) {
  const parts = lines.map((l) => inline(l.trimEnd()));
  return `<p>${parts.join("<br />")}</p>`;
}

function renderTable(rows) {
  if (!rows.length) return "";
  let headerIdx = rows.findIndex((r) => !isSeparatorRow(r));
  if (headerIdx < 0) headerIdx = 0;

  const headerCells = splitPipeRow(rows[headerIdx]);
  if (!headerCells?.length) return "";

  const colCount = headerCells.length;
  const thead = `<thead><tr>${headerCells
    .slice(0, colCount)
    .map((c) => `<th>${inline(c)}</th>`)
    .join("")}</tr></thead>`;

  const bodyRows = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === headerIdx || isSeparatorRow(rows[i])) continue;
    let cells = splitPipeRow(rows[i]) ?? [];
    cells[0] = (cells[0] ?? "").replace(/^---+\s*/, "");
    while (cells.length < colCount) cells.push("");
    if (cells.length > colCount) {
      const head = cells.slice(0, colCount - 1);
      const tail = cells.slice(colCount - 1).join(" · ");
      cells = [...head, tail];
    }
    if (cells.some((c) => c)) {
      bodyRows.push(
        `<tr>${cells.slice(0, colCount).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`
      );
    }
  }

  const tbody = bodyRows.length ? `<tbody>${bodyRows.join("")}</tbody>` : "";
  return `<div class="mos-table-wrap md-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function renderCode(lang, code, opts = {}) {
  const raw = code.replace(/\n$/, "");
  const langLower = String(lang ?? "").trim().toLowerCase();

  if (langLower === "math" || langLower === "latex" || langLower === "katex") {
    return `<div class="mos-code code-shell mos-math-shell" data-mos-math="1"><div class="mos-code-bar code-shell-head"><span class="mos-code-lang code-lang">math</span><span class="mos-code-actions"></span></div><pre class="mos-code-body code-block" hidden><code>${esc(raw)}</code></pre><div class="mos-math-body" data-mos-math-src="${escAttr(raw)}"></div></div>`;
  }

  if (langLower === "mindmap" || raw.trimStart().toLowerCase().startsWith("mindmap")) {
    return `<div class="mos-code code-shell mos-mindmap-shell" data-mos-mindmap="1"><div class="mos-code-bar code-shell-head"><span class="mos-code-lang code-lang">mindmap</span><span class="mos-code-actions"></span></div><pre class="mos-code-body code-block" hidden><code>${esc(raw)}</code></pre><div class="mos-mindmap-body" data-mos-mindmap-src="${escAttr(raw)}"></div></div>`;
  }

  if (langLower === "mos-ui" || langLower === "mosui") {
    return renderMosUi(raw, { streaming: Boolean(opts.streaming) });
  }

  const mermaid = langLower === "mermaid" || /^(flowchart|graph |sequencediagram|gantt|pie|timeline|classdiagram|statediagram|erdiagram|journey)/i.test(raw.trimStart());
  const label = mermaid ? mermaidLabel(raw) : esc((lang || "text").trim() || "text");
  const mermaidAttr = mermaid ? ' data-mos-mermaid="1"' : "";
  return `<div class="mos-code code-shell"${mermaidAttr}><div class="mos-code-bar code-shell-head"><span class="mos-code-lang code-lang">${label}</span><span class="mos-code-actions"></span></div><pre class="mos-code-body code-block"><code>${esc(raw)}</code></pre></div>`;
}

function mermaidLabel(code) {
  const head = String(code ?? "").trimStart().toLowerCase();
  if (head.startsWith("flowchart") || head.startsWith("graph ")) return "flowchart";
  if (head.startsWith("sequencediagram") || head.startsWith("sequence diagram")) return "sequence";
  if (head.startsWith("gantt")) return "gantt";
  if (head.startsWith("pie")) return "chart";
  if (head.startsWith("timeline")) return "timeline";
  if (head.startsWith("mindmap")) return "mindmap";
  return "diagram";
}

function parseMindmap(source) {
  const lines = String(source ?? "").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim().toLowerCase() !== "mindmap") i += 1;
  if (i >= lines.length) return null;
  i += 1;
  const root = { label: "Mindmap", children: [] };
  const stack = [{ indent: -1, node: root }];

  for (; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)?.[0]?.length ?? 0;
    const label = raw.trim().replace(/^\(+|\)+$/g, "").trim();
    if (!label) continue;
    const node = { label, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent, node });
  }
  return root.children[0] ?? root;
}

function renderMindmapList(node) {
  if (!node) return "";
  const kids = (node.children ?? [])
    .map((c) => `<li><span class="mos-mindmap-label">${inline(c.label)}</span>${renderMindmapList(c)}</li>`)
    .join("");
  return kids ? `<ul class="mos-mindmap-tree">${kids}</ul>` : "";
}

function renderList(items, ordered) {
  const tag = ordered ? "ol" : "ul";
  const lis = items
    .map(({ text, checked }) => {
      if (checked != null) {
        const box = `<input type="checkbox" disabled${checked ? " checked" : ""} />`;
        return `<li class="mos-task">${box}${inline(text)}</li>`;
      }
      return `<li>${inline(text)}</li>`;
    })
    .join("");
  return `<${tag}>${lis}</${tag}>`;
}

function parseBlocks(src, opts = {}) {
  const lines = String(src ?? "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```(\w[\w.-]*)?\s*$/);
    if (fence) {
      const lang = fence[1] ?? "";
      const body = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(renderCode(lang, body.join("\n"), opts));
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push("<hr />");
      i += 1;
      continue;
    }

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      const quoteLines = [];
      while (i < lines.length) {
        const m = lines[i].match(/^>\s?(.*)$/);
        if (!m) break;
        quoteLines.push(m[1]);
        i += 1;
      }
      blocks.push(`<blockquote>${paragraphHtml(quoteLines)}</blockquote>`);
      continue;
    }

    if (isTableLine(line)) {
      const tableRows = [];
      while (i < lines.length && (isTableLine(lines[i]) || isSeparatorRow(lines[i]))) {
        tableRows.push(lines[i]);
        i += 1;
      }
      blocks.push(renderTable(tableRows));
      continue;
    }

    const task = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (task) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
        if (!m) break;
        items.push({ text: m[3], checked: m[2].toLowerCase() === "x" });
        i += 1;
      }
      blocks.push(renderList(items, false));
      continue;
    }

    const ul = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ul) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)[-*+]\s+(.+)$/);
        if (!m || m[1].includes("\t")) break;
        if (/^\s*[-*+]\s+\[/.test(lines[i])) break;
        items.push({ text: m[2] });
        i += 1;
      }
      blocks.push(renderList(items, false));
      continue;
    }

    const ol = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (ol) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(\d+)\.\s+(.+)$/);
        if (!m) break;
        items.push({ text: m[3] });
        i += 1;
      }
      blocks.push(renderList(items, true));
      continue;
    }

    const paraLines = [];
    while (i < lines.length && !isBlank(lines[i])) {
      const l = lines[i];
      if (
        /^```/.test(l) ||
        /^(#{1,4})\s/.test(l) ||
        /^(\*{3,}|-{3,}|_{3,})\s*$/.test(l.trim()) ||
        /^>\s?/.test(l) ||
        isTableLine(l) ||
        /^(\s*)[-*+]\s+/.test(l) ||
        /^(\s*)\d+\.\s+/.test(l)
      ) {
        break;
      }
      paraLines.push(l);
      i += 1;
    }
    if (paraLines.length) blocks.push(paragraphHtml(paraLines));
  }

  return blocks.join("\n");
}

/** Inner HTML only (no mos-md wrapper) — desk WYSIWYG editor, exports, etc. */
export function renderMarkdownFragment(text, opts = {}) {
  const raw = normalizeMarkdown(text);
  if (!raw.trim()) return "";
  return parseBlocks(raw, opts);
}

/** Render AI markdown to a styled HTML fragment. */
export function renderMercuryMarkdown(text, opts = {}) {
  const inner = renderMarkdownFragment(text, opts);
  if (!inner) return `<div class="mos-md md-prose"></div>`;
  return `<div class="mos-md md-prose">${inner}</div>`;
}

/** @deprecated alias — same renderer everywhere */
export function renderMarkdown(text, opts = {}) {
  return renderMercuryMarkdown(text, opts);
}

/** Plain-text snippet for notifications / inbox previews. */
export function previewText(text, maxLen = 220) {
  let s = String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\|.+\|$/gm, " ")
    .replace(/^[-*+]\s+\[[ xX]\]\s+/gm, "• ")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "Response ready";
  if (s.length > maxLen) return `${s.slice(0, maxLen - 1).trim()}…`;
  return s;
}

/** Wire lazy images + external links after DOM mount (optional — renderer sets most attrs). */
export function enhanceMarkdown(root) {
  if (!root) return;
  root.querySelectorAll("a[href]").forEach((a) => {
    if (a.classList.contains("mos-workspace-link")) return;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  root.querySelectorAll("img").forEach((img) => {
    img.loading = "lazy";
    img.decoding = "async";
  });
}

let mermaidReady = null;
let katexReady = null;

async function ensureMermaid() {
  if (mermaidReady) return mermaidReady;
  mermaidReady = import("mermaid")
    .then((mod) => {
      const mermaid = mod.default ?? mod;
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      });
      return mermaid;
    })
    .catch(() => null);
  return mermaidReady;
}

async function ensureKatex() {
  if (katexReady) return katexReady;
  katexReady = Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
  ])
    .then(([mod]) => mod.default ?? mod)
    .catch(() => null);
  return katexReady;
}

async function renderMathBlock(shell) {
  const host = shell.querySelector(".mos-math-body");
  const src = host?.getAttribute("data-mos-math-src") ?? shell.querySelector("code")?.textContent ?? "";
  if (!host || !src.trim()) return;
  const katex = await ensureKatex();
  if (!katex) {
    host.innerHTML = `<pre class="mos-code-body code-block"><code>${esc(src)}</code></pre>`;
    return;
  }
  try {
    host.innerHTML = katex.renderToString(src.trim(), { throwOnError: false, displayMode: true });
  } catch {
    host.textContent = src;
  }
}

function renderMindmapBlock(shell) {
  const host = shell.querySelector(".mos-mindmap-body");
  const src = host?.getAttribute("data-mos-mindmap-src") ?? shell.querySelector("code")?.textContent ?? "";
  if (!host) return;
  const root = parseMindmap(src);
  host.innerHTML = root ? renderMindmapList(root) : `<pre class="mos-code-body code-block"><code>${esc(src)}</code></pre>`;
}

async function renderMermaidBlock(shell, pre, source) {
  const code = String(source ?? "").trim();
  if (!code) return;
  const host = document.createElement("div");
  host.className = "mos-mermaid";
  pre.replaceWith(host);
  const mermaid = await ensureMermaid();
  if (!mermaid) {
    host.innerHTML = `<pre class="mos-code-body code-block"><code>${esc(code)}</code></pre>`;
    return;
  }
  const id = `mos-mermaid-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const { svg } = await mermaid.render(id, code);
    host.innerHTML = svg;
  } catch {
    host.innerHTML = `<pre class="mos-code-body code-block"><code>${esc(code)}</code></pre>`;
  }
}

function wireCodeCopy(shell) {
  const head = shell.querySelector(".mos-code-bar, .code-shell-head");
  const pre = shell.querySelector("pre");
  const codeEl = pre?.querySelector("code") ?? pre;
  if (!head || !codeEl || head.querySelector(".mos-code-copy")) return;

  let actions = head.querySelector(".mos-code-actions");
  if (!actions) {
    actions = document.createElement("span");
    actions.className = "mos-code-actions";
    head.appendChild(actions);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mos-code-copy";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    const text = codeEl.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
      window.setTimeout(() => {
        btn.textContent = "Copy";
      }, 1600);
    } catch {
      /* clipboard blocked */
    }
  });
  actions.appendChild(btn);

  if (shell.dataset.mosMath === "1") {
    void renderMathBlock(shell);
    return;
  }
  if (shell.dataset.mosMindmap === "1") {
    renderMindmapBlock(shell);
    return;
  }

  const lang = head.querySelector(".mos-code-lang, .code-lang")?.textContent?.trim().toLowerCase() ?? "";
  if (shell.dataset.mosMermaid === "1" || lang === "mermaid" || lang === "flowchart" || lang === "diagram") {
    if (pre) void renderMermaidBlock(shell, pre, codeEl.textContent);
  }
}

export function enhanceCodeBlocks(root) {
  enhanceMarkdown(root);
  if (!root) return;

  root.querySelectorAll("pre").forEach((pre) => {
    if (
      pre.closest(
        ".mos-code, .code-shell, .flow-tool-output, .flow-shell-terminal, .flow-shell-scroll, .flow-shell-stdout, .flow-shell-stderr, .flow-shell-out, .flow-diff, .flow-tool-output-pre, .flow-tool-md"
      )
    ) {
      return;
    }
    const code = pre.querySelector("code");
    const lang = [...(code?.classList ?? [])]
      .find((c) => c.startsWith("language-"))
      ?.slice(9)
      ?.trim() || "text";
    const shell = document.createElement("div");
    shell.className = "mos-code code-shell";
    shell.innerHTML = `<div class="mos-code-bar code-shell-head"><span class="mos-code-lang code-lang">${esc(lang)}</span><span class="mos-code-actions"></span></div>`;
    pre.classList.add("mos-code-body", "code-block");
    pre.parentNode?.insertBefore(shell, pre);
    shell.appendChild(pre);
  });

  root.querySelectorAll(".mos-code, .code-shell").forEach((shell) => {
    if (shell.dataset.enhanced === "1") return;
    shell.dataset.enhanced = "1";
    wireCodeCopy(shell);
  });

  root.querySelectorAll("table").forEach((table) => {
    if (table.parentElement?.classList.contains("mos-table-wrap") || table.parentElement?.classList.contains("md-table-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "mos-table-wrap md-table-wrap";
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}
