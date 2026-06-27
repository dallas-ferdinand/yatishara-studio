"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { StudioShell } from "./StudioShell";

export function StudioAuthGate() {
  const auth = useConvexAuth();
  if (!auth) {
    return <AuthFrame eyebrow="Starting" title="Loading Studio..." />;
  }
  if (auth.isLoading) {
    return <AuthFrame eyebrow="Starting" title="Loading Studio..." />;
  }
  if (!auth.isAuthenticated) {
    return <StudioSignIn />;
  }
  return <StudioShell />;
}

function StudioSignIn() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"email" | { email: string }>("email");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <AuthFrame
      eyebrow="Yatishara Studio"
      title={step === "email" ? "Sign in with email" : "Enter your code"}
      footer="Email OTP via Resend. No password needed."
    >
      <form
        className="mt-5 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          const formData = new FormData(event.currentTarget);
          void signIn("resend-otp", formData)
            .then(() => {
              if (step === "email") {
                setStep({ email: String(formData.get("email") ?? "") });
              }
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Sign-in failed");
            })
            .finally(() => setPending(false));
        }}
      >
        {step === "email" ? (
          <input
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/60"
            name="email"
            placeholder="you@yatishara.com"
            type="email"
            autoComplete="email"
            required
          />
        ) : (
          <>
            <input name="email" value={step.email} type="hidden" />
            <input
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-lg tracking-[0.35em] text-white outline-none placeholder:text-white/35 focus:border-emerald-400/60"
              name="code"
              placeholder="00000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </>
        )}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <button
          className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={pending}
        >
          {pending ? "Working..." : step === "email" ? "Send code" : "Continue"}
        </button>
        {step !== "email" ? (
          <button
            className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-white/75 transition hover:bg-white/[0.04]"
            type="button"
            onClick={() => {
              setError("");
              setStep("email");
            }}
          >
            Use another email
          </button>
        ) : null}
      </form>
    </AuthFrame>
  );
}

function AuthFrame({
  eyebrow,
  title,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  footer?: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex h-dvh items-center justify-center bg-[#101116] px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#171922]/95 p-6 shadow-2xl shadow-black/35">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-300">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Create image and video generations from a Yatishara Studio workspace.
        </p>
        {children}
        {footer ? <p className="mt-5 text-xs text-white/40">{footer}</p> : null}
      </section>
    </main>
  );
}
