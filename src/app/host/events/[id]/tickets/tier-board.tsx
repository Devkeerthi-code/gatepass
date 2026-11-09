"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { parseTicketStyle, TicketCard } from "@/components/ticket-card";
import { useToast } from "@/components/toaster";
import { formatShort, fromLocalInput } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import { deleteTier, saveTier } from "./actions";

type Tier = {
  id: string;
  name: string;
  description: string;
  priceRupees: number;
  capacity: number;
  reserved: number;
  admits: number;
  perOrderLimit: number;
  salesStart: string;
  salesEnd: string;
  isDrop: boolean;
  accessCode: string;
  steps: { afterSold: number; priceRupees: number }[];
  waitlist: number;
  dropAlerts: number;
  saleState: string;
};

type Draft = Omit<Tier, "reserved" | "waitlist" | "dropAlerts" | "saleState" | "id"> & { id?: string };

const BLANK: Draft = {
  name: "",
  description: "",
  priceRupees: 499,
  capacity: 200,
  admits: 1,
  perOrderLimit: 6,
  salesStart: "",
  salesEnd: "",
  isDrop: false,
  accessCode: "",
  steps: [],
};

const PRESETS: { label: string; draft: Partial<Draft> }[] = [
  { label: "General admission", draft: { name: "General Admission", priceRupees: 499, capacity: 500 } },
  { label: "Early bird", draft: { name: "Early Bird", priceRupees: 349, capacity: 100, perOrderLimit: 4 } },
  { label: "Group of 4", draft: { name: "Group of 4", priceRupees: 1599, capacity: 50, admits: 4, perOrderLimit: 2, description: "One QR admits four" } },
  { label: "Free student entry", draft: { name: "Student Free", priceRupees: 0, capacity: 100, perOrderLimit: 1 } },
  { label: "VIP flash drop", draft: { name: "VIP", priceRupees: 1999, capacity: 40, isDrop: true, perOrderLimit: 2 } },
];

function toDraft(t: Tier): Draft {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    priceRupees: t.priceRupees,
    capacity: t.capacity,
    admits: t.admits,
    perOrderLimit: t.perOrderLimit,
    salesStart: t.salesStart,
    salesEnd: t.salesEnd,
    isDrop: t.isDrop,
    accessCode: t.accessCode,
    steps: t.steps,
  };
}

