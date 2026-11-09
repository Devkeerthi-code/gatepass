import "server-only";
import type { Tx } from "@/lib/db";
import { verifyTicketCode } from "@/lib/ticket-code";

export type ScannedTicket = {
  id: string;
  holderName: string;
  typeName: string;
  admits: number;
  serial: string;
};

export type ScanOutcome =
  | { result: "OK"; ticket: ScannedTicket; checkedInAt: string }
  | { result: "DUPLICATE"; ticket: ScannedTicket; checkedInAt: string; checkedInBy: string }
  | { result: "INVALID"; reason: string };

export type CheckInInput = {
  eventId: string;
  volunteerId: string;
  clientScanId: string;
  /** A scanned QR string, or a ticket id picked from manual search. */
  code?: string;
  ticketId?: string;
  /** When the scan happened on the device (may be earlier than now if it was offline). */
  scannedAt: Date;
  now: Date;
  signingSecret: string;
};

const MAX_OFFLINE_AGE_MS = 24 * 60 * 60 * 1000;

function clampScanTime(scannedAt: Date, now: Date): Date {
  const t = Math.min(scannedAt.getTime(), now.getTime());
  return new Date(Math.max(t, now.getTime() - MAX_OFFLINE_AGE_MS));
}

async function loadTicket(tx: Tx, ticketId: string) {
  return tx.ticket.findUnique({
    where: { id: ticketId },
    include: { ticketType: { select: { name: true } }, checkedInBy: { select: { name: true } } },
  });
}

type LoadedTicket = NonNullable<Awaited<ReturnType<typeof loadTicket>>>;

function summary(t: LoadedTicket): ScannedTicket {
  return { id: t.id, holderName: t.holderName, typeName: t.ticketType.name, admits: t.admits, serial: t.serial };
}

/** Re-sending the same clientScanId (offline sync retry) returns the original answer. */
async function replay(tx: Tx, clientScanId: string, volunteerId: string): Promise<ScanOutcome | null> {
  const log = await tx.checkInLog.findUnique({ where: { clientScanId } });
  if (!log) return null;
  if (log.result === "INVALID" || !log.ticketId) return { result: "INVALID", reason: "Not a valid ticket for this event." };
  const t = await loadTicket(tx, log.ticketId);
  if (!t || !t.checkedInAt) return { result: "INVALID", reason: "Ticket no longer exists." };
  if (log.result === "OK" && t.checkedInById === volunteerId) {
    return { result: "OK", ticket: summary(t), checkedInAt: t.checkedInAt.toISOString() };
  }
  return { result: "DUPLICATE", ticket: summary(t), checkedInAt: t.checkedInAt.toISOString(), checkedInBy: t.checkedInBy?.name ?? "a volunteer" };
}

/**
 * Admits a ticket at most once: `checkedInAt IS NULL` in the UPDATE means only the first scan wins,
 * even when two gates scan the same QR at the same moment.
 */
export async function checkIn(tx: Tx, input: CheckInInput): Promise<ScanOutcome> {
  const previous = await replay(tx, input.clientScanId, input.volunteerId);
  if (previous) return previous;

  const ticketId = input.ticketId ?? (input.code ? verifyTicketCode(input.code, input.signingSecret) : null);
  const ticket = ticketId ? await loadTicket(tx, ticketId) : null;
  const at = clampScanTime(input.scannedAt, input.now);

  const log = (result: "OK" | "DUPLICATE" | "INVALID", id: string | null) =>
    tx.checkInLog.create({
      data: { eventId: input.eventId, ticketId: id, result, volunteerId: input.volunteerId, clientScanId: input.clientScanId, scannedAt: at },
    });

  if (!ticket || ticket.eventId !== input.eventId) {
    await log("INVALID", null);
    const reason = ticket ? "This ticket is for a different event." : "Not a GatePass ticket, or it has been tampered with.";
    return { result: "INVALID", reason };
  }

  const admitted = await tx.ticket.updateMany({
    where: { id: ticket.id, checkedInAt: null },
    data: { checkedInAt: at, checkedInById: input.volunteerId },
  });

  if (admitted.count === 1) {
    await log("OK", ticket.id);
    return { result: "OK", ticket: summary(ticket), checkedInAt: at.toISOString() };
  }

  const current = await loadTicket(tx, ticket.id);
  await log("DUPLICATE", ticket.id);
  return {
    result: "DUPLICATE",
    ticket: summary(ticket),
    checkedInAt: (current?.checkedInAt ?? at).toISOString(),
    checkedInBy: current?.checkedInBy?.name ?? "a volunteer",
  };
}
