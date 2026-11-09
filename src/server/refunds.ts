import "server-only";
import type { Tx } from "@/lib/db";
import { offerWaitlist } from "./inventory";
import type { PaymentProvider } from "./payments/types";
import { PaymentProviderError } from "./payments/types";

export type RefundOutcome =
  | { ok: true; refundId: string | null; seatsReleased: number }
  | { ok: false; reason: "NOT_FOUND" | "NOT_REFUNDABLE" | "CHECKED_IN" | "PROVIDER"; message: string };

/**
 * Refunds a paid order (host cancels) or a NEEDS_REFUND order (paid after the seats sold out).
 * The order row is locked for the whole refund, so a double click or two admins can't refund twice;
 * if the provider call fails the transaction rolls back and nothing changes.
 */
export async function refundOrder(
  tx: Tx,
  input: { orderId: string; orgId: string; now: Date; providerFor: (ref: string) => Promise<PaymentProvider | null> },
): Promise<RefundOutcome> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
  if (locked.length === 0) return { ok: false, reason: "NOT_FOUND", message: "Order not found." };

  const order = await tx.order.findUniqueOrThrow({
    where: { id: input.orderId },
    include: { event: { select: { orgId: true } }, tickets: { select: { checkedInAt: true } } },
  });
  if (order.event.orgId !== input.orgId) return { ok: false, reason: "NOT_FOUND", message: "Order not found." };
  if (order.status !== "PAID" && order.status !== "NEEDS_REFUND") {
    return { ok: false, reason: "NOT_REFUNDABLE", message: order.status === "REFUNDED" ? "Already refunded." : "Only paid orders can be refunded." };
  }
  if (order.tickets.some((t) => t.checkedInAt)) {
    return { ok: false, reason: "CHECKED_IN", message: "Someone on this order already entered, so it can't be refunded here." };
  }

  let refundId: string | null = null;
  const charged = order.amountPaise > 0 && !!order.providerPaymentId && order.provider !== "FREE";
  if (charged) {
    const provider = await input.providerFor(order.provider);
    if (!provider) return { ok: false, reason: "PROVIDER", message: "The payment account that took this payment is no longer connected. Refund it from Razorpay directly." };
    try {
      refundId = (await provider.refund({ providerPaymentId: order.providerPaymentId!, amountPaise: order.amountPaise, notes: { gatepassOrderId: order.id } })).refundId;
    } catch (err) {
      const message = err instanceof PaymentProviderError ? err.message : "The refund request failed.";
      return { ok: false, reason: "PROVIDER", message: `${message} Nothing was changed; try again.` };
    }
  }

  const wasHoldingSeats = order.status === "PAID";
  await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED", refundId, refundedAt: input.now } });
  if (wasHoldingSeats) {
    await tx.$executeRaw`UPDATE "TicketType" SET "reserved" = "reserved" - ${order.qty} WHERE "id" = ${order.ticketTypeId}`;
    await offerWaitlist(tx, order.ticketTypeId, input.now);
  }
  return { ok: true, refundId, seatsReleased: wasHoldingSeats ? order.qty : 0 };
}
