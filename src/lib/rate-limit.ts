import "server-only";
import { sha256 } from "./crypto";
import { db } from "./db";

/**
 * Fixed-window rate limit stored in Postgres, so every serverless instance shares the same counter.
 * One atomic upsert per call. Keys are hashed, so no raw IPs or emails are stored.
 * Fails open: if the database is unreachable the request is allowed and the real query will fail anyway.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${sha256(key)}, ${windowStart}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" = EXCLUDED."windowStart" THEN "RateLimit"."count" + 1 ELSE 1 END,
        "windowStart" = EXCLUDED."windowStart"
      RETURNING "count"`;
    return (rows[0]?.count ?? 1) <= limit;
  } catch {
    return true;
  }
}

/** Deletes counters from finished windows (run by the daily cron). */
export async function pruneRateLimits(olderThan: Date): Promise<number> {
  return db.rateLimit.deleteMany({ where: { windowStart: { lt: olderThan } } }).then((r) => r.count);
}

/** Best-effort client IP from the proxy header (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
