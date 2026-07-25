import type { Metadata } from "next";
import { PublicOffersCatalog } from "@/studio/components/PublicOffersPages";

export const metadata: Metadata = {
  title: "Creative Network · Yatishara Studio",
  description: "Creative services from verified creators on Yatishara Studio",
};

export default function OffersPage() {
  return <PublicOffersCatalog />;
}
