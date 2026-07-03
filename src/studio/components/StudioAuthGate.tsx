"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import {
  ArrowRight,
  Copy,
  Loader2,
  Mail,
  Phone,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { StudioShell } from "./StudioShell";
import { STUDIO_SCENE_ALL_PATHS } from "@/studio/lib/studio-scene-backgrounds";

const AUTH_BACKGROUND_IMAGES = [...STUDIO_SCENE_ALL_PATHS];

const WHATSAPP_CODE_TTL_MS = 2 * 60 * 1000;

const AUTH_BACKGROUND_THEMES = [
  { key: "gold", accent: "#c4a574" },
  { key: "ember", accent: "#fb923c" },
  { key: "mint", accent: "#4ade80" },
  { key: "violet", accent: "#c084fc" },
  { key: "rose", accent: "#fb7185" },
  { key: "cobalt", accent: "#60a5fa" },
  { key: "coral", accent: "#f472b6" },
  { key: "sage", accent: "#86efac" },
  { key: "cherry", accent: "#f87171" },
  { key: "teal", accent: "#2dd4bf" },
  { key: "lime", accent: "#a3e635" },
  { key: "fuchsia", accent: "#e879f9" },
  { key: "copper", accent: "#d97706" },
  { key: "indigo", accent: "#818cf8" },
  { key: "space", accent: "#38bdf8" },
  { key: "agent", accent: "#22c55e" },
];

