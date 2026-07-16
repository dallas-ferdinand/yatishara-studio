"use client";

import dynamic from "next/dynamic";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";

const PublicProfileView = dynamic(
  () =>
    import("@/studio/components/PublicProfileView").then((m) => m.PublicProfileView),
  {
    ssr: false,
    loading: () => (
      <div className="public-profile-boot" role="status" aria-live="polite">
        Loading profile…
      </div>
    ),
  },
);

/**
 * Lightweight public profile entry — avoids loading the authenticated StudioShell
 * graph (editor, history, settings, explorer) for share links.
 */
export function PublicProfileClient({ username }: { username: string }) {
  return (
    <ConvexClientProvider>
      <div className="public-profile-route">
        <PublicProfileView username={username} />
      </div>
    </ConvexClientProvider>
  );
}
