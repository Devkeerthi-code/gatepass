"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { recordFailure } from "@/server/checkout";
import { buildMockWebhook, simulateMockPayment } from "@/server/payments/mock";

async function mockOrder(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, provider: true, providerOrderId: true, amountPaise: true },
  });
  if (!order || order.provider !== "MOCK" || !order.providerOrderId || order.status !== "PENDING") return null;
  return { ...order, providerOrderId: order.providerOrderId };
}

/** "Bank says yes": returns a result signed exactly like Razorpay Checkout's handler response. */
export async function mockApprove(orderId: string) {
  const order = await mockOrder(orderId);
  if (!order) return null;
  return simulateMockPayment(env().MOCK_PAYMENT_SECRET, order.providerOrderId);
}

export async function mockDecline(orderId: string): Promise<void> {
  if (await mockOrder(orderId)) await recordFailure(orderId, "card declined (mock)");
}

const WEBHOOK_DELAY_MS = 4000;

/**
 * Simulates paying and then closing the tab before returning: no checkout callback ever arrives,
 * and only the signed webhook (sent a few seconds later) confirms the order.
 */
export async function mockPayAndClose(orderId: string): Promise<boolean> {
  const order = await mockOrder(orderId);
  if (!order) return false;
  const { APP_URL, MOCK_PAYMENT_SECRET } = env();
  const paid = simulateMockPayment(MOCK_PAYMENT_SECRET, order.providerOrderId);
  const hook = buildMockWebhook(MOCK_PAYMENT_SECRET, { ...paid, amountPaise: order.amountPaise });
  after(async () => {
    await new Promise((r) => setTimeout(r, WEBHOOK_DELAY_MS));
    // Delivered twice on purpose, like a provider retry, to show it's idempotent.
    for (let attempt = 0; attempt < 2; attempt++) {
      await fetch(`${APP_URL}/api/webhooks/mock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": hook.signature, "x-razorpay-event-id": hook.eventId },
        body: hook.body,
      }).catch(() => undefined);
    }
  });
  return true;
}