function hexToRgbString(hex: string) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)} ${parseInt(value.slice(2, 4), 16)} ${parseInt(value.slice(4, 6), 16)}`;
}

function getAuthThemeForBackground(path: string) {
  return (
    AUTH_BACKGROUND_THEMES.find((theme) => path.includes(theme.key)) ??
    AUTH_BACKGROUND_THEMES[AUTH_BACKGROUND_THEMES.length - 1]
  );
}

type WhatsAppCodeStep = {
  requestId: Id<"whatsappAuthRequests">;
  phone: string;
  code: string;
  whatsappNumber: string;
  whatsappUrl: string;
  expiresAt: number;
  clientExpiresAt?: number;
};

function withWhatsAppClientExpiry(step: WhatsAppCodeStep): WhatsAppCodeStep {
  return {
    ...step,
    clientExpiresAt: Math.min(step.expiresAt, Date.now() + WHATSAPP_CODE_TTL_MS),
  };
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2.25a9.66 9.66 0 0 0-8.19 14.78l-1.1 4.01 4.11-1.08a9.66 9.66 0 1 0 5.18-17.71Zm0 1.78a7.88 7.88 0 1 1 0 15.76 7.8 7.8 0 0 1-4-1.1l-.29-.17-2.44.64.65-2.38-.19-.3a7.88 7.88 0 0 1 6.27-12.45Zm-3.35 3.7c-.18 0-.47.07-.71.34-.24.26-.93.91-.93 2.22 0 1.31.96 2.58 1.09 2.76.13.17 1.85 2.96 4.58 4.03 2.27.89 2.73.71 3.22.67.49-.04 1.59-.65 1.81-1.28.22-.63.22-1.17.15-1.28-.07-.11-.24-.18-.51-.31-.27-.13-1.59-.78-1.84-.87-.25-.09-.43-.13-.61.13-.18.27-.7.87-.86 1.05-.16.18-.31.2-.58.07-.27-.13-1.13-.42-2.15-1.33-.8-.71-1.34-1.59-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.31.4-.47.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.47-.07-.13-.61-1.47-.84-2.01-.22-.53-.45-.46-.61-.47h-.52Z" />
    </svg>
  );
}

export function StudioAuthGate() {
  const auth = useConvexAuth();
  const [authLoadTimedOut, setAuthLoadTimedOut] = useState(false);

  useEffect(() => {
    if (!auth?.isLoading) {
      setAuthLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setAuthLoadTimedOut(true), 3000);
    return () => window.clearTimeout(timer);
  }, [auth?.isLoading]);

  if (!auth) {
    return <StudioPageLoader />;
  }
  if (auth.isLoading) {
    if (authLoadTimedOut) {
      return <StudioSignIn />;
    }
    return <StudioPageLoader />;
  }
  if (!auth.isAuthenticated) {
    return <StudioSignIn />;
  }
  return <StudioShell />;
}

function StudioPageLoader() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#020617] text-white">
      <style jsx global>{`
        @keyframes studio-loader-pulse {
          0% { transform: scale(0.5); opacity: 0; }
          15% { opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }
        .studio-page-loader-pulse {
          position: absolute;
          inset: -100%;
          background:
            radial-gradient(circle at 50% 50%, transparent 20%, color-mix(in srgb, #fff 16%, transparent) 40%, transparent 55%),
            radial-gradient(circle at 50% 50%, transparent 0%, color-mix(in srgb, var(--cursor-accent, #66e8ff) 10%, transparent) 25%, transparent 45%);
          animation: studio-loader-pulse 3000ms cubic-bezier(0.25, 0, 0.2, 1) 1 forwards;
        }
      `}</style>
      <div className="relative flex h-48 w-48 items-center justify-center">
        <div className="studio-page-loader-pulse" />
        <div className="relative z-10">
          <BrandMark size={36} subtle />
        </div>
      </div>
    </main>
  );
}

function StudioSignIn() {
  const { signIn } = useAuthActions();
  const startWhatsApp = useMutation(api.whatsappAuth.start);
  const checkLatestWhatsApp = useAction(api.whatsappAuth.checkLatest);
  const [method, setMethod] = useState<"email" | "whatsapp">("email");
  const [emailStep, setEmailStep] = useState<"email" | { email: string }>(
    "email",
  );
  const [whatsAppStep, setWhatsAppStep] = useState<
    | "phone"
    | WhatsAppCodeStep
  >("phone");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isEmailCodeStep = emailStep !== "email";
  const isWhatsAppCodeStep = whatsAppStep !== "phone";
  const whatsAppExpiry =
    whatsAppStep === "phone"
      ? 0
      : (whatsAppStep.clientExpiresAt ??
        Math.min(whatsAppStep.expiresAt, nowMs + WHATSAPP_CODE_TTL_MS));
  const whatsAppTimeLeftMs = Math.max(0, whatsAppExpiry - nowMs);
  const whatsAppTimeLeftSeconds = Math.ceil(whatsAppTimeLeftMs / 1000);
  const whatsAppExpired = isWhatsAppCodeStep && whatsAppTimeLeftSeconds <= 0;

  useEffect(() => {
    if (!isWhatsAppCodeStep) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isWhatsAppCodeStep, whatsAppExpiry]);

  useEffect(() => {
    if (whatsAppStep === "phone" || whatsAppStep.clientExpiresAt) return;
    setWhatsAppStep(withWhatsAppClientExpiry(whatsAppStep));
  }, [whatsAppStep]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const resendWhatsAppCode = () => {
    if (whatsAppStep === "phone") return;
    setPending(true);
    setError("");
    setNotice("");
    void startWhatsApp({ phone: whatsAppStep.phone })
      .then((request) => {
        setWhatsAppStep(withWhatsAppClientExpiry(request));
        setNowMs(Date.now());
        setNotice("New code ready.");
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "WhatsApp sign-in failed",
        );
      })
      .finally(() => setPending(false));
  };

  return (
    <AuthFrame
      eyebrow="Yatishara Studio"
      title={
        method === "email"
          ? isEmailCodeStep
            ? "Check your email"
            : "Welcome back"
          : isWhatsAppCodeStep
            ? "Open WhatsApp"
            : "Welcome back"
      }
    >
      <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-full border border-white/15 bg-transparent p-1.5 shadow-inner shadow-white/[0.04] backdrop-blur-xl">
        <MethodButton
          active={method === "email"}
          onClick={() => setMethod("email")}
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Email
        </MethodButton>
        <MethodButton
          active={method === "whatsapp"}
          onClick={() => setMethod("whatsapp")}
        >
          <WhatsAppIcon className="h-4 w-4" />
          WhatsApp
        </MethodButton>
      </div>
      <form
        className="mt-6 space-y-4"
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
                setWhatsAppStep(withWhatsAppClientExpiry(request));
              })
              .catch((err: unknown) => {
                setError(
                  err instanceof Error
                    ? err.message
                    : "WhatsApp sign-in failed",
                );
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
              setError(
                err instanceof Error ? err.message : "WhatsApp check failed",
              );
            })
            .finally(() => setPending(false));
        }}
      >
        {method === "email" && !isEmailCodeStep ? (
          <label className="block text-left">
            <span className="mb-1.5 block text-xs font-medium text-white/48">
              Email address
            </span>
            <span className="studio-auth-field flex items-center gap-3 rounded-2xl border border-white/15 bg-transparent px-4 py-3.5 shadow-inner shadow-white/[0.03] backdrop-blur-xl transition">
              <Mail
                className="studio-auth-accent-text h-5 w-5"
                aria-hidden="true"
              />
              <input
                className="min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-white/35"
                name="email"
                placeholder="you@example.com"
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
              <span className="sr-only">Code</span>
              <input
                className="studio-auth-field w-full rounded-2xl border border-white/15 bg-transparent px-5 py-4 text-center text-lg font-semibold tracking-[0.28em] text-white outline-none shadow-inner shadow-white/[0.03] backdrop-blur-xl transition placeholder:text-white/30"
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
          <label className="block text-left">
            <span className="mb-1.5 block text-xs font-medium text-white/48">
              WhatsApp number
            </span>
            <span className="studio-auth-field flex items-center gap-3 rounded-2xl border border-white/15 bg-transparent px-4 py-3.5 shadow-inner shadow-white/[0.03] backdrop-blur-xl transition">
              <Phone
                className="studio-auth-accent-text h-5 w-5"
                aria-hidden="true"
              />
              <input
                className="min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-white/35"
                name="phone"
                placeholder="+1 (868) 000-0000"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(event) => setPhoneInput(formatPhoneInput(event.target.value))}
                required
              />
            </span>
          </label>
        ) : null}

        {method === "whatsapp" && isWhatsAppCodeStep ? (
          <div className="space-y-2">
            <div className="rounded-2xl border border-white/15 bg-transparent p-3 text-center shadow-inner shadow-white/[0.03] backdrop-blur-xl">
              <p className="mb-1 text-[11px] leading-4 text-white/42">
                Send code to {formatPhoneDisplay(whatsAppStep.whatsappNumber)}
              </p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl font-semibold tracking-[0.16em] text-white">
                  {formatAuthCode(whatsAppStep.code)}
                </p>
                <button
                  className="inline-flex cursor-pointer items-center justify-center bg-transparent p-0 text-white/60 transition hover:text-white focus:outline-none"
                  type="button"
                  aria-label="Copy code"
                  title="Copy code"
                  onClick={() => {
                    void navigator.clipboard.writeText(whatsAppStep.code);
                    setNotice("Code copied.");
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-white/38">
                {whatsAppExpired
                  ? "Expired"
                  : `Expires in ${formatCountdown(whatsAppTimeLeftSeconds)}`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                className="studio-auth-primary flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none"
                href={whatsAppStep.whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Open WhatsApp
              </a>
              <button
                className="studio-auth-primary flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={pending || whatsAppExpired}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    Continue
                    <ArrowRight
                      className="h-4 w-4 transition group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
        {notice ? (
          <p className="studio-auth-notice text-xs">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {method === "whatsapp" && isWhatsAppCodeStep ? null : (
          <button
            className="studio-auth-primary group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-semibold shadow-lg shadow-black/20 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Sending secure code
              </>
            ) : (
              <>
                {method === "email"
                  ? isEmailCodeStep
                    ? "Continue"
                    : "Send code"
                  : "Get code"}
                <ArrowRight
                  className="h-5 w-5 transition group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            )}
          </button>
        )}
        {method === "email" && isEmailCodeStep ? (
          <button
            className="studio-auth-secondary w-full cursor-pointer rounded-2xl border border-white/15 bg-transparent px-5 py-3.5 text-base font-semibold text-white/75 shadow-inner shadow-white/[0.02] backdrop-blur-xl transition focus:outline-none"
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
          <div className="flex items-center justify-center gap-3 text-sm font-medium">
            <button
              className="cursor-pointer bg-transparent px-1 py-1 text-white/55 underline-offset-4 transition hover:text-white hover:underline focus:outline-none"
              type="button"
              onClick={() => {
                setError("");
                setNotice("");
                setWhatsAppStep("phone");
              }}
            >
              Use another number
            </button>
            <span className="text-white/25" aria-hidden="true">
              /
            </span>
            <button
              className="cursor-pointer bg-transparent px-1 py-1 text-white/55 underline-offset-4 transition hover:text-white hover:underline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={pending}
              onClick={resendWhatsAppCode}
            >
              Resend code
            </button>
          </div>
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
      className={`studio-auth-method flex cursor-pointer items-center justify-center gap-2 rounded-full px-3.5 py-2.5 text-base font-medium transition focus:outline-none ${
        active ? "is-active shadow-sm shadow-black/20 backdrop-blur-xl" : "text-white/55"
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
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const activeBackground = AUTH_BACKGROUND_IMAGES[backgroundIndex];
  const activeTheme = getAuthThemeForBackground(activeBackground);
  const authThemeStyle = {
    "--studio-auth-accent": activeTheme.accent,
    "--studio-auth-accent-rgb": hexToRgbString(activeTheme.accent),
  } as CSSProperties;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setBackgroundIndex(
        (index) => (index + 1) % AUTH_BACKGROUND_IMAGES.length,
      );
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const next =
      AUTH_BACKGROUND_IMAGES[
        (backgroundIndex + 1) % AUTH_BACKGROUND_IMAGES.length
      ];
    const image = new Image();
    image.decoding = "async";
    image.src = next;
  }, [backgroundIndex]);

  return (
    <main
      className="studio-auth-theme relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#020617] px-5 py-10 text-white"
      style={authThemeStyle}
    >
      <div
        className="absolute inset-0 scale-[1.03] bg-cover bg-center transition-[background-image,opacity,transform] duration-1000 ease-out"
        style={{ backgroundImage: `url("${activeBackground}")` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.14),transparent_28%),linear-gradient(180deg,rgba(5,7,12,0.42),rgba(5,7,12,0.82))]"
        aria-hidden="true"
      />
      <style jsx global>{`
        .studio-auth-theme .studio-auth-accent-text,
        .studio-auth-theme .studio-auth-eyebrow {
          color: rgb(var(--studio-auth-accent-rgb) / 0.72);
        }
        .studio-auth-theme .studio-auth-field:focus,
        .studio-auth-theme .studio-auth-field:focus-within {
          border-color: rgb(var(--studio-auth-accent-rgb) / 0.44);
          background: rgb(var(--studio-auth-accent-rgb) / 0.035);
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.04),
            0 0 0 1px rgb(var(--studio-auth-accent-rgb) / 0.16);
        }
        .studio-auth-theme .studio-auth-primary {
          border: 1px solid rgb(var(--studio-auth-accent-rgb) / 0.34);
          background: rgb(var(--studio-auth-accent-rgb) / 0.18);
          color: #fff;
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.08),
            0 18px 44px rgb(0 0 0 / 0.24),
            0 0 34px rgb(var(--studio-auth-accent-rgb) / 0.16);
        }
        .studio-auth-theme .studio-auth-primary:hover {
          border-color: rgb(var(--studio-auth-accent-rgb) / 0.52);
          background: rgb(var(--studio-auth-accent-rgb) / 0.24);
        }
        .studio-auth-theme .studio-auth-primary:focus-visible,
        .studio-auth-theme .studio-auth-secondary:focus-visible,
        .studio-auth-theme .studio-auth-method:focus-visible {
          box-shadow:
            0 0 0 2px rgb(2 6 23 / 0.9),
            0 0 0 4px rgb(var(--studio-auth-accent-rgb) / 0.34);
        }
        .studio-auth-theme .studio-auth-secondary:hover,
        .studio-auth-theme .studio-auth-method:hover {
          border-color: rgb(var(--studio-auth-accent-rgb) / 0.34);
          background: rgb(var(--studio-auth-accent-rgb) / 0.06);
          color: rgb(255 255 255 / 0.88);
        }
        .studio-auth-theme .studio-auth-method.is-active {
          border: 1px solid rgb(var(--studio-auth-accent-rgb) / 0.32);
          background: rgb(var(--studio-auth-accent-rgb) / 0.12);
          color: #fff;
        }
        .studio-auth-theme .studio-auth-notice {
          color: rgb(255 255 255 / 0.58);
          min-height: 1rem;
        }
      `}</style>
      <section className="relative w-full max-w-[372px] rounded-[2rem] border border-white/15 bg-transparent p-5 text-center shadow-2xl shadow-black/35 ring-1 ring-white/[0.04] backdrop-blur-3xl sm:p-6">
        <div className="flex flex-col items-center justify-center gap-3">
          <BrandMark size={64} subtle />
          <div>
            <p className="studio-auth-eyebrow text-xs font-semibold uppercase tracking-[0.24em]">
              {eyebrow}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        </div>
        {children}
      </section>
    </main>
  );
}

function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatAuthCode(code: string) {
  return code.replace(/^(\d{3})(\d{3})$/, "$1-$2");
}

function formatPhoneDisplay(phone: string) {
  return phone.replace(/^1?(\d{3})(\d{3})(\d{4})$/, "+1 ($1) $2-$3");
}

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^1/, "").slice(0, 10);
  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);

  if (!area) return "";
  if (area.length < 3) return `+1 (${area}`;
  if (!prefix) return `+1 (${area})`;
  if (prefix.length < 3) return `+1 (${area}) ${prefix}`;
  return `+1 (${area}) ${prefix}${line ? `-${line}` : ""}`;
}
