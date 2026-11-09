import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { parseTicketStyle, STOCKS } from "@/components/ticket-card";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDay, formatShort, formatTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { signTicketCode } from "@/lib/ticket-code";
import { googleCalendarUrl } from "./calendar";
import { HeroTicket } from "./hero-ticket";
import { ReferralCard } from "./referral-card";

export const metadata: Metadata = { title: "Your ticket", robots: { index: false } };

async function TicketView({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      event: { include: { org: { select: { name: true } }, artists: { orderBy: { sortOrder: "asc" }, take: 1 } } },
      ticketType: true,
      order: { select: { id: true, qty: true, amountPaise: true, email: true, status: true } },
      checkedInBy: { select: { name: true } },
    },
  });
  if (!ticket || ticket.order.status !== "PAID") notFound();
  const { event } = ticket;
  const code = signTicketCode(ticket.id, env().TICKET_SIGNING_SECRET);
  const qrSvg = await QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#16130f", light: "#ffffff" } });
  const style = parseTicketStyle(event.ticketStock);
  const siblings = await db.ticket.findMany({ where: { orderId: ticket.orderId }, orderBy: { seq: "asc" }, select: { id: true } });

  return (
    <main className="ticket-page" style={{ ["--accent" as string]: event.accentHex }}>
      <section aria-label="Your ticket">
        {siblings.length > 1 ? (
          <nav className="tabs" aria-label="Tickets in this order">
            {siblings.map((s, i) => (
              <Link key={s.id} className={`btn btn-sm ${s.id === ticket.id ? "btn-ink" : ""}`} href={`/t/${s.id}`} aria-current={s.id === ticket.id ? "page" : undefined}>
                Ticket {i + 1} of {siblings.length}
              </Link>
            ))}
          </nav>
        ) : null}
        <HeroTicket
          orgName={event.org.name}
          eventName={event.name}
          headliner={event.artists[0]?.name ?? event.tagline ?? null}
          holder={ticket.holderName}
          typeName={ticket.ticketType.name}
          date={formatDay(event.startsAt)}
          doors={formatTime(event.doorsAt ?? event.startsAt)}
          admits={ticket.admits}
          price={ticket.order.amountPaise ? formatPaise(Math.round(ticket.order.amountPaise / ticket.order.qty)) : "FREE"}
          serial={ticket.serial}
          qrSvg={qrSvg}
          stockColor={STOCKS[style.stock].color}
          stockInk={STOCKS[style.stock].ink}
          pattern={style.pattern}
          isDemo={event.isDemo}
          checkedIn={ticket.checkedInAt ? { at: formatShort(ticket.checkedInAt), by: ticket.checkedInBy?.name ?? "the gate" } : null}
        />
        <p className="xs muted" style={{ textAlign: "center", marginTop: 12 }}>
          Drag the ticket and let go. At the gate, turn your brightness up.
        </p>
      </section>

      <section className="side stack" aria-labelledby="s-h">
        <div>
          <p className="label" style={{ color: "var(--accent)" }}>
            {ticket.checkedInAt ? `Checked in · ${formatShort(ticket.checkedInAt)}` : `${ticket.ticketType.name} · ${ticket.admits > 1 ? `admits ${ticket.admits}` : "admit one"}`}
          </p>
          <h1 id="s-h" style={{ marginTop: 6 }}>
            See you at the front, {ticket.holderName.split(" ")[0]}.
          </h1>
          <p className="small muted" style={{ marginTop: 8 }}>
            {event.venue}
            {event.venueAddress ? `, ${event.venueAddress}` : ""}. This page works offline once loaded. Each QR gets in once.
          </p>
        </div>
        <div>
          <p className="label" style={{ marginBottom: 8 }}>
            Add to calendar
          </p>
          <div className="acts">
            <a className="btn" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
              <Icon name="calendar" /> Google
            </a>
            <a className="btn" href={`/t/${ticket.id}/ics`} download>
              <Icon name="download" /> Apple / Outlook
            </a>
          </div>
        </div>
        <ReferralCard ticketId={ticket.id} />
        <div className="row wrap">
          <Link className="btn btn-ghost btn-sm" href={`/c/${event.slug}`}>
            Concert details
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/o/${ticket.order.id}`}>
            All tickets in this order
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  return (
    <Suspense fallback={<main className="ticket-page"><div className="sk" style={{ height: 620, borderRadius: 18 }} /></main>}>
      <TicketView params={params} />
    </Suspense>
  );
}
