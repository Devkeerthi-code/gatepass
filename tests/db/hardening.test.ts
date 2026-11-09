import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { signTicketCode } from "@/lib/ticket-code";
import { transaction } from "@/lib/tx";
import { checkIn } from "@/server/checkin";
import { placeHold } from "@/server/inventory";
import { applyDetails, confirmPaid } from "@/server/orders";
import { switchMode } from "@/server/payment-settings";
import { buildMockWebhook, createMockProvider } from "@/server/payments/mock";
import { refundOrder } from "@/server/refunds";
import { handlePaymentWebhook } from "@/server/webhooks";
import { buyer, makeEvent, makeOrg, resetDb } from "../helpers/factory";

const MOCK_ROOT = process.env.MOCK_PAYMENT_SECRET!;
const SIGNING = process.env.TICKET_SIGNING_SECRET!;
const mock = createMockProvider(MOCK_ROOT);

async function paidOrder(qty = 2, capacity = 5) {
  const { org, volunteer } = await makeOrg();
  const { ticketType, event } = await makeEvent(org.id, { capacity, pricePaise: 50_000 });
  const hold = await placeHold({ ticketTypeId: ticketType.id, qty, idempotencyKey: randomUUID(), now: new Date() });
  if (!hold.ok) throw new Error(hold.message);
  await transaction((tx) => applyDetails(tx, hold.orderId, buyer, null, new Date()));
  const providerOrderId = `mock_order_${randomUUID()}`;
  await db.order.update({ where: { id: hold.orderId }, data: { providerOrderId, provider: "MOCK" } });
  await transaction((tx) => confirmPaid(tx, { providerOrderId, providerPaymentId: `mock_pay_${randomUUID()}`, now: new Date() }));
  return { org, volunteer, event, ticketType, orderId: hold.orderId, providerOrderId };
}

const refund = (orderId: string, orgId: string) =>
  transaction((tx) => refundOrder(tx, { orderId, orgId, now: new Date(), providerFor: async () => mock }));

describe("payment webhook handler", () => {
  beforeEach(resetDb);
  afterAll(() => db.$disconnect());

  async function pending() {
    const { org } = await makeOrg();
    const { ticketType } = await makeEvent(org.id, { capacity: 5, pricePaise: 30_000 });
    const hold = await placeHold({ ticketTypeId: ticketType.id, qty: 1, idempotencyKey: randomUUID(), now: new Date() });
    if (!hold.ok) throw new Error(hold.message);
    await transaction((tx) => applyDetails(tx, hold.orderId, buyer, null, new Date()));
    const providerOrderId = `mock_order_${randomUUID()}`;
    await db.order.update({ where: { id: hold.orderId }, data: { providerOrderId } });
    return { orderId: hold.orderId, providerOrderId };
  }

  const deliver = (body: string, signature: string, eventId: string) =>
    handlePaymentWebhook({ source: "mock", rawBody: body, signature, eventIdHeader: eventId, providers: [mock] });

  it("rejects a bad signature without touching the order", async () => {
    const { orderId, providerOrderId } = await pending();
    const hook = buildMockWebhook(MOCK_ROOT, { providerOrderId, providerPaymentId: "pay_x", amountPaise: 30_000 });
    const res = await deliver(hook.body, "0".repeat(64), hook.eventId);
    expect(res.status).toBe(401);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING");
  });

  it("issues once, then treats retries of the same event as duplicates", async () => {
    const { orderId, providerOrderId } = await pending();
    const hook = buildMockWebhook(MOCK_ROOT, { providerOrderId, providerPaymentId: "pay_y", amountPaise: 30_000 });
    expect((await deliver(hook.body, hook.signature, hook.eventId)).body.result).toBe("issued");
    expect((await deliver(hook.body, hook.signature, hook.eventId)).body.result).toBe("duplicate");
    expect(await db.ticket.count({ where: { orderId } })).toBe(1);
  });

  it("acknowledges but ignores a captured amount that doesn't match the order", async () => {
    const { orderId, providerOrderId } = await pending();
    const hook = buildMockWebhook(MOCK_ROOT, { providerOrderId, providerPaymentId: "pay_z", amountPaise: 1 });
    const res = await deliver(hook.body, hook.signature, hook.eventId);
    expect(res.body.result).toBe("amount_mismatch");
    expect(await db.ticket.count({ where: { orderId } })).toBe(0);
  });
});

