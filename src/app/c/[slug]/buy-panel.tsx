"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { TicketCard, type TicketPattern, type TicketStock } from "@/components/ticket-card";
import { useToast } from "@/components/toaster";
import { formatShort } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { Spring, stampIn } from "@/lib/physics";
import type { PublicTier } from "@/server/public-event";
import { holdSeats, joinWaitlist, subscribeToDrop } from "../actions";
import { Countdown } from "@/components/countdown";

export function BuyPanel({
  tiers,
  stock,
  pattern,
  serialPrefix,
  hasHiddenTiers,
  accessCode,
  referralCode,
}: {
  tiers: PublicTier[];
  stock: TicketStock;
  pattern: TicketPattern;
  serialPrefix: string;
  hasHiddenTiers: boolean;
  accessCode: string | null;
  referralCode: string | null;
}) {
  const buyable = tiers.filter((t) => t.state === "ON_SALE");
  const [selected, setSelected] = useState<string | null>(buyable.find((t) => t.locked)?.id ?? buyable[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState(accessCode ?? "");
  const idempotencyKey = useRef<string | null>(null);
  const qtyRef = useRef<HTMLSpanElement>(null);
  const roll = useRef<Spring | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const tier = useMemo(() => tiers.find((t) => t.id === selected) ?? null, [tiers, selected]);
  const maxQty = tier ? Math.min(tier.perOrderLimit, tier.remaining) : 1;
  const total = tier ? tier.pricePaise * qty : 0;
  const seats = tier ? qty * tier.admits : 0;

  useEffect(() => {
    roll.current = new Spring(
      0,
      (v) => {
        if (qtyRef.current) qtyRef.current.style.transform = `translateY(${v}px)`;
      },
      { stiffness: 700, damping: 26 },
    );
  }, []);

  const changeQty = (dir: 1 | -1) => {
    const next = Math.min(Math.max(1, qty + dir), maxQty);
    if (next === qty) return;
    setQty(next);
    idempotencyKey.current = null;
    roll.current?.set(dir * 16).to(0);
  };

  const choose = (id: string) => {
    setSelected(id);
    setQty(1);
    idempotencyKey.current = null;
    setMessage(null);
  };

  const buy = () => {
    if (!tier) return;
    // Same key for retries of the same choice, so a double tap never holds seats twice.
    idempotencyKey.current ??= crypto.randomUUID();
    const key = idempotencyKey.current;
    start(async () => {
      setMessage(null);
      const res = await holdSeats({ ticketTypeId: tier.id, qty, idempotencyKey: key, accessCode: tier.locked ? code : null, referralCode });
      if (res.ok) router.push(`/checkout/${res.orderId}`);
      else {
        idempotencyKey.current = null;
        setMessage(res.message);
        router.refresh();
      }
    });
  };

  const applyCode = () => {
    const params = new URLSearchParams();
    if (code.trim()) params.set("code", code.trim().toUpperCase());
    if (referralCode) params.set("r", referralCode);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (tiers.length === 0) {
    return (
      <div className="card stack">
        <h2 id="buy-h">Tickets</h2>
        <p className="muted small">Tickets aren&apos;t on sale yet. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="sec-h" style={{ margin: 0 }}>
        <h2 id="buy-h">Tickets</h2>
        <span className="label">No extra fees</span>
      </div>
      <div className="tiers" role="radiogroup" aria-labelledby="buy-h">
        {tiers.map((t, i) => (
          <TierTicket
            key={t.id}
            tier={t}
            index={i}
            checked={t.id === selected}
            onChoose={() => choose(t.id)}
            stock={stock}
            pattern={pattern}
            serialPrefix={serialPrefix}
          />
        ))}
      </div>

      {hasHiddenTiers ? (
        <div className="field">
          <label htmlFor="access">Have a presale code?</label>
          <div className="input-group">
            <input
              id="access"
              className="input mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. DITPRESALE"
              autoComplete="off"
            />
            <button type="button" className="btn" onClick={applyCode}>
              Unlock
            </button>
          </div>
          {accessCode && !tiers.some((t) => t.locked) ? <span className="err">That code didn&apos;t unlock anything.</span> : null}
        </div>
      ) : null}

      {tier ? (
        <div className="card stack">
          <div className="chosen">
            <div>
              <div style={{ fontWeight: 700 }} id="qty-label">
                How many?
              </div>
              <div className="xs muted">
                Max {maxQty} per order{tier.admits > 1 ? ` · each admits ${tier.admits}` : ""}
              </div>
            </div>
            <div className="qty" role="group" aria-labelledby="qty-label">
              <button type="button" onClick={() => changeQty(-1)} disabled={qty <= 1} aria-label="One less">
                <Icon name="minus" />
              </button>
              <output aria-live="polite">
                <span ref={qtyRef}>{qty}</span>
              </output>
              <button type="button" onClick={() => changeQty(1)} disabled={qty >= maxQty} aria-label="One more">
                <Icon name="plus" />
              </button>
            </div>
          </div>
          <p className="xs muted">Promo codes and group deals are applied at checkout.</p>
        </div>
      ) : null}

      {message ? (
        <p className="notice notice-no small" role="alert">
          {message}
        </p>
      ) : null}

      <div className="buybar">
        <div className="sum">
          <span className="muted">{tier ? `${qty} × ${tier.name}` : "Pick a ticket"}</span>
          <b>{tier ? (total ? formatPaise(total) : "Free") : "—"}</b>
        </div>
        <button className="btn btn-accent btn-lg btn-block" type="button" onClick={buy} disabled={!tier || pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {pending
            ? "Holding seats…"
            : !tier
              ? "Nothing on sale right now"
              : tier.pricePaise
                ? `Hold ${seats} seat${seats > 1 ? "s" : ""} & continue`
                : "Claim free pass"}
        </button>
        <p className="xs muted" style={{ textAlign: "center", marginTop: 6 }}>
          Seats are held for 10 minutes while you pay.
        </p>
      </div>
    </div>
  );
}

function TierTicket({
  tier,
  index,
  checked,
  onChoose,
  stock,
  pattern,
  serialPrefix,
}: {
  tier: PublicTier;
  index: number;
  checked: boolean;
  onChoose: () => void;
  stock: TicketStock;
  pattern: TicketPattern;
  serialPrefix: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const off = tier.state !== "ON_SALE";
  const stampText = tier.state === "SOLD_OUT" ? "Sold out" : tier.state === "ENDED" ? "Closed" : null;

  useEffect(() => {
    const stamp = ref.current?.querySelector<HTMLElement>(".stamp");
    if (!stamp) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        stampIn(stamp);
        io.disconnect();
      }
    });
    io.observe(stamp);
    return () => io.disconnect();
  }, []);

  const kicker = `${tier.admits > 1 ? `Admits ${tier.admits} · one QR` : "Admit one"}${tier.locked ? " · presale" : ""}`;
  const note =
    tier.state === "ON_SALE" && tier.remaining <= 20
      ? `${tier.remaining} LEFT`
      : tier.state === "NOT_YET"
        ? "NOT YET"
        : tier.state === "DROP"
          ? "DROP"
          : undefined;

  return (
    <div ref={ref} className={`tier ${off ? "off" : ""}`}>
      {!off ? (
        <>
          <input type="radio" name="tier" id={`t-${tier.id}`} checked={checked} onChange={onChoose} />
          <label className="hit" htmlFor={`t-${tier.id}`}>
            <span className="sr-only">
              {tier.name}, {tier.pricePaise ? formatPaise(tier.pricePaise) : "free"}
              {tier.remaining <= 20 ? `, only ${tier.remaining} left` : ""}
            </span>
          </label>
        </>
      ) : null}
      <TicketCard
        name={tier.name}
        kicker={kicker}
        perks={tier.description}
        price={tier.pricePaise ? formatPaise(tier.pricePaise) : "FREE"}
        priceNote={note}
        priceNoteHot={tier.state === "ON_SALE" && tier.remaining <= 20}
        serial={`No. ${serialPrefix}-${String(index + 1).padStart(3, "0")}`}
        stock={stock}
        pattern={pattern}
        stamp={stampText ?? undefined}
      >
        {tier.nextStep && tier.state === "ON_SALE" ? (
          <div className="ladder">
            <div className="ladder-bar" aria-hidden="true">
              <b style={{ transform: `scaleX(${tier.ladderProgress ?? 0})` }} />
            </div>
            <p>
              {formatPaise(tier.pricePaise)} now · {formatPaise(tier.nextStep.pricePaise)} after <b>{tier.nextStep.seatsUntil}</b> more sold
            </p>
          </div>
        ) : null}
        {tier.state === "DROP" && tier.salesStart ? <DropRow tierId={tier.id} at={tier.salesStart} /> : null}
        {tier.state === "NOT_YET" && tier.salesStart ? (
          <p className="xs" style={{ marginTop: 8 }}>
            On sale {formatShort(tier.salesStart)}
          </p>
        ) : null}
        {tier.state === "SOLD_OUT" ? <WaitlistRow tierId={tier.id} tierName={tier.name} /> : null}
      </TicketCard>
    </div>
  );
}

function DropRow({ tierId, at }: { tierId: string; at: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="act" style={{ marginTop: 12 }}>
      <div className="drop">
        <span className="xs" style={{ fontWeight: 700 }}>
          Drops in
        </span>
        <Countdown to={at} onDone={() => router.refresh()} />
        {!open && !done ? (
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            <Icon name="bell" small /> Notify me
          </button>
        ) : null}
      </div>
      {open && !done ? (
        <form
          className="input-group"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await subscribeToDrop(tierId, email);
              if (res.ok) setDone(res.message);
              else toast(res.message, { error: true });
            });
          }}
        >
          <label className="sr-only" htmlFor={`drop-${tierId}`}>
            Email for the drop alert
          </label>
          <input
            id={`drop-${tierId}`}
            className="input"
            type="email"
            required
            placeholder="you@college.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn btn-ink" type="submit" disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : "Save"}
          </button>
        </form>
      ) : null}
      {done ? (
        <p className="xs" style={{ marginTop: 8 }}>
          {done}
        </p>
      ) : null}
    </div>
  );
}

