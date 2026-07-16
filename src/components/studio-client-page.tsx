"use client";

import { StudioAppClient } from "@/components/studio-app-client";

export function StudioClientPage({
  initialProfileUsername,
}: {
  initialProfileUsername?: string;
} = {}) {
  return <StudioAppClient initialProfileUsername={initialProfileUsername} />;
}
