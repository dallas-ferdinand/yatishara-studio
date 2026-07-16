/** Deepgram pre-recorded STT (same path MercuryOS gateway uses). */

const DEFAULT_MODEL = "nova-3";

export function deepgramModelId(): string {
  return process.env.DEEPGRAM_MODEL?.trim() || DEFAULT_MODEL;
}

function normalizeMime(mimetype: string | undefined): string {
  const m = String(mimetype || "").toLowerCase();
  if (m.includes("m4a")) return "audio/mp4";
  if (m.includes("mp4") || m.includes("aac")) return "audio/mp4";
  if (m.includes("webm")) return "audio/webm";
  if (m.includes("ogg")) return "audio/ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio/mpeg";
  if (m.includes("wav")) return "audio/wav";
  return "audio/webm";
}

function buildListenUrl(contentType: string): URL {
  const url = new URL("https://api.deepgram.com/v1/listen");
  // nova-3 + smart_format: punctuation, capitalization, and readable entities
  // (dates, money, phone numbers, etc). filler_words off → strips uh/um.
  url.searchParams.set("model", deepgramModelId());
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("filler_words", "false");
  url.searchParams.set("language", process.env.DEEPGRAM_LANGUAGE?.trim() || "en");
  if (!/audio\/(webm|ogg|mp4|m4a|mpeg|mp3|wav|flac)/.test(contentType)) {
    url.searchParams.set("detect_encoding", "true");
  }
  return url;
}

export async function transcribeWithDeepgram(input: {
  audioBase64: string;
  mimetype: string;
}): Promise<{ text: string; confidence?: number }> {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) {
    throw new Error("Deepgram is not configured");
  }

  const audio = Buffer.from(input.audioBase64, "base64");
  if (audio.byteLength < 500) {
    throw new Error("No audio detected. Tap mic, speak, then tap again to stop.");
  }

  const contentType = normalizeMime(input.mimetype);
  const response = await fetch(buildListenUrl(contentType), {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": contentType,
    },
    body: audio,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    let detail = bodyText.slice(0, 200);
    try {
      const data = JSON.parse(bodyText) as { err_msg?: string; message?: string; error?: string };
      detail = data.err_msg || data.message || data.error || detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`Deepgram ${response.status}: ${detail}`);
  }

  const data = JSON.parse(bodyText) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string; confidence?: number; paragraphs?: { transcript?: string } }>;
      }>;
    };
  };
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  // Prefer paragraph-formatted transcript when smart_format returns it.
  const text = String(alt?.paragraphs?.transcript ?? alt?.transcript ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    throw new Error("No speech detected. Speak a bit longer, then tap the mic to stop.");
  }

  return { text, confidence: alt?.confidence };
}
