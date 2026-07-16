"use client";

import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { StudioAuthGate } from "@/studio/components/StudioAuthGate";

export function StudioAppClient({
  initialProfileUsername,
}: {
  initialProfileUsername?: string;
} = {}) {
  return (
    <ConvexClientProvider>
      <StudioAuthGate initialProfileUsername={initialProfileUsername} />
    </ConvexClientProvider>
  );
}
