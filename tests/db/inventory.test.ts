import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { transaction } from "@/lib/tx";
import { expireOrders, HOLD_MINUTES, placeHold } from "@/server/inventory";
import { makeEvent, makeOrg, resetDb } from "../helpers/factory";

const hold = (ticketTypeId: string, qty: number, now = new Date(), key = randomUUID()) =>
  placeHold({ ticketTypeId, qty, idempotencyKey: key, now });

describe("seat inventory", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("never oversells when 40 buyers race for 10 seats", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 10 });

    const results = await Promise.all(Array.from({ length: 40 }, () => hold(ticketType.id, 1)));

    const won = results.filter((r) => r.ok).length;
    const tt = await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    const pending = await db.order.aggregate({ where: { ticketTypeId: ticketType.id, status: "PENDING" }, _sum: { qty: true } });
    expect(won).toBe(10);
    expect(tt.reserved).toBe(10);
    expect(pending._sum.qty).toBe(10);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error === "SOLD_OUT")).toBe(true);
  });

  it("never oversells with mixed quantities", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 7 });

    await Promise.all([3, 3, 2, 2, 1, 4, 1].map((q) => hold(ticketType.id, q)));

    const tt = await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    const pending = await db.order.aggregate({ where: { ticketTypeId: ticketType.id, status: "PENDING" }, _sum: { qty: true } });
    expect(tt.reserved).toBeLessThanOrEqual(7);
    expect(pending._sum.qty).toBe(tt.reserved);
  });

  it("the database itself rejects reserved > capacity", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 2 });
    await expect(db.ticketType.update({ where: { id: ticketType.id }, data: { reserved: 3 } })).rejects.toThrow();
  });

  it("releases expired holds lazily on the next read and lets someone else buy", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 2 });
    const t0 = new Date("2030-01-01T10:00:00Z");

    expect((await hold(ticketType.id, 2, t0)).ok).toBe(true);
    const blocked = await hold(ticketType.id, 1, new Date(t0.getTime() + 5 * 60_000));
    expect(blocked.ok).toBe(false);

    const later = new Date(t0.getTime() + (HOLD_MINUTES + 1) * 60_000);
    const retry = await hold(ticketType.id, 1, later);
    expect(retry.ok).toBe(true);

    const expired = await db.order.count({ where: { ticketTypeId: ticketType.id, status: "EXPIRED" } });
    const tt = await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(expired).toBe(1);
    expect(tt.reserved).toBe(1);
  });

  it("a hold that hasn't expired yet is not released", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 1 });
    const t0 = new Date("2030-01-01T10:00:00Z");
    await hold(ticketType.id, 1, t0);
    const released = await transaction((tx) => expireOrders(tx, { now: new Date(t0.getTime() + 9 * 60_000) }));
    expect(released).toBe(0);
  });

  it("concurrent cleanups release each expired hold exactly once", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 5 });
    const t0 = new Date("2030-01-01T10:00:00Z");
    await hold(ticketType.id, 2, t0);
    await hold(ticketType.id, 3, t0);

    const later = new Date(t0.getTime() + 11 * 60_000);
    const counts = await Promise.all(Array.from({ length: 5 }, () => transaction((tx) => expireOrders(tx, { now: later }))));

    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    const tt = await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(tt.reserved).toBe(0);
  });

  it("a double-clicked buy button (same idempotency key) creates one hold", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 5 });
    const key = randomUUID();
    const now = new Date();
    const [a, b] = await Promise.all([hold(ticketType.id, 2, now, key), hold(ticketType.id, 2, now, key)]);
    const okIds = [a, b].map((r) => (r.ok ? r.orderId : ""));
    const tt = await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(new Set(okIds).size).toBe(1);
    expect(tt.reserved).toBe(2);
  });

  it("rejects quantities above the per-order limit and closed sale windows", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 50, perOrderLimit: 4 });
    const tooMany = await hold(ticketType.id, 5);
    expect(tooMany.ok === false && tooMany.error).toBe("LIMIT");

    await db.ticketType.update({ where: { id: ticketType.id }, data: { salesStart: new Date("2099-01-01") } });
    const early = await hold(ticketType.id, 1);
    expect(early.ok === false && early.error).toBe("NOT_ON_SALE");
  });
});
