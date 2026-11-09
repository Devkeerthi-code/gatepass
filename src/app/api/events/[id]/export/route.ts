import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatShort } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { viewerWith } from "@/server/auth";
import { track } from "@/server/usage";

/** One row per ticket, with buyer details and check-in status. Admins only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerWith("attendees:export");
  if (!viewer) return new Response("Only admins can export attendees.", { status: 403 });
  const event = await db.event.findFirst({ where: { id, orgId: viewer.orgId }, select: { id: true, name: true } });
  if (!event) return new Response("Not found", { status: 404 });

  const tickets = await db.ticket.findMany({
    where: { eventId: event.id, order: { status: "PAID" } },
    orderBy: [{ order: { paidAt: "asc" } }, { seq: "asc" }],
    include: {
      ticketType: { select: { name: true } },
      checkedInBy: { select: { name: true } },
      order: { include: { promo: { select: { code: true } }, referral: { select: { code: true } } } },
    },
  });

  const questionLabels = [...new Set(tickets.flatMap((t) => Object.keys((t.order.answers as Record<string, string> | null) ?? {})))];
  const header = [
    "Serial",
    "Holder",
    "Email",
    "Phone",
    "College",
    "Ticket type",
    "Admits",
    "Order total (₹)",
    "Promo",
    "Referral",
    "Source",
    "Paid at (IST)",
    "Checked in at (IST)",
    "Checked in by",
    "Ticket link",
    ...questionLabels,
  ];
  const appUrl = env().APP_URL;
  const rows = tickets.map((t) => {
    const answers = (t.order.answers as Record<string, string> | null) ?? {};
    return [
      t.serial,
      t.holderName,
      t.order.email,
      t.order.phone,
      t.order.college,
      t.ticketType.name,
      t.admits,
      (t.order.amountPaise / 100).toFixed(2),
      t.order.promo?.code ?? "",
      t.order.referral?.code ?? "",
      t.order.source,
      t.order.paidAt ? formatShort(t.order.paidAt) : "",
      t.checkedInAt ? formatShort(t.checkedInAt) : "",
      t.checkedInBy?.name ?? "",
      `${appUrl}/t/${t.id}`,
      ...questionLabels.map((q) => answers[q] ?? ""),
    ];
  });

  track("export.csv", { orgId: viewer.orgId, eventId: event.id });
  // BOM so Excel opens ₹ and Indian names correctly.
  return new Response(`﻿${toCsv(header, rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(event.name)}-attendees.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
