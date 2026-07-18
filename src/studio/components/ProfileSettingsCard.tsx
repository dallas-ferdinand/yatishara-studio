"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe,
  ImagePlus,
  Link2,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { StudioProfileAvatar } from "./StudioProfileAvatar";

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

function linkTypeLabel(type: ContactLinkType) {
  return LINK_TYPES.find((option) => option.id === type)?.label ?? "Link";
}

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

function ProfileLinkTypeMenu({
  value,
  onChange,
}: {
  value: ContactLinkType;
  onChange: (type: ContactLinkType) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const active = LINK_TYPES.find((option) => option.id === value) ?? LINK_TYPES[0];

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    const place = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(148, rect.width);
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      if (top + 180 > window.innerHeight - 8) top = Math.max(8, rect.top - 184);
      setMenuStyle({ position: "fixed", top, left, width, zIndex: 90 });
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="studio-profile-type-menu" ref={wrapRef}>
      <button
        type="button"
        className={`studio-profile-type-trigger${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Link type"
        onClick={() => setOpen((state) => !state)}
      >
        <LinkTypeIcon type={value} />
        <span>{active.label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="cursor-tab-context-menu studio-profile-type-popover"
              style={menuStyle}
              role="listbox"
              aria-label="Link type"
            >
              {LINK_TYPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  className={`cursor-tab-context-item${option.id === value ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <LinkTypeIcon type={option.id} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function ProfileSettingsCard({
  rootFolderId,
  displayNameHint,
  onOpenPublicProfile,
}: {
  rootFolderId?: Id<"folders"> | null;
  displayNameHint?: string;
  onOpenPublicProfile?: (username: string) => void;
}) {
  const [expiresUnix] = useState(() => Math.floor(Date.now() / 1000) + 60 * 60);
  const profile = useQuery(api.profiles.getMine, { expiresUnix });
  const claimUsername = useMutation(api.profiles.claimUsername);
  const updateMine = useMutation(api.profiles.updateMine);
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [links, setLinks] = useState<ContactLinkDraft[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>();
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
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
    if (!pendingAvatarFile) {
      setAvatarPreview(profile.avatarUrl);
    }
  }, [profile, pendingAvatarFile]);

  const publicUrl =
    typeof window !== "undefined" && profile
      ? `${window.location.origin}${profile.publicUrlPath}`
      : profile
        ? profile.publicUrlPath
        : "";

  async function uploadAvatarFile(file: File) {
    if (!rootFolderId) {
      throw new Error("Studio folder not ready yet — try again in a moment");
    }
    const assetId = await uploadStudioAsset({
      file,
      folderId: rootFolderId,
      kind: "image",
      name: file.name || "avatar.png",
      reserveUpload,
      commitStagingUpload,
    });
    await updateMine({ avatarAssetId: assetId });
    return assetId;
  }

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
      if (pendingAvatarFile) {
        setAvatarBusy(true);
        try {
          await uploadAvatarFile(pendingAvatarFile);
          setPendingAvatarFile(null);
        } finally {
          setAvatarBusy(false);
        }
      }
      setStatus(`@${result.username} claimed`);
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
        contactLinks: links
          .filter((link) => link.value.trim())
          .map(({ type, label, value }) => ({
            type,
            label: label.trim() || linkTypeLabel(type),
            value: value.trim(),
          })),
      });
      setStatus("Saved");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not save profile"));
    } finally {
      setBusy(false);
    }
  }

  function handleAvatarPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Avatar must be an image");
      return;
    }
    setError("");
    setAvatarPreview(URL.createObjectURL(file));
    if (!profile) {
      setPendingAvatarFile(file);
      return;
    }
    setAvatarBusy(true);
    setStatus("");
    void uploadAvatarFile(file)
      .then(() => {
        setPendingAvatarFile(null);
        setStatus("Photo updated");
      })
      .catch((err) => {
        setError(friendlyConvexError(err, "Could not update photo"));
      })
      .finally(() => setAvatarBusy(false));
  }

  async function clearAvatar() {
    if (!profile) {
      setPendingAvatarFile(null);
      setAvatarPreview(undefined);
      return;
    }
    setAvatarBusy(true);
    setError("");
    try {
      await updateMine({ avatarAssetId: null });
      setAvatarPreview(undefined);
      setStatus("Photo removed");
    } catch (err) {
      setError(friendlyConvexError(err, "Could not remove photo"));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function copyPublicUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard?.writeText(publicUrl);
      setStatus("Link copied");
    } catch {
      setError("Could not copy link");
    }
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={handleAvatarPick}
    />
  );

  const avatarButton = (
    <div className="studio-profile-photo">
      <StudioProfileAvatar
        as="button"
        className="studio-profile-photo-drop"
        size="xl"
        src={avatarPreview}
        onClick={() => fileInputRef.current?.click()}
        disabled={avatarBusy || (!!profile && !rootFolderId)}
        aria-label={avatarPreview ? "Change photo" : "Add photo"}
        placeholder={
          avatarBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          )
        }
        overlay={
          avatarPreview && avatarBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null
        }
      />
      {avatarPreview ? (
        <button
          type="button"
          className="studio-profile-photo-clear"
          aria-label="Remove photo"
          onClick={() => void clearAvatar()}
          disabled={avatarBusy}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  if (profile === undefined) {
    return (
      <section className="cursor-settings-section studio-account-card studio-profile-editor">
        <p className="studio-settings-empty">Loading…</p>
      </section>
    );
  }

  if (profile === null) {
    return (
      <section className="cursor-settings-section studio-account-card studio-profile-editor">
        {fileInput}
        <form className="studio-profile-form" onSubmit={(event) => void handleClaim(event)}>
          <div className="studio-profile-identity">
            {avatarButton}
            <div className="studio-profile-identity-fields">
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
                  placeholder={displayNameHint || "Your name"}
                />
              </label>
            </div>
          </div>
          {error ? <p className="studio-profile-status is-error">{error}</p> : null}
          {status ? <p className="studio-profile-status">{status}</p> : null}
          <div className="studio-profile-footer">
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
    <section className="cursor-settings-section studio-account-card studio-profile-editor">
      {fileInput}
      <form className="studio-profile-form" onSubmit={(event) => void handleSave(event)}>
        <div className="studio-profile-identity">
          {avatarButton}
          <div className="studio-profile-identity-fields">
            <label>
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={48}
                placeholder="Your name"
              />
            </label>
            <div className="studio-profile-handle-row">
              <div className="studio-profile-username-field is-readonly">
                <span className="studio-profile-username-prefix">@</span>
                <input value={profile.username} readOnly tabIndex={-1} />
              </div>
              <button
                type="button"
                className="studio-profile-icon-btn"
                aria-label="Copy profile link"
                title="Copy link"
                onClick={() => void copyPublicUrl()}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="studio-profile-icon-btn"
                aria-label="Open profile"
                title="Open profile"
                onClick={() => onOpenPublicProfile?.(profile.username)}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <label>
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={160}
            rows={2}
            placeholder="A short bio"
          />
        </label>

        <div className="studio-profile-public-row">
          <span>Public profile</span>
          <button
            type="button"
            className={`studio-audio-switch ${isPublic ? "is-on" : ""}`}
            role="switch"
            aria-checked={isPublic}
            aria-label="Public profile"
            onClick={() => setIsPublic((value) => !value)}
          />
        </div>

        <div className="studio-profile-links-block">
          <div className="studio-profile-links-head">
            <span>Links</span>
            <button
              type="button"
              className="studio-profile-text-btn"
              disabled={links.length >= 8}
              onClick={() => setLinks((current) => [...current, newLinkDraft()])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add
            </button>
          </div>
          {links.length > 0 ? (
            <div className="studio-profile-links-list">
              {links.map((link, index) => (
                <div key={link.id} className="studio-profile-link-row">
                  <ProfileLinkTypeMenu
                    value={link.type}
                    onChange={(type) => {
                      setLinks((current) =>
                        current.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                type,
                                label:
                                  !item.label.trim() || item.label === linkTypeLabel(item.type)
                                    ? linkTypeLabel(type)
                                    : item.label,
                              }
                            : item,
                        ),
                      );
                    }}
                  />
                  <input
                    className="studio-profile-link-value"
                    value={link.value}
                    onChange={(event) => {
                      const value = event.target.value;
                      setLinks((current) =>
                        current.map((item, i) => (i === index ? { ...item, value } : item)),
                      );
                    }}
                    placeholder={
                      link.type === "phone"
                        ? "Phone number"
                        : link.type === "email"
                          ? "Email"
                          : "https://"
                    }
                    aria-label="Link value"
                  />
                  <button
                    type="button"
                    className="studio-profile-icon-btn"
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
          ) : null}
        </div>

        {error ? <p className="studio-profile-status is-error">{error}</p> : null}
        {status ? (
          <p className="studio-profile-status">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {status}
          </p>
        ) : null}

        <div className="studio-profile-footer">
          <button type="submit" className="studio-account-save" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
