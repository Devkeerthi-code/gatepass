"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon, type IconName } from "@/components/icon";
import { useToast } from "@/components/toaster";
import { formatShort } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { createGiveaway, createPromo, drawGiveaway, setPromoActive, setReferralReward, type PromoInput } from "./actions";
import { DrawDrum } from "./draw-drum";

type Promo = {
  id: string;
  code: string;
  label: string | null;
  kind: "PERCENT" | "FLAT" | "GROUP_FREE";
  value: number;
  autoApply: boolean;
  used: number;
  maxUses: number | null;
  active: boolean;
  emailDomain: string | null;
  minQty: number;
  startsAt: string | null;
  endsAt: string | null;
  tiers: string[];
};
type Giveaway = {
  id: string;
  title: string;
  prize: string;
  closesAt: string;
  winnersCount: number;
  entries: number;
  status: "OPEN" | "DRAWN";
  seedHash: string;
  seed: string | null;
  winners: string[];
};
type Props = {
  eventId: string;
  tiers: { id: string; name: string }[];
  promos: Promo[];
  giveaways: Giveaway[];
  drops: { id: string; name: string; at: string | null; subscribers: number }[];
  referrals: { code: string; name: string; sold: number; rewardAfter: number }[];
  waitlist: { tier: string; waiting: number; offered: number; claimed: number }[];
};

type Creator = "CODE" | "HAPPY_HOUR" | "GROUP" | "GIVEAWAY" | null;

function describe(p: Promo): string {
  if (p.kind === "GROUP_FREE") return `Buy ${p.minQty}, ${p.value} free`;
  const off = p.kind === "PERCENT" ? `${p.value}% off` : `${formatPaise(p.value)} off`;
  const extras = [
    p.emailDomain ? `@${p.emailDomain} only` : null,
    p.tiers.length ? p.tiers.join(", ") : null,
    p.endsAt ? `until ${formatShort(p.endsAt)}` : null,
  ].filter(Boolean);
  return [off, ...extras].join(" · ");
}

