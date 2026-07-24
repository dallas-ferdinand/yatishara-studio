import type { Metadata } from "next";
import { PublicOfferDetail } from "@/studio/components/PublicOffersPages";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Offers · Yatishara Studio`,
    description: "Book a creator package on Yatishara Studio",
  };
}

export default async function OfferDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicOfferDetail slug={slug?.trim().toLowerCase() || ""} />;
}
