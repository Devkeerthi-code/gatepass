"use client";

type RazorpayStep = {
  orderId: string;
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  eventName: string;
  prefill: { name: string; email: string; contact: string };
};

type RazorpaySuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

type RazorpayInstance = { open(): void; on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void };
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay failed to load")));
    s.onerror = () => reject(new Error("Couldn't load Razorpay. Check your connection."));
    document.head.append(s);
  });
}

/** Server-side confirmation of the signed checkout result (primary path). */
export async function confirmPayment(orderId: string, result: RazorpaySuccess): Promise<boolean> {
  const res = await fetch("/api/payments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      providerOrderId: result.razorpay_order_id,
      providerPaymentId: result.razorpay_payment_id,
      signature: result.razorpay_signature,
    }),
  });
  return res.ok;
}

export function openRazorpay(step: RazorpayStep, cb: { onDone: () => void; onDismiss: (reason?: string) => void }): void {
  loadScript()
    .then((Razorpay) => {
      const rzp = new Razorpay({
        key: step.keyId,
        order_id: step.providerOrderId,
        amount: step.amountPaise,
        currency: "INR",
        name: "GatePass",
        description: step.eventName,
        prefill: step.prefill,
        theme: { color: "#D4136F" },
        handler: async (result: RazorpaySuccess) => {
          // Even if this request fails, the payment.captured webhook will issue the tickets.
          await confirmPayment(step.orderId, result).catch(() => false);
          cb.onDone();
        },
        modal: { ondismiss: () => cb.onDismiss() },
      });
      rzp.on("payment.failed", (r) => cb.onDismiss(`Payment failed: ${r.error?.description ?? "declined"}. Your seats are still held.`));
      rzp.open();
    })
    .catch((err: Error) => cb.onDismiss(err.message));
}
