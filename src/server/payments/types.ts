/** Where an order's payment is handled. Stored on the order so a later settings change can't break it. */
export type ProviderRef = "MOCK" | "RZP_ENV" | "RZP_TEST_ORG" | "RZP_LIVE_ORG";

export type PaymentModeLabel = "Mock" | "Razorpay Test" | "Razorpay Live";

export type CreateOrderInput = { amountPaise: number; receipt: string; notes: Record<string, string> };

export type CapturedPayment = {
  eventId: string;
  type: string;
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
};

export interface PaymentProvider {
  readonly ref: ProviderRef;
  readonly label: PaymentModeLabel;
  /** Public key for Razorpay Checkout; null for Mock. */
  readonly publicKeyId: string | null;
  createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }>;
  verifyPaymentSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;
  /** False when no webhook secret is configured. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  testConnection(): Promise<{ ok: true } | { ok: false; message: string }>;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}
