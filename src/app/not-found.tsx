import Link from "next/link";
import { Icon } from "@/components/icon";
import { TicketCard } from "@/components/ticket-card";

export default function NotFound() {
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <Icon name="logo" className="brand-mark" />
          GatePass
        </Link>
      </header>
      <main id="main" className="center-page">
        <div style={{ width: "min(340px, 100%)", transform: "rotate(-4deg)", marginTop: 24 }}>
          <TicketCard
            name="Not found"
            kicker="Wrong gate"
            price="404"
            priceNote="VOID"
            serial="No. 000404"
            stock="lilac"
            pattern="halftone"
          />
        </div>
        <div className="stack" style={{ justifyItems: "center" }}>
          <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
            This page isn&apos;t on the list
          </h1>
          <p className="small muted">The link may be mistyped, or the concert was unpublished.</p>
        </div>
        <div className="row wrap" style={{ justifyContent: "center" }}>
          <Link className="btn btn-accent" href="/">
            Go home
          </Link>
          <Link className="btn" href="/find">
            Find my tickets
          </Link>
        </div>
      </main>
    </>
  );
}
