import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { db } from "@/lib/db";
import { formatDay, formatTime } from "@/lib/format";
import { requireViewer } from "@/server/auth";
import { logout } from "../(auth)/actions";

export const metadata: Metadata = { title: "Pick a concert to scan" };

/** Concerts that ended up to 2 days ago still show, for late check-ins and corrections. */
function recentCutoff(): Date {
  return new Date(new Date().getTime() - 2 * 86_400_000);
}

async function EventPicker() {
  const viewer = await requireViewer("checkin");
  const events = await db.event.findMany({
    where: { orgId: viewer.orgId, status: "PUBLISHED", endsAt: { gte: recentCutoff() } },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true, startsAt: true, venue: true, isDemo: true },
  });
  return (
    <>
      <p className="small muted">
        Signed in as {viewer.name} ({viewer.role === "ADMIN" ? "admin" : "gate crew"}) for {viewer.orgName}.
      </p>
      {events.length === 0 ? (
        <div className="card card-lg stack">
          <h2>Nothing to scan yet</h2>
          <p className="small muted">Only published concerts that haven&apos;t ended show up here.</p>
          {viewer.role === "ADMIN" ? (
            <Link className="btn" href="/host">
              Go to concerts
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="stack" role="list" style={{ listStyle: "none", padding: 0 }}>
          {events.map((e) => (
            <li key={e.id}>
              <Link className="card row between event-link" href={`/scan/${e.id}`}>
                <div>
                  <b>
                    {e.name} {e.isDemo ? <span className="demo">DEMO</span> : null}
                  </b>
                  <div className="xs muted">
                    {formatDay(e.startsAt)} · {formatTime(e.startsAt)} · {e.venue}
                  </div>
                </div>
                <Icon name="scan" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ScanHome() {
  return (
    <main className="container narrow stack">
      <div className="row between">
        <Link className="brand" href="/scan">
          <Icon name="logo" className="brand-mark" />
          GatePass
        </Link>
        <form action={logout}>
          <button className="btn btn-ghost btn-sm" type="submit">
            Log out
          </button>
        </form>
      </div>
      <h1 className="display" style={{ fontSize: "var(--t-2xl)" }}>
        Gate scanner
      </h1>
      <Suspense fallback={<div className="sk" style={{ height: 160, borderRadius: 12 }} />}>
        <EventPicker />
      </Suspense>
    </main>
  );
}
