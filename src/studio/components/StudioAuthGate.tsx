"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Film,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  const startWhatsApp = useMutation(api.whatsappAuth.start);
  const checkLatestWhatsApp = useAction(api.whatsappAuth.checkLatest);
  const [method, setMethod] = useState<"email" | "whatsapp">("email");
  const [emailStep, setEmailStep] = useState<"email" | { email: string }>("email");
  const [whatsAppStep, setWhatsAppStep] = useState<
    | "phone"
    | {
        requestId: Id<"whatsappAuthRequests">;
        phone: string;
        code: string;
        whatsappNumber: string;
        whatsappUrl: string;
      }
  >("phone");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const isEmailCodeStep = emailStep !== "email";
  const isWhatsAppCodeStep = whatsAppStep !== "phone";

  return (
    <AuthFrame
      eyebrow="Yatishara Studio"
      title={
        method === "email"
          ? isEmailCodeStep
            ? "Check your inbox"
            : "Create without passwords"
          : isWhatsAppCodeStep
            ? "Send this code on WhatsApp"
            : "Sign in with WhatsApp"
      }
      footer={
        method === "email"
          ? isEmailCodeStep
            ? `We sent an 8-digit code to ${emailStep.email}.`
            : "Choose email OTP or WhatsApp self-verification."
          : isWhatsAppCodeStep
            ? `Only latest message from ${whatsAppStep.phone} is checked.`
            : "We show a code. You message it to our WhatsApp number."
      }
    >
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
        <MethodButton active={method === "email"} onClick={() => setMethod("email")}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          Email
        </MethodButton>
        <MethodButton active={method === "whatsapp"} onClick={() => setMethod("whatsapp")}>
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          WhatsApp
        </MethodButton>
      </div>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          setNotice("");
          const formData = new FormData(event.currentTarget);
          if (method === "email") {
            void signIn("resend-otp", formData)
              .then(() => {
                if (emailStep === "email") {
                  setEmailStep({ email: String(formData.get("email") ?? "") });
                }
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Sign-in failed");
              })
              .finally(() => setPending(false));
            return;
          }

          if (whatsAppStep === "phone") {
            void startWhatsApp({ phone: String(formData.get("phone") ?? "") })
              .then((request) => {
                setWhatsAppStep(request);
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "WhatsApp sign-in failed");
              })
              .finally(() => setPending(false));
            return;
          }

          void checkLatestWhatsApp({
            requestId: whatsAppStep.requestId,
            phone: whatsAppStep.phone,
          })
            .then(async (result) => {
              if (result.status !== "verified") {
                setError(result.message);
                return;
              }
              setNotice("WhatsApp verified. Signing you in...");
              const signInResult = await signIn("whatsapp-otp", {
                requestId: whatsAppStep.requestId,
                phone: whatsAppStep.phone,
              });
              if (!signInResult.signingIn) {
                setError("Verified code expired. Request a new code.");
              }
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "WhatsApp check failed");
            })
            .finally(() => setPending(false));
        }}
      >
        {method === "email" && !isEmailCodeStep ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              Work email
            </span>
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-inner shadow-white/[0.02] transition focus-within:border-emerald-300/70 focus-within:bg-white/[0.08]">
              <Mail className="h-4 w-4 text-emerald-200" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                name="email"
                placeholder="you@yatishara.com"
                type="email"
                autoComplete="email"
                required
              />
            </span>
          </label>
        ) : null}

        {method === "email" && isEmailCodeStep ? (
          <>
            <input name="email" value={emailStep.email} type="hidden" />
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
                Verification code
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 text-center text-xl font-semibold tracking-[0.45em] text-white outline-none shadow-inner shadow-white/[0.02] transition placeholder:text-white/30 focus:border-emerald-300/70 focus:bg-white/[0.08]"
                name="code"
                placeholder="00000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
          </>
        ) : null}

        {method === "whatsapp" && !isWhatsAppCodeStep ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              WhatsApp number
            </span>
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-inner shadow-white/[0.02] transition focus-within:border-emerald-300/70 focus-within:bg-white/[0.08]">
              <Phone className="h-4 w-4 text-emerald-200" aria-hidden="true" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                name="phone"
                placeholder="18683377338"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </span>
          </label>
        ) : null}

        {method === "whatsapp" && isWhatsAppCodeStep ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/80">
                Message this code
              </p>
              <p className="mt-3 text-4xl font-black tracking-[0.24em] text-white">
                {whatsAppStep.code}
              </p>
              <p className="mt-3 text-xs leading-5 text-white/52">
                Send it from {whatsAppStep.phone} to {whatsAppStep.whatsappNumber}.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <a
                className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/15 focus:outline-none focus:ring-2 focus:ring-emerald-200/50"
                href={whatsAppStep.whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                WhatsApp us
              </a>
              <button
                className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-white/25"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(whatsAppStep.code);
                  setNotice("Code copied.");
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy code
              </button>
            </div>
          </div>
        ) : null}
        {notice ? (
          <p className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-50">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        <button
          className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-200 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-200/70 focus:ring-offset-2 focus:ring-offset-[#06070d] disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={pending}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {method === "whatsapp" && isWhatsAppCodeStep ? "Checking latest message" : "Sending secure code"}
            </>
          ) : (
            <>
              {method === "email"
                ? isEmailCodeStep
                  ? "Enter Studio"
                  : "Send sign-in code"
                : isWhatsAppCodeStep
                  ? "I sent it"
                  : "Show WhatsApp code"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </>
          )}
        </button>
        {method === "email" && isEmailCodeStep ? (
          <button
            className="w-full cursor-pointer rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-white/25"
            type="button"
            onClick={() => {
              setError("");
              setNotice("");
              setEmailStep("email");
            }}
          >
            Use another email
          </button>
        ) : null}
        {method === "whatsapp" && isWhatsAppCodeStep ? (
          <button
            className="w-full cursor-pointer rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-white/25"
            type="button"
            onClick={() => {
              setError("");
              setNotice("");
              setWhatsAppStep("phone");
            }}
          >
            Request a new WhatsApp code
          </button>
        ) : null}
      </form>
    </AuthFrame>
  );
}

function MethodButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-200/60 ${
        active
          ? "bg-white text-slate-950 shadow-sm"
          : "text-white/58 hover:bg-white/[0.06] hover:text-white"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#05060b] px-4 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.20),transparent_32%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.20),transparent_30%),linear-gradient(135deg,#06070d_0%,#0f1020_55%,#090a12_100%)]" />
      <div className="absolute left-1/2 top-8 h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-300/10 blur-3xl" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/50 backdrop-blur-2xl md:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden min-h-[560px] flex-col justify-between border-r border-white/10 bg-black/20 p-8 md:flex">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark size={44} subtle />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-200">
                  {eyebrow}
                </p>
                <p className="text-sm text-white/45">AI video and image workspace</p>
              </div>
            </div>
            <div className="mt-14 max-w-md">
              <p className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                Private launch access
              </p>
              <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-tight">
                Turn briefs into production-ready scenes.
              </h1>
              <p className="mt-5 text-base leading-7 text-white/58">
                Prompt enhancement, reference assets, folders, billing, and generation history in one focused Studio.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FeaturePill icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} label="Prompt flows" />
            <FeaturePill icon={<Film className="h-4 w-4" aria-hidden="true" />} label="Pro video" />
            <FeaturePill icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} label="OTP secure" />
          </div>
        </div>
        <div className="p-5 sm:p-8">
          <div className="mx-auto flex min-h-[520px] max-w-md flex-col justify-center">
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <BrandMark size={40} subtle />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
                  {eyebrow}
                </p>
                <p className="text-sm text-white/45">AI creative studio</p>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-white/10 bg-[#0c0f1a]/85 p-5 shadow-xl shadow-black/30 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/85">
                    Secure access
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-emerald-200">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Create image and video generations from a Yatishara Studio workspace.
              </p>
              {children}
              {footer ? <p className="mt-5 text-xs leading-5 text-white/42">{footer}</p> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function FeaturePill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-sm text-white/70">
      <div className="mb-2 text-emerald-200">{icon}</div>
      <p>{label}</p>
    </div>
  );
}
