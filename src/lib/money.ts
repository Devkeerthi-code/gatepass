const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** Formats integer paise as rupees, dropping ".00" for whole amounts. */
export function formatPaise(paise: number): string {
  return inr.format(paise / 100).replace(/\.00$/, "");
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