function WaitlistRow({ tierId, tierName }: { tierId: string; tierName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", qty: 1 });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message: string; link?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="act" style={{ marginTop: 12 }}>
      <button type="button" className="btn btn-sm" onClick={() => dialog.current?.showModal()}>
        Join waitlist
      </button>
      <dialog ref={dialog} className="sheet" aria-labelledby={`wl-${tierId}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const res = await joinWaitlist(tierId, form);
              if (res.ok) setResult({ message: res.message, link: res.link });
              else setError(res.message);
            });
          }}
        >
          <div className="dlg-h">
            <h2 id={`wl-${tierId}`}>Waitlist · {tierName}</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
          <div className="dlg-b">
            {result ? (
              <div className="stack">
                <p className="notice notice-ok">{result.message}</p>
                {result.link ? (
                  <a className="btn btn-accent" href={result.link}>
                    Open my waitlist link
                  </a>
                ) : null}
              </div>
            ) : (
              <>
                <p className="small muted">When someone&apos;s hold expires, the first person waiting gets the seats for 15 minutes.</p>
                {error ? (
                  <p className="err" role="alert">
                    {error}
                  </p>
                ) : null}
                {(["name", "email", "phone"] as const).map((f) => (
                  <div key={f} className="field">
                    <label htmlFor={`wl-${tierId}-${f}`}>{f === "phone" ? "Mobile" : f[0].toUpperCase() + f.slice(1)}</label>
                    <input
                      id={`wl-${tierId}-${f}`}
                      className="input"
                      required
                      type={f === "email" ? "email" : f === "phone" ? "tel" : "text"}
                      inputMode={f === "phone" ? "numeric" : undefined}
                      value={form[f]}
                      onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                    />
                  </div>
                ))}
                <div className="field">
                  <label htmlFor={`wl-${tierId}-qty`}>Tickets needed</label>
                  <select
                    id={`wl-${tierId}-qty`}
                    className="select"
                    value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          {!result ? (
            <div className="dlg-f">
              <button type="submit" className="btn btn-accent" disabled={pending}>
                {pending ? <span className="spinner" aria-hidden="true" /> : null}
                Join waitlist
              </button>
            </div>
          ) : null}
        </form>
      </dialog>
    </div>
  );
}
