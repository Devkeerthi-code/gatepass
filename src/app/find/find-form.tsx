"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/form";
import { findTickets, type FindState } from "./actions";

export function FindForm() {
  const [state, action] = useActionState<FindState, FormData>(findTickets, null);
  return (
    <div className="stack">
      <form action={action} className="card stack" noValidate>
        <div className="field">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" name="email" type="email" autoComplete="email" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="f-phone">Mobile</label>
          <input id="f-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" className="input" required />
        </div>
        {state && "error" in state ? (
          <p className="err" role="alert">
            {state.error}
          </p>
        ) : null}
        <SubmitButton pendingLabel="Looking…">Find tickets</SubmitButton>
      </form>
      {state && "orders" in state ? (
        state.orders.length === 0 ? (
          <p className="notice small">
            No paid tickets match that email and phone. Check for typos, or the number you entered at checkout.
          </p>
        ) : (
          <ul className="stack" role="list" style={{ listStyle: "none", padding: 0 }}>
            {state.orders.map((o) => (
              <li key={o.id}>
                <Link className="card row between event-link" href={`/o/${o.id}`}>
                  <span>
                    <b>{o.event}</b>
                    <span className="xs muted" style={{ display: "block" }}>
                      {o.qty} × {o.type} · {o.when}
                    </span>
                  </span>
                  <span className="chip chip-accent">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
