"use client";

import { useEffect, useRef } from "react";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { mobileBackStack } from "@/studio/lib/mobileBackStack";

/**
 * Mount once near the app root so popstate is bound while mobile.
 */
export function MobileBackStackHost() {
  const { isMobile } = useMobileLayout();

  useEffect(() => {
    if (!isMobile) {
      mobileBackStack.dismissAll();
      return;
    }
    return mobileBackStack.bind();
  }, [isMobile]);

  return null;
}

/**
 * While `open` is true on mobile, push a history entry so Back runs `onClose`
 * instead of leaving the page. UI/Escape close syncs via release on cleanup.
 */
export function useMobileBackLayer(
  id: string,
  open: boolean,
  onClose: () => void,
) {
  const { isMobile } = useMobileLayout();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isMobile || !open) return;
    mobileBackStack.push(id, () => {
      onCloseRef.current();
    });
    return () => {
      mobileBackStack.release(id);
    };
  }, [id, isMobile, open]);
}
