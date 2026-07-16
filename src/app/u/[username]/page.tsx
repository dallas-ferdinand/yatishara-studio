import type { Metadata } from "next";
import { PublicProfileClient } from "@/components/public-profile-client";

type PageProps = {
  params: Promise<{ username: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const handle = username?.trim().toLowerCase() || "creator";
  return {
    title: `@${handle} · Yatishara Studio`,
    description: `Public creative profile for @${handle} on Yatishara Studio`,
    openGraph: {
      title: `@${handle}`,
      description: `See public work from @${handle} on Yatishara Studio`,
    },
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params;
  return <PublicProfileClient username={username} />;
}
