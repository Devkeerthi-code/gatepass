import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { transaction } from "@/lib/tx";
import { placeHold } from "@/server/inventory";
import { applyDetails, confirmFree, confirmPaid } from "@/server/orders";
import { buyer, makeEvent, makeOrg, resetDb } from "../helpers/factory";

async function pendingOrder(capacity = 5, qty = 2, now = new Date()) {
  const { org } = await makeOrg();
  const { ticketType, event } = await makeEvent(org.id, { capacity, pricePaise: 50_000 });
  const res = await placeHold({ ticketTypeId: ticketType.id, qty, idempotencyKey: randomUUID(), now });
  if (!res.ok) throw new Error(res.message);
  await transaction((tx) => applyDetails(tx, res.orderId, buyer, null, now));
  const providerOrderId = `mock_order_${randomUUID()}`;
  await db.order.update({ where: { id: res.orderId }, data: { providerOrderId } });
  return { orderId: res.orderId, providerOrderId, ticketType, event };
}

const confirm = (providerOrderId: string, paymentId: string, now = new Date(), amountPaise?: number) =>
  transaction((tx) => confirmPaid(tx, { providerOrderId, providerPaymentId: paymentId, amountPaise, now }));

describe("payment confirmation", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  it("issues one ticket per seat", async () => {
    const { orderId, providerOrderId } = await pendingOrder(5, 2);
    const out = await confirm(providerOrderId, "pay_1");
    expect(out.status).toBe("ISSUED");
    expect(await db.ticket.count({ where: { orderId } })).toBe(2);
  });

  it("checkout callback and webhook firing together create tickets once", async () => {
    const { orderId, providerOrderId } = await pendingOrder(5, 3);
    const outcomes = await Promise.all([
      confirm(providerOrderId, "pay_same"),
      confirm(providerOrderId, "pay_same", new Date(), 100_000 + 50_000),
      confirm(providerOrderId, "pay_same"),
    ]);
    expect(outcomes.filter((o) => o.status === "ISSUED")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "ALREADY_PAID")).toHaveLength(2);
    expect(await db.ticket.count({ where: { orderId } })).toBe(3);
  });

  it("webhook retries after success are no-ops", async () => {
    const { orderId, providerOrderId } = await pendingOrder();
    await confirm(providerOrderId, "pay_r");
    for (let i = 0; i < 3; i++) expect((await confirm(providerOrderId, "pay_r")).status).toBe("ALREADY_PAID");
    expect(await db.ticket.count({ where: { orderId } })).toBe(2);
  });

  it("rejects a webhook whose amount doesn't match the order", async () => {
    const { orderId, providerOrderId } = await pendingOrder();
    const out = await confirm(providerOrderId, "pay_x", new Date(), 1);
    expect(out.status).toBe("AMOUNT_MISMATCH");
    expect(await db.ticket.count({ where: { orderId } })).toBe(0);
  });

  it("unknown provider orders are reported, not crashed on", async () => {
    expect((await confirm("order_missing", "pay_m")).status).toBe("NOT_FOUND");
  });

  it("payment after hold expiry still gets tickets if seats are free", async () => {
    const t0 = new Date("2030-01-01T10:00:00Z");
    const { orderId, providerOrderId } = await pendingOrder(5, 2, t0);
    const later = new Date(t0.getTime() + 30 * 60_000);
    await placeHold({ ticketTypeId: (await db.order.findUniqueOrThrow({ where: { id: orderId } })).ticketTypeId, qty: 1, idempotencyKey: randomUUID(), now: later });
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("EXPIRED");

    const out = await confirm(providerOrderId, "pay_late", later);
    expect(out).toMatchObject({ status: "ISSUED", late: true });
    expect(await db.ticket.count({ where: { orderId } })).toBe(2);
  });

  it("payment after expiry when sold out is flagged for refund, never oversold", async () => {
    const t0 = new Date("2030-01-01T10:00:00Z");
    const { orderId, providerOrderId, ticketType } = await pendingOrder(2, 2, t0);
    const later = new Date(t0.getTime() + 30 * 60_000);
    const other = await placeHold({ ticketTypeId: ticketType.id, qty: 2, idempotencyKey: randomUUID(), now: later });
    expect(other.ok).toBe(true);

    const out = await confirm(providerOrderId, "pay_refund", later);
    expect(out.status).toBe("NEEDS_REFUND");
    const tt = await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(tt.reserved).toBe(2);
    expect(await db.ticket.count({ where: { orderId } })).toBe(0);
  });

  it("free orders skip payment and issue once", async () => {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 5, pricePaise: 0 });
    const now = new Date();
    const res = await placeHold({ ticketTypeId: ticketType.id, qty: 1, idempotencyKey: randomUUID(), now });
    if (!res.ok) throw new Error(res.message);
    await transaction((tx) => applyDetails(tx, res.orderId, buyer, null, now));
    const results = await Promise.all([1, 2].map(() => transaction((tx) => confirmFree(tx, res.orderId, now))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.ticket.count({ where: { orderId: res.orderId } })).toBe(1);
  });
});
