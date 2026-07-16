/**
 * Browser speech-to-text via the Web Speech API (no server round-trip).
 *
 * Emits one growing session transcript via onUpdate — callers should REPLACE
 * the voice segment, not append chunks (mobile browsers often resend the full
 * phrase as successive "final" results).
 */

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function browserSttSupported() {
  return Boolean(getSpeechRecognitionConstructor());
}

function normalizeTranscript(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function joinTranscript(...parts) {
  return normalizeTranscript(parts.filter(Boolean).join(" "));
}

export function createBrowserStt(options = {}) {
  const SpeechRecognition = getSpeechRecognitionConstructor();
  if (!SpeechRecognition) {
    throw new Error("Voice typing is not supported in this browser");
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("Voice typing needs HTTPS");
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang =
    options.lang ||
    (typeof navigator !== "undefined" ? navigator.language : "en-US") ||
    "en-US";
  recognition.maxAlternatives = 1;

  let active = false;
  let stopping = false;
  /** Final text kept across mobile auto-restarts. */
  let committedFinal = "";
  /** Finals from the current recognition instance. */
  let instanceFinal = "";

  const publish = (interim = "") => {
    const full = joinTranscript(committedFinal, instanceFinal, interim);
    options.onUpdate?.(full);
  };

  recognition.onresult = (event) => {
    let finals = "";
    let interim = "";
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      const piece = String(result?.[0]?.transcript ?? "");
      if (!piece) continue;
      if (result.isFinal) finals += `${piece} `;
      else interim += `${piece} `;
    }
    instanceFinal = normalizeTranscript(finals);
    publish(interim);
  };

  recognition.onerror = (event) => {
    const code = event?.error || "failed";
    // Benign: user/mic abort while stopping, or no-speech after a pause.
    if (code === "aborted" || code === "no-speech") return;
    if (code === "not-allowed") {
      options.onError?.(new Error("Mic blocked — allow microphone access for this site"));
      return;
    }
    options.onError?.(new Error(`Voice typing failed (${code})`));
  };

  recognition.onend = () => {
    const wasActive = active;
    active = false;
    committedFinal = joinTranscript(committedFinal, instanceFinal);
    instanceFinal = "";
    publish();

    if (stopping) {
      stopping = false;
      options.onEnd?.();
      return;
    }

    // Some mobile browsers end the session after a pause; restart while listening.
    if (wasActive) {
      try {
        recognition.start();
        active = true;
      } catch {
        options.onEnd?.();
      }
    }
  };

  return {
    isActive() {
      return active;
    },
    start() {
      if (active) return;
      stopping = false;
      active = true;
      committedFinal = "";
      instanceFinal = "";
      recognition.start();
    },
    stop() {
      if (!active && !stopping) return;
      stopping = true;
      active = false;
      try {
        recognition.stop();
      } catch {
        options.onEnd?.();
      }
    },
    abort() {
      stopping = true;
      active = false;
      committedFinal = "";
      instanceFinal = "";
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
