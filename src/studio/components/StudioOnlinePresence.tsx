"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";

/**
 * Studio tab liveness for DM “Online” — connect + visibility only.
 * No interval heartbeat. Closing/hiding the tab marks offline.
 */
export function StudioOnlinePresence() {
  const { isAuthenticated } = useConvexAuth();
  const setStudioOnline = useMutation(api.users.setStudioOnline);

  useEffect(() => {
    if (!isAuthenticated) return;

    const setOnline = (online: boolean) => {
      void setStudioOnline({ online });
    };

    const syncVisibility = () => {
      setOnline(!document.hidden);
    };

    syncVisibility();

    const onVisibility = () => syncVisibility();
    const onPageHide = () => setOnline(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      setOnline(false);
    };
  }, [isAuthenticated, setStudioOnline]);

  return null;
}
