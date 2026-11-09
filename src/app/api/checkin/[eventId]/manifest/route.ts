import { db } from "@/lib/db";
import type { ManifestTicket } from "@/lib/scan-types";
import { viewerWith } from "@/server/auth";

/**
 * The guest list cached on volunteer phones for offline scanning and search.
 * Only what the gate needs: no emails, no full phone numbers, no signing secret.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await viewerWith("checkin");
  if (!viewer) return Response.json({ error: "Log in as gate crew to scan." }, { status: 401 });
  const event = await db.event.findFirst({ where: { id: eventId, orgId: viewer.orgId }, select: { id: true, name: true } });
  if (!event) return Response.json({ error: "Event not found." }, { status: 404 });

  const tickets = await db.ticket.findMany({
    where: { eventId, order: { status: "PAID" } },
    select: {
      id: true,
      holderName: true,
      admits: true,
      serial: true,
      checkedInAt: true,
      ticketType: { select: { name: true } },
      order: { select: { phone: true } },
      checkedInBy: { select: { name: true } },
    },
    orderBy: { holderName: "asc" },
  });

  const manifest: ManifestTicket[] = tickets.map((t) => ({
    id: t.id,
    holderName: t.holderName,
    typeName: t.ticketType.name,
    admits: t.admits,
    serial: t.serial,
    phoneLast4: t.order.phone.slice(-4),
    checkedInAt: t.checkedInAt?.toISOString() ?? null,
    checkedInBy: t.checkedInBy?.name ?? null,
  }));
  return Response.json(
    { eventName: event.name, generatedAt: new Date().toISOString(), tickets: manifest },
    { headers: { "Cache-Control": "no-store" } },
  );
}
