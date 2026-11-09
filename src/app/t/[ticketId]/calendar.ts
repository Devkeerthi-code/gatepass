type CalEvent = { name: string; venue: string; venueAddress: string | null; startsAt: Date; endsAt: Date; slug: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function location(e: CalEvent) {
  return [e.venue, e.venueAddress].filter(Boolean).join(", ");
}

export function googleCalendarUrl(e: CalEvent): string {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({
    action: "TEMPLATE",
    text: e.name,
    dates: `${stamp(e.startsAt)}/${stamp(e.endsAt)}`,
    location: location(e),
    details: "Show your GatePass QR at the gate.",
  }).toString();
  return url.toString();
}

/** RFC 5545 text escaping for SUMMARY/LOCATION/DESCRIPTION. */
function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildIcs(e: CalEvent, ticketId: string, ticketUrl: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GatePass//Tickets//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ticketId}@gatepass`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.startsAt)}`,
    `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${escapeIcs(e.name)}`,
    `LOCATION:${escapeIcs(location(e))}`,
    `DESCRIPTION:${escapeIcs(`Your ticket: ${ticketUrl}`)}`,
    `URL:${ticketUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
