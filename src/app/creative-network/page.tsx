import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Creative Network · Yatishara Studio",
  description: "Creative services from verified creators on Yatishara Studio",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Public catalog removed — deep links open Studio Creative Network. */
export default async function CreativeNetworkPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const uRaw = params.u;
  const u = Array.isArray(uRaw) ? uRaw[0] : uRaw;
  const handle = u?.replace(/^@/, "").trim().toLowerCase();
  const qs = new URLSearchParams({ network: "1" });
  if (handle) qs.set("u", handle);
  redirect(`/?${qs.toString()}`);
}
