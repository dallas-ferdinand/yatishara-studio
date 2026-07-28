"use client";

import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
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
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { markPerfMilestone } from "@/lib/performance";
import {
  resetStudioClient,
  studioResetHref,
} from "@/studio/lib/studio-client-reset";
import {
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

/** Landing ink — no agent/green accent on the public auth sheet. */
const AUTH_ACCENT = "#1c1c1e";

function hexToRgbString(hex: string) {
  const value = hex.replace("#", "");
  return `${parseInt(value.slice(0, 2), 16)} ${parseInt(value.slice(2, 4), 16)} ${parseInt(value.slice(4, 6), 16)}`;
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
        <StudioLandingPage
          authOpen={showAuthForm}
          onSignIn={() => setShowAuthForm(true)}
          onCloseAuth={() => setShowAuthForm(false)}
          authSlot={showAuthForm ? <StudioSignIn embedded /> : null}
        />
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
    tab: StudioDefaultTab;
    image: string;
    startSeller?: boolean;
  }> = [
    {
      id: "network",
      title: "Hire creators",
      tab: "network",
      image: "/landing/intent/intent-hire.webp",
    },
    {
      id: "composer",
      title: "Create media",
      tab: "composer",
      image: "/landing/intent/intent-create.webp",
    },
    {
      id: "feed",
      title: "Social feed",
      tab: "feed",
      image: "/landing/intent/intent-feed.webp",
    },
    {
      id: "sell",
      title: "Sell services",
      tab: "network",
      image: "/landing/intent/intent-sell.webp",
      startSeller: true,
    },
  ];

  return (
    <AuthFrame title="What brings you here?" wide>
      <div className="studio-auth-choices is-grid" role="list">
        {options.map((option) => {
          const isPending =
            pending === option.id ||
            (option.startSeller && pending === "sell");
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={`studio-auth-choice-tile${isPending ? " is-pending" : ""}`}
              disabled={pending != null}
              onClick={() => void choose(option.tab, Boolean(option.startSeller))}
              style={{ "--studio-auth-choice-image": `url(${option.image})` } as CSSProperties}
            >
              <span className="studio-auth-choice-tile-media" aria-hidden="true" />
              <span className="studio-auth-choice-tile-mask" aria-hidden="true" />
              <span className="studio-auth-choice-tile-label">
                {isPending ? (
                  <Loader2 className="studio-auth-choice-tile-spinner animate-spin" aria-hidden="true" />
                ) : null}
                {option.title}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="studio-auth-error-box mt-3">{error}</p> : null}
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
    <AuthFrame title="Finish your account">
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
            <span className="studio-auth-field">
              <UserRound className="studio-auth-icon" aria-hidden="true" />
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                aria-label="First name"
                autoComplete="given-name"
                required
              />
            </span>
          </label>
          <label className="block">
            <span className="studio-auth-field">
              <UserRound className="studio-auth-icon" aria-hidden="true" />
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                aria-label="Last name"
                autoComplete="family-name"
                required
              />
            </span>
          </label>
        </div>
        <label className="block">
          <span className={`studio-auth-field${!missingEmail ? " opacity-70" : ""}`}>
            <Mail className="studio-auth-icon" aria-hidden="true" />
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              aria-label="Email"
              type="email"
              required
              disabled={!missingEmail}
              autoComplete="email"
            />
          </span>
        </label>
        <label className="block">
          <span className={`studio-auth-field${!missingPhone ? " opacity-70" : ""}`}>
            <Phone className="studio-auth-icon" aria-hidden="true" />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone (for checkout)"
              aria-label="Phone number for checkout"
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

function StudioSignIn({
  onBack,
  embedded = false,
}: {
  onBack?: () => void;
  /** When true, fill landing content stage (chrome stays). */
  embedded?: boolean;
} = {}) {
  const { signIn } = useAuthActions();
  const convex = useConvex();
  const [step, setStep] = useState<
    | "identify"
    | { email: string; phase: "password" }
    | { email: string; phase: "email-code"; hasPassword: boolean }
  >("identify");
  const [emailInput, setEmailInput] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  const isEmailCodeStep = step !== "identify" && step.phase === "email-code";
  const isPasswordStep = step !== "identify" && step.phase === "password";

  const resetToIdentify = () => {
    setError("");
    setNotice("");
    setStep("identify");
  };

  const startEmailCode = async (email: string, hasPassword = false) => {
    await signIn("resend-otp", { email });
    setStep({ email, phase: "email-code", hasPassword });
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <AuthFrame
      embedded={embedded}
      title={
        step === "identify"
          ? "Welcome back"
          : isEmailCodeStep
            ? "Check your email"
            : "Sign in"
      }
      onBack={
        embedded || !onBack || step !== "identify" ? undefined : onBack
      }
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
            const email = normalizeEmail(emailInput);
            if (!email) {
              setError("Enter a valid email address");
              setPending(false);
              return;
            }
            void convex
              .query(api.passwordAuth.signInOptions, { email })
              .then(async (options) => {
                if (!options.hasPassword) {
                  await startEmailCode(email);
                  return;
                }
                setStep({ email, phase: "password" });
              })
              .catch((err: unknown) => {
                setError(friendlyConvexError(err, "Sign-in failed"));
              })
              .finally(() => setPending(false));
            return;
          }

          if (isPasswordStep) {
            const password = String(formData.get("password") ?? "");
            void signIn("password", {
              flow: "signIn",
              email: step.email,
              password,
            })
              .catch((err: unknown) => {
                setError(friendlyConvexError(err, "Wrong email or password"));
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

          setPending(false);
        }}
      >
        {step === "identify" ? (
          <label className="block">
            <span className="studio-auth-field">
              <Mail className="studio-auth-accent-text" aria-hidden="true" />
              <input
                name="email"
                placeholder="you@email.com"
                aria-label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                required
              />
            </span>
          </label>
        ) : null}

        {isPasswordStep ? (
          <>
            <p className="studio-auth-copy m-0 text-center text-[13px]">
              Signing in as <strong>{step.email}</strong>
            </p>
            <label className="block">
              <span className="studio-auth-field">
                <Lock className="studio-auth-accent-text" aria-hidden="true" />
                <input
                  name="password"
                  placeholder="Password"
                  aria-label="Password"
                  type="password"
                  autoComplete="current-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  required
                  autoFocus
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
                void startEmailCode(step.email, true)
                  .catch((err: unknown) => {
                    setError(friendlyConvexError(err, "Could not send code"));
                  })
                  .finally(() => setPending(false));
              }}
            >
              Email me a code instead
            </button>
          </>
        ) : null}

        {isEmailCodeStep ? (
          <div className="studio-auth-email-panel">
            <div className="studio-auth-email-badge" aria-hidden="true">
              <Mail className="h-5 w-5" strokeWidth={2} />
            </div>
            <p className="studio-auth-email-lead">
              We sent a sign-in code to
            </p>
            <p className="studio-auth-email-address">{step.email}</p>
            <input name="email" value={step.email} type="hidden" />
            <label className="block w-full">
              <input
                className="studio-auth-field is-code is-email-otp"
                name="code"
                placeholder="••••••"
                aria-label="Email code"
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
                  setStep({ email: step.email, phase: "password" });
                }}
              >
                Enter password
              </button>
            ) : null}
          </div>
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
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <>
                {isEmailCodeStep ? "Continue" : step === "identify" ? "Continue" : "Sign in"}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        ) : null}
        {step !== "identify" ? (
          <button
            type="button"
            className="studio-auth-link w-full cursor-pointer py-1 text-center underline-offset-4 transition hover:underline focus:outline-none"
            onClick={resetToIdentify}
          >
            Use a different email
          </button>
        ) : null}
        {isEmailCodeStep ? (
          <button
            type="button"
            className="studio-auth-link cursor-pointer px-1 py-1 underline-offset-4 transition hover:underline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            onClick={() => {
              setPending(true);
              setError("");
              setNotice("");
              void startEmailCode(step.email, step.hasPassword)
                .then(() => setNotice("New code sent."))
                .catch((err: unknown) => {
                  setError(friendlyConvexError(err, "Could not resend code"));
                })
                .finally(() => setPending(false));
            }}
          >
            Resend code
          </button>
        ) : null}
      </form>
    </AuthFrame>
  );
}

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function AuthFrame({
  title,
  children,
  onBack,
  embedded = false,
  wide = false,
}: {
  title: string;
  children?: ReactNode;
  onBack?: () => void;
  /** Fill parent stage instead of owning the full viewport. */
  embedded?: boolean;
  /** Wider sheet for multi-line choice lists. */
  wide?: boolean;
}) {
  const wrapperRef = useRef<HTMLElement | null>(null);
  const authThemeStyle = {
    "--studio-auth-accent": AUTH_ACCENT,
    "--studio-auth-accent-rgb": hexToRgbString(AUTH_ACCENT),
  } as CSSProperties;
  const Wrapper = embedded ? "div" : "main";

  // Mobile: keep the form above the OS keyboard (and landing bottom nav).
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const host =
      (wrapper.closest(".studio-landing") as HTMLElement | null) ?? wrapper;

    let rafId = 0;
    let lastInset = -1;
    let scrollTimer = 0;

    const isMobile = () => window.matchMedia("(max-width: 979px)").matches;

    const syncKeyboardInset = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const vv = window.visualViewport;
        let inset = 0;
        if (isMobile() && vv) {
          const raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
          inset = raw < 6 ? 0 : Math.round(raw);
        }
        if (inset === lastInset) return;
        lastInset = inset;
        host.style.setProperty("--studio-auth-keyboard-inset", `${inset}px`);
        if (inset > 0) host.setAttribute("data-keyboard-open", "1");
        else host.removeAttribute("data-keyboard-open");
      });
    };

    const scrollFocusedIntoView = () => {
      if (!isMobile()) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !wrapper.contains(active)) return;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollTimer = 0;
        const submit = wrapper.querySelector<HTMLElement>(".studio-auth-primary");
        const target =
          active.closest(".studio-auth-field, .studio-auth-email-panel") ?? active;
        target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
        if (submit) {
          window.setTimeout(() => {
            submit.scrollIntoView({
              block: "nearest",
              inline: "nearest",
              behavior: "smooth",
            });
          }, 80);
        }
      }, 140);
    };

    syncKeyboardInset();
    window.visualViewport?.addEventListener("resize", syncKeyboardInset);
    window.visualViewport?.addEventListener("scroll", syncKeyboardInset);
    window.addEventListener("resize", syncKeyboardInset);
    wrapper.addEventListener("focusin", scrollFocusedIntoView);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      window.visualViewport?.removeEventListener("resize", syncKeyboardInset);
      window.visualViewport?.removeEventListener("scroll", syncKeyboardInset);
      window.removeEventListener("resize", syncKeyboardInset);
      wrapper.removeEventListener("focusin", scrollFocusedIntoView);
      host.style.removeProperty("--studio-auth-keyboard-inset");
      host.removeAttribute("data-keyboard-open");
    };
  }, []);

  return (
    <Wrapper
      ref={(node) => {
        wrapperRef.current = node;
      }}
      className={
        embedded
          ? "studio-auth-theme studio-auth-embedded relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-auto px-4 py-6 sm:px-5 sm:py-8"
          : "studio-auth-theme relative flex min-h-dvh items-center justify-center overflow-auto px-4 py-8 sm:px-5 sm:py-10"
      }
      data-appearance="light"
      data-auth-appearance="light"
      style={authThemeStyle}
    >
      <style jsx global>{`
        /* Light opaque Studio sheet — pin LIGHT_BASE tokens so document dark mode
           cannot leak into --mos-* (var() fallbacks only apply when unset). */
        .studio-auth-theme {
          --mos-page: #f5f5f7;
          --mos-panel: #f5f5f7;
          --mos-plate: #ececf0;
          --mos-plate-strong: #d4d4da;
          --mos-bg: #ececf0;
          --mos-surface: #f0f0f3;
          --mos-raised: #d4d4da;
          --mos-text: #1c1c1e;
          --mos-text-soft: #4a4a4e;
          --mos-text-bright: #1c1c1e;
          --mos-muted: #636366;
          --mos-faint: #8e8e93;
          --mos-hover: #e6e6ec;
          --mos-active: #c8c8d0;
          --mos-border: rgba(0, 0, 0, 0.11);
          --mos-border-soft: rgba(0, 0, 0, 0.075);
          --color-cursor-border-soft: rgba(0, 0, 0, 0.075);
          --color-cursor-border: rgba(0, 0, 0, 0.11);
          --color-cursor-text: #1c1c1e;
          --color-cursor-muted: #636366;
          --color-cursor-bg: #f5f5f7;
          color: #1c1c1e;
          background: #f5f5f7;
          color-scheme: light;
        }
        /* Standalone auth: clear the keyboard on mobile. */
        @media (max-width: 979px) {
          main.studio-auth-theme {
            overflow: auto;
            padding-bottom: max(2rem, var(--studio-auth-keyboard-inset, 0px));
          }
          main.studio-auth-theme[data-keyboard-open="1"] {
            align-items: flex-end;
          }
        }
        .studio-auth-card {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 68%, transparent);
          border-radius: 28px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.22)),
            var(--mos-plate);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.88),
            0 1px 2px rgba(15, 23, 42, 0.04),
            0 18px 42px rgba(15, 23, 42, 0.09);
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
        .studio-auth-title {
          margin: 0;
          color: var(--mos-text);
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.15;
        }
        .studio-auth-form {
          display: grid;
          gap: 12px;
          margin-top: 1.35rem;
          text-align: left;
        }
        .studio-auth-accent-text {
          color: color-mix(in srgb, #1c1c1e 42%, transparent);
        }
        .studio-auth-field {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 48px;
          width: 100%;
          padding: 0 18px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 86%, transparent);
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          transition:
            border-color 0.14s ease,
            background 0.14s ease,
            box-shadow 0.14s ease;
        }
        .studio-auth-field.is-stack {
          flex-direction: column;
          align-items: stretch;
          gap: 4px;
          min-height: 0;
          padding: 12px 18px;
          border-radius: 22px;
          text-align: left;
        }
        .studio-auth-field.is-code {
          justify-content: center;
          min-height: 48px;
          padding: 0 18px;
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-align: center;
        }
        .studio-auth-field.is-code.is-email-otp {
          min-height: 58px;
          border-radius: 20px;
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: 0.36em;
          background: #ffffff;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .studio-auth-email-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          width: 100%;
          margin: 2px 0 4px;
          padding: 22px 18px 18px;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 78%, transparent);
          border-radius: 26px;
          background:
            linear-gradient(165deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.68) 55%, rgba(245, 245, 247, 0.9)),
            var(--mos-plate);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 14px 34px rgba(15, 23, 42, 0.07);
          text-align: center;
        }
        .studio-auth-email-badge {
          display: grid;
          place-items: center;
          width: 56px;
          height: 56px;
          border-radius: 20px;
          background: color-mix(in srgb, #1c1c1e 7%, #ffffff);
          color: #1c1c1e;
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.8),
            0 6px 16px rgba(15, 23, 42, 0.06);
        }
        .studio-auth-email-lead {
          margin: 2px 0 0;
          color: color-mix(in srgb, var(--mos-text) 55%, transparent);
          font-size: 13px;
          line-height: 1.35;
        }
        .studio-auth-email-address {
          margin: 0 0 6px;
          color: var(--mos-text);
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.02em;
          word-break: break-word;
        }
        .studio-auth-field:focus,
        .studio-auth-field:focus-within {
          border-color: color-mix(in srgb, #1c1c1e 28%, transparent);
          background: #ffffff;
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, #1c1c1e 12%, transparent);
        }
        .studio-auth-field input,
        .studio-auth-field textarea,
        input.studio-auth-field {
          min-width: 0;
          flex: 1 1 auto;
          width: 100%;
          height: 18px;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
          color: inherit;
          font-size: 14px;
          font-weight: 500;
          line-height: 18px;
          outline: none;
        }
        .studio-auth-field input::placeholder,
        .studio-auth-field textarea::placeholder,
        input.studio-auth-field::placeholder {
          color: color-mix(in srgb, var(--mos-text) 38%, transparent);
          font-size: 14px;
          font-weight: 450;
          line-height: 18px;
        }
        /* Flat dark pill — same ink as landing Sign in / Enter Studio CTAs. */
        .studio-auth-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 48px;
          padding: 0 18px;
          border: 1px solid transparent;
          border-radius: 999px;
          background: #1c1c1e;
          box-shadow: none;
          color: #f5f5f7;
          font-size: 14px;
          font-weight: 650;
          letter-spacing: -0.01em;
          text-shadow: none;
          cursor: pointer;
          transition: background 0.14s ease, transform 0.12s ease;
          text-decoration: none;
        }
        .studio-auth-primary:hover:not(:disabled) {
          background: color-mix(in srgb, #1c1c1e 88%, #f5f5f7);
        }
        .studio-auth-primary:active:not(:disabled) {
          transform: translateY(1px) scale(0.99);
        }
        .studio-auth-primary:focus-visible,
        .studio-auth-secondary:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px #f5f5f7,
            0 0 0 4px color-mix(in srgb, #1c1c1e 35%, transparent);
        }
        .studio-auth-primary:disabled {
          cursor: not-allowed;
          transform: none;
          border-color: transparent;
          background: color-mix(in srgb, #1c1c1e 42%, #d4d4da);
          box-shadow: none;
          color: color-mix(in srgb, #f5f5f7 62%, #8e8e93);
          text-shadow: none;
          opacity: 1;
        }
        .studio-auth-secondary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .studio-auth-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 48px;
          width: 100%;
          padding: 0 18px;
          border: 1px solid var(--studio-landing-line, #d8d8de);
          border-radius: 999px;
          background: transparent;
          color: #1c1c1e;
          font-size: 14px;
          font-weight: 650;
          box-shadow: none;
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          transition: background 0.14s ease, border-color 0.14s ease;
        }
        .studio-auth-secondary:hover {
          background: var(--mos-plate-strong);
          border-color: color-mix(in srgb, #1c1c1e 28%, transparent);
          color: #1c1c1e;
        }
        .studio-auth-notice {
          min-height: 1rem;
          margin: 0;
          color: color-mix(in srgb, var(--mos-text) 55%, transparent);
          font-size: 12px;
          text-align: center;
        }
        .studio-auth-copy {
          margin: 0.65rem 0 0;
          color: color-mix(in srgb, var(--mos-text) 55%, transparent);
          font-size: 12px;
          line-height: 1.4;
          text-align: center;
        }
        .studio-auth-choices {
          display: grid;
          gap: 8px;
          margin-top: 1.1rem;
          text-align: left;
        }
        .studio-auth-choices.is-grid {
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .studio-auth-choice-tile {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 1;
          padding: 0;
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 90%, transparent);
          border-radius: 16px;
          background: var(--mos-plate-strong);
          cursor: pointer;
          isolation: isolate;
          transition:
            transform 0.14s ease,
            border-color 0.14s ease,
            box-shadow 0.14s ease;
        }
        .studio-auth-choice-tile-media {
          position: absolute;
          inset: 0;
          background-image: var(--studio-auth-choice-image);
          background-size: cover;
          background-position: center;
          transform: scale(1.02);
          transition: transform 0.22s ease;
        }
        .studio-auth-choice-tile-mask {
          position: absolute;
          inset: 0;
          /* Bottom dark mask — keeps title readable over the photo. */
          background: linear-gradient(
            180deg,
            rgba(28, 28, 30, 0) 0%,
            rgba(28, 28, 30, 0) 42%,
            rgba(28, 28, 30, 0.55) 72%,
            rgba(28, 28, 30, 0.88) 100%
          );
          pointer-events: none;
        }
        .studio-auth-choice-tile-label {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 10px;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: #f5f5f7;
          font-size: 12px;
          font-weight: 650;
          letter-spacing: -0.01em;
          line-height: 1.2;
          text-align: center;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
        }
        .studio-auth-choice-tile-spinner {
          width: 13px;
          height: 13px;
        }
        .studio-auth-choice-tile:hover:not(:disabled) .studio-auth-choice-tile-media {
          transform: scale(1.06);
        }
        .studio-auth-choice-tile:hover:not(:disabled) {
          border-color: color-mix(in srgb, #1c1c1e 28%, transparent);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
        }
        .studio-auth-choice-tile:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px #f5f5f7,
            0 0 0 4px color-mix(in srgb, #1c1c1e 28%, transparent);
        }
        .studio-auth-choice-tile:disabled {
          cursor: not-allowed;
        }
        .studio-auth-choice-tile:disabled:not(.is-pending) {
          opacity: 0.5;
        }
        .studio-auth-choice-tile.is-pending {
          opacity: 1;
        }
        .studio-auth-icon,
        .studio-auth-accent-text {
          display: block;
          flex: 0 0 auto;
          width: 14px;
          height: 14px;
        }
        .studio-auth-icon {
          color: color-mix(in srgb, var(--mos-text) 42%, transparent);
        }
        .studio-auth-link {
          color: color-mix(in srgb, var(--mos-text) 55%, transparent);
          font-size: 12px;
          font-weight: 500;
          background: transparent;
          border: 0;
        }
        .studio-auth-link:hover {
          color: var(--mos-text);
        }
        .studio-auth-faint {
          color: color-mix(in srgb, var(--mos-text) 42%, transparent);
        }
        .studio-auth-panel {
          border: 1px solid color-mix(in srgb, var(--color-cursor-border-soft) 90%, transparent);
          border-radius: 12px;
          background: #ffffff;
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
      `}</style>
      <section
        className={`studio-auth-card relative w-full px-6 py-7 text-center sm:px-7 sm:py-8 ${
          wide ? "max-w-[420px]" : "max-w-[340px]"
        }`}
      >
        {onBack ? (
          <button
            type="button"
            className="studio-auth-link mb-2 w-full cursor-pointer py-1 text-left underline-offset-4 transition hover:underline focus:outline-none"
            onClick={onBack}
          >
            ← Back
          </button>
        ) : null}
        <div className="flex flex-col items-center justify-center">
          <BrandMark size={48} subtle appearance="light" />
        </div>
        <div className="mt-3">
          <h1 className="studio-auth-title">{title}</h1>
        </div>
        {children}
      </section>
    </Wrapper>
  );
}
