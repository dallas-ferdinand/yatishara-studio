/**
 * Browser speech-to-text via the Web Speech API (no server round-trip).
 */

export function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function browserSttSupported() {
  return Boolean(getSpeechRecognitionConstructor());
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
  recognition.lang = options.lang || (typeof navigator !== "undefined" ? navigator.language : "en-US") || "en-US";
  recognition.maxAlternatives = 1;

  let active = false;
  let stopping = false;

  recognition.onresult = (event) => {
    let finalChunk = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result?.isFinal) continue;
      const piece = String(result[0]?.transcript ?? "").trim();
      if (piece) finalChunk = finalChunk ? `${finalChunk} ${piece}` : piece;
    }
    if (finalChunk) options.onFinal?.(finalChunk);
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
    if (stopping) {
      stopping = false;
      options.onEnd?.();
      return;
    }
    // Some mobile browsers end the session after a pause; restart while user still wants listening.
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
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    },
  };
}
