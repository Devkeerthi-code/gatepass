import "server-only";
import { db, type Tx } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { transaction } from "@/lib/tx";
import { currentUnitPrice } from "@/lib/pricing";

export const HOLD_MINUTES = 10;
export const WAITLIST_OFFER_MINUTES = 15;

type ExpireFilter = { now: Date; ticketTypeId?: string; eventId?: string; orderId?: string; force?: boolean };

/**
 * Expires PENDING orders and gives their seats and promo uses back, all in one statement.
 * Concurrent callers can't double-release: the UPDATE on "Order" only matches rows still PENDING.
 * `force` releases an order before its hold runs out (buyer cancelled).
 */
export async function expireOrders(tx: Tx, filter: ExpireFilter): Promise<number> {
  const { now, ticketTypeId = null, eventId = null, orderId = null, force = false } = filter;
  const rows = await tx.$queryRaw<{ released: number }[]>`
    WITH expired AS (
      UPDATE "Order" SET "status" = 'EXPIRED'
      WHERE "status" = 'PENDING'
        AND (${force}::boolean OR "holdExpiresAt" < ${now})
        AND (${ticketTypeId}::text IS NULL OR "ticketTypeId" = ${ticketTypeId})
        AND (${eventId}::text IS NULL OR "eventId" = ${eventId})
        AND (${orderId}::text IS NULL OR "id" = ${orderId})
      RETURNING "id", "ticketTypeId", "qty", "promoId"
    ), seats AS (
      UPDATE "TicketType" t SET "reserved" = t."reserved" - e.total
      FROM (SELECT "ticketTypeId", SUM("qty")::int AS total FROM expired GROUP BY 1) e
      WHERE t."id" = e."ticketTypeId"
      RETURNING t."id"
    ), promos AS (
      UPDATE "PromoCode" p SET "used" = p."used" - e.n
      FROM (SELECT "promoId", COUNT(*)::int AS n FROM expired WHERE "promoId" IS NOT NULL GROUP BY 1) e
      WHERE p."id" = e."promoId"
      RETURNING p."id"
    ), redemptions AS (
      DELETE FROM "PromoRedemption" r USING expired e WHERE r."orderId" = e."id" RETURNING r."id"
    ), lapsed AS (
      UPDATE "WaitlistEntry" w SET "status" = 'LAPSED'
      FROM expired e WHERE w."offerOrderId" = e."id"
      RETURNING w."id"
    )
    SELECT COUNT(*)::int AS released FROM expired`;
  return rows[0]?.released ?? 0;
}

/** Atomically takes `qty` seats if they fit. Returns seats taken before this hold, or null if sold out. */
export async function reserveSeats(tx: Tx, ticketTypeId: string, qty: number): Promise<number | null> {
  const rows = await tx.$queryRaw<{ reserved: number }[]>`
    UPDATE "TicketType" SET "reserved" = "reserved" + ${qty}
    WHERE "id" = ${ticketTypeId} AND "reserved" + ${qty} <= "capacity"
    RETURNING "reserved"`;
  return rows.length ? rows[0].reserved - qty : null;
}

export type HoldInput = {
  ticketTypeId: string;
  qty: number;
  idempotencyKey: string;
  accessCode?: string | null;
  referralCode?: string | null;
  now: Date;
};

export type HoldError = "NOT_FOUND" | "NOT_ON_SALE" | "SALE_ENDED" | "LIMIT" | "ACCESS_CODE" | "SOLD_OUT";
export type HoldResult = { ok: true; orderId: string } | { ok: false; error: HoldError; message: string };

function saleWindowError(tt: { salesStart: Date | null; salesEnd: Date | null }, now: Date): { error: HoldError; message: string } | null {
  if (tt.salesStart && now < tt.salesStart) return { error: "NOT_ON_SALE", message: "This ticket isn't on sale yet." };
  if (tt.salesEnd && now > tt.salesEnd) return { error: "SALE_ENDED", message: "Sales for this ticket have closed." };
  return null;
}

