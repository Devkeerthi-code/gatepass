import { describe, expect, it } from "vitest";
import { formatPaise } from "@/lib/money";
import { assertCan, can, type Action } from "@/lib/permissions";
import { checkPromoEligibility, currentUnitPrice, nextPriceStep, promoDiscount, type PromoRule } from "@/lib/pricing";

describe("role permissions", () => {
  const all: Action[] = [
    "event:manage",
    "promo:manage",
    "payments:manage",
    "team:manage",
    "dashboard:view",
    "attendees:view",
    "attendees:export",
    "checkin",
  ];

  it("admins can do everything", () => {
    for (const a of all) expect(can("ADMIN", a)).toBe(true);
  });

  it("volunteers can only check people in", () => {
    expect(all.filter((a) => can("VOLUNTEER", a))).toEqual(["checkin"]);
    expect(() => assertCan("VOLUNTEER", "payments:manage")).toThrow(/can't/);
  });

  it("no role means no access", () => {
    for (const a of all) expect(can(null, a)).toBe(false);
  });
});

describe("price ladder", () => {
  const steps = [
    { afterSold: 100, pricePaise: 69_900 },
    { afterSold: 200, pricePaise: 89_900 },
  ];

  it("uses the base price until the first step", () => {
    expect(currentUnitPrice(49_900, steps, 0)).toBe(49_900);
    expect(currentUnitPrice(49_900, steps, 99)).toBe(49_900);
  });

  it("steps up as seats sell", () => {
    expect(currentUnitPrice(49_900, steps, 100)).toBe(69_900);
    expect(currentUnitPrice(49_900, steps, 250)).toBe(89_900);
  });

  it("reports the next step", () => {
    expect(nextPriceStep(steps, 50)).toEqual(steps[0]);
    expect(nextPriceStep(steps, 200)).toBeNull();
  });
});

describe("promotions", () => {
  const base: PromoRule = {
    kind: "PERCENT",
    value: 20,
    minQty: 1,
    ticketTypeIds: [],
    emailDomain: null,
    startsAt: null,
    endsAt: null,
    active: true,
    maxUses: null,
    used: 0,
  };
  const ctx = { ticketTypeId: "tt1", qty: 2, email: "a@iitm.ac.in", now: new Date("2030-01-01T12:00:00Z") };

  it("computes percent, flat and group discounts", () => {
    expect(promoDiscount(base, 50_000, 2)).toBe(20_000);
    expect(promoDiscount({ ...base, kind: "FLAT", value: 10_000 }, 50_000, 2)).toBe(10_000);
    expect(promoDiscount({ kind: "GROUP_FREE", value: 1, minQty: 4 }, 50_000, 4)).toBe(50_000);
    expect(promoDiscount({ kind: "GROUP_FREE", value: 1, minQty: 4 }, 50_000, 9)).toBe(100_000);
  });

  it("never discounts below zero", () => {
    expect(promoDiscount({ ...base, kind: "FLAT", value: 999_999 }, 10_000, 1)).toBe(10_000);
    expect(promoDiscount({ ...base, value: 150 }, 10_000, 1)).toBe(10_000);
  });

  it("enforces window, usage, tier, quantity and email domain", () => {
    expect(checkPromoEligibility(base, ctx).ok).toBe(true);
    expect(checkPromoEligibility({ ...base, endsAt: new Date("2029-01-01") }, ctx)).toMatchObject({
      ok: false,
      reason: "This code has expired.",
    });
    expect(checkPromoEligibility({ ...base, startsAt: new Date("2031-01-01") }, ctx).ok).toBe(false);
    expect(checkPromoEligibility({ ...base, maxUses: 5, used: 5 }, ctx).ok).toBe(false);
    expect(checkPromoEligibility({ ...base, ticketTypeIds: ["other"] }, ctx).ok).toBe(false);
    expect(checkPromoEligibility({ ...base, minQty: 4 }, ctx).ok).toBe(false);
    expect(checkPromoEligibility({ ...base, active: false }, ctx).ok).toBe(false);
    expect(checkPromoEligibility({ ...base, emailDomain: "iitm.ac.in" }, ctx).ok).toBe(true);
    expect(checkPromoEligibility({ ...base, emailDomain: "@ac.in" }, ctx).ok).toBe(true);
    expect(checkPromoEligibility({ ...base, emailDomain: "annauniv.edu" }, ctx).ok).toBe(false);
  });
});

describe("money", () => {
  it("formats paise as rupees", () => {
    expect(formatPaise(49_900)).toBe("₹499");
    expect(formatPaise(110_438_50)).toBe("₹1,10,438.50");
    expect(formatPaise(0)).toBe("₹0");
  });
});

describe("host accent colours", () => {
  it("puts dark text on light accents and white text on dark ones", async () => {
    const { accentVars, contrastRatio } = await import("@/lib/accent");
    expect((accentVars("#D4136F") as Record<string, string>)["--accent-ink"]).toBe("#ffffff");
    expect((accentVars("#FFD84D") as Record<string, string>)["--accent-ink"]).toBe("#16130f");
    expect((accentVars("not-a-colour") as Record<string, string>)["--accent"]).toBe("#D4136F");
    for (const hex of ["#D4136F", "#2B3FE0", "#C8431F", "#0B7559", "#7A3FE0", "#16130F"]) {
      const ink = (accentVars(hex) as Record<string, string>)["--accent-ink"];
      expect(contrastRatio(hex, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
