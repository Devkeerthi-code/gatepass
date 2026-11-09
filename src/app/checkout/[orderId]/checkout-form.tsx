"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Countdown } from "@/components/countdown";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";
import { formatPaise } from "@/lib/money";
import type { PaymentModeLabel } from "@/server/payments/types";
import { cancelHold, submitCheckout, type CheckoutInput } from "../actions";
import { openRazorpay } from "./razorpay-checkout";

type Props = {
  orderId: string;
  eventSlug: string;
  holdExpiresAt: string;
  tierName: string;
  admits: number;
  qty: number;
  unitPricePaise: number;
  failureReason: string | null;
  modeLabel: PaymentModeLabel;
  refundPolicy: string | null;
  questions: { id: string; label: string; required: boolean }[];
  prefill: { buyerName: string; email: string; phone: string; college: string };
};

export function CheckoutForm(props: Props) {
  const { orderId, qty, unitPricePaise, tierName, admits } = props;
  const [form, setForm] = useState({ ...props.prefill, promoCode: "" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [banner, setBanner] = useState<string | null>(props.failureReason ? `Last attempt: ${props.failureReason}. Your seats are still held, so you can try again.` : null);
  const [expired, setExpired] = useState(false);
  const [pending, start] = useTransition();
  const [releasing, startRelease] = useTransition();
  const [paying, setPaying] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const subtotal = unitPricePaise * qty;
  const onExpire = useCallback(() => setExpired(true), []);

  const field = (name: keyof typeof form, label: string, opts: { type?: string; autoComplete?: string; hint?: string; inputMode?: "numeric" | "email" } = {}) => {
    const err = errors[name]?.[0];
    return (
      <div className="field">
        <label htmlFor={name}>{label}</label>
        <input
          id={name}
          className="input"
          type={opts.type ?? "text"}
          inputMode={opts.inputMode}
          autoComplete={opts.autoComplete}
          value={form[name]}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          aria-invalid={!!err}
          aria-describedby={err ? `${name}-err` : undefined}
        />
        {err ? <span className="err" id={`${name}-err`}>{err}</span> : opts.hint ? <span className="hint">{opts.hint}</span> : null}
      </div>
    );
  };

  const submit = () =>
    start(async () => {
      setBanner(null);
      setErrors({});
      const payload: CheckoutInput = { ...form, answers };
      const step = await submitCheckout(orderId, payload);
      if (step.kind === "INVALID") {
        setErrors(step.fieldErrors);
        toast("Check the highlighted fields", { error: true });
        return;
      }
      if (step.kind === "ERROR") {
        if (step.field === "promo") setErrors({ promoCode: [step.message] });
        else setBanner(step.message);
        return;
      }
      if (step.kind === "FREE_DONE") return router.push(`/o/${orderId}`);
      if (step.kind === "MOCK") return router.push(`/pay/mock/${orderId}`);
      setPaying(true);
      openRazorpay(step, {
        onDone: () => router.push(`/o/${orderId}`),
        onDismiss: (reason) => {
          setPaying(false);
          setBanner(reason ?? "Payment wasn't completed. Your seats are still held, so you can try again.");
        },
      });
    });

  const release = () =>
    startRelease(async () => {
      await cancelHold(orderId);
      router.push(`/c/${props.eventSlug}`);
    });

  if (expired) {
    return (
      <div className="card card-lg stack" role="alert">
        <Icon name="hourglass" />
        <h2>Your hold ran out</h2>
        <p className="muted small">We released the seats so others could buy them. If any are left, you can hold them again.</p>
        <Link className="btn btn-accent" href={`/c/${props.eventSlug}`}>
          Back to tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="checkout-grid">
      <form
        className="card card-lg stack"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="hold" role="status">
          <Icon name="clock" />
          <span>
            Your {qty * admits} seat{qty * admits > 1 ? "s are" : " is"} held for{" "}
          </span>
          <Countdown to={props.holdExpiresAt} onDone={onExpire} className="clock" />
        </div>
        {banner ? <p className="notice notice-no small" role="alert">{banner}</p> : null}
        <div className="grid-2">
          {field("buyerName", "Full name", { autoComplete: "name", hint: "Printed on the ticket." })}
          {field("phone", "Mobile", { type: "tel", autoComplete: "tel-national", inputMode: "numeric" })}
        </div>
        {field("email", "Email", { type: "email", autoComplete: "email", hint: "Use it with your phone number to find your tickets later." })}
        {field("college", "College", { autoComplete: "organization", hint: "Or “Not a student”." })}
        {props.questions.map((q) => {
          const err = errors[`q_${q.id}`]?.[0];
          return (
            <div className="field" key={q.id}>
              <label htmlFor={`q_${q.id}`}>
                {q.label}
                {q.required ? "" : " (optional)"}
              </label>
              <input id={`q_${q.id}`} className="input" value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} aria-invalid={!!err} />
              {err ? <span className="err">{err}</span> : null}
            </div>
          );
        })}
        <div className="field">
          <label htmlFor="promoCode">Promo code (optional)</label>
          <input
            id="promoCode"
            className="input mono"
            style={{ textTransform: "uppercase" }}
            autoComplete="off"
            value={form.promoCode}
            onChange={(e) => setForm({ ...form, promoCode: e.target.value })}
            aria-invalid={!!errors.promoCode}
          />
          {errors.promoCode ? <span className="err">{errors.promoCode[0]}</span> : <span className="hint">Group deals and happy-hour prices apply automatically.</span>}
        </div>
        <div className="notice notice-test small">
          <Icon name="lock" />
          <span>
            Payment mode: <b>{props.modeLabel}</b>.{" "}
            {props.modeLabel === "Mock" ? "This is a simulator. No real money moves." : props.modeLabel === "Razorpay Test" ? "Razorpay test mode. Use test cards; no real money moves." : "Real payment through Razorpay."}
          </span>
        </div>
        <button className="btn btn-accent btn-lg btn-block" type="submit" disabled={pending || paying}>
          {pending || paying ? <span className="spinner" aria-hidden="true" /> : null}
          {pending ? "Checking…" : paying ? "Waiting for payment…" : subtotal ? `Continue to pay` : "Get my free pass"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={release} disabled={releasing} style={{ justifySelf: "center" }}>
          {releasing ? "Releasing…" : "Release my seats"}
        </button>
      </form>

      <aside className="card stack" aria-label="Order summary">
        <p className="label">Order</p>
        <div className="row between">
          <span>
            {qty} × {tierName}
          </span>
          <span className="mono">{formatPaise(subtotal)}</span>
        </div>
        <p className="xs muted">Promo discounts show on the payment screen. Prices include all fees.</p>
        {props.refundPolicy ? (
          <details className="faq">
            <summary>
              Refund policy <Icon name="chev-down" />
            </summary>
            <p>{props.refundPolicy}</p>
          </details>
        ) : null}
      </aside>
    </div>
  );
}
