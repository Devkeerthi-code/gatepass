"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";

export type FindState = { error: string } | { orders: { id: string; event: string; type: string; qty: number; when: string }[] } | null;

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the email you used."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^\d{10}$/, "Enter your 10-digit mobile number.")),
});

/** Needs both email and phone to match, and is rate limited so it can't be used to enumerate buyers. */
export async function findTickets(_prev: FindState, form: FormData): Promise<FindState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`find:${ip}`, 6, 10 * 60_000))) return { error: "Too many lookups. Try again in 10 minutes." };
  const orders = await db.order.findMany({
    where: { email: parsed.data.email, phone: parsed.data.phone, status: "PAID" },
    orderBy: { paidAt: "desc" },
    take: 20,
    include: { event: { select: { name: true, startsAt: true } }, ticketType: { select: { name: true } } },
  });
  return { orders: orders.map((o) => ({ id: o.id, event: o.event.name, type: o.ticketType.name, qty: o.qty, when: formatDay(o.event.startsAt) })) };
}
