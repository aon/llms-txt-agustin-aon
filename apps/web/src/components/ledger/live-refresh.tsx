"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server components on an interval while a crawl is in flight. */
export function LiveRefresh({
  active,
  everyMs,
}: {
  active: boolean;
  everyMs: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}
