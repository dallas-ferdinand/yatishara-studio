"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";

function MagicLoginInner() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"signing-in" | "done" | "error">(
    "signing-in",
  );

  useEffect(() => {
    const token = String(searchParams.get("token") || "").trim();
    if (!token) {
      setStatus("error");
      setError("This login link is missing a token.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await signIn("magic-link", { token });
        if (cancelled) return;
        setStatus("done");
        router.replace("/");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setError(
          "This link is invalid, already used, or expired (links last 5 minutes).",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams, signIn]);

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
            <p>Signing you into Yatishara Studio…</p>
          </main>
        }
      >
        <MagicLoginInner />
      </Suspense>
    </ConvexClientProvider>
  );
}
