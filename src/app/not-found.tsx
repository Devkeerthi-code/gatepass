import Link from "next/link";
import { TicketCard } from "@/components/ticket-card";

export default function NotFound() {
  return (
    <main className="container narrow stack" style={{ textAlign: "center", justifyItems: "center" }}>
      <div style={{ width: "min(340px, 100%)", transform: "rotate(-5deg)" }}>
        <TicketCard name="Not found" kicker="Wrong gate" price="404" serial="No. 000404" stock="lilac" pattern="halftone" stamp="Void" />
      </div>
      <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
        This page isn&apos;t on the list
      </h1>
      <p className="small muted">The link may be mistyped, or the concert was unpublished.</p>
      <Link className="btn btn-accent" href="/">
        Go home
      </Link>
    </main>
  );
}
