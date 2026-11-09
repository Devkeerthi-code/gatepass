import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireViewer } from "@/server/auth";
import { PromoHub } from "./promo-hub";

export const metadata: Metadata = { title: "Promotions" };

async function Promos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("promo:manage");
  const event = await db.event.findFirst({
    where: { id, orgId: viewer.orgId },
    include: {
      ticketTypes: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, isDrop: true, salesStart: true, _count: { select: { dropAlerts: true } } },
      },
      promos: { orderBy: { createdAt: "desc" } },
      giveaways: {
        orderBy: { createdAt: "desc" },
        include: {
          ticketType: { select: { name: true } },
          entries: { where: { isWinner: true }, select: { name: true, orderId: true } },
          _count: { select: { entries: true } },
        },
      },
      referrals: { include: { orders: { where: { status: "PAID" }, select: { qty: true } } } },
    },
  });
  if (!event) notFound();
  const waitlist = await db.waitlistEntry.groupBy({
    by: ["ticketTypeId", "status"],
    where: { ticketType: { eventId: event.id } },
    _count: { _all: true },
  });

  const tierName = new Map(event.ticketTypes.map((t) => [t.id, t.name]));
  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">
            <Link href={`/host/events/${event.id}`}>{event.name}</Link> / Promotions
          </div>
          <h1>Promotions</h1>
        </div>
      </div>
      <PromoHub
        eventId={event.id}
        tiers={event.ticketTypes.map((t) => ({ id: t.id, name: t.name }))}
        promos={event.promos.map((p) => ({
          id: p.id,
          code: p.code,
          label: p.label,
          kind: p.kind,
          value: p.value,
          autoApply: p.autoApply,
          used: p.used,
          maxUses: p.maxUses,
          active: p.active,
          emailDomain: p.emailDomain,
          minQty: p.minQty,
          endsAt: p.endsAt?.toISOString() ?? null,
          startsAt: p.startsAt?.toISOString() ?? null,
          tiers: p.ticketTypeIds.map((t) => tierName.get(t) ?? "?"),
        }))}
        giveaways={event.giveaways.map((g) => ({
          id: g.id,
          title: g.title,
          prize: g.ticketType.name,
          closesAt: g.closesAt.toISOString(),
          winnersCount: g.winnersCount,
          entries: g._count.entries,
          status: g.status,
          seedHash: g.seedHash,
          seed: g.status === "DRAWN" ? g.seed : null,
          winners: g.entries.map((e) => e.name),
        }))}
        drops={event.ticketTypes
          .filter((t) => t.isDrop)
          .map((t) => ({ id: t.id, name: t.name, at: t.salesStart?.toISOString() ?? null, subscribers: t._count.dropAlerts }))}
        referrals={event.referrals
          .map((r) => ({ code: r.code, name: r.ownerName, sold: r.orders.reduce((a, o) => a + o.qty, 0), rewardAfter: r.rewardAfter }))
          .sort((a, b) => b.sold - a.sold)
          .slice(0, 10)}
        waitlist={event.ticketTypes
          .map((t) => ({
            tier: t.name,
            waiting: waitlist.find((w) => w.ticketTypeId === t.id && w.status === "WAITING")?._count._all ?? 0,
            offered: waitlist.find((w) => w.ticketTypeId === t.id && w.status === "OFFERED")?._count._all ?? 0,
            claimed: waitlist.find((w) => w.ticketTypeId === t.id && w.status === "CLAIMED")?._count._all ?? 0,
          }))
          .filter((w) => w.waiting + w.offered + w.claimed > 0)}
      />
    </>
  );
}

export default function PromosPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="sk" style={{ height: 480, borderRadius: 18 }} />}>
      <Promos params={params} />
    </Suspense>
  );
}
