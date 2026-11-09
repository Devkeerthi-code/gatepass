"use client";

import { useState, useTransition } from "react";
import { TicketCard, type TicketStock } from "@/components/ticket-card";
import { formatShort } from "@/lib/format";
import { enterGiveaway } from "../actions";

export function GiveawayCard({
  id,
  title,
  tierName,
  closesAt,
  winners,
  entries,
  seedHash,
  stock,
}: {
  id: string;
  title: string;
  tierName: string;
  closesAt: string;
  winners: number;
  entries: number;
  seedHash: string;
  stock: TicketStock;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className="give" aria-labelledby="gw-h">
      <div className="mini" aria-hidden="true">
        <TicketCard name={tierName} kicker="Giveaway" price="WIN" serial={`${winners} winners`} stock={stock} pattern="halftone" />
      </div>
      <span className="label" style={{ color: "inherit", opacity: 0.7 }}>
        Giveaway · closes {formatShort(closesAt)}
      </span>
      <h3 id="gw-h">{title}</h3>
      <p className="small muted" style={{ maxWidth: "34ch" }}>
        {winners} winner{winners > 1 ? "s" : ""}, drawn with a random seed fixed in advance. {entries} entr{entries === 1 ? "y" : "ies"} so
        far. No purchase needed.
      </p>
      {msg?.ok ? (
        <p className="small" role="status">
          {msg.text}
        </p>
      ) : (
        <form
          className="stack"
          style={{ maxWidth: 360 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await enterGiveaway(id, form);
              setMsg({ ok: res.ok, text: res.message });
            });
          }}
        >
          <label className="sr-only" htmlFor="gw-name">
            Your name
          </label>
          <input
            id="gw-name"
            className="input"
            placeholder="Your name"
            autoComplete="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label className="sr-only" htmlFor="gw-email">
            Email
          </label>
          <input
            id="gw-email"
            className="input"
            type="email"
            placeholder="you@college.edu"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label className="sr-only" htmlFor="gw-phone">
            Mobile number
          </label>
          <div className="input-group">
            <input
              id="gw-phone"
              className="input"
              type="tel"
              inputMode="numeric"
              placeholder="Mobile"
              autoComplete="tel-national"
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <button className="btn btn-accent" type="submit" disabled={pending}>
              {pending ? <span className="spinner" aria-hidden="true" /> : "Enter"}
            </button>
          </div>
          {msg && !msg.ok ? (
            <p className="xs" role="alert" style={{ color: "#ff9a92" }}>
              {msg.text}
            </p>
          ) : null}
        </form>
      )}
      <p className="xs muted mono" style={{ wordBreak: "break-all" }}>
        Seed fingerprint: {seedHash.slice(0, 16)}…
      </p>
    </section>
  );
}
