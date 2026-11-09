"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/format";
import { rupeesToPaise } from "@/lib/money";
import { transaction } from "@/lib/tx";
import { ownedEvent, viewerWith } from "@/server/auth";
import { offerWaitlist } from "@/server/inventory";
import { createCompOrder } from "@/server/orders";
import type { ActionState } from "../../actions";

const optionalDate = z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional());

const tierSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the ticket.").max(40),
  description: z.string().trim().max(140).optional(),
  priceRupees: z.coerce.number().min(0, "Price can't be negative.").max(100_000),
  capacity: z.coerce.number().int().min(1, "At least 1 seat.").max(100_000),
  admits: z.coerce.number().int().min(1).max(20),
  perOrderLimit: z.coerce.number().int().min(1).max(20),
  salesStart: optionalDate,
  salesEnd: optionalDate,
  isDrop: z.boolean(),
  accessCode: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,24}$/, "3–24 letters, numbers or dashes.").optional()),
  steps: z
    .array(z.object({ afterSold: z.coerce.number().int().min(1), priceRupees: z.coerce.number().min(0).max(100_000) }))
    .max(5),
});

export type TierInput = z.input<typeof tierSchema>;

export async function saveTier(eventId: string, input: TierInput): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { error: "Only admins can edit tickets." };
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  if (v.isDrop && !v.salesStart) return { error: "A flash drop needs a drop time (sales start)." };
  if (v.salesStart && v.salesEnd && fromLocalInput(v.salesEnd) <= fromLocalInput(v.salesStart)) return { error: "Sales must end after they start." };
  const stepCounts = v.steps.map((s) => s.afterSold);
  if (new Set(stepCounts).size !== stepCounts.length) return { error: "Each price step needs a different seat count." };
  if (stepCounts.some((n) => n >= v.capacity)) return { error: "Price steps must kick in before the tier sells out." };

  const data = {
    name: v.name,
    description: v.description || null,
    pricePaise: rupeesToPaise(v.priceRupees),
    capacity: v.capacity,
    admits: v.admits,
    perOrderLimit: v.perOrderLimit,
    salesStart: v.salesStart ? fromLocalInput(v.salesStart) : null,
    salesEnd: v.salesEnd ? fromLocalInput(v.salesEnd) : null,
    isDrop: v.isDrop,
    accessCode: v.accessCode ?? null,
    hidden: !!v.accessCode,
  };

  const result = await transaction(async (tx) => {
    let id = v.id;
    if (id) {
      const existing = await tx.ticketType.findFirst({ where: { id, eventId } });
      if (!existing) return { error: "Ticket type not found." };
      if (v.capacity < existing.reserved) return { error: `${existing.reserved} seats are already taken. Capacity can't go below that.` };
      await tx.ticketType.update({ where: { id }, data });
    } else {
      const count = await tx.ticketType.count({ where: { eventId } });
      id = (await tx.ticketType.create({ data: { ...data, eventId, sortOrder: count } })).id;
    }
    await tx.priceStep.deleteMany({ where: { ticketTypeId: id } });
    if (v.steps.length) {
      await tx.priceStep.createMany({ data: v.steps.map((s) => ({ ticketTypeId: id, afterSold: s.afterSold, pricePaise: rupeesToPaise(s.priceRupees) })) });
    }
    // Raising capacity on a sold-out tier offers the new seats to the waitlist first.
    await offerWaitlist(tx, id, new Date());
    return null;
  });
  if (result) return result;
  revalidatePath(`/host/events/${eventId}/tickets`);
  return { ok: "Ticket saved." };
}

export async function deleteTier(eventId: string, tierId: string): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { error: "Only admins can edit tickets." };
  const tier = await db.ticketType.findFirst({ where: { id: tierId, eventId }, include: { _count: { select: { orders: true } } } });
  if (!tier) return { error: "Ticket type not found." };
  if (tier._count.orders > 0) return { error: "People have already ordered this ticket. Set its sale end to now instead of deleting it." };
  await db.ticketType.delete({ where: { id: tierId } });
  revalidatePath(`/host/events/${eventId}/tickets`);
  return { ok: "Ticket type deleted." };
}

const compSchema = z.object({
  ticketTypeId: z.string().min(1),
  qty: z.coerce.number().int().min(1).max(20),
  buyerName: z.string().trim().min(2, "Enter the guest's name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."),
});

/** Guest list / complimentary tickets. They use real seats, so they can't oversell either. */
export async function issueComp(eventId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { error: "Only admins can issue free tickets." };
  const parsed = compSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const tier = await db.ticketType.findFirst({ where: { id: parsed.data.ticketTypeId, eventId } });
  if (!tier) return { error: "Pick a ticket type." };
  const res = await transaction((tx) => createCompOrder(tx, { ...parsed.data, source: "COMP", now: new Date() }));
  if (!res.ok) return { error: "Not enough seats left in that ticket type." };
  revalidatePath(`/host/events/${eventId}/attendees`);
  return { ok: `Ticket issued. Open it from the attendee list to share the link with ${parsed.data.buyerName}.` };
}