/** Holds seats for HOLD_MINUTES. Repeating a request with the same idempotency key returns the same order. */
export async function createHold(tx: Tx, input: HoldInput): Promise<HoldResult> {
  const { ticketTypeId, qty, idempotencyKey, now } = input;

  const existing = await tx.order.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (existing) return { ok: true, orderId: existing.id };

  await refreshTicketType(tx, ticketTypeId, now);

  const tt = await tx.ticketType.findUnique({
    where: { id: ticketTypeId },
    include: { event: { select: { id: true, status: true } }, priceSteps: true },
  });
  if (!tt || tt.event.status !== "PUBLISHED") return { ok: false, error: "NOT_FOUND", message: "Ticket not found." };

  const windowError = saleWindowError(tt, now);
  if (windowError) return { ok: false, ...windowError };
  if (qty < 1 || qty > tt.perOrderLimit) {
    return { ok: false, error: "LIMIT", message: `You can buy up to ${tt.perOrderLimit} per order.` };
  }
  if (tt.accessCode && tt.accessCode.toUpperCase() !== (input.accessCode ?? "").trim().toUpperCase()) {
    return { ok: false, error: "ACCESS_CODE", message: "That access code isn't right." };
  }

  const seatsBefore = await reserveSeats(tx, ticketTypeId, qty);
  if (seatsBefore === null) {
    const left = Math.max(0, tt.capacity - tt.reserved);
    const message = left > 0 ? `Only ${left} left. Try a smaller quantity.` : "Sold out.";
    return { ok: false, error: "SOLD_OUT", message };
  }

  const unitPricePaise = currentUnitPrice(tt.pricePaise, tt.priceSteps, seatsBefore);
  const referral = input.referralCode
    ? await tx.referralLink.findUnique({
        where: { eventId_code: { eventId: tt.eventId, code: input.referralCode.toUpperCase() } },
        select: { id: true },
      })
    : null;

  const order = await tx.order.create({
    data: {
      eventId: tt.eventId,
      ticketTypeId,
      qty,
      unitPricePaise,
      amountPaise: unitPricePaise * qty,
      holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
      idempotencyKey,
      referralId: referral?.id ?? null,
    },
    select: { id: true },
  });
  return { ok: true, orderId: order.id };
}

/** Lazy release on read: expire stale holds, then let the waitlist claim freed seats before new buyers. */
export async function refreshTicketType(tx: Tx, ticketTypeId: string, now: Date): Promise<void> {
  await expireOrders(tx, { now, ticketTypeId });
  await offerWaitlist(tx, ticketTypeId, now);
}

/**
 * Offers freed seats to the waitlist in join order. Each offer is a held order the person
 * can complete from their waitlist link before WAITLIST_OFFER_MINUTES run out.
 */
export async function offerWaitlist(tx: Tx, ticketTypeId: string, now: Date): Promise<number> {
  const waiting = await tx.waitlistEntry.findMany({
    where: { ticketTypeId, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  let offered = 0;
  for (const entry of waiting) {
    const seatsBefore = await reserveSeats(tx, ticketTypeId, entry.qty);
    if (seatsBefore === null) break;
    const tt = await tx.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId }, include: { priceSteps: true } });
    const unit = currentUnitPrice(tt.pricePaise, tt.priceSteps, seatsBefore);
    const expiresAt = new Date(now.getTime() + WAITLIST_OFFER_MINUTES * 60_000);
    const order = await tx.order.create({
      data: {
        eventId: tt.eventId,
        ticketTypeId,
        qty: entry.qty,
        unitPricePaise: unit,
        amountPaise: unit * entry.qty,
        holdExpiresAt: expiresAt,
        source: "WAITLIST",
        buyerName: entry.name,
        email: entry.email,
        phone: entry.phone,
      },
    });
    await tx.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: "OFFERED", offerOrderId: order.id, offerExpiresAt: expiresAt },
    });
    offered += 1;
  }
  return offered;
}

/** createHold in its own transaction. A racing duplicate request resolves to the first request's order. */
export async function placeHold(input: HoldInput): Promise<HoldResult> {
  try {
    return await transaction((tx) => createHold(tx, input));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await db.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
    if (!existing) throw err;
    return { ok: true, orderId: existing.id };
  }
}
