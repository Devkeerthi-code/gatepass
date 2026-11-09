import "server-only";
import { db } from "@/lib/db";
import { currentUnitPrice, nextPriceStep } from "@/lib/pricing";
import { transaction } from "@/lib/tx";
import { expireOrders, offerWaitlist } from "./inventory";

export type TierState = "ON_SALE" | "SOLD_OUT" | "NOT_YET" | "DROP" | "ENDED";

export type PublicTier = {
  id: string;
  name: string;
  description: string | null;
  pricePaise: number;
  admits: number;
  perOrderLimit: number;
  remaining: number;
  capacity: number;
  state: TierState;
  salesStart: string | null;
  salesEnd: string | null;
  nextStep: { pricePaise: number; seatsUntil: number } | null;
  ladderProgress: number | null;
  locked: boolean;
};

function tierState(
  t: { capacity: number; reserved: number; salesStart: Date | null; salesEnd: Date | null; isDrop: boolean },
  now: Date,
): TierState {
  if (t.salesEnd && now > t.salesEnd) return "ENDED";
  if (t.salesStart && now < t.salesStart) return t.isDrop ? "DROP" : "NOT_YET";
  if (t.reserved >= t.capacity) return "SOLD_OUT";
  return "ON_SALE";
}

/**
 * Loads a published concert for its public page. Reading inventory first releases expired holds
 * (and offers freed seats to the waitlist), so availability is always current without a frequent cron.
 */
export async function getPublicEvent(slug: string, accessCode: string | null) {
  const base = await db.event.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!base || base.status !== "PUBLISHED") return null;

  const now = new Date();
  await transaction(async (tx) => {
    await expireOrders(tx, { now, eventId: base.id });
    const waiting = await tx.waitlistEntry.findMany({
      where: { status: "WAITING", ticketType: { eventId: base.id } },
      distinct: ["ticketTypeId"],
      select: { ticketTypeId: true },
    });
    for (const w of waiting) await offerWaitlist(tx, w.ticketTypeId, now);
  });

  const event = await db.event.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      org: { select: { name: true } },
      artists: { orderBy: { sortOrder: "asc" } },
      faqs: { orderBy: { sortOrder: "asc" } },
      ticketTypes: { orderBy: { sortOrder: "asc" }, include: { priceSteps: true } },
      giveaways: {
        where: { status: "OPEN", closesAt: { gt: now } },
        orderBy: { closesAt: "asc" },
        take: 1,
        include: { ticketType: { select: { name: true } }, _count: { select: { entries: true } } },
      },
    },
  });

  const code = accessCode?.trim().toUpperCase() ?? null;
  const tiers: PublicTier[] = event.ticketTypes
    .filter((t) => !t.accessCode || t.accessCode === code)
    .map((t) => {
      const next = nextPriceStep(t.priceSteps, t.reserved);
      const lastStep = [...t.priceSteps].sort((a, b) => b.afterSold - a.afterSold)[0];
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        pricePaise: currentUnitPrice(t.pricePaise, t.priceSteps, t.reserved),
        admits: t.admits,
        perOrderLimit: t.perOrderLimit,
        remaining: Math.max(0, t.capacity - t.reserved),
        capacity: t.capacity,
        state: tierState(t, now),
        salesStart: t.salesStart?.toISOString() ?? null,
        salesEnd: t.salesEnd?.toISOString() ?? null,
        nextStep: next ? { pricePaise: next.pricePaise, seatsUntil: next.afterSold - t.reserved } : null,
        ladderProgress: lastStep ? Math.min(1, t.reserved / lastStep.afterSold) : null,
        locked: !!t.accessCode,
      };
    });

  const hasHiddenTiers = event.ticketTypes.some((t) => t.accessCode && t.accessCode !== code);
  const sold = event.ticketTypes.reduce((a, t) => a + t.reserved, 0);
  const capacity = event.ticketTypes.reduce((a, t) => a + t.capacity, 0);
  return { event, tiers, hasHiddenTiers, sold, capacity };
}
