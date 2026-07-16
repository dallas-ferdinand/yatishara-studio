import type { Metadata } from "next";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { PublicProfileView } from "@/studio/components/PublicProfileView";
import "@/studio/components/public-profile.css";

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
  return (
    <ConvexClientProvider>
      <PublicProfileView username={username} />
    </ConvexClientProvider>
  );
}
