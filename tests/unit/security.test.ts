import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hmacHex } from "@/lib/crypto";
import { newTicketId, parseTicketCode, signTicketCode, verifyTicketCode } from "@/lib/ticket-code";
import { buildMockWebhook, createMockProvider, simulateMockPayment } from "@/server/payments/mock";
import { createRazorpayProvider } from "@/server/payments/razorpay";
import { checkoutSignature, isValidCheckoutSignature, isValidWebhookSignature } from "@/server/payments/signatures";
import { parseCapturedPayment } from "@/server/payments/webhook-payload";

const SECRET = "unit-test-signing-secret-0123456789abcdef";

describe("ticket QR codes", () => {
  it("round-trips a signed code", () => {
    const id = newTicketId();
    expect(verifyTicketCode(signTicketCode(id, SECRET), SECRET)).toBe(id);
  });

  it("rejects a code signed with another secret", () => {
    const code = signTicketCode(newTicketId(), "some-other-secret-that-is-long-enough");
    expect(verifyTicketCode(code, SECRET)).toBeNull();
  });

  it("rejects a valid signature moved onto a different ticket id", () => {
    const real = signTicketCode(newTicketId(), SECRET);
    const [, , sig] = real.split(".");
    expect(verifyTicketCode(`GP1.${newTicketId()}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    for (const bad of ["", "GP1", "GP2.a.b", "GP1.short.sig", "https://example.com"]) {
      expect(verifyTicketCode(bad, SECRET)).toBeNull();
      expect(parseTicketCode(bad)).toBeNull();
    }
  });

  it("ticket ids are 128-bit and unique", () => {
    const ids = new Set(Array.from({ length: 2000 }, newTicketId));
    expect(ids.size).toBe(2000);
    expect(Buffer.from([...ids][0], "base64url")).toHaveLength(16);
  });
});

describe("Razorpay checkout signature", () => {
  it("matches Razorpay's documented formula", () => {
    const expected = hmacHex("key_secret", "order_ABC|pay_XYZ");
    expect(checkoutSignature("key_secret", "order_ABC", "pay_XYZ")).toBe(expected);
    expect(isValidCheckoutSignature("key_secret", "order_ABC", "pay_XYZ", expected)).toBe(true);
  });

  it("fails for a swapped payment id or wrong secret", () => {
    const sig = checkoutSignature("key_secret", "order_ABC", "pay_XYZ");
    expect(isValidCheckoutSignature("key_secret", "order_ABC", "pay_OTHER", sig)).toBe(false);
    expect(isValidCheckoutSignature("wrong", "order_ABC", "pay_XYZ", sig)).toBe(false);
    expect(isValidCheckoutSignature("key_secret", "order_ABC", "pay_XYZ", "")).toBe(false);
  });

  it("the Razorpay provider verifies with its own key secret", () => {
    const rzp = createRazorpayProvider("RZP_ENV", { keyId: "rzp_test_x", keySecret: "s3cret", webhookSecret: "wh" });
    const signature = checkoutSignature("s3cret", "order_1", "pay_1");
    expect(rzp.verifyPaymentSignature({ providerOrderId: "order_1", providerPaymentId: "pay_1", signature })).toBe(true);
    expect(rzp.label).toBe("Razorpay Test");
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 49900, status: "captured" } } } });

  it("accepts the exact body and rejects any change", () => {
    const sig = hmacHex("whsec", body);
    expect(isValidWebhookSignature("whsec", body, sig)).toBe(true);
    expect(isValidWebhookSignature("whsec", body.replace("49900", "100"), sig)).toBe(false);
    expect(isValidWebhookSignature("other", body, sig)).toBe(false);
  });

  it("refuses everything when no webhook secret is configured", () => {
    expect(isValidWebhookSignature(null, body, hmacHex("", body))).toBe(false);
  });

  it("parses payment.captured and ignores other events", () => {
    expect(parseCapturedPayment(body, "evt_1")).toEqual({
      eventId: "evt_1",
      type: "payment.captured",
      providerOrderId: "order_1",
      providerPaymentId: "pay_1",
      amountPaise: 49900,
    });
    expect(parseCapturedPayment(body.replace("payment.captured", "payment.failed"), null)).toBeNull();
    expect(parseCapturedPayment("not json", null)).toBeNull();
  });
});

describe("mock provider", () => {
  const root = "mock-root-secret-for-tests";
  const mock = createMockProvider(root);

  it("simulated checkout success carries a verifiable signature", () => {
    const paid = simulateMockPayment(root, "mock_order_1");
    expect(mock.verifyPaymentSignature(paid)).toBe(true);
    expect(mock.verifyPaymentSignature({ ...paid, providerPaymentId: "mock_pay_forged" })).toBe(false);
  });

  it("simulated delayed webhook is signed and parseable", () => {
    const hook = buildMockWebhook(root, { providerOrderId: "mock_order_1", providerPaymentId: "mock_pay_1", amountPaise: 1000 });
    expect(mock.verifyWebhookSignature(hook.body, hook.signature)).toBe(true);
    expect(createMockProvider("different-root-secret").verifyWebhookSignature(hook.body, hook.signature)).toBe(false);
    expect(parseCapturedPayment(hook.body, hook.eventId)?.amountPaise).toBe(1000);
  });
});

describe("stored secret encryption", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("rzp_secret_value", key);
    expect(decryptSecret(a, key)).toBe("rzp_secret_value");
    expect(encryptSecret("rzp_secret_value", key)).not.toBe(a);
  });

  it("detects tampering and wrong keys", () => {
    const sealed = encryptSecret("value", key);
    const [iv, tag, data] = sealed.split(".");
    expect(() => decryptSecret(`${iv}.${tag}.${data.slice(0, -2)}AA`, key)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
  });
});
