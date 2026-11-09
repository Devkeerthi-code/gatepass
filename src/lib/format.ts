/** All event times are shown in IST with a fixed locale, so server and browser render identical text. */
export const TIME_ZONE = "Asia/Kolkata";
const LOCALE = "en-IN";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...opts });

const dayFmt = fmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFmt = fmt({ hour: "numeric", minute: "2-digit", hour12: true });
const shortFmt = fmt({ day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export const formatDay = (d: Date | string) => dayFmt.format(new Date(d));
export const formatTime = (d: Date | string) => timeFmt.format(new Date(d)).toUpperCase();
export const formatShort = (d: Date | string) => shortFmt.format(new Date(d)).replace(/am|pm/, (m) => m.toUpperCase());

/** `datetime-local` input value in IST (YYYY-MM-DDTHH:mm). */
export function toLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 16);
}

/** Parses a `datetime-local` value as IST. */
export function fromLocalInput(value: string): Date {
  return new Date(`${value}:00+05:30`);
}
