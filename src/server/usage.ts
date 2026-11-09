import "server-only";
import { db } from "@/lib/db";

export type UsageType =
  | "org.created"
  | "event.published"
  | "hold.created"
  | "order.paid"
  | "ticket.checked_in"
  | "promo.created"
  | "giveaway.drawn"
  | "payments.connected"
  | "export.csv";

/** Counts actions without personal data. Never blocks or breaks the user's request. */
export function track(type: UsageType, refs: { orgId?: string; eventId?: string } = {}): void {
  db.usageEvent.create({ data: { type, ...refs } }).catch(() => undefined);
}
