"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { STOCKS, parseTicketStyle, TicketCard, type TicketPattern, type TicketStock } from "@/components/ticket-card";
import { useToast } from "@/components/toaster";
import { formatDay, fromLocalInput, formatTime } from "@/lib/format";
import { contrastRatio } from "@/lib/accent";
import { slugify } from "@/lib/slug";
import { removePoster, saveEvent, setPublished, uploadPoster, type EventInput } from "../../actions";

type Draft = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  venue: string;
  venueAddress: string;
  mapUrl: string;
  startsAt: string;
  doorsAt: string;
  endsAt: string;
  accentHex: string;
  ticketStock: string;
  serialPrefix: string;
  refundPolicy: string;
  artists: { name: string; billing: string; startsAt: string }[];
  faqs: { question: string; answer: string }[];
  questions: { label: string; required: boolean }[];
};

const TABS = ["Details", "Lineup", "Look & ticket", "FAQ", "Checkout"] as const;
type Tab = (typeof TABS)[number];
const ACCENTS = [
  { hex: "#D4136F", name: "Riso pink" },
  { hex: "#2B3FE0", name: "Stage blue" },
  { hex: "#C8431F", name: "Ember" },
  { hex: "#0B7559", name: "Forest" },
  { hex: "#7A3FE0", name: "Violet" },
  { hex: "#16130F", name: "Ink" },
];
const PATTERNS: TicketPattern[] = ["guilloche", "halftone", "stripes", "plain"];

function safeDate(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  return fromLocalInput(v);
}

