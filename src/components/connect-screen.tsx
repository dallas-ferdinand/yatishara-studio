"use client";

import { useCallback, useState } from "react";
import { KeyRound, Loader2, MessageCircle } from "lucide-react";
import { BootBackdrop } from "@/components/boot-backdrop";
import { BrandMark } from "@/components/brand-mark";
import { PinCodeInput } from "@/components/pin-code-input";
import { connectWithPassword, connectWithPin, GatewayError, requestUnlockPin } from "@/lib/gateway";
import { defaultGatewayUrl, getDeviceId, saveSession } from "@/lib/session";
import type { Session } from "@/lib/types";

type Props = {
  onConnected: (session: Session) => void;
};

type LoginMode = "user" | "pin";

function loginErrorMessage(err: unknown): string {
  if (err instanceof GatewayError) {
    if (err.code === "wrong_credentials") return "Wrong name or password";
    if (err.code === "storage_quota") return err.message;
    if (err.message && err.message !== "wrong_credentials") return err.message;
    return "Sign-in failed";
  }
  if (err instanceof TypeError) {
    return "Can't reach MercuryOS — check your connection and try again";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Connection failed";
}

export function ConnectScreen({ onConnected }: Props) {
  const gateway = defaultGatewayUrl();
  const [mode, setMode] = useState<LoginMode>("user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const connectUser = useCallback(async () => {
    const name = username.trim();
    const pass = password.trim();
    if (!name || !pass) {
      setError("Enter your first name and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await connectWithPassword(gateway, name, pass);
      try {
        saveSession(session);
      } catch (err) {
        throw new GatewayError(
          "Browser storage full — clear site data for mercuryos.yatishara.com and sign in again",
          undefined,
          "storage_quota",
        );
      }
      onConnected(session);
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [gateway, onConnected, password, username]);

  const connectPin = useCallback(async () => {
    if (pin.trim().length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = await connectWithPin(gateway, pin.trim());
      try {
        saveSession(session);
      } catch (err) {
        throw new GatewayError(
          "Browser storage full — clear site data for mercuryos.yatishara.com and sign in again",
          undefined,
          "storage_quota",
        );
      }
      onConnected(session);
    } catch (err) {
      const code = err instanceof GatewayError ? err.code : undefined;
      if (code === "wrong_pin") {
        setError("Wrong code — request a new one or check WhatsApp");
      } else {
        setError(loginErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }, [gateway, onConnected, pin]);

  const requestPin = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestUnlockPin(gateway);
      setSentAt(Date.now());
      showToast("Code sent — check WhatsApp");
    } catch (err) {
      if (err instanceof GatewayError && err.code === "rate_limited") {
        setError("Too many code requests — wait an hour and try again");
      } else {
        setError(err instanceof GatewayError ? err.message : "Could not send code");
      }
    } finally {
      setBusy(false);
    }
  };

  const pinReady = pin.length === 6;
  const userReady = username.trim().length > 0 && password.trim().length > 0;

  return (
    <div className="relative flex h-full flex-col bg-mos-bg">
      <BootBackdrop glowY={38} />

      {toast ? (
        <div className="mos-toast pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-mos-accent/30 bg-mos-surface px-4 py-2.5 text-sm text-mos-text-bright shadow-lg">
          {toast}
        </div>
      ) : null}

      <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        <div className="w-full max-w-[360px] rounded-2xl border border-mos-border bg-mos-surface/95 p-5 shadow-[0_20px_48px_rgba(0,0,0,0.4)] backdrop-blur-sm sm:p-7">
          <header className="mb-6 flex flex-col items-center text-center">
            <BrandMark size={48} />
            <h1
              className="mt-3 text-[13px] font-semibold tracking-[0.06em] text-mos-text-soft"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              MercuryOS
            </h1>
            <p className="mt-1.5 text-xs text-mos-muted">Sign in to continue</p>
          </header>

          {mode === "user" ? (
            <>
              <p className="mb-3.5 text-center text-xs leading-relaxed text-mos-muted">
                Sign in with your first name and password
              </p>
              <label className="mb-2 block text-[11px] font-medium text-mos-muted">First name</label>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="words"
                className="mb-3 w-full rounded-xl border border-mos-border bg-mos-panel/30 px-3.5 py-2.5 text-sm text-mos-text outline-none focus:border-mos-accent/50"
                placeholder="First name"
                value={username}
                disabled={busy}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && userReady) void connectUser();
                }}
              />
              <label className="mb-2 block text-[11px] font-medium text-mos-muted">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                className="mb-4 w-full rounded-xl border border-mos-border bg-mos-panel/30 px-3.5 py-2.5 text-sm text-mos-text outline-none focus:border-mos-accent/50"
                placeholder="Password"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && userReady) void connectUser();
                }}
              />
              <button
                type="button"
                disabled={busy || !userReady}
                onClick={() => void connectUser()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-mos-accent px-4 py-3 text-sm font-semibold text-mos-bg transition hover:bg-mos-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" strokeWidth={1.75} />}
                Sign in
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode("pin");
                  setError(null);
                }}
                className="mt-4 w-full text-center text-xs font-medium text-mos-accent transition hover:text-mos-accent-hover disabled:opacity-50"
              >
                Use 6-digit code instead
              </button>
            </>
          ) : (
            <>
              <p className="mb-3.5 text-center text-xs leading-relaxed text-mos-muted">
                Enter the 6-digit code from WhatsApp
              </p>
              <PinCodeInput
                value={pin}
                onChange={setPin}
                onComplete={() => {
                  if (!busy && pin.length === 6) void connectPin();
                }}
                disabled={busy}
                autoFocus
              />
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void requestPin()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-mos-accent transition hover:text-mos-accent-hover disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  )}
                  Send new code to WhatsApp
                </button>
              </div>
              {sentAt ? (
                <p className="mt-2 text-center text-[11px] text-mos-faint">
                  Sent {new Date(sentAt).toLocaleTimeString()} · device {getDeviceId().slice(0, 8)}…
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy || !pinReady}
                onClick={() => void connectPin()}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-mos-accent px-4 py-3 text-sm font-semibold text-mos-bg transition hover:bg-mos-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pinReady ? "Connect" : "Enter code"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode("user");
                  setError(null);
                }}
                className="mt-4 w-full text-center text-xs font-medium text-mos-accent transition hover:text-mos-accent-hover disabled:opacity-50"
              >
                Sign in with name and password
              </button>
            </>
          )}

          {error ? (
            <p className="mt-4 rounded-lg border border-mos-error/25 bg-mos-error/10 px-3 py-2.5 text-center text-sm text-mos-error">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
