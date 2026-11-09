"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, stampIn } from "@/lib/physics";

type Body = { el: HTMLElement; x: number; y: number; vx: number; vy: number };

const SHAKE_MS = 1600;
const GRAVITY = 1400;
const RESTITUTION = 0.72;

/**
 * The giveaway drum: entry tokens tumble under gravity and bounce off the walls while the drum is
 * shaken, then the winners pop out one by one. The result was already decided on the server.
 */
export function DrawDrum({ entrants, winners, onClose }: { entrants: string[]; winners: string[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(prefersReducedMotion() ? winners.length : 0);
  const tokens = entrants.slice(0, 36);

  useEffect(() => {
    const root = box.current;
    if (!root || prefersReducedMotion()) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const bodies: Body[] = [...root.querySelectorAll<HTMLElement>(".drum-token")].map((el) => ({
      el,
      x: Math.random() * (w - el.offsetWidth),
      y: Math.random() * (h * 0.5),
      vx: (Math.random() - 0.5) * 600,
      vy: 0,
    }));
    const start = performance.now();
    let last = start;
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const shaking = now - start < SHAKE_MS;
      for (const b of bodies) {
        if (shaking && Math.random() < 0.04) b.vy -= 500 + Math.random() * 400;
        b.vy += GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const maxX = w - b.el.offsetWidth;
        const maxY = h - b.el.offsetHeight;
        if (b.x < 0 || b.x > maxX) {
          b.x = Math.max(0, Math.min(maxX, b.x));
          b.vx *= -RESTITUTION;
        }
        if (b.y > maxY) {
          b.y = maxY;
          b.vy *= -RESTITUTION;
          b.vx *= 0.96;
        }
        if (b.y < 0) {
          b.y = 0;
          b.vy = Math.abs(b.vy) * RESTITUTION;
        }
        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }
      if (now - start < SHAKE_MS + 1200) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const timers = winners.map((_, i) => window.setTimeout(() => setRevealed(i + 1), SHAKE_MS + i * 650));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [winners]);

  useEffect(() => {
    const last = box.current?.parentElement?.querySelector<HTMLElement>(`.winner-card[data-i="${revealed - 1}"]`);
    if (last) stampIn(last, (revealed % 2 ? -1 : 1) * 3);
  }, [revealed]);

  return (
    <div className="drum-wrap stack" role="region" aria-label="Giveaway draw" aria-live="polite">
      <div className="drum" ref={box} aria-hidden="true">
        {tokens.map((name, i) => (
          <span key={`${name}-${i}`} className="drum-token">
            {name.split(" ")[0]}
          </span>
        ))}
      </div>
      <div className="row wrap">
        {winners.slice(0, revealed).map((w, i) => (
          <div key={w + i} className="winner-card" data-i={i}>
            <span className="label">Winner {i + 1}</span>
            <b>{w}</b>
          </div>
        ))}
      </div>
      {revealed >= winners.length ? (
        <p className="small">
          Free tickets were issued in the winners&apos; names. Find them in Attendees to share their links.{" "}
          <button className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </p>
      ) : null}
    </div>
  );
}
