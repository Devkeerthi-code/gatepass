import { isValidCheckoutSignature, isValidWebhookSignature } from "./signatures";
import { PaymentProviderError, type PaymentProvider, type ProviderRef } from "./types";

const API = "https://api.razorpay.com/v1";

export type RazorpayCredentials = { keyId: string; keySecret: string; webhookSecret: string | null };

export function isLiveKey(keyId: string): boolean {
  return keyId.startsWith("rzp_live_");
}

export function isTestKey(keyId: string): boolean {
  return keyId.startsWith("rzp_test_");
}

async function call<T>(creds: RazorpayCredentials, path: string, init?: RequestInit): Promise<T> {
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PaymentProviderError("Couldn't reach Razorpay. Check your connection and try again.");
  }
  if (res.status === 401) throw new PaymentProviderError("Razorpay rejected these keys.", 401);
  if (res.status === 429) throw new PaymentProviderError("Razorpay is rate limiting requests. Try again in a minute.", 429);
  if (!res.ok) throw new PaymentProviderError(`Razorpay returned an error (${res.status}).`, res.status);
  return (await res.json()) as T;
}

export function createRazorpayProvider(ref: Exclude<ProviderRef, "MOCK">, creds: RazorpayCredentials): PaymentProvider {
  return {
    ref,
    label: isLiveKey(creds.keyId) ? "Razorpay Live" : "Razorpay Test",
    publicKeyId: creds.keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      const order = await call<{ id: string }>(creds, "/orders", {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
      });
      return { providerOrderId: order.id };
    },
    verifyPaymentSignature({ providerOrderId, providerPaymentId, signature }) {
      return isValidCheckoutSignature(creds.keySecret, providerOrderId, providerPaymentId, signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      return isValidWebhookSignature(creds.webhookSecret, rawBody, signature);
    },
    async testConnection() {
      try {
        await call(creds, "/orders?count=1");
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Unknown Razorpay error." };
      }
    },
  };
}
