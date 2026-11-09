import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { parseTicketStyle } from "@/components/ticket-card";
import { accentVars } from "@/lib/accent";
import { db } from "@/lib/db";
import { formatDay, formatTime } from "@/lib/format";
import { getPublicEvent } from "@/server/public-event";
import { BuyPanel } from "./buy-panel";
import { GiveawayCard } from "./giveaway-card";
import { ShareButton } from "./share-button";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ code?: string; r?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await db.event.findUnique({ where: { slug }, select: { name: true, venue: true, startsAt: true, status: true } });
  if (!event || event.status !== "PUBLISHED") return { title: "Concert not found" };
  return { title: `${event.name} — tickets`, description: `${formatDay(event.startsAt)} at ${event.venue}. Get tickets on GatePass.` };
}

function PosterTitle({ name }: { name: string }) {
  const words = name.split(" ");
  const last = words.pop();
  return (
    <h1 id="ev-title">
      {words.join(" ")} {last?.match(/^[’'0-9]/) ? <span className="year">{last}</span> : last}
    </h1>
  );
}

async function Concert({ params, searchParams }: Props) {
  const [{ slug }, { code, r }] = await Promise.all([params, searchParams]);
  const data = await getPublicEvent(slug, code ?? null);
  if (!data) notFound();
  const { event, tiers, hasHiddenTiers, sold, capacity } = data;
  const style = parseTicketStyle(event.ticketStock);
  const headliner = event.artists.find((a) => a.billing.toLowerCase().startsWith("head")) ?? event.artists[0];
  const rest = event.artists.filter((a) => a !== headliner);
  const giveaway = event.giveaways[0];

  return (
    <div style={accentVars(event.accentHex)}>
      <header className="topbar">
        <Link className="brand" href="/">
          <Icon name="logo" className="brand-mark" />
          GatePass
        </Link>
        <span className="grow" />
        <Link className="btn btn-ghost btn-sm" href="/find">
          <span>
            <span className="hide-sm">Find </span>my tickets
          </span>
        </Link>
        <ShareButton />
      </header>

      <main id="main" className="container page">
        <section className="a-poster" aria-labelledby="ev-title">
          <div className={`poster ${event.posterData ? "has-image" : ""}`} style={{ ["--pc" as string]: event.accentHex }}>
            {event.posterData ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from our own DB-backed route
              <img className="poster-img" src={`/api/poster/${event.id}`} alt="" />
            ) : (
              <span className="sun" aria-hidden="true" />
            )}
            {event.isDemo ? <span className="demo">DEMO</span> : null}
            <div className="presents">{event.org.name} presents</div>
            <PosterTitle name={event.name} />
            {headliner ? (
              <div className="lineup-poster" aria-label="Lineup">
                <div className="headliner">{headliner.name}</div>
                {rest.length ? (
                  <div className="rest">
                    {rest.map((a) => (
                      <span key={a.id}>{a.name}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : event.tagline ? (
              <div className="lineup-poster">
                <div className="rest">{event.tagline}</div>
              </div>
            ) : null}
            <div className="poster-foot">
              <span>{formatDay(event.startsAt)}</span>
              <span>{event.doorsAt ? `Doors ${formatTime(event.doorsAt)}` : formatTime(event.startsAt)}</span>
              <span>{event.venue}</span>
            </div>
          </div>
          <div className="facts">
            <div>
              <b>{formatDay(event.startsAt)}</b>
              <span>
                {event.doorsAt ? `Doors ${formatTime(event.doorsAt)} · ` : ""}
                {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
              </span>
            </div>
            <div>
              <b>{event.venue}</b>
              <span>{event.venueAddress ?? "Address on your ticket"}</span>
            </div>
            <div>
              <b>One QR per ticket</b>
              <span>Scanned at the gate, works offline</span>
            </div>
            <div>
              <b>
                {sold} / {capacity} gone
              </b>
              <span>{capacity - sold > 0 ? `${capacity - sold} left across all tickets` : "Sold out — join a waitlist"}</span>
            </div>
          </div>
          {event.isDemo ? (
            <p className="notice notice-test small" style={{ marginTop: 12 }}>
              Demo concert with made-up artists. Payments here are simulated and no real money moves.
            </p>
          ) : null}
        </section>

        <section className="a-buy" aria-labelledby="buy-h">
          <BuyPanel
            tiers={tiers}
            stock={style.stock}
            pattern={style.pattern}
            serialPrefix={event.serialPrefix}
            hasHiddenTiers={hasHiddenTiers}
            accessCode={code ?? null}
            referralCode={r ?? null}
          />
        </section>

        <div className="a-info">
          {event.description ? (
            <section aria-labelledby="about-h">
              <div className="sec-h">
                <h2 id="about-h">About the night</h2>
              </div>
              <p className="about">{event.description}</p>
            </section>
          ) : null}

          {event.artists.length ? (
            <section aria-labelledby="lu-h">
              <div className="sec-h">
                <h2 id="lu-h">Running order</h2>
                <span className="label">Times may shift ±15 min</span>
              </div>
              <ol className="sets">
                {event.doorsAt ? (
                  <li>
                    <time>{formatTime(event.doorsAt)}</time>
                    <div>
                      <div className="who">Doors open</div>
                    </div>
                    <span className="label">—</span>
                  </li>
                ) : null}
                {[...event.artists]
                  .sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity))
                  .map((a) => (
                    <li key={a.id} className={a === headliner ? "headline" : ""}>
                      <time>{a.startsAt ? formatTime(a.startsAt) : "TBA"}</time>
                      <div>
                        <div className="who">{a.name}</div>
                      </div>
                      <span className="label">{a.billing}</span>
                    </li>
                  ))}
              </ol>
              {event.isDemo ? (
                <p className="xs muted" style={{ marginTop: 8 }}>
                  All artist names are fictional demo content.
                </p>
              ) : null}
            </section>
          ) : null}

          <section aria-labelledby="v-h">
            <div className="sec-h">
              <h2 id="v-h">Getting in</h2>
              {event.mapUrl ? (
                <a className="btn btn-sm" href={event.mapUrl} target="_blank" rel="noopener noreferrer">
                  Open in Maps <Icon name="external" small />
                </a>
              ) : null}
            </div>
            <p className="small muted">
              {event.venue}
              {event.venueAddress ? `, ${event.venueAddress}` : ""}. Show the QR on your phone at the gate. Turn your brightness up. One
              scan per ticket.
            </p>
          </section>

          {event.faqs.length ? (
            <section aria-labelledby="faq-h" className="faq">
              <div className="sec-h">
                <h2 id="faq-h">Before you come</h2>
              </div>
              {event.faqs.map((f) => (
                <details key={f.id}>
                  <summary>
                    {f.question}
                    <Icon name="chev-down" />
                  </summary>
                  <p>{f.answer}</p>
                </details>
              ))}
            </section>
          ) : null}

          {event.refundPolicy ? (
            <section aria-labelledby="ref-h">
              <div className="sec-h">
                <h2 id="ref-h">Refunds</h2>
              </div>
              <p className="small muted">{event.refundPolicy}</p>
            </section>
          ) : null}

          {giveaway ? (
            <GiveawayCard
              id={giveaway.id}
              title={giveaway.title}
              tierName={giveaway.ticketType.name}
              closesAt={giveaway.closesAt.toISOString()}
              winners={giveaway.winnersCount}
              entries={giveaway._count.entries}
              seedHash={giveaway.seedHash}
              stock={style.stock}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function ConcertSkeleton() {
  return (
    <main id="main" className="container page" aria-busy="true">
      <div className="sk" style={{ height: 440, borderRadius: 18 }} />
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk" style={{ height: 120, borderRadius: 12 }} />
        ))}
      </div>
    </main>
  );
}

export default function ConcertPage(props: Props) {
  return (
    <Suspense fallback={<ConcertSkeleton />}>
      <Concert {...props} />
    </Suspense>
  );
}
