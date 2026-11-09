import { connection } from "next/server";
import { db } from "@/lib/db";

/** Liveness + database check for uptime monitors. Returns no data beyond up/down. */
export async function GET() {
  await connection();
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
