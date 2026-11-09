"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { TicketCard } from "@/components/ticket-card";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="center-page" role="alert">
      <div style={{ width: "min(320px, 100%)", transform: "rotate(3deg)" }} aria-hidden="true">
        <TicketCard
          name="Hold on"
          kicker="Technical pause"
          price="500"
          priceNote="RETRY"
          serial="No. 000500"
          stock="butter"
          pattern="stripes"
        />
      </div>
      <div className="stack" style={{ justifyItems: "center" }}>
        <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
          Something broke on our side
        </h1>
        <p className="small muted" style={{ maxWidth: "44ch" }}>
          If you were paying, don&apos;t pay again. Held seats stay held for 10 minutes, and paid orders still get their tickets.
        </p>
      </div>
      <div className="row wrap" style={{ justifyContent: "center" }}>
        <button className="btn btn-accent" type="button" onClick={reset}>
          <Icon name="refresh" small /> Try again
        </button>
        <Link className="btn" href="/find">
          Find my tickets
        </Link>
      </div>
    </main>
  );
}
