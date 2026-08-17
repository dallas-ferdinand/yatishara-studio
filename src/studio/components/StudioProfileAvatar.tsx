"use client";

import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";
import { useEffect, useState } from "react";
import {
  profileAvatarStyle,
  profileNameInitials,
} from "@/studio/lib/profileAvatar";
import "./studio-profile-avatar.css";

export type StudioProfileAvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<StudioProfileAvatarSize, number> = {
  sm: 26,
  md: 32,
  lg: 68,
  xl: 72,
};

type NameFields = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  displayName?: string | null;
};

type SharedProps = NameFields & {
  src?: string | null;
  initials?: string;
  size?: StudioProfileAvatarSize;
  className?: string;
  alt?: string;
  /** Replaces letter initials when there is no image (e.g. upload affordance). */
  placeholder?: ReactNode;
  overlay?: ReactNode;
  style?: CSSProperties;
};

type AsDivProps = SharedProps &
  Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children"> & {
    as?: "div";
  };

type AsButtonProps = SharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> & {
    as: "button";
  };

export type StudioProfileAvatarProps = AsDivProps | AsButtonProps;

function resolveInitials(props: SharedProps): string {
  if (props.initials?.trim()) return props.initials.trim();
  return profileNameInitials({
    firstName: props.firstName,
    lastName: props.lastName,
    name: props.name,
    displayName: props.displayName,
  });
}

export function StudioProfileAvatar(props: StudioProfileAvatarProps) {
  const {
    src,
    size = "md",
    className = "",
    alt = "",
    placeholder,
    overlay,
    style,
    as = "div",
    initials: _initials,
    firstName,
    lastName,
    name,
    displayName,
    ...rest
  } = props;

  const initials = resolveInitials({
    initials: _initials,
    firstName,
    lastName,
    name,
    displayName,
  });
  const trimmedSrc = src?.trim() || "";
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [trimmedSrc]);
  const hasImage = Boolean(trimmedSrc) && !broken;
  const px = SIZE_PX[size] ?? SIZE_PX.md;
  const classes = [
    "studio-profile-avatar",
    `is-${size}`,
    as === "button" ? "is-button" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {placeholder && !hasImage ? (
        <span className="studio-profile-avatar-fallback is-placeholder">
          {placeholder}
        </span>
      ) : (
        <span
          className="studio-profile-avatar-fallback"
          style={profileAvatarStyle(initials)}
          aria-hidden={hasImage}
        >
          {initials}
        </span>
      )}
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmedSrc}
          alt={alt}
          className="studio-profile-avatar-media"
          draggable={false}
          decoding="async"
          width={px}
          height={px}
          onError={() => setBroken(true)}
        />
      ) : null}
      {overlay ? <span className="studio-profile-avatar-overlay">{overlay}</span> : null}
    </>
  );

  if (as === "button") {
    const buttonRest = rest as Omit<
      ButtonHTMLAttributes<HTMLButtonElement>,
      "className" | "style" | "children"
    >;
    return (
      <button
        type="button"
        className={classes}
        style={style}
        {...buttonRest}
      >
        {content}
      </button>
    );
  }

  const divRest = rest as Omit<
    HTMLAttributes<HTMLDivElement>,
    "className" | "style" | "children"
  >;
  return (
    <div className={classes} style={style} {...divRest}>
      {content}
    </div>
  );
}
