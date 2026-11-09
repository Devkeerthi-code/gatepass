"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { issueComp } from "../tickets/actions";

export function CompForm({ eventId, tiers }: { eventId: string; tiers: { id: string; name: string }[] }) {
  const [state, action] = useActionState(issueComp.bind(null, eventId), null);
  if (tiers.length === 0) return null;
  return (
    <form action={action} className="card stack" aria-labelledby="comp-h">
      <h2 id="comp-h">Guest list ticket</h2>
      <p className="xs muted">Free tickets for artists, crew or sponsors. They use real seats, so they can&apos;t oversell.</p>
      <FormMessage state={state} />
      <div className="field">
        <label htmlFor="c-tier">Ticket type</label>
        <select id="c-tier" name="ticketTypeId" className="select">
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="c-name">Guest name</label>
        <input id="c-name" name="buyerName" className="input" required />
      </div>
      <div className="field">
        <label htmlFor="c-email">Email</label>
        <input id="c-email" name="email" type="email" className="input" required />
      </div>
      <div className="field">
        <label htmlFor="c-phone">Mobile</label>
        <input id="c-phone" name="phone" type="tel" inputMode="numeric" className="input" required />
      </div>
      <div className="field">
        <label htmlFor="c-qty">How many</label>
        <input id="c-qty" name="qty" type="number" min={1} max={20} defaultValue={1} className="input" />
      </div>
      <SubmitButton pendingLabel="Issuing…">Issue free ticket</SubmitButton>
    </form>
  );
}
