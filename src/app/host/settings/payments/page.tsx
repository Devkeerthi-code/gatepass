import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireViewer } from "@/server/auth";
import { liveReadiness, maskKey } from "@/server/payment-settings";
import { PaymentsPanel } from "./payments-panel";

export const metadata: Metadata = { title: "Payments" };

async function Payments() {
  const viewer = await requireViewer("payments:manage");
  const [settings, checks] = await Promise.all([db.paymentSettings.findUnique({ where: { orgId: viewer.orgId } }), liveReadiness(viewer.orgId)]);
  const { APP_URL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  const envKeys = !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
  // With no saved settings, the app-wide .env keys (if any) are used, otherwise Mock.
  const effective = settings ? settings.mode : envKeys ? "ENV" : "MOCK";

  return (
    <PaymentsPanel
      effective={effective}
      webhookUrl={`${APP_URL}/api/webhooks/razorpay/${viewer.orgId}`}
      envKey={envKeys ? maskKey(RAZORPAY_KEY_ID ?? null) : null}
      test={{ key: maskKey(settings?.testKeyId ?? null), verified: !!settings?.testVerifiedAt, webhook: !!settings?.testWebhookSecretEnc }}
      live={{ key: maskKey(settings?.liveKeyId ?? null), verified: !!settings?.liveVerifiedAt, webhook: !!settings?.liveWebhookSecretEnc }}
      checks={checks}
    />
  );
}

export default function PaymentsPage() {
  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">Settings</div>
          <h1>Payments</h1>
        </div>
      </div>
      <Suspense fallback={<div className="sk" style={{ height: 420, borderRadius: 18 }} />}>
        <Payments />
      </Suspense>
    </>
  );
}
