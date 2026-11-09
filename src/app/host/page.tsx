import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { parseTicketStyle, TicketCard } from "@/components/ticket-card";
import { db } from "@/lib/db";
import { formatDay, formatTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { requireViewer } from "@/server/auth";
import { createEvent } from "./events/actions";

export const metadata: Metadata = { title: "Your concerts" };

async function EventList() {
  const viewer = await requireViewer("dashboard:view");
  const events = await db.event.findMany({
    where: { orgId: viewer.orgId },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: { select: { capacity: true, reserved: true } } },
  });
  const revenue = await db.order.groupBy({
    by: ["eventId"],
    where: { event: { orgId: viewer.orgId }, status: "PAID" },
    _sum: { amountPaise: true },
  });
  const revenueByEvent = new Map(revenue.map((r) => [r.eventId, r._sum.amountPaise ?? 0]));

  if (events.length === 0) {
    return (
      <div className="empty card card-lg">
        <div className="empty-art" aria-hidden="true">
          <TicketCard name="Your first gig" kicker="Admit everyone" price="₹—" serial="No. 000000" stock="lilac" pattern="plain" />
        </div>
        <h2>No concerts yet</h2>
        <p className="muted small">
          Create one, add ticket types, publish, and share the link. Payments use Mock mode until you connect Razorpay.
        </p>
        <form action={createEvent}>
          <SubmitButton pendingLabel="Creating…">
            <Icon name="plus" /> New concert
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <ul className="event-grid" role="list">
      {events.map((e) => {
        const capacity = e.ticketTypes.reduce((a, t) => a + t.capacity, 0);
        const taken = e.ticketTypes.reduce((a, t) => a + t.reserved, 0);
        const style = parseTicketStyle(e.ticketStock);
        return (
          <li key={e.id}>
            <Link className="event-link" href={`/host/events/${e.id}`}>
              <TicketCard
                name={e.name}
                kicker={`${formatDay(e.startsAt)} · ${formatTime(e.startsAt)}`}
                perks={e.venue || "Venue not set"}
                price={formatPaise(revenueByEvent.get(e.id) ?? 0)}
                priceNote={e.isDemo ? "DEMO" : e.status === "PUBLISHED" ? "LIVE" : "DRAFT"}
                serial={`${taken}/${capacity || "—"} sold`}
                stock={style.stock}
                pattern={style.pattern}
              >
                <div className="meter accent" style={{ marginTop: 12, maxWidth: 240 }}>
                  <i style={{ transform: `scaleX(${capacity ? taken / capacity : 0})` }} />
                </div>
              </TicketCard>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function HostHome() {
  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">Host</div>
          <h1>Your concerts</h1>
        </div>
        <form action={createEvent}>
          <SubmitButton pendingLabel="Creating…">
            <Icon name="plus" /> New concert
          </SubmitButton>
        </form>
      </div>
      <Suspense
        fallback={
          <div className="event-grid">
            {[0, 1].map((i) => (
              <div key={i} className="sk" style={{ height: 150, borderRadius: 12 }} />
            ))}
          </div>
        }
      >
        <EventList />
      </Suspense>
    </>
  );
}
