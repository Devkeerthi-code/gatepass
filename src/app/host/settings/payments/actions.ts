"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { viewerWith } from "@/server/auth";
import { connectKeys, disconnectKeys, switchMode } from "@/server/payment-settings";
import { track } from "@/server/usage";

export type PayActionResult = { ok: true; message: string } | { ok: false; message: string };

const keysSchema = z.object({
  mode: z.enum(["TEST", "LIVE"]),
  keyId: z
    .string()
    .trim()
    .regex(/^rzp_(test|live)_[A-Za-z0-9]{8,32}$/, "That doesn't look like a Razorpay Key ID (rzp_test_… or rzp_live_…)."),
  keySecret: z.string().trim().min(10, "Paste the Key Secret shown next to the Key ID.").max(100),
  webhookSecret: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().trim().min(6, "Webhook secrets are at least 6 characters.").max(100).nullable(),
  ),
});

export async function saveKeys(input: z.input<typeof keysSchema>): Promise<PayActionResult> {
  const viewer = await viewerWith("payments:manage");
  if (!viewer) return { ok: false, message: "Only admins can change payments." };
  if (!(await rateLimit(`keys:${viewer.orgId}`, 10, 10 * 60_000))) return { ok: false, message: "Too many attempts. Wait a few minutes." };
  const parsed = keysSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the keys." };
  const { mode, ...creds } = parsed.data;
  const res = await connectKeys(viewer.orgId, mode, creds);
  if (!res.ok) return res;
  track("payments.connected", { orgId: viewer.orgId });
  revalidatePath("/host/settings/payments");
  return {
    ok: true,
    message:
      mode === "TEST"
        ? "Connected. New checkouts now go to your Razorpay test account."
        : "Live keys verified. Finish the checklist to switch on Live.",
  };
}

export async function removeKeys(mode: "TEST" | "LIVE"): Promise<PayActionResult> {
  const viewer = await viewerWith("payments:manage");
  if (!viewer) return { ok: false, message: "Only admins can change payments." };
  await disconnectKeys(viewer.orgId, z.enum(["TEST", "LIVE"]).parse(mode));
  revalidatePath("/host/settings/payments");
  return { ok: true, message: "Keys removed. Orders already created keep their payment method." };
}

export async function changeMode(mode: "MOCK" | "TEST" | "LIVE"): Promise<PayActionResult> {
  const viewer = await viewerWith("payments:manage");
  if (!viewer) return { ok: false, message: "Only admins can change payments." };
  const res = await switchMode(viewer.orgId, z.enum(["MOCK", "TEST", "LIVE"]).parse(mode));
  if (!res.ok) return res;
  revalidatePath("/host/settings/payments");
  const label = mode === "MOCK" ? "Mock (simulated)" : mode === "TEST" ? "Razorpay Test" : "Razorpay Live — real money";
  return { ok: true, message: `New checkouts now use ${label}.` };
}
