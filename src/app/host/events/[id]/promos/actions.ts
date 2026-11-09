"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { drawWinners, seedFingerprint } from "@/lib/draw";
import { fromLocalInput } from "@/lib/format";
import { rupeesToPaise } from "@/lib/money";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { transaction } from "@/lib/tx";
import { ownedEvent, viewerWith } from "@/server/auth";
import { createCompOrder } from "@/server/orders";
import { track } from "@/server/usage";

export type PromoResult = { ok: true; message: string } | { ok: false; message: string };

const optionalDate = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional());

const promoSchema = z
  .object({
    type: z.enum(["CODE", "HAPPY_HOUR", "GROUP"]),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,24}$/, "Codes are 3–24 letters, numbers or dashes.").optional(),
    label: z.string().trim().max(40).optional(),
    kind: z.enum(["PERCENT", "FLAT"]).default("PERCENT"),
    value: z.coerce.number().min(1, "Enter a discount.").max(100_000),
    maxUses: z.preprocess((v) => (v === "" || v === 0 ? undefined : v), z.coerce.number().int().min(1).max(100_000).optional()),
    perEmailLimit: z.coerce.number().int().min(1).max(20).default(1),
    emailDomain: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().regex(/^@?[a-z0-9.-]+\.[a-z]{2,}$/, "Use a domain like college.edu").optional()),
    groupSize: z.coerce.number().int().min(2).max(20).default(4),
    ticketTypeIds: z.array(z.string()).max(20).default([]),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .refine((v) => v.type !== "CODE" || !!v.code, { message: "Enter a code.", path: ["code"] })
  .refine((v) => v.type !== "HAPPY_HOUR" || (!!v.startsAt && !!v.endsAt), { message: "Happy hour needs a start and end time.", path: ["startsAt"] })
  .refine((v) => !(v.kind === "PERCENT" && v.type !== "GROUP" && v.value > 100), { message: "A percentage can't be over 100.", path: ["value"] });

export type PromoInput = z.input<typeof promoSchema>;

export async function createPromo(eventId: string, input: PromoInput): Promise<PromoResult> {
  const viewer = await viewerWith("promo:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { ok: false, message: "Only admins can create promotions." };
  const parsed = promoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const tierCount = await db.ticketType.count({ where: { eventId, id: { in: v.ticketTypeIds } } });
  if (tierCount !== v.ticketTypeIds.length) return { ok: false, message: "Pick ticket types from this concert." };

  const base = {
    eventId,
    ticketTypeIds: v.ticketTypeIds,
    startsAt: v.startsAt ? fromLocalInput(v.startsAt) : null,
    endsAt: v.endsAt ? fromLocalInput(v.endsAt) : null,
    maxUses: v.maxUses ?? null,
  };
  const data =
    v.type === "CODE"
      ? { ...base, code: v.code!, label: v.label || null, kind: v.kind, value: v.kind === "FLAT" ? rupeesToPaise(v.value) : v.value, perEmailLimit: v.perEmailLimit, emailDomain: v.emailDomain?.replace(/^@/, "") ?? null }
      : v.type === "HAPPY_HOUR"
        ? { ...base, code: `AUTO-HH-${randomBytes(3).toString("hex").toUpperCase()}`, label: v.label || `Happy hour ${v.value}% off`, kind: "PERCENT" as const, value: Math.min(v.value, 100), autoApply: true, perEmailLimit: 20 }
        : { ...base, code: `AUTO-GRP-${randomBytes(3).toString("hex").toUpperCase()}`, label: v.label || `Buy ${v.groupSize}, ${v.value} free`, kind: "GROUP_FREE" as const, value: Math.min(v.value, v.groupSize - 1), minQty: v.groupSize, autoApply: true, perEmailLimit: 20 };
  try {
    await db.promoCode.create({ data });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "That code already exists for this concert." };
    throw err;
  }
  track("promo.created", { orgId: viewer.orgId, eventId });
  revalidatePath(`/host/events/${eventId}/promos`);
  return { ok: true, message: v.type === "CODE" ? `${data.code} is live.` : "Deal is live. It applies automatically at checkout." };
}

