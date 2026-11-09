import { hmacHex, randomToken } from "@/lib/crypto";
import { checkoutSignature, isValidCheckoutSignature, isValidWebhookSignature, webhookSignature } from "./signatures";
import type { PaymentProvider } from "./types";

/** Derived from MOCK_PAYMENT_SECRET so checkout and webhook signatures use different secrets, like Razorpay. */
export function mockSecrets(rootSecret: string) {
  return {
    keySecret: hmacHex(rootSecret, "mock-key-secret"),
    webhookSecret: hmacHex(rootSecret, "mock-webhook-secret"),
  };
}

export function createMockProvider(rootSecret: string): PaymentProvider {
  const secrets = mockSecrets(rootSecret);
  return {
    ref: "MOCK",
    label: "Mock",
    publicKeyId: null,
    async createOrder() {
      return { providerOrderId: `mock_order_${randomToken(12)}` };
    },
    verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }) {
      return isValidCheckoutSignature(secrets.keySecret, providerOrderId, providerPaymentId, signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      return isValidWebhookSignature(secrets.webhookSecret, rawBody, signature);
    },
    async testConnection() {
      return { ok: true };
    },
  };
}

/** What the mock "bank" returns after a successful payment, signed exactly like Razorpay Checkout. */
export function simulateMockPayment(rootSecret: string, providerOrderId: string) {
  const providerPaymentId = `mock_pay_${randomToken(12)}`;
  const signature = checkoutSignature(mockSecrets(rootSecret).keySecret, providerOrderId, providerPaymentId);
  return { providerOrderId, providerPaymentId, signature };
}

/** A Razorpay-shaped payment.captured webhook body plus its signature. */
export function buildMockWebhook(
  rootSecret: string,
  input: { providerOrderId: string; providerPaymentId: string; amountPaise: number },
) {
  const body = JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: input.providerPaymentId,
          order_id: input.providerOrderId,
          amount: input.amountPaise,
          currency: "INR",
          status: "captured",
        },
      },
    },
  });
  return {
    body,
    signature: webhookSignature(mockSecrets(rootSecret).webhookSecret, body),
    eventId: `mock_evt_${randomToken(10)}`,
  };
}
