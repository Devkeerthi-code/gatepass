import "server-only";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { transaction } from "@/lib/tx";
import { confirmPaid } from "./orders";
import type { PaymentProvider } from "./payments/types";
import { parseCapturedPayment } from "./payments/webhook-payload";
import { track } from "./usage";

export type WebhookResult = { status: number; body: { ok: boolean; result: string } };

/**
 * Backup confirmation path. Verifies the signature against the raw body, ignores events it has
 * already processed, and confirms through the same idempotent confirmPaid() as the checkout callback.
 */
export async function handlePaymentWebhook(input: {
  source: string;
  rawBody: string;
  signature: string | null;
  eventIdHeader: string | null;
  providers: PaymentProvider[];
  onVerified?: () => Promise<void>;
}): Promise<WebhookResult> {
  const { rawBody, signature, providers } = input;
  if (!signature || !providers.some((p) => p.verifyWebhookSignature(rawBody, signature))) {
    return { status: 401, body: { ok: false, result: "bad_signature" } };
  }
  await input.onVerified?.();

  const payment = parseCapturedPayment(rawBody, input.eventIdHeader);
  // Acknowledge events we don't act on, so the provider stops retrying them.
  if (!payment) return { status: 200, body: { ok: true, result: "ignored" } };

  const seen = await db.webhookEvent.findUnique({
    where: { provider_providerEventId: { provider: input.source, providerEventId: payment.eventId } },
  });
  if (seen) return { status: 200, body: { ok: true, result: "duplicate" } };

  const outcome = await transaction((tx) =>
    confirmPaid(tx, {
      providerOrderId: payment.providerOrderId,
      providerPaymentId: payment.providerPaymentId,
      amountPaise: payment.amountPaise,
      now: new Date(),
    }),
  );

  try {
    await db.webhookEvent.create({ data: { provider: input.source, providerEventId: payment.eventId } });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  if (outcome.status === "ISSUED") {
    const order = await db.order.findUnique({ where: { id: outcome.orderId }, select: { eventId: true } });
    track("order.paid", { eventId: order?.eventId });
  }
  // NOT_FOUND / AMOUNT_MISMATCH are acknowledged (retrying won't help) but reported in the body.
  return { status: 200, body: { ok: true, result: outcome.status.toLowerCase() } };
}
