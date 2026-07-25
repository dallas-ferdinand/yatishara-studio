import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/** Legacy path — permanent home is /creative-network/[slug]/. */
export default async function OfferSlugRedirectPage({ params }: PageProps) {
  const { slug } = await params;
  const clean = slug?.trim().toLowerCase() || "";
  redirect(clean ? `/creative-network/${clean}/` : "/creative-network/");
}
