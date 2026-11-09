import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Countdown } from "@/components/countdown";
import { db } from "@/lib/db";
import { transaction } from "@/lib/tx";
import { refreshTicketType } from "@/server/inventory";

export const metadata: Metadata = { title: "Waitlist", robots: { index: false } };

async function Waitlist({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = await db.waitlistEntry.findUnique({ where: { token }, select: { ticketTypeId: true } });
  if (!entry) notFound();
  // Reading the waitlist releases expired holds, which may turn into an offer for this person.
  await transaction((tx) => refreshTicketType(tx, entry.ticketTypeId, new Date()));
  const w = await db.waitlistEntry.findUniqueOrThrow({
    where: { token },
    include: { ticketType: { include: { event: { select: { name: true, slug: true } } } } },
  });
  const ahead = await db.waitlistEntry.count({
    where: { ticketTypeId: w.ticketTypeId, status: "WAITING", createdAt: { lt: w.createdAt } },
  });
  const event = w.ticketType.event;

  return (
    <div className="card card-lg stack">
      <p className="label">
        Waitlist · {w.ticketType.name} · {event.name}
      </p>
      {w.status === "WAITING" ? (
        <>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
            You&apos;re #{ahead + 1}
          </h1>
          <p className="small muted">
            When a hold expires or the host adds seats, the first person waiting gets them for 15 minutes. Check back here; this page
            updates on every visit.
          </p>
        </>
      ) : w.status === "OFFERED" && w.offerOrderId && w.offerExpiresAt && w.offerExpiresAt > new Date() ? (
        <>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
            Seats for you
          </h1>
          <p className="small">
            {w.qty} × {w.ticketType.name} are held in your name for <Countdown to={w.offerExpiresAt.toISOString()} className="mono" />.
          </p>
          <Link className="btn btn-accent btn-lg" href={`/checkout/${w.offerOrderId}`}>
            Complete purchase
          </Link>
        </>
      ) : w.status === "CLAIMED" ? (
        <>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
            You got in
          </h1>
          <Link className="btn btn-accent" href={`/o/${w.offerOrderId}`}>
            Open my tickets
          </Link>
        </>
      ) : (
        <>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
            The offer lapsed
          </h1>
          <p className="small muted">Seats were held for you for 15 minutes but weren&apos;t bought, so they went to the next person.</p>
        </>
      )}
      <Link className="btn btn-ghost btn-sm" href={`/c/${event.slug}`}>
        Concert page
      </Link>
    </div>
  );
}

export default function WaitlistPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main id="main" className="container narrow">
      <Suspense fallback={<div className="sk" style={{ height: 240, borderRadius: 18 }} />}>
        <Waitlist params={params} />
      </Suspense>
    </main>
  );
}
