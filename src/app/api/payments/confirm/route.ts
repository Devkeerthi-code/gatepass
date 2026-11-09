import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { confirmFromCheckout } from "@/server/checkout";

const bodySchema = z.object({
  orderId: z.string().uuid(),
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().min(1).max(200),
});

/** Primary confirmation path, called right after Razorpay Checkout (or the mock) succeeds. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`confirm:${ip}`, 30, 60_000)) return Response.json({ ok: false, result: "rate_limited" }, { status: 429 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: false, result: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ ok: false, result: "bad_request" }, { status: 400 });

  const outcome = await confirmFromCheckout(parsed.data);
  const status = outcome.status === "BAD_SIGNATURE" ? 401 : outcome.status === "NOT_FOUND" ? 404 : 200;
  return Response.json({ ok: status === 200, result: outcome.status.toLowerCase() }, { status });
}
