"use client";

import Link from "next/link";
import type QrScannerType from "qr-scanner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toaster";
import { formatTime } from "@/lib/format";
import { fall } from "@/lib/physics";
import type { ManifestTicket, ScanResultPayload } from "@/lib/scan-types";
import { parseTicketCode } from "@/lib/ticket-code-parse";
import { dequeue, enqueue, loadManifest, markLocalCheckIn, queued, saveManifest } from "./offline-store";

type Shown =
  | { kind: "OK"; name: string; type: string; admits: number; offline: boolean }
  | { kind: "DUPLICATE"; name: string; at: string; by: string }
  | { kind: "INVALID"; reason: string };

const RESULT_MS = 2500;
const SAME_CODE_COOLDOWN_MS = 3000;
const NETWORK_TIMEOUT_MS = 4000;

async function postScans(eventId: string, scans: { clientScanId: string; code?: string; ticketId?: string; scannedAt: string }[]) {
  const res = await fetch(`/api/checkin/${eventId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scans }),
    signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error("AUTH");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { results: ScanResultPayload[] }).results;
}

export function Scanner({ eventId, eventName, volunteerName }: { eventId: string; eventName: string; volunteerName: string }) {
  const [tickets, setTickets] = useState<ManifestTicket[]>([]);
  const [online, setOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [query, setQuery] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScannerType | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const stub = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const toast = useToast();

  const refreshLocal = useCallback(async () => {
    const local = await loadManifest(eventId);
    setTickets(local.tickets);
    setQueueSize((await queued(eventId)).length);
  }, [eventId]);

  const pullManifest = useCallback(async () => {
    try {
      const res = await fetch(`/api/checkin/${eventId}/manifest`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { tickets: ManifestTicket[]; generatedAt: string };
      await saveManifest(eventId, data.tickets, data.generatedAt);
      setOnline(true);
    } catch {
      setOnline(false);
    }
    await refreshLocal();
  }, [eventId, refreshLocal]);

  const sync = useCallback(async () => {
    const pending = await queued(eventId);
    if (pending.length === 0) return;
    try {
      const results = await postScans(eventId, pending);
      await dequeue(results.map((r) => r.clientScanId));
      for (const r of results) {
        if (r.result === "DUPLICATE") toast(`Sync conflict: ${r.ticket.holderName} was already let in at ${formatTime(r.checkedInAt)} by ${r.checkedInBy}.`, { error: true });
      }
      toast(`Synced ${results.length} offline scan${results.length > 1 ? "s" : ""}`);
      setOnline(true);
      await pullManifest();
    } catch {
      setOnline(false);
    }
  }, [eventId, pullManifest, toast]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  // Initial load, periodic refresh, and sync when the connection comes back.
  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshLocal();
      if (alive) await pullManifest();
      if (alive) await sync();
    })();
    const goOnline = () => sync();
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const id = setInterval(() => {
      sync();
      pullManifest();
    }, 30_000);
    return () => {
      alive = false;
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(id);
    };
  }, [pullManifest, refreshLocal, sync]);

  const show = useCallback((s: Shown) => {
    setShown(s);
    navigator.vibrate?.(s.kind === "OK" ? 40 : s.kind === "DUPLICATE" ? [80, 60, 80] : 220);
    if (s.kind === "OK" && stub.current) {
      stub.current.style.visibility = "visible";
      stub.current.style.opacity = "1";
      fall(stub.current, { vx: (Math.random() - 0.5) * 300, vy: -500 });
    }
    window.setTimeout(() => setShown(null), RESULT_MS);
  }, []);

  /** Offline decision against the cached guest list; the server makes the final call on sync. */
  const decideOffline = useCallback(
    async (scan: { clientScanId: string; code?: string; ticketId?: string; scannedAt: string }) => {
      const ticketId = scan.ticketId ?? (scan.code ? parseTicketCode(scan.code)?.ticketId : undefined);
      const t = tickets.find((x) => x.id === ticketId);
      if (!t) return show({ kind: "INVALID", reason: "Not on this concert's guest list." });
      if (t.checkedInAt) return show({ kind: "DUPLICATE", name: t.holderName, at: formatTime(t.checkedInAt), by: t.checkedInBy ?? "a volunteer" });
      await enqueue(eventId, { ...scan, ticketId: t.id, code: undefined });
      await markLocalCheckIn(eventId, t.id);
      await refreshLocal();
      show({ kind: "OK", name: t.holderName, type: t.typeName, admits: t.admits, offline: true });
    },
    [eventId, refreshLocal, show, tickets],
  );

  const handleScan = useCallback(
    async (input: { code?: string; ticketId?: string }) => {
      if (busy.current) return;
      busy.current = true;
      const scan = { clientScanId: crypto.randomUUID(), scannedAt: new Date().toISOString(), ...input };
      try {
        const [r] = await postScans(eventId, [scan]);
        setOnline(true);
        if (r.result === "OK") {
          await markLocalCheckIn(eventId, r.ticket.id);
          show({ kind: "OK", name: r.ticket.holderName, type: r.ticket.typeName, admits: r.ticket.admits, offline: false });
        } else if (r.result === "DUPLICATE") {
          show({ kind: "DUPLICATE", name: r.ticket.holderName, at: formatTime(r.checkedInAt), by: r.checkedInBy });
        } else show({ kind: "INVALID", reason: r.reason });
        refreshLocal();
      } catch (err) {
        if ((err as Error).message === "AUTH") toast("You've been logged out. Log in again to keep scanning.", { error: true });
        else {
          setOnline(false);
          await decideOffline(scan);
        }
      } finally {
        window.setTimeout(() => (busy.current = false), RESULT_MS);
      }
    },
    [decideOffline, eventId, refreshLocal, show, toast],
  );

  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  // Camera: start once, keep running; results are throttled by `busy` and the same-code cooldown.
  useEffect(() => {
    let stopped = false;
    (async () => {
      if (!video.current) return;
      try {
        const QrScanner = (await import("qr-scanner")).default;
        if (stopped) return;
        const s = new QrScanner(
          video.current,
          (result) => {
            const now = Date.now();
            if (lastCode.current && lastCode.current.code === result.data && now - lastCode.current.at < SAME_CODE_COOLDOWN_MS) return;
            lastCode.current = { code: result.data, at: now };
            handleScanRef.current({ code: result.data });
          },
          { returnDetailedScanResult: true, preferredCamera: "environment", maxScansPerSecond: 8 },
        );
        scanner.current = s;
        await s.start();
        setTorch({ available: await s.hasFlash().catch(() => false), on: false });
      } catch (err) {
        const name = (err as Error)?.name ?? String(err);
        setCamError(
          /NotAllowed|Permission/i.test(name)
            ? "Camera permission is blocked. Allow it in your browser settings, or use Find by name."
            : "No camera found. Use Find by name or phone below.",
        );
      }
    })();
    return () => {
      stopped = true;
      scanner.current?.destroy();
      scanner.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    if (!scanner.current) return;
    await scanner.current.toggleFlash().catch(() => undefined);
    setTorch((t) => ({ ...t, on: scanner.current?.isFlashOn() ?? false }));
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return tickets
      .filter((t) => t.holderName.toLowerCase().includes(q) || t.phoneLast4 === q || t.serial.toLowerCase().includes(q))
      .slice(0, 30);
  }, [query, tickets]);

  const totals = useMemo(() => {
    const all = tickets.reduce((a, t) => a + t.admits, 0);
    const inside = tickets.reduce((a, t) => a + (t.checkedInAt ? t.admits : 0), 0);
    return { all, inside };
  }, [tickets]);

  return (
    <main className="scanner" aria-labelledby="sc-h">
      <header className="s-top">
        <div className="who">
          <h1 id="sc-h" style={{ fontSize: "var(--t-md)" }}>
            {eventName}
          </h1>
          <div className="xs muted mono">Volunteer: {volunteerName}</div>
        </div>
        <button className={`pill ${online ? "" : "pill-off"}`} type="button" onClick={() => sync().then(pullManifest)}>
          <Icon name={online ? "sync" : "wifi-off"} small />
          <span>{online ? "Online" : "Offline · tap to retry"}</span>
        </button>
        {queueSize > 0 ? (
          <span className="pill pill-q" role="status">
            <Icon name="sync" small />
            {queueSize} scan{queueSize > 1 ? "s" : ""} waiting to sync
          </span>
        ) : null}
        <Link className="pill" href="/scan">
          Switch concert
        </Link>
      </header>

      <section className="cam" aria-label="Camera">
        <video ref={video} muted playsInline aria-hidden="true" />
        <div className="finder" role="img" aria-label="Viewfinder. Point at the ticket QR.">
          <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
            <path d="M2 20V6a4 4 0 0 1 4-4h14M80 2h14a4 4 0 0 1 4 4v14M98 80v14a4 4 0 0 1-4 4H80M20 98H6a4 4 0 0 1-4-4V80" />
          </svg>
          <span className="line" aria-hidden="true" />
        </div>
        <p>{camError ?? "Point at the QR. It scans by itself."}</p>
      </section>

      <footer className="s-bot">
        <div className="count">
          <span>
            Inside <b>{totals.inside}</b> / {totals.all}
          </span>
          <span>{tickets.length} tickets cached for offline</span>
        </div>
        <div className="s-acts">
          <button className="btn btn-ink btn-lg" type="button" onClick={() => sheet.current?.showModal()}>
            <Icon name="search" /> Find by name or phone
          </button>
          <button className="btn btn-lg" type="button" onClick={toggleTorch} disabled={!torch.available} aria-pressed={torch.on} aria-label="Torch">
            <Icon name="sun" />
          </button>
        </div>
      </footer>

      <button type="button" className={`result ${shown ? (shown.kind === "OK" ? "ok" : shown.kind === "DUPLICATE" ? "used" : "no") : ""}`} hidden={!shown} onClick={() => setShown(null)} aria-live="assertive">
        {shown ? (
          <div className="inner">
            <span className="big-ic">
              <Icon name={shown.kind === "OK" ? "check" : shown.kind === "DUPLICATE" ? "clock" : "x"} />
            </span>
            <span className="verdict">{shown.kind === "OK" ? (shown.admits > 1 ? `Admit ${shown.admits}` : "Valid") : shown.kind === "DUPLICATE" ? "Already in" : "Not valid"}</span>
            {shown.kind === "OK" ? (
              <>
                <span className="r-who">{shown.name}</span>
                <span className="r-meta">
                  {shown.type}
                  {shown.offline ? " · saved offline, will sync" : ""}
                </span>
              </>
            ) : shown.kind === "DUPLICATE" ? (
              <>
                <span className="r-who">{shown.name}</span>
                <span className="r-meta">
                  Checked in at {shown.at} by {shown.by}
                </span>
              </>
            ) : (
              <span className="r-meta">{shown.reason}</span>
            )}
          </div>
        ) : null}
        <span className="next">
          Tap for next scan
          <span className="timer">
            <i key={shown ? JSON.stringify(shown) : "none"} />
          </span>
        </span>
      </button>
      <div ref={stub} className="flystub" aria-hidden="true" style={{ visibility: "hidden" }}>
        <div className="tkt">
          <div className="tk-stub" style={{ minWidth: 120 }}>
            <div className="tk-price">IN</div>
          </div>
        </div>
      </div>

      <dialog ref={sheet} className="sheet" aria-labelledby="sh-h">
        <div className="dlg-b" style={{ paddingBottom: 12 }}>
          <div className="row between">
            <h2 id="sh-h">Find a ticket</h2>
            <button className="btn btn-sm" type="button" onClick={() => sheet.current?.close()}>
              Close
            </button>
          </div>
          <label className="sr-only" htmlFor="q">
            Name, last 4 digits of phone, or ticket serial
          </label>
          <input className="input" id="q" placeholder="Name, last 4 digits of phone, or serial" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <ul className="scan-list" aria-live="polite">
          {query.trim().length >= 2 && results.length === 0 ? <li className="scan-empty">No match. Check the spelling, or try the last 4 digits of their phone.</li> : null}
          {results.map((t) => (
            <li key={t.id}>
              <div>
                <div className="n">{t.holderName}</div>
                <div className="m">
                  {t.typeName} · ••{t.phoneLast4} · {t.serial}
                </div>
              </div>
              {t.checkedInAt ? (
                <span className="chip chip-warn">In · {formatTime(t.checkedInAt)}</span>
              ) : (
                <button
                  className="btn btn-sm btn-accent"
                  type="button"
                  onClick={() => {
                    sheet.current?.close();
                    handleScan({ ticketId: t.id });
                  }}
                >
                  Check in
                </button>
              )}
            </li>
          ))}
        </ul>
      </dialog>
    </main>
  );
}
