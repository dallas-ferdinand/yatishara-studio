"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Copy,
  Loader2,
  Lock,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";
import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { StudioBootLoader } from "@/components/studio-boot-loader";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  STUDIO_AUTH_BACKGROUND_PATHS,
  studioSceneThemeIdFromPath,
} from "@/studio/lib/studio-scene-backgrounds";
import { SCHEMES } from "@/mos-app/theme.js";
import { useAppearanceMode } from "@/lib/use-appearance-mode";
import type { AppearanceMode } from "@/lib/brand-assets";
import { markPerfMilestone } from "@/lib/performance";
import {
  resetStudioClient,
  studioResetHref,
} from "@/studio/lib/studio-client-reset";

type StudioShellBootProps = {
  initialProfileUsername?: string;
  onReady?: () => void;
};

class StudioShellErrorBoundary extends Component<
  { children: ReactNode; onFailed?: () => void },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return {
      failed: true,
      message: error?.message ? String(error.message).slice(0, 280) : "Studio crashed while loading.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onFailed?.();
    const payload = {
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack ?? "",
      route: window.location.href,
      userAgent: navigator.userAgent,
      build: process.env.NEXT_PUBLIC_DESK_BUILD ?? "",
    };
    console.error("[studio-shell-error]", payload);
    try {
      (window as Window & { __STUDIO_LAST_ERROR__?: typeof payload }).__STUDIO_LAST_ERROR__ =
        payload;
    } catch {
      /* ignore */
    }
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Fixed overlay above PaintBoot / AuthGate boot (z-index 2147483000) so
    // Reset is always visible and clickable — previously the boot layer ate clicks.
    return (
      <div
        className="ys-boot-overlay"
        style={{ zIndex: 2147483001 }}
        data-ys-boot="recovery"
      >
        <StudioBootLoader
          recovery={
            <div className="mt-6 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
              <p className="text-xs font-medium text-slate-900/70">
                Studio hit a load error and stopped here.
              </p>
              {this.state.message ? (
                <p className="rounded-lg bg-slate-900/5 px-3 py-2 font-mono text-[11px] leading-snug text-slate-900/55 break-words">
                  {this.state.message}
                </p>
              ) : null}
              <p className="text-[11px] leading-snug text-slate-900/45">
                Tap Reset Studio to clear sticky tabs/cache, then reload. If this keeps happening, hard-refresh after reset.
              </p>
              <a
                href={studioResetHref()}
                className="rounded-xl border border-slate-900/15 px-4 py-2 text-xs font-semibold text-slate-900/70"
                onClick={(event) => {
                  event.preventDefault();
                  resetStudioClient("error-boundary");
                }}
              >
                Reset Studio
              </a>
            </div>
          }
        />
      </div>
    );
  }
}

/** Shell chunk loads under the single white boot overlay; signals ready only after mount. */
const StudioShell = dynamic<StudioShellBootProps>(
  () =>
    import("./StudioShell").then((m) => {
      const Inner = m.StudioShell;
      return function StudioShellBootGate({ onReady, initialProfileUsername }: StudioShellBootProps) {
        useEffect(() => {
          onReady?.();
        }, [onReady]);
        return <Inner initialProfileUsername={initialProfileUsername} />;
      };
    }),
  {
    ssr: false,
    loading: () => null,
  },
);

const AUTH_BACKGROUND_IMAGES = [...STUDIO_AUTH_BACKGROUND_PATHS];

function authBackgroundsForAppearance(appearance: AppearanceMode) {
  const filtered = AUTH_BACKGROUND_IMAGES.filter((path) =>
    appearance === "light" ? path.includes("-light-") : !path.includes("-light-"),
  );
  return filtered.length > 0 ? filtered : AUTH_BACKGROUND_IMAGES;
}

const WHATSAPP_CODE_TTL_MS = 2 * 60 * 1000;

