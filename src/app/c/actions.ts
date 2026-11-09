"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { rateLimit } from "@/lib/rate-limit";
import { placeHold } from "@/server/inventory";
import { track } from "@/server/usage";

async function ip(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

const holdSchema = z.object({
  ticketTypeId: z.string().min(1),
  qty: z.number().int().min(1).max(20),
  idempotencyKey: z.string().uuid(),
  accessCode: z.string().max(40).nullable(),
  referralCode: z.string().max(40).nullable(),
});

export type HoldResponse = { ok: true; orderId: string } | { ok: false; message: string };

export async function holdSeats(input: z.input<typeof holdSchema>): Promise<HoldResponse> {
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick a ticket and quantity." };
  if (!rateLimit(`hold:${await ip()}`, 20, 60_000)) return { ok: false, message: "Too many attempts. Wait a minute and try again." };
  try {
    const res = await placeHold({ ...parsed.data, now: new Date() });
    if (!res.ok) return { ok: false, message: res.message };
    const order = await db.order.findUnique({ where: { id: res.orderId }, select: { eventId: true } });
    track("hold.created", { eventId: order?.eventId });
    return { ok: true, orderId: res.orderId };
  } catch {
    return { ok: false, message: "We couldn't reach the ticket desk. Check your connection and try again." };
  }
}

const personSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."),
});

export type SimpleResult = { ok: true; message: string; link?: string } | { ok: false; message: string };

export async function joinWaitlist(ticketTypeId: string, input: z.input<typeof personSchema> & { qty: number }): Promise<SimpleResult> {
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const qty = Math.min(Math.max(1, Math.floor(input.qty || 1)), 6);
  if (!rateLimit(`wl:${await ip()}`, 10, 60_000)) return { ok: false, message: "Too many attempts. Try again in a minute." };
  const tier = await db.ticketType.findUnique({ where: { id: ticketTypeId }, include: { event: { select: { status: true } } } });
  if (!tier || tier.event.status !== "PUBLISHED") return { ok: false, message: "Ticket not found." };
  if (tier.reserved < tier.capacity) return { ok: false, message: "Seats are available right now. Just buy them." };
  const token = randomToken(18);
  try {
    await db.waitlistEntry.create({ data: { ticketTypeId, ...parsed.data, qty, token } });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "This email is already on the waitlist." };
    throw err;
  }
  const position = await db.waitlistEntry.count({ where: { ticketTypeId, status: "WAITING" } });
  return {
    ok: true,
    message: `You're #${position}. If seats free up you get 15 minutes to buy them. Bookmark your waitlist link to check.`,
    link: `/w/${token}`,
  };
}

export async function subscribeToDrop(ticketTypeId: string, email: string): Promise<SimpleResult> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { ok: false, message: "Enter a valid email." };
  if (!rateLimit(`drop:${await ip()}`, 10, 60_000)) return { ok: false, message: "Too many attempts. Try again in a minute." };
  const tier = await db.ticketType.findUnique({ where: { id: ticketTypeId }, select: { isDrop: true } });
  if (!tier?.isDrop) return { ok: false, message: "This ticket isn't a scheduled drop." };
  await db.dropSubscriber.upsert({
    where: { ticketTypeId_email: { ticketTypeId, email: parsed.data } },
    create: { ticketTypeId, email: parsed.data },
    update: {},
  });
  return { ok: true, message: "Saved. The host gets your email for the drop reminder, and the countdown on this page shows the exact time." };
}

export async function enterGiveaway(giveawayId: string, input: z.input<typeof personSchema>): Promise<SimpleResult> {
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!rateLimit(`gw:${await ip()}`, 10, 60_000)) return { ok: false, message: "Too many attempts. Try again in a minute." };
  const giveaway = await db.giveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway || giveaway.status !== "OPEN" || giveaway.closesAt < new Date()) return { ok: false, message: "This giveaway has closed." };
  try {
    await db.giveawayEntry.create({ data: { giveawayId, ...parsed.data } });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "You're already in this draw. One entry per email." };
    throw err;
  }
  return { ok: true, message: "You're in the draw. Winners get a free ticket issued in their name." };
}
