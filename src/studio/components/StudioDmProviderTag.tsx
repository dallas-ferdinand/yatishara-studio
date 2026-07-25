"use client";

import { Briefcase, UserRound } from "lucide-react";

export type StudioDmSellerTag = "freelancer" | "business";

/** Small Freelancer / Business chip for approved marketplace sellers. */
export function StudioDmProviderTag({
  tag,
  className = "",
}: {
  tag: StudioDmSellerTag | null | undefined;
  className?: string;
}) {
  if (!tag) return null;
  const isBusiness = tag === "business";
  const Icon = isBusiness ? Briefcase : UserRound;
  const label = isBusiness ? "Business" : "Freelancer";
  return (
    <span
      className={`studio-dm-provider-tag studio-admin-chip${className ? ` ${className}` : ""}`}
      title={label}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
