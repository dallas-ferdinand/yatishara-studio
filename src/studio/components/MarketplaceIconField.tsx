"use client";

import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function IconField({
  icon: Icon,
  className,
  ...inputProps
}: {
  icon: LucideIcon;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`marketplace-icon-input${className ? ` ${className}` : ""}`}>
      <Icon className="marketplace-icon-input-glyph" aria-hidden="true" />
      <input className="marketplace-icon-input-field" {...inputProps} />
    </label>
  );
}

export function IconTextarea({
  icon: Icon,
  className,
  ...textareaProps
}: {
  icon: LucideIcon;
  className?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`marketplace-icon-input is-multiline${className ? ` ${className}` : ""}`}>
      <Icon className="marketplace-icon-input-glyph" aria-hidden="true" />
      <textarea className="marketplace-icon-input-field" {...textareaProps} />
    </label>
  );
}
