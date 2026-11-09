"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";
import type { EventStats } from "@/server/stats";

const POLL_MS = 5000;
const BUCKET_MS = 15 * 60_000;

/** Fills empty 15-minute slots so gaps in arrivals show as gaps, not as a squashed axis. */
function fillBuckets(entries: EventStats["entries"]): { t: number; people: number }[] {
  if (entries.length === 0) return [];
  const map = new Map(entries.map((e) => [new Date(e.bucket).getTime(), e.people]));
  const first = Math.min(...map.keys());
  const last = Math.max(...map.keys());
  const out: { t: number; people: number }[] = [];
  for (let t = first; t <= last; t += BUCKET_MS) out.push({ t, people: map.get(t) ?? 0 });
  return out.slice(-32);
}

export function LiveDashboard({ eventId, initial }: { eventId: string; initial: EventStats }) {
  const [stats, setStats] = useState(initial);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/events/${eventId}/stats`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        setStats(await res.json());
        setStale(false);
      } catch {
        setStale(true);
      }
    };
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [eventId]);

  const capacity = stats.perType.reduce((a, t) => a + t.capacity * t.admits, 0);
  const inPct = stats.peopleSold ? Math.round((stats.peopleIn / stats.peopleSold) * 100) : 0;
  const buckets = fillBuckets(stats.entries);

  return (
    <div className="stack">
      <div className="row xs muted" role="status">
        <span className={`dot ${stale ? "" : "dot-live"}`} aria-hidden="true" />
        {stale ? "Reconnecting… showing the last numbers" : `Live · updates every 5s · ${formatTime(stats.generatedAt)}`}
      </div>
      {stats.needsRefund ? (
        <p className="notice notice-no small" role="alert">
          {stats.needsRefund} paid order{stats.needsRefund > 1 ? "s" : ""} arrived after seats sold out and need a refund. See Attendees.
        </p>
      ) : null}

      <div className="kpis">
        <Kpi label="People sold" value={String(stats.peopleSold)} sub={`${stats.ticketsSold} tickets · ${capacity} capacity`} />
        <Kpi label="Revenue (test)" value={formatPaise(stats.revenuePaise)} sub={stats.discountPaise ? `${formatPaise(stats.discountPaise)} given in promos` : `${stats.ordersPaid} paid orders`} />
        <Kpi label="Checked in" value={`${stats.peopleIn}`} sub={`${inPct}% of people sold`} meter={stats.peopleSold ? stats.peopleIn / stats.peopleSold : 0} />
        <Kpi label="Still to arrive" value={String(Math.max(0, stats.peopleSold - stats.peopleIn))} sub="Sold but not scanned yet" />
      </div>

      <div className="dash-grid">
        <div className="card stack">
          <div className="sec-h">
            <h2>Sold per ticket type</h2>
            <span className="label">Seats</span>
          </div>
          {stats.perType.length === 0 ? <p className="small muted">No ticket types yet.</p> : null}
          {stats.perType.map((t) => (
            <div key={t.id} className="type-row">
              <div className="row between small">
                <b>{t.name}</b>
                <span className="mono">
                  {t.paidSeats}
                  {t.heldSeats ? <span className="muted"> +{t.heldSeats} held</span> : null} / {t.capacity}
                </span>
              </div>
              <div className="bar-track" role="img" aria-label={`${t.name}: ${t.paidSeats} sold, ${t.heldSeats} held, of ${t.capacity}`}>
                <i className="bar-paid" style={{ width: `${(t.paidSeats / Math.max(1, t.capacity)) * 100}%` }} />
                <i className="bar-held" style={{ width: `${(t.heldSeats / Math.max(1, t.capacity)) * 100}%` }} />
              </div>
            </div>
          ))}
          <p className="xs muted">Solid: paid. Striped: held in someone&apos;s checkout right now.</p>
        </div>

        <div className="card stack">
          <div className="sec-h">
            <h2>Entries per 15 minutes</h2>
            <span className="label">People</span>
          </div>
          <EntriesChart buckets={buckets} />
        </div>
      </div>

      <div className="card stack">
        <div className="sec-h">
          <h2>Latest at the gate</h2>
        </div>
        {stats.recent.length === 0 ? (
          <p className="small muted">No one scanned yet. Open the scanner on a volunteer&apos;s phone when doors open.</p>
        ) : (
          <ul className="feed" role="list">
            {stats.recent.map((r) => (
              <li key={r.id}>
                <span className="mono xs">{formatTime(r.at)}</span>
                <b>{r.name}</b>
                <span className="xs muted">
                  {r.type} · by {r.by}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, meter }: { label: string; value: string; sub: string; meter?: number }) {
  return (
    <div className="card kpi">
      <p className="label">{label}</p>
      <p className="kpi-value">{value}</p>
      {meter !== undefined ? (
        <div className="meter accent" aria-hidden="true">
          <i style={{ transform: `scaleX(${meter})` }} />
        </div>
      ) : null}
      <p className="xs muted">{sub}</p>
    </div>
  );
}

function EntriesChart({ buckets }: { buckets: { t: number; people: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (buckets.length === 0) return <p className="small muted">The chart fills in as people are scanned in.</p>;
  const max = Math.max(...buckets.map((b) => b.people), 1);
  const peak = buckets.reduce((a, b) => (b.people > a.people ? b : a));
  const shown = hover !== null ? buckets[hover] : null;

  return (
    <div>
      <p className="small" aria-live="polite" style={{ minHeight: 20 }}>
        {shown ? (
          <>
            <b>{shown.people}</b> people · {formatTime(new Date(shown.t))}–{formatTime(new Date(shown.t + BUCKET_MS))}
          </>
        ) : (
          <span className="muted">
            Busiest: {formatTime(new Date(peak.t))} with {peak.people} people
          </span>
        )}
      </p>
      <div className="entries" onMouseLeave={() => setHover(null)}>
        {buckets.map((b, i) => (
          <button
            key={b.t}
            type="button"
            className="entry-col"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${formatTime(new Date(b.t))}: ${b.people} people`}
          >
            <i style={{ height: `${(b.people / max) * 100}%` }} data-active={hover === i} />
          </button>
        ))}
      </div>
      <div className="row between xs muted mono" style={{ marginTop: 6 }}>
        <span>{formatTime(new Date(buckets[0].t))}</span>
        <span>{formatTime(new Date(buckets[buckets.length - 1].t + BUCKET_MS))}</span>
      </div>
      <table className="sr-only">
        <caption>Entries per 15 minutes</caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.t}>
              <th scope="row">{formatTime(new Date(b.t))}</th>
              <td>{b.people}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