function hexToRgbString(hex: string) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)} ${parseInt(value.slice(2, 4), 16)} ${parseInt(value.slice(4, 6), 16)}`;
}

function getAuthThemeForBackground(path: string) {
  const themeId = studioSceneThemeIdFromPath(path);
  const scheme = SCHEMES[themeId as keyof typeof SCHEMES] ?? SCHEMES.agent;
  return { key: themeId, accent: scheme.accent };
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

export function StudioAuthGate({
  initialProfileUsername,
}: {
  initialProfileUsername?: string;
} = {}) {
  const auth = useConvexAuth();
  const currentUser = useQuery(api.users.current, auth?.isAuthenticated ? {} : "skip");
  const [authLoadTimedOut, setAuthLoadTimedOut] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [shellFailed, setShellFailed] = useState(false);
  // Boot overlay is client-only — never SSR it (avoids HMR/SW class-prefix hydration fights).
  const [bootMountReady, setBootMountReady] = useState(false);
  const shellReadyRef = useRef(false);

  const markShellReady = useCallback(() => {
    if (shellReadyRef.current) return;
    shellReadyRef.current = true;
    setShellReady(true);
  }, []);

  const markShellFailed = useCallback(() => {
    setShellFailed(true);
  }, []);

  useEffect(() => {
    // PaintBoot hides itself declaratively in the same passive-effect flush.
    setBootMountReady(true);
  }, []);

  useEffect(() => {
    if (!auth?.isLoading && auth?.isAuthenticated) {
      markPerfMilestone("auth-ready");
    }
  }, [auth?.isAuthenticated, auth?.isLoading]);

  useEffect(() => {
    if (!auth?.isLoading) {
      setAuthLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setAuthLoadTimedOut(true), 3000);
    return () => window.clearTimeout(timer);
  }, [auth?.isLoading]);

  useEffect(() => {
    // Only reset on sign-out / missing user — not while currentUser is still loading
    // (undefined), or the boot overlay can thrash as the shell mounts.
    if (!auth?.isAuthenticated || currentUser === null) {
      shellReadyRef.current = false;
      setShellReady(false);
      setShellFailed(false);
    }
  }, [auth?.isAuthenticated, currentUser]);

  const authPending = !auth || auth.isLoading;
  const userPending = Boolean(auth?.isAuthenticated) && currentUser === undefined;
  const showSignInScreen =
    Boolean(auth) && !auth.isAuthenticated && (!auth.isLoading || authLoadTimedOut);
  const showCompleteAccount =
    Boolean(auth?.isAuthenticated) &&
    currentUser != null &&
    !currentUser.accountComplete;
  const showShell =
    Boolean(auth?.isAuthenticated) &&
    currentUser != null &&
    Boolean(currentUser.accountComplete);

  // One continuous white boot overlay across auth → user → shell-chunk gates.
  // Hide it once the shell error boundary owns the screen so Reset stays clickable.
  const showBoot =
    bootMountReady &&
    !shellFailed &&
    !showSignInScreen &&
    !showCompleteAccount &&
    (authPending || userPending || (showShell && !shellReady));

  return (
    <>
      {showBoot ? (
        <div className="ys-boot-overlay">
          <StudioBootLoader />
        </div>
      ) : null}
      {showSignInScreen ? <StudioSignIn /> : null}
      {showCompleteAccount ? <StudioCompleteAccount currentUser={currentUser} /> : null}
      {showShell ? (
        <StudioShellErrorBoundary onFailed={markShellFailed}>
          <StudioShell
            initialProfileUsername={initialProfileUsername}
            onReady={markShellReady}
          />
        </StudioShellErrorBoundary>
      ) : null}
    </>
  );
}

function StudioCompleteAccount({
  currentUser,
}: {
  currentUser: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
}) {
  const { signOut } = useAuthActions();
  const updateAccountDetails = useMutation(api.users.updateAccountDetails);
  const legacyParts = splitDisplayNameParts(currentUser.name);
  const [firstName, setFirstName] = useState(currentUser.firstName ?? legacyParts.firstName);
  const [lastName, setLastName] = useState(currentUser.lastName ?? legacyParts.lastName);
  const [email, setEmail] = useState(currentUser.email ?? "");
  const [phone, setPhone] = useState(currentUser.phone ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const missingEmail = !currentUser.email?.trim();
  const missingPhone = !currentUser.phone?.trim();
  const canContinue =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    phone.trim().length > 0;

  return (
    <AuthFrame eyebrow="Yatishara Studio" title="Finish your account">
      <p className="studio-auth-copy mt-3 text-sm">
        Every Studio account needs first name, last name, email, and WhatsApp. You can change them later,
        but you cannot remove email or phone.
      </p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          void updateAccountDetails({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            phone: phone.trim(),
          })
            .catch((err: unknown) => {
              setError(friendlyConvexError(err, "Could not save account details"));
            })
            .finally(() => setPending(false));
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="studio-auth-label text-xs uppercase tracking-[0.18em]">First name</span>
            <span className="studio-auth-field flex items-center gap-3 rounded-2xl border bg-transparent px-4 py-3.5 backdrop-blur-xl transition">
              <UserRound className="studio-auth-icon h-4 w-4 shrink-0" />
              <input
                className="w-full bg-transparent outline-none"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                autoComplete="given-name"
                required
              />
            </span>
          </label>
          <label className="block space-y-2">
            <span className="studio-auth-label text-xs uppercase tracking-[0.18em]">Last name</span>
            <span className="studio-auth-field flex items-center gap-3 rounded-2xl border bg-transparent px-4 py-3.5 backdrop-blur-xl transition">
              <UserRound className="studio-auth-icon h-4 w-4 shrink-0" />
              <input
                className="w-full bg-transparent outline-none"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                autoComplete="family-name"
                required
              />
            </span>
          </label>
        </div>
        <label className="block space-y-2">
          <span className="studio-auth-label text-xs uppercase tracking-[0.18em]">
            Email{missingEmail ? " (required)" : ""}
          </span>
          <span className={`studio-auth-field flex items-center gap-3 rounded-2xl border bg-transparent px-4 py-3.5 backdrop-blur-xl transition${!missingEmail ? " opacity-70" : ""}`}>
            <Mail className="studio-auth-icon h-4 w-4 shrink-0" />
            <input
              className="w-full bg-transparent outline-none disabled:cursor-not-allowed"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              required
              disabled={!missingEmail}
              autoComplete="email"
            />
          </span>
        </label>
        <label className="block space-y-2">
          <span className="studio-auth-label text-xs uppercase tracking-[0.18em]">
            Phone / WhatsApp{missingPhone ? " (required)" : ""}
          </span>
          <span className={`studio-auth-field flex items-center gap-3 rounded-2xl border bg-transparent px-4 py-3.5 backdrop-blur-xl transition${!missingPhone ? " opacity-70" : ""}`}>
            <Phone className="studio-auth-icon h-4 w-4 shrink-0" />
            <input
              className="w-full bg-transparent outline-none disabled:cursor-not-allowed"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 868 337 7338"
              type="tel"
              required
              disabled={!missingPhone}
              autoComplete="tel"
            />
          </span>
        </label>
        {error ? <p className="studio-auth-error text-sm">{error}</p> : null}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 font-medium text-black disabled:opacity-60"
          disabled={pending || !canContinue}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Continue to Studio
        </button>
        <button
          type="button"
          className="studio-auth-link w-full text-sm underline-offset-2 hover:underline"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </form>
    </AuthFrame>
  );
}

function splitDisplayNameParts(name: string | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

type IdentifyContact =
  | { kind: "email"; email: string }
  | { kind: "whatsapp"; phone: string };

type SignInStep =
  | "identify"
  | { contact: IdentifyContact; phase: "password" }
  | { contact: { kind: "email"; email: string }; phase: "email-code"; hasPassword: boolean }
  | ({ contact: { kind: "whatsapp"; phone: string }; phase: "whatsapp-code"; hasPassword: boolean } & WhatsAppCodeStep);

function StudioSignIn() {
  const { signIn } = useAuthActions();
  const convex = useConvex();
  const startWhatsApp = useMutation(api.whatsappAuth.start);
  const checkLatestWhatsApp = useAction(api.whatsappAuth.checkLatest);
  const [step, setStep] = useState<SignInStep>("identify");
  const [identifierInput, setIdentifierInput] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isWhatsAppCodeStep = step !== "identify" && step.phase === "whatsapp-code";
  const isEmailCodeStep = step !== "identify" && step.phase === "email-code";
  const isPasswordStep = step !== "identify" && step.phase === "password";
  const inputMode = detectInputMode(identifierInput);
  const whatsAppExpiry =
    !isWhatsAppCodeStep
      ? 0
      : (step.clientExpiresAt ?? step.expiresAt);
  const whatsAppTimeLeftMs = Math.max(0, whatsAppExpiry - nowMs);
  const whatsAppTimeLeftSeconds = Math.ceil(whatsAppTimeLeftMs / 1000);
  const whatsAppExpired = isWhatsAppCodeStep && whatsAppTimeLeftSeconds <= 0;

  const resetToIdentify = () => {
    setError("");
    setNotice("");
    setStep("identify");
  };

  const startEmailCode = async (email: string, hasPassword = false) => {
    await signIn("resend-otp", { email });
    setStep({ contact: { kind: "email", email }, phase: "email-code", hasPassword });
  };

  const startWhatsAppCode = async (phone: string, hasPassword = false) => {
    const request = await startWhatsApp({ phone });
    setStep({
      contact: { kind: "whatsapp", phone },
      phase: "whatsapp-code",
      hasPassword,
      ...withWhatsAppClientExpiry(request),
    });
    setNowMs(Date.now());
  };

  // Tick once per second while the WhatsApp code is showing.
  // Do NOT depend on whatsAppExpiry — when clientExpiresAt is missing it was
  // derived from nowMs, so setNowMs retriggered this effect forever (React #301).
  useEffect(() => {
    if (!isWhatsAppCodeStep) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isWhatsAppCodeStep]);

  useEffect(() => {
    if (!isWhatsAppCodeStep) return;
    setStep((current) => {
      if (current === "identify" || current.phase !== "whatsapp-code") return current;
      if (current.clientExpiresAt != null) return current;
      return { ...current, ...withWhatsAppClientExpiry(current) };
    });
  }, [isWhatsAppCodeStep]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const resendWhatsAppCode = () => {
    if (!isWhatsAppCodeStep) return;
    setPending(true);
    setError("");
    setNotice("");
    void startWhatsApp({ phone: step.contact.phone })
      .then((request) => {
        setStep({
          contact: step.contact,
          phase: "whatsapp-code",
          hasPassword: step.hasPassword,
          ...withWhatsAppClientExpiry(request),
        });
        setNowMs(Date.now());
        setNotice("New code ready.");
      })
      .catch((err: unknown) => {
        setError(
          friendlyConvexError(err, "WhatsApp sign-in failed"),
        );
      })
      .finally(() => setPending(false));
  };

  return (
    <AuthFrame
      eyebrow="Yatishara Studio"
      title={
        step === "identify"
          ? "Welcome back"
          : isEmailCodeStep
            ? "Check your email"
            : isWhatsAppCodeStep
              ? "Open WhatsApp"
              : "Sign in"
      }
    >
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          setNotice("");
          const formData = new FormData(event.currentTarget);

          if (step === "identify") {
            const contact = parseContactInput(identifierInput);
            if (!contact) {
              setError("Enter a valid email or WhatsApp number");
              setPending(false);
              return;
            }
            void convex
              .query(
                api.passwordAuth.signInOptions,
                contact.kind === "email"
                  ? { email: contact.email }
                  : { phone: contact.phone },
              )
              .then(async (options) => {
                if (!options.hasPassword) {
                  if (contact.kind === "email") {
                    await startEmailCode(contact.email);
                  } else {
                    await startWhatsAppCode(contact.phone);
                  }
                  return;
                }
                setStep({ contact, phase: "password" });
              })
              .catch((err: unknown) => {
                setError(friendlyConvexError(err, "Sign-in failed"));
              })
              .finally(() => setPending(false));
            return;
          }

          if (isPasswordStep) {
            const password = String(formData.get("password") ?? "");
            if (step.contact.kind === "email") {
              void signIn("password", {
                flow: "signIn",
                email: step.contact.email,
                password,
              })
                .catch((err: unknown) => {
                  setError(friendlyConvexError(err, "Wrong email or password"));
                })
                .finally(() => setPending(false));
              return;
            }
            void signIn("phone-password", {
              phone: step.contact.phone,
              password,
            })
              .catch((err: unknown) => {
                setError(friendlyConvexError(err, "Wrong number or password"));
              })
              .finally(() => setPending(false));
            return;
          }

          if (isEmailCodeStep) {
            void signIn("resend-otp", formData)
              .catch((err: unknown) => {
                setError(friendlyConvexError(err, "Sign-in failed"));
              })
              .finally(() => setPending(false));
            return;
          }

          if (!isWhatsAppCodeStep) {
            setPending(false);
            return;
          }

          void checkLatestWhatsApp({
            requestId: step.requestId,
            phone: step.contact.phone,
          })
            .then(async (result) => {
              if (result.status !== "verified") {
                setError(
                  friendlyConvexError(
                    result.message,
                    "WhatsApp isn't verified yet. Check the code and try again.",
                  ),
                );
                return;
              }
              setNotice("WhatsApp verified. Signing you in...");
              const signInResult = await signIn("whatsapp-otp", {
                requestId: step.requestId,
                phone: step.contact.phone,
              });
              if (!signInResult.signingIn) {
                setError("Verified code expired. Request a new code.");
              }
            })
            .catch((err: unknown) => {
              setError(
                friendlyConvexError(err, "WhatsApp check failed"),
              );
            })
            .finally(() => setPending(false));
        }}
      >
        {step === "identify" ? (
          <label className="block text-left">
            <span className="studio-auth-field flex items-center gap-3 rounded-2xl border bg-transparent px-4 py-3.5 backdrop-blur-xl transition">
              {contactInputIcon(identifierInput) === "email" ? (
                <Mail className="studio-auth-accent-text h-5 w-5" aria-hidden="true" />
              ) : contactInputIcon(identifierInput) === "phone" ? (
                <Phone className="studio-auth-accent-text h-5 w-5" aria-hidden="true" />
              ) : (
                <UserRound className="studio-auth-accent-text h-5 w-5" aria-hidden="true" />
              )}
              <input
                className="min-w-0 flex-1 bg-transparent text-lg outline-none"
                name="identifier"
                placeholder="Enter email or number"
                type="text"
                inputMode={
                  inputMode === "email"
                    ? "email"
                    : inputMode === "phone"
                      ? "tel"
                      : "text"
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={identifierInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setIdentifierInput(
                    detectInputMode(value) === "phone" ? formatPhoneInput(value) : value,
                  );
                }}
                required
              />
            </span>
          </label>
        ) : null}

        {isPasswordStep ? (
          <>
            <label className="block text-left">
              <span className="studio-auth-field flex items-center gap-3 rounded-2xl border bg-transparent px-4 py-3.5 backdrop-blur-xl transition">
                <Lock
                  className="studio-auth-accent-text h-5 w-5"
                  aria-hidden="true"
                />
                <input
                  className="min-w-0 flex-1 bg-transparent text-lg outline-none"
                  name="password"
                  placeholder="Your password"
                  type="password"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  required
                  autoFocus
                  // Android WebView autofill often steals focus; unlock on first focus.
                  readOnly
                  onFocus={(event) => {
                    event.currentTarget.removeAttribute("readonly");
                  }}
                />
              </span>
            </label>
            <button
              className="studio-auth-secondary w-full cursor-pointer rounded-2xl border bg-transparent px-5 py-3.5 text-base font-semibold backdrop-blur-xl transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={pending}
              onClick={() => {
                setPending(true);
                setError("");
                setNotice("");
                const run =
                  step.contact.kind === "email"
                    ? startEmailCode(step.contact.email, true)
                    : startWhatsAppCode(step.contact.phone, true);
                void run
                  .catch((err: unknown) => {
                    setError(friendlyConvexError(err, "Could not send code"));
                  })
                  .finally(() => setPending(false));
              }}
            >
              {step.contact.kind === "email" ? "Get email code" : "Get WhatsApp code"}
            </button>
          </>
        ) : null}

        {isEmailCodeStep ? (
          <>
            <input name="email" value={step.contact.email} type="hidden" />
            <label className="block">
              <span className="sr-only">Code</span>
              <input
                className="studio-auth-field w-full rounded-2xl border bg-transparent px-5 py-4 text-center text-lg font-semibold tracking-[0.28em] outline-none backdrop-blur-xl transition"
                name="code"
                placeholder="00000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
              />
            </label>
            {step.hasPassword ? (
              <button
                className="studio-auth-secondary w-full cursor-pointer rounded-2xl border bg-transparent px-5 py-3.5 text-base font-semibold backdrop-blur-xl transition focus:outline-none"
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setStep({ contact: step.contact, phase: "password" });
                }}
              >
                Enter password
              </button>
            ) : null}
          </>
        ) : null}

        {isWhatsAppCodeStep ? (
          <div className="space-y-2">
            <div className="studio-auth-panel rounded-2xl border bg-transparent p-3 text-center backdrop-blur-xl">
              <div className="flex items-center justify-center gap-2">
                <p className="text-2xl font-semibold tracking-[0.16em]">
                  {formatAuthCode(step.code)}
                </p>
                <button
                  className="studio-auth-link inline-flex cursor-pointer items-center justify-center bg-transparent p-0 transition focus:outline-none"
                  type="button"
                  aria-label="Copy code"
                  title="Copy code"
                  onClick={() => {
                    void navigator.clipboard.writeText(step.code);
                    setNotice("Code copied.");
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="studio-auth-faint mt-1 text-[11px] leading-4">
                {whatsAppExpired
                  ? "Expired"
                  : `Expires in ${formatCountdown(whatsAppTimeLeftSeconds)}`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                className="studio-auth-primary flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none"
                href={step.whatsappUrl}
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
            {step.hasPassword ? (
              <button
                className="studio-auth-secondary w-full cursor-pointer rounded-2xl border bg-transparent px-5 py-3.5 text-base font-semibold backdrop-blur-xl transition focus:outline-none"
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setStep({ contact: step.contact, phase: "password" });
                }}
              >
                Enter password
              </button>
            ) : null}
          </div>
        ) : null}
        {notice ? (
          <p className="studio-auth-notice text-xs">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="studio-auth-error-box rounded-xl border px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}
        {step === "identify" || isPasswordStep || isEmailCodeStep ? (
          <button
            className="studio-auth-primary group flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-semibold shadow-lg shadow-black/20 transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                {step === "identify"
                  ? "Checking account"
                  : isPasswordStep
                    ? "Signing in"
                    : "Continuing"}
              </>
            ) : (
              <>
                {step === "identify" ? "Continue" : isPasswordStep ? "Sign in" : "Continue"}
                <ArrowRight
                  className="h-5 w-5 transition group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </>
            )}
          </button>
        ) : null}
        {step !== "identify" ? (
          <button
            className="studio-auth-link w-full cursor-pointer bg-transparent py-1 text-sm underline-offset-4 transition hover:underline focus:outline-none"
            type="button"
            onClick={resetToIdentify}
          >
            Change account
          </button>
        ) : null}
        {isWhatsAppCodeStep ? (
          <div className="flex items-center justify-center gap-3 text-sm font-medium">
            <button
              className="studio-auth-link cursor-pointer bg-transparent px-1 py-1 underline-offset-4 transition hover:underline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

function detectInputMode(value: string): "email" | "phone" | "mixed" {
  const trimmed = value.trim();
  if (!trimmed) return "mixed";
  if (trimmed.includes("@") || /[a-zA-Z]/.test(trimmed)) return "email";
  return "phone";
}

function contactInputIcon(value: string): "profile" | "email" | "phone" {
  const trimmed = value.trim();
  if (!trimmed) return "profile";
  const mode = detectInputMode(value);
  return mode === "mixed" ? "profile" : mode;
}

function parseContactInput(value: string): IdentifyContact | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    const email = trimmed.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return { kind: "email", email };
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return { kind: "whatsapp", phone: digits };
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
  const appearance = useAppearanceMode();
  const backgrounds = useMemo(
    () => authBackgroundsForAppearance(appearance),
    [appearance],
  );
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const activeBackground = backgrounds[backgroundIndex % backgrounds.length] ?? backgrounds[0];
  const activeTheme = getAuthThemeForBackground(activeBackground);
  const authThemeStyle = {
    "--studio-auth-accent": activeTheme.accent,
    "--studio-auth-accent-rgb": hexToRgbString(activeTheme.accent),
  } as CSSProperties;

  useEffect(() => {
    setBackgroundIndex(0);
  }, [appearance]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setBackgroundIndex((index) => (index + 1) % backgrounds.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [backgrounds]);

  useEffect(() => {
    const next = backgrounds[(backgroundIndex + 1) % backgrounds.length];
    if (!next) return;
    const image = new Image();
    image.decoding = "async";
    image.src = next;
  }, [backgroundIndex, backgrounds]);

  return (
    <main
      className="studio-auth-theme relative flex min-h-dvh items-center justify-center overflow-hidden px-5 py-10"
      data-auth-appearance={appearance}
      style={authThemeStyle}
    >
      <div
        className="absolute inset-0 scale-[1.03] bg-cover bg-center"
        style={{ backgroundImage: `url("${activeBackground}")` }}
        aria-hidden="true"
      />
      <div className="studio-auth-scrim absolute inset-0" aria-hidden="true" />
      <style jsx global>{`
        .studio-auth-theme {
          color: #fff;
          background: #020617;
        }
        .studio-auth-theme[data-auth-appearance="light"] {
          color: #0f172a;
          background: #e8ecf4;
        }
        .studio-auth-theme .studio-auth-scrim {
          background:
            radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.14), transparent 28%),
            linear-gradient(180deg, rgba(5, 7, 12, 0.42), rgba(5, 7, 12, 0.82));
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-scrim {
          background:
            radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.55), transparent 32%),
            linear-gradient(180deg, rgba(232, 236, 244, 0.42), rgba(232, 236, 244, 0.78));
        }
        .studio-auth-theme .studio-auth-card {
          border: 1px solid rgb(255 255 255 / 0.15);
          background: transparent;
          box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.35);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-card {
          border-color: rgb(15 23 42 / 0.12);
          background: color-mix(in srgb, #ffffff 70%, transparent);
          box-shadow:
            0 24px 60px rgb(15 23 42 / 0.12),
            inset 0 1px 0 rgb(255 255 255 / 0.65);
        }
        .studio-auth-theme .studio-auth-accent-text,
        .studio-auth-theme .studio-auth-eyebrow {
          color: rgb(var(--studio-auth-accent-rgb) / 0.72);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-accent-text,
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-eyebrow {
          color: rgb(var(--studio-auth-accent-rgb) / 0.88);
        }
        .studio-auth-theme .studio-auth-field {
          border-color: rgb(255 255 255 / 0.15);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.03);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-field {
          border-color: rgb(15 23 42 / 0.14);
          background: color-mix(in srgb, #ffffff 55%, transparent);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.7);
        }
        .studio-auth-theme .studio-auth-field:focus,
        .studio-auth-theme .studio-auth-field:focus-within {
          border-color: rgb(var(--studio-auth-accent-rgb) / 0.44);
          background: rgb(var(--studio-auth-accent-rgb) / 0.035);
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.04),
            0 0 0 1px rgb(var(--studio-auth-accent-rgb) / 0.16);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-field:focus,
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-field:focus-within {
          background: rgb(var(--studio-auth-accent-rgb) / 0.06);
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.75),
            0 0 0 1px rgb(var(--studio-auth-accent-rgb) / 0.2);
        }
        .studio-auth-theme .studio-auth-field input,
        .studio-auth-theme .studio-auth-field textarea {
          color: inherit;
        }
        .studio-auth-theme .studio-auth-field input::placeholder,
        .studio-auth-theme .studio-auth-field textarea::placeholder,
        .studio-auth-theme input.studio-auth-field::placeholder {
          color: rgb(255 255 255 / 0.32);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-field input::placeholder,
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-field textarea::placeholder,
        .studio-auth-theme[data-auth-appearance="light"] input.studio-auth-field::placeholder {
          color: rgb(15 23 42 / 0.34);
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
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-primary {
          color: #0f172a;
          background: rgb(var(--studio-auth-accent-rgb) / 0.22);
          box-shadow:
            inset 0 1px 0 rgb(255 255 255 / 0.55),
            0 14px 34px rgb(15 23 42 / 0.12),
            0 0 28px rgb(var(--studio-auth-accent-rgb) / 0.16);
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
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-primary:focus-visible,
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-secondary:focus-visible,
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-method:focus-visible {
          box-shadow:
            0 0 0 2px rgb(255 255 255 / 0.95),
            0 0 0 4px rgb(var(--studio-auth-accent-rgb) / 0.34);
        }
        .studio-auth-theme .studio-auth-secondary {
          border-color: rgb(255 255 255 / 0.15);
          color: rgb(255 255 255 / 0.75);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-secondary {
          border-color: rgb(15 23 42 / 0.14);
          color: rgb(15 23 42 / 0.72);
          background: color-mix(in srgb, #ffffff 45%, transparent);
        }
        .studio-auth-theme .studio-auth-secondary:hover,
        .studio-auth-theme .studio-auth-method:hover {
          border-color: rgb(var(--studio-auth-accent-rgb) / 0.34);
          background: rgb(var(--studio-auth-accent-rgb) / 0.06);
          color: rgb(255 255 255 / 0.88);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-secondary:hover,
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-method:hover {
          color: rgb(15 23 42 / 0.9);
        }
        .studio-auth-theme .studio-auth-method.is-active {
          border: 1px solid rgb(var(--studio-auth-accent-rgb) / 0.32);
          background: rgb(var(--studio-auth-accent-rgb) / 0.12);
          color: #fff;
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-method.is-active {
          color: #0f172a;
        }
        .studio-auth-theme .studio-auth-notice {
          color: rgb(255 255 255 / 0.58);
          min-height: 1rem;
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-notice {
          color: rgb(15 23 42 / 0.55);
        }
        .studio-auth-theme .studio-auth-copy { color: rgb(255 255 255 / 0.7); }
        .studio-auth-theme .studio-auth-label { color: rgb(255 255 255 / 0.55); }
        .studio-auth-theme .studio-auth-icon { color: rgb(255 255 255 / 0.45); }
        .studio-auth-theme .studio-auth-link { color: rgb(255 255 255 / 0.55); }
        .studio-auth-theme .studio-auth-link:hover { color: #fff; }
        .studio-auth-theme .studio-auth-faint { color: rgb(255 255 255 / 0.38); }
        .studio-auth-theme .studio-auth-panel {
          border-color: rgb(255 255 255 / 0.15);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.03);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-copy { color: rgb(15 23 42 / 0.68); }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-label { color: rgb(15 23 42 / 0.52); }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-icon { color: rgb(15 23 42 / 0.42); }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-link { color: rgb(15 23 42 / 0.55); }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-link:hover { color: #0f172a; }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-faint { color: rgb(15 23 42 / 0.4); }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-panel {
          border-color: rgb(15 23 42 / 0.12);
          background: color-mix(in srgb, #ffffff 55%, transparent);
        }
        .studio-auth-theme .studio-auth-error {
          color: rgb(254 202 202);
        }
        .studio-auth-theme .studio-auth-error-box {
          border-color: rgb(248 113 113 / 0.2);
          background: rgb(239 68 68 / 0.1);
          color: rgb(254 226 226);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-error {
          color: rgb(185 28 28);
        }
        .studio-auth-theme[data-auth-appearance="light"] .studio-auth-error-box {
          border-color: rgb(185 28 28 / 0.22);
          background: rgb(254 226 226 / 0.65);
          color: rgb(153 27 27);
        }
      `}</style>
      <section className="studio-auth-card relative w-full max-w-[372px] rounded-[2rem] p-5 text-center backdrop-blur-3xl sm:p-6">
        <div className="flex flex-col items-center justify-center gap-3">
          <BrandMark size={64} subtle appearance={appearance} />
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

  // Progressive formatting: do not force `)` / spaces the user just deleted.
  // Closing paren appears only once a 4th digit is typed.
  if (!digits) return "";
  if (digits.length <= 3) return `+1 (${area}`;
  if (digits.length <= 6) return `+1 (${area}) ${prefix}`;
  return `+1 (${area}) ${prefix}-${line}`;
}