export function TierBoard({ eventId, tiers, ticketStock }: { eventId: string; tiers: Tier[]; ticketStock: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const toast = useToast();
  const router = useRouter();
  const style = parseTicketStyle(ticketStock);

  const open = (d: Draft) => {
    setDraft(d);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  const submit = () =>
    draft &&
    start(async () => {
      const res = await saveTier(eventId, draft);
      if (res?.error) return toast(res.error, { error: true });
      toast(res?.ok ?? "Saved");
      close();
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteTier(eventId, id);
      if (res?.error) return toast(res.error, { error: true });
      toast(res?.ok ?? "Deleted");
      router.refresh();
    });

  return (
    <>
      <div className="tier-grid">
        {tiers.map((t) => {
          const state = t.saleState;
          return (
            <div key={t.id} className="tier-admin">
              <TicketCard
                name={t.name}
                kicker={`${t.admits > 1 ? `Admits ${t.admits}` : "Admit one"}${t.accessCode ? " · hidden presale" : ""}`}
                price={t.priceRupees ? formatPaise(t.priceRupees * 100) : "FREE"}
                priceNote={state.toUpperCase()}
                serial={`${t.reserved}/${t.capacity}`}
                perks={t.description || null}
                stock={style.stock}
                pattern={style.pattern}
              >
                <div className="meter accent" style={{ marginTop: 10, maxWidth: 220 }}>
                  <i style={{ transform: `scaleX(${t.reserved / t.capacity})` }} />
                </div>
              </TicketCard>
              <div className="row wrap xs muted" style={{ marginTop: 8 }}>
                {t.steps.length ? <span className="chip">Price ladder · {t.steps.length} steps</span> : null}
                {t.isDrop && t.salesStart ? <span className="chip chip-accent">Drops {formatShort(fromLocalInput(t.salesStart))} · {t.dropAlerts} waiting</span> : null}
                {t.accessCode ? <span className="chip">Code {t.accessCode}</span> : null}
                {t.waitlist ? <span className="chip">{t.waitlist} on waitlist</span> : null}
                <span className="grow" />
                <button className="btn btn-sm" type="button" onClick={() => open(toDraft(t))}>
                  Edit
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => remove(t.id)} disabled={pending} aria-label={`Delete ${t.name}`}>
                  <Icon name="trash" small />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="sec-h">
          <h2>Add a ticket type</h2>
          <span className="label">Start from a preset</span>
        </div>
        <div className="row wrap">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn btn-sm" onClick={() => open({ ...BLANK, ...p.draft })}>
              <Icon name="plus" small /> {p.label}
            </button>
          ))}
          <button type="button" className="btn btn-sm btn-ink" onClick={() => open({ ...BLANK })}>
            Blank
          </button>
        </div>
      </div>

      <dialog ref={dialog} className="sheet" aria-labelledby="tier-dlg-h" onClose={() => setDraft(null)}>
        {draft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="dlg-h">
              <h2 id="tier-dlg-h">{draft.id ? `Edit ${draft.name}` : "New ticket type"}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="dlg-b">
              <div className="grid-2">
                <Num label="Name" text value={draft.name} onChange={(v) => setDraft({ ...draft, name: String(v) })} />
                <Num label="Price (₹)" value={draft.priceRupees} onChange={(v) => setDraft({ ...draft, priceRupees: Number(v) })} hint="0 = free, skips payment" />
              </div>
              <Num label="Short description" text value={draft.description} onChange={(v) => setDraft({ ...draft, description: String(v) })} hint="e.g. First 3 rows, separate queue" />
              <div className="grid-3">
                <Num label="Seats" value={draft.capacity} onChange={(v) => setDraft({ ...draft, capacity: Number(v) })} />
                <Num label="Admits per ticket" value={draft.admits} onChange={(v) => setDraft({ ...draft, admits: Number(v) })} />
                <Num label="Max per order" value={draft.perOrderLimit} onChange={(v) => setDraft({ ...draft, perOrderLimit: Number(v) })} />
              </div>
              <div className="grid-2">
                <Num label="Sales start" type="datetime-local" text value={draft.salesStart} onChange={(v) => setDraft({ ...draft, salesStart: String(v) })} hint="Empty = on sale now" />
                <Num label="Sales end" type="datetime-local" text value={draft.salesEnd} onChange={(v) => setDraft({ ...draft, salesEnd: String(v) })} hint="Empty = until sold out" />
              </div>
              <label className="row small">
                <span className="switch">
                  <input type="checkbox" checked={draft.isDrop} onChange={(e) => setDraft({ ...draft, isDrop: e.target.checked })} />
                  <span />
                </span>
                Flash drop: show a countdown and a “notify me” button until sales start
              </label>
              <Num
                label="Presale access code"
                text
                value={draft.accessCode}
                onChange={(v) => setDraft({ ...draft, accessCode: String(v).toUpperCase() })}
                hint="Optional. Hides this ticket until someone enters the code."
              />
              <div className="field">
                <span className="flabel">Price ladder</span>
                <span className="hint">The price steps up automatically as seats sell. Each buyer pays the price shown when they hold seats.</span>
                {draft.steps.map((s, i) => (
                  <div key={i} className="row">
                    <span className="small">After</span>
                    <input
                      className="input"
                      style={{ width: 90 }}
                      type="number"
                      min={1}
                      aria-label="Seats sold"
                      value={s.afterSold}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, afterSold: Number(e.target.value) } : x)) })}
                    />
                    <span className="small">sold, price ₹</span>
                    <input
                      className="input"
                      style={{ width: 100 }}
                      type="number"
                      min={0}
                      aria-label="New price in rupees"
                      value={s.priceRupees}
                      onChange={(e) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, priceRupees: Number(e.target.value) } : x)) })}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove step" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })}>
                      <Icon name="x" small />
                    </button>
                  </div>
                ))}
                {draft.steps.length < 5 ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ justifySelf: "start" }}
                    onClick={() => {
                      const last = draft.steps.at(-1);
                      setDraft({
                        ...draft,
                        steps: [...draft.steps, { afterSold: (last?.afterSold ?? 0) + Math.max(1, Math.floor(draft.capacity / 4)), priceRupees: (last?.priceRupees ?? draft.priceRupees) + 200 }],
                      });
                    }}
                  >
                    <Icon name="ladder" small /> Add price step
                  </button>
                ) : null}
              </div>
            </div>
            <div className="dlg-f">
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-accent" disabled={pending}>
                {pending ? <span className="spinner" aria-hidden="true" /> : null}
                Save ticket
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}

function Num({
  label,
  value,
  onChange,
  hint,
  text,
  type,
}: {
  label: string;
  value: string | number;
  onChange: (v: string | number) => void;
  hint?: string;
  text?: boolean;
  type?: string;
}) {
  const id = `t-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type={type ?? (text ? "text" : "number")}
        min={text ? undefined : 0}
        value={value}
        onChange={(e) => onChange(text ? e.target.value : e.target.value === "" ? "" : Number(e.target.value))}
      />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
