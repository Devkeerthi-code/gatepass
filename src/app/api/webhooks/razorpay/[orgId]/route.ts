import { db } from "@/lib/db";
import { webhookProvidersForOrg } from "@/server/payments/resolve";
import { handlePaymentWebhook } from "@/server/webhooks";

/** Per-host webhook: verified with the webhook secret the host saved in Settings → Payments. */
export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const providers = await webhookProvidersForOrg(orgId);
  if (providers.length === 0) return Response.json({ ok: false, result: "not_configured" }, { status: 404 });
  const rawBody = await request.text();
  const result = await handlePaymentWebhook({
    source: "razorpay",
    rawBody,
    signature: request.headers.get("x-razorpay-signature"),
    eventIdHeader: request.headers.get("x-razorpay-event-id"),
    providers,
    // Proof for the Live readiness checklist that the webhook is wired up correctly.
    onVerified: async () => {
      await db.paymentSettings.update({ where: { orgId }, data: { liveWebhookSeenAt: new Date() } });
    },
  });
  return Response.json(result.body, { status: result.status });
}
