import { mockProvider } from "@/server/payments/resolve";
import { handlePaymentWebhook } from "@/server/webhooks";

/** Webhook target for the Mock provider (same shape and signature scheme as Razorpay). */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handlePaymentWebhook({
    source: "mock",
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventIdHeader: request.headers.get("x-razorpay-event-id"),
    providers: [mockProvider()],
  });
  return Response.json(result.body, { status: result.status });
}