describe("refunds", () => {
  beforeEach(resetDb);

  it("refunds a paid order, frees its seats and voids its QR codes", async () => {
    const { org, volunteer, event, ticketType, orderId } = await paidOrder(2, 5);
    const res = await refund(orderId, org.id);
    expect(res).toMatchObject({ ok: true, seatsReleased: 2 });
    expect(res.ok && res.refundId).toMatch(/^mock_rfnd_/);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } })).reserved).toBe(0);

    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId } });
    const scan = await transaction((tx) =>
      checkIn(tx, { eventId: event.id, volunteerId: volunteer.id, clientScanId: randomUUID(), code: signTicketCode(ticket.id, SIGNING), scannedAt: new Date(), now: new Date(), signingSecret: SIGNING }),
    );
    expect(scan).toMatchObject({ result: "INVALID", reason: "This ticket was refunded or cancelled." });
  });

  it("a double-clicked refund only refunds once", async () => {
    const { org, orderId } = await paidOrder();
    const results = await Promise.all([refund(orderId, org.id), refund(orderId, org.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "NOT_REFUNDABLE" });
  });

  it("won't refund an order whose holder already entered", async () => {
    const { org, volunteer, event, orderId } = await paidOrder(1);
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId } });
    await transaction((tx) =>
      checkIn(tx, { eventId: event.id, volunteerId: volunteer.id, clientScanId: randomUUID(), ticketId: ticket.id, scannedAt: new Date(), now: new Date(), signingSecret: SIGNING }),
    );
    expect(await refund(orderId, org.id)).toMatchObject({ ok: false, reason: "CHECKED_IN" });
  });

  it("can't refund another organisation's order", async () => {
    const { orderId } = await paidOrder();
    const { org: other } = await makeOrg();
    expect(await refund(orderId, other.id)).toMatchObject({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("shared rate limiter", () => {
  beforeEach(resetDb);

  it("allows exactly the limit even under concurrency", async () => {
    const key = `test:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 12 }, () => rateLimit(key, 5, 60_000)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it("starts a fresh window after the old one ends", async () => {
    const key = `test:${randomUUID()}`;
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) await rateLimit(key, 3, 60_000, t0);
    expect(await rateLimit(key, 3, 60_000, t0)).toBe(false);
    expect(await rateLimit(key, 3, 60_000, t0 + 60_000)).toBe(true);
  });
});

describe("promo per-person limit under concurrency", () => {
  beforeEach(resetDb);

  it("two simultaneous checkouts with the same email get the code once", async () => {
    const { org } = await makeOrg();
    const { ticketType, event } = await makeEvent(org.id, { capacity: 10, pricePaise: 10_000 });
    await db.promoCode.create({ data: { eventId: event.id, code: "ONCE", kind: "PERCENT", value: 50, perEmailLimit: 1 } });
    const holds = await Promise.all([1, 2].map(() => placeHold({ ticketTypeId: ticketType.id, qty: 1, idempotencyKey: randomUUID(), now: new Date() })));
    const results = await Promise.all(
      holds.map((h) => (h.ok ? transaction((tx) => applyDetails(tx, h.orderId, buyer, "ONCE", new Date())) : Promise.reject(new Error("hold failed")))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await db.promoCode.findFirstOrThrow({ where: { code: "ONCE" } })).used).toBe(1);
  });
});

describe("payment mode gating", () => {
  beforeEach(resetDb);

  it("Razorpay Test needs verified keys and Live needs the full checklist", async () => {
    const { org } = await makeOrg();
    expect(await switchMode(org.id, "TEST")).toMatchObject({ ok: false });
    expect(await switchMode(org.id, "LIVE")).toMatchObject({ ok: false });
    expect(await switchMode(org.id, "MOCK")).toEqual({ ok: true });

    await db.paymentSettings.update({ where: { orgId: org.id }, data: { testKeyId: "rzp_test_abc", testVerifiedAt: new Date() } });
    expect(await switchMode(org.id, "TEST")).toEqual({ ok: true });
    const live = await switchMode(org.id, "LIVE");
    expect(live.ok).toBe(false);
    expect(!live.ok && live.message).toMatch(/live keys verified/i);
  });
});
