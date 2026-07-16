const DEFAULT_TRANSCRIPTION_MODEL = "openai/whisper-1";
const GATEWAY_TRANSCRIBE_URL = "https://ai-gateway.vercel.sh/v4/ai/transcription-model";

export function transcriptionModelId(): string {
  return process.env.GATEWAY_TRANSCRIPTION_MODEL_ID?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

function normalizeAudioMediaType(mimetype: string | undefined): string {
  const raw = (mimetype || "audio/webm").split(";")[0].trim().toLowerCase();
  if (raw === "audio/mp4" || raw === "audio/aac" || raw === "audio/m4a") return "audio/mp4";
  if (raw === "audio/mpeg" || raw === "audio/mp3") return "audio/mpeg";
  if (raw === "audio/wav" || raw === "audio/x-wav" || raw === "audio/wave") return "audio/wav";
  if (raw === "audio/ogg" || raw === "audio/opus") return "audio/ogg";
  if (raw.startsWith("audio/")) return raw;
  return "audio/webm";
}

export async function transcribeAudio(input: {
  audioBase64: string;
  mimetype: string;
}): Promise<{ text: string; language?: string; durationInSeconds?: number }> {
  const audioBytes = Buffer.from(input.audioBase64, "base64");
  if (audioBytes.byteLength < 500) {
    throw new Error("Recording too short — tap mic, speak, tap again to stop");
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Voice is not configured (missing AI_GATEWAY_API_KEY)");
  }

  const mediaType = normalizeAudioMediaType(input.mimetype);
  const response = await fetch(GATEWAY_TRANSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "ai-model-id": transcriptionModelId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio: input.audioBase64,
      mediaType,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string;
    language?: string;
    durationInSeconds?: number;
    error?: { message?: string } | string;
    message?: string;
  };

  if (!response.ok) {
    const detail =
      (typeof payload.error === "string" ? payload.error : payload.error?.message) ||
      payload.message ||
      `HTTP ${response.status}`;
    throw new Error(detail);
  }

  const text = String(payload.text ?? "").trim();
  if (!text) {
    throw new Error("No speech detected — speak clearly, then tap mic to stop");
  }

  return {
    text,
    language: payload.language,
    durationInSeconds: payload.durationInSeconds,
  };
}
