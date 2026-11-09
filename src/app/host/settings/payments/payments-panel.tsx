"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";
import type { LiveCheck } from "@/server/payment-settings";
import { changeMode, removeKeys, saveKeys } from "./actions";

type KeyState = { key: string | null; verified: boolean; webhook: boolean };

export function PaymentsPanel({
  effective,
  webhookUrl,
  envKey,
  test,
  live,
  checks,
}: {
  effective: "MOCK" | "TEST" | "LIVE" | "ENV";
  webhookUrl: string;
  envKey: string | null;
  test: KeyState;
  live: KeyState;
  checks: LiveCheck[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const liveReady = checks.every((c) => c.done);

  const pick = (mode: "MOCK" | "TEST" | "LIVE") => {
    if (mode === "LIVE" && !window.confirm("Switch to LIVE? New checkouts will charge real money to buyers.")) return;
    start(async () => {
      const res = await changeMode(mode);
      toast(res.message, { error: !res.ok });
      if (res.ok) router.refresh();
    });
  };

  const collecting =
    effective === "LIVE"
      ? { title: `Your Razorpay account · LIVE (${live.key})`, tone: "notice-no", note: "Real money. Buyers are charged." }
      : effective === "TEST"
        ? { title: `Your Razorpay test account (${test.key})`, tone: "notice-ok", note: "Use Razorpay test cards/UPI. No real money moves." }
        : effective === "ENV"
          ? { title: `Server keys from .env (${envKey})`, tone: "notice", note: "Set by whoever deployed GatePass. Connect your own account below to collect into it." }
          : { title: "Mock payments (simulator)", tone: "notice-test", note: "Nothing is charged. Connect Razorpay to take real test payments." };

  const current = effective === "ENV" ? "MOCK" : effective;

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className={`notice ${collecting.tone}`} role="status">
        <Icon name="card" />
        <div>
          <b>Collecting into: {collecting.title}</b>
          <div className="small">{collecting.note}</div>
        </div>
      </div>

      <div className="card stack">
        <div className="sec-h">
          <h2>Payment mode for new checkouts</h2>
          <span className="label">Orders already started keep their mode</span>
        </div>
        <div className="seg" role="radiogroup" aria-label="Payment mode">
          {(
            [
              ["MOCK", "Mock", true],
              ["TEST", "Razorpay Test", test.verified],
              ["LIVE", "Live", liveReady],
            ] as const
          ).map(([value, label, enabled]) => (
            <label key={value}>
              <input type="radio" name="mode" checked={current === value} disabled={!enabled || pending} onChange={() => pick(value)} />
              <span>
                {!enabled ? <Icon name="lock" small /> : null}
                {label}
              </span>
            </label>
          ))}
        </div>
        <p className="xs muted">Razorpay Test unlocks once test keys are verified. Live unlocks when every item in the checklist is done.</p>
      </div>

      <KeyCard mode="TEST" state={test} title="Razorpay test keys" hint="Dashboard → Account & Settings → API Keys, with Test mode on. Saving verified test keys switches new checkouts to your account automatically." />

      <div className="card stack">
        <div className="sec-h">
          <h2>Webhook (backup confirmation)</h2>
          <span className="chip">Needed for Live</span>
        </div>
        <p className="small muted">
          If a buyer closes the tab right after paying, Razorpay tells GatePass directly. In Razorpay: Account &amp; Settings → Webhooks → Add new webhook, paste this URL, pick the
          <span className="mono"> payment.captured</span> event, and set a secret. Paste the same secret into the key forms here.
        </p>
        <CopyBox value={webhookUrl} />
      </div>

      <KeyCard mode="LIVE" state={live} title="Razorpay live keys" hint="Only after Razorpay has activated your account (KYC). Live stays locked until the checklist below is complete." />

      <div className="card stack">
        <div className="sec-h">
          <h2>Before you go live</h2>
          <span className={`chip ${liveReady ? "chip-ok" : ""}`}>{checks.filter((c) => c.done).length} / {checks.length}</span>
        </div>
        <ul className="checklist" role="list">
          {checks.map((c) => (
            <li key={c.id} className={c.done ? "done" : ""}>
              <span className="tick" aria-hidden="true">
                <Icon name={c.done ? "check" : "x"} small />
              </span>
              <div>
                <b>{c.label}</b>
                {!c.done ? <div className="xs muted">{c.help}</div> : null}
              </div>
              <span className="sr-only">{c.done ? "done" : "not done"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KeyCard({ mode, state, title, hint }: { mode: "TEST" | "LIVE"; state: KeyState; title: string; hint: string }) {
  const [form, setForm] = useState({ keyId: "", keySecret: "", webhookSecret: "" });
  const [editing, setEditing] = useState(!state.key);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const prefix = mode === "TEST" ? "rzp_test_" : "rzp_live_";

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await saveKeys({ mode, ...form });
      if (!res.ok) return setError(res.message);
      toast(res.message);
      setForm({ keyId: "", keySecret: "", webhookSecret: "" });
      setEditing(false);
      router.refresh();
    });

  const disconnect = () =>
    start(async () => {
      const res = await removeKeys(mode);
      toast(res.message, { error: !res.ok });
      setEditing(true);
      router.refresh();
    });

  return (
    <div className="card stack">
      <div className="sec-h">
        <h2>{title}</h2>
        {state.verified ? (
          <span className="chip chip-ok">
            <Icon name="check" small /> Verified · {state.key}
          </span>
        ) : (
          <span className="chip">Not connected</span>
        )}
      </div>
      <p className="small muted">{hint}</p>
      {editing ? (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid-2">
            <div className="field">
              <label htmlFor={`${mode}-id`}>Key ID</label>
              <input id={`${mode}-id`} className="input mono" placeholder={`${prefix}…`} autoComplete="off" spellCheck={false} value={form.keyId} onChange={(e) => setForm({ ...form, keyId: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor={`${mode}-secret`}>Key Secret</label>
              <input id={`${mode}-secret`} className="input mono" type="password" autoComplete="off" value={form.keySecret} onChange={(e) => setForm({ ...form, keySecret: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${mode}-wh`}>Webhook secret {mode === "TEST" ? "(optional)" : ""}</label>
            <input id={`${mode}-wh`} className="input mono" type="password" autoComplete="off" value={form.webhookSecret} onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })} />
            <span className="hint">{state.webhook ? "A webhook secret is saved. Leave empty to keep it." : "The secret you typed when creating the webhook in Razorpay."}</span>
          </div>
          {error ? (
            <p className="notice notice-no small" role="alert">
              {error}
            </p>
          ) : null}
          <div className="row wrap">
            <button className="btn btn-accent" type="submit" disabled={pending || !form.keyId || !form.keySecret}>
              {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="key" small />}
              {pending ? "Checking with Razorpay…" : "Test connection & save"}
            </button>
            {state.key ? (
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
          </div>
          <p className="xs muted">Keys are checked with Razorpay before saving, then stored encrypted (AES-256-GCM). The secret is never shown again.</p>
        </form>
      ) : (
        <div className="row wrap">
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            Replace keys
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={disconnect} disabled={pending}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function CopyBox({ value }: { value: string }) {
  const toast = useToast();
  return (
    <div className="linkbox">
      <code>{value}</code>
      <button
        type="button"
        className="btn"
        aria-label="Copy webhook URL"
        onClick={() =>
          navigator.clipboard.writeText(value).then(
            () => toast("Copied"),
            () => toast("Couldn't copy. Select the text instead.", { error: true }),
          )
        }
      >
        <Icon name="copy" />
      </button>
    </div>
  );
}
