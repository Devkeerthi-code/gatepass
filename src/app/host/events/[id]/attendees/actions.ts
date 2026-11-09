"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transaction } from "@/lib/tx";
import { viewerWith } from "@/server/auth";
import { providerForRef } from "@/server/payments/resolve";
import { refundOrder } from "@/server/refunds";

export async function refund(eventId: string, orderId: string): Promise<{ ok: boolean; message: string }> {
  const viewer = await viewerWith("attendees:export");
  if (!viewer) return { ok: false, message: "Only admins can refund." };
  const id = z.string().uuid().safeParse(orderId);
  if (!id.success) return { ok: false, message: "Order not found." };
  const res = await transaction((tx) =>
    refundOrder(tx, { orderId: id.data, orgId: viewer.orgId, now: new Date(), providerFor: (ref) => providerForRef(ref, viewer.orgId) }),
  );
  if (!res.ok) return { ok: false, message: res.message };
  revalidatePath(`/host/events/${eventId}/attendees`);
  const seats = res.seatsReleased ? ` ${res.seatsReleased} seat${res.seatsReleased > 1 ? "s" : ""} went back on sale.` : "";
  return {
    ok: true,
    message: `${res.refundId ? `Refund started (${res.refundId}).` : "Cancelled (free ticket, nothing to refund)."}${seats} The QR codes no longer work.`,
  };
}
