import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { toLocalInput } from "@/lib/format";
import { requireViewer } from "@/server/auth";
import { Builder } from "./builder";

export const metadata: Metadata = { title: "Concert page" };

async function BuilderLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer("event:manage");
  const event = await db.event.findFirst({
    where: { id, orgId: viewer.orgId },
    include: {
      artists: { orderBy: { sortOrder: "asc" } },
      faqs: { orderBy: { sortOrder: "asc" } },
      questions: { orderBy: { sortOrder: "asc" } },
      _count: { select: { ticketTypes: true } },
    },
  });
  if (!event) notFound();

  return (
    <Builder
      eventId={event.id}
      orgName={viewer.orgName}
      status={event.status}
      hasPoster={!!event.posterData}
      ticketTypeCount={event._count.ticketTypes}
      initial={{
        name: event.name,
        slug: event.slug,
        tagline: event.tagline ?? "",
        description: event.description,
        venue: event.venue,
        venueAddress: event.venueAddress ?? "",
        mapUrl: event.mapUrl ?? "",
        startsAt: toLocalInput(event.startsAt),
        doorsAt: toLocalInput(event.doorsAt),
        endsAt: toLocalInput(event.endsAt),
        accentHex: event.accentHex,
        ticketStock: event.ticketStock.includes(":") ? event.ticketStock : `${event.ticketStock}:guilloche`,
        serialPrefix: event.serialPrefix,
        refundPolicy: event.refundPolicy ?? "",
        artists: event.artists.map((a) => ({ name: a.name, billing: a.billing, startsAt: toLocalInput(a.startsAt) })),
        faqs: event.faqs.map((f) => ({ question: f.question, answer: f.answer })),
        questions: event.questions.map((q) => ({ label: q.label, required: q.required })),
      }}
    />
  );
}

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="sk" style={{ height: 520, borderRadius: 18 }} />}>
      <BuilderLoader params={params} />
    </Suspense>
  );
}
