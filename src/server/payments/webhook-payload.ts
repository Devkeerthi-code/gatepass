import { z } from "zod";
import type { CapturedPayment } from "./types";

const payloadSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string(),
        order_id: z.string().nullable(),
        amount: z.number().int(),
        status: z.string(),
      }),
    }),
  }),
});

/** Parses a Razorpay-shaped webhook body. Returns null for events we don't act on. */
export function parseCapturedPayment(rawBody: string, eventIdHeader: string | null): CapturedPayment | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const { event, payload } = parsed.data;
  const payment = payload.payment.entity;
  if (event !== "payment.captured" || !payment.order_id) return null;
  return {
    eventId: eventIdHeader ?? `${event}:${payment.id}`,
    type: event,
    providerOrderId: payment.order_id,
    providerPaymentId: payment.id,
    amountPaise: payment.amount,
  };
}
