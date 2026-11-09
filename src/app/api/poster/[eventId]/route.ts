import { db } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await db.event.findUnique({ where: { id: eventId }, select: { posterData: true, posterMime: true } });
  if (!event?.posterData || !event.posterMime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(event.posterData), {
    headers: {
      "Content-Type": event.posterMime,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
