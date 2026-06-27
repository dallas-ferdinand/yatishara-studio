"use client";

import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { StudioAuthGate } from "@/studio/components/StudioAuthGate";

export function StudioAppClient() {
  return (
    <ConvexClientProvider>
      <StudioAuthGate />
    </ConvexClientProvider>
  );
}
