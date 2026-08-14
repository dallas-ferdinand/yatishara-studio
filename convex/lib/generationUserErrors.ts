/** Map raw gateway / billing errors to user-facing copy (stored on failed jobs). */

import { CREDIT_PRICE_TTD } from "./generationPricing";

export type GenerationUserError = {
  title: string;
  message: string;
  hint?: string;
};

export type GenerationErrorMode = "image" | "video" | "script" | "audio";

function formatTtdFromCredits(credits: number): string {
  const amount = credits * CREDIT_PRICE_TTD;
  const formatted = Number.isInteger(amount)
    ? amount.toLocaleString()
    : amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  return `$${formatted} TTD`;
}

/**
 * Only Studio-authored balance messages — never provider API "credits" quotas
 * (e.g. ElevenLabs "You have 0 credits left").
 */
function isStudioBalanceError(text: string): boolean {
  const lower = text.toLowerCase();
  if (/top up to continue|not enough balance/i.test(lower)) return true;
  if (/you need\s+\$[\d,]+\.?\d*\s*ttd/i.test(lower)) return true;
  if (/generation needs \d+(\.\d+)? credits/i.test(lower)) return true;
  if (/\btt\$\s*[\d,]+\.?\d*/i.test(lower) && /need|top up|insufficient/i.test(lower)) {
    return true;
  }
  return false;
}

function nounForMode(mode: GenerationErrorMode): string {
  if (mode === "video") return "video";
  if (mode === "image") return "image";
  if (mode === "audio") return "audio";
  return "request";
}

export function friendlyGenerationError(
  raw: string | null | undefined,
  mode: GenerationErrorMode = "video",
): GenerationUserError {
  const text = (raw ?? "").trim();
  const lower = text.toLowerCase();
  const noun = nounForMode(mode);

  if (!text) {
    return {
      title: "Something went wrong",
      message:
        "That didn't work. We're looking into it — your balance was refunded if this was a paid render.",
    };
  }

  if (isStudioBalanceError(text)) {
    const ttdMatch =
      text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*TTD\b/i) ??
      text.match(/TT\$\s*([\d,]+(?:\.\d+)?)/i);
    const creditMatch = text.match(/generation needs\s+(\d+(?:\.\d+)?)\s*credits?/i);
    const amountLabel = ttdMatch
      ? `$${ttdMatch[1].replace(/,/g, "")} TTD`
      : creditMatch
        ? formatTtdFromCredits(Number(creditMatch[1]))
        : null;
    return {
      title: "Not enough balance",
      message: amountLabel
        ? `You need ${amountLabel} for this ${noun}.`
        : "You're out of balance for this generation.",
      hint: "Top up to continue.",
    };
  }

  if (
    /audio generation is temporarily unavailable|sound generation is temporarily unavailable/i.test(
      lower,
    )
  ) {
    return {
      title: "Audio unavailable",
      message: "Audio generation is temporarily unavailable. Try again in a few minutes.",
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

  if (
    /at least 300px|width to be at least|received a \d+x\d+px image|downloading image/i.test(
      lower,
    )
  ) {
    const size = text.match(/(\d+)\s*[x×]\s*(\d+)\s*px/i);
    return {
      title: "Image is too small",
      message: size
        ? `Seedance needs images at least 300×300. That file was ${size[1]}×${size[2]}. Attach the original, not a thumbnail.`
        : "Seedance needs images at least 300×300. Attach the original file, not a thumbnail.",
    };
  }

  if (/duration must be|between 4 and 15/i.test(lower)) {
    return {
      title: "Check your settings",
      message: "Video length must be between 4 and 15 seconds. Adjust duration, then retry.",
    };
  }

  if (
    /invalid resolution|unsupported resolution|resolution(?:\s+\w+){0,6}\s+is not valid|parameter resolution|not valid for model.*seedance|not valid for model.*dreamina/i.test(
      lower,
    )
  ) {
    return {
      title: "Check your settings",
      message:
        "That resolution isn't supported for this video model. Try 720p or 1080p, then retry.",
    };
  }

  if (/rate limit|429|quota|too many/i.test(lower)) {
    return {
      title: "Too many requests",
      message: "Please wait a moment before generating again.",
    };
  }

  if (/timeout|timed out/i.test(lower)) {
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

  if (/network|fetch failed|failed to fetch/i.test(lower)) {
    return {
      title: "Connection problem",
      message: "We couldn't reach the generation service. Check your connection and try again.",
    };
  }

  if (text.length > 200 || /\[object|undefined|stack trace/i.test(lower)) {
    return {
      title: "Something went wrong",
      message:
        "That didn't work. We're looking into it — your balance was refunded if this was a paid render.",
    };
  }

  return {
    title: "Something went wrong",
    message: text,
  };
}

export function friendlyGenerationErrorText(
  raw: string | null | undefined,
  mode: GenerationErrorMode = "video",
): string {
  const friendly = friendlyGenerationError(raw, mode);
  return friendly.hint ? `${friendly.message} ${friendly.hint}` : friendly.message;
}
