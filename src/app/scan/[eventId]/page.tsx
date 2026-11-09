import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireViewer } from "@/server/auth";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Gate scanner" };

async function ScannerLoader({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const viewer = await requireViewer("checkin");
  const event = await db.event.findFirst({ where: { id: eventId, orgId: viewer.orgId }, select: { id: true, name: true, isDemo: true } });
  if (!event) notFound();
  return (
    <Scanner
      eventId={event.id}
      eventName={event.isDemo && !/demo/i.test(event.name) ? `${event.name} (demo)` : event.name}
      volunteerName={viewer.name}
    />
  );
}

export default function ScanEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <Suspense
      fallback={
        <main id="main" className="scanner">
          <div className="sk" style={{ margin: 16, height: "70dvh", borderRadius: 18 }} />
        </main>
      }
    >
      <ScannerLoader params={params} />
    </Suspense>
  );
}
