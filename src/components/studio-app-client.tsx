"use client";

import { useEffect } from "react";
import { ConvexClientProvider } from "@/app/ConvexClientProvider";
import { installGlobalHorizontalWheelScroll } from "@/desk/lib/use-horizontal-wheel-scroll";
import { StudioAuthGate } from "@/studio/components/StudioAuthGate";

export function StudioAppClient({
  initialProfileUsername,
}: {
  initialProfileUsername?: string;
} = {}) {
  useEffect(() => installGlobalHorizontalWheelScroll(), []);

  return (
    <ConvexClientProvider>
      <StudioAuthGate initialProfileUsername={initialProfileUsername} />
    </ConvexClientProvider>
  );
}
