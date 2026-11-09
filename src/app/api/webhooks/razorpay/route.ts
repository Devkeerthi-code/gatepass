import { envRazorpayProvider } from "@/server/payments/resolve";
import { handlePaymentWebhook } from "@/server/webhooks";

/** Webhook for keys set in .env (RAZORPAY_WEBHOOK_SECRET). Hosts who connect their own account use /api/webhooks/razorpay/<orgId>. */
export async function POST(request: Request) {
  const provider = envRazorpayProvider();
  if (!provider) return Response.json({ ok: false, result: "not_configured" }, { status: 404 });
  const rawBody = await request.text();
  const result = await handlePaymentWebhook({
    source: "razorpay",
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventIdHeader: request.headers.get("x-razorpay-event-id"),
    providers: [provider],
  });
  return Response.json(result.body, { status: result.status });
}
