"use client";

import { useMutation, useQuery } from "convex/react";
import {
  Check,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";

type ContactLinkType = "website" | "phone" | "email" | "other";

type ContactLinkDraft = {
  id: string;
  type: ContactLinkType;
  label: string;
  value: string;
};

const LINK_TYPES: Array<{ id: ContactLinkType; label: string }> = [
  { id: "website", label: "Website" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "other", label: "Other" },
];

function newLinkDraft(partial?: Partial<ContactLinkDraft>): ContactLinkDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: partial?.type ?? "website",
    label: partial?.label ?? "",
    value: partial?.value ?? "",
  };
}

function LinkTypeIcon({ type }: { type: ContactLinkType }) {
  if (type === "phone") return <Phone className="h-3.5 w-3.5" aria-hidden="true" />;
  if (type === "email") return <Mail className="h-3.5 w-3.5" aria-hidden="true" />;
  if (type === "other") return <Link2 className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Globe className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function ProfileSettingsCard({
  rootFolderId,
  displayNameHint,
}: {
  rootFolderId?: Id<"folders"> | null;
  displayNameHint?: string;
}) {
  const expiresUnix = useMemo(() => Math.floor(Date.now() / 1000) + 60 * 60, []);
  const profile = useQuery(api.profiles.getMine, { expiresUnix });
  const claimUsername = useMutation(api.profiles.claimUsername);
  const updateMine = useMutation(api.profiles.updateMine);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const completeUpload = useMutation(api.assets.completeUpload);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [links, setLinks] = useState<ContactLinkDraft[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setDisplayName(profile.displayName ?? "");
    setBio(profile.bio ?? "");
    setIsPublic(profile.isPublic);
    setLinks(
      profile.contactLinks.map((link) =>
        newLinkDraft({
          type: link.type,
          label: link.label,
          value: link.value,
        }),
      ),
    );
    setAvatarPreview(profile.avatarUrl);
  }, [profile]);

  const publicUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}${profile.publicUrlPath}`
      : profile
        ? profile.publicUrlPath
        : "";

  async function handleClaim(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await claimUsername({
        username,
        displayName: displayName || displayNameHint || undefined,
      });
      setStatus(`Claimed @${result.username}`);
    } catch (err) {
      setError(friendlyConvexError(err, "Could not claim username"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await updateMine({
        displayName,
        bio,
        isPublic,
        contactLinks: links.map(({ type, label, value }) => ({ type, label, value })),
      });
      setStatus("Profile saved");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not save profile"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile) return;
    if (!file.type.startsWith("image/")) {
      setError("Avatar must be an image");
      return;
    }
    if (!rootFolderId) {
      setError("Studio folder not ready yet — try again in a moment");
      return;
    }
    setAvatarBusy(true);
    setError("");
    setStatus("");
    try {
      const reserved = await reserveUpload({
        folderId: rootFolderId,
        name: file.name || "avatar.png",
        kind: "image",
        mimeType: file.type || "image/png",
      });
      const res = await fetch(reserved.putUrl, {
        method: "PUT",
        headers: {
          AccessKey: reserved.storageAccessKey,
          "Content-Type": file.type || "image/png",
        },
        body: file,
      });
      if (!res.ok) throw new Error("Avatar upload failed");
      await completeUpload({ assetId: reserved.assetId, byteSize: file.size });
      await updateMine({ avatarAssetId: reserved.assetId });
      setAvatarPreview(URL.createObjectURL(file));
      setStatus("Avatar updated");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not update avatar"));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function clearAvatar() {
    if (!profile) return;
    setAvatarBusy(true);
    setError("");
    try {
      await updateMine({ avatarAssetId: null });
      setAvatarPreview(undefined);
      setStatus("Avatar removed");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not remove avatar"));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function copyPublicUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard?.writeText(publicUrl);
      setStatus("Profile link copied");
    } catch {
      setError("Could not copy link");
    }
  }

  if (profile === undefined) {
    return (
      <section className="cursor-settings-section studio-account-card studio-profile-card">
        <p className="studio-settings-empty">Loading profile…</p>
      </section>
    );
  }

  if (profile === null) {
    return (
      <section className="cursor-settings-section studio-account-card studio-profile-card">
        <div className="studio-profile-intro">
          <h3>Claim your public profile</h3>
          <p>
            Pick a username people can find at <code>/u/yourname</code>. Share work from the
            explorer with Share to profile.
          </p>
        </div>
        <form className="studio-account-fields" onSubmit={(event) => void handleClaim(event)}>
          <label>
            <span>Username</span>
            <div className="studio-profile-username-field">
              <span className="studio-profile-username-prefix">@</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                placeholder="yourname"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>
          </label>
          <label>
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={displayNameHint || "How your name appears"}
            />
          </label>
          {error ? <p className="studio-profile-status is-error">{error}</p> : null}
          {status ? <p className="studio-profile-status">{status}</p> : null}
          <div className="studio-account-actions">
            <button type="submit" className="studio-account-save" disabled={busy || !username.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Claim username
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <div className="studio-settings-stack studio-profile-stack">
      <section className="cursor-settings-section studio-account-card studio-profile-card">
        <div className="studio-profile-avatar-row">
          <button
            type="button"
            className="studio-profile-avatar-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarBusy || !rootFolderId}
            aria-label="Upload avatar"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="studio-profile-avatar-img" />
            ) : (
              <span>{(profile.displayName || profile.username).slice(0, 1).toUpperCase()}</span>
            )}
            <span className="studio-profile-avatar-overlay">
              {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </span>
          </button>
          <div className="studio-profile-avatar-meta">
            <strong>@{profile.username}</strong>
            <p>Top-center avatar on your public page</p>
            <div className="studio-profile-avatar-actions">
              <button
                type="button"
                className="cursor-settings-action"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy || !rootFolderId}
              >
                Change photo
              </button>
              {profile.avatarAssetId ? (
                <button
                  type="button"
                  className="cursor-settings-action"
                  onClick={() => void clearAvatar()}
                  disabled={avatarBusy}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => void handleAvatarChange(event)}
          />
        </div>
      </section>

      <section className="cursor-settings-section studio-account-card studio-profile-card">
        <form className="studio-account-fields" onSubmit={(event) => void handleSave(event)}>
          <label>
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={48}
            />
          </label>
          <label>
            <span>Bio</span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={160}
              rows={3}
              placeholder="A short line about your work"
            />
            <em className="studio-profile-char-count">{bio.length}/160</em>
          </label>

          <div className="studio-profile-public-row">
            <div>
              <strong>Public profile</strong>
              <p>When on, anyone with your link can view posts you share</p>
            </div>
            <button
              type="button"
              className={`studio-audio-switch ${isPublic ? "is-on" : ""}`}
              role="switch"
              aria-checked={isPublic}
              aria-label="Toggle public profile"
              onClick={() => setIsPublic((value) => !value)}
            />
          </div>

          <div className="studio-profile-links-block">
            <div className="studio-profile-links-head">
              <strong>Contact & links</strong>
              <button
                type="button"
                className="cursor-settings-action"
                onClick={() => setLinks((current) => [...current, newLinkDraft()])}
                disabled={links.length >= 8}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </button>
            </div>
            {links.length === 0 ? (
              <p className="studio-settings-empty">Optional websites, phone, email, or other links.</p>
            ) : (
              <div className="studio-profile-links-list">
                {links.map((link, index) => (
                  <div key={link.id} className="studio-profile-link-row">
                    <label className="studio-profile-link-type">
                      <span>Type</span>
                      <div className="studio-profile-link-type-control">
                        <LinkTypeIcon type={link.type} />
                        <select
                          value={link.type}
                          onChange={(event) => {
                            const type = event.target.value as ContactLinkType;
                            setLinks((current) =>
                              current.map((item, i) => (i === index ? { ...item, type } : item)),
                            );
                          }}
                        >
                          {LINK_TYPES.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label>
                      <span>Label</span>
                      <input
                        value={link.label}
                        onChange={(event) => {
                          const label = event.target.value;
                          setLinks((current) =>
                            current.map((item, i) => (i === index ? { ...item, label } : item)),
                          );
                        }}
                        placeholder="Portfolio"
                      />
                    </label>
                    <label>
                      <span>Value</span>
                      <input
                        value={link.value}
                        onChange={(event) => {
                          const value = event.target.value;
                          setLinks((current) =>
                            current.map((item, i) => (i === index ? { ...item, value } : item)),
                          );
                        }}
                        placeholder={
                          link.type === "phone"
                            ? "+1 868 …"
                            : link.type === "email"
                              ? "you@studio.com"
                              : "https://"
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="studio-profile-link-remove"
                      aria-label="Remove link"
                      onClick={() =>
                        setLinks((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error ? <p className="studio-profile-status is-error">{error}</p> : null}
          {status ? (
            <p className="studio-profile-status">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {status}
            </p>
          ) : null}

          <div className="studio-account-actions">
            <button type="submit" className="studio-account-save" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save profile
            </button>
          </div>
        </form>
      </section>

      <section className="cursor-settings-section studio-account-card studio-profile-card">
        <div className="studio-profile-share-row">
          <div>
            <strong>Your public link</strong>
            <p>{publicUrl || profile.publicUrlPath}</p>
          </div>
          <div className="studio-profile-share-actions">
            <button type="button" className="cursor-settings-action" onClick={() => void copyPublicUrl()}>
              Copy link
            </button>
            <a
              className="cursor-settings-action studio-profile-open-link"
              href={profile.publicUrlPath}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Open
            </a>
          </div>
        </div>
        <p className="studio-profile-hint">
          Right-click or long-press any image or video in the explorer → Share to profile.
        </p>
      </section>
    </div>
  );
}