export async function setPromoActive(eventId: string, promoId: string, active: boolean): Promise<PromoResult> {
  const viewer = await viewerWith("promo:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { ok: false, message: "Only admins can change promotions." };
  await db.promoCode.updateMany({ where: { id: promoId, eventId }, data: { active } });
  revalidatePath(`/host/events/${eventId}/promos`);
  return { ok: true, message: active ? "Turned on." : "Paused. Existing orders keep their discount." };
}

const giveawaySchema = z.object({
  title: z.string().trim().min(4, "Give it a title, e.g. “Win 2 Fan Pit passes”.").max(60),
  ticketTypeId: z.string().min(1, "Pick the prize ticket."),
  winnersCount: z.coerce.number().int().min(1).max(50),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick when entries close."),
});

export async function createGiveaway(eventId: string, input: z.input<typeof giveawaySchema>): Promise<PromoResult> {
  const viewer = await viewerWith("promo:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { ok: false, message: "Only admins can run giveaways." };
  const parsed = giveawaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const closesAt = fromLocalInput(parsed.data.closesAt);
  if (closesAt <= new Date()) return { ok: false, message: "The closing time must be in the future." };
  const tier = await db.ticketType.findFirst({ where: { id: parsed.data.ticketTypeId, eventId } });
  if (!tier) return { ok: false, message: "Pick a ticket type from this concert." };
  const seed = randomBytes(32).toString("hex");
  await db.giveaway.create({ data: { eventId, ticketTypeId: tier.id, title: parsed.data.title, winnersCount: parsed.data.winnersCount, closesAt, seed, seedHash: seedFingerprint(seed) } });
  revalidatePath(`/host/events/${eventId}/promos`);
  return { ok: true, message: "Giveaway is open. It shows on your concert page." };
}

export type DrawResult = { ok: true; winners: { name: string; email: string; ticketed: boolean }[]; seed: string; entrants: string[] } | { ok: false; message: string };

/** Picks winners and issues each a free ticket in their name (using real seats). Runs once. */
export async function drawGiveaway(eventId: string, giveawayId: string): Promise<DrawResult> {
  const viewer = await viewerWith("promo:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { ok: false, message: "Only admins can draw winners." };
  const giveaway = await db.giveaway.findFirst({ where: { id: giveawayId, eventId }, include: { entries: true } });
  if (!giveaway) return { ok: false, message: "Giveaway not found." };
  if (giveaway.status === "DRAWN") return { ok: false, message: "Already drawn." };
  if (giveaway.entries.length === 0) return { ok: false, message: "No entries yet." };

  const claimed = await db.giveaway.updateMany({ where: { id: giveaway.id, status: "OPEN" }, data: { status: "DRAWN", drawnAt: new Date() } });
  if (claimed.count === 0) return { ok: false, message: "Already drawn." };

  const winnerEmails = drawWinners(giveaway.seed, giveaway.entries.map((e) => e.email), giveaway.winnersCount);
  const winners: { name: string; email: string; ticketed: boolean }[] = [];
  for (const email of winnerEmails) {
    const entry = giveaway.entries.find((e) => e.email.toLowerCase() === email)!;
    const order = await transaction((tx) =>
      createCompOrder(tx, { ticketTypeId: giveaway.ticketTypeId, qty: 1, buyerName: entry.name, email: entry.email, phone: entry.phone, source: "GIVEAWAY", now: new Date() }),
    );
    await db.giveawayEntry.update({ where: { id: entry.id }, data: { isWinner: true, orderId: order.ok ? order.orderId : null } });
    winners.push({ name: entry.name, email: entry.email, ticketed: order.ok });
  }
  track("giveaway.drawn", { orgId: viewer.orgId, eventId });
  revalidatePath(`/host/events/${eventId}/promos`);
  return { ok: true, winners, seed: giveaway.seed, entrants: giveaway.entries.map((e) => e.name) };
}

export async function setReferralReward(eventId: string, rewardAfter: number): Promise<PromoResult> {
  const viewer = await viewerWith("promo:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { ok: false, message: "Only admins can change referrals." };
  const n = z.coerce.number().int().min(1).max(50).safeParse(rewardAfter);
  if (!n.success) return { ok: false, message: "Pick a number between 1 and 50." };
  await db.referralLink.updateMany({ where: { eventId }, data: { rewardAfter: n.data } });
  revalidatePath(`/host/events/${eventId}/promos`);
  return { ok: true, message: `Fans now need ${n.data} sales for a reward.` };
}
