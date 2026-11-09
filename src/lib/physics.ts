/**
 * Tiny dependency-free UI physics: damped springs integrated per frame (semi-implicit Euler)
 * and free bodies with gravity. Everything becomes an instant state change under reduced motion.
 */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

type SpringOptions = { stiffness?: number; damping?: number; mass?: number; precision?: number };

export class Spring {
  value: number;
  target: number;
  velocity = 0;
  private raf = 0;
  private readonly stiffness: number;
  private readonly damping: number;
  private readonly mass: number;
  private readonly precision: number;

  constructor(
    value: number,
    private readonly onUpdate: (v: number) => void,
    { stiffness = 420, damping = 26, mass = 1, precision = 0.01 }: SpringOptions = {},
  ) {
    this.value = value;
    this.target = value;
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.precision = precision;
  }

  to(target: number, velocity?: number): this {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (prefersReducedMotion()) return this.set(target);
    if (!this.raf) this.loop();
    return this;
  }

  set(v: number): this {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.value = this.target = v;
    this.velocity = 0;
    this.onUpdate(v);
    return this;
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop() {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += (force / this.mass) * dt;
      this.value += this.velocity * dt;
      const settled = Math.abs(this.velocity) < this.precision * 10 && Math.abs(this.value - this.target) < this.precision;
      if (settled) {
        this.value = this.target;
        this.velocity = 0;
        this.raf = 0;
        this.onUpdate(this.value);
        return;
      }
      this.onUpdate(this.value);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}

/** Pointer velocity in px/s, averaged over the last ~80ms. */
export function velocityTracker() {
  let points: { x: number; y: number; t: number }[] = [];
  return {
    push(x: number, y: number, t: number) {
      points.push({ x, y, t });
      points = points.filter((p) => t - p.t < 80);
    },
    velocity() {
      if (points.length < 2) return { vx: 0, vy: 0 };
      const a = points[0];
      const b = points[points.length - 1];
      const dt = Math.max(1, b.t - a.t) / 1000;
      return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
    },
    reset() {
      points = [];
    },
  };
}

type Cleanup = () => void;

/** Pointer tilt with spring return. Writes --rx/--ry and --hx/--hy (holographic foil position). */
export function tilt(el: HTMLElement, { max = 8, foil = [] as HTMLElement[] } = {}): Cleanup {
  let rx = 0;
  let ry = 0;
  const apply = () => {
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    for (const target of [el, ...foil]) {
      target.style.setProperty("--hx", `${50 + ry * 5}%`);
      target.style.setProperty("--hy", `${50 - rx * 5}%`);
    }
  };
  const sx = new Spring(0, (v) => ((rx = v), apply()), { stiffness: 220, damping: 16 });
  const sy = new Spring(0, (v) => ((ry = v), apply()), { stiffness: 220, damping: 16 });
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" || el.dataset.dragging) return;
    const r = el.getBoundingClientRect();
    sx.to(-((e.clientY - r.top) / r.height - 0.5) * max * 2);
    sy.to(((e.clientX - r.left) / r.width - 0.5) * max * 2);
  };
  const onLeave = () => {
    sx.to(0);
    sy.to(0);
  };
  const onGyro = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    sx.to(clamp((e.beta - 40) / 4, -max, max));
    sy.to(clamp(e.gamma / 4, -max, max));
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerleave", onLeave);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) window.addEventListener("deviceorientation", onGyro);
  return () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("deviceorientation", onGyro);
    sx.stop();
    sy.stop();
  };
}

/** Drag with momentum: follows the pointer, leans with horizontal speed, then springs home. */
export function fling(el: HTMLElement, handle: HTMLElement = el): Cleanup {
  let x = 0;
  let y = 0;
  let r = 0;
  const apply = () => {
    el.style.setProperty("--fx", `${x}px`);
    el.style.setProperty("--fy", `${y}px`);
    el.style.setProperty("--fr", `${r}deg`);
  };
  const spx = new Spring(0, (v) => ((x = v), apply()), { stiffness: 180, damping: 14 });
  const spy = new Spring(0, (v) => ((y = v), apply()), { stiffness: 180, damping: 14 });
  const spr = new Spring(0, (v) => ((r = v), apply()), { stiffness: 260, damping: 16 });
  const tracker = velocityTracker();
  let originX = 0;
  let originY = 0;
  let active = false;
  handle.style.touchAction = "none";

  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, [data-no-fling]")) return;
    active = true;
    el.dataset.dragging = "1";
    tracker.reset();
    originX = e.clientX - x;
    originY = e.clientY - y;
    handle.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!active) return;
    tracker.push(e.clientX, e.clientY, e.timeStamp);
    spx.set(e.clientX - originX);
    spy.set(e.clientY - originY);
    spr.to(clamp(tracker.velocity().vx * 0.004, -14, 14));
  };
  const up = () => {
    if (!active) return;
    active = false;
    delete el.dataset.dragging;
    const { vx, vy } = tracker.velocity();
    spx.to(0, vx);
    spy.to(0, vy);
    spr.to(0);
  };
  handle.addEventListener("pointerdown", down);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
  return () => {
    handle.removeEventListener("pointerdown", down);
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
  };
}

