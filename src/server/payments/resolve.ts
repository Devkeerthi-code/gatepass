import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { PaymentSettings } from "@/generated/prisma/client";
import { createMockProvider } from "./mock";
import { createRazorpayProvider, isLiveKey } from "./razorpay";
import type { PaymentProvider, ProviderRef } from "./types";

function open(sealed: string | null): string | null {
  return sealed ? decryptSecret(sealed, env().APP_ENCRYPTION_KEY) : null;
}

function envRazorpay(): PaymentProvider | null {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return null;
  return createRazorpayProvider("RZP_ENV", {
    keyId: RAZORPAY_KEY_ID,
    keySecret: RAZORPAY_KEY_SECRET,
    webhookSecret: RAZORPAY_WEBHOOK_SECRET ?? null,
  });
}

function orgTestProvider(s: PaymentSettings): PaymentProvider | null {
  const keySecret = open(s.testKeySecretEnc);
  if (!s.testKeyId || !keySecret) return null;
  return createRazorpayProvider("RZP_TEST_ORG", {
    keyId: s.testKeyId,
    keySecret,
    webhookSecret: open(s.testWebhookSecretEnc),
  });
}

function orgLiveProvider(s: PaymentSettings): PaymentProvider | null {
  const keySecret = open(s.liveKeySecretEnc);
  if (!s.liveKeyId || !keySecret) return null;
  return createRazorpayProvider("RZP_LIVE_ORG", {
    keyId: s.liveKeyId,
    keySecret,
    webhookSecret: open(s.liveWebhookSecretEnc),
  });
}

export function mockProvider(): PaymentProvider {
  return createMockProvider(env().MOCK_PAYMENT_SECRET);
}

/**
 * Which provider new orders for this organisation use:
 * the host's own saved keys (per their chosen mode) → keys in .env → Mock.
 */
export async function providerForOrg(orgId: string): Promise<PaymentProvider> {
  const settings = await db.paymentSettings.findUnique({ where: { orgId } });
  if (!settings) return envRazorpay() ?? mockProvider();
  if (settings.mode === "LIVE" && settings.liveVerifiedAt) return orgLiveProvider(settings) ?? mockProvider();
  if (settings.mode === "TEST" && settings.testVerifiedAt) return orgTestProvider(settings) ?? mockProvider();
  return mockProvider();
}

/** The provider an existing order was created with, regardless of later settings changes. */
export async function providerForRef(ref: string, orgId: string): Promise<PaymentProvider | null> {
  const typed = ref as ProviderRef;
  if (typed === "MOCK") return mockProvider();
  if (typed === "RZP_ENV") return envRazorpay();
  const settings = await db.paymentSettings.findUnique({ where: { orgId } });
  if (!settings) return null;
  if (typed === "RZP_TEST_ORG") return orgTestProvider(settings);
  if (typed === "RZP_LIVE_ORG") return orgLiveProvider(settings);
  return null;
}

/** All Razorpay providers that could have signed a webhook sent to this org's URL. */
export async function webhookProvidersForOrg(orgId: string): Promise<PaymentProvider[]> {
  const settings = await db.paymentSettings.findUnique({ where: { orgId } });
  if (!settings) return [];
  return [orgTestProvider(settings), orgLiveProvider(settings)].filter((p): p is PaymentProvider => p !== null);
}

export function envRazorpayProvider(): PaymentProvider | null {
  return envRazorpay();
}

export function keyKindMatches(mode: "TEST" | "LIVE", keyId: string): boolean {
  return mode === "LIVE" ? isLiveKey(keyId) : keyId.startsWith("rzp_test_");
}
