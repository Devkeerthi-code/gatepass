"use client";

import { useEffect, useRef } from "react";
import { fling, tilt } from "@/lib/physics";
import { TicketCard } from "./ticket-card";

/** A fanned stack of tier tickets; the top one can be thrown and springs back. */
export function HeroStack() {
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const stopFling = fling(el);
    const stopTilt = tilt(el, { max: 6 });
    return () => {
      stopFling();
      stopTilt();
    };
  }, []);
  return (
    <div className="hero-stack" aria-hidden="true">
      <div>
        <TicketCard name="Student free" kicker="Admit one · presale" price="FREE" serial="No. 001150" stock="lilac" pattern="plain" />
      </div>
      <div>
        <TicketCard
          name="VIP deck"
          kicker="Flash drop · 40 seats"
          price="₹1,999"
          priceNote="DROP"
          serial="No. 000040"
          stock="butter"
          pattern="stripes"
        />
      </div>
      <div ref={top} className="physical">
        <TicketCard
          name="General admission"
          kicker="Admit one · standing"
          price="₹499"
          priceNote="12 LEFT"
          priceNoteHot
          serial="No. 004127"
          stock="paper"
          pattern="guilloche"
          perks="Drag me. Let go."
        />
      </div>
    </div>
  );
}
