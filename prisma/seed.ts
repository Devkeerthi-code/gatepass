/**
 * Seeds ONE clearly labelled DEMO concert ("Night Shift — DEMO") with fictional artists and
 * fictional buyers, so the dashboard, scanner and promos have something to show.
 *
 * Login passwords come from SEED_ADMIN_PASSWORD / SEED_VOLUNTEER_PASSWORD, or are generated and
 * printed once. Nothing secret is stored in the repo. Re-running replaces the demo data.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { db } from "../src/lib/db";
import { seedFingerprint } from "../src/lib/draw";
import { reserveSeats } from "../src/server/inventory";
import { issueTickets } from "../src/server/orders";
import { hashPassword } from "../src/server/password";

const DEMO_SLUG = "night-shift-demo";
const ADMIN_EMAIL = "demo-host@gatepass.local";
const VOLUNTEER_EMAIL = "demo-gate@gatepass.local";

const IST = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

const FIRST = [
  "Aarav",
  "Diya",
  "Kabir",
  "Meera",
  "Rohan",
  "Ananya",
  "Vikram",
  "Ishita",
  "Arjun",
  "Sneha",
  "Karthik",
  "Pooja",
  "Nikhil",
  "Riya",
  "Siddharth",
  "Tara",
  "Harsh",
  "Lavanya",
  "Yash",
  "Nandini",
];
const LAST = ["Iyer", "Sharma", "Reddy", "Nair", "Gupta", "Menon", "Patel", "Rao", "Das", "Kulkarni"];
const COLLEGES = ["DEMO Institute of Technology", "DEMO Arts College", "DEMO Engineering College", "Not a student"];

function password(envName: string): { value: string; generated: boolean } {
  const fromEnv = process.env[envName];
  return fromEnv && fromEnv.length >= 8
    ? { value: fromEnv, generated: false }
    : { value: randomBytes(9).toString("base64url"), generated: true };
}

async function resetDemo() {
  const old = await db.organisation.findMany({ where: { slug: "demo-dit-music-club" }, select: { id: true } });
  for (const o of old) {
    await db.order.deleteMany({ where: { event: { orgId: o.id } } });
    await db.organisation.delete({ where: { id: o.id } });
  }
  await db.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, VOLUNTEER_EMAIL] } } });
}

async function main() {
  await resetDemo();
  const adminPw = password("SEED_ADMIN_PASSWORD");
  const volPw = password("SEED_VOLUNTEER_PASSWORD");

  const org = await db.organisation.create({ data: { name: "DEMO Music Club", slug: "demo-dit-music-club" } });
  const admin = await db.user.create({
    data: { email: ADMIN_EMAIL, name: "Asha (demo host)", passwordHash: await hashPassword(adminPw.value) },
  });
  const volunteer = await db.user.create({ data: { email: VOLUNTEER_EMAIL, name: "Ravi", passwordHash: await hashPassword(volPw.value) } });
  await db.membership.createMany({
    data: [
      { userId: admin.id, orgId: org.id, role: "ADMIN" },
      { userId: volunteer.id, orgId: org.id, role: "VOLUNTEER" },
    ],
  });

  // Dated a few weeks out so it's always "upcoming" relative to when the seed runs.
  const day = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  const event = await db.event.create({
    data: {
      orgId: org.id,
      slug: DEMO_SLUG,
      name: "Night Shift — DEMO",
      tagline: "An open-air night of indie, fusion and a closing DJ set",
      description:
        "This is a DEMO concert used to show how GatePass works. The artists are made up and payments are simulated.\n\nFour acts on the open-air stage, food stalls from 5:30 PM, last entry 9:30 PM. Bring your college ID.",
      venue: "Open Air Theatre",
      venueAddress: "DEMO Institute of Technology, Coimbatore",
      mapUrl: "https://www.google.com/maps/search/?api=1&query=Open+Air+Theatre+Coimbatore",
      startsAt: IST(day, "18:00"),
      doorsAt: IST(day, "17:30"),
      endsAt: IST(day, "22:30"),
      accentHex: "#D4136F",
      ticketStock: "paper:guilloche",
      serialPrefix: "NS",
      refundPolicy:
        "Full refund if the show is cancelled. Otherwise tickets are non-refundable, but you can give yours to a friend: their name is checked at the gate only against the QR.",
      isDemo: true,
      status: "PUBLISHED",
      artists: {
        create: [
          { name: "Kaavya & The Low Tide", billing: "Headline", startsAt: IST(day, "21:00"), sortOrder: 0 },
          { name: "Filter Coffee Collective", billing: "Support", startsAt: IST(day, "19:10"), sortOrder: 1 },
          { name: "Mehfil Machine", billing: "Opener", startsAt: IST(day, "18:15"), sortOrder: 2 },
          { name: "DJ Saanjh", billing: "DJ", startsAt: IST(day, "20:05"), sortOrder: 3 },
        ],
      },
      faqs: {
        create: [
          {
            question: "Do I need a printed ticket?",
            answer: "No. Show the QR on your phone. The ticket page works offline once loaded.",
            sortOrder: 0,
          },
          {
            question: "What can't I bring?",
            answer: "Outside food, glass bottles and professional cameras. Phone cameras are fine.",
            sortOrder: 1,
          },
          { question: "Is there parking?", answer: "Two-wheeler parking at the north lot. No car parking on campus.", sortOrder: 2 },
        ],
      },
      questions: { create: [{ label: "Year of study (if a student)", required: false, sortOrder: 0 }] },
    },
  });

  const ga = await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "General Admission",
      description: "Main floor behind the Fan Pit",
      pricePaise: 49_900,
      capacity: 400,
      perOrderLimit: 6,
      sortOrder: 0,
      priceSteps: { create: [{ afterSold: 150, pricePaise: 69_900 }] },
    },
  });
  const pit = await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "Fan Pit",
      description: "First rows, separate queue",
      pricePaise: 99_900,
      capacity: 30,
      perOrderLimit: 2,
      sortOrder: 1,
    },
  });
  const group = await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "Group of 4",
      description: "One QR admits four",
      pricePaise: 159_900,
      capacity: 40,
      admits: 4,
      perOrderLimit: 2,
      sortOrder: 2,
    },
  });
  await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "VIP Deck",
      description: "Raised deck with seating",
      pricePaise: 199_900,
      capacity: 40,
      perOrderLimit: 2,
      isDrop: true,
      salesStart: new Date(Date.now() + 2 * 86_400_000 + 3 * 3600_000),
      sortOrder: 3,
    },
  });
  await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "Student Presale",
      description: "Unlock with code DEMOPRESALE",
      pricePaise: 29_900,
      capacity: 50,
      perOrderLimit: 1,
      accessCode: "DEMOPRESALE",
      hidden: true,
      sortOrder: 4,
    },
  });

  await db.promoCode.createMany({
    data: [
      { eventId: event.id, code: "NIGHTOWL", label: "Night owl 10%", kind: "PERCENT", value: 10, maxUses: 60, perEmailLimit: 1 },
      {
        eventId: event.id,
        code: "AUTO-GRP-DEMO",
        label: "Buy 4 GA, 1 free",
        kind: "GROUP_FREE",
        value: 1,
        minQty: 4,
        autoApply: true,
        perEmailLimit: 20,
        ticketTypeIds: [ga.id],
      },
    ],
  });
  const seed = randomBytes(32).toString("hex");
  const giveaway = await db.giveaway.create({
    data: {
      eventId: event.id,
      ticketTypeId: pit.id,
      title: "Win a Fan Pit pass (demo)",
      winnersCount: 2,
      closesAt: new Date(Date.now() + 10 * 86_400_000),
      seed,
      seedHash: seedFingerprint(seed),
    },
  });

  // Fictional paid orders so the dashboard and scanner have data. Some are already checked in.
  const now = new Date();
  const doorsToday = new Date(now.getTime() - 90 * 60_000);
  const buyers: { tierId: string; qty: number; unit: number }[] = [
    ...Array.from({ length: 34 }, () => ({ tierId: ga.id, qty: 1 + Math.floor(Math.random() * 3), unit: 49_900 })),
    ...Array.from({ length: 13 }, () => ({ tierId: pit.id, qty: 2, unit: 99_900 })),
    ...Array.from({ length: 8 }, () => ({ tierId: group.id, qty: 1, unit: 159_900 })),
  ];
  let n = 0;
  for (const b of buyers) {
    const name = `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`;
    const phone = `9${String(800000000 + n * 7919).padStart(9, "0")}`;
    n += 1;
    await db.$transaction(async (tx) => {
      const seats = await reserveSeats(tx, b.tierId, b.qty);
      if (seats === null) return;
      const order = await tx.order.create({
        data: {
          eventId: event.id,
          ticketTypeId: b.tierId,
          qty: b.qty,
          unitPricePaise: b.unit,
          amountPaise: b.unit * b.qty,
          buyerName: name,
          email: `${name.toLowerCase().replace(/\s+/g, ".")}${n}@demo.example`,
          phone,
          college: COLLEGES[n % COLLEGES.length],
          status: "PAID",
          paidAt: new Date(now.getTime() - (60 - n) * 3600_000),
          holdExpiresAt: now,
          provider: "MOCK",
          providerOrderId: `mock_order_seed_${n}`,
          providerPaymentId: `mock_pay_seed_${n}`,
        },
      });
      await issueTickets(tx, order);
    });
  }

  // Check about 40% of tickets in, spread across 15-minute slots, so the chart has a shape.
  const tickets = await db.ticket.findMany({ where: { eventId: event.id }, select: { id: true } });
  const toCheckIn = tickets.filter((_, i) => i % 5 < 2);
  for (const [i, t] of toCheckIn.entries()) {
    const at = new Date(doorsToday.getTime() + Math.floor((i / toCheckIn.length) ** 0.7 * 6) * 15 * 60_000 + (i % 9) * 60_000);
    await db.ticket.update({ where: { id: t.id }, data: { checkedInAt: at, checkedInById: volunteer.id } });
    await db.checkInLog.create({
      data: {
        eventId: event.id,
        ticketId: t.id,
        result: "OK",
        volunteerId: volunteer.id,
        clientScanId: randomBytes(16).toString("hex"),
        scannedAt: at,
      },
    });
  }

  await db.giveawayEntry.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      giveawayId: giveaway.id,
      name: `${FIRST[(i + 5) % FIRST.length]} ${LAST[i % LAST.length]}`,
      email: `entrant${i}@demo.example`,
      phone: `98${String(10000000 + i).padStart(8, "0")}`,
    })),
  });

  console.log("\nDEMO concert ready → /c/" + DEMO_SLUG);
  console.log(
    `Host login:      ${ADMIN_EMAIL}  ${adminPw.generated ? `password ${adminPw.value}  (generated; set SEED_ADMIN_PASSWORD to choose)` : "(password from SEED_ADMIN_PASSWORD)"}`,
  );
  console.log(
    `Volunteer login: ${VOLUNTEER_EMAIL}  ${volPw.generated ? `password ${volPw.value}  (generated; set SEED_VOLUNTEER_PASSWORD to choose)` : "(password from SEED_VOLUNTEER_PASSWORD)"}`,
  );
  console.log(`Tickets issued: ${tickets.length}, checked in: ${toCheckIn.length}\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
