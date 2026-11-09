import { createHash } from "node:crypto";

/**
 * Commit-reveal draw. The seed's SHA-256 is published when the giveaway opens; after the draw the
 * seed is revealed, so anyone can re-run this function on the entry list and get the same winners.
 * The host can't re-roll without changing the published fingerprint.
 */
export function drawWinners(seed: string, emails: string[], count: number): string[] {
  const score = (email: string) => createHash("sha256").update(`${seed}:${email.toLowerCase()}`).digest("hex");
  return [...new Set(emails.map((e) => e.toLowerCase()))]
    .map((email) => ({ email, s: score(email) }))
    .sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0))
    .slice(0, Math.max(0, count))
    .map((x) => x.email);
}

export function seedFingerprint(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}
