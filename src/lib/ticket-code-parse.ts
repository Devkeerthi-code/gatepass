/** Browser-safe part of the ticket code format (no secrets, no node:crypto). */
export const VERSION = "GP1";
export const SIG_LENGTH = 22; // 22 base64url chars = 132 bits of the HMAC

/** Splits a scanned code without checking the signature (used offline against a cached ticket list). */
export function parseTicketCode(code: string): { ticketId: string; sig: string } | null {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, ticketId, sig] = parts;
  if (!/^[A-Za-z0-9_-]{22}$/.test(ticketId) || sig.length !== SIG_LENGTH) return null;
  return { ticketId, sig };
}
