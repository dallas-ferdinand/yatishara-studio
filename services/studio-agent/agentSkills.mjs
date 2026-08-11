/**
 * Studio Agent skills — markdown packs in ./skills/*.md (Studio branding only).
 * Agent loads via Pi tool `skills` { id } when needed (progressive disclosure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "skills");

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   when: string,
 *   tools: string[],
 *   category: string,
 *   body: string,
 *   steps?: string[],
 * }} SkillPack
 */

/** @type {SkillPack[]|null} */
let cache = null;

function parseFrontmatter(raw) {
  const text = String(raw || "");
  if (!text.startsWith("---")) {
    return { meta: {}, body: text.trim() };
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: text.trim() };
  const fm = text.slice(3, end).trim();
  const body = text.slice(end + 4).trim();
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body };
}

function loadSkillsFromDisk() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const files = fs
    .readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  /** @type {SkillPack[]} */
  const packs = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(SKILLS_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const id = (meta.id || file.replace(/\.md$/, "")).trim();
    if (!id) continue;
    const tools = meta.tools
      ? meta.tools.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
      : [];
    packs.push({
      id,
      title: meta.title || id,
      when: meta.when || "",
      tools,
      category: meta.category || "ops",
      body,
      steps: body
        .split("\n")
        .map((l) => l.replace(/^\d+\.\s*/, "").trim())
        .filter((l) => l.startsWith("`") || /^[A-Z]/.test(l))
        .slice(0, 8),
    });
  }
  return packs;
}

export function allSkills() {
  if (!cache) cache = loadSkillsFromDisk();
  return cache;
}

/** Test helper / hot reload after edits in long-lived worker */
export function reloadSkills() {
  cache = null;
  return allSkills();
}

export function listSkills(category) {
  let packs = allSkills();
  if (category) {
    packs = packs.filter((s) => s.category === category);
  }
  return packs.map((s) => ({
    id: s.id,
    title: s.title,
    when: s.when,
    category: s.category,
    tools: s.tools,
  }));
}

export function getSkill(id) {
  const needle = String(id || "").trim().toLowerCase();
  const pack = allSkills().find((s) => s.id === needle);
  if (!pack) return null;
  return {
    id: pack.id,
    title: pack.title,
    when: pack.when,
    category: pack.category,
    tools: pack.tools,
    body: pack.body,
  };
}

export function matchSkills(query) {
  const q = String(query || "").toLowerCase();
  if (!q) return listSkills();
  return allSkills()
    .filter(
      (s) =>
        s.id.includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.when.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q) ||
        s.tools.some((t) => t.includes(q)),
    )
    .map((s) => ({
      id: s.id,
      title: s.title,
      when: s.when,
      category: s.category,
      tools: s.tools,
    }));
}

export function skillPromptBlock() {
  const promptIds = allSkills()
    .filter((s) => s.category === "prompt" || s.id === "project-plan")
    .map((s) => s.id)
    .join(", ");
  const opsIds = allSkills()
    .filter((s) => s.category === "ops")
    .map((s) => s.id)
    .join(", ");
  return `Skills: call skills (list) or skills {id} (full body) before craft/multi-step. Prompt: ${promptIds || "prompt-*"}. Ops: ${opsIds || "post-feed…"}. Studio voice only — model slugs like seedance-2.5 are OK.`;
}

/** @deprecated kept for older imports */
export const SKILL_PACKS = new Proxy([], {
  get(_t, prop) {
    if (prop === "length") return allSkills().length;
    if (prop === Symbol.iterator) {
      return function* () {
        yield* allSkills();
      };
    }
    if (typeof prop === "string" && /^\d+$/.test(prop)) {
      return allSkills()[Number(prop)];
    }
    return undefined;
  },
});
