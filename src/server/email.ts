import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDay, formatTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";

type Email = { to: string; subject: string; html: string; text: string };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Sends through Resend when RESEND_API_KEY is set; otherwise does nothing (links still work in the app). */
export async function sendEmail(email: Email): Promise<boolean> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[email] Resend rejected "${email.subject}" with ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("[email] send failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Runs work after the response is sent; falls back to fire-and-forget outside a request (tests, scripts). */
function later(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f0e8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#16130f">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#fffdf8;border:1px solid #ddd5c6;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font:700 11px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#d4136f">GatePass</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.1">${title}</h1>${body}</div>
<p style="font-size:12px;color:#5a544a;margin-top:16px">You got this because you bought or were given a ticket on GatePass.</p></div></body></html>`;
}

/** Ticket links for a paid order. Safe to call more than once (it only reads). */
export function emailTicketsLater(orderId: string): void {
  later(async () => {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        event: true,
        ticketType: { select: { name: true } },
        tickets: { orderBy: { seq: "asc" }, select: { id: true, serial: true } },
      },
    });
    if (!order || order.status !== "PAID" || !order.email) return;
    const { APP_URL } = env();
    const e = order.event;
    const when = `${formatDay(e.startsAt)} · doors ${formatTime(e.doorsAt ?? e.startsAt)}`;
    const links = order.tickets.map((t, i) => ({
      label: `Ticket ${i + 1} of ${order.tickets.length} · ${t.serial}`,
      url: `${APP_URL}/t/${t.id}`,
    }));
    const html = layout(
      `You're in: ${escapeHtml(e.name)}`,
      `<p style="margin:0 0 12px">${escapeHtml(when)}<br>${escapeHtml(e.venue)}${e.venueAddress ? `, ${escapeHtml(e.venueAddress)}` : ""}</p>
<p style="margin:0 0 16px">${order.qty} × ${escapeHtml(order.ticketType.name)} · ${order.amountPaise ? formatPaise(order.amountPaise) : "Free"}</p>
${links.map((l) => `<p style="margin:0 0 8px"><a href="${l.url}" style="display:inline-block;background:#d4136f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">${escapeHtml(l.label)}</a></p>`).join("")}
<p style="font-size:13px;color:#5a544a;margin-top:16px">Open the ticket on your phone at the gate. Each QR gets in once.</p>`,
    );
    const text = `You're in: ${e.name}\n${when}\n${e.venue}\n\n${links.map((l) => `${l.label}: ${l.url}`).join("\n")}\n\nEach QR gets in once.`;
    await sendEmail({ to: order.email, subject: `Your tickets: ${e.name}`, html, text });
  });
}

export function emailInviteLater(input: { to: string; orgName: string; role: "ADMIN" | "VOLUNTEER"; link: string }): void {
  later(async () => {
    const what = input.role === "VOLUNTEER" ? "scan tickets at the gate" : "help run concerts as an admin";
    await sendEmail({
      to: input.to,
      subject: `${input.orgName} invited you to GatePass`,
      html: layout(
        `Join ${escapeHtml(input.orgName)}`,
        `<p>You've been invited to ${what}.</p><p><a href="${input.link}" style="display:inline-block;background:#d4136f;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Accept invite</a></p><p style="font-size:13px;color:#5a544a">The link works once and expires in 7 days.</p>`,
      ),
      text: `${input.orgName} invited you to ${what} on GatePass.\nAccept: ${input.link}\nThe link works once and expires in 7 days.`,
    });
  });
}
