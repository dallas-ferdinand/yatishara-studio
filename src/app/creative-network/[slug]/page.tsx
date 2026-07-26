import type { Metadata } from "next";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Creative Network · Yatishara Studio`,
    description: "Book a creative service from a verified creator on Yatishara Studio",
  };
}

/** Public offer detail removed — deep links open Studio Creative Network. */
export default async function CreativeNetworkDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const clean = slug?.trim().toLowerCase() || "";
  if (!clean) redirect("/?network=1");
  redirect(`/?network=1&slug=${encodeURIComponent(clean)}`);
}
