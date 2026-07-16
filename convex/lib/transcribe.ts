import { experimental_transcribe as transcribe } from "ai";
import { gateway } from "@ai-sdk/gateway";

const DEFAULT_TRANSCRIPTION_MODEL = "openai/whisper-1";

export function transcriptionModelId(): string {
  return process.env.GATEWAY_TRANSCRIPTION_MODEL_ID?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

export async function transcribeAudio(input: {
  audioBase64: string;
  mimetype: string;
}): Promise<{ text: string; language?: string; durationInSeconds?: number }> {
  const audio = Buffer.from(input.audioBase64, "base64");
  if (audio.byteLength < 500) {
    throw new Error("Recording too short — tap mic, speak, tap again to stop");
  }

  // Use the AI SDK gateway provider so protocol / auth headers stay in sync.
  void input.mimetype;
  const result = await transcribe({
    model: gateway.transcriptionModel(transcriptionModelId()),
    audio,
  });

  const text = String(result.text ?? "").trim();
  if (!text) {
    throw new Error("No speech detected — speak clearly, then tap mic to stop");
  }

  return {
    text,
    language: result.language ?? undefined,
    durationInSeconds: result.durationInSeconds ?? undefined,
  };
}
