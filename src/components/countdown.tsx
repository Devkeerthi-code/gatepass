"use client";

import { useEffect, useRef, useState } from "react";
import { Spring } from "@/lib/physics";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatRemaining(ms: number, withHours: boolean): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (withHours || h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** Ticking clock with a tiny spring nudge each second. Renders nothing until mounted to avoid hydration drift. */
export function Countdown({ to, onDone, className = "clock" }: { to: string; onDone?: () => void; className?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const fired = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const target = new Date(to).getTime();
    const nudge = new Spring(0, (v) => {
      if (ref.current) ref.current.style.transform = `translateY(${v}px)`;
    }, { stiffness: 900, damping: 30 });
    const tick = () => {
      const ms = target - Date.now();
      setLeft(ms);
      nudge.set(-2).to(0);
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        done.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      nudge.stop();
    };
  }, [to]);

  return (
    <span ref={ref} className={className} role="timer" aria-live="off">
      {left === null ? "--:--" : formatRemaining(left, left > 3600_000)}
    </span>
  );
}
