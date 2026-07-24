import type { Metadata } from "next";
import { PublicOffersCatalog } from "@/studio/components/PublicOffersPages";

export const metadata: Metadata = {
  title: "Offers · Yatishara Studio",
  description: "Browse creator packages on Yatishara Studio",
};

export default function OffersPage() {
  return <PublicOffersCatalog />;
}
