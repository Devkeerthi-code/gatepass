"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";
import { mockApprove, mockDecline, mockPayAndClose } from "./actions";

export function MockSimulator({
  orderId,
  amount,
  subtotal,
  promo,
  line,
  providerOrderId,
}: {
  orderId: string;
  amount: string;
  subtotal: string | null;
  promo: string | null;
  line: string;
  providerOrderId: string;
}) {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const run = (key: string, fn: () => Promise<void>) => {
    setWhich(key);
    start(fn);
  };

  const approve = () =>
    run("ok", async () => {
      const signed = await mockApprove(orderId);
      if (!signed) return router.push(`/o/${orderId}`);
      // Same request Razorpay Checkout's handler makes: the server checks the signature.
      const res = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...signed }),
      });
      if (!res.ok) toast("Confirmation failed. The order page will retry.", { error: true });
      router.push(`/o/${orderId}`);
    });

  const decline = () =>
    run("fail", async () => {
      await mockDecline(orderId);
      router.push(`/checkout/${orderId}`);
    });

  const closeEarly = () =>
    run("close", async () => {
      await mockPayAndClose(orderId);
      router.push(`/o/${orderId}?via=webhook`);
    });

  return (
    <div className="mock-card">
      <div className="hazard" aria-hidden="true" />
      <div className="mock-body stack">
        <div className="row between wrap">
          <span className="chip chip-test">TEST SIMULATOR</span>
          <span className="mono xs muted">{providerOrderId}</span>
        </div>
        <div>
          <p className="label">Mock payment · no real money</p>
          <p className="mock-amount">
            {subtotal ? <s>{subtotal}</s> : null}
            {amount}
          </p>
          <p className="small muted">{line}</p>
          {promo ? (
            <p className="chip chip-ok" style={{ marginTop: 8 }}>
              {promo} applied
            </p>
          ) : null}
        </div>
        <p className="small">
          GatePass is in <b>Mock mode</b> because no Razorpay keys are connected. Pick what the “bank” should do:
        </p>
        <div className="stack">
          <button className="btn btn-accent btn-lg btn-block" onClick={approve} disabled={pending}>
            {pending && which === "ok" ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" />}
            Pay successfully
          </button>
          <button className="btn btn-lg btn-block" onClick={decline} disabled={pending}>
            {pending && which === "fail" ? <span className="spinner" aria-hidden="true" /> : <Icon name="x" />}
            Payment fails
          </button>
          <button className="btn btn-lg btn-block" onClick={closeEarly} disabled={pending}>
            {pending && which === "close" ? <span className="spinner" aria-hidden="true" /> : <Icon name="clock" />}
            Pay, then close the tab before returning
          </button>
        </div>
        <p className="xs muted">
          The last option never calls the checkout callback. A signed <span className="mono">payment.captured</span> webhook arrives ~4s
          later (twice, like a retry) and issues the ticket exactly once.
        </p>
      </div>
      <div className="hazard" aria-hidden="true" />
    </div>
  );
}
