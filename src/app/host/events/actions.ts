"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { fromLocalInput } from "@/lib/format";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { ownedEvent, requireViewer, viewerWith } from "@/server/auth";
import { track } from "@/server/usage";

export type ActionState = { error?: string; ok?: string; fieldErrors?: Record<string, string[] | undefined> } | null;

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time.");
const optional = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());

const eventSchema = z
  .object({
    name: z.string().trim().min(2, "Give the concert a name.").max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{3,60}$/, "Use 3–60 lowercase letters, numbers or dashes."),
    tagline: optional(z.string().trim().max(120)),
    description: z.string().trim().min(10, "Tell people what to expect (at least a sentence).").max(4000),
    venue: z.string().trim().min(2, "Where is it?").max(120),
    venueAddress: optional(z.string().trim().max(240)),
    mapUrl: optional(z.string().trim().url("Paste a full link, starting with https://").max(500)),
    startsAt: localDate,
    doorsAt: optional(localDate),
    endsAt: localDate,
    accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
    ticketStock: z.string().regex(/^(paper|pink|butter|mint|lilac|night):(guilloche|halftone|stripes|plain)$/),
    serialPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,6}$/, "2–6 letters or numbers."),
    refundPolicy: optional(z.string().trim().max(2000)),
    artists: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Artist name is empty.").max(80),
          billing: z.string().trim().max(30),
          startsAt: optional(localDate),
        }),
      )
      .max(20),
    faqs: z.array(z.object({ question: z.string().trim().min(3).max(200), answer: z.string().trim().min(1).max(1000) })).max(20),
    questions: z.array(z.object({ label: z.string().trim().min(3).max(120), required: z.boolean() })).max(5),
  })
  .refine((v) => fromLocalInput(v.endsAt) > fromLocalInput(v.startsAt), { message: "The end must be after the start.", path: ["endsAt"] });

export type EventInput = z.input<typeof eventSchema>;

export async function createEvent(): Promise<void> {
  const viewer = await requireViewer("event:manage");
  const start = new Date(Date.now() + 30 * 86_400_000);
  start.setUTCHours(13, 30, 0, 0); // 7 PM IST
  const event = await db.event.create({
    data: {
      orgId: viewer.orgId,
      slug: `untitled-${Math.random().toString(36).slice(2, 8)}`,
      name: "Untitled concert",
      description: "",
      venue: "",
      startsAt: start,
      endsAt: new Date(start.getTime() + 4 * 3600_000),
    },
  });
  redirect(`/host/events/${event.id}/edit`);
}

export async function saveEvent(eventId: string, input: EventInput): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer) return { error: "Only admins can edit concerts." };
  const event = await ownedEvent(viewer, eventId);
  if (!event) return { error: "Concert not found." };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const first = parsed.error.issues[0];
    return {
      error: first ? `${first.path.join(" ")}: ${first.message}`.replace(/^: /, "") : "Check the form.",
      fieldErrors: flat.fieldErrors,
    };
  }
  const v = parsed.data;
  try {
    await db.$transaction([
      db.event.update({
        where: { id: eventId },
        data: {
          name: v.name,
          slug: v.slug,
          tagline: v.tagline ?? null,
          description: v.description,
          venue: v.venue,
          venueAddress: v.venueAddress ?? null,
          mapUrl: v.mapUrl ?? null,
          startsAt: fromLocalInput(v.startsAt),
          doorsAt: v.doorsAt ? fromLocalInput(v.doorsAt) : null,
          endsAt: fromLocalInput(v.endsAt),
          accentHex: v.accentHex,
          ticketStock: v.ticketStock,
          serialPrefix: v.serialPrefix,
          refundPolicy: v.refundPolicy ?? null,
        },
      }),
      db.artist.deleteMany({ where: { eventId } }),
      db.artist.createMany({
        data: v.artists.map((a, i) => ({
          eventId,
          name: a.name,
          billing: a.billing || "Support",
          startsAt: a.startsAt ? fromLocalInput(a.startsAt) : null,
          sortOrder: i,
        })),
      }),
      db.faq.deleteMany({ where: { eventId } }),
      db.faq.createMany({ data: v.faqs.map((f, i) => ({ eventId, ...f, sortOrder: i })) }),
      db.checkoutQuestion.deleteMany({ where: { eventId } }),
      db.checkoutQuestion.createMany({ data: v.questions.map((q, i) => ({ eventId, ...q, sortOrder: i })) }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) return { error: "That page address is taken. Try another.", fieldErrors: { slug: ["Already taken."] } };
    throw err;
  }
  revalidatePath(`/c/${v.slug}`);
  return { ok: "Saved." };
}

const MAX_POSTER_BYTES = 1_500_000;

/** Checks the file's magic bytes, since the browser-reported MIME type can be spoofed. */
function looksLikeImage(b: Uint8Array): boolean {
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  return jpg || png || webp;
}
const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadPoster(eventId: string, form: FormData): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { error: "Only admins can change the poster." };
  const file = form.get("poster");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (!POSTER_TYPES.includes(file.type)) return { error: "Use a JPG, PNG or WebP image." };
  if (file.size > MAX_POSTER_BYTES) return { error: "Keep the poster under 1.5 MB (export at ~1200px wide)." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(bytes)) return { error: "That file isn't a real JPG, PNG or WebP image." };
  await db.event.update({ where: { id: eventId }, data: { posterData: bytes, posterMime: file.type } });
  return { ok: "Poster updated." };
}

export async function removePoster(eventId: string): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer || !(await ownedEvent(viewer, eventId))) return { error: "Only admins can change the poster." };
  await db.event.update({ where: { id: eventId }, data: { posterData: null, posterMime: null } });
  return { ok: "Poster removed. The type-only poster is used instead." };
}

export async function setPublished(eventId: string, publish: boolean): Promise<ActionState> {
  const viewer = await viewerWith("event:manage");
  if (!viewer) return { error: "Only admins can publish." };
  const event = await db.event.findFirst({
    where: { id: eventId, orgId: viewer.orgId },
    include: { _count: { select: { ticketTypes: true } } },
  });
  if (!event) return { error: "Concert not found." };
  if (publish) {
    if (!event.venue || event.description.length < 10) return { error: "Add a venue and description in the concert page tab first." };
    if (event._count.ticketTypes === 0) return { error: "Add at least one ticket type before publishing." };
  }
  await db.event.update({ where: { id: eventId }, data: { status: publish ? "PUBLISHED" : "DRAFT" } });
  if (publish) track("event.published", { orgId: viewer.orgId, eventId });
  revalidatePath(`/c/${event.slug}`);
  return { ok: publish ? "Live. Share the link." : "Unpublished. The page now shows as not available." };
}
