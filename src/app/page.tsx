import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { FlingTicket } from "@/components/fling-ticket";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { parseTicketStyle, TicketCard } from "@/components/ticket-card";
import { db } from "@/lib/db";
import { formatDay, formatTime } from "@/lib/format";

async function UpcomingConcerts() {
  // Availability is time-based, so this list is rendered per request.
  await connection();
  const events = await db.event.findMany({
    where: { status: "PUBLISHED", endsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 6,
    include: { org: { select: { name: true } } },
  });
  if (events.length === 0) return <p className="small muted">No public concerts right now.</p>;
  return (
    <ul className="event-grid" role="list">
      {events.map((e) => {
        const style = parseTicketStyle(e.ticketStock);
        return (
          <li key={e.id}>
            <Link className="event-link" href={`/c/${e.slug}`}>
              <TicketCard
                name={e.name}
                kicker={`${e.org.name}${e.isDemo ? " · demo" : ""}`}
                perks={`${formatDay(e.startsAt)} · ${formatTime(e.startsAt)} · ${e.venue}`}
                price="GET"
                priceNote="TICKETS →"
                stock={style.stock}
                pattern={style.pattern}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const STEPS: { icon: "ticket" | "card" | "scan" | "grid"; title: string; body: string }[] = [
  { icon: "ticket", title: "Seats can't oversell", body: "Each checkout holds seats for 10 minutes in the database. When the last seat is held, the next buyer sees Sold out, not an apology later." },
  { icon: "card", title: "Payments confirm themselves", body: "Razorpay's signed result issues the ticket. If the buyer closes the tab, the webhook does it instead. Never twice." },
  { icon: "scan", title: "Gate in two seconds", body: "Volunteers scan with their phone. Green, amber or red, full screen. Second scans say who let them in and when. Works offline." },
  { icon: "grid", title: "You see the night live", body: "Sold per ticket type, revenue, who's in, arrivals every 15 minutes, and a CSV for the sponsors." },
];

export default function Home() {
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <Icon name="logo" className="brand-mark" />
          GatePass
        </Link>
        <span className="grow" />
        <Link className="btn btn-ghost btn-sm" href="/find">
          Find my tickets
        </Link>
        <Link className="btn btn-sm" href="/login">
          Log in
        </Link>
      </header>
      <main className="container landing">
        <section className="hero">
          <div className="stack">
            <p className="label">For college concerts, fest nights and indie gigs</p>
            <h1 className="display hero-title">
              Tickets and the gate, <span>sorted.</span>
            </h1>
            <p className="hero-sub">
              Stop collecting UPI screenshots on Google Forms and ticking names off a printed list. Sell limited seats without overselling, take payments
              through your own Razorpay account, and scan people in with any phone.
            </p>
            <div className="row wrap">
              <Link className="btn btn-accent btn-lg" href="/signup">
                Host a concert
              </Link>
              <Link className="btn btn-lg" href="/c/night-shift-demo">
                See a demo concert
              </Link>
            </div>
            <p className="xs muted">Free to try. Payments run in Mock mode until you paste your Razorpay keys.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <FlingTicket />
          </div>
        </section>

        <section aria-labelledby="how-h" className="stack">
          <h2 id="how-h" className="display" style={{ fontSize: "var(--t-xl)" }}>
            What it fixes
          </h2>
          <div className="idea-grid">
            {STEPS.map((s) => (
              <div key={s.title} className="card idea">
                <Icon name={s.icon} />
                <h3>{s.title}</h3>
                <p className="small muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="up-h" className="stack">
          <h2 id="up-h" className="display" style={{ fontSize: "var(--t-xl)" }}>
            On sale now
          </h2>
          <Suspense fallback={<div className="sk" style={{ height: 140, borderRadius: 12 }} />}>
            <UpcomingConcerts />
          </Suspense>
        </section>
      </main>
      <footer className="container site-foot xs muted row between wrap">
        <span>GatePass · built for college crews in India · prices in ₹, times in IST</span>
        <ThemeToggle />
      </footer>
    </>
  );
}
