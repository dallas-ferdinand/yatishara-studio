"use client";

import type { LucideIcon } from "lucide-react";
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

/** Label + hint chrome shared by the icon input and textarea. */
function FieldShell({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  if (!label && !hint) return <>{children}</>;
  return (
    <div className="marketplace-field">
      {label ? <span className="marketplace-field-label">{label}</span> : null}
      {children}
      {hint ? <span className="marketplace-field-hint">{hint}</span> : null}
    </div>
  );
}

export function IconField({
  icon: Icon,
  className,
  label,
  hint,
  ...inputProps
}: {
  icon: LucideIcon;
  className?: string;
  label?: string;
  hint?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} hint={hint}>
      <label
        className={`marketplace-icon-input${className ? ` ${className}` : ""}`}
      >
        <Icon className="marketplace-icon-input-glyph" aria-hidden="true" />
        <input className="marketplace-icon-input-field" {...inputProps} />
      </label>
    </FieldShell>
  );
}

export function IconTextarea({
  icon: Icon,
  className,
  label,
  hint,
  ...textareaProps
}: {
  icon: LucideIcon;
  className?: string;
  label?: string;
  hint?: ReactNode;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} hint={hint}>
      <label
        className={`marketplace-icon-input is-multiline${className ? ` ${className}` : ""}`}
      >
        <Icon className="marketplace-icon-input-glyph" aria-hidden="true" />
        <textarea className="marketplace-icon-input-field" {...textareaProps} />
      </label>
    </FieldShell>
  );
}
