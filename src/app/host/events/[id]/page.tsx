import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDay, formatTime } from "@/lib/format";
import { requireViewer } from "@/server/auth";
import { eventStats } from "@/server/stats";
import { LiveDashboard } from "./live-dashboard";

export const metadata: Metadata = { title: "Overview" };

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("dashboard:view");
  const event = await db.event.findFirst({
    where: { id, orgId: viewer.orgId },
    include: {
      promos: { where: { active: true }, select: { id: true, code: true, label: true, used: true, maxUses: true, autoApply: true } },
      giveaways: { where: { status: "OPEN" }, select: { id: true, title: true, _count: { select: { entries: true } } } },
    },
  });
  if (!event) notFound();
  const [stats, settings] = await Promise.all([
    eventStats(event.id),
    db.paymentSettings.findUnique({ where: { orgId: viewer.orgId }, select: { mode: true } }),
  ]);
  const mode = settings?.mode ?? (env().RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "LIVE" : env().RAZORPAY_KEY_ID ? "TEST" : "MOCK");

  return (
    <>
      <div className="head">
        <div>
          <div className="crumbs">
            <Link href="/host">Concerts</Link> / {formatDay(event.startsAt)} · {formatTime(event.startsAt)}
          </div>
          <h1>
            {event.name} {event.isDemo ? <span className="demo">DEMO</span> : null}
          </h1>
        </div>
        <div className="row wrap">
          <span className={`chip ${event.status === "PUBLISHED" ? "chip-ok" : ""}`}>{event.status === "PUBLISHED" ? "Live" : "Draft"}</span>
          {event.status === "PUBLISHED" ? (
            <Link className="btn btn-sm" href={`/c/${event.slug}`} target="_blank">
              Public page <Icon name="external" small />
            </Link>
          ) : (
            <Link className="btn btn-sm btn-accent" href={`/host/events/${event.id}/edit`}>
              Finish &amp; publish
            </Link>
          )}
          <Link className="btn btn-sm" href={`/scan/${event.id}`}>
            <Icon name="scan" small /> Scanner
          </Link>
          <a className="btn btn-sm" href={`/api/events/${event.id}/export`}>
            <Icon name="download" small /> Export CSV
          </a>
        </div>
      </div>
      <LiveDashboard eventId={event.id} initial={stats} mode={mode} />
      <div className="card stack" style={{ marginTop: 24 }}>
        <div className="sec-h">
          <h2>Promotions running</h2>
          <Link className="btn btn-sm" href={`/host/events/${event.id}/promos`}>
            Manage
          </Link>
        </div>
        {event.promos.length === 0 && event.giveaways.length === 0 ? (
          <p className="small muted">No promos yet. Discount codes, flash drops, giveaways and group deals live in Promotions.</p>
        ) : (
          <div className="row wrap">
            {event.promos.map((p) => (
              <span key={p.id} className="chip chip-accent">
                {p.autoApply ? (p.label ?? "Auto deal") : p.code} · {p.used}
                {p.maxUses ? `/${p.maxUses}` : ""} used
              </span>
            ))}
            {event.giveaways.map((g) => (
              <span key={g.id} className="chip">
                <Icon name="gift" small /> {g.title} · {g._count.entries} entries
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="stack">
          <div className="sk" style={{ height: 60, width: 320 }} />
          <div className="kpis">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sk" style={{ height: 96, borderRadius: 10 }} />
            ))}
          </div>
          <div className="sk" style={{ height: 260, borderRadius: 10 }} />
        </div>
      }
    >
      <Overview params={params} />
    </Suspense>
  );
}
