export type PriceStepInput = { afterSold: number; pricePaise: number };

/** Price ladder: the step with the highest `afterSold` that has been reached wins. */
export function currentUnitPrice(basePaise: number, steps: PriceStepInput[], seatsTaken: number): number {
  let price = basePaise;
  let reached = -1;
  for (const step of steps) {
    if (seatsTaken >= step.afterSold && step.afterSold > reached) {
      reached = step.afterSold;
      price = step.pricePaise;
    }
  }
  return price;
}

export function nextPriceStep(steps: PriceStepInput[], seatsTaken: number): PriceStepInput | null {
  const upcoming = steps.filter((s) => s.afterSold > seatsTaken).sort((a, b) => a.afterSold - b.afterSold);
  return upcoming[0] ?? null;
}

export type PromoRule = {
  kind: "PERCENT" | "FLAT" | "GROUP_FREE";
  value: number;
  minQty: number;
  ticketTypeIds: string[];
  emailDomain: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  maxUses: number | null;
  used: number;
};

export type PromoCheck = { ok: true } | { ok: false; reason: string };

export function checkPromoEligibility(
  promo: PromoRule,
  ctx: { ticketTypeId: string; qty: number; email: string; now: Date },
): PromoCheck {
  if (!promo.active) return { ok: false, reason: "This code is no longer active." };
  if (promo.startsAt && ctx.now < promo.startsAt) return { ok: false, reason: "This code isn't valid yet." };
  if (promo.endsAt && ctx.now > promo.endsAt) return { ok: false, reason: "This code has expired." };
  if (promo.maxUses !== null && promo.used >= promo.maxUses) return { ok: false, reason: "This code has been fully used." };
  if (promo.ticketTypeIds.length > 0 && !promo.ticketTypeIds.includes(ctx.ticketTypeId)) {
    return { ok: false, reason: "This code doesn't apply to this ticket." };
  }
  if (ctx.qty < promo.minQty) return { ok: false, reason: `Buy at least ${promo.minQty} tickets to use this.` };
  if (promo.emailDomain) {
    const domain = ctx.email.split("@")[1]?.toLowerCase() ?? "";
    const wanted = promo.emailDomain.toLowerCase().replace(/^@/, "");
    if (domain !== wanted && !domain.endsWith(`.${wanted}`)) {
      return { ok: false, reason: `Only for @${wanted} email addresses.` };
    }
  }
  return { ok: true };
}

/** Discount in paise, never more than the subtotal. */
export function promoDiscount(
  promo: Pick<PromoRule, "kind" | "value" | "minQty">,
  unitPaise: number,
  qty: number,
): number {
  const subtotal = unitPaise * qty;
  let discount = 0;
  if (promo.kind === "PERCENT") discount = Math.floor((subtotal * Math.min(promo.value, 100)) / 100);
  if (promo.kind === "FLAT") discount = promo.value;
  if (promo.kind === "GROUP_FREE") discount = Math.floor(qty / Math.max(promo.minQty, 1)) * promo.value * unitPaise;
  return Math.max(0, Math.min(discount, subtotal));
}
