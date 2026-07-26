import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy path — opens Studio Creative Network. */
export default async function OffersRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams({ network: "1" });
  const uRaw = params.u;
  const u = Array.isArray(uRaw) ? uRaw[0] : uRaw;
  const handle = u?.replace(/^@/, "").trim().toLowerCase();
  if (handle) qs.set("u", handle);
  redirect(`/?${qs.toString()}`);
}
