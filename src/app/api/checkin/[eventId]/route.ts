import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { transaction } from "@/lib/tx";
import { viewerWith } from "@/server/auth";
import { checkIn, type ScanOutcome } from "@/server/checkin";
import { track } from "@/server/usage";

const scanSchema = z
  .object({
    clientScanId: z.string().uuid(),
    code: z.string().max(200).optional(),
    ticketId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{22}$/)
      .optional(),
    scannedAt: z.coerce.date(),
  })
  .refine((s) => !!s.code !== !!s.ticketId, "Send exactly one of code or ticketId");

const bodySchema = z.object({ scans: z.array(scanSchema).min(1).max(100) });

/** Checks tickets in. Live scans send one; the offline queue sends a batch when the connection returns. */
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await viewerWith("checkin");
  if (!viewer) return Response.json({ error: "Log in as gate crew to scan." }, { status: 401 });
  const event = await db.event.findFirst({ where: { id: eventId, orgId: viewer.orgId }, select: { id: true } });
  if (!event) return Response.json({ error: "Event not found." }, { status: 404 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const signingSecret = env().TICKET_SIGNING_SECRET;
  const results: (ScanOutcome & { clientScanId: string })[] = [];
  // Sequential on purpose: keeps "first scan wins" ordering for a queued batch.
  for (const scan of parsed.data.scans) {
    const outcome = await transaction((tx) =>
      checkIn(tx, { ...scan, eventId, volunteerId: viewer.userId, now: new Date(), signingSecret }),
    );
    if (outcome.result === "OK") track("ticket.checked_in", { orgId: viewer.orgId, eventId });
    results.push({ ...outcome, clientScanId: scan.clientScanId });
  }
  return Response.json({ results });
}
