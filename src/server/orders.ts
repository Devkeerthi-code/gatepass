import "server-only";
import type { Tx } from "@/lib/db";
import { newTicketId } from "@/lib/ticket-code";
import { checkPromoEligibility, promoDiscount } from "@/lib/pricing";
import { reserveSeats } from "./inventory";

type IssuableOrder = { id: string; eventId: string; ticketTypeId: string; qty: number; buyerName: string };

/** Creates one ticket per seat. unique(orderId, seq) + skipDuplicates make this safe to call twice. */
export async function issueTickets(tx: Tx, order: IssuableOrder): Promise<void> {
  const tt = await tx.ticketType.findUniqueOrThrow({
    where: { id: order.ticketTypeId },
    select: { admits: true, event: { select: { serialPrefix: true } } },
  });
  const orderTag = order.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  await tx.ticket.createMany({
    skipDuplicates: true,
    data: Array.from({ length: order.qty }, (_, seq) => ({
      id: newTicketId(),
      orderId: order.id,
      seq,
      eventId: order.eventId,
      ticketTypeId: order.ticketTypeId,
      holderName: order.buyerName,
      admits: tt.admits,
      serial: `${tt.event.serialPrefix}-${orderTag}-${String(seq + 1).padStart(2, "0")}`,
    })),
  });
  await tx.waitlistEntry.updateMany({ where: { offerOrderId: order.id }, data: { status: "CLAIMED" } });
}

export type ConfirmOutcome =
  | { status: "ISSUED"; orderId: string; late: boolean }
  | { status: "ALREADY_PAID"; orderId: string }
  | { status: "NEEDS_REFUND"; orderId: string }
  | { status: "NOT_FOUND" }
  | { status: "AMOUNT_MISMATCH"; orderId: string };

export type ConfirmInput = {
  providerOrderId: string;
  providerPaymentId: string;
  /** Webhooks report the captured amount; checkout callbacks don't. */
  amountPaise?: number;
  now: Date;
};

/**
 * The single place a payment turns into tickets. Both the checkout callback and the webhook call it.
 * Each state change is a conditional UPDATE, so retries and both paths racing can't double-issue.
 */
export async function confirmPaid(tx: Tx, input: ConfirmInput): Promise<ConfirmOutcome> {
  const order = await tx.order.findUnique({ where: { providerOrderId: input.providerOrderId } });
  if (!order) return { status: "NOT_FOUND" };
  if (input.amountPaise !== undefined && input.amountPaise !== order.amountPaise) {
    return { status: "AMOUNT_MISMATCH", orderId: order.id };
  }

  const paidNow = await tx.$executeRaw`
    UPDATE "Order" SET "status" = 'PAID', "paidAt" = ${input.now}, "providerPaymentId" = ${input.providerPaymentId}
    WHERE "id" = ${order.id} AND "status" = 'PENDING'`;
  if (paidNow === 1) {
    await issueTickets(tx, order);
    return { status: "ISSUED", orderId: order.id, late: false };
  }

  // The hold ran out before the money arrived: claim the order, then try to get the seats back.
  const reclaimed = await tx.$executeRaw`
    UPDATE "Order" SET "status" = 'PAID', "paidAt" = ${input.now}, "providerPaymentId" = ${input.providerPaymentId}
    WHERE "id" = ${order.id} AND "status" IN ('EXPIRED', 'FAILED')`;
  if (reclaimed === 1) {
    const seats = await reserveSeats(tx, order.ticketTypeId, order.qty);
    if (seats !== null) {
      await issueTickets(tx, order);
      return { status: "ISSUED", orderId: order.id, late: true };
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "NEEDS_REFUND", failureReason: "Paid after seats sold out" } });
    return { status: "NEEDS_REFUND", orderId: order.id };
  }

  const current = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
  if (current.status === "NEEDS_REFUND") return { status: "NEEDS_REFUND", orderId: order.id };
  return { status: "ALREADY_PAID", orderId: order.id };
}

/** Free (₹0) orders skip payment entirely. */
export async function confirmFree(tx: Tx, orderId: string, now: Date): Promise<boolean> {
  const paid = await tx.$executeRaw`
    UPDATE "Order" SET "status" = 'PAID', "paidAt" = ${now}, "provider" = 'FREE'
    WHERE "id" = ${orderId} AND "status" = 'PENDING' AND "amountPaise" = 0`;
  if (paid !== 1) return false;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  await issueTickets(tx, order);
  return true;
}

export type BuyerDetails = {
  buyerName: string;
  email: string;
  phone: string;
  college: string;
  answers: Record<string, string>;
};

export type DetailsResult =
  | { ok: true; amountPaise: number; discountPaise: number; promoLabel: string | null }
  | { ok: false; error: "EXPIRED" | "NOT_FOUND" | "PROMO"; message: string };

