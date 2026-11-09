import { randomBytes } from "node:crypto";
import { hmacBase64Url, safeEqual } from "./crypto";
import { parseTicketCode, SIG_LENGTH, VERSION } from "./ticket-code-parse";

export { parseTicketCode };

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

/** Returns the ticket id if the code is authentic, otherwise null. */
export function verifyTicketCode(code: string, secret: string): string | null {
  const parsed = parseTicketCode(code);
  if (!parsed) return null;
  return safeEqual(parsed.sig, signature(parsed.ticketId, secret)) ? parsed.ticketId : null;
}
