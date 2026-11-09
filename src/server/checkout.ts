import "server-only";
import { db } from "@/lib/db";
import { transaction } from "@/lib/tx";
import { expireOrders } from "./inventory";
import { applyDetails, confirmFree, confirmPaid, type BuyerDetails, type ConfirmOutcome } from "./orders";
import { providerForOrg, providerForRef } from "./payments/resolve";
import { PaymentProviderError } from "./payments/types";
import { track } from "./usage";

export type CheckoutStep =
  | { kind: "FREE_DONE"; orderId: string }
  | { kind: "MOCK"; orderId: string }
  | {
      kind: "RAZORPAY";
      orderId: string;
      keyId: string;
      providerOrderId: string;
      amountPaise: number;
      eventName: string;
      prefill: { name: string; email: string; contact: string };
    }
  | { kind: "ERROR"; message: string; field?: "promo" };

/** Saves details, applies promos, then either finishes a free order or prepares the payment provider order. */
export async function startPayment(orderId: string, details: BuyerDetails, promoCode: string | null): Promise<CheckoutStep> {
  const now = new Date();
  const applied = await transaction((tx) => applyDetails(tx, orderId, details, promoCode, now));
  if (!applied.ok) return { kind: "ERROR", message: applied.message, field: applied.error === "PROMO" ? "promo" : undefined };

  if (applied.amountPaise === 0) {
    const issued = await transaction((tx) => confirmFree(tx, orderId, now));
    if (!issued) return { kind: "ERROR", message: "This order was already completed." };
    const order = await db.order.findUnique({ where: { id: orderId }, select: { eventId: true } });
    track("order.paid", { eventId: order?.eventId });
    return { kind: "FREE_DONE", orderId };
  }

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { event: { select: { orgId: true, name: true } } } });
  let providerOrderId = order.providerOrderId;
  let provider = providerOrderId ? await providerForRef(order.provider, order.event.orgId) : null;
  if (!provider || !providerOrderId) {
    provider = await providerForOrg(order.event.orgId);
    try {
      const created = await provider.createOrder({ amountPaise: order.amountPaise, receipt: order.id.slice(0, 40), notes: { gatepassOrderId: order.id } });
      providerOrderId = created.providerOrderId;
    } catch (err) {
      const message = err instanceof PaymentProviderError ? err.message : "The payment service is unavailable.";
      return { kind: "ERROR", message: `${message} Your seats are still held, so you can try again.` };
    }
    await db.order.update({ where: { id: order.id }, data: { providerOrderId, provider: provider.ref } });
  }

  if (provider.ref === "MOCK") return { kind: "MOCK", orderId };
  return {
    kind: "RAZORPAY",
    orderId,
    keyId: provider.publicKeyId ?? "",
    providerOrderId,
    amountPaise: order.amountPaise,
    eventName: order.event.name,
    prefill: { name: order.buyerName, email: order.email, contact: order.phone },
  };
}

export type CallbackInput = { orderId: string; providerOrderId: string; providerPaymentId: string; signature: string };

/** Primary confirmation path: the browser hands back Razorpay's (or the mock's) signed result. */
export async function confirmFromCheckout(input: CallbackInput): Promise<ConfirmOutcome | { status: "BAD_SIGNATURE" }> {
  const order = await db.order.findUnique({ where: { id: input.orderId }, include: { event: { select: { orgId: true } } } });
  if (!order || order.providerOrderId !== input.providerOrderId) return { status: "NOT_FOUND" };
  const provider = await providerForRef(order.provider, order.event.orgId);
  if (!provider || !provider.verifyPaymentSignature(input)) return { status: "BAD_SIGNATURE" };
  const outcome = await transaction((tx) => confirmPaid(tx, { providerOrderId: input.providerOrderId, providerPaymentId: input.providerPaymentId, now: new Date() }));
  if (outcome.status === "ISSUED") track("order.paid", { eventId: order.eventId });
  return outcome;
}

/** Buyer gives up: seats go back immediately instead of waiting out the hold. */
export async function releaseHold(orderId: string): Promise<void> {
  await transaction((tx) => expireOrders(tx, { now: new Date(), orderId, force: true }));
}

/** Records a failed attempt; the hold stays so the buyer can retry within the window. */
export async function recordFailure(orderId: string, reason: string): Promise<void> {
  await db.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { failureReason: reason.slice(0, 200) } });
}
