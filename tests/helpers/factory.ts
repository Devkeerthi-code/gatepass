import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

const TABLES = [
  "CheckInLog",
  "Ticket",
  "PromoRedemption",
  "WaitlistEntry",
  "GiveawayEntry",
  "Giveaway",
  "Order",
  "ReferralLink",
  "PromoCode",
  "DropSubscriber",
  "PriceStep",
  "TicketType",
  "CheckoutQuestion",
  "Faq",
  "Artist",
  "Event",
  "PaymentSettings",
  "Invite",
  "Session",
  "Membership",
  "User",
  "Organisation",
  "WebhookEvent",
  "UsageEvent",
];

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

export async function makeOrg() {
  const id = randomUUID().slice(0, 8);
  const org = await db.organisation.create({ data: { name: `Test org ${id}`, slug: `org-${id}` } });
  const admin = await db.user.create({
    data: { email: `admin-${id}@test.local`, name: "Asha", passwordHash: "x" },
  });
  const volunteer = await db.user.create({
    data: { email: `vol-${id}@test.local`, name: "Ravi", passwordHash: "x" },
  });
  await db.membership.createMany({
    data: [
      { userId: admin.id, orgId: org.id, role: "ADMIN" },
      { userId: volunteer.id, orgId: org.id, role: "VOLUNTEER" },
    ],
  });
  return { org, admin, volunteer };
}

export async function makeEvent(
  orgId: string,
  tier: { capacity?: number; pricePaise?: number; perOrderLimit?: number; admits?: number } = {},
) {
  const id = randomUUID().slice(0, 8);
  const event = await db.event.create({
    data: {
      orgId,
      slug: `gig-${id}`,
      name: "Test Gig",
      description: "Test event",
      venue: "Test Hall",
      startsAt: new Date("2030-01-01T14:00:00Z"),
      endsAt: new Date("2030-01-01T18:00:00Z"),
      status: "PUBLISHED",
    },
  });
  const ticketType = await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "GA",
      pricePaise: tier.pricePaise ?? 49_900,
      capacity: tier.capacity ?? 10,
      perOrderLimit: tier.perOrderLimit ?? 10,
      admits: tier.admits ?? 1,
    },
  });
  return { event, ticketType };
}

export const buyer = {
  buyerName: "Meera K",
  email: "meera@college.edu",
  phone: "9876543210",
  college: "Test College",
  answers: {},
};
