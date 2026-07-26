import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/** Legacy path — opens Studio Creative Network offer. */
export default async function OfferSlugRedirectPage({ params }: PageProps) {
  const { slug } = await params;
  const clean = slug?.trim().toLowerCase() || "";
  if (!clean) redirect("/?network=1");
  redirect(`/?network=1&slug=${encodeURIComponent(clean)}`);
}
