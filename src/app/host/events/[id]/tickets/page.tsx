import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { toLocalInput } from "@/lib/format";
import { requireViewer } from "@/server/auth";
import { TierBoard } from "./tier-board";

export const metadata: Metadata = { title: "Tickets" };

function saleState(t: { reserved: number; capacity: number; salesStart: Date | null; salesEnd: Date | null; isDrop: boolean }, now: Date): string {
  if (t.reserved >= t.capacity) return "Sold out";
  if (t.salesEnd && t.salesEnd < now) return "Closed";
  if (t.salesStart && t.salesStart > now) return t.isDrop ? "Drop scheduled" : "Not on sale yet";
  return "On sale";
}

async function Tiers({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("event:manage");
  const event = await db.event.findFirst({
    where: { id, orgId: viewer.orgId },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" }, include: { priceSteps: { orderBy: { afterSold: "asc" } }, _count: { select: { waitlist: true, dropAlerts: true } } } } },
  });
  if (!event) notFound();
  const now = new Date();
  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">
            <Link href={`/host/events/${id}`}>{event.name}</Link> / Tickets
          </div>
          <h1>Tickets</h1>
        </div>
      </div>
      <TierBoard
        eventId={event.id}
        ticketStock={event.ticketStock}
        tiers={event.ticketTypes.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description ?? "",
          priceRupees: t.pricePaise / 100,
          capacity: t.capacity,
          reserved: t.reserved,
          admits: t.admits,
          perOrderLimit: t.perOrderLimit,
          salesStart: toLocalInput(t.salesStart),
          salesEnd: toLocalInput(t.salesEnd),
          isDrop: t.isDrop,
          accessCode: t.accessCode ?? "",
          steps: t.priceSteps.map((s) => ({ afterSold: s.afterSold, priceRupees: s.pricePaise / 100 })),
          waitlist: t._count.waitlist,
          dropAlerts: t._count.dropAlerts,
          saleState: saleState(t, now),
        }))}
      />
    </>
  );
}

export default function TicketsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="sk" style={{ height: 360, borderRadius: 18 }} />}>
      <Tiers params={params} />
    </Suspense>
  );
}