/** Free fall with gravity and spin; used for torn stubs. */
export function fall(el: HTMLElement, start: { x?: number; y?: number; vx?: number; vy?: number } = {}): void {
  if (prefersReducedMotion()) {
    el.style.visibility = "hidden";
    return;
  }
  const vx = start.vx ?? 0;
  let { x = 0, y = 0, vy = -200 } = start;
  const spin = (Math.random() - 0.5) * 420;
  let rot = 0;
  let last = performance.now();
  const t0 = last;
  const life = 1400;
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    vy += 2200 * dt;
    x += vx * dt;
    y += vy * dt;
    rot += spin * dt;
    el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
    el.style.opacity = String(Math.max(0, 1 - (now - t0) / life));
    if (now - t0 < life) requestAnimationFrame(step);
    else el.style.visibility = "hidden";
  };
  requestAnimationFrame(step);
}

/** Tear-off along a perforation: heavy resistance until the paper gives, then the stub falls. */
export function tear(
  stub: HTMLElement,
  { threshold = 90, onTear, onProgress }: { threshold?: number; onTear?: () => void; onProgress?: (p: number) => void } = {},
) {
  let torn = false;
  let active = false;
  let startY = 0;
  let startX = 0;
  let offset = 0;
  let side = 0;
  const tracker = velocityTracker();
  stub.style.touchAction = "none";
  const resist = (d: number) =>
    d <= 0 ? d * 0.15 : d < threshold ? threshold * 0.32 * (1 - Math.exp(-d / (threshold * 0.6))) : d;
  const place = (main: number, cross: number, rot: number) => {
    stub.style.transform = `translate(${cross}px, ${main}px) rotate(${rot}deg)`;
  };
  const back = new Spring(0, (v) => place(v, 0, v * 0.04), { stiffness: 600, damping: 22 });

  const rip = () => {
    if (torn) return;
    torn = true;
    active = false;
    onProgress?.(1);
    const v = tracker.velocity();
    fall(stub, { x: side * 0.3, y: offset, vx: v.vx * 0.5, vy: v.vy * 0.5 - 120 });
    onTear?.();
  };
  const down = (e: PointerEvent) => {
    if (torn) return;
    active = true;
    tracker.reset();
    stub.setPointerCapture(e.pointerId);
    startY = e.clientY;
    startX = e.clientX;
  };
  const move = (e: PointerEvent) => {
    if (!active || torn) return;
    tracker.push(e.clientX, e.clientY, e.timeStamp);
    const raw = e.clientY - startY;
    side = e.clientX - startX;
    offset = resist(raw);
    onProgress?.(clamp(raw / threshold, 0, 1));
    if (raw >= threshold) return rip();
    back.set(offset);
    place(offset, side * 0.05, offset * 0.05);
  };
  const up = () => {
    if (!active) return;
    active = false;
    if (!torn) back.to(0, tracker.velocity().vy * 0.2);
  };
  stub.addEventListener("pointerdown", down);
  stub.addEventListener("pointermove", move);
  stub.addEventListener("pointerup", up);
  stub.addEventListener("pointercancel", up);
  return {
    tearNow: rip,
    reset() {
      torn = false;
      stub.style.transform = "";
      stub.style.opacity = "";
      stub.style.visibility = "";
      onProgress?.(0);
    },
    destroy() {
      stub.removeEventListener("pointerdown", down);
      stub.removeEventListener("pointermove", move);
      stub.removeEventListener("pointerup", up);
      stub.removeEventListener("pointercancel", up);
    },
  };
}

/** A rubber stamp landing: scale overshoot on a stiff spring. */
export function stampIn(el: HTMLElement, rotation = -9): void {
  const s = new Spring(
    1.9,
    (v) => {
      el.style.transform = `rotate(${rotation}deg) scale(${v})`;
      el.style.opacity = String(Math.min(1, (2 - v) * 1.6));
    },
    { stiffness: 900, damping: 20 },
  );
  s.set(1.9);
  s.to(1);
}
