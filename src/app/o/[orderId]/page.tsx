import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { parseTicketStyle, TicketCard } from "@/components/ticket-card";
import { db } from "@/lib/db";
import { formatDay, formatTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { AutoRefresh } from "./auto-refresh";

export const metadata: Metadata = { title: "Your order" };

type Props = { params: Promise<{ orderId: string }>; searchParams: Promise<{ via?: string }> };

async function Order({ params, searchParams }: Props) {
  const [{ orderId }, { via }] = await Promise.all([params, searchParams]);
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { event: true, ticketType: true, tickets: { orderBy: { seq: "asc" } } },
  });
  if (!order) notFound();
  const { event } = order;
  const style = parseTicketStyle(event.ticketStock);

  if (order.status === "PENDING") {
    return (
      <div className="card card-lg stack" role="status">
        <AutoRefresh until={order.holdExpiresAt.toISOString()} />
        <span className="spinner" aria-hidden="true" />
        <h1 className="display" style={{ fontSize: "var(--t-xl)" }}>
          Confirming your payment…
        </h1>
        <p className="small muted">
          {via === "webhook"
            ? "You closed checkout before it returned. The payment provider's webhook will confirm it in a few seconds. Keep this page open."
            : "This usually takes a few seconds. Don't pay again. This page updates by itself."}
        </p>
        <Link className="btn btn-ghost btn-sm" href={`/checkout/${order.id}`}>
          Back to checkout
        </Link>
      </div>
    );
  }

  if (order.status === "EXPIRED" || order.status === "FAILED") {
    return (
      <div className="card card-lg stack">
        <Icon name="hourglass" />
        <h1 className="display" style={{ fontSize: "var(--t-xl)" }}>
          This hold expired
        </h1>
        <p className="small muted">No payment was taken for this order, and the seats were released.</p>
        <Link className="btn btn-accent" href={`/c/${event.slug}`}>
          Back to tickets
        </Link>
      </div>
    );
  }

  if (order.status === "REFUNDED") {
    return (
      <div className="card card-lg stack">
        <Icon name="refresh" />
        <h1 className="display" style={{ fontSize: "var(--t-xl)" }}>
          This order was refunded
        </h1>
        <p className="small muted">
          {order.amountPaise
            ? `${formatPaise(order.amountPaise)} was sent back to your original payment method${order.refundedAt ? ` on ${formatDay(order.refundedAt)}` : ""}. Banks usually take 5–7 working days.`
            : "These free tickets were cancelled by the organiser."}{" "}
          The QR codes no longer work.
        </p>
        <Link className="btn" href={`/c/${event.slug}`}>
          Concert page
        </Link>
      </div>
    );
  }

  if (order.status === "NEEDS_REFUND") {
    return (
      <div className="card card-lg stack" role="alert">
        <Icon name="alert" />
        <h1 className="display" style={{ fontSize: "var(--t-xl)" }}>
          Paid, but the seats were gone
        </h1>
        <p className="small muted">
          Your payment arrived after your hold expired and the last seats sold. No ticket was issued, and the organiser has been flagged to
          refund {formatPaise(order.amountPaise)}. Keep this page as proof: order {order.id.slice(0, 8)}.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="label" style={{ color: "var(--accent)" }}>
        Paid · {order.tickets.length} ticket{order.tickets.length > 1 ? "s" : ""} ·{" "}
        {order.amountPaise ? formatPaise(order.amountPaise) : "Free"}
      </p>
      <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
        You&apos;re in, {order.buyerName.split(" ")[0]}.
      </h1>
      <p className="small muted">
        {formatDay(event.startsAt)} · {formatTime(event.doorsAt ?? event.startsAt)} · {event.venue}. Open each ticket below and keep the
        link. You can find them again with your email and phone.
      </p>
      <ul className="stack" role="list" style={{ padding: 0, listStyle: "none" }}>
        {order.tickets.map((t, i) => (
          <li key={t.id}>
            <Link href={`/t/${t.id}`} className="event-link">
              <TicketCard
                name={event.name}
                kicker={`Ticket ${i + 1} of ${order.tickets.length} · ${order.ticketType.name}`}
                perks={t.admits > 1 ? `Admits ${t.admits}` : "Admit one"}
                price="OPEN"
                priceNote="QR →"
                serial={t.serial}
                stock={style.stock}
                pattern={style.pattern}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OrderPage(props: Props) {
  return (
    <main id="main" className="container narrow">
      <Suspense fallback={<div className="sk" style={{ height: 320, borderRadius: 18 }} />}>
        <Order {...props} />
      </Suspense>
    </main>
  );
}
