"use client";

import { useEffect, useRef } from "react";
import type { TicketPattern } from "@/components/ticket-card";
import { fling, stampIn, tilt } from "@/lib/physics";

type Props = {
  orgName: string;
  eventName: string;
  headliner: string | null;
  holder: string;
  typeName: string;
  date: string;
  doors: string;
  admits: number;
  price: string;
  serial: string;
  qrSvg: string;
  stockColor: string;
  stockInk: string;
  pattern: TicketPattern;
  isDemo: boolean;
  checkedIn: { at: string; by: string } | null;
};

/** The attendee's ticket: tilts with the pointer/phone (foil follows), can be flung and springs back. */
export function HeroTicket(p: Props) {
  const ref = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const seal = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !body.current) return;
    const stopTilt = tilt(el, { max: 7, foil: seal.current ? [seal.current] : [] });
    const stopFling = fling(el, body.current);
    if (stamp.current) stampIn(stamp.current, -9);
    return () => {
      stopTilt();
      stopFling();
    };
  }, []);

  const words = p.eventName.split(" ");
  const last = words.pop();

  return (
    <div className="stage">
      <article
        ref={ref}
        className={`tkt tkt-v hero-tkt stock-${p.pattern} ${p.checkedIn ? "is-used" : ""}`}
        style={{ ["--stock" as string]: p.stockColor, ["--stock-ink" as string]: p.stockInk }}
      >
        <div className="tk-body" ref={body}>
          <div className="tb-top">
            <div>
              <div className="tk-kicker">{p.orgName} presents</div>
              <div className="tb-title" style={{ marginTop: 6 }}>
                {words.join(" ")} <span>{last}</span>
              </div>
              {p.headliner ? (
                <div className="tk-kicker" style={{ marginTop: 8, opacity: 0.85 }}>
                  {p.headliner}
                </div>
              ) : null}
            </div>
            <div className="holo seal" ref={seal} aria-hidden="true">
              GATE
              <br />
              PASS
              {p.isDemo ? (
                <>
                  <br />
                  DEMO
                </>
              ) : null}
            </div>
          </div>
          <dl className="tb-grid">
            <div className="full">
              <dt>Ticket holder</dt>
              <dd className="big">{p.holder}</dd>
            </div>
            <div>
              <dt>Ticket</dt>
              <dd>{p.typeName}</dd>
            </div>
            <div>
              <dt>Admits</dt>
              <dd>{p.admits > 1 ? `${p.admits} people` : "One"}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{p.date}</dd>
            </div>
            <div>
              <dt>Doors</dt>
              <dd>{p.doors}</dd>
            </div>
          </dl>
          <div className="tb-qr">
            <div className="qr" role="img" aria-label="Ticket QR code" dangerouslySetInnerHTML={{ __html: p.qrSvg }} />
            <div className="mono xs" style={{ letterSpacing: ".16em" }}>
              {p.serial}
            </div>
          </div>
          {p.checkedIn ? (
            <div className="stamp entered" ref={stamp} role="img" aria-label={`Entered ${p.checkedIn.at}`}>
              Entered
              <small>
                {p.checkedIn.at} · by {p.checkedIn.by}
              </small>
            </div>
          ) : null}
        </div>
        <div className="tk-stub">
          <div>
            <div className="tk-kicker">{p.admits > 1 ? `Admits ${p.admits}` : "Admit one"}</div>
            <div className="stub-big">
              {p.typeName} · {p.price}
            </div>
          </div>
          <div className="tk-serial" style={{ textAlign: "right" }}>
            {p.serial}
          </div>
        </div>
      </article>
    </div>
  );
}
