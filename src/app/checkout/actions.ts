"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { releaseHold, startPayment, type CheckoutStep } from "@/server/checkout";

const detailsSchema = z.object({
  buyerName: z.string().trim().min(2, "Enter your full name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email. Your ticket link is tied to it."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number.")),
  college: z.string().trim().min(2, "Enter your college, or “Not a student”.").max(120),
  answers: z.record(z.string(), z.string().trim().max(300)),
  promoCode: z.string().trim().max(40).optional(),
});

export type CheckoutInput = z.input<typeof detailsSchema>;
export type CheckoutResult = CheckoutStep | { kind: "INVALID"; fieldErrors: Record<string, string[] | undefined> };

export async function submitCheckout(orderId: string, input: CheckoutInput): Promise<CheckoutResult> {
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return { kind: "INVALID", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { promoCode, ...details } = parsed.data;

  const questions = await db.checkoutQuestion.findMany({
    where: { event: { orders: { some: { id: orderId } } } },
    select: { id: true, label: true, required: true },
  });
  const missing = questions.find((q) => q.required && !details.answers[q.id]);
  if (missing) return { kind: "INVALID", fieldErrors: { [`q_${missing.id}`]: ["This one is required."] } };
  // Only keep answers to this event's questions, keyed by the question text for the CSV export.
  const answers = Object.fromEntries(questions.filter((q) => details.answers[q.id]).map((q) => [q.label, details.answers[q.id]]));

  try {
    return await startPayment(orderId, { ...details, answers }, promoCode || null);
  } catch {
    return { kind: "ERROR", message: "Something went wrong on our side. Your seats are still held, so try again in a moment." };
  }
}

export async function cancelHold(orderId: string): Promise<void> {
  await releaseHold(orderId);
}
