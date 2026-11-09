import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { transaction } from "@/lib/tx";
import { signTicketCode } from "@/lib/ticket-code";
import { checkIn } from "@/server/checkin";
import { createCompOrder } from "@/server/orders";
import { makeEvent, makeOrg, resetDb } from "../helpers/factory";

const SECRET = process.env.TICKET_SIGNING_SECRET!;

async function setup() {
  const { org, admin, volunteer } = await makeOrg();
  const { event, ticketType } = await makeEvent(org.id, { capacity: 10 });
  const comp = await transaction((tx) =>
    createCompOrder(tx, { ticketTypeId: ticketType.id, qty: 1, buyerName: "Kiran", email: "k@x.in", phone: "9000000000", source: "COMP", now: new Date() }),
  );
  if (!comp.ok) throw new Error("comp failed");
  const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: comp.orderId } });
  return { org, admin, volunteer, event, ticketType, ticket, code: signTicketCode(ticket.id, SECRET) };
}

const scan = (eventId: string, volunteerId: string, extra: { code?: string; ticketId?: string; clientScanId?: string }) =>
  transaction((tx) =>
    checkIn(tx, {
      eventId,
      volunteerId,
      clientScanId: extra.clientScanId ?? randomUUID(),
      code: extra.code,
      ticketId: extra.ticketId,
      scannedAt: new Date(),
      now: new Date(),
      signingSecret: SECRET,
    }),
  );

describe("check-in", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("admits a valid ticket, then says who already checked it in", async () => {
    const { event, volunteer, code } = await setup();
    const first = await scan(event.id, volunteer.id, { code });
    expect(first.result).toBe("OK");

    const second = await scan(event.id, volunteer.id, { code });
    expect(second).toMatchObject({ result: "DUPLICATE", checkedInBy: "Ravi" });
  });

  it("two gates scanning the same ticket at once admit it exactly once", async () => {
    const { event, volunteer, admin, code } = await setup();
    const results = await Promise.all([
      scan(event.id, volunteer.id, { code }),
      scan(event.id, admin.id, { code }),
      scan(event.id, volunteer.id, { code }),
    ]);
    expect(results.filter((r) => r.result === "OK")).toHaveLength(1);
    expect(results.filter((r) => r.result === "DUPLICATE")).toHaveLength(2);
  });

  it("rejects forged and tampered codes", async () => {
    const { event, volunteer, ticket } = await setup();
    const forged = signTicketCode(ticket.id, "attacker-guessed-secret-000000000000");
    expect((await scan(event.id, volunteer.id, { code: forged })).result).toBe("INVALID");
    expect((await scan(event.id, volunteer.id, { code: "hello" })).result).toBe("INVALID");
    expect(await db.ticket.count({ where: { checkedInAt: { not: null } } })).toBe(0);
  });

  it("rejects a ticket for a different event", async () => {
    const { org, volunteer, code } = await setup();
    const { event: other } = await makeEvent(org.id);
    const out = await scan(other.id, volunteer.id, { code });
    expect(out).toMatchObject({ result: "INVALID", reason: "This ticket is for a different event." });
  });

  it("manual search check-in uses the same double-entry guard", async () => {
    const { event, volunteer, ticket, code } = await setup();
    expect((await scan(event.id, volunteer.id, { ticketId: ticket.id })).result).toBe("OK");
    expect((await scan(event.id, volunteer.id, { code })).result).toBe("DUPLICATE");
  });

  it("re-syncing an offline scan with the same id returns the original result", async () => {
    const { event, volunteer, code } = await setup();
    const clientScanId = randomUUID();
    const first = await scan(event.id, volunteer.id, { code, clientScanId });
    const retry = await scan(event.id, volunteer.id, { code, clientScanId });
    expect(first.result).toBe("OK");
    expect(retry.result).toBe("OK");
    expect(await db.checkInLog.count()).toBe(1);
  });
});
