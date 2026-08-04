"use client";

import { useMutation } from "convex/react";
import { Bell, BellOff, Loader2, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import {
  DEFAULT_UI_SOUND_PREFS,
  readUiSoundPrefs,
  uiSoundsReducedBySystem,
} from "@/mos-app/sound-prefs.js";
import {
  getUiSoundPrefs,
  playUiSound,
  primeUiSounds,
  setUiSoundPrefs,
  subscribeUiSoundPrefs,
} from "@/mos-app/sounds.js";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import {
  DEFAULT_STUDIO_ALERT_PREFS,
  readStudioAlertPrefs,
  writeStudioAlertPrefs,
  type StudioAlertPrefs,
} from "@/studio/lib/studioAlertPrefs";
import {
  disableStudioWebPush,
  enableStudioWebPush,
  getNotificationPermission,
  hasStudioWebPushSubscription,
  isStudioWebPushAvailable,
} from "@/studio/lib/webPush";
import "./studio-sounds-alerts.css";

type UiSoundCategories = {
  taps: boolean;
  messaging: boolean;
  social: boolean;
  feedback: boolean;
};

type UiSoundPrefs = {
  enabled: boolean;
  volume: number;
  categories: UiSoundCategories;
};

const SOUND_CATEGORIES: Array<{
  id: keyof UiSoundCategories;
  label: string;
  hint: string;
  preview: string;
}> = [
  {
    id: "taps",
    label: "Taps & navigation",
    hint: "Buttons, tabs, sheets, menus",
    preview: "tap",
  },
  {
    id: "messaging",
    label: "Messages",
    hint: "Incoming DM chime + send",
    preview: "message",
  },
  {
    id: "social",
    label: "Social",
    hint: "Followed-post chime, like, save, follow",
    preview: "notify",
  },
  {
    id: "feedback",
    label: "Feedback",
    hint: "Success and errors",
    preview: "success",
  },
];

const ALERT_CATEGORIES: Array<{
  id: keyof StudioAlertPrefs;
  label: string;
  hint: string;
}> = [
  {
    id: "generations",
    label: "Generations",
    hint: "When image, video, or audio jobs finish or fail",
  },
  {
    id: "messages",
    label: "Direct messages",
    hint: "New chats and message alerts",
  },
  {
    id: "follows",
    label: "People you follow",
    hint: "New posts from creators you follow",
  },
  {
    id: "payments",
    label: "Billing",
    hint: "Top-ups and payment status updates",
  },
];

const PREVIEW_CHIPS = [
  { id: "tap", label: "Tap" },
  { id: "send", label: "Send" },
  { id: "like", label: "Like" },
  { id: "save", label: "Save" },
  { id: "share", label: "Share" },
  { id: "success", label: "Done" },
] as const;

function SwitchControl({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`studio-audio-switch${checked ? " is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function StudioSoundsAlertsSettings() {
  const savePushSubscription = useMutation(api.notifications.savePushSubscription);
  const removePushSubscription = useMutation(api.notifications.removePushSubscription);

  const [soundPrefs, setSoundPrefs] = useState<UiSoundPrefs>(DEFAULT_UI_SOUND_PREFS);
  const [alertPrefs, setAlertPrefs] = useState<StudioAlertPrefs>(DEFAULT_STUDIO_ALERT_PREFS);
  const [mounted, setMounted] = useState(false);
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  const pushAvailable = isStudioWebPushAvailable();
  const systemReduced = mounted && uiSoundsReducedBySystem();
  const pushDenied = permission === "denied";
  const pushEnabled = subscribed && permission === "granted";

  useEffect(() => {
    const initial = readUiSoundPrefs();
    setSoundPrefs(initial);
    setUiSoundPrefs(initial);
    const alerts = readStudioAlertPrefs();
    setAlertPrefs(alerts);
    void writeStudioAlertPrefs(alerts);
    setMounted(true);
    const unsubscribe = subscribeUiSoundPrefs(() => {
      setSoundPrefs(getUiSoundPrefs() as UiSoundPrefs);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await hasStudioWebPushSubscription();
      if (!cancelled) {
        setSubscribed(next);
        setPermission(getNotificationPermission());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function persistSound(next: UiSoundPrefs) {
    setSoundPrefs(next);
    setUiSoundPrefs(next);
  }

  function persistAlerts(next: StudioAlertPrefs) {
    setAlertPrefs(next);
    void writeStudioAlertPrefs(next);
  }

  async function togglePush() {
    setPushError("");
    setPushBusy(true);
    try {
      if (pushEnabled) {
        await disableStudioWebPush({ remove: removePushSubscription });
        toast.message("Browser notifications turned off");
      } else {
        await enableStudioWebPush({ save: savePushSubscription });
        toast.success("Browser notifications enabled");
      }
      setPermission(getNotificationPermission());
      setSubscribed(await hasStudioWebPushSubscription());
    } catch (error) {
      setPushError(friendlyConvexError(error, "Could not update notifications"));
      setPermission(getNotificationPermission());
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="studio-settings-stack studio-sounds-alerts">
      <section className="cursor-settings-section studio-account-card studio-sounds-card">
        <header className="studio-sounds-card-head">
          <div className="studio-sounds-card-title">
            <span className="studio-sounds-card-icon" aria-hidden="true">
              {soundPrefs.enabled ? <Volume2 strokeWidth={2} /> : <VolumeX strokeWidth={2} />}
            </span>
            <div>
              <strong>Sounds</strong>
              <p>Warm interface tones for taps, sends, and social actions.</p>
            </div>
          </div>
          <SwitchControl
            checked={soundPrefs.enabled}
            disabled={!mounted || systemReduced}
            label={soundPrefs.enabled ? "Mute UI sounds" : "Enable UI sounds"}
            onChange={(enabled) => {
              persistSound({ ...soundPrefs, enabled });
              if (enabled) {
                void primeUiSounds().then(() => playUiSound("tap"));
              }
            }}
          />
        </header>

        {systemReduced ? (
          <p className="studio-sounds-banner">
            System Reduce Motion is on — UI sounds stay muted until you turn that off.
          </p>
        ) : null}

        <div
          className={`studio-sounds-body${
            !soundPrefs.enabled || systemReduced ? " is-dimmed" : ""
          }`}
        >
          <div className="studio-sounds-volume">
            <div className="studio-sounds-volume-meta">
              <span>Volume</span>
              <strong>{Math.round(soundPrefs.volume * 100)}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(soundPrefs.volume * 100)}
              disabled={!mounted || !soundPrefs.enabled || systemReduced}
              aria-label="UI sound volume"
              onChange={(event) => {
                const volume = Number(event.target.value) / 100;
                persistSound({ ...soundPrefs, volume });
              }}
              onPointerUp={() => {
                if (soundPrefs.enabled && !systemReduced) playUiSound("tap");
              }}
            />
          </div>

          <div className="studio-sounds-rows" role="group" aria-label="Sound categories">
            {SOUND_CATEGORIES.map((row) => {
              const on = Boolean(soundPrefs.categories?.[row.id]);
              return (
                <div key={row.id} className="studio-sounds-row">
                  <button
                    type="button"
                    className="studio-sounds-row-copy"
                    disabled={!mounted || !soundPrefs.enabled || systemReduced || !on}
                    onClick={() => playUiSound(row.preview)}
                  >
                    <strong>{row.label}</strong>
                    <span>{row.hint}</span>
                  </button>
                  <SwitchControl
                    checked={on}
                    disabled={!mounted || !soundPrefs.enabled || systemReduced}
                    label={`${on ? "Disable" : "Enable"} ${row.label}`}
                    onChange={(next) => {
                      const categories = {
                        ...soundPrefs.categories,
                        [row.id]: next,
                      };
                      persistSound({ ...soundPrefs, categories });
                      if (next) playUiSound(row.preview);
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="studio-sounds-previews" aria-label="Preview sounds">
            {PREVIEW_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="studio-sounds-preview-chip"
                disabled={!mounted || !soundPrefs.enabled || systemReduced}
                onClick={() => {
                  void primeUiSounds().then(() => playUiSound(chip.id));
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="cursor-settings-section studio-account-card studio-sounds-card">
        <header className="studio-sounds-card-head">
          <div className="studio-sounds-card-title">
            <span className="studio-sounds-card-icon" aria-hidden="true">
              {pushEnabled ? <Bell strokeWidth={2} /> : <BellOff strokeWidth={2} />}
            </span>
            <div>
              <strong>Notifications</strong>
              <p>Browser alerts for generations, DMs, follows, and billing.</p>
            </div>
          </div>
        </header>

        {!pushAvailable ? (
          <p className="studio-sounds-banner">
            Available on the live HTTPS site in a supporting browser — not on localhost,
            preview, or the Android app shell.
          </p>
        ) : (
          <>
            {pushDenied ? (
              <p className="studio-sounds-banner is-warn">
                Notifications are blocked in this browser. Allow them in site settings, then
                enable again.
              </p>
            ) : null}
            {pushError ? <p className="studio-sounds-banner is-warn">{pushError}</p> : null}

            <div className="studio-sounds-push-bar">
              <div className="studio-sounds-push-copy">
                <strong>{pushEnabled ? "Notifications on" : "Notifications off"}</strong>
                <span>
                  {pushEnabled
                    ? "You’ll get alerts for the categories below."
                    : "Enable to receive browser push alerts."}
                </span>
              </div>
              <button
                type="button"
                className={`studio-sounds-push-btn${pushEnabled ? " is-on" : ""}${
                  pushError ? " is-error" : ""
                }`}
                disabled={pushBusy || pushDenied}
                onClick={() => void togglePush()}
              >
                {pushBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                <span>{pushEnabled ? "Turn off" : "Enable"}</span>
              </button>
            </div>

            <div
              className={`studio-sounds-rows${pushEnabled ? "" : " is-dimmed"}`}
              role="group"
              aria-label="Notification categories"
            >
              {ALERT_CATEGORIES.map((row) => {
                const on = Boolean(alertPrefs[row.id]);
                return (
                  <div key={row.id} className="studio-sounds-row">
                    <div className="studio-sounds-row-copy is-static">
                      <strong>{row.label}</strong>
                      <span>{row.hint}</span>
                    </div>
                    <SwitchControl
                      checked={on}
                      disabled={!pushEnabled}
                      label={`${on ? "Disable" : "Enable"} ${row.label} alerts`}
                      onChange={(next) => {
                        persistAlerts({ ...alertPrefs, [row.id]: next });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