export function Builder({
  eventId,
  orgName,
  status,
  hasPoster,
  ticketTypeCount,
  initial,
}: {
  eventId: string;
  orgName: string;
  status: "DRAFT" | "PUBLISHED";
  hasPoster: boolean;
  ticketTypeCount: number;
  initial: Draft;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [tab, setTab] = useState<Tab>("Details");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const [uploading, startUploading] = useTransition();
  const [posterVersion, setPosterVersion] = useState(0);
  const toast = useToast();
  const router = useRouter();
  const slugTouched = initial.slug && !initial.slug.startsWith("untitled-");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setD((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !slugTouched) next.slug = slugify(String(value));
      return next;
    });
    setDirty(true);
  };

  const save = () =>
    startSaving(async () => {
      setError(null);
      const res = await saveEvent(eventId, d as EventInput);
      if (res?.error) {
        setError(res.error);
        toast(res.error, { error: true });
        return;
      }
      setDirty(false);
      toast("Saved");
      router.refresh();
    });

  const togglePublish = () =>
    startPublishing(async () => {
      const res = await setPublished(eventId, status !== "PUBLISHED");
      if (res?.error) toast(res.error, { error: true });
      else {
        toast(res?.ok ?? "Done");
        router.refresh();
      }
    });

  const onPoster = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("poster", file);
    startUploading(async () => {
      const res = await uploadPoster(eventId, fd);
      if (res?.error) toast(res.error, { error: true });
      else {
        toast("Poster updated");
        setPosterVersion((v) => v + 1);
        router.refresh();
      }
    });
  };

  const style = parseTicketStyle(d.ticketStock);
  const start = safeDate(d.startsAt);
  const headliner = d.artists.find((a) => a.billing.toLowerCase().startsWith("head"))?.name ?? d.artists[0]?.name;

  return (
    <div className="builder">
      <div className="head">
        <div>
          <div className="crumbs">
            <Link href="/host">Concerts</Link> / Concert page
          </div>
          <h1>{d.name || "Untitled"}</h1>
        </div>
        <div className="row wrap">
          <span className={`chip ${status === "PUBLISHED" ? "chip-ok" : ""}`}>{status === "PUBLISHED" ? "Live" : "Draft"}</span>
          {status === "PUBLISHED" ? (
            <Link className="btn btn-sm" href={`/c/${initial.slug}`} target="_blank">
              View page <Icon name="external" small />
            </Link>
          ) : null}
          <button
            className="btn btn-sm"
            type="button"
            onClick={togglePublish}
            disabled={publishing || dirty}
            title={dirty ? "Save first" : undefined}
          >
            {publishing ? <span className="spinner" aria-hidden="true" /> : null}
            {status === "PUBLISHED" ? "Unpublish" : "Publish"}
          </button>
          <button className="btn btn-accent btn-sm" type="button" onClick={save} disabled={saving || !dirty}>
            {saving ? <span className="spinner" aria-hidden="true" /> : null}
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      {status === "DRAFT" && ticketTypeCount === 0 ? (
        <p className="notice" style={{ marginBottom: 16 }}>
          <Icon name="ticket" /> Next: <Link href={`/host/events/${eventId}/tickets`}>add ticket types</Link>, then publish.
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-no" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      ) : null}

      <div className="builder-grid">
        <div className="card">
          <div className="seg" role="tablist" aria-label="Builder sections" style={{ marginBottom: 16 }}>
            {TABS.map((t) => (
              <label key={t}>
                <input type="radio" name="tab" checked={tab === t} onChange={() => setTab(t)} role="tab" aria-selected={tab === t} />
                <span>{t}</span>
              </label>
            ))}
          </div>

          {tab === "Details" ? (
            <div className="stack">
              <div className="grid-2">
                <Text label="Concert name" value={d.name} onChange={(v) => set("name", v)} />
                <Text
                  label="Page address"
                  prefix="/c/"
                  value={d.slug}
                  onChange={(v) => set("slug", slugify(v))}
                  hint="Lowercase, dashes."
                />
              </div>
              <Text label="Tagline" value={d.tagline} onChange={(v) => set("tagline", v)} hint="One line under the title. Optional." />
              <Area
                label="Description"
                value={d.description}
                onChange={(v) => set("description", v)}
                hint="What's the night like? Who should come?"
              />
              <div className="grid-2">
                <Text label="Starts" type="datetime-local" value={d.startsAt} onChange={(v) => set("startsAt", v)} />
                <Text label="Ends" type="datetime-local" value={d.endsAt} onChange={(v) => set("endsAt", v)} />
              </div>
              <Text
                label="Doors open"
                type="datetime-local"
                value={d.doorsAt}
                onChange={(v) => set("doorsAt", v)}
                hint="Optional. Shown on tickets."
              />
              <div className="grid-2">
                <Text label="Venue" value={d.venue} onChange={(v) => set("venue", v)} />
                <Text label="Address" value={d.venueAddress} onChange={(v) => set("venueAddress", v)} />
              </div>
              <Text label="Map link" value={d.mapUrl} onChange={(v) => set("mapUrl", v)} hint="Google Maps share link. Optional." />
              <div className="field">
                <span className="flabel">Poster</span>
                <div className="row wrap">
                  <label className="btn btn-sm">
                    {uploading ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" small />}
                    {hasPoster ? "Replace image" : "Upload image"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => onPoster(e.target.files?.[0])}
                      disabled={uploading}
                    />
                  </label>
                  {hasPoster ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        startUploading(async () => {
                          await removePoster(eventId);
                          toast("Poster removed");
                          router.refresh();
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <span className="hint">
                  JPG/PNG/WebP under 1.5 MB. Without one, the page uses a type-only gig poster in your accent colour.
                </span>
                {hasPoster ? (
                  // eslint-disable-next-line @next/next/no-img-element -- poster is served from our own DB route with cache-busting
                  <img src={`/api/poster/${eventId}?v=${posterVersion}`} alt="Current poster" className="poster-thumb" />
                ) : null}
              </div>
              <Area
                label="Refund policy"
                value={d.refundPolicy}
                onChange={(v) => set("refundPolicy", v)}
                hint="Shown at checkout. Required before taking live payments."
              />
            </div>
          ) : null}

          {tab === "Lineup" ? (
            <ListEditor
              items={d.artists}
              empty="No artists yet. Add the headliner first."
              addLabel="Add artist"
              onChange={(v) => set("artists", v)}
              blank={{ name: "", billing: d.artists.length === 0 ? "Headline" : "Support", startsAt: "" }}
              render={(a, update) => (
                <div className="grid-3">
                  <Text label="Artist" value={a.name} onChange={(v) => update({ ...a, name: v })} />
                  <Select
                    label="Billing"
                    value={a.billing}
                    options={["Headline", "Support", "Opener", "DJ", "Guest"]}
                    onChange={(v) => update({ ...a, billing: v })}
                  />
                  <Text label="Set time" type="datetime-local" value={a.startsAt} onChange={(v) => update({ ...a, startsAt: v })} />
                </div>
              )}
            />
          ) : null}

          {tab === "Look & ticket" ? (
            <div className="stack">
              <div className="field">
                <span className="flabel">Accent colour</span>
                <div className="row wrap" role="radiogroup" aria-label="Accent colour">
                  {ACCENTS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      className="swatch"
                      style={{ background: c.hex }}
                      role="radio"
                      aria-checked={d.accentHex.toUpperCase() === c.hex}
                      aria-label={c.name}
                      title={c.name}
                      onClick={() => set("accentHex", c.hex)}
                    />
                  ))}
                  <label className="btn btn-sm">
                    Custom
                    <input
                      type="color"
                      className="sr-only"
                      aria-label="Custom accent colour"
                      value={d.accentHex}
                      onChange={(e) => set("accentHex", e.target.value.toUpperCase())}
                    />
                  </label>
                </div>
                <span className="hint">
                  Used on your concert page and poster. Button text switches to dark automatically on light colours
                  {contrastRatio(d.accentHex, "#fffdf8") < 3
                    ? " — this one is very light, so it will be hard to see on the paper background."
                    : "."}
                </span>
              </div>
              <div className="field">
                <span className="flabel">Ticket stock</span>
                <div className="row wrap">
                  {(Object.keys(STOCKS) as TicketStock[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="swatch"
                      style={{ background: STOCKS[s].color }}
                      aria-pressed={style.stock === s}
                      aria-label={STOCKS[s].label}
                      onClick={() => set("ticketStock", `${s}:${style.pattern}`)}
                    />
                  ))}
                </div>
              </div>
              <Select
                label="Print pattern"
                value={style.pattern}
                options={PATTERNS}
                onChange={(v) => set("ticketStock", `${style.stock}:${v}`)}
              />
              <Text
                label="Serial prefix"
                value={d.serialPrefix}
                onChange={(v) => set("serialPrefix", v.toUpperCase().slice(0, 6))}
                hint="Printed on every ticket, e.g. NS27-4F2A-01."
              />
            </div>
          ) : null}

          {tab === "FAQ" ? (
            <ListEditor
              items={d.faqs}
              empty="No questions yet. Entry rules, bags, parking and refunds are the usual ones."
              addLabel="Add question"
              onChange={(v) => set("faqs", v)}
              blank={{ question: "", answer: "" }}
              render={(f, update) => (
                <div className="stack">
                  <Text label="Question" value={f.question} onChange={(v) => update({ ...f, question: v })} />
                  <Area label="Answer" value={f.answer} onChange={(v) => update({ ...f, answer: v })} />
                </div>
              )}
            />
          ) : null}

          {tab === "Checkout" ? (
            <div className="stack">
              <p className="small muted">Name, email, phone and college are always asked. Add up to 5 of your own questions.</p>
              <ListEditor
                items={d.questions}
                empty="No extra questions."
                addLabel="Add question"
                max={5}
                onChange={(v) => set("questions", v)}
                blank={{ label: "", required: false }}
                render={(q, update) => (
                  <div className="row wrap" style={{ alignItems: "end" }}>
                    <div className="grow">
                      <Text label="Question" value={q.label} onChange={(v) => update({ ...q, label: v })} />
                    </div>
                    <label className="row small" style={{ minHeight: 44 }}>
                      <span className="switch">
                        <input type="checkbox" checked={q.required} onChange={(e) => update({ ...q, required: e.target.checked })} />
                        <span />
                      </span>
                      Required
                    </label>
                  </div>
                )}
              />
            </div>
          ) : null}
        </div>

        <aside className="preview" aria-label="Live preview">
          <p className="label">Live preview</p>
          <div className="mini-poster" style={{ ["--pc" as string]: d.accentHex }}>
            <span className="sun" aria-hidden="true" />
            <div className="presents">{orgName} presents</div>
            <div className="mini-title">{d.name || "Untitled"}</div>
            {headliner ? <div className="mini-head">{headliner}</div> : null}
            <div className="poster-foot">
              <span>{start ? formatDay(start) : "Date"}</span>
              <span>{d.venue || "Venue"}</span>
            </div>
          </div>
          <TicketCard
            name={d.name || "Untitled"}
            kicker={start ? `${formatDay(start)} · ${formatTime(start)}` : "Admit one"}
            perks={d.venue || "Venue"}
            price="₹499"
            serial={`${d.serialPrefix || "GP"}-4F2A-01`}
            stock={style.stock}
            pattern={style.pattern}
          />
        </aside>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  hint,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  prefix?: string;
}) {
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 0 }}>
        {prefix ? <span className="prefix mono xs">{prefix}</span> : null}
        <input
          id={id}
          className="input"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-h` : undefined}
        />
      </div>
      {hint ? (
        <span className="hint" id={`${id}-h`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function Area({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = `a-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="textarea" value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const id = `s-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function ListEditor<T>({
  items,
  onChange,
  render,
  blank,
  empty,
  addLabel,
  max = 20,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  render: (item: T, update: (v: T) => void) => React.ReactNode;
  blank: T;
  empty: string;
  addLabel: string;
  max?: number;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="stack">
      {items.length === 0 ? <p className="small muted">{empty}</p> : null}
      {items.map((item, i) => (
        <div key={i} className="list-row">
          <div className="grow">{render(item, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
          <div className="list-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <Icon name="trash" small />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...items, blank])} disabled={items.length >= max}>
        <Icon name="plus" small /> {addLabel}
      </button>
    </div>
  );
}
