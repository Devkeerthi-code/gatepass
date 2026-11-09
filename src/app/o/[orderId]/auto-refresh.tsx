"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page every 2s while a payment confirmation is in flight. */
export function AutoRefresh({ until }: { until: string }) {
  const router = useRouter();
  useEffect(() => {
    const stopAt = new Date(until).getTime() + 60_000;
    const id = setInterval(() => {
      if (Date.now() > stopAt) clearInterval(id);
      else router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [router, until]);
  return null;
}
