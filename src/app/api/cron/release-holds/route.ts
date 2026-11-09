import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { pruneRateLimits } from "@/lib/rate-limit";
import { transaction } from "@/lib/tx";
import { expireOrders, offerWaitlist } from "@/server/inventory";

/**
 * Daily safety net (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Holds are already
 * released lazily whenever inventory is read; this catches concerts nobody has visited.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return Response.json({ ok: false }, { status: 401 });

  const now = new Date();
  const released = await transaction((tx) => expireOrders(tx, { now }));
  const waiting = await db.waitlistEntry.findMany({ where: { status: "WAITING" }, distinct: ["ticketTypeId"], select: { ticketTypeId: true } });
  let offered = 0;
  for (const w of waiting) offered += await transaction((tx) => offerWaitlist(tx, w.ticketTypeId, now));
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const rateLimits = await pruneRateLimits(new Date(now.getTime() - 86_400_000));
  return Response.json({ ok: true, released, offered, expiredSessions: sessions.count, rateLimits });
}
