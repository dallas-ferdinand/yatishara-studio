/** Markdown ↔ document HTML for WYSIWYG desk editor (no marked — avoids Turbopack TDZ crash). */
import { renderMarkdownFragment } from "@/mos-shared/mos-markdown.js";

export function markdownToDocHtml(markdown) {
  const raw = String(markdown ?? "").trim();
  if (!raw) return "<p><br></p>";
  return renderMarkdownFragment(raw) || "<p><br></p>";
}

function inlineNodesToMarkdown(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const inner = () => Array.from(node.childNodes).map(inlineNodesToMarkdown).join("");

  switch (tag) {
    case "strong":
    case "b":
      return `**${inner()}**`;
    case "em":
    case "i":
      return `*${inner()}*`;
    case "code":
      return `\`${inner()}\``;
    case "a": {
      const href = node.getAttribute("href") ?? "";
      return `[${inner()}](${href})`;
    }
    case "br":
      return "\n";
    case "span":
    case "u":
      return inner();
    default:
      return inner();
  }
}

function blockElementToMarkdown(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = el.tagName.toLowerCase();

  if (tag === "h1") return `# ${inlineNodesToMarkdown(el).trim()}\n\n`;
  if (tag === "h2") return `## ${inlineNodesToMarkdown(el).trim()}\n\n`;
  if (tag === "h3") return `### ${inlineNodesToMarkdown(el).trim()}\n\n`;
  if (tag === "blockquote") {
    const text = inlineNodesToMarkdown(el).trim().replace(/\n/g, "\n> ");
    return `> ${text}\n\n`;
  }
  if (tag === "pre") {
    const code = el.querySelector("code");
    const text = (code?.textContent ?? el.textContent ?? "").replace(/\n$/, "");
    return `\`\`\`\n${text}\n\`\`\`\n\n`;
  }
  if (tag === "ul") {
    const lines = Array.from(el.children)
      .filter((c) => c.tagName?.toLowerCase() === "li")
      .map((li) => `- ${inlineNodesToMarkdown(li).trim()}`);
    return `${lines.join("\n")}\n\n`;
  }
  if (tag === "ol") {
    const lines = Array.from(el.children)
      .filter((c) => c.tagName?.toLowerCase() === "li")
      .map((li, i) => `${i + 1}. ${inlineNodesToMarkdown(li).trim()}`);
    return `${lines.join("\n")}\n\n`;
  }
  if (tag === "p" || tag === "div") {
    const text = inlineNodesToMarkdown(el).trim();
    if (!text) return "";
    return `${text}\n\n`;
  }
  if (tag === "hr") return "---\n\n";

  return Array.from(el.children).map(blockElementToMarkdown).join("");
}

/** Serialize contenteditable document HTML back to markdown. */
export function docHtmlToMarkdown(root) {
  if (!root) return "";
  const blocks = [];
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent?.trim();
      if (t) blocks.push(`${t}\n\n`);
      continue;
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      blocks.push(blockElementToMarkdown(child));
    }
  }
  return blocks.join("").replace(/\n{3,}/g, "\n\n").trimEnd();
}