export function PromoHub(props: Props) {
  const { eventId } = props;
  const [creator, setCreator] = useState<Creator>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const toast = useToast();

  const open = (c: Creator) => {
    setCreator(c);
    dialog.current?.showModal();
  };

  const toggle = (p: Promo) =>
    start(async () => {
      const res = await setPromoActive(eventId, p.id, !p.active);
      toast(res.message, { error: !res.ok });
      router.refresh();
    });

  const ideas: { icon: IconName; title: string; body: string; action: React.ReactNode }[] = [
    {
      icon: "percent",
      title: "Discount code",
      body: "% or ₹ off, usage caps, per-person limits, college-email only.",
      action: (
        <button className="btn btn-sm btn-accent" onClick={() => open("CODE")}>
          Create code
        </button>
      ),
    },
    {
      icon: "bolt",
      title: "Flash drop",
      body: "Release a block of seats at a set time with a live countdown and a notify-me list.",
      action: (
        <Link className="btn btn-sm" href={`/host/events/${eventId}/tickets`}>
          Schedule in Tickets
        </Link>
      ),
    },
    {
      icon: "gift",
      title: "Giveaway",
      body: "Free entry, verifiable random draw, winners get a ticket in their name.",
      action: (
        <button className="btn btn-sm btn-accent" onClick={() => open("GIVEAWAY")}>
          Start giveaway
        </button>
      ),
    },
    {
      icon: "clock",
      title: "Happy hour",
      body: "A % off that switches itself on and off, e.g. 9–10 PM on launch night.",
      action: (
        <button className="btn btn-sm" onClick={() => open("HAPPY_HOUR")}>
          Set happy hour
        </button>
      ),
    },
    {
      icon: "users",
      title: "Group deal",
      body: "Buy 4, pay for 3. Applied automatically when the quantity fits.",
      action: (
        <button className="btn btn-sm" onClick={() => open("GROUP")}>
          Add group deal
        </button>
      ),
    },
    {
      icon: "ladder",
      title: "Price ladder",
      body: "Early-bird pricing that steps up as seats sell. No manual switching.",
      action: (
        <Link className="btn btn-sm" href={`/host/events/${eventId}/tickets`}>
          Set on a ticket
        </Link>
      ),
    },
    {
      icon: "key",
      title: "Presale access",
      body: "A hidden ticket type that only appears with a code, e.g. for your college first.",
      action: (
        <Link className="btn btn-sm" href={`/host/events/${eventId}/tickets`}>
          Add access code
        </Link>
      ),
    },
    {
      icon: "trophy",
      title: "Fan ambassadors",
      body: "Every buyer gets a referral link. See who brings the most friends.",
      action: (
        <a className="btn btn-sm" href="#referrals">
          See leaderboard
        </a>
      ),
    },
    {
      icon: "hourglass",
      title: "Waitlist auto-offer",
      body: "Sold-out tiers collect a queue. Freed seats are offered for 15 minutes, in order.",
      action: (
        <a className="btn btn-sm" href="#waitlist">
          See queue
        </a>
      ),
    },
  ];

  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="running-h">
        <div className="sec-h">
          <h2 id="running-h">Running now</h2>
          <span className="label">{props.promos.filter((p) => p.active).length} active</span>
        </div>
        {props.promos.length === 0 ? (
          <p className="small muted">No codes or deals yet. Pick one below.</p>
        ) : (
          <ul className="promo-list" role="list">
            {props.promos.map((p) => (
              <li key={p.id} className={p.active ? "" : "paused"}>
                <div className="coupon" aria-hidden="true">
                  <span>{p.autoApply ? "AUTO" : p.code}</span>
                </div>
                <div className="grow">
                  <b>{p.autoApply ? p.label : p.code}</b>
                  <div className="xs muted">{describe(p)}</div>
                </div>
                <span className="mono xs">
                  {p.used}
                  {p.maxUses ? `/${p.maxUses}` : ""} used
                </span>
                <label className="switch" title={p.active ? "Pause" : "Resume"}>
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={() => toggle(p)}
                    disabled={pending}
                    aria-label={`${p.active ? "Pause" : "Resume"} ${p.code}`}
                  />
                  <span />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ideas-h">
        <div className="sec-h">
          <h2 id="ideas-h">Ways to sell out</h2>
        </div>
        <div className="idea-grid">
          {ideas.map((i) => (
            <div key={i.title} className="card idea">
              <Icon name={i.icon} />
              <h3>{i.title}</h3>
              <p className="xs muted">{i.body}</p>
              <div>{i.action}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="gw-h">
        <div className="sec-h">
          <h2 id="gw-h">Giveaways</h2>
          <button className="btn btn-sm" onClick={() => open("GIVEAWAY")}>
            <Icon name="plus" small /> New
          </button>
        </div>
        {props.giveaways.length === 0 ? (
          <p className="small muted">None yet. A giveaway shows on your concert page and collects entries without a purchase.</p>
        ) : null}
        {props.giveaways.map((g) => (
          <GiveawayRow key={g.id} eventId={eventId} g={g} />
        ))}
      </section>

      {props.drops.length ? (
        <section className="card stack" aria-labelledby="drops-h">
          <h2 id="drops-h">Flash drops</h2>
          {props.drops.map((d) => (
            <div key={d.id} className="row between wrap small">
              <span>
                <b>{d.name}</b> · {d.at ? `drops ${formatShort(d.at)}` : "no time set"}
              </span>
              <span className="chip">{d.subscribers} waiting for the drop</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card stack" id="referrals" aria-labelledby="ref-h">
        <div className="sec-h">
          <h2 id="ref-h">Fan ambassador leaderboard</h2>
          <RewardSetter eventId={eventId} current={props.referrals[0]?.rewardAfter ?? 5} />
        </div>
        {props.referrals.length === 0 ? (
          <p className="small muted">Buyers get a “Get my link” button on their ticket. Their sales show up here.</p>
        ) : (
          <ol className="leaderboard">
            {props.referrals.map((r, i) => (
              <li key={r.code}>
                <span className={`mono xs ${i < 3 ? "chip chip-accent" : ""}`}>#{i + 1}</span>
                <b>{r.name}</b>
                <span className="mono xs muted">{r.code}</span>
                <span className={`chip ${r.sold >= r.rewardAfter ? "chip-ok" : ""}`}>
                  {r.sold} sold{r.sold >= r.rewardAfter ? " · reward earned" : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card stack" id="waitlist" aria-labelledby="wl-h">
        <h2 id="wl-h">Waitlist</h2>
        {props.waitlist.length === 0 ? (
          <p className="small muted">When a ticket type sells out, fans can join its waitlist from the concert page.</p>
        ) : (
          props.waitlist.map((w) => (
            <div key={w.tier} className="row between wrap small">
              <b>{w.tier}</b>
              <span className="row wrap">
                <span className="chip">{w.waiting} waiting</span>
                <span className="chip chip-warn">{w.offered} offered</span>
                <span className="chip chip-ok">{w.claimed} bought</span>
              </span>
            </div>
          ))
        )}
      </section>

      <dialog ref={dialog} className="sheet" aria-labelledby="creator-h" onClose={() => setCreator(null)}>
        {creator === "GIVEAWAY" ? (
          <GiveawayForm eventId={eventId} tiers={props.tiers} onDone={() => dialog.current?.close()} />
        ) : creator ? (
          <PromoForm type={creator} eventId={eventId} tiers={props.tiers} onDone={() => dialog.current?.close()} />
        ) : null}
      </dialog>
    </div>
  );
}

function PromoForm({
  type,
  eventId,
  tiers,
  onDone,
}: {
  type: "CODE" | "HAPPY_HOUR" | "GROUP";
  eventId: string;
  tiers: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [f, setF] = useState<PromoInput>({
    type,
    code: "",
    label: "",
    kind: "PERCENT",
    value: type === "GROUP" ? 1 : 10,
    maxUses: "",
    perEmailLimit: 1,
    emailDomain: "",
    groupSize: 4,
    ticketTypeIds: [],
    startsAt: "",
    endsAt: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const title = type === "CODE" ? "New discount code" : type === "HAPPY_HOUR" ? "Happy hour" : "Group deal";
  const set = (patch: Partial<PromoInput>) => setF({ ...f, ...patch });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createPromo(eventId, f);
          if (!res.ok) return setError(res.message);
          toast(res.message);
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="dlg-h">
        <h2 id="creator-h">{title}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="dlg-b">
        {type === "CODE" ? (
          <>
            <div className="coupon-preview" aria-hidden="true">
              <span className="mono">{String(f.code || "CODE").toUpperCase()}</span>
              <span>{f.kind === "PERCENT" ? `${f.value || 0}% OFF` : `₹${f.value || 0} OFF`}</span>
            </div>
            <div className="grid-2">
              <Field
                label="Code"
                value={String(f.code ?? "")}
                onChange={(v) => set({ code: v.toUpperCase() })}
                hint="What buyers type, e.g. NIGHTOWL"
              />
              <div className="field">
                <span className="flabel">Discount type</span>
                <div className="seg">
                  {(["PERCENT", "FLAT"] as const).map((k) => (
                    <label key={k}>
                      <input type="radio" checked={f.kind === k} onChange={() => set({ kind: k })} />
                      <span>{k === "PERCENT" ? "% off" : "₹ off"}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid-3">
              <Field
                label={f.kind === "PERCENT" ? "Percent off" : "Rupees off"}
                type="number"
                value={String(f.value)}
                onChange={(v) => set({ value: v })}
              />
              <Field
                label="Total uses"
                type="number"
                value={String(f.maxUses ?? "")}
                onChange={(v) => set({ maxUses: v })}
                hint="Empty = unlimited"
              />
              <Field label="Per person" type="number" value={String(f.perEmailLimit)} onChange={(v) => set({ perEmailLimit: v })} />
            </div>
            <Field
              label="Only for email domain"
              value={String(f.emailDomain ?? "")}
              onChange={(v) => set({ emailDomain: v })}
              hint="Optional, e.g. dit.ac.in for students of your college"
            />
          </>
        ) : type === "HAPPY_HOUR" ? (
          <Field label="Percent off" type="number" value={String(f.value)} onChange={(v) => set({ value: v })} />
        ) : (
          <div className="grid-2">
            <Field
              label="Group size"
              type="number"
              value={String(f.groupSize)}
              onChange={(v) => set({ groupSize: v })}
              hint="Buy this many…"
            />
            <Field
              label="Free tickets per group"
              type="number"
              value={String(f.value)}
              onChange={(v) => set({ value: v })}
              hint="…and get this many free"
            />
          </div>
        )}
        <div className="grid-2">
          <Field
            label={type === "HAPPY_HOUR" ? "Starts" : "Valid from"}
            type="datetime-local"
            value={String(f.startsAt ?? "")}
            onChange={(v) => set({ startsAt: v })}
            hint={type === "HAPPY_HOUR" ? undefined : "Optional"}
          />
          <Field
            label={type === "HAPPY_HOUR" ? "Ends" : "Valid until"}
            type="datetime-local"
            value={String(f.endsAt ?? "")}
            onChange={(v) => set({ endsAt: v })}
            hint={type === "HAPPY_HOUR" ? undefined : "Optional"}
          />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="flabel">Applies to</legend>
          <div className="row wrap">
            {tiers.map((t) => {
              const on = f.ticketTypeIds?.includes(t.id);
              return (
                <label key={t.id} className={`chip ${on ? "chip-ink" : ""}`} style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={!!on}
                    onChange={() =>
                      set({ ticketTypeIds: on ? f.ticketTypeIds!.filter((x) => x !== t.id) : [...(f.ticketTypeIds ?? []), t.id] })
                    }
                  />
                  {t.name}
                </label>
              );
            })}
          </div>
          <span className="hint">None selected = every ticket type.</span>
        </fieldset>
        {error ? (
          <p className="notice notice-no small" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="dlg-f">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-accent" disabled={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null} Make it live
        </button>
      </div>
    </form>
  );
}

function GiveawayForm({ eventId, tiers, onDone }: { eventId: string; tiers: { id: string; name: string }[]; onDone: () => void }) {
  const [f, setF] = useState({ title: "", ticketTypeId: tiers[0]?.id ?? "", winnersCount: 3, closesAt: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createGiveaway(eventId, f);
          if (!res.ok) return setError(res.message);
          toast(res.message);
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="dlg-h">
        <h2 id="creator-h">New giveaway</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="dlg-b">
        <Field label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} hint="e.g. Win 2 Fan Pit passes" />
        <div className="grid-2">
          <div className="field">
            <label htmlFor="gw-tier">Prize ticket</label>
            <select id="gw-tier" className="select" value={f.ticketTypeId} onChange={(e) => setF({ ...f, ticketTypeId: e.target.value })}>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <Field label="Winners" type="number" value={String(f.winnersCount)} onChange={(v) => setF({ ...f, winnersCount: Number(v) })} />
        </div>
        <Field label="Entries close" type="datetime-local" value={f.closesAt} onChange={(v) => setF({ ...f, closesAt: v })} />
        <p className="xs muted">
          A random seed is fixed now and its fingerprint shown publicly. After the draw the seed is revealed, so anyone can check the
          winners weren&apos;t picked by hand.
        </p>
        {error ? (
          <p className="notice notice-no small" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="dlg-f">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-accent" disabled={pending || tiers.length === 0}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null} Open giveaway
        </button>
      </div>
    </form>
  );
}

function GiveawayRow({ eventId, g }: { eventId: string; g: Giveaway }) {
  const [drawn, setDrawn] = useState<{ winners: string[]; entrants: string[]; seed: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const draw = () =>
    start(async () => {
      const res = await drawGiveaway(eventId, g.id);
      if (!res.ok) return toast(res.message, { error: true });
      setDrawn({ winners: res.winners.map((w) => w.name), entrants: res.entrants, seed: res.seed });
      const unticketed = res.winners.filter((w) => !w.ticketed).length;
      if (unticketed) toast(`${unticketed} winner(s) couldn't get a seat: the prize tier is full.`, { error: true });
    });

  return (
    <div className="giveaway-row stack">
      <div className="row between wrap">
        <div>
          <b>{g.title}</b>
          <div className="xs muted">
            {g.prize} · {g.winnersCount} winners · {g.entries} entries ·{" "}
            {g.status === "OPEN" ? `closes ${formatShort(g.closesAt)}` : "drawn"}
          </div>
        </div>
        {g.status === "OPEN" ? (
          <button className="btn btn-sm btn-accent" onClick={draw} disabled={pending || g.entries === 0}>
            {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="shuffle" small />} Draw winners
          </button>
        ) : (
          <span className="chip chip-ok">Winners: {g.winners.join(", ")}</span>
        )}
      </div>
      {drawn ? (
        <DrawDrum
          entrants={drawn.entrants}
          winners={drawn.winners}
          onClose={() => {
            setDrawn(null);
            router.refresh();
          }}
        />
      ) : null}
      <p className="xs muted mono" style={{ wordBreak: "break-all" }}>
        Fingerprint {g.seedHash}
        {g.seed || drawn ? ` · seed ${drawn?.seed ?? g.seed}` : ""}
      </p>
    </div>
  );
}

function RewardSetter({ eventId, current }: { eventId: string; current: number }) {
  const [n, setN] = useState(current);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setReferralReward(eventId, n);
          toast(res.message, { error: !res.ok });
        });
      }}
    >
      <label className="xs" htmlFor="reward-n">
        Reward after
      </label>
      <input
        id="reward-n"
        className="input"
        style={{ width: 70, minHeight: 34 }}
        type="number"
        min={1}
        max={50}
        value={n}
        onChange={(e) => setN(Number(e.target.value))}
      />
      <span className="xs">sales</span>
      <button className="btn btn-sm" type="submit" disabled={pending}>
        Save
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  const id = `p-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
