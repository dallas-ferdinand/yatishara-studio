"use client";

import dynamic from "next/dynamic";
import { AppLoadingScreen } from "@/components/app-loading-screen";

const StudioAppClient = dynamic(
  () => import("@/components/studio-app-client").then((module) => module.StudioAppClient),
  {
    ssr: false,
    loading: () => <AppLoadingScreen message="Loading Studio..." />,
  },
);

export function StudioClientPage() {
  return <StudioAppClient />;
}
