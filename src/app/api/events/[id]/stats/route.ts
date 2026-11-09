import { db } from "@/lib/db";
import { viewerWith } from "@/server/auth";
import { eventStats } from "@/server/stats";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await viewerWith("dashboard:view");
  if (!viewer) return Response.json({ error: "Not allowed" }, { status: 401 });
  const event = await db.event.findFirst({ where: { id, orgId: viewer.orgId }, select: { id: true } });
  if (!event) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(await eventStats(event.id), { headers: { "Cache-Control": "no-store" } });
}
