"use client";

import { useEffect, useRef } from "react";
import { fling, tilt } from "@/lib/physics";
import { TicketCard } from "./ticket-card";

/** Decorative crew pass that can be thrown around and springs back. */
export function FlingTicket() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stopFling = fling(el);
    const stopTilt = tilt(el, { max: 6 });
    return () => {
      stopFling();
      stopTilt();
    };
  }, []);
  return (
    <div ref={ref} className="physical">
      <TicketCard
        name="Crew pass"
        kicker="Admit host · all gates"
        price="ALL"
        priceNote="ACCESS"
        serial="No. 000001"
        stock="pink"
        pattern="halftone"
        perks="Sell out. Never oversell."
      />
    </div>
  );
}
