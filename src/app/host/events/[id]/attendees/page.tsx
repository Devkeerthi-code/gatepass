import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { db } from "@/lib/db";
import { formatShort } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { requireViewer } from "@/server/auth";
import { CompForm } from "./comp-form";

export const metadata: Metadata = { title: "Attendees" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> };

async function Attendees({ params, searchParams }: Props) {
  const [{ id }, { q }] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer("attendees:view");
  const event = await db.event.findFirst({ where: { id, orgId: viewer.orgId }, include: { ticketTypes: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } } });
  if (!event) notFound();
  const query = q?.trim() ?? "";
  const search = query
    ? { OR: [{ buyerName: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }, { phone: { contains: query } }] }
    : {};

  const [orders, refunds] = await Promise.all([
    db.order.findMany({
      where: { eventId: event.id, status: "PAID", ...search },
      orderBy: { paidAt: "desc" },
      take: 200,
      include: { ticketType: { select: { name: true } }, tickets: { select: { id: true, serial: true, checkedInAt: true }, orderBy: { seq: "asc" } }, promo: { select: { code: true } } },
    }),
    db.order.findMany({ where: { eventId: event.id, status: "NEEDS_REFUND" }, include: { ticketType: { select: { name: true } } } }),
  ]);

  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">
            <Link href={`/host/events/${event.id}`}>{event.name}</Link> / Attendees
          </div>
          <h1>Attendees</h1>
        </div>
        <a className="btn btn-sm" href={`/api/events/${event.id}/export`}>
          <Icon name="download" small /> Export CSV
        </a>
      </div>

      {refunds.length ? (
        <div className="card stack notice-no" style={{ marginBottom: 16 }}>
          <h2>Needs refund ({refunds.length})</h2>
          <p className="small muted">These buyers paid after their hold expired and the tier had sold out, so no ticket was issued. Refund them from your Razorpay dashboard using the payment ID.</p>
          <ul className="stack" role="list" style={{ listStyle: "none", padding: 0 }}>
            {refunds.map((r) => (
              <li key={r.id} className="row between wrap small">
                <span>
                  <b>{r.buyerName}</b> · {r.email} · {r.phone} · {r.qty} × {r.ticketType.name}
                </span>
                <span className="mono xs">
                  {formatPaise(r.amountPaise)} · {r.providerPaymentId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="att-grid">
        <div className="card stack" style={{ overflowX: "auto" }}>
          <form className="input-group" role="search">
            <label className="sr-only" htmlFor="att-q">
              Search attendees
            </label>
            <input id="att-q" name="q" className="input" defaultValue={query} placeholder="Name, email or phone" />
            <button className="btn" type="submit">
              <Icon name="search" small /> Search
            </button>
          </form>
          {orders.length === 0 ? (
            <p className="small muted">{query ? `No one matches “${query}”.` : "No tickets sold yet. Share your concert link to get going."}</p>
          ) : (
            <table className="table">
              <caption className="sr-only">Paid orders</caption>
              <thead>
                <tr>
                  <th scope="col">Buyer</th>
                  <th scope="col">Tickets</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Entry</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const inCount = o.tickets.filter((t) => t.checkedInAt).length;
                  return (
                    <tr key={o.id}>
                      <td>
                        <b>{o.buyerName}</b>
                        <div className="xs muted">
                          {o.email} · {o.phone}
                        </div>
                        <div className="xs muted">{o.college}</div>
                      </td>
                      <td>
                        {o.qty} × {o.ticketType.name}
                        <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                          {o.tickets.map((t) => (
                            <Link key={t.id} className="chip mono" href={`/t/${t.id}`} target="_blank">
                              {t.serial.split("-").slice(-2).join("-")}
                            </Link>
                          ))}
                        </div>
                      </td>
                      <td className="mono small">
                        {o.amountPaise ? formatPaise(o.amountPaise) : o.source === "COMP" ? "Guest" : o.source === "GIVEAWAY" ? "Giveaway" : "Free"}
                        {o.promo ? <div className="xs muted">{o.promo.code}</div> : null}
                        <div className="xs muted">{o.paidAt ? formatShort(o.paidAt) : ""}</div>
                      </td>
                      <td>
                        <span className={`chip ${inCount === o.tickets.length ? "chip-ok" : inCount ? "chip-warn" : ""}`}>
                          {inCount}/{o.tickets.length} in
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {orders.length === 200 ? <p className="xs muted">Showing the latest 200. Search or export CSV for everyone.</p> : null}
        </div>
        <CompForm eventId={event.id} tiers={event.ticketTypes} />
      </div>
    </>
  );
}

export default function AttendeesPage(props: Props) {
  return (
    <Suspense fallback={<div className="sk" style={{ height: 420, borderRadius: 18 }} />}>
      <Attendees {...props} />
    </Suspense>
  );
}
