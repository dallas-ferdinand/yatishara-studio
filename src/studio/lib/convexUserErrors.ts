/** Turn Convex client / server error strings into short user-facing copy. */

const FRIENDLY_BY_PATTERN: Array<{ match: RegExp; message: string }> = [
  {
    match: /email already belongs to another account/i,
    message: "That email is already used by another Studio account. Try a different email.",
  },
  {
    match: /phone already belongs to another account/i,
    message: "That phone number is already used by another Studio account. Try a different number.",
  },
  {
    match: /login is already linked to another account/i,
    message: "That login is already linked to another Studio account.",
  },
  {
    match: /valid email is required|enter a valid email/i,
    message: "Enter a valid email address.",
  },
  {
    match: /valid phone|whatsapp number is required/i,
    message: "Enter a valid WhatsApp / phone number.",
  },
  {
    match: /first name is required/i,
    message: "Enter your first name.",
  },
  {
    match: /last name is required/i,
    message: "Enter your last name.",
  },
  {
    match: /email is required and cannot be removed/i,
    message: "Email is required. You can change it, but you can't remove it.",
  },
  {
    match: /phone is required and cannot be removed/i,
    message: "Phone is required. You can change it, but you can't remove it.",
  },
  {
    match: /add and verify your phone|verify your phone/i,
    message: "Add and verify your WhatsApp number in Account details before topping up.",
  },
  {
    match: /add an email address/i,
    message: "Add an email in Account details before topping up.",
  },
  {
    match: /first and last name/i,
    message: "Add your first and last name in Account details before topping up.",
  },
  {
    match: /sign in to top up|not authenticated|sign in to/i,
    message: "Sign in again, then try once more.",
  },
  {
    match: /wrong email or password|wrong number or password|current password is wrong/i,
    message: "That password didn't match. Try again.",
  },
  {
    match: /password must be at least 8/i,
    message: "Password must be at least 8 characters.",
  },
  {
    match: /add an email or phone.*password/i,
    message: "Save your email and phone first, then add a password.",
  },
  {
    match: /enter your current password/i,
    message: "Enter your current password to change it.",
  },
  {
    match: /admin access required/i,
    message: "You need admin access for that action.",
  },
  {
    match: /user not found/i,
    message: "We couldn't find that account. Sign out and sign in again.",
  },
  {
    match: /checkout request already used|different top-up/i,
    message: "Start a new top-up attempt — that checkout request was already used.",
  },
  {
    match: /this checkout attempt failed/i,
    message: "That checkout attempt failed. Start a new top-up.",
  },
  {
    match: /paywise is not|paywise.*not configured|missing api credentials/i,
    message:
      "Payments aren't fully configured yet. Ask an admin to finish PayWise setup, then try again.",
  },
  {
    match: /unexpected field|no response payload|invalid.*payload|api_key is required|payer_covers|pays_fees/i,
    message: "PayWise rejected the checkout request. Try again in a moment.",
  },
  {
    match: /checkout response missing|hosted link/i,
    message: "PayWise didn't return a card checkout link. Try again.",
  },
  {
    match: /network|failed to fetch|timed out|timeout/i,
    message: "Connection problem. Check your network and try again.",
  },
  {
    match: /rate limit|too many requests|429/i,
    message: "Too many requests just now. Wait a moment and try again.",
  },
  {
    match: /^unauthorized$/i,
    message: "You don't have access to do that.",
  },
  {
    match: /folder not found/i,
    message: "That folder wasn't found. Refresh and try again.",
  },
  {
    match: /element not found/i,
    message: "That element wasn't found. Refresh and try again.",
  },
  {
    match: /document not found/i,
    message: "That document wasn't found. Refresh and try again.",
  },
  {
    match: /style sheet not found/i,
    message: "That Style Sheet wasn't found. Pick another one or rebuild it.",
  },
  {
    match: /build the style sheet|add style rules or build/i,
    message: "Build the Style Sheet before using it for generation.",
  },
  {
    match: /insufficient|not enough credit|needs \d+ credit/i,
    message: "Not enough balance for that. Top up and try again.",
  },
  {
    match: /api key name is required/i,
    message: "Enter a name for the API key.",
  },
  {
    match: /cannot update a revoked api key/i,
    message: "That API key was revoked and can't be updated.",
  },
  {
    match: /notification not found/i,
    message: "That notification isn't available anymore.",
  },
  {
    match: /no speech detected/i,
    message: "No speech detected. Speak a bit longer, then tap the mic to stop.",
  },
  {
    match: /recording too short|recording too brief|no audio captured|no audio detected/i,
    message: "No audio detected. Tap mic, speak, then tap again to stop.",
  },
  {
    match: /mic blocked|microphone|not allowed|permission denied/i,
    message: "Microphone blocked. Allow mic access for this site, then try again.",
  },
  {
    match: /deepgram|voice is not configured|transcription/i,
    message: "Couldn't turn that into text. Try again.",
  },
  {
    match: /sign in to use voice/i,
    message: "Sign in to use voice input.",
  },
  {
    match: /recording too long/i,
    message: "That clip was too long. Try a shorter recording.",
  },
];

/**
 * Pull the real server message out of a Convex client error wrapper.
 * Convex often prefixes with `[CONVEX M(...)] [Request ID: ...] Server Error` and stack lines.
 */
export function extractConvexErrorMessage(error: unknown): string {
  if (error == null) return "";
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error &&
            "message" in error &&
            typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : String(error);

  const cleaned = raw
    .replace(/\[CONVEX[^\]]*\]\s*/gi, "")
    .replace(/\[Request ID:[^\]]*\]\s*/gi, "")
    .replace(/^Server Error\s*/im, "")
    .trim();

  const uncaught = cleaned.match(
    /Uncaught (?:Error|ConvexError):\s*(.+?)(?:\n|$)/i,
  );
  if (uncaught?.[1]) {
    return uncaught[1].trim();
  }

  for (const line of cleaned.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^at\s/.test(trimmed)) continue;
    if (/handler\s*\(/i.test(trimmed)) continue;
    if (/^Called by/i.test(trimmed)) continue;
    if (/^error$/i.test(trimmed)) continue;
    return trimmed.replace(/^Error:\s*/i, "").trim();
  }

  return cleaned;
}

/** Short, friendly message suitable for notices / form errors. */
export function friendlyConvexError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const extracted = extractConvexErrorMessage(error);
  if (!extracted) return fallback;

  for (const rule of FRIENDLY_BY_PATTERN) {
    if (rule.match.test(extracted)) {
      return rule.message;
    }
  }

  // Already short and human — keep it.
  if (
    extracted.length <= 160 &&
    !/\[CONVEX|Request ID|Uncaught|stack|at handler/i.test(extracted)
  ) {
    return extracted;
  }

  return fallback;
}
