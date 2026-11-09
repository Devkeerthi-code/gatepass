"use server";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";

function referralCode(name: string): string {
  const base =
    name
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 6)
      .toUpperCase() || "FAN";
  return `${base}${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** One referral link per buyer email per event; holding a valid ticket id is the proof of purchase. */
export async function getReferral(ticketId: string): Promise<{ path: string; sold: number; rewardAfter: number } | null> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { order: { select: { email: true, buyerName: true, status: true } }, event: { select: { id: true, slug: true } } },
  });
  if (!ticket || ticket.order.status !== "PAID" || !ticket.order.email) return null;
  const where = { eventId_ownerEmail: { eventId: ticket.event.id, ownerEmail: ticket.order.email } };

  let link = await db.referralLink.findUnique({ where });
  for (let attempt = 0; !link && attempt < 3; attempt++) {
    try {
      link = await db.referralLink.create({
        data: {
          eventId: ticket.event.id,
          code: referralCode(ticket.order.buyerName),
          ownerName: ticket.order.buyerName,
          ownerEmail: ticket.order.email,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      link = await db.referralLink.findUnique({ where });
    }
  }
  if (!link) return null;
  const sold = await db.order.count({ where: { referralId: link.id, status: "PAID" } });
  return { path: `/c/${ticket.event.slug}?r=${link.code}`, sold, rewardAfter: link.rewardAfter };
}
