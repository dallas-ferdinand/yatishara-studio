/** Map raw gateway / billing errors to user-facing copy (stored on failed jobs). */

export type GenerationUserError = {
  title: string;
  message: string;
  hint?: string;
};

export function friendlyGenerationError(
  raw: string | null | undefined,
  mode: "image" | "video" | "script" = "video",
): GenerationUserError {
  const text = (raw ?? "").trim();
  const lower = text.toLowerCase();

  if (!text) {
    return {
      title: "Something went wrong",
      message:
        "That didn't work. We're looking into it — your credits were refunded if this was a paid render.",
    };
  }

  if (/credit|insufficient|top up|needs \d+ credit/i.test(lower)) {
    const match = text.match(/(\d+)\s*credit/i);
    const cost = match?.[1];
    return {
      title: "Not enough credits",
      message: cost
        ? `You need ${cost} credits for this ${mode === "video" ? "video" : mode === "image" ? "image" : "request"}.`
        : "You're out of credits for this generation.",
      hint: "Top up credits to continue.",
    };
  }

  if (
    /real.?person|realistic.?human|human face|biometric|photoreal|looks too human|sensitive content|content.?policy|moderation|safety filter|person.*filter|face.*filter|identifiable person/i.test(
      lower,
    )
  ) {
    return {
      title: "Couldn't render this shot",
      message:
        "The video model flagged this as looking too human or photorealistic. Try a wider cartoon framing, an illustrated start frame, or fewer face-forward close-ups.",
      hint: "Medium-wide shots and stylized characters work best.",
    };
  }

  if (
    /4k video is not available|is not configured|gateway.*unavailable|service unavailable|temporarily unavailable|video generation.*unavailable|style options are not ready|style preset not available/i.test(
      lower,
    )
  ) {
    return {
      title: "Generation isn't available right now",
      message:
        "Something's not right on our side and we're working on fixing it. Please try again in a few minutes.",
    };
  }

  if (/duration must be|between 4 and 15|invalid resolution|unsupported resolution/i.test(lower)) {
    return {
      title: "Check your settings",
      message: text,
    };
  }

  if (/rate limit|429|quota|too many concurrent|too many requests/i.test(lower)) {
    return {
      title: "Too many requests",
      message: "Please wait a moment before generating again.",
    };
  }

  if (/timeout|timed out|poll.*timeout/i.test(lower)) {
    return {
      title: "That took too long",
      message: "The model didn't finish in time. Try a shorter clip or try again.",
    };
  }

  if (/reject|blocked|denied|filter|policy|safety|not allowed/i.test(lower)) {
    return {
      title: "The model declined this request",
      message:
        "It rejected this prompt or reference. Try simplifying the scene, widening the shot, or removing a reference.",
    };
  }

  if (/network|fetch failed|failed to fetch|econnreset/i.test(lower)) {
    return {
      title: "Connection problem",
      message: "We couldn't reach the generation service. Check your connection and try again.",
    };
  }

  if (text.length > 200 || /\[object|undefined|stack trace/i.test(lower)) {
    return {
      title: "Something went wrong",
      message:
        "That didn't work. We're looking into it — your credits were refunded if this was a paid render.",
    };
  }

  return {
    title: "Something went wrong",
    message: text,
  };
}

export function friendlyGenerationErrorText(
  raw: string | null | undefined,
  mode: "image" | "video" | "script" = "video",
): string {
  const friendly = friendlyGenerationError(raw, mode);
  return friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message;
}
