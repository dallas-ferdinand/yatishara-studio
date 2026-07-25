"use client";

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
  return (
    <span
      className={`studio-dm-provider-tag studio-admin-chip${className ? ` ${className}` : ""}`}
      title={tag === "business" ? "Business" : "Freelancer"}
    >
      {tag === "business" ? "Business" : "Freelancer"}
    </span>
  );
}
