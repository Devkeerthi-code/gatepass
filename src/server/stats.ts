import "server-only";
import { db } from "@/lib/db";

export type EventStats = {
  perType: { id: string; name: string; paidSeats: number; heldSeats: number; capacity: number; admits: number }[];
  revenuePaise: number;
  discountPaise: number;
  ordersPaid: number;
  ticketsSold: number;
  peopleSold: number;
  peopleIn: number;
  entries: { bucket: string; people: number }[];
  recent: { id: string; name: string; type: string; at: string; by: string }[];
  needsRefund: number;
  generatedAt: string;
};

/** Live numbers for the host dashboard. "People" counts admits, so a Group of 4 counts as 4. */
export async function eventStats(eventId: string): Promise<EventStats> {
  const [types, paidByType, heldByType, money, tickets, entries, recent, needsRefund] = await Promise.all([
    db.ticketType.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, capacity: true, admits: true },
    }),
    db.order.groupBy({ by: ["ticketTypeId"], where: { eventId, status: "PAID" }, _sum: { qty: true } }),
    db.order.groupBy({
      by: ["ticketTypeId"],
      where: { eventId, status: "PENDING", holdExpiresAt: { gt: new Date() } },
      _sum: { qty: true },
    }),
    db.order.aggregate({ where: { eventId, status: "PAID" }, _sum: { amountPaise: true, discountPaise: true }, _count: { _all: true } }),
    db.ticket.aggregate({ where: { eventId, order: { status: "PAID" } }, _sum: { admits: true }, _count: { _all: true } }),
    db.$queryRaw<{ bucket: Date; people: number }[]>`
      SELECT date_bin('15 minutes', "checkedInAt", TIMESTAMP '2000-01-01') AS bucket, SUM("admits")::int AS people
      FROM "Ticket" WHERE "eventId" = ${eventId} AND "checkedInAt" IS NOT NULL
      GROUP BY 1 ORDER BY 1`,
    db.ticket.findMany({
      where: { eventId, checkedInAt: { not: null } },
      orderBy: { checkedInAt: "desc" },
      take: 8,
      select: {
        id: true,
        holderName: true,
        checkedInAt: true,
        ticketType: { select: { name: true } },
        checkedInBy: { select: { name: true } },
      },
    }),
    db.order.count({ where: { eventId, status: "NEEDS_REFUND" } }),
  ]);

  const paid = new Map(paidByType.map((p) => [p.ticketTypeId, p._sum.qty ?? 0]));
  const held = new Map(heldByType.map((p) => [p.ticketTypeId, p._sum.qty ?? 0]));
  const peopleIn = entries.reduce((a, e) => a + e.people, 0);

  return {
    perType: types.map((t) => ({ ...t, paidSeats: paid.get(t.id) ?? 0, heldSeats: held.get(t.id) ?? 0 })),
    revenuePaise: money._sum.amountPaise ?? 0,
    discountPaise: money._sum.discountPaise ?? 0,
    ordersPaid: money._count._all,
    ticketsSold: tickets._count._all,
    peopleSold: tickets._sum.admits ?? 0,
    peopleIn,
    entries: entries.map((e) => ({ bucket: e.bucket.toISOString(), people: e.people })),
    recent: recent.map((r) => ({
      id: r.id,
      name: r.holderName,
      type: r.ticketType.name,
      at: r.checkedInAt!.toISOString(),
      by: r.checkedInBy?.name ?? "—",
    })),
    needsRefund,
    generatedAt: new Date().toISOString(),
  };
}
