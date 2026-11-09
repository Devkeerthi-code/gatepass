import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { slugify } from "@/lib/slug";
import { buildIcs } from "../calendar";

export async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { event: true } });
  if (!ticket) return new Response("Not found", { status: 404 });
  const body = buildIcs(ticket.event, ticket.id, `${env().APP_URL}/t/${ticket.id}`);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slugify(ticket.event.name)}.ics"`,
    },
  });
}