async function undoPromo(tx: Tx, orderId: string, promoId: string): Promise<void> {
  await tx.$executeRaw`UPDATE "PromoCode" SET "used" = "used" - 1 WHERE "id" = ${promoId}`;
  await tx.promoRedemption.deleteMany({ where: { orderId } });
}

async function takePromoUse(tx: Tx, promoId: string): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "PromoCode" SET "used" = "used" + 1
    WHERE "id" = ${promoId} AND ("maxUses" IS NULL OR "used" < "maxUses")`;
  return n === 1;
}

/**
 * Saves buyer details and applies a promo: the typed code if given, otherwise the best
 * auto-applied deal (happy hour / group). Promo uses are counted atomically like seats.
 */
export async function applyDetails(
  tx: Tx,
  orderId: string,
  details: BuyerDetails,
  promoCode: string | null,
  now: Date,
): Promise<DetailsResult> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "NOT_FOUND", message: "Order not found." };
  if (order.status !== "PENDING" || order.holdExpiresAt <= now) {
    return { ok: false, error: "EXPIRED", message: "Your hold ran out and the seats were released." };
  }
  if (order.promoId) await undoPromo(tx, order.id, order.promoId);

  const ctx = { ticketTypeId: order.ticketTypeId, qty: order.qty, email: details.email, now };
  let chosen: { id: string; label: string; discount: number } | null = null;

  if (promoCode) {
    const promo = await tx.promoCode.findUnique({
      where: { eventId_code: { eventId: order.eventId, code: promoCode.trim().toUpperCase() } },
    });
    if (!promo || promo.autoApply) return { ok: false, error: "PROMO", message: "That code doesn't exist." };
    const check = checkPromoEligibility(promo, ctx);
    if (!check.ok) return { ok: false, error: "PROMO", message: check.reason };
    // Serialises checkouts for the same (code, email) so per-person limits can't be raced.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${promo.id}:${details.email.toLowerCase()}`}))`;
    const usedByEmail = await tx.promoRedemption.count({
      where: { promoId: promo.id, email: details.email.toLowerCase(), orderId: { not: order.id } },
    });
    if (usedByEmail >= promo.perEmailLimit) {
      return { ok: false, error: "PROMO", message: "You've already used this code." };
    }
    if (!(await takePromoUse(tx, promo.id))) return { ok: false, error: "PROMO", message: "This code has been fully used." };
    chosen = { id: promo.id, label: promo.label ?? promo.code, discount: promoDiscount(promo, order.unitPricePaise, order.qty) };
  } else {
    const deals = await tx.promoCode.findMany({ where: { eventId: order.eventId, autoApply: true, active: true } });
    const ranked = deals
      .filter((d) => checkPromoEligibility(d, ctx).ok)
      .map((d) => ({ id: d.id, label: d.label ?? d.code, discount: promoDiscount(d, order.unitPricePaise, order.qty) }))
      .sort((a, b) => b.discount - a.discount);
    for (const deal of ranked) {
      if (deal.discount > 0 && (await takePromoUse(tx, deal.id))) {
        chosen = deal;
        break;
      }
    }
  }

  const subtotal = order.unitPricePaise * order.qty;
  const discountPaise = chosen?.discount ?? 0;
  const amountPaise = subtotal - discountPaise;
  await tx.order.update({
    where: { id: order.id },
    data: {
      ...details,
      email: details.email.toLowerCase(),
      promoId: chosen?.id ?? null,
      discountPaise,
      amountPaise,
      // A changed amount needs a fresh provider order.
      providerOrderId: amountPaise === order.amountPaise ? order.providerOrderId : null,
    },
  });
  if (chosen) await tx.promoRedemption.create({ data: { promoId: chosen.id, orderId: order.id, email: details.email.toLowerCase() } });
  return { ok: true, amountPaise, discountPaise, promoLabel: chosen?.label ?? null };
}

export type CompInput = {
  ticketTypeId: string;
  qty: number;
  buyerName: string;
  email: string;
  phone: string;
  source: "COMP" | "GIVEAWAY";
  now: Date;
};

/** Host-issued free tickets (guest list, giveaway winners). Uses the same seat inventory. */
export async function createCompOrder(tx: Tx, input: CompInput): Promise<{ ok: true; orderId: string } | { ok: false }> {
  const seats = await reserveSeats(tx, input.ticketTypeId, input.qty);
  if (seats === null) return { ok: false };
  const tt = await tx.ticketType.findUniqueOrThrow({ where: { id: input.ticketTypeId }, select: { eventId: true } });
  const order = await tx.order.create({
    data: {
      eventId: tt.eventId,
      ticketTypeId: input.ticketTypeId,
      qty: input.qty,
      unitPricePaise: 0,
      amountPaise: 0,
      buyerName: input.buyerName,
      email: input.email.toLowerCase(),
      phone: input.phone,
      college: "",
      status: "PAID",
      paidAt: input.now,
      holdExpiresAt: input.now,
      provider: "FREE",
      source: input.source,
    },
  });
  await issueTickets(tx, order);
  return { ok: true, orderId: order.id };
}
