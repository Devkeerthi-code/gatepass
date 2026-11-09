import { hmacHex, safeEqual } from "@/lib/crypto";

/** Razorpay's documented Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function checkoutSignature(keySecret: string, providerOrderId: string, providerPaymentId: string): string {
  return hmacHex(keySecret, `${providerOrderId}|${providerPaymentId}`);
}

export function isValidCheckoutSignature(
  keySecret: string,
  providerOrderId: string,
  providerPaymentId: string,
  signature: string,
): boolean {
  return safeEqual(checkoutSignature(keySecret, providerOrderId, providerPaymentId), signature);
}

/** Razorpay webhooks: X-Razorpay-Signature = HMAC-SHA256(raw request body, webhook_secret). */
export function webhookSignature(webhookSecret: string, rawBody: string): string {
  return hmacHex(webhookSecret, rawBody);
}

export function isValidWebhookSignature(webhookSecret: string | null, rawBody: string, signature: string): boolean {
  if (!webhookSecret || !signature) return false;
  return safeEqual(webhookSignature(webhookSecret, rawBody), signature);
}
