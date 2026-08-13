"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";

/**
 * Click-to-open magic login — do not auto-consume on mount.
 * WhatsApp link previews / in-app scrapers were burning single-use tokens.
 */
function MagicLoginInner() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();
  const [error, setError] = useState<string | null>(
    token ? null : "This login link is missing a token.",
  );
  const [status, setStatus] = useState<"ready" | "signing-in" | "done" | "error">(
    token ? "ready" : "error",
  );

  async function openStudio() {
    if (!token || status === "signing-in") return;
    setStatus("signing-in");
    setError(null);
    try {
      await signIn("magic-link", { token });
      setStatus("done");
      router.replace("/");
    } catch {
      setStatus("error");
      setError(
        "This link is invalid, already used, or expired (links last 15 minutes).",
      );
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "var(--font-onest), system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 28 * 16 }}>
        {status === "signing-in" || status === "done" ? (
          <p>Signing you into Yatishara Studio…</p>
        ) : status === "ready" ? (
          <>
            <p style={{ marginBottom: "1rem" }}>
              Tap below to open Yatishara Studio. This link works once and
              expires in 15 minutes.
            </p>
            <button
              type="button"
              onClick={() => void openStudio()}
              style={{
                display: "inline-block",
                padding: "0.75rem 1.25rem",
                borderRadius: 999,
                border: "none",
                background: "#1e2828",
                color: "#f5f2ed",
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              Open Studio
            </button>
          </>
        ) : (
          <>
            <p>{error || "Could not sign in."}</p>
            <p style={{ opacity: 0.7, marginTop: "0.75rem" }}>
              Ask Sophie on WhatsApp for a fresh one-time link.
            </p>
            <a href="/" style={{ display: "inline-block", marginTop: "1.25rem" }}>
              Go to Studio
            </a>
          </>
        )}
      </div>
    </main>
  );
}

export default function MagicLoginPage() {
  return (
    <ConvexClientProvider>
      <Suspense
        fallback={
          <main
            style={{
              minHeight: "100dvh",
              display: "grid",
              placeItems: "center",
              padding: "2rem",
            }}
          >
            <p>Preparing your Studio login…</p>
          </main>
        }
      >
        <MagicLoginInner />
      </Suspense>
    </ConvexClientProvider>
  );
}
