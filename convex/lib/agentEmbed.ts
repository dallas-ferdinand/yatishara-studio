/**
 * Lightweight local-hash embeddings for Studio Agent memories (hybrid recall).
 * Pure JS — safe in Convex queries/mutations (no Node crypto / MiniLM).
 */

export const AGENT_EMBED_DIM = 128;

function hashInt(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1)
    .slice(0, 800);
}

function addFeature(vector: number[], key: string, weight: number) {
  const h = hashInt(key);
  const index = h % vector.length;
  vector[index] += h % 2 === 0 ? weight : -weight;
}

export function embedAgentText(text: string): number[] {
  const vector = new Array(AGENT_EMBED_DIM).fill(0);
  const tokens = tokenize(text);
  tokens.forEach((token, i) => {
    addFeature(vector, `tok:${token}`, 1);
    if (i > 0) addFeature(vector, `bi:${tokens[i - 1]} ${token}`, 0.65);
  });
  const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0)) || 1;
  return vector.map((n) => Math.round((n / norm) * 1_000_000) / 1_000_000);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export function embeddingToJson(vec: number[]): string {
  return JSON.stringify(vec);
}

export function embeddingFromJson(raw?: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== AGENT_EMBED_DIM) return null;
    return parsed.map((n) => Number(n) || 0);
  } catch {
    return null;
  }
}
