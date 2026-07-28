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
import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { StudioBootLoader } from "@/components/studio-boot-loader";
import {
  claimPaintBoot,
  dismissPaintBoot,
} from "@/components/studio-paint-boot-control";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { SCHEMES } from "@/mos-app/theme.js";
import { markPerfMilestone } from "@/lib/performance";
import {
  resetStudioClient,
  studioResetHref,
} from "@/studio/lib/studio-client-reset";
import {
  STUDIO_DEFAULT_TAB_LABELS,
  STUDIO_START_SELLER_APPLY_KEY,
  readStoredStudioDefaultTab,
  writeStoredStudioDefaultTab,
  type StudioDefaultTab,
} from "@/studio/lib/studio-default-tab";
import { StudioLandingPage } from "@/studio/components/StudioLandingPage";
import { MobileBackStackHost } from "@/studio/components/MobileBackStackHost";

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

const WHATSAPP_CODE_TTL_MS = 2 * 60 * 1000;
const AUTH_ACCENT = SCHEMES.agent?.accent ?? "#22c55e";

function hexToRgbString(hex: string) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)} ${parseInt(value.slice(2, 4), 16)} ${parseInt(value.slice(4, 6), 16)}`;
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
  const shellReadyRef = useRef(false);
  const paintBootClaimedRef = useRef(false);

  const markShellReady = useCallback(() => {
    if (shellReadyRef.current) return;
    shellReadyRef.current = true;
    setShellReady(true);
  }, []);

  const markShellFailed = useCallback(() => {
    setShellFailed(true);
  }, []);

  useEffect(() => {
    // Keep layout PaintBoot mounted — claim so it doesn't auto-dismiss.
    claimPaintBoot();
    paintBootClaimedRef.current = true;
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
  const [showAuthForm, setShowAuthForm] = useState(false);

  useEffect(() => {
    if (!showSignInScreen) setShowAuthForm(false);
  }, [showSignInScreen]);

  const showCompleteAccount =
    Boolean(auth?.isAuthenticated) &&
    currentUser != null &&
    !currentUser.accountComplete;
  const needsStudioIntent =
    Boolean(auth?.isAuthenticated) &&
    currentUser != null &&
    Boolean(currentUser.accountComplete) &&
    !currentUser.studioIntentChosen;
  const showShell =
    Boolean(auth?.isAuthenticated) &&
    currentUser != null &&
    Boolean(currentUser.accountComplete) &&
    Boolean(currentUser.studioIntentChosen);

  const setDefaultStudioTab = useMutation(api.users.setDefaultStudioTab);
  const [intentBackfilling, setIntentBackfilling] = useState(false);
  const [intentGateReady, setIntentGateReady] = useState(false);
  const [showIntentChooser, setShowIntentChooser] = useState(false);
  const intentHandledRef = useRef(false);

  // Existing users already have a workspace session — skip the chooser silently.
  // Brand-new accounts (no tab session) see the first-run intent picker.
  useEffect(() => {
    if (!needsStudioIntent) {
      intentHandledRef.current = false;
      setIntentGateReady(true);
      setShowIntentChooser(false);
      return;
    }
    if (intentHandledRef.current) return;
    intentHandledRef.current = true;
    try {
      const hasTabs = Boolean(
        window.localStorage.getItem("yatishara-studio-open-tabs-v1"),
      );
      if (hasTabs) {
        setIntentBackfilling(true);
        setShowIntentChooser(false);
        const tab = readStoredStudioDefaultTab() ?? "composer";
        writeStoredStudioDefaultTab(tab);
        void setDefaultStudioTab({ tab, markIntentChosen: true })
          .catch(() => {
            intentHandledRef.current = false;
          })
          .finally(() => {
            setIntentBackfilling(false);
            setIntentGateReady(true);
          });
        return;
      }
      setShowIntentChooser(true);
      setIntentGateReady(true);
    } catch {
      setShowIntentChooser(true);
      setIntentGateReady(true);
    }
  }, [needsStudioIntent, setDefaultStudioTab]);

  // Drive the single layout PaintBoot overlay across auth → user → shell-chunk.
  // Do not mount a second StudioBootLoader here — that remount restarted the spin.
  const bootNeeded =
    !shellFailed &&
    !showSignInScreen &&
    !showCompleteAccount &&
    !showIntentChooser &&
    (authPending ||
      userPending ||
      intentBackfilling ||
      (needsStudioIntent && !intentGateReady) ||
      (showShell && !shellReady));

  useEffect(() => {
    if (!paintBootClaimedRef.current) return;
    if (bootNeeded) claimPaintBoot();
    else dismissPaintBoot();
  }, [bootNeeded]);

  return (
    <>
      <MobileBackStackHost />
      {showSignInScreen ? (
        showAuthForm ? (
          <StudioSignIn onBack={() => setShowAuthForm(false)} />
        ) : (
          <StudioLandingPage onSignIn={() => setShowAuthForm(true)} />
        )
      ) : null}
      {showCompleteAccount ? <StudioCompleteAccount currentUser={currentUser} /> : null}
      {showIntentChooser ? <StudioIntentChooser /> : null}
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

function StudioIntentChooser() {
  const setDefaultStudioTab = useMutation(api.users.setDefaultStudioTab);
  const [pending, setPending] = useState<StudioDefaultTab | "sell" | null>(null);
  const [error, setError] = useState("");

  async function choose(tab: StudioDefaultTab, startSeller = false) {
    setPending(startSeller ? "sell" : tab);
    setError("");
    try {
      writeStoredStudioDefaultTab(tab);
      if (startSeller) {
        window.localStorage.setItem(STUDIO_START_SELLER_APPLY_KEY, "1");
      }
      // Seed first open so boot lands on the chosen tab.
      window.localStorage.removeItem("yatishara-studio-open-tabs-v1");
      await setDefaultStudioTab({ tab, markIntentChosen: true });
    } catch (err: unknown) {
      setError(friendlyConvexError(err, "Could not save your choice"));
      setPending(null);
    }
  }

  const options: Array<{
    id: StudioDefaultTab | "sell";
    title: string;
    body: string;
    tab: StudioDefaultTab;
    startSeller?: boolean;
  }> = [
    {
      id: "network",
      title: "Hire / marketplace",
      body: "Browse Creative Network and book verified creators.",
      tab: "network",
    },
    {
      id: "composer",
      title: "Create media",
      body: "Jump into Generate and make images, video, or audio.",
      tab: "composer",
    },
    {
      id: "feed",
      title: "Social",
      body: "See what people are posting on the Feed.",
      tab: "feed",
    },
    {
      id: "sell",
      title: "Sell services",
      body: "Open Creative Network and start seller registration.",
      tab: "network",
      startSeller: true,
    },
  ];

  return (
    <AuthFrame eyebrow="Yatishara Studio" title="What brings you here?">
      <p className="studio-auth-copy mt-3 text-sm">
        Pick a starting point. You can change your default tab anytime in Settings → General.
      </p>
      <div className="studio-auth-form">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="studio-auth-field is-stack disabled:opacity-60"
            disabled={pending != null}
            onClick={() => void choose(option.tab, Boolean(option.startSeller))}
          >
            <span className="studio-auth-choice-title">
              {option.title}
              {pending === option.id || (option.startSeller && pending === "sell")
                ? "…"
                : ""}
            </span>
            <span className="studio-auth-choice-body">{option.body}</span>
            <span className="studio-auth-choice-meta">
              Opens {STUDIO_DEFAULT_TAB_LABELS[option.tab]}
              {option.startSeller ? " · seller signup" : ""}
            </span>
          </button>
        ))}
      </div>
      {error ? <p className="studio-auth-error mt-3 text-sm">{error}</p> : null}
    </AuthFrame>
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
        className="studio-auth-form"
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
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="block">
            <span className="studio-auth-label">First name</span>
            <span className="studio-auth-field">
              <UserRound className="studio-auth-icon" aria-hidden="true" />
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                autoComplete="given-name"
                required
              />
            </span>
          </label>
          <label className="block">
            <span className="studio-auth-label">Last name</span>
            <span className="studio-auth-field">
              <UserRound className="studio-auth-icon" aria-hidden="true" />
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                autoComplete="family-name"
                required
              />
            </span>
          </label>
        </div>
        <label className="block">
          <span className="studio-auth-label">
            Email{missingEmail ? " (required)" : ""}
          </span>
          <span className={`studio-auth-field${!missingEmail ? " opacity-70" : ""}`}>
            <Mail className="studio-auth-icon" aria-hidden="true" />
            <input
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
        <label className="block">
          <span className="studio-auth-label">
            Phone / WhatsApp{missingPhone ? " (required)" : ""}
          </span>
          <span className={`studio-auth-field${!missingPhone ? " opacity-70" : ""}`}>
            <Phone className="studio-auth-icon" aria-hidden="true" />
            <input
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
          className="studio-auth-primary"
          disabled={pending || !canContinue}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Continue to Studio
        </button>
        <button
          type="button"
          className="studio-auth-link w-full py-1 text-center underline-offset-2 hover:underline"
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

function StudioSignIn({ onBack }: { onBack?: () => void } = {}) {
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
      onBack={onBack && step === "identify" ? onBack : undefined}
    >
      <form
        className="studio-auth-form"
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
          <label className="block">
            <span className="studio-auth-label">Email or WhatsApp</span>
            <span className="studio-auth-field">
              {contactInputIcon(identifierInput) === "email" ? (
                <Mail className="studio-auth-accent-text" aria-hidden="true" />
              ) : contactInputIcon(identifierInput) === "phone" ? (
                <Phone className="studio-auth-accent-text" aria-hidden="true" />
              ) : (
                <UserRound className="studio-auth-accent-text" aria-hidden="true" />
              )}
              <input
                name="identifier"
                placeholder="you@email.com or number"
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
            <label className="block">
              <span className="studio-auth-label">Password</span>
              <span className="studio-auth-field">
                <Lock className="studio-auth-accent-text" aria-hidden="true" />
                <input
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
              className="studio-auth-secondary"
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
              <span className="studio-auth-label">Code</span>
              <input
                className="studio-auth-field is-code"
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
                className="studio-auth-secondary"
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
          <>
            <div className="studio-auth-panel p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <p className="m-0 text-xl font-semibold tracking-[0.14em]">
                  {formatAuthCode(step.code)}
                </p>
                <button
                  className="studio-auth-link inline-flex cursor-pointer items-center justify-center p-0 transition focus:outline-none"
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
                className="studio-auth-primary"
                href={step.whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsAppIcon className="h-4 w-4" />
                Open WhatsApp
              </a>
              <button
                className="studio-auth-primary"
                type="submit"
                disabled={pending || whatsAppExpired}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
            {step.hasPassword ? (
              <button
                className="studio-auth-secondary"
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
        {notice ? <p className="studio-auth-notice">{notice}</p> : null}
        {error ? <p className="studio-auth-error-box">{error}</p> : null}
        {step === "identify" || isPasswordStep || isEmailCodeStep ? (
          <button
            className="studio-auth-primary"
            type="submit"
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {step === "identify"
                  ? "Checking account"
                  : isPasswordStep
                    ? "Signing in"
                    : "Continuing"}
              </>
            ) : (
              <>
                {step === "identify" ? "Continue" : isPasswordStep ? "Sign in" : "Continue"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        ) : null}
        {step !== "identify" ? (
          <button
            className="studio-auth-link w-full cursor-pointer py-1 text-center underline-offset-4 transition hover:underline focus:outline-none"
            type="button"
            onClick={resetToIdentify}
          >
            Change account
          </button>
        ) : null}
        {isWhatsAppCodeStep ? (
          <div className="flex items-center justify-center">
            <button
              className="studio-auth-link cursor-pointer px-1 py-1 underline-offset-4 transition hover:underline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
  onBack,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  onBack?: () => void;
}) {
  const authThemeStyle = {
    "--studio-auth-accent": AUTH_ACCENT,
    "--studio-auth-accent-rgb": hexToRgbString(AUTH_ACCENT),
  } as CSSProperties;

  return (
    <main
      className="studio-auth-theme relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 sm:px-5 sm:py-10"
      data-auth-appearance="light"
      style={authThemeStyle}
    >
      <style jsx global>{`
        /* Light opaque Studio sheet — no wallpaper glass (matches settings / KYC panes). */
        .studio-auth-theme {
          color: var(--mos-text, #111118);
          background: var(--mos-page, #f5f5f7);
        }
        .studio-auth-card {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft, #d4d4da) 82%, transparent);
          border-radius: 18px;
          background: var(--mos-plate, #ececf0);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.72),
            0 1px 2px rgba(15, 23, 42, 0.05),
            0 12px 28px rgba(15, 23, 42, 0.08);
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
        .studio-auth-title {
          margin: 0;
          color: var(--mos-text, #111118);
          font-size: 1.375rem;
          font-weight: 650;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .studio-auth-form {
          display: grid;
          gap: 10px;
          margin-top: 1.25rem;
          text-align: left;
        }
        .studio-auth-accent-text,
        .studio-auth-eyebrow {
          color: rgb(var(--studio-auth-accent-rgb) / 0.9);
        }
        .studio-auth-eyebrow {
          margin: 0;
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .studio-auth-field {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 36px;
          width: 100%;
          padding: 0 12px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft, #d4d4da) 90%, transparent);
          border-radius: 10px;
          background: var(--mos-surface, #ffffff);
          box-shadow: none;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          transition:
            border-color 0.14s ease,
            background 0.14s ease;
        }
        .studio-auth-field.is-stack {
          flex-direction: column;
          align-items: stretch;
          gap: 4px;
          min-height: 0;
          padding: 10px 12px;
          text-align: left;
        }
        .studio-auth-field.is-code {
          justify-content: center;
          min-height: 44px;
          padding: 0 14px;
          font-size: 1.05rem;
          font-weight: 650;
          letter-spacing: 0.22em;
          text-align: center;
        }
        .studio-auth-field:focus,
        .studio-auth-field:focus-within {
          border-color: color-mix(in srgb, var(--studio-auth-accent) 45%, var(--color-cursor-border-soft, #d4d4da));
          background: color-mix(in srgb, var(--studio-auth-accent) 5%, var(--mos-surface, #ffffff));
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--studio-auth-accent) 16%, transparent);
        }
        .studio-auth-field input,
        .studio-auth-field textarea,
        input.studio-auth-field {
          min-width: 0;
          flex: 1 1 auto;
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
          outline: none;
        }
        .studio-auth-field input::placeholder,
        .studio-auth-field textarea::placeholder,
        input.studio-auth-field::placeholder {
          color: color-mix(in srgb, var(--mos-text, #111118) 38%, transparent);
          font-weight: 450;
        }
        .studio-auth-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 36px;
          width: 100%;
          padding: 0 14px;
          border: 1px solid color-mix(in srgb, var(--studio-auth-accent) 40%, transparent);
          border-radius: 10px;
          background: color-mix(in srgb, var(--studio-auth-accent) 18%, var(--mos-surface, #fff));
          color: var(--mos-text, #111118);
          font-size: 13px;
          font-weight: 650;
          box-shadow: none;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .studio-auth-primary:hover {
          border-color: color-mix(in srgb, var(--studio-auth-accent) 55%, transparent);
          background: color-mix(in srgb, var(--studio-auth-accent) 26%, var(--mos-surface, #fff));
        }
        .studio-auth-primary:focus-visible,
        .studio-auth-secondary:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--studio-auth-accent) 28%, transparent);
        }
        .studio-auth-primary:disabled,
        .studio-auth-secondary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .studio-auth-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 36px;
          width: 100%;
          padding: 0 14px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft, #d4d4da) 90%, transparent);
          border-radius: 10px;
          background: var(--mos-plate-strong, #d4d4da);
          color: color-mix(in srgb, var(--mos-text, #111118) 78%, transparent);
          font-size: 13px;
          font-weight: 600;
          box-shadow: none;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .studio-auth-secondary:hover {
          border-color: color-mix(in srgb, var(--studio-auth-accent) 35%, var(--color-cursor-border-soft, #d4d4da));
          color: var(--mos-text, #111118);
        }
        .studio-auth-notice {
          min-height: 1rem;
          margin: 0;
          color: color-mix(in srgb, var(--mos-text, #111118) 55%, transparent);
          font-size: 12px;
          text-align: center;
        }
        .studio-auth-copy {
          margin: 0.65rem 0 0;
          color: color-mix(in srgb, var(--mos-text, #111118) 68%, transparent);
          font-size: 13px;
          line-height: 1.4;
          text-align: left;
        }
        .studio-auth-label {
          display: block;
          margin: 0 0 5px;
          color: color-mix(in srgb, var(--mos-text, #111118) 52%, transparent);
          font-size: 11px;
          font-weight: 650;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .studio-auth-icon,
        .studio-auth-accent-text {
          flex: 0 0 auto;
          width: 16px;
          height: 16px;
        }
        .studio-auth-icon {
          color: color-mix(in srgb, var(--mos-text, #111118) 42%, transparent);
        }
        .studio-auth-link {
          color: color-mix(in srgb, var(--mos-text, #111118) 55%, transparent);
          font-size: 12px;
          font-weight: 500;
          background: transparent;
          border: 0;
        }
        .studio-auth-link:hover {
          color: var(--mos-text, #111118);
        }
        .studio-auth-faint {
          color: color-mix(in srgb, var(--mos-text, #111118) 42%, transparent);
        }
        .studio-auth-panel {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft, #d4d4da) 90%, transparent);
          border-radius: 12px;
          background: var(--mos-surface, #ffffff);
          box-shadow: none;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
        .studio-auth-error {
          color: #b91c1c;
        }
        .studio-auth-error-box {
          margin: 0;
          padding: 10px 12px;
          border: 1px solid rgb(185 28 28 / 0.22);
          border-radius: 10px;
          background: rgb(254 226 226 / 0.72);
          color: #991b1b;
          font-size: 12px;
          line-height: 1.35;
        }
        .studio-auth-choice-title {
          color: var(--mos-text, #111118);
          font-size: 13px;
          font-weight: 650;
        }
        .studio-auth-choice-body {
          color: color-mix(in srgb, var(--mos-text, #111118) 62%, transparent);
          font-size: 12px;
          line-height: 1.35;
        }
        .studio-auth-choice-meta {
          color: color-mix(in srgb, var(--mos-text, #111118) 45%, transparent);
          font-size: 11px;
        }
      `}</style>
      <section className="studio-auth-card relative w-full max-w-[380px] p-5 text-center sm:p-6">
        {onBack ? (
          <button
            type="button"
            className="studio-auth-link mb-2 w-full cursor-pointer py-1 text-left underline-offset-4 transition hover:underline focus:outline-none"
            onClick={onBack}
          >
            ← Back
          </button>
        ) : null}
        <div className="flex flex-col items-center justify-center gap-2.5">
          <BrandMark size={48} subtle appearance="light" />
          <p className="studio-auth-eyebrow">{eyebrow}</p>
        </div>
        <div className="mt-3">
          <h1 className="studio-auth-title">{title}</h1>
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
