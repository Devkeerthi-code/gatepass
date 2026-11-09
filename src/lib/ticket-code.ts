import { randomBytes } from "node:crypto";
import { hmacBase64Url, safeEqual } from "./crypto";

const VERSION = "GP1";
const SIG_LENGTH = 22; // 22 base64url chars = 132 bits of the HMAC

/** 128-bit random ticket id: unguessable on its own, and also signed in the QR. */
export function newTicketId(): string {
  return randomBytes(16).toString("base64url");
}

function signature(ticketId: string, secret: string): string {
  return hmacBase64Url(secret, `${VERSION}:${ticketId}`).slice(0, SIG_LENGTH);
}

export function signTicketCode(ticketId: string, secret: string): string {
  return `${VERSION}.${ticketId}.${signature(ticketId, secret)}`;
}

/** Splits a scanned code without checking the signature (used offline against a cached ticket list). */
export function parseTicketCode(code: string): { ticketId: string; sig: string } | null {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, ticketId, sig] = parts;
  if (!/^[A-Za-z0-9_-]{22}$/.test(ticketId) || sig.length !== SIG_LENGTH) return null;
  return { ticketId, sig };
}

/** Returns the ticket id if the code is authentic, otherwise null. */
export function verifyTicketCode(code: string, secret: string): string | null {
  const parsed = parseTicketCode(code);
  if (!parsed) return null;
  return safeEqual(parsed.sig, signature(parsed.ticketId, secret)) ? parsed.ticketId : null;
}
